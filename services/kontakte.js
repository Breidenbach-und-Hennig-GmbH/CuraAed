'use strict';

const V = require('../lib/validation');

// Adress-Akte: Kontaktprotokoll („Telefoneingänge"), Wiedervorlagen und die
// Mitarbeiter-Einschätzung („Ampel") – entsprechend den Symbolen der
// HausPerfekt-Adressmaske. Spätere Handwerkeraufträge erzeugen Wiedervorlagen
// mit quelle = 'handwerkerauftrag'.

const KONTAKT_ARTEN = ['anruf', 'email', 'gespraech', 'brief', 'notiz', 'sonstiges'];
const RICHTUNGEN = ['eingehend', 'ausgehend'];
const AMPEL = ['gruen', 'gelb', 'rot'];
const QUELLEN = ['manuell', 'handwerkerauftrag', 'telefon'];

function zeitpunkt(v, feld) {
  const s = V.str(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw new V.ValidationError(`Ungültiger Zeitpunkt für „${feld}" (erwartet JJJJ-MM-TTTHH:MM).`);
  return s;
}

function jetzt() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function adresseVorhanden(db, adresseId) {
  const a = await db.get('SELECT id FROM adressen WHERE id = ?', [adresseId]);
  if (!a) throw new V.ValidationError('Adresse nicht gefunden.', 404);
}

async function benutzerPruefen(db, id) {
  if (!id) return null;
  const b = await db.get('SELECT id FROM benutzer WHERE id = ? AND aktiv = 1', [id]);
  if (!b) throw new V.ValidationError('Zuständiger Mitarbeiter nicht gefunden.');
  return b.id;
}

// ---- Kontaktprotokoll --------------------------------------------------
/** Objekt/Wohnung per Nummer (wie im Archiv); die Wohnung legt das Objekt mit fest. */
async function bezugAufloesen(db, data) {
  let objektId = null;
  let einheitId = null;
  const eNr = V.str(data.einheit_nr, 30);
  const oNr = V.str(data.objekt_nr, 30);
  if (eNr) {
    const e = await db.get('SELECT id, objekt_id FROM einheiten WHERE nummer = ? COLLATE NOCASE', [eNr]);
    if (!e) throw new V.ValidationError(`Wohnung/Einheit-Nr. nicht gefunden: ${eNr}`);
    einheitId = e.id;
    objektId = e.objekt_id;
  }
  if (oNr) {
    const o = await db.get('SELECT id FROM objekte WHERE nummer = ? COLLATE NOCASE', [oNr]);
    if (!o) throw new V.ValidationError(`Objekt-Nr. nicht gefunden: ${oNr}`);
    if (objektId && objektId !== o.id) throw new V.ValidationError('Die Wohnung gehört nicht zu diesem Objekt.');
    objektId = o.id;
  }
  return { objektId, einheitId };
}

async function kontaktWerte(db, data) {
  const art = V.oneOf(data.art, KONTAKT_ARTEN, 'Art', 'anruf');
  const richtung = V.str(data.richtung) ? V.oneOf(data.richtung, RICHTUNGEN, 'Richtung') : null;
  const min = V.num(data.minuten);
  if (min !== null && (!Number.isInteger(min) || min < 0 || min > 1440)) throw new V.ValidationError('Minuten: ganze Zahl zwischen 0 und 1440.');
  const { objektId, einheitId } = await bezugAufloesen(db, data);
  return {
    art,
    richtung: art === 'gespraech' || art === 'notiz' ? null : richtung,
    zeitpunkt: zeitpunkt(data.zeitpunkt, 'Zeitpunkt') || jetzt(),
    betreff: V.requireStr(V.str(data.betreff, 200), 'Betreff'),
    notiz: V.str(data.notiz, 4000),
    intern: V.bool(data.intern),
    minuten: min,
    objekt_id: objektId,
    einheit_id: einheitId,
  };
}

const KONTAKT_SELECT = `SELECT k.*, b.name AS erfasst_von_name, b.benutzername AS erfasst_von_kuerzel,
    o.nummer AS objekt_nummer, o.bezeichnung AS objekt_bezeichnung,
    e.nummer AS einheit_nummer, e.bezeichnung AS einheit_bezeichnung,
    rs.benutzername AS rueckruf_sb_kuerzel, rs.name AS rueckruf_sb_name, aa.nummer AS anrufer_nummer
  FROM kontakte k LEFT JOIN benutzer b ON b.id = k.erfasst_von
  LEFT JOIN objekte o ON o.id = k.objekt_id LEFT JOIN einheiten e ON e.id = k.einheit_id
  LEFT JOIN benutzer rs ON rs.id = k.rueckruf_sb_id LEFT JOIN adressen aa ON aa.id = k.anrufer_adresse_id`;

async function kontakteListe(db, adresseId) {
  await adresseVorhanden(db, adresseId);
  return db.all(`${KONTAKT_SELECT} WHERE k.adresse_id = ? ORDER BY k.zeitpunkt DESC, k.id DESC`, [adresseId]);
}

async function kontaktAnlegen(db, adresseId, data, benutzerId) {
  await adresseVorhanden(db, adresseId);
  const w = await kontaktWerte(db, data);
  const r = await db.run(
    `INSERT INTO kontakte (adresse_id, art, richtung, zeitpunkt, betreff, notiz, erfasst_von, intern, minuten, objekt_id, einheit_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [adresseId, w.art, w.richtung, w.zeitpunkt, w.betreff, w.notiz, benutzerId || null, w.intern, w.minuten, w.objekt_id, w.einheit_id]
  );
  return db.get(`${KONTAKT_SELECT} WHERE k.id = ?`, [r.lastID]);
}

async function kontaktAktualisieren(db, id, data) {
  const k = await db.get('SELECT * FROM kontakte WHERE id = ?', [id]);
  if (!k) throw new V.ValidationError('Kontakt nicht gefunden.', 404);
  const w = await kontaktWerte(db, { ...data, zeitpunkt: data.zeitpunkt || k.zeitpunkt });
  await db.run('UPDATE kontakte SET art=?, richtung=?, zeitpunkt=?, betreff=?, notiz=?, intern=?, minuten=?, objekt_id=?, einheit_id=? WHERE id=?',
    [w.art, w.richtung, w.zeitpunkt, w.betreff, w.notiz, w.intern, w.minuten, w.objekt_id, w.einheit_id, id]);
  return db.get(`${KONTAKT_SELECT} WHERE k.id = ?`, [id]);
}

async function kontaktLoeschen(db, id) {
  const r = await db.run('DELETE FROM kontakte WHERE id = ?', [id]);
  if (!r.changes) throw new V.ValidationError('Kontakt nicht gefunden.', 404);
  return { geloescht: true };
}

// ---- Wiedervorlagen ----------------------------------------------------
const WV_SELECT = `SELECT w.*, z.name AS zustaendig_name FROM wiedervorlagen w LEFT JOIN benutzer z ON z.id = w.zustaendig_id`;

async function wiedervorlagenListe(db, adresseId, { mitErledigten = false } = {}) {
  await adresseVorhanden(db, adresseId);
  return db.all(
    `${WV_SELECT} WHERE w.adresse_id = ? ${mitErledigten ? '' : 'AND w.erledigt = 0'}
     ORDER BY w.erledigt, w.faellig_am, w.id`,
    [adresseId]
  );
}

/** Glocke in der Kopfzeile: offene, fällige Wiedervorlagen (heute oder früher) – eigene zuerst. */
async function faelligeWiedervorlagen(db, benutzerId, stichtag = new Date().toISOString().slice(0, 10)) {
  const rows = await db.all(
    `SELECT w.id, w.adresse_id, w.faellig_am, w.betreff, w.zustaendig_id,
            a.nummer AS adresse_nummer, a.adresstyp, a.vorname, a.nachname, a.firmenname
     FROM wiedervorlagen w JOIN adressen a ON a.id = w.adresse_id
     WHERE w.erledigt = 0 AND w.faellig_am <= ?
     ORDER BY (w.zustaendig_id = ?) DESC, w.faellig_am, w.id LIMIT 50`,
    [stichtag, benutzerId || 0]
  );
  return rows.map((r) => ({
    id: r.id, adresse_id: r.adresse_id, faellig_am: r.faellig_am, betreff: r.betreff, adresse_nummer: r.adresse_nummer,
    eigene: r.zustaendig_id === benutzerId, name: r.adresstyp === 'firma' ? r.firmenname : [r.vorname, r.nachname].filter(Boolean).join(' '),
  }));
}

async function wvWerte(db, data) {
  return {
    faellig_am: V.isoDate(data.faellig_am, 'Fällig am') || (() => { throw new V.ValidationError('Feld "Fällig am" ist erforderlich.'); })(),
    betreff: V.requireStr(V.str(data.betreff, 200), 'Betreff'),
    notiz: V.str(data.notiz, 4000),
    zustaendig_id: await benutzerPruefen(db, data.zustaendig_id ? Number(data.zustaendig_id) : null),
  };
}

async function wiedervorlageAnlegen(db, adresseId, data, benutzerId) {
  await adresseVorhanden(db, adresseId);
  const w = await wvWerte(db, data);
  const quelle = V.oneOf(data.quelle, QUELLEN, 'Quelle', 'manuell');
  const r = await db.run(
    `INSERT INTO wiedervorlagen (adresse_id, faellig_am, betreff, notiz, zustaendig_id, quelle, erstellt_von)
     VALUES (?,?,?,?,?,?,?)`,
    [adresseId, w.faellig_am, w.betreff, w.notiz, w.zustaendig_id, quelle, benutzerId || null]
  );
  return db.get(`${WV_SELECT} WHERE w.id = ?`, [r.lastID]);
}

async function wiedervorlageAktualisieren(db, id, data) {
  const v = await db.get('SELECT * FROM wiedervorlagen WHERE id = ?', [id]);
  if (!v) throw new V.ValidationError('Wiedervorlage nicht gefunden.', 404);
  const w = await wvWerte(db, data);
  await db.run('UPDATE wiedervorlagen SET faellig_am=?, betreff=?, notiz=?, zustaendig_id=? WHERE id=?',
    [w.faellig_am, w.betreff, w.notiz, w.zustaendig_id, id]);
  return db.get(`${WV_SELECT} WHERE w.id = ?`, [id]);
}

async function wiedervorlageErledigt(db, id, erledigt) {
  const v = await db.get('SELECT * FROM wiedervorlagen WHERE id = ?', [id]);
  if (!v) throw new V.ValidationError('Wiedervorlage nicht gefunden.', 404);
  const e = V.bool(erledigt);
  await db.run("UPDATE wiedervorlagen SET erledigt = ?, erledigt_am = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?", [e, e, id]);
  return db.get(`${WV_SELECT} WHERE w.id = ?`, [id]);
}

async function wiedervorlageLoeschen(db, id) {
  const r = await db.run('DELETE FROM wiedervorlagen WHERE id = ?', [id]);
  if (!r.changes) throw new V.ValidationError('Wiedervorlage nicht gefunden.', 404);
  return { geloescht: true };
}

// ---- Übersicht für die Symbole der Adressmaske --------------------------
async function uebersicht(db, adresseId, stichtag) {
  await adresseVorhanden(db, adresseId);
  const heute = stichtag || new Date().toISOString().slice(0, 10);
  const wv = await db.get(
    `SELECT COUNT(*) AS offen, SUM(CASE WHEN faellig_am < ? THEN 1 ELSE 0 END) AS ueberfaellig,
            SUM(CASE WHEN faellig_am = ? THEN 1 ELSE 0 END) AS heute
     FROM wiedervorlagen WHERE adresse_id = ? AND erledigt = 0`,
    [heute, heute, adresseId]
  );
  const k = await db.get('SELECT COUNT(*) AS anzahl, MAX(zeitpunkt) AS letzter FROM kontakte WHERE adresse_id = ?', [adresseId]);
  return {
    wiedervorlagen: { offen: wv.offen || 0, ueberfaellig: wv.ueberfaellig || 0, heute: wv.heute || 0 },
    kontakte: { anzahl: k.anzahl || 0, letzter: k.letzter || null },
  };
}

// ---- Ampel (Mitarbeiter-Einschätzung) ------------------------------------
async function ampelSetzen(db, adresseId, data, benutzerId) {
  await adresseVorhanden(db, adresseId);
  const ampel = V.str(data.ampel) ? V.oneOf(data.ampel, AMPEL, 'Ampel') : null;
  const notiz = ampel ? V.str(data.notiz, 500) : null;
  await db.run(
    "UPDATE adressen SET ampel = ?, ampel_notiz = ?, ampel_datum = CASE WHEN ? IS NULL THEN NULL ELSE date('now') END, ampel_von = ? WHERE id = ?",
    [ampel, notiz, ampel, ampel ? benutzerId || null : null, adresseId]
  );
  return db.get(
    'SELECT a.ampel, a.ampel_notiz, a.ampel_datum, b.name AS ampel_von_name FROM adressen a LEFT JOIN benutzer b ON b.id = a.ampel_von WHERE a.id = ?',
    [adresseId]
  );
}

module.exports = {
  KONTAKT_SELECT,
  bezugAufloesen,
  benutzerPruefen,
  zeitpunkt,
  jetzt,
  KONTAKT_ARTEN,
  AMPEL,
  kontakteListe,
  kontaktAnlegen,
  faelligeWiedervorlagen,
  kontaktAktualisieren,
  kontaktLoeschen,
  wiedervorlagenListe,
  wiedervorlageAnlegen,
  wiedervorlageAktualisieren,
  wiedervorlageErledigt,
  wiedervorlageLoeschen,
  uebersicht,
  ampelSetzen,
};
