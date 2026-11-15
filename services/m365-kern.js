'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation');
const fail=(s,n=400)=>{throw new ValidationError(s,n);};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex'),random=()=>crypto.randomBytes(32).toString('base64url');
const SCOPES='offline_access User.Read Mail.Send.Shared';
const mailbox=s=>typeof s==='string'&&s.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s);
function baue(db,options={}){
 const client=options.clientId||process.env.M365_CLIENT_ID,secret=options.clientSecret||process.env.M365_CLIENT_SECRET,tenant=options.tenantId||process.env.M365_TENANT_ID;
 let origin;try{const u=new URL(options.publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL);if(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))origin=u.origin;}catch{}
 const ready=!!(origin&&client&&secret&&/^[0-9a-f-]{36}$/i.test(tenant||'')&&/^[0-9a-f-]{36}$/i.test(client||'')),callback=origin+'/api/m365/callback',fetcher=options.fetch||fetch;
 const configHash=sha(String(tenant)+'|'+String(client));const locks=new Map();
 const getKey=()=>require('../lib/m365-schluessel')(db,options);
 function seal(id,data){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',getKey(),iv);c.setAAD(Buffer.from(configHash+'|'+id));const bytes=Buffer.concat([c.update(JSON.stringify(data)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),bytes]).toString('base64');}
 function open(id,value){try{const b=Buffer.from(value,'base64'),c=crypto.createDecipheriv('aes-256-gcm',getKey(),b.subarray(0,12));c.setAAD(Buffer.from(configHash+'|'+id));c.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([c.update(b.subarray(28)),c.final()]).toString());}catch{fail('Microsoft 365 bitte neu verbinden.',409);}}
 const exclusive=(id,fn)=>{const next=(locks.get(id)||Promise.resolve()).then(fn,fn);locks.set(id,next);return next.finally(()=>{if(locks.get(id)===next)locks.delete(id);});};
 async function call(url,opt={}){
  return fetcher(url,{...opt,redirect:'error',signal:AbortSignal.timeout(20000),headers:{...opt.headers}});
 }
 async function settings(id){
  const f=await db.get('SELECT id,name FROM firmenbriefkoepfe WHERE id=?',[id]);if(!f)fail('Verwaltung nicht gefunden.',404);
  const row=await db.get('SELECT * FROM firmen_versand WHERE firma_id=?',[id]),conn=await db.get('SELECT konto FROM m365_verbindungen WHERE firma_id=?',[id]);
  const breidenbach=/breidenbach/i.test(f.name);
  return{firma_id:f.id,name:f.name,absender:row?.absender||(breidenbach?'post@immo-hb.de':''),postweg:row?.postweg||(breidenbach?'epostbox':'drucker'),drucker:row?.drucker||'',revision:row?.revision||0,m365_bereit:ready,m365_verbunden:!!conn,m365_konto:conn?.konto||null,epostbox_verbunden:false,hinweis:ready?null:'Microsoft 365 bitte in der Benutzerverwaltung einrichten.'};
 }
 async function saveSettings(id,b){
  if(!mailbox(b.absender)||!['drucker','epostbox'].includes(b.postweg)||typeof b.drucker!=='string'||b.drucker.length>200||!Number.isSafeInteger(b.revision))fail('Bitte Absenderpostfach und Postweg prüfen.');
  return db.transaktion(async tx=>{
   if(!await tx.get('SELECT id FROM firmenbriefkoepfe WHERE id=?',[id]))fail('Verwaltung nicht gefunden.',404);
   const old=await tx.get('SELECT * FROM firmen_versand WHERE firma_id=?',[id]);
   if((old?.revision||0)!==b.revision)fail('Versandeinstellungen inzwischen geändert. Bitte neu öffnen.',409);
   const sender=b.absender.trim().toLowerCase();
   if(old?.absender!==sender)await tx.run('DELETE FROM m365_verbindungen WHERE firma_id=?',[id]);
   await tx.run('INSERT INTO firmen_versand(firma_id,absender,postweg,drucker,revision) VALUES(?,?,?,?,1) ON CONFLICT(firma_id) DO UPDATE SET absender=excluded.absender,postweg=excluded.postweg,drucker=excluded.drucker,revision=revision+1',[id,sender,b.postweg,b.drucker.trim()]);
   return{ok:true};
  });
 }
 async function verbinden(id,user,session){
  if(!ready)fail('Microsoft 365 ist in der Benutzerverwaltung noch nicht eingerichtet.',503);
  const s=await settings(id);if(!s.revision||!mailbox(s.absender))fail('Bitte zuerst die Versandeinstellungen speichern.');
  await db.run('DELETE FROM m365_oauth WHERE ablauf_am<?',[Date.now()]);
  const state=random(),verifier=random();
  await db.run('INSERT INTO m365_oauth(state_hash,firma_id,benutzer_id,sitzung_hash,verifier,absender,ablauf_am) VALUES(?,?,?,?,?,?,?)',[sha(state),id,user.id,sha(session),verifier,s.absender,Date.now()+600000]);
  const q=new URLSearchParams({client_id:client,response_type:'code',redirect_uri:callback,response_mode:'query',scope:SCOPES,state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  return{url:'https://login.microsoftonline.com/'+tenant+'/oauth2/v2.0/authorize?'+q};
 }
 async function token(parameters){
  const response=await call('https://login.microsoftonline.com/'+tenant+'/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,scope:SCOPES,...parameters}).toString()});
  if(!response.ok)fail('Microsoft-365-Anmeldung konnte nicht erneuert werden. Bitte neu verbinden.',409);
  const data=await response.json();
  if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_in)||data.expires_in<=0)fail('Ungültige Microsoft-365-Antwort.',502);
  return{...data,expires_at:Date.now()+data.expires_in*1000};
 }
 async function callbackFinish(user,session,state,code){
  if(!ready||typeof state!=='string'||typeof code!=='string'||code.length>10000)fail('Ungültige Microsoft-365-Anmeldung.');
  const pending=await db.get('SELECT firma_id FROM m365_oauth WHERE state_hash=?',[sha(state)]);if(!pending)fail('Microsoft-365-Anmeldung abgelaufen.',403);
  return exclusive(pending.firma_id,async()=>{
  const row=await db.transaktion(async tx=>{const r=await tx.get('SELECT * FROM m365_oauth WHERE state_hash=?',[sha(state)]);if(!r||r.benutzer_id!==user.id||r.sitzung_hash!==sha(session)||r.ablauf_am<Date.now())fail('Microsoft-365-Anmeldung abgelaufen oder gehört zu einer anderen Sitzung.',403);await tx.run('DELETE FROM m365_oauth WHERE state_hash=?',[sha(state)]);return r;});
  const data=await token({grant_type:'authorization_code',code,redirect_uri:callback,code_verifier:row.verifier});
  if(!data.refresh_token||!String(data.scope||'').split(' ').includes('Mail.Send.Shared'))fail('Die Freigabe für das gemeinsame Postfach fehlt.',403);
  const me=await call('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',{headers:{Authorization:'Bearer '+data.access_token}});
  if(!me.ok)fail('Microsoft-365-Konto konnte nicht geprüft werden.',502);const profile=await me.json(),account=profile.mail||profile.userPrincipalName;
  if(!mailbox(account))fail('Microsoft-365-Konto nicht eindeutig.',502);
  await db.transaktion(async tx=>{const s=await tx.get('SELECT absender FROM firmen_versand WHERE firma_id=?',[row.firma_id]);if(s?.absender!==row.absender)fail('Absender inzwischen geändert. Bitte neu verbinden.',409);await tx.run('INSERT INTO m365_verbindungen(firma_id,token,benutzer_id,konto,revision) VALUES(?,?,?,?,1) ON CONFLICT(firma_id) DO UPDATE SET token=excluded.token,benutzer_id=excluded.benutzer_id,konto=excluded.konto,revision=revision+1',[row.firma_id,seal(row.firma_id,data),user.id,account]);});
  return row.firma_id;
  });
 }
 async function vorbereiten(id){
  if(!ready||!id)fail('Microsoft 365 für die ausgewählte Verwaltung bitte zuerst einrichten.',409);
  return exclusive(id,async()=>{
   let row=await db.get('SELECT * FROM m365_verbindungen WHERE firma_id=?',[id]);if(!row)fail('Microsoft 365 ist für diese Verwaltung nicht verbunden.',409);
   const s=await settings(id);if(!mailbox(s.absender))fail('Absenderpostfach fehlt.');
   let data=open(id,row.token);
   if(!data.expires_at||data.expires_at<Date.now()+120000){
    if(!data.refresh_token)fail('Microsoft 365 bitte neu verbinden.',409);
    const fresh=await token({grant_type:'refresh_token',refresh_token:data.refresh_token});data={...data,...fresh,refresh_token:fresh.refresh_token||data.refresh_token};
    const updated=await db.run('UPDATE m365_verbindungen SET token=?,revision=revision+1 WHERE firma_id=? AND revision=?',[seal(id,data),id,row.revision]);if(!updated.changes)fail('Microsoft-365-Verbindung inzwischen geändert.',409);row.revision++;
   }
   return{firma_id:id,revision:row.revision,absender:s.absender,accessToken:data.access_token};
  });
 }
 async function senden(prepared,b){
  const row=await db.get('SELECT revision FROM m365_verbindungen WHERE firma_id=?',[prepared.firma_id]),s=await settings(prepared.firma_id);
  if(row?.revision!==prepared.revision||s.absender!==prepared.absender){const e=new ValidationError('Microsoft-365-Verbindung inzwischen geändert.',409);e.sicherAbgelehnt=true;throw e;}
  if(!mailbox(b.an)||!Buffer.isBuffer(b.pdf)||b.pdf.length>2500000)fail('Empfänger oder PDF ungültig.');
  const response=await call('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',headers:{Authorization:'Bearer '+prepared.accessToken,'Content-Type':'application/json'},body:JSON.stringify({message:{subject:b.betreff,body:{contentType:'Text',content:b.text},from:{emailAddress:{address:prepared.absender}},toRecipients:[{emailAddress:{address:b.an}}],attachments:[{'@odata.type':'#microsoft.graph.fileAttachment',name:b.dateiname,contentType:'application/pdf',contentBytes:b.pdf.toString('base64')}]},saveToSentItems:true})});
  if(response.status!==202){const e=new ValidationError('Microsoft 365 hat die Übergabe nicht bestätigt.',502);e.sicherAbgelehnt=response.status>=400&&response.status<500&&response.status!==408;throw e;}
  return{angenommen:true};
 }
 async function trennen(id){return exclusive(id,async()=>{await db.run('DELETE FROM m365_verbindungen WHERE firma_id=?',[id]);await db.run('DELETE FROM m365_oauth WHERE firma_id=?',[id]);return{ok:true};});}
 return{origin,ready,settings,saveSettings,verbinden,callbackFinish,vorbereiten,senden,trennen};
}
module.exports={baue,mailbox};
