'use strict';
const crypto=require('node:crypto'),bcrypt=require('bcryptjs');
const {ValidationError}=require('../lib/validation'),zugriff=require('./kundenZugriff');
const fail=(m,s=400)=>{throw new ValidationError(m,s);};
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const secret=()=>crypto.randomBytes(32).toString('base64url');
const tokenValid=t=>typeof t==='string'&&/^[A-Za-z0-9_-]{43}$/.test(t);
// A fixed non-account hash keeps unknown-user comparisons expensive without
// hashing a dummy password on every application/test-worker startup.
const dummy='$2a$10$HFYv8xbg81h9yLJrjhroDOxNEqa2DZni7huLtNrVvyQJ4XhWkf8G6';
function baue(db,{origin,now=Date.now}={}){
 function url(){let u;try{u=new URL(origin);}catch{fail('Die öffentliche CuraAed-Adresse muss eingerichtet werden.',503);}
  if(u.origin!==origin||u.username||u.password||u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))fail('Kundenzugänge benötigen eine sichere CuraAed-Adresse.',503);return u;}
 async function session(tx,s){const token=secret(),ms=now();await tx.run('INSERT INTO kunden_sitzungen(token_hash,konto_id,revision,ablauf_ms,erstellt_ms) VALUES(?,?,?,?,?)',[hash(token),s.konto.id,s.konto.revision,ms+86400000,ms]);return token;}
 async function tokenInfo(tx,token){
  if(!tokenValid(token))fail('Der Aktivierungslink ist ungültig oder abgelaufen.',409);
  const t=await tx.get('SELECT * FROM kunden_aktivierungen WHERE token_hash=?',[hash(token)]);
  if(!t||t.widerrufen_ms!==null||t.verbraucht_ms!==null||t.ablauf_ms<=now())fail('Der Aktivierungslink ist ungültig oder abgelaufen.',409);
  const s=await zugriff.pruefen(tx,t.konto_id,{now:now()});
  if(s.konto.revision!==t.revision||s.pruefwert!==t.scope_hash)fail('Die Zuordnung wurde geändert. Bitte einen neuen Aktivierungslink bei Ihrer Verwaltung anfordern.',409);
  return{t,s};
 }
 return {
  async vorschau(owner,id){const s=await zugriff.pruefen(db,id,{owner,now:now()});return{...zugriff.oeffentlich(s),pruefwert:s.pruefwert,revision:s.konto.revision};},
  async erstellen(owner,id,pruefwert){
   url();return db.transaktion(async tx=>{
    const s=await zugriff.pruefen(tx,id,{owner,now:now()});if(s.pruefwert!==pruefwert)fail('Die Kundenzuordnung wurde geändert. Bitte die Vorschau erneut prüfen.',409);
    const token=secret(),ms=now(),bis=ms+7*86400000;
    await tx.run('UPDATE kunden_aktivierungen SET widerrufen_ms=? WHERE konto_id=? AND widerrufen_ms IS NULL AND verbraucht_ms IS NULL',[ms,id]);
    await tx.run('INSERT INTO kunden_aktivierungen(token_hash,konto_id,revision,scope_hash,ablauf_ms,erstellt_von,erstellt_ms) VALUES(?,?,?,?,?,?,?)',[hash(token),id,s.konto.revision,s.pruefwert,bis,owner,ms]);
    return{...zugriff.oeffentlich(s),link:origin+'/kundenportal?firma='+s.konto.firma_id+'#aktivieren='+token,gueltig_bis:new Date(bis).toISOString()};
   });
  },
  async aktivieren(token,password,firma=null){
   url();if(typeof password!=='string'||password.length<12||Buffer.byteLength(password,'utf8')>72)fail('Bitte ein Passwort mit mindestens 12 Zeichen verwenden. Sehr lange Passwörter bitte kürzen.');
   const initial=await tokenInfo(db,token);
   if(firma!==null&&(!Number.isSafeInteger(firma)||firma!==initial.s.konto.firma_id))fail('Der Aktivierungslink passt nicht zur ausgewählten Firma.',409);
   const pw=await bcrypt.hash(password,10);
   return db.transaktion(async tx=>{
    const {t,s}=await tokenInfo(tx,token);
    const used=await tx.run('UPDATE kunden_aktivierungen SET verbraucht_ms=? WHERE token_hash=? AND verbraucht_ms IS NULL AND widerrufen_ms IS NULL',[now(),t.token_hash]);
    if(used.changes!==1)fail('Dieser Aktivierungslink wurde bereits verwendet.',409);
    await tx.run('INSERT INTO kunden_zugaenge(konto_id,passwort_hash,revision,scope_hash,aktiviert_ms) VALUES(?,?,?,?,?) ON CONFLICT(konto_id) DO UPDATE SET passwort_hash=excluded.passwort_hash,revision=excluded.revision,scope_hash=excluded.scope_hash,aktiviert_ms=excluded.aktiviert_ms',[s.konto.id,pw,s.konto.revision,s.pruefwert,now()]);
    await tx.run('DELETE FROM kunden_sitzungen WHERE konto_id=?',[s.konto.id]);
    return{token:await session(tx,s),daten:zugriff.oeffentlich(s)};
   });
  },
  async anmelden(firma,email,password){
   url();const error=()=>fail('Anmeldung nicht möglich. Bitte Firmenkennung, E-Mail und Passwort prüfen.',401);
   if(!Number.isSafeInteger(firma)||firma<1||typeof email!=='string'||email.length>320||typeof password!=='string'||password.length>200)error();
   const rows=await db.all(`SELECT k.id,z.passwort_hash,z.revision,z.scope_hash FROM kunden_konten k JOIN kunden_firmen_quellen f ON f.quelle_id=k.quelle_id JOIN kunden_zugaenge z ON z.konto_id=k.id WHERE f.firma_id=? AND k.email=?`,[firma,email.trim().toLowerCase()]);
   const r=rows.length===1?rows[0]:null,ok=await bcrypt.compare(password,r?.passwort_hash||dummy);
   if(!r||!ok)error();
   return db.transaktion(async tx=>{
    let s;try{s=await zugriff.pruefen(tx,r.id,{now:now()});}catch(e){if(e instanceof ValidationError)error();throw e;}
    const current=await tx.get('SELECT passwort_hash FROM kunden_zugaenge WHERE konto_id=?',[r.id]);
    if(current?.passwort_hash!==r.passwort_hash||s.konto.revision!==r.revision||s.pruefwert!==r.scope_hash)error();
    return{token:await session(tx,s),daten:zugriff.oeffentlich(s)};
   });
  },
  async sitzung(token){
   if(!tokenValid(token))fail('Bitte im Kundenportal anmelden.',401);
   return db.transaktion(async tx=>{
   const row=await tx.get('SELECT * FROM kunden_sitzungen WHERE token_hash=?',[hash(token)]);
   if(!row||row.ablauf_ms<=now())fail('Bitte im Kundenportal anmelden.',401);
   let s;try{s=await zugriff.pruefen(tx,row.konto_id,{now:now()});}catch(e){if(e instanceof ValidationError)fail('Ihre Zuordnung wurde geändert. Bitte wenden Sie sich an Ihre Verwaltung.',401);throw e;}
   const z=await tx.get('SELECT revision,scope_hash FROM kunden_zugaenge WHERE konto_id=?',[row.konto_id]);
   if(row.revision!==s.konto.revision||z?.revision!==s.konto.revision||z.scope_hash!==s.pruefwert)fail('Bitte den Kundenzugang erneut bestätigen lassen.',401);
   return zugriff.oeffentlich(s);
   });
  },
  async abmelden(token){if(tokenValid(token))await db.run('DELETE FROM kunden_sitzungen WHERE token_hash=?',[hash(token)]);return{ok:true};},
 };
}
module.exports={baue};
