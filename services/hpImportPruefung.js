'use strict';
const {ValidationError}=require('../lib/validation');
const F=require('../lib/hpImportFormat');
const fail=m=>{throw new ValidationError(m,400);};
const missingKey='HP-Jahres-Verteilerschlüssel noch nicht importiert.';
const pendingReason='Messdienstabrechnung HK0/HK1 steht noch aus.';
const berlinYear=ms=>Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric'}).format(new Date(ms)));
const pendingSql=alias=>`(${alias}.meldung='${missingKey}' AND EXISTS(SELECT 1 FROM hp_import_ausstehend a WHERE a.verbindung_id=${alias}.verbindung_id AND a.art=${alias}.art AND a.hp_objnr=${alias}.hp_objnr AND a.quellschluessel=${alias}.quellschluessel))`;
async function vormerken(tx,id,r,grund,ms){
 const w=r.werte,year=w.BJ||w.Buchungsjahr;
 const candidate=grund===missingKey&&['einheitsanteil','kontenanteil','personenwert','personenjahr'].includes(r.art)&&['HK0','HK1'].includes(w.VSchl)&&/^\d{4}$/.test(year||'');
 const args=[id,r.art,r.objnr,r.key];
 if(!candidate){await tx.run('DELETE FROM hp_import_ausstehend WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',args);return;}
 await tx.run('DELETE FROM hp_import_ausstehend WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=? AND jahr<>?',[...args,Number(year)]);
 if(Number(year)===berlinYear(ms))await tx.run('INSERT OR IGNORE INTO hp_import_ausstehend VALUES(?,?,?,?,?,?)',[...args,Number(year),ms]);
}
async function aktualisieren(db,id,ms=Date.now()){
 // Backfill existing saved rows too: no new HP executable or full reread needed.
 const rows=await db.all(`SELECT e.art,e.hp_objnr,e.quellschluessel,e.meldung,o.original FROM hp_import_fehler e
 JOIN hp_import_originaldaten o ON o.verbindung_id=e.verbindung_id AND o.art=e.art AND o.hp_objnr=e.hp_objnr AND o.quellschluessel=e.quellschluessel
 WHERE e.verbindung_id=? AND e.meldung=? AND e.art IN ('einheitsanteil','kontenanteil','personenwert','personenjahr')
 AND NOT ${pendingSql('e')} AND o.status='pruefen' AND o.hash=(SELECT x.hash FROM hp_import_originaldaten x WHERE x.verbindung_id=o.verbindung_id AND x.art=o.art AND x.hp_objnr=o.hp_objnr AND x.quellschluessel=o.quellschluessel ORDER BY x.gelesen_ms DESC,x.hash LIMIT 1)`,[id,missingKey]);
 for(const row of rows){const w=JSON.parse(row.original);if(['HK0','HK1'].includes(w.VSchl))await vormerken(db,id,{art:row.art,objnr:row.hp_objnr,key:row.quellschluessel,werte:w},row.meldung,ms);}
}
async function sichern(tx,id,r,grund,ms){
 await tx.run(`INSERT INTO hp_import_originaldaten(verbindung_id,art,hp_objnr,quellschluessel,hash,original,grund,status,gelesen_ms)
 VALUES(?,?,?,?,?,?,?,'pruefen',?) ON CONFLICT(verbindung_id,art,hp_objnr,quellschluessel,hash)
 DO UPDATE SET grund=excluded.grund,status='pruefen',gelesen_ms=excluded.gelesen_ms,erledigt_ms=NULL`,
 [id,r.art,r.objnr,r.key,r.hash,JSON.stringify(r.werte),grund,ms]);
 await vormerken(tx,id,r,grund,ms);
}
async function erledigen(tx,id,r,ms){
 await tx.run('DELETE FROM hp_import_ausstehend WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',[id,r.art,r.objnr,r.key]);
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
async function liste(db,owner,input={},ms=Date.now()){
 const page=Number(input.seite||1);if(!Number.isSafeInteger(page)||page<1||page>100000)fail('Ungültige Prüfseite.');
 const pending=input.status==='ausstehend';
 for(const c of await db.all('SELECT id FROM hp_adress_verbindungen WHERE benutzer_id=?',[owner]))await aktualisieren(db,c.id,ms);
 const filter=`FROM hp_import_originaldaten o JOIN hp_adress_verbindungen v ON v.id=o.verbindung_id
 JOIN hp_import_fehler e ON e.verbindung_id=o.verbindung_id AND e.art=o.art AND e.hp_objnr=o.hp_objnr AND e.quellschluessel=o.quellschluessel
 JOIN hp_import_objektstatus s ON s.verbindung_id=o.verbindung_id AND s.hp_objnr=o.hp_objnr
 WHERE v.benutzer_id=? AND ${pending?'':'NOT '}${pendingSql('e')} AND o.status='pruefen' AND s.status='aktiv' AND o.hash=(SELECT x.hash FROM hp_import_originaldaten x
 WHERE x.verbindung_id=o.verbindung_id AND x.art=o.art AND x.hp_objnr=o.hp_objnr AND x.quellschluessel=o.quellschluessel ORDER BY x.gelesen_ms DESC,x.hash LIMIT 1)`;
 const count=await db.get('SELECT COUNT(*) AS gesamt '+filter,[owner]);
 const rows=await db.all('SELECT o.art,o.hp_objnr,o.quellschluessel,o.grund,o.original,o.gelesen_ms '+filter+' ORDER BY o.hp_objnr,o.art,o.quellschluessel LIMIT 25 OFFSET ?',[owner,(page-1)*25]);
 return {gesamt:count.gesamt,seite:page,weitere:page*25<count.gesamt,faelle:rows.map(r=>({...r,grund:pending?pendingReason:r.grund,original:JSON.parse(r.original)}))};
}
async function stand(db,id,ms=Date.now()){
 await aktualisieren(db,id,ms);
 const pending=pendingSql('e');
 return db.get(`SELECT COALESCE(SUM(CASE WHEN ${pending} THEN 0 ELSE 1 END),0) AS offen,COALESCE(SUM(CASE WHEN ${pending} THEN 1 ELSE 0 END),0) AS ausstehend,COALESCE(SUM(CASE WHEN NOT ${pending} AND EXISTS(SELECT 1 FROM hp_import_originaldaten o WHERE o.verbindung_id=e.verbindung_id AND o.art=e.art AND o.hp_objnr=e.hp_objnr AND o.quellschluessel=e.quellschluessel AND o.status='pruefen') THEN 1 ELSE 0 END),0) AS gesichert
 FROM hp_import_fehler e JOIN hp_import_objektstatus s ON s.verbindung_id=e.verbindung_id AND s.hp_objnr=e.hp_objnr WHERE e.verbindung_id=? AND s.status='aktiv'`,[id]);
}
module.exports={sichern,erledigen,plan,liste,stand,pendingSql};
