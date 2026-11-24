'use strict';
const crypto=require('node:crypto');
const {ValidationError}=require('../lib/validation');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const FRESH=45000,DAUER=90*86400000;
async function metadata(db,id,now=Date.now()){
 const r=await db.get('SELECT ablauf_ms,gesehen_ms,status FROM telefonie_kopplung WHERE benutzer_id=?',[id]);
 return {gekoppelt:!!r&&r.ablauf_ms>now,status:r&&r.ablauf_ms>now&&r.gesehen_ms>=now-FRESH?r.status:'unbekannt',ablauf_ms:r?.ablauf_ms||null};
}
async function koppeln(db,id,now=Date.now()){
 const token=crypto.randomBytes(32).toString('hex');
 await db.run("INSERT INTO telefonie_kopplung(benutzer_id,token_hash,ablauf_ms,status) VALUES(?,?,?,'unbekannt') ON CONFLICT(benutzer_id) DO UPDATE SET token_hash=excluded.token_hash,ablauf_ms=excluded.ablauf_ms,gesehen_ms=NULL,status='unbekannt'",[id,hash(token),now+DAUER]);
 return {token,ablauf_ms:now+DAUER};
}
async function trennen(db,id){await db.run('DELETE FROM telefonie_kopplung WHERE benutzer_id=?',[id]);return {ok:true};}
async function melden(db,token,body,now=Date.now()){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new ValidationError('Telefoniekopplung ungültig.',401);
 // Kein allgemeiner Anwendungszugang: ausschließlich Zustand der zum Schlüssel gehörenden Person.
 const r=await db.get("SELECT t.benutzer_id,t.token_hash FROM telefonie_kopplung t JOIN benutzer b ON b.id=t.benutzer_id WHERE t.token_hash=? AND t.ablauf_ms>? AND b.aktiv=1 AND b.rolle IN ('admin','mitarbeiter')",[hash(token),now]);
 if(!r)throw new ValidationError('Telefoniekopplung abgelaufen oder widerrufen.',401);
 if(!body||!['angemeldet','telefoniert','abgemeldet','unbekannt'].includes(body.status)||Object.keys(body).some(k=>k!=='status'))throw new ValidationError('Nur der Telefonstatus darf übertragen werden.');
 await db.run('UPDATE telefonie_kopplung SET status=?,gesehen_ms=? WHERE benutzer_id=? AND token_hash=? AND ablauf_ms>?',[body.status,now,r.benutzer_id,r.token_hash,now]);
 return {ok:true};
}
module.exports={metadata,koppeln,trennen,melden,FRESH};
