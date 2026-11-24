'use strict';
const crypto=require('node:crypto'),A=require('./abstimmungen'),T=require('./teilnehmer'),{ValidationError}=require('../lib/validation');
const fail=(s,n=400)=>{throw new ValidationError(s,n);},hash=s=>crypto.createHash('sha256').update(s).digest('hex'),stamp=()=>new Date().toISOString();
const text=(s,max)=>{if(typeof s!=='string'||s.length>max)fail('Ungültige Angabe.');return s.trim();};
const present=d=>d&&['selbst','vollmacht'].includes(d.teilnahme)&&!d.zugang_gesperrt;
function teams(s){s=text(s||'',2500);if(!s)return '';let u;try{u=new URL(s);}catch{fail('Bitte einen gültigen Teams-Besprechungslink eintragen.');}
 if(u.protocol!=='https:'||u.username||u.password||!['teams.microsoft.com','teams.live.com','teams.cloud.microsoft'].includes(u.hostname)||u.port)fail('Bitte einen HTTPS-Besprechungslink von Microsoft Teams verwenden.');return u.href;
}
async function canLead(db,id,user){const r=await db.get('SELECT v.leitung_id,b.rolle,b.aktiv FROM versammlungen v JOIN benutzer b ON b.id=? WHERE v.id=?',[user,id]);return !!r&&!!r.aktiv&&(r.rolle==='admin'||Number(r.leitung_id)===Number(user));}
async function requireLead(db,id,user){if(!await canLead(db,id,user))fail('Nur die zugeordnete Versammlungsleitung oder Administration darf diese Durchführung steuern.',403);}
async function room(db,id,active=false){let r=await db.get('SELECT * FROM etv_live WHERE versammlung_id=?',[id]);const auto=await db.get("SELECT t.join_url,t.status,v.art FROM etv_teams t JOIN versammlungen v ON v.id=t.versammlung_id WHERE t.versammlung_id=?",[id]);if(auto&&auto.art!=='praesenz'){r={revision:0,aktiv:false,generation:0,ablauf_am:'',raum_token:null,...r,teams_url:auto.status==='bereit'?auto.join_url:'',teams_auto:true};}if(active&&(!r||!r.aktiv||r.ablauf_am<=stamp()))fail('Der Zugang zur Versammlung ist geschlossen oder abgelaufen.',410);return r;}
async function audit(db,id,action,data={},user=null,guest=null,runde=null){await db.run('INSERT INTO etv_live_audit(versammlung_id,runde_id,aktion,daten,zeit,benutzer_id,anfrage_id) VALUES(?,?,?,?,?,?,?)',[id,runde,action,JSON.stringify(data),stamp(),user,guest]);}
async function openRound(db,id){return db.get("SELECT * FROM etv_live_runden WHERE versammlung_id=? AND status='offen'",[id]);}
async function mutable(db,id){if(await openRound(db,id))fail('Bitte die laufende Abstimmung zuerst schließen oder abbrechen.',409);}
async function setRoom(db,id,b,user){
 return db.transaktion(async tx=>{
  if(!await tx.get('SELECT id FROM versammlungen WHERE id=?',[id]))fail('Versammlung nicht gefunden.',404);
  await requireLead(tx,id,user);const r=await room(tx,id);if((r?.revision||0)!==b.revision)fail('Zugang inzwischen geändert. Bitte aktualisieren.',409);
  const url=teams(b.teams_url);if(typeof b.aktiv!=='boolean')fail('Ungültiger Zugangsstatus.');
  await mutable(tx,id);let token=r?.raum_token||crypto.randomBytes(32).toString('hex'),generation=r?.generation||1;
  if(r?.raum_token&&(!r.aktiv||r.ablauf_am<=stamp())&&b.aktiv){token=crypto.randomBytes(32).toString('hex');generation++;await tx.run("UPDATE etv_live_anfragen SET status='widerrufen' WHERE versammlung_id=?",[id]);await tx.run("UPDATE etv_live_gruppen SET modus='manuell',anfrage_id=NULL WHERE versammlung_id=?",[id]);}
  const expires=new Date(Date.now()+7*86400000).toISOString();
  await tx.run('INSERT INTO etv_live(versammlung_id,raum_token,aktiv,generation,ablauf_am,teams_url) VALUES(?,?,?,?,?,?) ON CONFLICT(versammlung_id) DO UPDATE SET raum_token=excluded.raum_token,aktiv=excluded.aktiv,generation=excluded.generation,ablauf_am=excluded.ablauf_am,teams_url=excluded.teams_url,revision=revision+1',[id,token,b.aktiv?1:0,generation,expires,url]);
  await audit(tx,id,'zugang',{aktiv:b.aktiv,generation},user);return room(tx,id);
 });
}
async function join(db,id,b,token){
 return db.transaktion(async tx=>{
  const r=await room(tx,id,true);if(typeof b.raum_token!=='string'||b.raum_token.length!==64||!crypto.timingSafeEqual(Buffer.from(hash(b.raum_token)),Buffer.from(hash(r.raum_token))))fail('Ungültiger QR-Zugang.',403);
  if(token){const old=await tx.get('SELECT * FROM etv_live_anfragen WHERE versammlung_id=? AND session_hash=? AND generation=?',[id,hash(token),r.generation]);if(old&&old.status!=='widerrufen')return{id:old.id,token};}
  const name=text(b.name,160);if(!name||!['praesenz','online'].includes(b.kanal))fail('Bitte Namen und Teilnahme vor Ort oder online angeben.');
  if((await tx.get("SELECT COUNT(*) AS n FROM etv_live_anfragen WHERE versammlung_id=? AND generation=? AND status='wartend'",[id,r.generation])).n>=1000)fail('Zu viele offene Beitrittsanfragen. Bitte die Versammlungsleitung kontaktieren.',429);
  const secret=crypto.randomBytes(32).toString('hex'),rid=crypto.randomBytes(16).toString('hex');
  await tx.run('INSERT INTO etv_live_anfragen(id,versammlung_id,session_hash,generation,name,kanal,erstellt_am) VALUES(?,?,?,?,?,?,?)',[rid,id,hash(secret),r.generation,name,b.kanal,stamp()]);return{id:rid,token:secret};
 });
}
async function guest(db,id,token,approved=false){
 const r=await room(db,id,true);if(typeof token!=='string'||token.length!==64)fail('Bitte über den QR-Code oder Teilnahme-Link anmelden.',401);
 const g=await db.get('SELECT * FROM etv_live_anfragen WHERE versammlung_id=? AND session_hash=? AND generation=?',[id,hash(token),r.generation]);
 if(!g||['widerrufen','abgelehnt'].includes(g.status))fail('Dieser Zugang ist nicht mehr freigegeben.',403);
 if(approved&&g.status!=='zugelassen')fail('Bitte auf die Freigabe durch die Versammlungsleitung warten.',403);return g;
}
async function approve(db,id,b,user){
 return db.transaktion(async tx=>{
  await requireLead(tx,id,user);const r=await room(tx,id,true);await mutable(tx,id);const g=await tx.get('SELECT * FROM etv_live_anfragen WHERE id=? AND versammlung_id=? AND generation=?',[b.anfrage_id,id,r.generation]);
  if(!g||!['wartend','zugelassen'].includes(g.status))fail('Beitrittsanfrage nicht verfügbar.',404);
  if(!Array.isArray(b.gruppen)||!b.gruppen.length||new Set(b.gruppen).size!==b.gruppen.length)fail('Bitte mindestens eine passende Eigentümergruppe auswählen.');
  const s=await T.stand(tx,id);if(s.historisch||!s.teilnahme.revision)fail('Bitte die aktuelle Teilnehmerliste zuerst speichern.');
  for(const key of b.gruppen){const group=s.register.gruppen.find(x=>x.key===key),d=s.teilnahme.daten[key];if(!group||!present(d))fail('Bitte nur anwesende oder wirksam vertretene, nicht gesperrte Eigentümergruppen freigeben.');
   const old=await tx.get('SELECT * FROM etv_live_gruppen WHERE versammlung_id=? AND gruppen_key=?',[id,key]);
   if(old?.modus==='digital'&&old.anfrage_id!==g.id)fail('Für diese Gruppe besteht bereits ein digitaler Zugang. Zuerst auf manuell umstellen.',409);
   await tx.run("INSERT INTO etv_live_gruppen(versammlung_id,gruppen_key,anfrage_id,modus) VALUES(?,?,?,'digital') ON CONFLICT(versammlung_id,gruppen_key) DO UPDATE SET anfrage_id=excluded.anfrage_id,modus='digital'",[id,key,g.id]);
  }
  for(const old of await tx.all('SELECT gruppen_key FROM etv_live_gruppen WHERE versammlung_id=? AND anfrage_id=?',[id,g.id]))if(!b.gruppen.includes(old.gruppen_key))await tx.run("UPDATE etv_live_gruppen SET modus='manuell',anfrage_id=NULL WHERE versammlung_id=? AND gruppen_key=?",[id,old.gruppen_key]);
  await tx.run("UPDATE etv_live_anfragen SET status='zugelassen',zugelassen_von=? WHERE id=?",[user,g.id]);await audit(tx,id,'zulassen',{gruppen:b.gruppen},user,g.id);return{ok:true};
 });
}
async function revoke(db,id,b,user){
 return db.transaktion(async tx=>{await requireLead(tx,id,user);await mutable(tx,id);
  if(b.anfrage_id){const g=await tx.get('SELECT id FROM etv_live_anfragen WHERE id=? AND versammlung_id=?',[b.anfrage_id,id]);if(!g)fail('Anfrage nicht gefunden.',404);
   await tx.run("UPDATE etv_live_anfragen SET status='widerrufen' WHERE id=?",[g.id]);await tx.run("UPDATE etv_live_gruppen SET modus='manuell',anfrage_id=NULL WHERE versammlung_id=? AND anfrage_id=?",[id,g.id]);await audit(tx,id,'zugang_widerrufen',{},user,g.id);
  }else{const s=await T.stand(tx,id);if(!s.register.gruppen.some(g=>g.key===b.key))fail('Eigentümergruppe nicht gefunden.',404);
   await tx.run("UPDATE etv_live_gruppen SET modus='manuell',anfrage_id=NULL WHERE versammlung_id=? AND gruppen_key=?",[id,b.key]);await audit(tx,id,'manuell',{key:b.key},user);}
  return{ok:true};
 });
}
async function currentTop(db,id,tid,user){if(!Number.isSafeInteger(tid)||tid<1)fail('Ungültiger TOP.');return db.transaktion(async tx=>{await requireLead(tx,id,user);await room(tx,id,true);await mutable(tx,id);if(!await tx.get('SELECT id FROM versammlung_tops WHERE id=? AND versammlung_id=?',[tid,id]))fail('TOP nicht gefunden.',404);await tx.run('UPDATE etv_live SET aktueller_top_id=?,revision=revision+1 WHERE versammlung_id=?',[tid,id]);await audit(tx,id,'top',{top_id:tid},user);return{ok:true};});}

async function ballotBase(db,id,tid){const s=await A.stand(db,id,tid);return{register:s.register,config:s.config,regel:s.regel,top_hash:s.top_hash,top:s.top,teilnahme:s.teilnahme,teilnahme_revision:s.teilnahme_revision,zaehlung_revision:s.revision};}
async function checkBase(db,r){
 const old=JSON.parse(r.snapshot),s=await ballotBase(db,r.versammlung_id,r.top_id);
 if(old.register.basis_hash!==s.register.basis_hash||old.top_hash!==s.top_hash||old.config.revision!==s.config.revision||old.regel.revision!==s.regel.revision||old.teilnahme_revision!==s.teilnahme_revision||old.zaehlung_revision!==s.zaehlung_revision)fail('TOP, Teilnehmer oder Abstimmungsgrundlage wurden geändert. Diese Runde bitte abbrechen und neu öffnen.',409);return old;
}
async function startVote(db,id,b,user){
 if(!Number.isSafeInteger(b.top_id)||b.top_id<1)fail('Ungültiger TOP.');
 return db.transaktion(async tx=>{
  await requireLead(tx,id,user);await room(tx,id,true);await mutable(tx,id);if(!await require('./einlass').lesen(tx,id))fail('Bitte zuerst die Versammlung starten.');
  const s=await ballotBase(tx,id,b.top_id);if(s.top.art!=='beschluss')fail('Dieser TOP ist eine Besprechung ohne Beschlussfassung.');
  if(b.basis_hash!==s.register.basis_hash||b.top_hash!==s.top_hash||b.teilnahme_revision!==s.teilnahme_revision||b.config_revision!==s.config.revision||b.regel_revision!==s.regel.revision||b.zaehlung_revision!==s.zaehlung_revision)fail('Abstimmungsgrundlage inzwischen geändert. Bitte aktualisieren.',409);
  if(!s.teilnahme_revision||b.geprueft!==true)fail('Bitte Teilnehmer, Vollmachten und Stimmrechte vor dem Öffnen prüfen.');
  const ts=await T.stand(tx,id);if(ts.historisch)fail('Bitte den aktuellen Eigentümerstand in der Teilnehmerliste bestätigen.');
  const exclusions=b.ausschluesse||[];if(!Array.isArray(exclusions)||exclusions.some(x=>!x||typeof x.key!=='string')||new Set(exclusions.map(x=>x.key)).size!==exclusions.length)fail('Ungültige Stimmrechtsausschlüsse.');
  for(const x of exclusions)if(!s.register.gruppen.some(g=>g.key===x.key)||!text(x.grund,1000))fail('Stimmrechtsausschluss bitte einer Gruppe zuordnen und begründen.');
  const modes=await tx.all('SELECT g.*,a.status AS zugangsstatus FROM etv_live_gruppen g LEFT JOIN etv_live_anfragen a ON a.id=g.anfrage_id WHERE g.versammlung_id=?',[id]);
  s.stimmen=s.register.gruppen.map(g=>{const p=s.teilnahme[g.key]||{},ex=exclusions.find(x=>x.key===g.key),m=modes.find(x=>x.gruppen_key===g.key);return{key:g.key,name:g.name,teilnahme:present(p)?p.teilnahme:'abwesend',stimme:'keine',ausgeschlossen:!!ex,ausschlussgrund:ex?ex.grund.trim():'',vertreter:p.vertreter||'',nachweis:p.nachweis||'',vollmacht_textform:p.vollmacht_textform===true,stimme_textform:false,modus:m?.modus==='digital'&&m.zugangsstatus==='zugelassen'?'digital':'manuell',anfrage_id:m?.anfrage_id||null};});
  A.zaehlen(s.register,s.config.daten,s.regel.daten,s.stimmen,true);
  const result=await tx.run('INSERT INTO etv_live_runden(versammlung_id,top_id,snapshot,geoeffnet_am,benutzer_id) VALUES(?,?,?,?,?)',[id,b.top_id,JSON.stringify(s),stamp(),user]);
  await tx.run('UPDATE etv_live SET aktueller_top_id=?,revision=revision+1 WHERE versammlung_id=?',[b.top_id,id]);await audit(tx,id,'abstimmung_geoeffnet',{top_id:b.top_id},user,null,result.lastID);return{id:result.lastID};
 });
}
async function vote(db,id,rid,b,{user=null,anfrage=null}={}){
 return db.transaktion(async tx=>{
  if(user!==null)await requireLead(tx,id,user);await room(tx,id,true);const r=await tx.get('SELECT * FROM etv_live_runden WHERE id=? AND versammlung_id=?',[rid,id]);if(!r||r.status!=='offen')fail('Die Abstimmung ist nicht geöffnet.',409);
  const base=await checkBase(tx,r),row=base.stimmen.find(x=>x.key===b.key);
  if(!row||row.ausgeschlossen||row.teilnahme==='abwesend')fail('Für diese Gruppe ist keine Stimmabgabe möglich.',403);
  const source=anfrage?'digital':'manuell';
  if(source==='digital'){const g=await guest(tx,id,anfrage,true);if(row.modus!=='digital'||row.anfrage_id!==g.id)fail('Dieser Zugang darf dieses Stimmrecht nicht ausüben.',403);anfrage=g.id;}
  else if(!user||row.modus!=='manuell')fail('Die Gruppe stimmt digital ab. Eine zusätzliche manuelle Stimme ist gesperrt.',409);
  if(!['ja','nein','enthaltung',...(user?['ungueltig']:[])].includes(b.stimme)||!Number.isSafeInteger(b.version)||b.version<0)fail('Ungültige Stimme oder Version.');
  const old=await tx.get('SELECT * FROM etv_live_stimmen WHERE runde_id=? AND gruppen_key=?',[rid,b.key]);
  if((old?.version||0)!==b.version){if(old?.stimme===b.stimme&&old.quelle===source)return{version:old.version,stimme:old.stimme};fail('Die Stimme wurde inzwischen geändert. Bitte aktualisieren.',409);}
  const version=(old?.version||0)+1,now=stamp();
  await tx.run('INSERT INTO etv_live_stimmen(runde_id,gruppen_key,stimme,quelle,version,anfrage_id,benutzer_id,zeit) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(runde_id,gruppen_key) DO UPDATE SET stimme=excluded.stimme,quelle=excluded.quelle,version=excluded.version,anfrage_id=excluded.anfrage_id,benutzer_id=excluded.benutzer_id,zeit=excluded.zeit',[rid,b.key,b.stimme,source,version,anfrage,user,now]);
  await audit(tx,id,'stimme',{key:b.key,stimme:b.stimme,quelle:source,version},user,anfrage,rid);return{version,stimme:b.stimme};
 });
}
async function finishVote(db,id,rid,b,user){
 return db.transaktion(async tx=>{
  await requireLead(tx,id,user);const r=await tx.get('SELECT * FROM etv_live_runden WHERE id=? AND versammlung_id=?',[rid,id]);if(!r||r.status!=='offen')fail('Keine offene Abstimmung.',409);
  if(b.abbrechen===true){await tx.run("UPDATE etv_live_runden SET status='abgebrochen',geschlossen_am=? WHERE id=?",[stamp(),rid]);await audit(tx,id,'abstimmung_abgebrochen',{},user,null,rid);return{status:'abgebrochen'};}
  const s=await checkBase(tx,r),votes=await tx.all('SELECT * FROM etv_live_stimmen WHERE runde_id=?',[rid]),rows=s.stimmen.map(x=>({...x,stimme:votes.find(v=>v.gruppen_key===x.key)?.stimme||'keine'})),ergebnis=A.zaehlen(s.register,s.config.daten,s.regel.daten,rows,true);
  const previous=await tx.get('SELECT revision FROM etv_abstimmungen WHERE top_id=?',[r.top_id]),revision=(previous?.revision||0)+1,snapshot={teilnahme_revision:s.teilnahme_revision,top:s.top,basis_hash:s.register.basis_hash,top_hash:s.top_hash,config_revision:s.config.revision,regel_revision:s.regel.revision,config:s.config.daten,regel:s.regel.daten,register:s.register,stimmen:ergebnis.details,geprueft:true,live_runde_id:rid};
  await tx.run("INSERT INTO etv_abstimmungen(top_id,revision,snapshot,ergebnis,benutzer_id) VALUES(?,?,?,?,?) ON CONFLICT(top_id) DO UPDATE SET revision=excluded.revision,snapshot=excluded.snapshot,ergebnis=excluded.ergebnis,benutzer_id=excluded.benutzer_id,erstellt_am=datetime('now')",[r.top_id,revision,JSON.stringify(snapshot),JSON.stringify(ergebnis),user]);
  await tx.run('INSERT INTO etv_abstimmungsverlauf(top_id,revision,snapshot,ergebnis,benutzer_id) VALUES(?,?,?,?,?)',[r.top_id,revision,JSON.stringify(snapshot),JSON.stringify(ergebnis),user]);
  await tx.run("UPDATE etv_live_runden SET status='geschlossen',ergebnis=?,geschlossen_am=? WHERE id=?",[JSON.stringify(ergebnis),stamp(),rid]);await audit(tx,id,'abstimmung_geschlossen',{revision},user,null,rid);return{status:'geschlossen',ergebnis};
 });
}
async function privateState(db,id,origin,user=null){
 const s=await T.stand(db,id),r=await room(db,id),tops=(await require('./tagesordnung').liste(db,id)).tops,round=await openRound(db,id),latest=round||await db.get('SELECT * FROM etv_live_runden WHERE versammlung_id=? ORDER BY id DESC LIMIT 1',[id]),modes=await db.all('SELECT * FROM etv_live_gruppen WHERE versammlung_id=?',[id]);
 const requests=r?await db.all('SELECT id,name,kanal,status,erstellt_am FROM etv_live_anfragen WHERE versammlung_id=? AND generation=? ORDER BY erstellt_am',[id,r.generation]):[];
 let ballot=null;if(latest){const snapshot=JSON.parse(latest.snapshot),votes=await db.all('SELECT * FROM etv_live_stimmen WHERE runde_id=?',[latest.id]);ballot={id:latest.id,top_id:latest.top_id,status:latest.status,zeilen:snapshot.stimmen.map(x=>({...x,stimme:votes.find(v=>v.gruppen_key===x.key)?.stimme||'keine',version:votes.find(v=>v.gruppen_key===x.key)?.version||0})),ergebnis:latest.ergebnis?JSON.parse(latest.ergebnis):null};}
 return{versammlung:s.versammlung,darf_leiten:user!==null&&await canLead(db,id,user),raum:r?{aktiv:!!r.aktiv&&r.ablauf_am>stamp(),ablauf_am:r.ablauf_am,teams_url:r.teams_url,teams_auto:!!r.teams_auto,revision:r.revision,aktueller_top_id:r.aktueller_top_id,einwahl_url:r.raum_token?origin.replace(/\/$/,'')+'/teilnahme.html#'+id+'/'+r.raum_token:null}:null,tops,anfragen:requests,gruppen:s.register.gruppen.map(g=>({...g,teilnahme:s.teilnahme.daten[g.key]||{},modus:modes.find(m=>m.gruppen_key===g.key)?.modus||'manuell',anfrage_id:modes.find(m=>m.gruppen_key===g.key)?.anfrage_id||null})),abstimmung:ballot,gestartet:!!await require('./einlass').lesen(db,id)};
}
async function guestState(db,id,token){
 const g=await guest(db,id,token),r=await room(db,id),v=await db.get('SELECT name,datum,uhrzeit FROM versammlungen WHERE id=?',[id]),result={status:g.status,name:g.name,versammlung:v};
 if(g.status!=='zugelassen')return result;
 const tops=(await require('./tagesordnung').liste(db,id)).tops.map(t=>({id:t.id,position:t.position,titel:t.titel,art:t.art,erlaeuterung:t.erlaeuterung,beschlussvorschlag:t.beschlussvorschlag}));
 const round=await db.get("SELECT * FROM etv_live_runden WHERE versammlung_id=? AND status IN ('offen','geschlossen') ORDER BY id DESC LIMIT 1",[id]);
 result.teams_url=r.teams_url;result.tops=tops;result.aktueller_top_id=r.aktueller_top_id;result.abstimmung=null;
 if(round){const base=JSON.parse(round.snapshot),votes=await db.all('SELECT gruppen_key,stimme,version FROM etv_live_stimmen WHERE runde_id=?',[round.id]),mine=base.stimmen.filter(x=>x.anfrage_id===g.id&&x.modus==='digital');
  result.abstimmung={id:round.id,top_id:round.top_id,status:round.status,gruppen:mine.map(x=>({key:x.key,name:x.name,berechtigt:!x.ausgeschlossen&&x.teilnahme!=='abwesend',stimme:votes.find(v=>v.gruppen_key===x.key)?.stimme||null,version:votes.find(v=>v.gruppen_key===x.key)?.version||0})),ergebnis:round.ergebnis?(()=>{const z=JSON.parse(round.ergebnis);return{status:z.status,prinzip:z.prinzip,summen:z.summen,...(z.summen_anzeige?{summen_anzeige:z.summen_anzeige,mea_bezug:z.mea_bezug}:{})};})():null};
 }
 return result;
}
module.exports={room,setRoom,join,guest,approve,revoke,currentTop,startVote,vote,finishVote,privateState,guestState,teams};
