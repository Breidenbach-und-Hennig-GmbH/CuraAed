'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation');
const fail=s=>{throw new ValidationError(s,409);},queues=new WeakMap();
function beginn(datum,uhrzeit){
 if(!datum||!uhrzeit)fail('Für Teams bitte Datum und Uhrzeit der Versammlung ergänzen.');
 const wanted=datum+' '+uhrzeit,fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const candidates=[1,2].map(h=>new Date(Date.parse(datum+'T'+uhrzeit+':00Z')-h*3600000)).filter(d=>Number.isFinite(d.valueOf())&&fmt.format(d)===wanted);
 if(candidates.length!==1)fail('Der Versammlungsbeginn liegt in einer Zeitumstellung. Bitte eine eindeutige Uhrzeit wählen.');
 return candidates[0];
}
function baue(db,m365){
 async function lesen(id){const v=await require('./versammlungen').holen(db,id);if(!v)fail('Versammlung nicht gefunden.');return v;}
 async function run(id,b={}){
  let v=await lesen(id);if(v.art==='praesenz')return v;
  let old=await db.get('SELECT * FROM etv_teams WHERE versammlung_id=?',[id]);
  if(!old){await db.run('INSERT OR IGNORE INTO etv_teams(versammlung_id,external_id) VALUES(?,?)',[id,crypto.randomUUID()]);old=await db.get('SELECT * FROM etv_teams WHERE versammlung_id=?',[id]);}
  try{
   let firma=b.m365_firma_id===undefined?old.firma_id:Number(b.m365_firma_id);
   if(!firma){const all=await db.all('SELECT id FROM firmenbriefkoepfe');if(all.length===1)firma=all[0].id;else fail('Für die Teams-Besprechung bitte eine Verwaltung wählen.');}
   if(!Number.isSafeInteger(firma)||!await db.get('SELECT id FROM firmenbriefkoepfe WHERE id=?',[firma]))fail('Verwaltung für Teams nicht gefunden.');
   if(old.meeting_id&&old.firma_id!==firma)fail('Die Verwaltung einer bestehenden Teams-Besprechung kann nicht gewechselt werden.');
   const dauer=Number(b.teams_dauer??old.dauer);if(!Number.isSafeInteger(dauer)||dauer<15||dauer>1440)fail('Die geplante Dauer muss zwischen 15 und 1440 Minuten liegen.');
   await db.run('UPDATE etv_teams SET firma_id=?,dauer=? WHERE versammlung_id=?',[firma,dauer,id]);
   const start=beginn(v.datum,v.uhrzeit),body={subject:v.name+' · Objekt '+v.objekt_nummer,startDateTime:start.toISOString(),endDateTime:new Date(start.valueOf()+dauer*60000).toISOString(),externalId:old.external_id};
   const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
   if(old.status==='bereit'&&old.basis_hash===hash&&old.firma_id===firma)return lesen(id);
   await db.run("UPDATE etv_teams SET status='ausstehend',meldung='' WHERE versammlung_id=?",[id]);
   let result=await m365.teamsBesprechung(firma,body,old);
   if(!old.meeting_id){await db.run('UPDATE etv_teams SET meeting_id=?,join_url=?,organizer=? WHERE versammlung_id=?',[result.meeting_id,result.join_url,result.organizer,id]);result=await m365.teamsBesprechung(firma,body,result);}
   const latest=await lesen(id),stillCurrent=['name','objekt_nummer','datum','uhrzeit','art'].every(k=>latest[k]===v[k]);
   // Preserve the remote identity even if the local meeting was edited during the network request.
   await db.run("UPDATE etv_teams SET meeting_id=?,join_url=?,organizer=?,basis_hash=?,status=?,meldung=?,geaendert_am=CURRENT_TIMESTAMP WHERE versammlung_id=?",[result.meeting_id,result.join_url,result.organizer,hash,stillCurrent?'bereit':'ausstehend',stillCurrent?'':'Basisdaten inzwischen geändert. Bitte erneut speichern.',id]);
  }catch(e){await db.run("UPDATE etv_teams SET status='fehler',meldung=?,geaendert_am=CURRENT_TIMESTAMP WHERE versammlung_id=?",[e instanceof ValidationError?e.message:'Teams ist derzeit nicht erreichbar. Die Versammlung wurde gespeichert; bitte die Erstellung erneut versuchen.',id]);}
  return lesen(id);
 }
 function synchronisieren(id,b){
  let map=queues.get(db);if(!map){map=new Map();queues.set(db,map);}const key=Number(id),next=(map.get(key)||Promise.resolve()).then(()=>run(key,b),()=>run(key,b));map.set(key,next);
  return next.finally(()=>{if(map.get(key)===next)map.delete(key);});
 }
 return{synchronisieren};
}
module.exports={baue,beginn};
