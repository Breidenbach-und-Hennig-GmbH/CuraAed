'use strict';

const V = require('../lib/validation');

// Eigentümerversammlungen (ETV): Übersicht/Archiv, anlegen, kopieren, archivieren, löschen.
const ARTEN = ['praesenz', 'hybrid', 'online'];
const STATUS = ['vorbereitung', 'eingeladen', 'durchgefuehrt'];

const SELECT = `
  SELECT v.*, o.nummer AS objekt_nummer, o.bezeichnung AS objekt_bezeichnung, o.objekttyp
  FROM versammlungen v JOIN objekte o ON o.id = v.objekt_id`;

async function liste(db, opts = {}) {
  const where = ['v.archiviert = ?'];
  const params = [V.bool(opts.archiv)];
  const suche = V.str(opts.suche, 100);
  if (suche) {
    where.push('(v.name LIKE ? OR o.nummer LIKE ? OR o.bezeichnung LIKE ? OR v.ort LIKE ? OR CAST(v.nummer AS TEXT) = ?)');
    const like = `%${suche}%`;
    params.push(like, like, like, like, suche);
  }
  if (opts.objekt_id) { where.push('v.objekt_id = ?'); params.push(Number(opts.objekt_id)); }
  const richtung = opts.sort === 'asc' ? 'ASC' : 'DESC';
  return db.all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY v.datum ${richtung}, COALESCE(v.uhrzeit, '') ${richtung}, v.id ${richtung}`, params);
}

async function holen(db, id) {
  return db.get(`${SELECT} WHERE v.id = ?`, [id]);
}

async function werte(db, data) {
  const objektId = Number(data.objekt_id);
  if (!objektId || !(await db.get('SELECT id FROM objekte WHERE id = ?', [objektId]))) throw new V.ValidationError('Bitte ein Objekt wählen.');
  const datum = V.isoDate(data.datum, 'Datum');
  if (!datum) throw new V.ValidationError('Feld "Datum" ist erforderlich.');
  const uhrzeit = V.str(data.uhrzeit, 5);
  if (uhrzeit && !/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new V.ValidationError('Uhrzeit bitte als HH:MM angeben.');
  const nr = V.num(data.nummer);
  if (nr !== null && (!Number.isInteger(nr) || nr < 1 || nr > 9999)) throw new V.ValidationError('"Nr." muss eine ganze Zahl zwischen 1 und 9999 sein.');
  return {
    objekt_id: objektId,
    nummer: nr,
    name: V.requireStr(V.str(data.name, 120), 'Name'),
    datum,
    uhrzeit,
    art: V.oneOf(data.art, ARTEN, 'Art', 'praesenz'),
    ort: V.str(data.ort, 200),
    status: V.oneOf(data.status, STATUS, 'Status', 'vorbereitung'),
    notizen: V.str(data.notizen),
  };
}
const SPALTEN = ['objekt_id', 'nummer', 'name', 'datum', 'uhrzeit', 'art', 'ort', 'status', 'notizen'];

async function anlegen(db, data, benutzerId) {
  const w = await werte(db, data);
  const r = await db.run(
    `INSERT INTO versammlungen (${SPALTEN.join(', ')}, erstellt_von) VALUES (${SPALTEN.map(() => '?').join(', ')}, ?)`,
    [...SPALTEN.map((s) => w[s]), benutzerId || null]
  );
  return holen(db, r.lastID);
}

async function aktualisieren(db, id, data) {
  if (!(await holen(db, id))) throw new V.ValidationError('Versammlung nicht gefunden.', 404);
  const w = await werte(db, data);
  await db.run(`UPDATE versammlungen SET ${SPALTEN.map((s) => `${s}=?`).join(', ')}, geaendert_am=datetime('now') WHERE id=?`,
    [...SPALTEN.map((s) => w[s]), id]);
  return holen(db, id);
}

async function archivieren(db, id, archiviert) {
  const r = await db.run("UPDATE versammlungen SET archiviert=?, geaendert_am=datetime('now') WHERE id=?", [V.bool(archiviert), id]);
  if (!r.changes) throw new V.ValidationError('Versammlung nicht gefunden.', 404);
  return holen(db, id);
}

async function loeschen(db, id) {
  const r = await db.run('DELETE FROM versammlungen WHERE id = ?', [id]);
  if (!r.changes) throw new V.ValidationError('Versammlung nicht gefunden.', 404);
}

module.exports = { ARTEN, STATUS, liste, holen, anlegen, aktualisieren, archivieren, loeschen };
