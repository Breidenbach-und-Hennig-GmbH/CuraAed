'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation');
const queues=new WeakMap(),digest=b=>crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
const fail=s=>{throw new ValidationError(s,409);};
function serial(db,id,fn){let q=queues.get(db);if(!q){q=new Map();queues.set(db,q);}const p=(q.get(id)||Promise.resolve()).then(fn,fn);q.set(id,p.catch(()=>{}));return p;}
function termin(v,dauer){
 const start=require('./m365-kalender').berlin(v.datum+'T'+v.uhrzeit),end=new Date(start.valueOf()+dauer*60000);
 const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 return{titel:(v.name+' · Objekt '+v.objekt_nummer).slice(0,255),beginn:fmt.format(start).replace(' ','T'),ende:fmt.format(end).replace(' ','T'),ganztag:false,ort:[v.ort,v.ort_strasse,[v.ort_plz,v.ort_stadt].filter(Boolean).join(' ')].filter(Boolean).join(', ').slice(0,255),beschreibung:['Eigentümerversammlung',v.objekt_nummer+' · '+v.objekt_bezeichnung,'Versammlungsleitung: '+v.leitung_name,v.ort_beschreibung,v.teams_url?'Teams: '+v.teams_url:''].filter(Boolean).join('\n')};
}
function baue(db,m365){
 const lesen=id=>require('./versammlungen').holen(db,id);
 async function abgleich(row,body,stilllegen=false){
  const identity=await m365.kalender.etvIdentitaet(row.benutzer_id,row.quelle);
  if(row.identitaet&&row.identitaet!==identity)fail('Das verbundene Microsoft-Konto wurde gewechselt. Vorhandenen ETV-Termin bitte prüfen; es wurde kein weiterer Termin angelegt.');
  if(!row.identitaet){await db.run('UPDATE etv_kalender_termine SET identitaet=? WHERE id=?',[identity,row.id]);row.identitaet=identity;}
  // A failed POST is retried with exactly the original payload and transactionId, even after an ETV edit.
  if(!row.event_id){
   if(!row.anfrage){row.anfrage=JSON.stringify(body);await db.run('UPDATE etv_kalender_termine SET anfrage=? WHERE id=?',[row.anfrage,row.id]);}
   const initial=JSON.parse(row.anfrage),r=await m365.kalender.etvSchreiben(row.benutzer_id,row.quelle,{identitaet:identity,transaction_id:row.transaction_id,body:initial});
   row.event_id=r.id;row.basis_hash=digest({body:initial,stilllegen:false});
   await db.run('UPDATE etv_kalender_termine SET event_id=?,basis_hash=? WHERE id=?',[row.event_id,row.basis_hash,row.id]);
  }
  const hash=digest({body,stilllegen});
  if(row.basis_hash!==hash){await m365.kalender.etvSchreiben(row.benutzer_id,row.quelle,{identitaet:identity,event_id:row.event_id,body,stilllegen});await db.run('UPDATE etv_kalender_termine SET basis_hash=? WHERE id=?',[hash,row.id]);}
  await db.run('UPDATE etv_kalender_termine SET stillgelegt=?,anfrage=? WHERE id=?',[stilllegen?1:0,JSON.stringify(body),row.id]);
 }
 async function run(id,b={}){
  let v=await lesen(id);if(!v)fail('Versammlung nicht gefunden.');
  await db.run('INSERT OR IGNORE INTO etv_kalender(versammlung_id) VALUES(?)',[id]);
  try{
   const old=await db.get('SELECT * FROM etv_kalender WHERE versammlung_id=?',[id]);
   let firma=Number(b.m365_firma_id||old.firma_id||v.m365_firma_id);
   if(!firma){const all=await db.all('SELECT id FROM firmenbriefkoepfe');if(all.length===1)firma=all[0].id;else fail('Für die Kalendereinträge bitte eine Verwaltung wählen.');}
   if(!Number.isSafeInteger(firma)||!await db.get('SELECT id FROM firmenbriefkoepfe WHERE id=?',[firma]))fail('Verwaltung für den Firmenkalender nicht gefunden.');
   const dauer=Number(b.teams_dauer??old.dauer);if(!Number.isSafeInteger(dauer)||dauer<15||dauer>1440)fail('Die geplante Dauer muss zwischen 15 und 1440 Minuten liegen.');
   await db.run("UPDATE etv_kalender SET firma_id=?,dauer=?,status='ausstehend',meldung='' WHERE versammlung_id=?",[firma,dauer,id]);
   if(!v.uhrzeit)fail('Für die Kalendereinträge bitte die Uhrzeit ergänzen.');
   const body=termin(v,dauer),targets=[{key:'firma:'+firma,quelle:'firma:'+firma,uid:v.leitung_id,label:'Firmenkalender'},{key:'benutzer:'+v.leitung_id,quelle:'persoenlich',uid:v.leitung_id,label:'Kalender der Versammlungsleitung'}],errors=[];
   const rows=await db.all('SELECT * FROM etv_kalender_termine WHERE versammlung_id=?',[id]);
   for(const row of rows.filter(r=>!targets.some(t=>t.key===r.ziel)&&!r.stillgelegt))try{
    const initial=JSON.parse(row.anfrage||JSON.stringify(body));await abgleich(row,{...initial,titel:('ENTFÄLLT · '+initial.titel).slice(0,255),beschreibung:'Die Zuordnung dieser Versammlung wurde geändert. Dieser frühere Kalendereintrag entfällt.'},true);
   }catch(e){errors.push('Bisheriger Kalendereintrag: '+meldung(e));}
   for(const t of targets)try{
    await db.run('INSERT OR IGNORE INTO etv_kalender_termine(versammlung_id,ziel,quelle,benutzer_id,transaction_id) VALUES(?,?,?,?,?)',[id,t.key,t.quelle,t.uid,crypto.randomUUID()]);
    await abgleich(await db.get('SELECT * FROM etv_kalender_termine WHERE versammlung_id=? AND ziel=?',[id,t.key]),body);
   }catch(e){errors.push(t.label+': '+meldung(e));}
   const latest=await lesen(id);if(JSON.stringify(termin(latest,dauer))!==JSON.stringify(body)||latest.leitung_id!==v.leitung_id)errors.push('Basisdaten inzwischen geändert. Bitte Kalender erneut abgleichen.');
   await db.run('UPDATE etv_kalender SET status=?,meldung=? WHERE versammlung_id=?',[errors.length?'fehler':'bereit',errors.join(' · '),id]);
  }catch(e){await db.run("UPDATE etv_kalender SET status='fehler',meldung=? WHERE versammlung_id=?",[meldung(e),id]);}
  return lesen(id);
 }
 const meldung=e=>e instanceof ValidationError?e.message:'Microsoft-Kalender derzeit nicht erreichbar. Bitte Kalender erneut abgleichen.';
 const synchronisieren=(id,b)=>serial(db,Number(id),()=>run(Number(id),b));
 async function nachholen(uid){const rows=await db.all("SELECT v.id FROM versammlungen v JOIN etv_kalender k ON k.versammlung_id=v.id WHERE v.archiviert=0 AND k.status!='bereit' AND (? IS NULL OR v.leitung_id=?) ORDER BY v.datum DESC LIMIT 20",[uid??null,uid??null]);for(const r of rows)await synchronisieren(r.id);}
 return{synchronisieren,nachholen};
}
module.exports={baue,termin};
