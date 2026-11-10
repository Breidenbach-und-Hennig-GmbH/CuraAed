'use strict';

const V = require('../lib/validation');

// Eigentümerversammlungen (ETV): Übersicht/Archiv, anlegen, kopieren, archivieren, löschen.
const ARTEN = ['praesenz', 'hybrid', 'online'];
const STATUS = ['vorbereitung', 'eingeladen', 'durchgefuehrt'];

const SELECT = `
  SELECT v.*, o.nummer AS objekt_nummer, o.bezeichnung AS objekt_bezeichnung, o.objekttyp, b.name AS leitung_name,b.kuerzel AS leitung_kuerzel,b.aktiv AS leitung_aktiv
  FROM versammlungen v JOIN objekte o ON o.id = v.objekt_id LEFT JOIN benutzer b ON b.id=v.leitung_id`;

async function liste(db, opts = {}) {
  const where = ['v.archiviert = ?'];
  const params = [V.bool(opts.archiv)];
  const suche = V.str(opts.suche, 100);
  if (suche) {
    where.push('(v.name LIKE ? OR o.nummer LIKE ? OR o.bezeichnung LIKE ? OR v.ort LIKE ? OR v.ort_strasse LIKE ? OR v.ort_plz LIKE ? OR v.ort_stadt LIKE ? OR v.ort_beschreibung LIKE ? OR b.name LIKE ? OR CAST(v.nummer AS TEXT) = ?)');
    const like = `%${suche}%`;
    params.push(like, like, like, like, like, like, like, like, like, suche);
  }
  if (opts.objekt_id) { where.push('v.objekt_id = ?'); params.push(Number(opts.objekt_id)); }
  const richtung = opts.sort === 'asc' ? 'ASC' : 'DESC';
  return db.all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY v.datum ${richtung}, COALESCE(v.uhrzeit, '') ${richtung}, v.id ${richtung}`, params);
}

async function holen(db, id) {
  return db.get(`${SELECT} WHERE v.id = ?`, [id]);
}

async function werte(db, data,bisher=null) {
  const objektId = Number(data.objekt_id);
  if (!objektId || !(await db.get('SELECT id FROM objekte WHERE id = ?', [objektId]))) throw new V.ValidationError('Bitte ein Objekt wählen.');
  const datum = V.isoDate(data.datum, 'Datum');
  if (!datum) throw new V.ValidationError('Feld "Datum" ist erforderlich.');
  const uhrzeit = V.str(data.uhrzeit, 5);
  if (uhrzeit && !/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) throw new V.ValidationError('Uhrzeit bitte als HH:MM angeben.');
  const nr = V.num(data.nummer);
  if (nr !== null && (!Number.isInteger(nr) || nr < 1 || nr > 9999)) throw new V.ValidationError('"Nr." muss eine ganze Zahl zwischen 1 und 9999 sein.');
  let leitung=null;
  if(data.leitung_id!==undefined&&data.leitung_id!==null&&data.leitung_id!==''){
    if(!['string','number'].includes(typeof data.leitung_id))throw new V.ValidationError('Ungültige Versammlungsleitung.');
    leitung=Number(data.leitung_id);
    if(!Number.isSafeInteger(leitung)||leitung<1)throw new V.ValidationError('Ungültige Versammlungsleitung.');
    const person=await db.get("SELECT id,aktiv,rolle FROM benutzer WHERE id=?",[leitung]);
    if(!person||(!(person.aktiv&&['admin','mitarbeiter'].includes(person.rolle))&&bisher?.leitung_id!==leitung))throw new V.ValidationError('Bitte einen aktiven Mitarbeitenden als Versammlungsleitung auswählen.');
  }
  return {
    leitung_id:leitung,
    objekt_id: objektId,
    nummer: nr,
    name: V.requireStr(V.str(data.name, 120), 'Name'),
    datum,
    uhrzeit,
    art: V.oneOf(data.art, ARTEN, 'Art', 'praesenz'),
    ort: V.str(data.ort, 200),
    ort_strasse: V.str(data.ort_strasse,200),
    ort_plz: V.str(data.ort_plz,20),
    ort_stadt: V.str(data.ort_stadt,100),
    ort_beschreibung: V.str(data.ort_beschreibung,2000),
    status: V.oneOf(data.status, STATUS, 'Status', 'vorbereitung'),
    notizen: V.str(data.notizen),
  };
}
const SPALTEN = ['objekt_id', 'nummer', 'name', 'datum', 'uhrzeit', 'art', 'ort', 'ort_strasse', 'ort_plz', 'ort_stadt', 'ort_beschreibung', 'status', 'notizen', 'leitung_id'];


const ORTFELDER={ort:200,ort_strasse:200,ort_plz:20,ort_stadt:100,ort_beschreibung:2000};
async function ortMerken(db,objektId,data){
 const id=Number(objektId);
 if(!Number.isSafeInteger(id)||id<1||!await db.get('SELECT id FROM objekte WHERE id=?',[id]))throw new V.ValidationError('Objekt nicht gefunden.',404);
 const w={};for(const [k,max] of Object.entries(ORTFELDER)){if(data[k]!=null&&typeof data[k]!=='string')throw new V.ValidationError('Ungültige Ortsangabe.');w[k]=V.str(data[k],max)||'';}
 if(!w.ort)throw new V.ValidationError('Bitte eine Bezeichnung für den Versammlungsort eingeben.');
 const cols=Object.keys(ORTFELDER),values=cols.map(k=>w[k]);
 await db.run('INSERT OR IGNORE INTO versammlungsorte(objekt_id,'+cols.join(',')+') VALUES(?,?,?,?,?,?)',[id,...values]);
 return db.get('SELECT * FROM versammlungsorte WHERE objekt_id=? AND '+cols.map(k=>k+'=?').join(' AND '),[id,...values]);
}
async function orte(db,objektId){
 const id=Number(objektId);if(!Number.isSafeInteger(id)||id<1||!await db.get('SELECT id FROM objekte WHERE id=?',[id]))throw new V.ValidationError('Objekt nicht gefunden.',404);
 return db.all('SELECT * FROM versammlungsorte WHERE objekt_id=? ORDER BY ort COLLATE NOCASE,ort_strasse,ort_stadt,id',[id]);
}
async function anlegen(db, data, benutzerId) {
  const w = await werte(db, data);
  return db.transaktion(async tx=>{
  const r = await tx.run(
    `INSERT INTO versammlungen (${SPALTEN.join(', ')}, erstellt_von) VALUES (${SPALTEN.map(() => '?').join(', ')}, ?)`,
    [...SPALTEN.map((s) => w[s]), benutzerId || null]
  );
  if(w.ort)await ortMerken(tx,w.objekt_id,w);
  return holen(tx, r.lastID);
  });
}

async function aktualisieren(db, id, data) {
  const bisher=await holen(db,id);
  if (!bisher) throw new V.ValidationError('Versammlung nicht gefunden.', 404);
  const w = await werte(db, {...bisher,...data},bisher);
  return db.transaktion(async tx=>{
  await tx.run(`UPDATE versammlungen SET ${SPALTEN.map((s) => `${s}=?`).join(', ')}, geaendert_am=datetime('now') WHERE id=?`,
    [...SPALTEN.map((s) => w[s]), id]);
  if(w.ort)await ortMerken(tx,w.objekt_id,w);
  return holen(tx, id);
  });
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

module.exports = { orte,ortMerken,ARTEN, STATUS, liste, holen, anlegen, aktualisieren, archivieren, loeschen };
