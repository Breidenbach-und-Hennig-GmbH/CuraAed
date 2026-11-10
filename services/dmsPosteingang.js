'use strict';
const {ValidationError}=require('../lib/validation');
function kuerzel(value){if(typeof value!=='string')throw new ValidationError('Ungültiger Sachbearbeiter.');const s=value.trim().toUpperCase();if(!/^[A-Z]{0,3}$/.test(s))throw new ValidationError('Bitte höchstens drei Großbuchstaben oder ein leeres Feld eingeben.');return s;}
function bauePosteingang(db){
 async function list(q={}){
  const sb=kuerzel(q.sb??''),seite=q.seite===undefined?1:Number(q.seite);if(!Number.isSafeInteger(seite)||seite<1||seite>1000000)throw new ValidationError('Ungültige Seite.');
  const args=[];let where=q.alle==='1'?'1=1':"p.status='offen'";if(sb){where+=' AND p.sachbearbeiter=?';args.push(sb);}
  if(q.suche){if(typeof q.suche!=='string'||q.suche.length>200)throw new ValidationError('Ungültige Suche.');where+=' AND (d.titel LIKE ? OR d.original_name LIKE ? OR d.beschreibung LIKE ?)';args.push(...Array(3).fill('%'+q.suche+'%'));}
  const orders={standard:'p.erstellt_am DESC,p.dokument_id DESC',datum_alt:'p.erstellt_am,p.dokument_id',titel:'d.titel COLLATE NOCASE,p.dokument_id',sachbearbeiter:'p.sachbearbeiter,d.titel COLLATE NOCASE'};
  const order=q.sortierung||'standard';if(!Object.hasOwn(orders,order))throw new ValidationError('Ungültige Sortierung.');
  const from=' FROM dms_posteingang p JOIN dokumente d ON d.id=p.dokument_id LEFT JOIN dms_dokument_meta m ON m.dokument_id=d.id WHERE '+where;
  const count=await db.get('SELECT COUNT(*) AS n'+from,args);
  const rows=await db.all('SELECT p.*,d.titel,d.original_name,d.groesse,d.dokument_datum,d.kategorie,COALESCE(m.zugriffe,0) AS zugriffe'+from+' ORDER BY '+orders[order]+' LIMIT 50 OFFSET ?',[...args,(seite-1)*50]);
  return {eintraege:rows,gesamt:count.n,seite,weitere:seite*50<count.n,sachbearbeiter:sb};
 }
 async function add(owner,b){
  const sb=kuerzel(b.sachbearbeiter??''),id=Number(b.dokument_id);if(!Number.isSafeInteger(id)||id<1)throw new ValidationError('Ungültiges Dokument.');
  return db.transaktion(async tx=>{
   if(!await tx.get('SELECT id FROM dokumente WHERE id=?',[id]))throw new ValidationError('Archivdokument nicht gefunden.',404);
   if(await tx.get('SELECT 1 FROM dms_posteingang WHERE dokument_id=?',[id]))throw new ValidationError('Dokument bereits im Posteingang erfasst.',409);
   await tx.run("INSERT INTO dms_posteingang(dokument_id,sachbearbeiter,status,erstellt_von) VALUES(?,?,'offen',?)",[id,sb,owner]);
   await tx.run("INSERT INTO dms_posteingang_verlauf(dokument_id,benutzer_id,aktion,sachbearbeiter) VALUES(?,?,'eingang',?)",[id,owner,sb]);return {ok:true};
  });
 }
 async function update(owner,id,b){
  const sb=kuerzel(b.sachbearbeiter??'');if(!['offen','abgeschlossen'].includes(b.status)||!Number.isSafeInteger(b.revision))throw new ValidationError('Ungültiger Bearbeitungsstand.');
  return db.transaktion(async tx=>{const old=await tx.get('SELECT * FROM dms_posteingang WHERE dokument_id=?',[id]);if(!old)throw new ValidationError('Posteingang nicht gefunden.',404);if(old.revision!==b.revision)throw new ValidationError('Eintrag inzwischen geändert. Bitte neu laden.',409);
   await tx.run("UPDATE dms_posteingang SET sachbearbeiter=?,status=?,revision=revision+1,geaendert_am=datetime('now') WHERE dokument_id=?",[sb,b.status,id]);
   await tx.run('INSERT INTO dms_posteingang_verlauf(dokument_id,benutzer_id,aktion,sachbearbeiter) VALUES(?,?,?,?)',[id,owner,b.status==='abgeschlossen'?'abgeschlossen':sb!==old.sachbearbeiter?'weitergeleitet':'geoeffnet',sb]);return {ok:true};
  });
 }
 async function detail(id){
  const eingang=await db.get('SELECT p.*,b.name AS erfasst_name,b.kuerzel AS erfasst_kuerzel FROM dms_posteingang p LEFT JOIN benutzer b ON b.id=p.erstellt_von WHERE p.dokument_id=?',[id]);if(!eingang)throw new ValidationError('Posteingang nicht gefunden.',404);
  const dokument=await require('./archiv').holen(db,id),meta=await db.get('SELECT * FROM dms_dokument_meta WHERE dokument_id=?',[id]);
  const autor=dokument.hochgeladen_von?await db.get('SELECT name,kuerzel FROM benutzer WHERE id=?',[dokument.hochgeladen_von]):null;
  const verlauf=await db.all('SELECT h.aktion,h.sachbearbeiter,h.erstellt_am,b.name AS benutzer FROM dms_posteingang_verlauf h LEFT JOIN benutzer b ON b.id=h.benutzer_id WHERE h.dokument_id=? ORDER BY h.id DESC',[id]);
  return {eingang,dokument,autor,oeffentlich:!!meta?.oeffentlich,verfall_am:meta?.verfall_am||null,zugriffe:meta?.zugriffe||0,verlauf};
 }
 async function saveMeta(owner,id,b){
  if(!b||!Number.isSafeInteger(b.revision)||typeof b.bemerkung!=='string'||b.bemerkung.length>4000||typeof b.oeffentlich!=='boolean')throw new ValidationError('Ungültige Dokumentangaben.');
  const verfall=b.verfall_am||null;if(verfall&&(!/^\d{4}-\d{2}-\d{2}$/.test(verfall)||Number.isNaN(Date.parse(verfall+'T00:00:00Z'))||new Date(verfall+'T00:00:00Z').toISOString().slice(0,10)!==verfall))throw new ValidationError('Ungültiges Verfalldatum.');
  return db.transaktion(async tx=>{const p=await tx.get('SELECT * FROM dms_posteingang WHERE dokument_id=?',[id]);if(!p)throw new ValidationError('Posteingang nicht gefunden.',404);const doc=await tx.get('SELECT beschreibung FROM dokumente WHERE id=?',[id]);
   if(p.revision!==b.revision||(doc.beschreibung||'')!==b.basis_bemerkung)throw new ValidationError('Dokument inzwischen geändert. Bitte neu laden.',409);
   await tx.run('UPDATE dokumente SET beschreibung=? WHERE id=?',[b.bemerkung||null,id]);
   await tx.run('INSERT INTO dms_dokument_meta(dokument_id,oeffentlich,verfall_am) VALUES(?,?,?) ON CONFLICT(dokument_id) DO UPDATE SET oeffentlich=excluded.oeffentlich,verfall_am=excluded.verfall_am',[id,b.oeffentlich?1:0,verfall]);
   await tx.run("UPDATE dms_posteingang SET revision=revision+1,geaendert_am=datetime('now') WHERE dokument_id=?",[id]);
   await tx.run("INSERT INTO dms_posteingang_verlauf(dokument_id,benutzer_id,aktion,sachbearbeiter) VALUES(?,?,'dokumentangaben_geaendert',?)",[id,owner,p.sachbearbeiter]);return {ok:true};});
 }
 return {list,add,update,detail,saveMeta};
}
module.exports={bauePosteingang,kuerzel};
