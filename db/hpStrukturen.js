'use strict';
const path=require('node:path');
const crypto=require('node:crypto');

// Migration ausschließlich beim Öffnen der DB, bevor HTTP-Anfragen zugelassen werden.
// Alte, undatierte Schlüssel/Anteile bleiben unberührt. Kein HP-Import und keine HP-Schreibfreigabe.
function dezimalCheck(column,nullable=false) {
  const check=`typeof(${column})='text' AND length(${column}) BETWEEN 1 AND 64
    AND ${column} NOT GLOB '*[^0-9.-]*'
    AND length(${column})-length(replace(${column},'.',''))<=1
    AND instr(substr(${column},2),'-')=0 AND ${column} GLOB '*[0-9]*'
    AND substr(${column},-1)<>'.'
    AND (substr(${column},1,1) BETWEEN '0' AND '9'
      OR (substr(${column},1,1)='-' AND substr(${column},2,1) BETWEEN '0' AND '9'))`;
  return `CHECK (${nullable?column+' IS NULL OR ':''}(${check}))`;
}

const syncColumns=`basis TEXT, remote TEXT, ziel TEXT, hash TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  sync_status TEXT NOT NULL DEFAULT 'neu' CHECK(sync_status IN ('neu','synchron','lokal_geaendert','remote_geaendert','konflikt','fehler')),
  meldung TEXT, gelesen_am TEXT`;

async function migrieren(db,filePath) {
  const {user_version:version}=await db.get('PRAGMA user_version');
  if(version>=5) return;
  const accountColumns=(await db.all('PRAGMA table_info(personenkonten)')).map(c=>c.name);
  const knownAccountColumns=new Set(['id','objekt_id','zuordnung_id','nummer','ref_nr','sachbearbeiter_id','bemerkung','erstellt_am']);
  if(accountColumns.some(c=>!knownAccountColumns.has(c))) throw new Error('Unbekannte Personenkonto-Spalten: Migration zum Schutz vorhandener Daten abgebrochen.');
  const customObjects=await db.all("SELECT name FROM sqlite_master WHERE tbl_name='personenkonten' AND type IN ('trigger','index') AND sql IS NOT NULL");
  if(customObjects.length) throw new Error('Zusätzliche Personenkonto-Indizes oder Trigger: Migration zur Prüfung angehalten.');
  if((await db.all('PRAGMA foreign_key_check')).length) throw new Error('Bestehende Fremdschlüsselfehler vor HP-Strukturerweiterung.');
  const mismatch=await db.get('SELECT 1 FROM personenkonten p JOIN rollen_zuordnungen z ON z.id=p.zuordnung_id JOIN einheiten e ON e.id=z.einheit_id WHERE e.objekt_id<>p.objekt_id LIMIT 1');
  if(mismatch) throw new Error('Bestehendes Personenkonto und Einheit gehören zu unterschiedlichen Objekten.');
  if(filePath&&filePath!==':memory:') {
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const target=path.join(path.dirname(filePath),`sicherung-vor-hp-strukturen-${stamp}-${crypto.randomBytes(4).toString('hex')}.db`);
    await db.run('VACUUM INTO ?',[target]);
    console.log('[MIGRATION] Sicherung vor HP-Strukturerweiterung erstellt:',target);
  }
  // Nur für den atomaren Neuaufbau der Kontotabelle; keine Kaskaden auf Sollwerte.
  await db.run('PRAGMA foreign_keys = OFF');
  try {
    await db.transaktion(async tx=>{
      const additions={
        objekte:{objekt_alias:'TEXT',gebaeudebezeichnung:'TEXT',objektstrasse_2:'TEXT',hp_objekt_id:'TEXT',hp_objekttyp_code:'TEXT',hp_team_code:'TEXT',hp_sachbearbeiter_code:'TEXT',hp_buchhalter_code:'TEXT',hp_reservebuchhalter_code:'TEXT'},
        einheiten:{gebaeude_index:'INTEGER',bauteil_index:'INTEGER',hp_einheitstyp_code:'TEXT',hp_verwaltungsart_code:'TEXT',hp_vschl1:'TEXT',hp_vschl2:'TEXT',hp_vschl3:'TEXT',hp_vschl4:'TEXT',hp_vschl5:'TEXT',wohnung:'INTEGER CHECK(wohnung IS NULL OR wohnung IN (0,1))',gewerbe:'INTEGER CHECK(gewerbe IS NULL OR gewerbe IN (0,1))',teileigentum:'INTEGER CHECK(teileigentum IS NULL OR teileigentum IN (0,1))',mwst_optiert:'INTEGER CHECK(mwst_optiert IS NULL OR mwst_optiert IN (0,1))',gefoerdert:'INTEGER CHECK(gefoerdert IS NULL OR gefoerdert IN (0,1))',mittel_getilgt:'INTEGER CHECK(mittel_getilgt IS NULL OR mittel_getilgt IN (0,1))',bindung_bis:'TEXT',gueltig_bis:'TEXT',datum_frei:'TEXT',bewertungskategorie:'INTEGER',garagen_nr:'TEXT',stellplatz_nr:'TEXT',mea_dezimal:`TEXT ${dezimalCheck('mea_dezimal',true)}`,flaeche_qm_dezimal:`TEXT ${dezimalCheck('flaeche_qm_dezimal',true)}`},
        rollen_zuordnungen:{hp_firma_code:'TEXT',hp_pfkt_art:'INTEGER',hp_mieter_pktonr:'INTEGER',hp_steuer_schluessel:'INTEGER',inaktiv:'INTEGER CHECK(inaktiv IS NULL OR inaktiv IN (0,1))',inaktiv_bis:'TEXT',mobile_ende:'INTEGER CHECK(mobile_ende IS NULL OR mobile_ende IN (0,1))',option_von:'TEXT',option_bis:'TEXT',option_ausgeuebt_am:'TEXT'},
        pkto_sollwerte:{gilt_bis:'TEXT',hp_sollkonto:'INTEGER',hp_forderungskonto:'INTEGER',hp_abrechnungsart_code:'TEXT',tag_plus:'INTEGER',letzte_sollstellung_am:'TEXT',aenderungsgrund_code:'TEXT',steuerschluessel:'INTEGER',steuer_prozent_dezimal:`TEXT ${dezimalCheck('steuer_prozent_dezimal',true)}`,netto_dezimal:`TEXT ${dezimalCheck('netto_dezimal',true)}`,betrag_dezimal:`TEXT ${dezimalCheck('betrag_dezimal',true)}`,hp_modul_id:'TEXT',gueltig:'INTEGER CHECK(gueltig IS NULL OR gueltig IN (0,1))',aenderung_sb_code:'TEXT',aenderung_am:'TEXT',aenderung_zeit_raw:'INTEGER'}
      };
      for(const [table,fields] of Object.entries(additions)) {
        const existing=new Set((await tx.all(`PRAGMA table_info(${table})`)).map(c=>c.name));
        for(const [column,type] of Object.entries(fields)) if(!existing.has(column)) await tx.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }

      // Der bisherige Hauptbezug bleibt eindeutig, darf für HP-Konten aber fehlen.
      // Weitere Funktionen werden über personenkonto_funktionen zugeordnet.
      // IDs, Sollwerte und Referenzen bleiben beim Neuaufbau unverändert.
      const sequence=await tx.get("SELECT seq FROM sqlite_sequence WHERE name='personenkonten'");
      await tx.exec(`CREATE TABLE personenkonten_hp_neu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        objekt_id INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
        zuordnung_id INTEGER UNIQUE REFERENCES rollen_zuordnungen(id) ON DELETE RESTRICT,
        nummer TEXT NOT NULL, ref_nr TEXT,
        sachbearbeiter_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
        bemerkung TEXT, erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
        adresse_id INTEGER REFERENCES adressen(id) ON DELETE RESTRICT,
        einheit_id INTEGER REFERENCES einheiten(id) ON DELETE RESTRICT,
        kontoname TEXT, aktenzeichen TEXT,
        UNIQUE(objekt_id,nummer), UNIQUE(id,objekt_id),
        FOREIGN KEY(einheit_id,objekt_id) REFERENCES einheiten(id,objekt_id) ON DELETE RESTRICT
      );
      INSERT INTO personenkonten_hp_neu(id,objekt_id,zuordnung_id,nummer,ref_nr,sachbearbeiter_id,bemerkung,erstellt_am,adresse_id,einheit_id)
        SELECT p.id,p.objekt_id,p.zuordnung_id,p.nummer,p.ref_nr,p.sachbearbeiter_id,p.bemerkung,p.erstellt_am,z.adresse_id,z.einheit_id
        FROM personenkonten p LEFT JOIN rollen_zuordnungen z ON z.id=p.zuordnung_id;
      DROP TABLE personenkonten;
      ALTER TABLE personenkonten_hp_neu RENAME TO personenkonten;`);
      if(sequence) {
        await tx.run("INSERT INTO sqlite_sequence(name,seq) SELECT 'personenkonten',? WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name='personenkonten')",[sequence.seq]);
        await tx.run("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='personenkonten'",[sequence.seq]);
      }

      await tx.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_hp_einheit_objekt ON einheiten(id,objekt_id);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_hp_schluessel_objekt ON verteilerschluessel(id,objekt_id);
      CREATE UNIQUE INDEX IF NOT EXISTS ux_hp_rolle_objekt ON rollen_zuordnungen(id,objekt_id);
      CREATE TABLE objekt_gebaeude (
        objekt_id INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
        nummer INTEGER NOT NULL CHECK(nummer>=0), bezeichnung TEXT,
        PRIMARY KEY(objekt_id,nummer)
      );
      CREATE TABLE objekt_buchungsjahre (
        objekt_id INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
        jahr INTEGER NOT NULL CHECK(typeof(jahr)='integer' AND jahr BETWEEN 1 AND 9999),
        beginnt_am TEXT, endet_am TEXT, gebucht_bis TEXT,
        hp_sb_code TEXT, hp_waehrung INTEGER, vorsteuerquote_dezimal TEXT ${dezimalCheck('vorsteuerquote_dezimal',true)},
        PRIMARY KEY(objekt_id,jahr),
        CHECK(beginnt_am IS NULL OR endet_am IS NULL OR beginnt_am<=endet_am)
      );
      CREATE TABLE personenkonto_funktionen (
        personenkonto_id INTEGER NOT NULL, objekt_id INTEGER NOT NULL,
        zuordnung_id INTEGER NOT NULL,
        PRIMARY KEY(personenkonto_id,zuordnung_id),
        FOREIGN KEY(personenkonto_id,objekt_id) REFERENCES personenkonten(id,objekt_id) ON DELETE CASCADE,
        FOREIGN KEY(zuordnung_id,objekt_id) REFERENCES rollen_zuordnungen(id,objekt_id) ON DELETE RESTRICT
      );
      INSERT INTO personenkonto_funktionen(personenkonto_id,objekt_id,zuordnung_id)
        SELECT p.id,p.objekt_id,p.zuordnung_id FROM personenkonten p JOIN rollen_zuordnungen z ON z.id=p.zuordnung_id
          WHERE z.objekt_id=p.objekt_id;
      CREATE INDEX idx_pkto_funktion ON personenkonto_funktionen(zuordnung_id);

      CREATE TABLE verteilerschluessel_jahre (
        schluessel_id INTEGER NOT NULL, objekt_id INTEGER NOT NULL,
        jahr INTEGER NOT NULL CHECK(typeof(jahr)='integer' AND jahr BETWEEN 1 AND 9999),
        bezeichnung TEXT NOT NULL, gesamt_dezimal TEXT ${dezimalCheck('gesamt_dezimal',true)},
        hp_typ_pw INTEGER, hp_tabellenart INTEGER, hp_geraeteart_code TEXT,
        bemerkung TEXT, PRIMARY KEY(schluessel_id,jahr), UNIQUE(schluessel_id,jahr,objekt_id),
        FOREIGN KEY(schluessel_id,objekt_id) REFERENCES verteilerschluessel(id,objekt_id) ON DELETE CASCADE,
        FOREIGN KEY(objekt_id,jahr) REFERENCES objekt_buchungsjahre(objekt_id,jahr) ON DELETE RESTRICT
      );
      CREATE TABLE einheit_verteilung_jahre (
        schluessel_id INTEGER NOT NULL, jahr INTEGER NOT NULL, objekt_id INTEGER NOT NULL,
        einheit_id INTEGER NOT NULL, anteil_dezimal TEXT NOT NULL ${dezimalCheck('anteil_dezimal')},
        PRIMARY KEY(schluessel_id,jahr,einheit_id),
        FOREIGN KEY(schluessel_id,jahr,objekt_id) REFERENCES verteilerschluessel_jahre(schluessel_id,jahr,objekt_id) ON DELETE CASCADE,
        FOREIGN KEY(einheit_id,objekt_id) REFERENCES einheiten(id,objekt_id) ON DELETE RESTRICT
      );
      CREATE TABLE personenkonto_verteilung_jahre (
        schluessel_id INTEGER NOT NULL, jahr INTEGER NOT NULL, objekt_id INTEGER NOT NULL,
        personenkonto_id INTEGER NOT NULL, anteil_dezimal TEXT NOT NULL ${dezimalCheck('anteil_dezimal')},
        PRIMARY KEY(schluessel_id,jahr,personenkonto_id),
        FOREIGN KEY(schluessel_id,jahr,objekt_id) REFERENCES verteilerschluessel_jahre(schluessel_id,jahr,objekt_id) ON DELETE CASCADE,
        FOREIGN KEY(personenkonto_id,objekt_id) REFERENCES personenkonten(id,objekt_id) ON DELETE RESTRICT
      );
      CREATE TABLE personenkonto_verteilung_zeitwerte (
        schluessel_id INTEGER NOT NULL, jahr INTEGER NOT NULL, objekt_id INTEGER NOT NULL,
        personenkonto_id INTEGER NOT NULL, hp_dat_anders INTEGER NOT NULL CHECK(typeof(hp_dat_anders)='integer' AND hp_dat_anders>=0),
        datum TEXT, info TEXT, anzahl_personen_dezimal TEXT ${dezimalCheck('anzahl_personen_dezimal',true)},
        anzahl_tage INTEGER, jahresuebergreifend INTEGER CHECK(jahresuebergreifend IS NULL OR jahresuebergreifend IN (0,1)),
        PRIMARY KEY(schluessel_id,jahr,personenkonto_id,hp_dat_anders),
        FOREIGN KEY(schluessel_id,jahr,objekt_id) REFERENCES verteilerschluessel_jahre(schluessel_id,jahr,objekt_id) ON DELETE CASCADE,
        FOREIGN KEY(personenkonto_id,objekt_id) REFERENCES personenkonten(id,objekt_id) ON DELETE RESTRICT
      );
      CREATE TABLE hp_objekt_zuordnung (
        verbindung_id TEXT NOT NULL REFERENCES hp_adress_verbindungen(id) ON DELETE RESTRICT,
        hp_objnr INTEGER NOT NULL CHECK(typeof(hp_objnr)='integer' AND hp_objnr>0),
        objekt_id INTEGER NOT NULL UNIQUE REFERENCES objekte(id) ON DELETE RESTRICT,
        fi_beendet INTEGER, beendet_am TEXT,
        verwaltungsstatus TEXT NOT NULL DEFAULT 'unklar' CHECK(verwaltungsstatus IN ('unklar','aktiv','beendet','beendigungsdatum_zu_pruefen')),
        ${syncColumns},
        PRIMARY KEY(verbindung_id,hp_objnr), UNIQUE(verbindung_id,hp_objnr,objekt_id)
      );
      CREATE TABLE hp_einheit_zuordnung (
        verbindung_id TEXT NOT NULL, hp_objnr INTEGER NOT NULL, objekt_id INTEGER NOT NULL,
        hp_whgnr INTEGER NOT NULL CHECK(typeof(hp_whgnr)='integer' AND hp_whgnr>=0),
        einheit_id INTEGER NOT NULL UNIQUE, ${syncColumns},
        PRIMARY KEY(verbindung_id,hp_objnr,hp_whgnr),
        FOREIGN KEY(verbindung_id,hp_objnr,objekt_id) REFERENCES hp_objekt_zuordnung(verbindung_id,hp_objnr,objekt_id) ON DELETE RESTRICT,
        FOREIGN KEY(einheit_id,objekt_id) REFERENCES einheiten(id,objekt_id) ON DELETE RESTRICT
      );
      CREATE TABLE hp_personenkonto_zuordnung (
        verbindung_id TEXT NOT NULL, hp_objnr INTEGER NOT NULL, objekt_id INTEGER NOT NULL,
        hp_pktonr INTEGER NOT NULL CHECK(typeof(hp_pktonr)='integer' AND hp_pktonr>0),
        hp_adrnr INTEGER, hp_whgnr INTEGER, personenkonto_id INTEGER NOT NULL UNIQUE,
        ${syncColumns}, PRIMARY KEY(verbindung_id,hp_objnr,hp_pktonr),
        FOREIGN KEY(verbindung_id,hp_objnr,objekt_id) REFERENCES hp_objekt_zuordnung(verbindung_id,hp_objnr,objekt_id) ON DELETE RESTRICT,
        FOREIGN KEY(personenkonto_id,objekt_id) REFERENCES personenkonten(id,objekt_id) ON DELETE RESTRICT
      );
      CREATE TABLE hp_personenfunktion_zuordnung (
        verbindung_id TEXT NOT NULL, hp_objnr INTEGER NOT NULL, objekt_id INTEGER NOT NULL,
        hp_lfdnr INTEGER NOT NULL CHECK(typeof(hp_lfdnr)='integer' AND hp_lfdnr>0),
        zuordnung_id INTEGER NOT NULL UNIQUE, ${syncColumns},
        PRIMARY KEY(verbindung_id,hp_objnr,hp_lfdnr),
        FOREIGN KEY(verbindung_id,hp_objnr,objekt_id) REFERENCES hp_objekt_zuordnung(verbindung_id,hp_objnr,objekt_id) ON DELETE RESTRICT,
        FOREIGN KEY(zuordnung_id,objekt_id) REFERENCES rollen_zuordnungen(id,objekt_id) ON DELETE RESTRICT
      );
      CREATE TABLE hp_verteilerschluessel_zuordnung (
        verbindung_id TEXT NOT NULL, hp_objnr INTEGER NOT NULL, objekt_id INTEGER NOT NULL,
        hp_code TEXT NOT NULL, jahr INTEGER NOT NULL, schluessel_id INTEGER NOT NULL,
        ${syncColumns}, PRIMARY KEY(verbindung_id,hp_objnr,jahr,hp_code), UNIQUE(schluessel_id,jahr),
        FOREIGN KEY(verbindung_id,hp_objnr,objekt_id) REFERENCES hp_objekt_zuordnung(verbindung_id,hp_objnr,objekt_id) ON DELETE RESTRICT,
        FOREIGN KEY(schluessel_id,jahr,objekt_id) REFERENCES verteilerschluessel_jahre(schluessel_id,jahr,objekt_id) ON DELETE RESTRICT
      );`);
      const errors=await tx.all('PRAGMA foreign_key_check');
      if(errors.length) throw new Error('HP-Strukturerweiterung abgebrochen: bestehende Zuordnungen sind nicht konsistent.');
      await tx.run('PRAGMA user_version = 5');
    });
  } finally { await db.run('PRAGMA foreign_keys = ON'); }
}
module.exports={migrieren};
