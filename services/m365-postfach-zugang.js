'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation');
const SCOPES='offline_access User.Read Mail.Read Mail.Send';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(s,n=400)=>{throw new ValidationError(s,n);};
function baue(db,{config,origin,shared,fetch:fetcher=fetch}){
 const queues=new Map();
 function serial(uid,fn){const p=(queues.get(uid)||Promise.resolve()).then(fn,fn);queues.set(uid,p.catch(()=>{}));return p;}
 const call=(url,opt={})=>fetcher(url,{...opt,redirect:'error',signal:AbortSignal.timeout(20000)});
 async function cfg(){const c=await config();if(!origin||!c.clientId||!c.clientSecret||!c.tenantId)fail('Microsoft 365 bitte zuerst in der Benutzerverwaltung einrichten.',409);return{...c,key:hash(c.tenantId+'|'+c.clientId)};}
 function seal(uid,c,data){const iv=crypto.randomBytes(12),x=crypto.createCipheriv('aes-256-gcm',require('../lib/m365-schluessel')(db),iv);x.setAAD(Buffer.from('curaaed:personal-mail:'+uid+':'+c.key));return Buffer.concat([iv,x.update(JSON.stringify(data)),x.final(),x.getAuthTag()]).toString('base64');}
 function open(uid,c,value){try{const b=Buffer.from(value,'base64'),x=crypto.createDecipheriv('aes-256-gcm',require('../lib/m365-schluessel')(db),b.subarray(0,12));x.setAAD(Buffer.from('curaaed:personal-mail:'+uid+':'+c.key));x.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([x.update(b.subarray(12,-16)),x.final()]).toString());}catch{fail('Persönliches Postfach bitte neu verbinden.',409);}}
 async function token(c,b){const r=await call('https://login.microsoftonline.com/'+c.tenantId+'/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,scope:SCOPES,...b}).toString()});if(!r.ok)fail('Persönliches Microsoft-Konto bitte neu verbinden.',409);const d=await r.json(),scopes=String(d.scope||'').split(' ');if(typeof d.access_token!=='string'||!Number.isFinite(d.expires_in)||d.expires_in<=0||!['Mail.Read','Mail.Send'].every(s=>scopes.includes(s)))fail('Die Freigabe zum Lesen und Beantworten fehlt.',403);return{...d,expires_at:Date.now()+d.expires_in*1000};}
 async function verbinden(user,session){
  // A shared administrator login must never become the owner of an employee mailbox.
  if(/^(administrator|admin)$/i.test(user.benutzername||''))fail('Bitte mit Ihrer eigenen Mitarbeiterkennung anmelden. Persönliche Postfächer werden nicht mit Administrator verbunden.',403);
  const c=await cfg(),state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(32).toString('base64url');
  await db.run('DELETE FROM m365_postfach_oauth WHERE ablauf_am<?',[Date.now()]);
  await db.run('INSERT INTO m365_postfach_oauth(state_hash,benutzer_id,sitzung_hash,verifier,config_hash,ablauf_am) VALUES(?,?,?,?,?,?)',[hash(state),user.id,hash(session),verifier,c.key,Date.now()+600000]);
  return{url:'https://login.microsoftonline.com/'+c.tenantId+'/oauth2/v2.0/authorize?'+new URLSearchParams({client_id:c.clientId,response_type:'code',redirect_uri:origin+'/api/m365/callback',response_mode:'query',scope:SCOPES,state,code_challenge:hashBase64(verifier),code_challenge_method:'S256',prompt:'select_account'})};
 }
 async function istCallback(state){return typeof state==='string'&&!!await db.get('SELECT state_hash FROM m365_postfach_oauth WHERE state_hash=?',[hash(state)]);}
 async function callback(user,session,state,code){if(typeof state!=='string'||typeof code!=='string'||!code||code.length>10000)fail('Ungültige Microsoft-Anmeldung.');if(user.rolle==='admin')fail('Bitte die eigene Mitarbeiterkennung verwenden.',403);return serial(user.id,async()=>{
  const c=await cfg(),pending=await db.transaktion(async tx=>{const r=await tx.get('SELECT * FROM m365_postfach_oauth WHERE state_hash=?',[hash(state)]);if(!r||r.benutzer_id!==user.id||r.sitzung_hash!==hash(session)||r.config_hash!==c.key||r.ablauf_am<Date.now())fail('Diese Anmeldung ist abgelaufen oder gehört zu einer anderen Mitarbeiterkennung.',403);await tx.run('DELETE FROM m365_postfach_oauth WHERE state_hash=?',[hash(state)]);return r;});
  const d=await token(c,{grant_type:'authorization_code',code,redirect_uri:origin+'/api/m365/callback',code_verifier:pending.verifier});if(!d.refresh_token)fail('Die dauerhafte Verbindung wurde nicht freigegeben.',403);
  const r=await call('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',{headers:{Authorization:'Bearer '+d.access_token}});if(!r.ok)fail('Microsoft-Konto konnte nicht geprüft werden.',502);const me=await r.json(),konto=me.mail||me.userPrincipalName;if(!require('./m365-kern').mailbox(konto)||typeof me.id!=='string'||!me.id)fail('Microsoft-Konto nicht eindeutig.',502);
  const linked=await db.get('SELECT mandant,kennung FROM microsoft_anmeldungen WHERE benutzer_id=?',[user.id]);if(linked&&(linked.mandant!==c.tenantId||linked.kennung!==me.id))fail('Dieses Postfach gehört nicht zu Ihrem verknüpften Microsoft-Konto. Bitte Ihr eigenes Geschäftskonto wählen.',403);
  if((await cfg()).key!==c.key)fail('Microsoft-Einrichtung inzwischen geändert.',409);d.accountId=me.id;
  await db.run('INSERT INTO m365_persoenliche_postfaecher(benutzer_id,token,konto) VALUES(?,?,?) ON CONFLICT(benutzer_id) DO UPDATE SET token=excluded.token,konto=excluded.konto,revision=revision+1',[user.id,seal(user.id,c,d),konto.toLowerCase()]);return{ok:true};
 });}
 async function quellen(user){const p=await db.get('SELECT konto FROM m365_persoenliche_postfaecher WHERE benutzer_id=?',[user.id]),firms=await db.all('SELECT id FROM firmenbriefkoepfe ORDER BY name COLLATE NOCASE'),out=[{key:'persoenlich',name:'Mein Postfach · '+user.name,konto:p?.konto||null,verbunden:!!p,persoenlich:true,verbindbar:!/^(administrator|admin)$/i.test(user.benutzername||'')}];for(const f of firms){const s=await shared.settings(f.id);out.push({key:'firma:'+f.id,name:s.name,konto:s.absender,verbunden:s.postfach_bereit,firma_id:f.id,verbindbar:user.rolle==='admin'});}return out;}
 async function provider(user,source){
  if(source==='persoenlich')return serial(user.id,async()=>{const c=await cfg(),row=await db.get('SELECT * FROM m365_persoenliche_postfaecher WHERE benutzer_id=?',[user.id]);if(!row)fail('Bitte Ihr persönliches Microsoft-Geschäftskonto verbinden.',409);let d=open(user.id,c,row.token);if(!d.expires_at||d.expires_at<Date.now()+120000){const fresh=await token(c,{grant_type:'refresh_token',refresh_token:d.refresh_token});d={...d,...fresh,refresh_token:fresh.refresh_token||d.refresh_token};const changed=await db.run('UPDATE m365_persoenliche_postfaecher SET token=?,revision=revision+1 WHERE benutzer_id=? AND revision=?',[seal(user.id,c,d),user.id,row.revision]);if(!changed.changes)fail('Postfachverbindung inzwischen geändert.',409);}
   return{zugang:'person:'+user.id+':'+hash(c.key+'|'+d.accountId),postfach:row.konto,request:(suffix,method='GET',body)=>call('https://graph.microsoft.com/v1.0/me'+suffix,{method,headers:{Authorization:'Bearer '+d.access_token,Prefer:'IdType="ImmutableId", outlook.body-content-type="text"',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})};
  });
  const match=typeof source==='string'&&source.match(/^firma:([1-9]\d*)$/);if(!match)fail('Ungültiges Postfach.');const id=Number(match[1]),s=await shared.settings(id);if(!s.postfach_bereit)fail('Bitte das Firmenpostfach zusätzlich zum Lesen freigeben.',409);const c=await cfg();return{zugang:'firma:'+id+':'+c.key,postfach:s.absender,request:(suffix,method='GET',body)=>shared.postfachAnfrage(id,{suffix,method,body})};
 }
 async function trennen(uid){return serial(uid,async()=>{await db.run('DELETE FROM m365_persoenliche_postfaecher WHERE benutzer_id=?',[uid]);await db.run('DELETE FROM m365_postfach_oauth WHERE benutzer_id=?',[uid]);return{ok:true};});}
 return{verbinden,istCallback,callback,provider,quellen,trennen};
}
const hashBase64=s=>crypto.createHash('sha256').update(s).digest('base64url');
module.exports={baue};
