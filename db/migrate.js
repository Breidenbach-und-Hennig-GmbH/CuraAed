'use strict';

const path = require('path');
const N = require('../lib/nummern');

async function spalten(db, tabelle) {
  const rows = await db.all(`PRAGMA table_info(${tabelle})`);
  return new Set(rows.map((r) => r.name));
}

/**
 * Bringt ältere Datenbanken auf den aktuellen Stand. Jeder Schritt prüft
 * selbst, ob er nötig ist, und kann daher beliebig oft laufen.
 *
 * v1 → v2:
 *  - Spalte `nummer` für Objekte (aus interne_nr übernommen), Einheiten und
 *    Adressen; fehlende Nummern werden automatisch vergeben.
 *  - Dokumente werden zum zentralen Archiv: Bezüge (objekt_id/einheit_id)
 *    wandern in archiv_verknuepfungen, damit ein Eintrag beliebig vielen
 *    Objekten, Einheiten und Adressen zugeordnet werden kann.
 */
async function migrieren(db, filePath) {
  const sVersammlungen=await spalten(db,'versammlungen');
  if(!sVersammlungen.has('top_revision'))await db.run('ALTER TABLE versammlungen ADD COLUMN top_revision INTEGER NOT NULL DEFAULT 1');
  for(const [feld,tabelle] of [['beisitzer_id','benutzer'],['protokollfuehrer_id','benutzer'],['beirat_id','adressen'],['unterzeichner_id','adressen']])if(!sVersammlungen.has(feld))await db.run('ALTER TABLE versammlungen ADD COLUMN '+feld+' INTEGER REFERENCES '+tabelle+'(id) ON DELETE SET NULL');
  if(!sVersammlungen.has('leitung_id'))await db.run('ALTER TABLE versammlungen ADD COLUMN leitung_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL');
  for(const feld of ['ort_strasse','ort_plz','ort_stadt','ort_beschreibung'])if(!sVersammlungen.has(feld))await db.run('ALTER TABLE versammlungen ADD COLUMN '+feld+' TEXT');
  await db.run("INSERT OR IGNORE INTO versammlungsorte(objekt_id,ort,ort_strasse,ort_plz,ort_stadt,ort_beschreibung) SELECT objekt_id,TRIM(ort),COALESCE(ort_strasse,''),COALESCE(ort_plz,''),COALESCE(ort_stadt,''),COALESCE(ort_beschreibung,'') FROM versammlungen WHERE TRIM(COALESCE(ort,''))<>''");
  const sBenutzer = await spalten(db, 'benutzer');
  const sObjekte = await spalten(db, 'objekte');
  const sEinheiten = await spalten(db, 'einheiten');
  const sAdressen = await spalten(db, 'adressen');
  const sDokumente = await spalten(db, 'dokumente');

  const dokAltesFormat = sDokumente.has('objekt_id');
  const brauchtSpalten = !sObjekte.has('nummer') || !sEinheiten.has('nummer') || !sAdressen.has('nummer')
    || !sAdressen.has('geburtstag') || !sAdressen.has('ampel') || !sAdressen.has('versand_standard')
    || !sObjekte.has('objekt_art') || !sBenutzer.has('kuerzel');

  if ((dokAltesFormat || brauchtSpalten) && filePath && filePath !== ':memory:') {
    // Konsistente Sicherung vor dem Umbau.
    const stempel = new Date().toISOString().replace(/[:.]/g, '-');
    const ziel = path.join(path.dirname(filePath), `sicherung-vor-migration-${stempel}.db`);
    await db.run('VACUUM INTO ?', [ziel]);
    console.log('[MIGRATION] Sicherung erstellt:', ziel);
  }

  // HP-Sachbearbeiterkürzel ausdrücklich hinterlegen; vorhandene Konten bleiben erhalten.
  if (!sBenutzer.has('kuerzel')) await db.run("ALTER TABLE benutzer ADD COLUMN kuerzel TEXT CHECK (kuerzel IS NULL OR (length(kuerzel) BETWEEN 1 AND 3 AND kuerzel NOT GLOB '*[^A-Z]*'))");
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_benutzer_kuerzel ON benutzer(kuerzel) WHERE kuerzel IS NOT NULL');

  // ---- 1) Nummern-Spalten ---------------------------------------------
  if (!sObjekte.has('nummer')) await db.run('ALTER TABLE objekte ADD COLUMN nummer TEXT');
  if (!sEinheiten.has('nummer')) await db.run('ALTER TABLE einheiten ADD COLUMN nummer TEXT');
  if (!sAdressen.has('nummer')) await db.run('ALTER TABLE adressen ADD COLUMN nummer TEXT');

  // Fehlende Objekt-Nummern: vorhandene interne_nr übernehmen, sonst automatisch.
  const objOhne = await db.all('SELECT * FROM objekte WHERE nummer IS NULL ORDER BY id');
  for (const o of objOhne) {
    let nr = null;
    if (o.interne_nr) {
      try {
        const kandidat = N.pruefeNummer(o.interne_nr, 'Objekt-Nr.');
        const belegt = await db.get('SELECT 1 FROM objekte WHERE nummer = ? COLLATE NOCASE', [kandidat]);
        if (!belegt) nr = kandidat;
      } catch (e) { /* ungültig → automatisch */ }
    }
    if (!nr) nr = await N.naechsteObjektNr(db);
    await db.run('UPDATE objekte SET nummer = ? WHERE id = ?', [nr, o.id]);
  }
  const einhOhne = await db.all('SELECT id, objekt_id FROM einheiten WHERE nummer IS NULL ORDER BY objekt_id, id');
  for (const e of einhOhne) {
    await db.run('UPDATE einheiten SET nummer = ? WHERE id = ?', [await N.naechsteEinheitNr(db, e.objekt_id), e.id]);
  }
  const adrOhne = await db.all('SELECT id FROM adressen WHERE nummer IS NULL ORDER BY id');
  for (const a of adrOhne) {
    await db.run('UPDATE adressen SET nummer = ? WHERE id = ?', [await N.naechsteAdressNr(db), a.id]);
  }

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_objekte_nummer   ON objekte(nummer COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_einheiten_nummer ON einheiten(nummer COLLATE NOCASE);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_adressen_nummer  ON adressen(nummer COLLATE NOCASE);
  `);

  // ---- 1b) Adressen: Geburtstag, LKto-Nr., Datenschutz -----------------
  for (const spalte of ['geburtstag', 'lkto_nr', 'datenschutz_datum', 'ampel', 'ampel_notiz', 'ampel_datum', 'zusatz']) {
    if (!sAdressen.has(spalte)) await db.run(`ALTER TABLE adressen ADD COLUMN ${spalte} TEXT`);
  }
  if (!sAdressen.has('datenschutz_zustimmung')) {
    await db.run('ALTER TABLE adressen ADD COLUMN datenschutz_zustimmung TEXT');
    // bisher erfasstes Einwilligungsdatum gilt als Zustimmung
    await db.run("UPDATE adressen SET datenschutz_zustimmung = 'ja' WHERE datenschutz_datum IS NOT NULL");
  }
  if (!sAdressen.has('versand_standard')) await db.run("ALTER TABLE adressen ADD COLUMN versand_standard TEXT NOT NULL DEFAULT 'post'");
  if (!sAdressen.has('ampel_von')) await db.run('ALTER TABLE adressen ADD COLUMN ampel_von INTEGER REFERENCES benutzer(id) ON DELETE SET NULL');

  // ---- 1b') Objekte: Felder der HausPerfekt-Objektmaske --------------------
  for (const spalte of ['objekt_art', 'buero_kst', 'gruppe1', 'gruppe2', 'gruppe3', 'gruppe4', 'gruppe5',
    'heizungsart', 'warmwasser', 'garagenart', 'muellgefaesse']) {
    if (!sObjekte.has(spalte)) await db.run(`ALTER TABLE objekte ADD COLUMN ${spalte} TEXT`);
  }
  for (const spalte of ['anzahl_gebaeude', 'anzahl_eingaenge']) {
    if (!sObjekte.has(spalte)) await db.run(`ALTER TABLE objekte ADD COLUMN ${spalte} INTEGER`);
  }
  if (!sObjekte.has('sachbearbeiter_id')) await db.run('ALTER TABLE objekte ADD COLUMN sachbearbeiter_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL');
  if (!sObjekte.has('verkauf')) await db.run('ALTER TABLE objekte ADD COLUMN verkauf INTEGER NOT NULL DEFAULT 1');
  if (!sObjekte.has('vermietung')) await db.run('ALTER TABLE objekte ADD COLUMN vermietung INTEGER NOT NULL DEFAULT 1');

  // ---- 1b'') Sachkonten: Abrechnungsangaben aus dem HausPerfekt-Import -------
  const sSachkonten = await spalten(db, 'sachkonten');
  for (const spalte of ['vs_eg', 'vs_mi', 'hp_attribute']) {
    if (sSachkonten.size && !sSachkonten.has(spalte)) await db.run(`ALTER TABLE sachkonten ADD COLUMN ${spalte} TEXT`);
  }

  // ---- 1b''') Personenfunktion: HausPerfekt-Code (001, 002 …) ------------------
  const sZuord = await spalten(db, 'rollen_zuordnungen');
  if (!sZuord.has('pfkt_code')) await db.run('ALTER TABLE rollen_zuordnungen ADD COLUMN pfkt_code TEXT REFERENCES pfkt_codes(code)');

  // ---- 1b'''') Personenfunktions-Codes: Kennzeichen + HausPerfekt-Schlüsseltabelle (einmalig) ------
  const sCodes = await spalten(db, 'pfkt_codes');
  if (!sCodes.has('kennz')) await db.run('ALTER TABLE pfkt_codes ADD COLUMN kennz TEXT');

  // ---- 1c) Kontaktprotokoll: Zusatzinformationen fürs ZIS ----------------
  const sKontakte = await spalten(db, 'kontakte');
  if (!sKontakte.has('intern')) await db.run('ALTER TABLE kontakte ADD COLUMN intern INTEGER NOT NULL DEFAULT 0');
  if (!sKontakte.has('minuten')) await db.run('ALTER TABLE kontakte ADD COLUMN minuten INTEGER');
  if (!sKontakte.has('objekt_id')) await db.run('ALTER TABLE kontakte ADD COLUMN objekt_id INTEGER REFERENCES objekte(id) ON DELETE SET NULL');
  for (const [spalte, typ] of [['eingang', 'INTEGER NOT NULL DEFAULT 0'], ['anrufer_adresse_id', 'INTEGER REFERENCES adressen(id) ON DELETE SET NULL'],
    ['anrufer_name', 'TEXT'], ['rueckruf_tel', 'TEXT'], ['pfkt_code', 'TEXT'], ['erledigt', 'INTEGER NOT NULL DEFAULT 1'],
    ['rueckruf_sb_id', 'INTEGER REFERENCES benutzer(id) ON DELETE SET NULL'], ['team', 'TEXT'], ['zis', 'INTEGER NOT NULL DEFAULT 1'],
    ['aufnahme', 'TEXT'], ['aufnahme_zustimmung', 'INTEGER NOT NULL DEFAULT 0']]) {
    if (sKontakte.size && !sKontakte.has(spalte)) await db.run(`ALTER TABLE kontakte ADD COLUMN ${spalte} ${typ}`);
  }
  if (!sKontakte.has('einheit_id')) await db.run('ALTER TABLE kontakte ADD COLUMN einheit_id INTEGER REFERENCES einheiten(id) ON DELETE SET NULL');

  // ---- 2) Dokumente → zentrales Archiv ----------------------------------
  if (dokAltesFormat) {
    // Tabellen-Neuaufbau nach SQLite-Empfehlung; FKs dafür kurz aus.
    await db.run('PRAGMA foreign_keys = OFF');
    try {
      await db.transaktion(async (tx) => {
        await tx.exec(`
          CREATE TABLE dokumente_neu (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            titel           TEXT NOT NULL,
            kategorie       TEXT NOT NULL DEFAULT 'sonstiges',
            beschreibung    TEXT,
            dokument_datum  TEXT,
            original_name   TEXT NOT NULL,
            speicher_name   TEXT NOT NULL,
            mime_type       TEXT,
            groesse         INTEGER,
            quelle          TEXT NOT NULL DEFAULT 'upload',
            hochgeladen_von INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
            erstellt_am     TEXT NOT NULL DEFAULT (datetime('now'))
          );
          INSERT INTO dokumente_neu (id, titel, kategorie, beschreibung, original_name, speicher_name,
                                     mime_type, groesse, quelle, hochgeladen_von, erstellt_am)
            SELECT id, titel, kategorie, beschreibung, original_name, speicher_name,
                   mime_type, groesse, quelle, hochgeladen_von, erstellt_am FROM dokumente;
          INSERT OR IGNORE INTO archiv_verknuepfungen (dokument_id, objekt_id)
            SELECT id, objekt_id FROM dokumente WHERE objekt_id IS NOT NULL;
          INSERT OR IGNORE INTO archiv_verknuepfungen (dokument_id, einheit_id)
            SELECT id, einheit_id FROM dokumente WHERE einheit_id IS NOT NULL;
          DROP TABLE dokumente;
          ALTER TABLE dokumente_neu RENAME TO dokumente;
        `);
        const fehler = await tx.all('PRAGMA foreign_key_check');
        if (fehler.length) throw new Error('Fremdschlüsselprüfung nach Migration fehlgeschlagen');
      });
      console.log('[MIGRATION] Dokumente in zentrales Archiv überführt.');
    } finally {
      await db.run('PRAGMA foreign_keys = ON');
    }
  }

  // ---- 3) Einmalig: telefon/mobil/email in die Kommunikationslisten übernehmen
  const { user_version: version } = await db.get('PRAGMA user_version');
  if (version < 3) {
    const adressen = await db.all('SELECT id FROM adressen');
    const kommunikation = require('../services/kommunikation');
    for (const a of adressen) await kommunikation.uebernehmenAusStamm(db, a.id);
    await db.run('PRAGMA user_version = 3');
    if (adressen.length) console.log(`[MIGRATION] Kontaktdaten von ${adressen.length} Adresse(n) in Telefon-/E-Mail-Listen übernommen.`);
  }

  // ---- 3b) Einmalig: Schlüsseltabelle PFkt aus HausPerfekt (340 Codes) übernehmen
  const { user_version: v4 } = await db.get('PRAGMA user_version');
  if (v4 < 4) {
    const { codes } = require('../services/pfktCodesHausPerfekt.json');
    await db.transaktion(async (tx) => {
      for (const [code, bezeichnung, kennz, rolle] of codes) {
        await tx.run(`INSERT INTO pfkt_codes (code, bezeichnung, rolle, kennz) VALUES (?,?,?,?)
          ON CONFLICT(code) DO UPDATE SET bezeichnung = excluded.bezeichnung, rolle = excluded.rolle, kennz = excluded.kennz`, [code, bezeichnung, rolle, kennz]);
      }
    });
    await db.run('PRAGMA user_version = 4');
    if (filePath && filePath !== ':memory:') console.log(`[MIGRATION] ${codes.length} Personenfunktions-Codes aus HausPerfekt übernommen.`);
  }
  // ---- 5) HP-Objekte, Einheiten, Konten und Jahresverteilung vorbereiten ---
  await require('./hpStrukturen').migrieren(db, filePath);
  await require('./hpImport').migrieren(db);
}

module.exports = { migrieren };
