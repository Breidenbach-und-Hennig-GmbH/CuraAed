'use strict';

const V = require('../lib/validation');

// Änderungshistorie für Adressen: vergleicht den Datensatz vor und nach einer
// Änderung und schreibt je geändertem Feld einen Eintrag (wer, wann, alt → neu).
// Quelle „portal" ist für Änderungen aus dem Kundenportal vorgesehen.

const BEREICHE = {
  adresse: {
    tabelle: 'adressen',
    felder: ['nummer', 'adresstyp', 'anrede', 'vorname', 'nachname', 'firmenname', 'zusatz', 'ansprechpartner', 'strasse', 'plz', 'ort', 'land',
      'notizen', 'geburtstag', 'lkto_nr', 'datenschutz_zustimmung', 'datenschutz_datum', 'versand_standard', 'archiviert'],
  },
  ampel: { tabelle: 'adressen', felder: ['ampel', 'ampel_notiz'] },
  telefon: { tabelle: 'adress_telefone', felder: ['art', 'nummer', 'bemerkung', 'kurzwahl'] },
  email: { tabelle: 'adress_emails', felder: ['adresse', 'bemerkung', 'ist_email', 'standard'] },
  ansprechpartner: { tabelle: 'adress_ansprechpartner', felder: ['name', 'funktion', 'telefon', 'email'] },
  bank: { tabelle: 'adress_bank', felder: ['kontoinhaber', 'iban', 'bic', 'bankname', 'standard', 'mandatsreferenz', 'mandat_datum', 'mandat_aktiv', 'bemerkung'] },
  personenfunktion: { tabelle: 'rollen_zuordnungen', felder: ['rolle', 'objekt_id', 'einheit_id', 'gueltig_von', 'gueltig_bis', 'anteil', 'notizen'] },
};
const QUELLEN = ['intern', 'portal', 'system'];
const MAX_WERT = 2000;

const text = (v) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, MAX_WERT));

/** Akteur aus der Anfrage; Kundenkonten (Rolle „kunde", Portal) werden als Quelle „portal" vermerkt. */
function akteur(benutzer) {
  if (!benutzer) return { benutzer_id: null, benutzer_name: 'System', quelle: 'system' };
  return { benutzer_id: benutzer.id, benutzer_name: benutzer.name || benutzer.benutzername, quelle: benutzer.rolle === 'kunde' ? 'portal' : 'intern' };
}

async function zeile(db, bereich, id) {
  const b = BEREICHE[bereich];
  if (!b || !id) return null;
  return (await db.get(`SELECT * FROM ${b.tabelle} WHERE id = ?`, [id])) || null;
}

async function schreiben(db, eintraege) {
  for (const e of eintraege) {
    await db.run(
      `INSERT INTO aenderungen (adresse_id, bereich, datensatz_id, aktion, feld, alt, neu, benutzer_id, benutzer_name, quelle)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [e.adresse_id, e.bereich, e.datensatz_id ?? null, e.aktion, e.feld ?? null, text(e.alt), text(e.neu),
        e.benutzer_id ?? null, e.benutzer_name ?? null, QUELLEN.includes(e.quelle) ? e.quelle : 'intern']
    );
  }
  return eintraege.length;
}

/** Vergleicht alt/neu (Zeilen derselben Tabelle) und protokolliert die geänderten Felder. */
async function protokollieren(db, { bereich, alt, neu, wer }) {
  const b = BEREICHE[bereich];
  if (!b || (!alt && !neu)) return 0;
  const basis = alt || neu;
  const adresseId = b.tabelle === 'adressen' ? basis.id : basis.adresse_id;
  const aktion = !alt ? 'angelegt' : !neu ? 'geloescht' : 'geaendert';
  const eintraege = [];
  for (const feld of b.felder) {
    const a = text(alt ? alt[feld] : null);
    const n = text(neu ? neu[feld] : null);
    if (a === n) continue;
    eintraege.push({ adresse_id: adresseId, bereich, datensatz_id: basis.id, aktion, feld, alt: a, neu: n, ...wer });
  }
  // Wechsel des Adressbezugs (z. B. Zuordnung auf andere Adresse) zusätzlich bei der neuen Adresse vermerken
  if (alt && neu && b.tabelle !== 'adressen' && alt.adresse_id !== neu.adresse_id) {
    eintraege.push({ adresse_id: neu.adresse_id, bereich, datensatz_id: neu.id, aktion: 'angelegt', feld: 'adresse_id', alt: alt.adresse_id, neu: neu.adresse_id, ...wer });
  }
  return schreiben(db, eintraege);
}

/** Einträge einer Adresse, neueste zuerst; Mitarbeiter-/Objekt-/Einheitsbezüge lesbar aufgelöst. */
async function liste(db, adresseId, opts = {}) {
  const where = ['h.adresse_id = ?'];
  const params = [adresseId];
  if (opts.bereich && BEREICHE[opts.bereich]) { where.push('h.bereich = ?'); params.push(opts.bereich); }
  if (opts.quelle && QUELLEN.includes(opts.quelle)) { where.push('h.quelle = ?'); params.push(opts.quelle); }
  const suche = V.str(opts.suche, 100);
  if (suche) {
    where.push('(h.alt LIKE ? OR h.neu LIKE ? OR h.benutzer_name LIKE ? OR h.feld LIKE ?)');
    const like = `%${suche}%`;
    params.push(like, like, like, like);
  }
  const rows = await db.all(
    `SELECT h.* FROM aenderungen h WHERE ${where.join(' AND ')} ORDER BY h.zeitpunkt DESC, h.id DESC LIMIT 2000`,
    params
  );
  // Objekt-/Einheit-IDs der Personenfunktion als Nummern anzeigen
  const ids = (tab) => [...new Set(rows.filter((r) => r.feld === tab).flatMap((r) => [r.alt, r.neu]).filter(Boolean))];
  const nummern = async (tabelle, liste) => (liste.length
    ? new Map((await db.all(`SELECT id, nummer FROM ${tabelle} WHERE id IN (${liste.map(() => '?').join(',')})`, liste)).map((x) => [String(x.id), x.nummer]))
    : new Map());
  const obj = await nummern('objekte', ids('objekt_id'));
  const einh = await nummern('einheiten', ids('einheit_id'));
  const anzeige = (feld, v) => (v == null ? v : feld === 'objekt_id' ? obj.get(v) || v : feld === 'einheit_id' ? einh.get(v) || v : v);
  return rows.map((r) => ({ ...r, alt: anzeige(r.feld, r.alt), neu: anzeige(r.feld, r.neu) }));
}

module.exports = { BEREICHE, QUELLEN, akteur, zeile, protokollieren, schreiben, liste };
