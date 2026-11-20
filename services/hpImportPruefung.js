'use strict';
const {ValidationError}=require('../lib/validation');
const F=require('../lib/hpImportFormat');
const fail=m=>{throw new ValidationError(m,400);};
async function sichern(tx,id,r,grund,ms){
 await tx.run(`INSERT INTO hp_import_originaldaten(verbindung_id,art,hp_objnr,quellschluessel,hash,original,grund,status,gelesen_ms)
 VALUES(?,?,?,?,?,?,?,'pruefen',?) ON CONFLICT(verbindung_id,art,hp_objnr,quellschluessel,hash)
 DO UPDATE SET grund=excluded.grund,status='pruefen',gelesen_ms=excluded.gelesen_ms,erledigt_ms=NULL`,
 [id,r.art,r.objnr,r.key,r.hash,JSON.stringify(r.werte),grund,ms]);
}
async function erledigen(tx,id,r,ms){
 await tx.run("UPDATE hp_import_originaldaten SET status='uebernommen',erledigt_ms=? WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=? AND status='pruefen'",[ms,id,r.art,r.objnr,r.key]);
}
async function plan(tx,id,input){
 if(!Object.hasOwn(F.datasets,input.art)||!Number.isSafeInteger(input.nach_objnr)||input.nach_objnr<0||typeof input.nach_key!=='string'||input.nach_key.length>256)fail('Ungültiger Wiederholungsplan.');
 const next=await tx.get(`SELECT e.hp_objnr FROM hp_import_fehler e JOIN hp_import_objektstatus s ON s.verbindung_id=e.verbindung_id AND s.hp_objnr=e.hp_objnr
 WHERE e.verbindung_id=? AND e.art=? AND s.status='aktiv' AND (e.hp_objnr>? OR (e.hp_objnr=? AND e.quellschluessel>?))
 ORDER BY e.hp_objnr,e.quellschluessel LIMIT 1`,[id,input.art,input.nach_objnr,input.nach_objnr,input.nach_key]);
 if(!next)return {objnr:null,keys:[]};
 const rows=await tx.all(`SELECT quellschluessel FROM hp_import_fehler WHERE verbindung_id=? AND art=? AND hp_objnr=? AND (hp_objnr>? OR quellschluessel>?) ORDER BY quellschluessel LIMIT 20`,[id,input.art,next.hp_objnr,input.nach_objnr,input.nach_key]);
 return {objnr:next.hp_objnr,keys:rows.map(r=>r.quellschluessel)};
}
async function liste(db,owner,input={}){
 const page=Number(input.seite||1);if(!Number.isSafeInteger(page)||page<1||page>100000)fail('Ungültige Prüfseite.');
 const filter=`FROM hp_import_originaldaten o JOIN hp_adress_verbindungen v ON v.id=o.verbindung_id
 JOIN hp_import_fehler e ON e.verbindung_id=o.verbindung_id AND e.art=o.art AND e.hp_objnr=o.hp_objnr AND e.quellschluessel=o.quellschluessel
 JOIN hp_import_objektstatus s ON s.verbindung_id=o.verbindung_id AND s.hp_objnr=o.hp_objnr
 WHERE v.benutzer_id=? AND o.status='pruefen' AND s.status='aktiv' AND o.hash=(SELECT x.hash FROM hp_import_originaldaten x
 WHERE x.verbindung_id=o.verbindung_id AND x.art=o.art AND x.hp_objnr=o.hp_objnr AND x.quellschluessel=o.quellschluessel ORDER BY x.gelesen_ms DESC,x.hash LIMIT 1)`;
 const count=await db.get('SELECT COUNT(*) AS gesamt '+filter,[owner]);
 const rows=await db.all('SELECT o.art,o.hp_objnr,o.quellschluessel,o.grund,o.original,o.gelesen_ms '+filter+' ORDER BY o.hp_objnr,o.art,o.quellschluessel LIMIT 25 OFFSET ?',[owner,(page-1)*25]);
 return {gesamt:count.gesamt,seite:page,weitere:page*25<count.gesamt,faelle:rows.map(r=>({...r,original:JSON.parse(r.original)}))};
}
async function stand(db,id){
 return db.get(`SELECT COUNT(*) AS offen,COALESCE(SUM(EXISTS(SELECT 1 FROM hp_import_originaldaten o WHERE o.verbindung_id=e.verbindung_id AND o.art=e.art AND o.hp_objnr=e.hp_objnr AND o.quellschluessel=e.quellschluessel AND o.status='pruefen')),0) AS gesichert
 FROM hp_import_fehler e JOIN hp_import_objektstatus s ON s.verbindung_id=e.verbindung_id AND s.hp_objnr=e.hp_objnr WHERE e.verbindung_id=? AND s.status='aktiv'`,[id]);
}
module.exports={sichern,erledigen,plan,liste,stand};
