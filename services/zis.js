'use strict';

const V = require('../lib/validation');
const { anzeigename } = require('./adressen');
const { KONTAKT_SELECT } = require('./kontakte');

// Z.I.S – Zentrales Informationssystem: alle Eintragungen zu einer Adresse in
// zeitlicher Reihenfolge (neueste zuerst). Quellen: Kontaktprotokoll (Anrufe,
// E-Mails, Gespräche, Briefe, Notizen), Archiv-Dokumente und Wiedervorlagen.
// Spätere Quellen (Handwerkeraufträge, Serienbriefe, M365-E-Mails) hängen sich
// hier mit eigenem `quelle`-Wert ein.

const KUERZEL = {
  anruf: 'TEL', email: 'MAIL', gespraech: 'GSP', brief: 'BRF', notiz: 'NOT', sonstiges: 'SON',
  dokument: 'DOK', wiedervorlage: 'WV',
};
const MAX = 1000;

// erstellt_am ist UTC ('YYYY-MM-DD HH:MM:SS') → lokale Anzeigezeit im Format JJJJ-MM-TTTHH:MM
function ausUtc(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return String(s).slice(0, 16).replace(' ', 'T');
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function eintraege(db, adresseId, opts = {}) {
  const a = await db.get('SELECT * FROM adressen WHERE id = ?', [adresseId]);
  if (!a) throw new V.ValidationError('Adresse nicht gefunden.', 404);
  const liste = [];

  const kontakte = await db.all(`${KONTAKT_SELECT} WHERE k.adresse_id = ? AND k.zis = 1`, [adresseId]);
  for (const k of kontakte) {
    liste.push({
      quelle: 'kontakt', id: k.id, zeitpunkt: k.zeitpunkt, art: KUERZEL[k.art] || 'SON', art_lang: k.art, richtung: k.richtung,
      text: k.betreff + (k.notiz ? ' / ' + k.notiz.split('\n')[0] : ''),
      notiz: k.notiz, intern: !!k.intern, minuten: k.minuten,
      objekt_nummer: k.objekt_nummer, objekt_bezeichnung: k.objekt_bezeichnung,
      einheit_nummer: k.einheit_nummer, einheit_bezeichnung: k.einheit_bezeichnung,
      sb: k.erfasst_von_kuerzel || null, sb_name: k.erfasst_von_name || null,
    });
  }

  const doks = await db.all(
    `SELECT d.*, b.benutzername AS sb, b.name AS sb_name FROM dokumente d
     JOIN archiv_verknuepfungen v ON v.dokument_id = d.id AND v.adresse_id = ?
     LEFT JOIN benutzer b ON b.id = d.hochgeladen_von`,
    [adresseId]
  );
  for (const d of doks) {
    liste.push({
      quelle: 'dokument', id: d.id,
      zeitpunkt: d.dokument_datum ? `${d.dokument_datum}T00:00` : ausUtc(d.erstellt_am),
      art: KUERZEL.dokument, text: `Dokumenten-Name ${d.titel} / Kategorie: ${d.kategorie} / Datei: ${d.original_name}`,
      notiz: d.beschreibung, intern: false, minuten: null, kategorie: d.kategorie, sb: d.sb, sb_name: d.sb_name,
    });
  }

  const wvs = await db.all(
    `SELECT w.*, b.benutzername AS sb, b.name AS sb_name FROM wiedervorlagen w
     LEFT JOIN benutzer b ON b.id = w.erstellt_von WHERE w.adresse_id = ?`,
    [adresseId]
  );
  for (const w of wvs) {
    const [j, m, t] = w.faellig_am.split('-');
    liste.push({
      quelle: 'wiedervorlage', id: w.id, zeitpunkt: ausUtc(w.erstellt_am), art: KUERZEL.wiedervorlage,
      text: `Wiedervorlage zum ${t}.${m}.${j}: ${w.betreff}${w.erledigt ? ' (erledigt)' : ''}`,
      notiz: w.notiz, intern: true, minuten: null, sb: w.sb, sb_name: w.sb_name,
    });
  }

  let ergebnis = liste;
  const suche = V.str(opts.suche, 200);
  if (suche) {
    const q = suche.toLowerCase();
    ergebnis = liste.filter((e) => [e.text, e.notiz, e.objekt_bezeichnung, e.einheit_bezeichnung, e.objekt_nummer, e.einheit_nummer, e.sb_name]
      .some((x) => x && String(x).toLowerCase().includes(q)));
  }
  ergebnis.sort((x, y) => (y.zeitpunkt || '').localeCompare(x.zeitpunkt || '') || y.id - x.id);
  return {
    adresse: { id: a.id, nummer: a.nummer, anzeigename: anzeigename(a) },
    gesamt: ergebnis.length,
    eintraege: ergebnis.slice(0, MAX),
  };
}

/** Z.I.S zum Objekt: Kontakte und Dokumente zum Objekt und seinen Einheiten. */
async function objektEintraege(db, objektId, opts = {}) {
  const o = await db.get('SELECT * FROM objekte WHERE id = ?', [objektId]);
  if (!o) throw new V.ValidationError('Objekt nicht gefunden.', 404);
  const liste = [];
  const kontakte = await db.all(
    `${KONTAKT_SELECT} WHERE k.zis = 1 AND (k.objekt_id = ? OR k.einheit_id IN (SELECT id FROM einheiten WHERE objekt_id = ?))`,
    [objektId, objektId]
  );
  const adressen = new Map((await db.all(
    'SELECT * FROM adressen WHERE id IN (SELECT adresse_id FROM kontakte WHERE objekt_id = ? OR einheit_id IN (SELECT id FROM einheiten WHERE objekt_id = ?))',
    [objektId, objektId]
  )).map((a) => [a.id, a]));
  for (const k of kontakte) {
    const a = adressen.get(k.adresse_id);
    liste.push({
      quelle: 'kontakt', id: k.id, zeitpunkt: k.zeitpunkt, art: KUERZEL[k.art] || 'SON', art_lang: k.art, richtung: k.richtung,
      text: (a ? `${anzeigename(a)}: ` : '') + k.betreff + (k.notiz ? ' / ' + k.notiz.split('\n')[0] : ''),
      notiz: k.notiz, intern: !!k.intern, minuten: k.minuten, adresse_id: k.adresse_id,
      objekt_nummer: k.objekt_nummer, objekt_bezeichnung: k.objekt_bezeichnung,
      einheit_nummer: k.einheit_nummer, einheit_bezeichnung: k.einheit_bezeichnung,
      sb: k.erfasst_von_kuerzel || null, sb_name: k.erfasst_von_name || null,
    });
  }
  const doks = await db.all(
    `SELECT DISTINCT d.*, b.benutzername AS sb, b.name AS sb_name FROM dokumente d
     JOIN archiv_verknuepfungen v ON v.dokument_id = d.id
     LEFT JOIN benutzer b ON b.id = d.hochgeladen_von
     WHERE v.objekt_id = ? OR v.einheit_id IN (SELECT id FROM einheiten WHERE objekt_id = ?)`,
    [objektId, objektId]
  );
  for (const d of doks) {
    liste.push({
      quelle: 'dokument', id: d.id,
      zeitpunkt: d.dokument_datum ? `${d.dokument_datum}T00:00` : ausUtc(d.erstellt_am),
      art: KUERZEL.dokument, text: `Dokumenten-Name ${d.titel} / Kategorie: ${d.kategorie} / Datei: ${d.original_name}`,
      notiz: d.beschreibung, intern: false, minuten: null, kategorie: d.kategorie, sb: d.sb, sb_name: d.sb_name,
    });
  }
  let ergebnis = liste;
  const suche = V.str(opts.suche, 200);
  if (suche) {
    const q = suche.toLowerCase();
    ergebnis = liste.filter((e) => [e.text, e.notiz, e.einheit_bezeichnung, e.einheit_nummer, e.sb_name]
      .some((x) => x && String(x).toLowerCase().includes(q)));
  }
  ergebnis.sort((x, y) => (y.zeitpunkt || '').localeCompare(x.zeitpunkt || '') || y.id - x.id);
  return { objekt: { id: o.id, nummer: o.nummer, bezeichnung: o.bezeichnung }, gesamt: ergebnis.length, eintraege: ergebnis.slice(0, MAX) };
}

module.exports = { KUERZEL, eintraege, objektEintraege };
