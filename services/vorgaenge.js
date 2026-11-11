'use strict';
const crypto=require('node:crypto');
const {ValidationError}=require('../lib/validation');
const {HpMobileError}=require('./hausperfektMobile');
const {BEREICHE}=require('./hpFachbereiche');
const ARTEN=['akte','handwerker','wiedervorlage','zis','notiz'];
const FELDER=['titel','text','status','prioritaet','faellig_am','uhrzeit'];
const STATUS=['offen','in_bearbeitung','beauftragt','erledigt','storniert'];
const fail=(message,status=400)=>{throw new ValidationError(message,status);};
const json=v=>JSON.stringify(v);
const pick=r=>Object.fromEntries(FELDER.map(k=>[k,r[k]??null]));
const sourceHash=data=>crypto.createHash('sha256').update(json({snapshot:data.snapshot,werte:pick(data.werte),bezuege:data.bezuege})).digest('hex');
function input(b){
 const str=(k,max,nullable=false)=>{if((b[k]===null||b[k]==='')&&nullable)return null;if(typeof b[k]!=='string'||b[k].length>max)fail('Ungültige Eingabe: '+k);return b[k].trim();};
 const r={art:b.art,titel:str('titel',500),text:str('text',65535),status:b.status||'offen',prioritaet:b.prioritaet||'normal',faellig_am:str('faellig_am',10,true),uhrzeit:str('uhrzeit',5,true)};
 if(!ARTEN.includes(r.art)||!r.titel||!STATUS.includes(r.status)||!['normal','hoch','dringend'].includes(r.prioritaet))fail('Bitte Art, Titel, Status und Priorität prüfen.');
 if(r.faellig_am&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.faellig_am)||Number.isNaN(Date.parse(r.faellig_am+'T00:00:00Z'))||new Date(r.faellig_am+'T00:00:00Z').toISOString().slice(0,10)!==r.faellig_am))fail('Ungültiges Fälligkeitsdatum.');
 if(r.uhrzeit&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.uhrzeit))fail('Ungültige Uhrzeit.');
 if(r.art==='wiedervorlage'&&!r.faellig_am)fail('Eine Wiedervorlage benötigt ein Fälligkeitsdatum.');
 r.zustaendig_id=b.zustaendig_id===''||b.zustaendig_id===null||b.zustaendig_id===undefined?null:Number(b.zustaendig_id);
 if(r.zustaendig_id!==null&&(!Number.isSafeInteger(r.zustaendig_id)||r.zustaendig_id<1))fail('Ungültige Zuständigkeit.');
 return r;
}
function baueVorgaenge(db,{hp,archiv}={}){
 const active=new Map(),hwa=require('./handwerkerauftraege');
 async function own(tx,owner,id){const r=await tx.get('SELECT * FROM fach_vorgaenge WHERE id=? AND (benutzer_id=? OR zustaendig_id=?)',[id,owner,owner]);if(!r)fail('Vorgang nicht gefunden.',404);return r;}
 async function user(tx,id){if(id&&!await tx.get("SELECT id FROM benutzer WHERE id=? AND aktiv=1 AND rolle IN ('admin','mitarbeiter')",[id]))fail('Zuständiger Mitarbeiter nicht verfügbar.');}
 async function log(tx,id,owner,aktion,vorher,nachher){await tx.run('INSERT INTO fach_verlauf(vorgang_id,benutzer_id,aktion,vorher,nachher) VALUES(?,?,?,?,?)',[id,owner,aktion,vorher?json(vorher):null,json(nachher)]);}
 async function references(tx,id,refs){
  await tx.run("DELETE FROM fach_bezuege WHERE vorgang_id=? AND ziel_id IS NULL",[id]);
  for(const r of refs)await tx.run('INSERT OR IGNORE INTO fach_bezuege(vorgang_id,typ,remote_id,hp_nummer,objekt_nummer,name) VALUES(?,?,?,?,?,?)',[id,r.typ,r.remote_id,r.hp_nummer,r.objekt_nummer,r.name]);
 }
 async function localRef(tx,id,ref,owner){
  if(!ref)return;
  if(ARTEN.includes(ref.typ)){const target=await own(tx,owner,Number(ref.id));if(target.art!==ref.typ)fail('Die Vorgangsart passt nicht zur Zuordnung.');await tx.run('INSERT OR IGNORE INTO fach_bezuege(vorgang_id,typ,ziel_id,name) VALUES(?,?,?,?)',[id,ref.typ,target.id,target.titel]);return;}
  const tables={adresse:'adressen',objekt:'objekte',einheit:'einheiten'};
  if(!Object.hasOwn(tables,ref.typ)||!Number.isSafeInteger(Number(ref.id))||Number(ref.id)<1)fail('Ungültige Zuordnung.');
  const row=await tx.get('SELECT * FROM '+tables[ref.typ]+' WHERE id=?',[ref.id]);if(!row)fail('Ziel der Zuordnung nicht gefunden.',404);
  const name=row.bezeichnung||row.firmenname||[row.vorname,row.nachname].filter(Boolean).join(' ')||row.nummer;
  await tx.run('INSERT OR IGNORE INTO fach_bezuege(vorgang_id,typ,ziel_id,name) VALUES(?,?,?,?)',[id,ref.typ,row.id,name]);
 }
 async function create(owner,b){
  const r=input(b);return db.transaktion(async tx=>{await user(tx,r.zustaendig_id);
   const auftrag=r.art==='handwerker'&&b.auftrag!==undefined?await hwa.prepare(tx,owner,b.auftrag):null;
   if(auftrag&&r.status==='beauftragt'&&(!auftrag.handwerker_id||!auftrag.objekt_id))fail('Für einen erteilten Auftrag bitte Handwerker und Objekt auswählen.');
   const result=await tx.run(`INSERT INTO fach_vorgaenge(benutzer_id,art,titel,text,status,prioritaet,faellig_am,uhrzeit,zustaendig_id,quelle_status) VALUES(?,?,?,?,?,?,?,?,?,'lokal')`,[owner,r.art,...FELDER.map(k=>r[k]),r.zustaendig_id]);
   if(auftrag)await hwa.save(tx,result.lastID,auftrag);
   await localRef(tx,result.lastID,b.kontext,owner);await log(tx,result.lastID,owner,'angelegt',null,{...r,...(auftrag?{auftrag}:{})});return {id:result.lastID};});
 }
 async function update(owner,id,b){
  const r=input(b);if(!Number.isSafeInteger(b.revision))fail('Die aktuelle Vorgangsversion fehlt.',409);
  return db.transaktion(async tx=>{const old=await own(tx,owner,id);if(old.revision!==b.revision)fail('Der Vorgang wurde inzwischen geändert. Bitte neu laden.',409);if(old.art!==r.art)fail('Die Vorgangsart kann nicht geändert werden.');if(old.benutzer_id!==owner&&old.zustaendig_id!==r.zustaendig_id)fail('Nur der Ersteller kann die Zuständigkeit ändern.',403);await user(tx,r.zustaendig_id);
   const auftrag=r.art==='handwerker'&&b.auftrag!==undefined?await hwa.prepare(tx,owner,b.auftrag):null;
   if(auftrag&&r.status==='beauftragt'&&(!auftrag.handwerker_id||!auftrag.objekt_id))fail('Für einen erteilten Auftrag bitte Handwerker und Objekt auswählen.');
   const oldAuftrag=(await tx.get('SELECT daten FROM handwerkerauftraege WHERE vorgang_id=?',[id]))?.daten||null;
   if(auftrag)await hwa.save(tx,id,auftrag);
   await tx.run(`UPDATE fach_vorgaenge SET ${FELDER.map(k=>k+'=?').join(',')},zustaendig_id=?,revision=revision+1,geaendert_am=datetime('now'),quelle_status=CASE WHEN quelle_status='konflikt' THEN 'konflikt' WHEN quelle_id IS NULL THEN 'lokal' ELSE 'lokal_geaendert' END WHERE id=?`,[...FELDER.map(k=>r[k]),r.zustaendig_id,id]);
   await log(tx,id,owner,'bearbeitet',{...pick(old),auftrag:oldAuftrag},{...r,...(auftrag?{auftrag}:{})});return {id};});
 }
 async function importOne(owner,source,resource,data){
  const art=BEREICHE[resource];if(!art)fail('Unbekannter Importbereich.');
  return db.transaktion(async tx=>{
   const old=await tx.get('SELECT * FROM fach_vorgaenge WHERE quelle_id=? AND remote_art=? AND remote_id=?',[source.id,resource,data.remote_id]);
   const incoming=pick(data.werte),snapshot=json(data.snapshot),hash=sourceHash(data);
   if(old&&old.remote_hash===hash)return {id:old.id,unveraendert:true};
   let id;
   if(!old){
    const result=await tx.run(`INSERT INTO fach_vorgaenge(benutzer_id,quelle_id,remote_art,remote_id,hp_nummer,art,${FELDER.join(',')},basis,remote_snapshot,remote_hash,quelle_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'uebernommen')`,[owner,source.id,resource,data.remote_id,data.hp_nummer,art,...FELDER.map(k=>incoming[k]),json(incoming),snapshot,hash]);
    id=result.lastID;await log(tx,id,owner,'aus_hp_uebernommen',null,incoming);await references(tx,id,data.bezuege);
   }else{
    id=old.id;const basis=JSON.parse(old.basis),merged=pick(old),conflicts=[];
    for(const k of FELDER){const localChanged=old[k]!==basis[k],remoteChanged=incoming[k]!==basis[k];if(localChanged&&remoteChanged&&old[k]!==incoming[k])conflicts.push(k);else if(remoteChanged)merged[k]=incoming[k];}
    if(conflicts.length||old.quelle_status==='konflikt'){
     await tx.run("UPDATE fach_vorgaenge SET incoming=?,quelle_status='konflikt',revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[json(data),id]);
     await log(tx,id,owner,'hp_konflikt',pick(old),{felder:conflicts});
    }else{
     await tx.run(`UPDATE fach_vorgaenge SET ${FELDER.map(k=>k+'=?').join(',')},basis=?,remote_snapshot=?,remote_hash=?,hp_nummer=?,revision=revision+1,geaendert_am=datetime('now'),quelle_status=? WHERE id=?`,[...FELDER.map(k=>merged[k]),json(incoming),snapshot,hash,data.hp_nummer,FELDER.some(k=>merged[k]!==incoming[k])?'lokal_geaendert':'uebernommen',id]);
     await references(tx,id,data.bezuege);await log(tx,id,owner,'hp_abgleich',pick(old),merged);
    }
   }
   return {id};
  });
 }
 const joins=`LEFT JOIN hp_adress_zuordnung am ON am.verbindung_id=s.direkt_id AND b.typ='adresse' AND am.hp_nummer=b.hp_nummer
 LEFT JOIN hp_objekt_zuordnung om ON om.verbindung_id=s.direkt_id AND b.typ='objekt' AND om.hp_objnr=b.hp_nummer
 LEFT JOIN hp_einheit_zuordnung em ON em.verbindung_id=s.direkt_id AND b.typ='einheit' AND em.hp_objnr=b.objekt_nummer AND em.hp_whgnr=b.hp_nummer`;
 async function list(owner,q={}){
  const page=q.seite===undefined?1:Number(q.seite);if(!Number.isSafeInteger(page)||page<1||page>1000000)fail('Ungültige Seitenauswahl.');
  const args=[owner,owner];let where='(v.benutzer_id=? OR v.zustaendig_id=?)';
  if(q.art){if(!ARTEN.includes(q.art))fail('Unbekannte Vorgangsart.');where+=' AND v.art=?';args.push(q.art);}
  if(q.status){if(q.status==='aktiv')where+=" AND v.status NOT IN ('erledigt','storniert')";else if(STATUS.includes(q.status)){where+=' AND v.status=?';args.push(q.status);}else fail('Unbekannter Status.');}
  if(q.suche){if(typeof q.suche!=='string'||q.suche.length>200)fail('Ungültige Suche.');where+=' AND (v.titel LIKE ? OR v.text LIKE ? OR v.hp_nummer LIKE ?)';args.push(...Array(3).fill('%'+q.suche+'%'));}
  if(q.faellig==='1'){where+=" AND v.faellig_am<=? AND v.status NOT IN ('erledigt','storniert')";args.push(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));}
  if(q.typ||q.ziel){if(!['adresse','objekt','einheit'].includes(q.typ)||!Number.isSafeInteger(Number(q.ziel))||Number(q.ziel)<1)fail('Ungültiger Kontext.');
   const match=q.typ==='adresse'?"b.typ='adresse' AND COALESCE(b.ziel_id,am.adresse_id)=?":q.typ==='einheit'?"b.typ='einheit' AND COALESCE(b.ziel_id,em.einheit_id)=?":"(b.typ='objekt' AND COALESCE(b.ziel_id,om.objekt_id)=?) OR (b.typ='einheit' AND EXISTS(SELECT 1 FROM einheiten le WHERE le.id=COALESCE(b.ziel_id,em.einheit_id) AND le.objekt_id=?))";
   const ownMatch=q.typ==='adresse'?"json_extract(h.daten,'$.handwerker_id')=? OR EXISTS(SELECT 1 FROM json_each(h.daten,'$.adressaten') a WHERE json_extract(a.value,'$.adresse_id')=?)":q.typ==='einheit'?"json_extract(h.daten,'$.einheit_id')=?":"json_extract(h.daten,'$.objekt_id')=?";
   where+=` AND (EXISTS(SELECT 1 FROM fach_bezuege b ${joins} WHERE b.vorgang_id=v.id AND (${match})) OR EXISTS(SELECT 1 FROM handwerkerauftraege h WHERE h.vorgang_id=v.id AND (${ownMatch})))`;args.push(Number(q.ziel));if(q.typ==='objekt')args.push(Number(q.ziel));args.push(Number(q.ziel));if(q.typ==='adresse')args.push(Number(q.ziel));
  }
  const from=' FROM fach_vorgaenge v LEFT JOIN hp_dms_quellen s ON s.id=v.quelle_id';
  const count=await db.get('SELECT COUNT(*) AS anzahl'+from+' WHERE '+where,args);
  const size=q._timeline===true?1000:50;
  const extra=q._timeline===true?',v.text,v.erstellt_am,v.geaendert_am,v.remote_snapshot':'';
  const rows=await db.all('SELECT v.id,v.art,v.titel,v.status,v.prioritaet,v.faellig_am,v.uhrzeit,v.hp_nummer,v.quelle_status,v.revision,v.zustaendig_id,u.name AS zustaendig'+extra+from+' LEFT JOIN benutzer u ON u.id=v.zustaendig_id WHERE '+where+(q._timeline===true?' ORDER BY v.geaendert_am DESC,v.id DESC':' ORDER BY v.faellig_am IS NULL,v.faellig_am,v.id DESC')+' LIMIT '+size+' OFFSET ?',[...args,(page-1)*size]);
  return {eintraege:rows,gesamt:count.anzahl,seite:page,weitere:page*size<count.anzahl};
 }
 async function detail(owner,id){
  const r=await own(db,owner,id),s=r.quelle_id?await db.get('SELECT direkt_id,subdomain FROM hp_dms_quellen WHERE id=?',[r.quelle_id]):null;
  const refs=await db.all('SELECT * FROM fach_bezuege WHERE vorgang_id=?',[id]);
  for(const b of refs){
   let m;if(!b.ziel_id&&s?.direkt_id){
    if(b.typ==='adresse')m=await db.get('SELECT adresse_id AS id FROM hp_adress_zuordnung WHERE verbindung_id=? AND hp_nummer=?',[s.direkt_id,b.hp_nummer]);
    if(b.typ==='objekt')m=await db.get('SELECT objekt_id AS id FROM hp_objekt_zuordnung WHERE verbindung_id=? AND hp_objnr=?',[s.direkt_id,b.hp_nummer]);
    if(b.typ==='einheit')m=await db.get('SELECT einheit_id AS id FROM hp_einheit_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND hp_whgnr=?',[s.direkt_id,b.objekt_nummer,b.hp_nummer]);
   }
   b.ziel_id=b.ziel_id||m?.id||null;
   if(ARTEN.includes(b.typ)&&b.ziel_id){const other=await db.get('SELECT id FROM fach_vorgaenge WHERE id=? AND (benutzer_id=? OR zustaendig_id=?)',[b.ziel_id,owner,owner]);b.fach_id=other?.id||null;}
   else if(ARTEN.includes(b.typ)){const module=Object.keys(BEREICHE).find(k=>BEREICHE[k]===b.typ);const other=await db.get('SELECT id FROM fach_vorgaenge WHERE (benutzer_id=? OR zustaendig_id=?) AND quelle_id=? AND remote_art=? AND remote_id=?',[owner,owner,r.quelle_id,module,b.remote_id]);b.fach_id=other?.id||null;}
  }
  const history=await db.all('SELECT h.id,h.aktion,h.erstellt_am,u.name AS benutzer,h.vorher,h.nachher FROM fach_verlauf h LEFT JOIN benutzer u ON u.id=h.benutzer_id WHERE vorgang_id=? ORDER BY h.id DESC LIMIT 100',[id]);
  const auftrag=r.art==='handwerker'?await hwa.load(db,{...r,remote_snapshot:r.remote_snapshot?JSON.parse(r.remote_snapshot):null,bezuege:refs}):undefined;
  const rechnungen=r.art==='handwerker'?await hwa.invoices(db,owner,id):undefined;
  const sb=r.zustaendig_id?await db.get('SELECT name,kuerzel FROM benutzer WHERE id=?',[r.zustaendig_id]):null;
  return {...r,auftrag,rechnungen,auftrag_sb_name:sb?[sb.kuerzel,sb.name].filter(Boolean).join(' · '):null,basis:undefined,remote_hash:undefined,remote_snapshot:r.remote_snapshot?JSON.parse(r.remote_snapshot):null,incoming:r.incoming?JSON.parse(r.incoming):null,bezuege:refs,verlauf:history,subdomain:s?.subdomain||null};
 }
 async function resolve(owner,id,b){
  if(!['lokal','hp'].includes(b.fassung))fail('Bitte eine Fassung auswählen.');
  return db.transaktion(async tx=>{const old=await own(tx,owner,id);if(old.revision!==b.revision)fail('Vorgang inzwischen geändert.',409);if(!old.incoming)fail('Kein offener Konflikt.');const data=JSON.parse(old.incoming),next=b.fassung==='hp'?pick(data.werte):pick(old),snapshot=json(data.snapshot);
   await tx.run(`UPDATE fach_vorgaenge SET ${FELDER.map(k=>k+'=?').join(',')},basis=?,remote_snapshot=?,remote_hash=?,incoming=NULL,quelle_status=?,revision=revision+1,geaendert_am=datetime('now') WHERE id=?`,[...FELDER.map(k=>next[k]),json(pick(data.werte)),snapshot,sourceHash(data),b.fassung==='hp'?'uebernommen':'lokal_geaendert',id]);
   await references(tx,id,data.bezuege);await log(tx,id,owner,'konflikt_'+b.fassung,pick(old),next);return {id};});
 }
 async function addRef(owner,id,b){return db.transaktion(async tx=>{const r=await own(tx,owner,id);if(r.revision!==b.revision)fail('Vorgang inzwischen geändert.',409);await localRef(tx,id,b,owner);await tx.run("UPDATE fach_vorgaenge SET revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[id]);await log(tx,id,owner,'zugeordnet',null,{typ:b.typ,id:b.id});return {id};});}
 async function comment(owner,id,b){if(typeof b.text!=='string'||!b.text.trim()||b.text.length>10000)fail('Bitte einen Vermerk mit höchstens 10.000 Zeichen eingeben.');return db.transaktion(async tx=>{await own(tx,owner,id);await log(tx,id,owner,'vermerk',null,{text:b.text.trim()});return {ok:true};});}
 async function overview(owner){
  const counts=await db.all('SELECT art,COUNT(*) AS gesamt,SUM(status NOT IN (\'erledigt\',\'storniert\')) AS offen,SUM(quelle_status=\'konflikt\') AS konflikte FROM fach_vorgaenge WHERE benutzer_id=? OR zustaendig_id=? GROUP BY art',[owner,owner]);
  const sources=await db.all('SELECT s.id,s.subdomain,c.id AS verbindung_id FROM hp_dms_quellen s LEFT JOIN hp_mobile_verbindungen c ON c.benutzer_id=s.benutzer_id AND c.subdomain=s.subdomain WHERE s.benutzer_id=?',[owner]);
  const jobs=await db.all('SELECT j.* FROM fach_import_jobs j JOIN hp_dms_quellen s ON s.id=j.quelle_id WHERE s.benutzer_id=?',[owner]);
  for(const j of jobs){if(j.status==='laeuft'&&!active.has(j.quelle_id)){j.status='angehalten';j.meldung='Nach Serverneustart fortsetzen.';await db.run("UPDATE fach_import_jobs SET status='angehalten',meldung=? WHERE quelle_id=?",[j.meldung,j.quelle_id]);}j.fehler=(await db.get('SELECT COUNT(*) AS n FROM fach_import_fehler WHERE quelle_id=?',[j.quelle_id])).n;}
  const errors=await db.all('SELECT f.* FROM fach_import_fehler f JOIN hp_dms_quellen s ON s.id=f.quelle_id WHERE s.benutzer_id=? LIMIT 100',[owner]);
  return {bereiche:counts,quellen:sources,auftraege:jobs,fehler:errors};
 }
 async function run(owner,connection,source){
  try{let job=await db.get('SELECT * FROM fach_import_jobs WHERE quelle_id=?',[source.id]);const resources=Object.keys(BEREICHE);
   for(let ri=resources.indexOf(job.resource);ri<resources.length;ri++){
    const resource=resources[ri];if(resource!==job.resource){job={...job,resource,seite:1,position:0};await db.run('UPDATE fach_import_jobs SET resource=?,seite=1,position=0 WHERE quelle_id=?',[resource,source.id]);}
    for(;;){if((await db.get('SELECT status FROM fach_import_jobs WHERE quelle_id=?',[source.id])).status!=='laeuft')return;
     const page=await hp.fachListe(owner,connection,resource,job.seite);
     for(let i=job.position;i<page.eintraege.length;i++){
      if((await db.get('SELECT status FROM fach_import_jobs WHERE quelle_id=?',[source.id])).status!=='laeuft')return;
      const id=page.eintraege[i].id;
      try{const data=await hp.fachDetails(owner,connection,resource,id);await importOne(owner,source,resource,data);
       if(data.unvollstaendig?.length)throw new HpMobileError('HP liefert noch nicht alle Zuordnungen: '+data.unvollstaendig.join(', '),422);
       await db.run('DELETE FROM fach_import_fehler WHERE quelle_id=? AND resource=? AND remote_id=?',[source.id,resource,id]);
      }catch(e){if(!(e instanceof HpMobileError)||[401,403,429,507].includes(e.status))throw e;await db.run('INSERT OR REPLACE INTO fach_import_fehler(quelle_id,resource,remote_id,meldung) VALUES(?,?,?,?)',[source.id,resource,id,e.message]);}
      await db.run('UPDATE fach_import_jobs SET position=? WHERE quelle_id=?',[i+1,source.id]);
     }
     if(!page.weitere)break;job.seite++;job.position=0;await db.run('UPDATE fach_import_jobs SET seite=?,position=0 WHERE quelle_id=?',[job.seite,source.id]);
    }
   }
   await db.run("UPDATE fach_import_jobs SET status='fertig',meldung='Durchlauf abgeschlossen. Fehler und Konflikte separat prüfen.' WHERE quelle_id=?",[source.id]);
  }catch(e){await db.run("UPDATE fach_import_jobs SET status='angehalten',meldung=? WHERE quelle_id=?",[e instanceof HpMobileError?e.message:'Übernahme unterbrochen. Bitte erneut starten.',source.id]).catch(()=>{});}finally{active.delete(source.id);}
 }
 async function start(owner,connection){
  const source=await archiv.source(owner,connection);if(!active.has(source.id)){
   active.set(source.id,true);try{const old=await db.get('SELECT * FROM fach_import_jobs WHERE quelle_id=?',[source.id]),resume=old&&old.status!=='fertig';
    await db.run(`INSERT INTO fach_import_jobs(quelle_id,verbindung_id,resource,seite,position,status) VALUES(?,?,?,?,?,'laeuft') ON CONFLICT(quelle_id) DO UPDATE SET verbindung_id=excluded.verbindung_id,resource=excluded.resource,seite=excluded.seite,position=excluded.position,status='laeuft',meldung=NULL`,[source.id,connection,resume?old.resource:'cis',resume?old.seite:1,resume?old.position:0]);
    run(owner,connection,source);
   }catch(e){active.delete(source.id);throw e;}
  }return overview(owner);
 }
 async function stop(owner,source){if(!await db.get('SELECT id FROM hp_dms_quellen WHERE id=? AND benutzer_id=?',[source,owner]))fail('Quelle nicht gefunden.',404);await db.run("UPDATE fach_import_jobs SET status='angehalten',meldung='Manuell angehalten.' WHERE quelle_id=?",[source]);return overview(owner);}
 async function calendar(owner,month){
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1000||Number(month.slice(0,4))>9998)fail('Ungültiger Kalendermonat.');
  const start=month+'-01',end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,10);
  const rows=await db.all("SELECT id,titel,art,faellig_am,uhrzeit,status FROM fach_vorgaenge WHERE (benutzer_id=? OR zustaendig_id=?) AND faellig_am>=? AND faellig_am<? AND status NOT IN ('erledigt','storniert') ORDER BY faellig_am,uhrzeit,id LIMIT 1001",[owner,owner,start,end]);
  const legacy=await db.all('SELECT id,adresse_id,betreff AS titel,faellig_am FROM wiedervorlagen WHERE erledigt=0 AND faellig_am>=? AND faellig_am<? ORDER BY faellig_am,id LIMIT 1001',[start,end]);
  const all=[...rows.map(r=>({...r,vorgang_id:r.id})),...legacy.map(r=>({...r,art:'wiedervorlage'}))].sort((a,b)=>a.faellig_am.localeCompare(b.faellig_am)||String(a.uhrzeit||'').localeCompare(String(b.uhrzeit||'')));
  return {monat:month,eintraege:all.slice(0,1000),mehr:all.length>1000};
 }
 async function document(owner,id,fileId) {
  const r=await own(db,owner,id);if(!r.quelle_id||!await db.get("SELECT 1 FROM fach_bezuege WHERE vorgang_id=? AND typ='dokument' AND remote_id=?",[r.id,fileId]))fail('Dokument nicht zugeordnet.',404);
  return archiv.localFile(r.benutzer_id,r.quelle_id,fileId);
 }
 async function timeline(owner,typ,ziel,suche='') {
  const result=await list(owner,{typ,ziel,suche,_timeline:true});
  return result.eintraege.map(v=>{const source=v.remote_snapshot?JSON.parse(v.remote_snapshot):{},date=source.date||source.created_hp||source.created||v.erstellt_am;
    return {quelle:'vorgang',id:v.id,zeitpunkt:String(date).replace(' ','T'),art:({akte:'AKT',handwerker:'HWA',wiedervorlage:'WV',zis:'ZIS',notiz:'NOT'})[v.art],text:v.titel,notiz:v.text,intern:!!source.is_internal,sb_name:v.zustaendig};});
 }
 async function due(owner){return (await list(owner,{art:'wiedervorlage',faellig:'1'})).eintraege.map(v=>({id:'fach-'+v.id,vorgang_id:v.id,faellig_am:v.faellig_am,betreff:v.titel,name:v.zustaendig||'CuraAed'}));}
 async function attach(owner,id,b){return db.transaktion(async tx=>{const r=await own(tx,owner,id);if(r.art!=='handwerker')fail('Kein Handwerkerauftrag.');if(r.revision!==b.revision)fail('Auftrag inzwischen geändert. Bitte neu laden.',409);if(!Number.isSafeInteger(b.dokument_id)||!await tx.get('SELECT id FROM dokumente WHERE id=?',[b.dokument_id]))fail('Archivdokument nicht gefunden.');await tx.run('INSERT OR IGNORE INTO handwerker_dokumente(vorgang_id,dokument_id) VALUES(?,?)',[id,b.dokument_id]);await tx.run("UPDATE fach_vorgaenge SET revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[id]);await log(tx,id,owner,'dokument_zugeordnet',null,{dokument_id:b.dokument_id});return {id};});}
 return {attach,create,update,list,detail,resolve,addRef,comment,overview,start,stop,due,timeline,calendar,document,importOne};
}
module.exports={baueVorgaenge,input,ARTEN,STATUS};
