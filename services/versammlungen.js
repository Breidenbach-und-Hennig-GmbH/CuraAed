'use strict';

const V = require('../lib/validation');

// Eigentümerversammlungen (ETV): Übersicht/Archiv, anlegen, kopieren, archivieren, löschen.
const ARTEN = ['praesenz', 'hybrid', 'online'];
const STATUS = ['vorbereitung', 'eingeladen', 'durchgefuehrt'];

const SELECT = `
  SELECT v.*,t.firma_id AS m365_firma_id,t.dauer AS teams_dauer,t.status AS teams_status,t.meldung AS teams_meldung,CASE WHEN v.art!='praesenz' THEN t.join_url END AS teams_url, o.nummer AS objekt_nummer, o.bezeichnung AS objekt_bezeichnung, o.objekttyp, b.name AS leitung_name,b.kuerzel AS leitung_kuerzel,b.aktiv AS leitung_aktiv, bs.name AS beisitzer_name,pf.name AS protokollfuehrer_name,
 CASE WHEN br.adresstyp='firma' THEN br.firmenname ELSE TRIM(COALESCE(br.vorname,'')||' '||COALESCE(br.nachname,'')) END AS beirat_name,
 CASE WHEN uz.adresstyp='firma' THEN uz.firmenname ELSE TRIM(COALESCE(uz.vorname,'')||' '||COALESCE(uz.nachname,'')) END AS unterzeichner_name
  FROM versammlungen v LEFT JOIN etv_teams t ON t.versammlung_id=v.id JOIN objekte o ON o.id = v.objekt_id LEFT JOIN benutzer b ON b.id=v.leitung_id LEFT JOIN benutzer bs ON bs.id=v.beisitzer_id LEFT JOIN benutzer pf ON pf.id=v.protokollfuehrer_id LEFT JOIN adressen br ON br.id=v.beirat_id LEFT JOIN adressen uz ON uz.id=v.unterzeichner_id`;

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


async function teilnahmePersonen(db,objektId,datum){
 const id=Number(objektId),date=datum||new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});
 if(!Number.isSafeInteger(id)||id<1||!await db.get('SELECT id FROM objekte WHERE id=?',[id]))throw new V.ValidationError('Objekt nicht gefunden.',404);
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new V.ValidationError('Ungültiges Versammlungsdatum.');
 const rows=await db.all("SELECT DISTINCT a.id,a.adresstyp,a.vorname,a.nachname,a.firmenname,a.nummer,z.rolle FROM rollen_zuordnungen z JOIN adressen a ON a.id=z.adresse_id LEFT JOIN einheiten e ON e.id=z.einheit_id WHERE COALESCE(z.objekt_id,e.objekt_id)=? AND a.archiviert=0 AND z.rolle IN ('beirat','eigentuemer') AND (z.gueltig_von IS NULL OR z.gueltig_von<=?) AND (z.gueltig_bis IS NULL OR z.gueltig_bis>=?) ORDER BY a.nachname,a.firmenname,a.id",[id,date,date]);
 const named=rows.map(a=>({...a,name:require('./adressen').anzeigename(a)}));
 return{beirat:named.filter(a=>a.rolle==='beirat'),eigentuemer:named.filter(a=>a.rolle==='eigentuemer')};
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
  if(!leitung)throw new V.ValidationError('Bitte eine Versammlungsleitung auswählen.');
  const extra={},objektPersonen=await teilnahmePersonen(db,objektId,datum);
  for(const [key,label,gruppe] of [['beisitzer_id','Beisitzer',null],['protokollfuehrer_id','Protokollführer',null],['beirat_id','Beirat','beirat'],['unterzeichner_id','Unterzeichnender Eigentümer','eigentuemer']]){
    const value=data[key];extra[key]=null;if(value===null||value===undefined||value==='')continue;
    const id=Number(value);if(!['string','number'].includes(typeof value)||!Number.isSafeInteger(id)||id<1)throw new V.ValidationError('Ungültige Person: '+label);
    const historisch=bisher?.[key]===id&&bisher.objekt_id===objektId&&(!gruppe||bisher.datum===datum);
    const valid=gruppe?objektPersonen[gruppe].some(p=>p.id===id):await db.get("SELECT id FROM benutzer WHERE id=? AND aktiv=1 AND rolle IN ('admin','mitarbeiter')",[id]);
    if(!valid&&!historisch)throw new V.ValidationError(label+': Bitte eine passende Person auswählen.');
    extra[key]=id;
  }
  return {
    ...extra,
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
const SPALTEN = ['objekt_id', 'nummer', 'name', 'datum', 'uhrzeit', 'art', 'ort', 'ort_strasse', 'ort_plz', 'ort_stadt', 'ort_beschreibung', 'status', 'notizen', 'leitung_id','beisitzer_id','protokollfuehrer_id','beirat_id','unterzeichner_id'];


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
  if(await db.get('SELECT id FROM etv_versandlaeufe WHERE versammlung_id=? LIMIT 1',[id]))throw new V.ValidationError('Diese Versammlung hat archivierte Einladungen. Bitte archivieren statt löschen.',409);
  const r = await db.run('DELETE FROM versammlungen WHERE id = ?', [id]);
  if (!r.changes) throw new V.ValidationError('Versammlung nicht gefunden.', 404);
}

module.exports = { teilnahmePersonen,orte,ortMerken,ARTEN, STATUS, liste, holen, anlegen, aktualisieren, archivieren, loeschen };
