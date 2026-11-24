'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../db'),users=require('../services/benutzer'),svc=require('../services/telefonie'),profiles=require('../services/mitarbeiterprofile');
async function setup(t){const db=await openDatabase(':memory:');t.after(()=>db.close());const a=await users.anlegen(db,{benutzername:'a',name:'A',passwort:'test12345'}),b=await users.anlegen(db,{benutzername:'b',name:'B',passwort:'test12345'});return {db,a,b};}
test('Telefonieschlüssel ist persönlich, gehasht, zeitlich begrenzt und beim Ersetzen sofort widerrufen',async t=>{
 const {db,a,b}=await setup(t),now=Date.now(),one=await svc.koppeln(db,a.id,now);
 const stored=await db.get('SELECT * FROM telefonie_kopplung');assert.notEqual(stored.token_hash,one.token);assert.equal(JSON.stringify(stored).includes(one.token),false);
 await svc.melden(db,one.token,{status:'telefoniert'},now);assert.equal((await svc.metadata(db,a.id,now)).status,'telefoniert');assert.equal((await svc.metadata(db,b.id,now)).gekoppelt,false);
 const rows=await profiles.liste(db,now);assert.equal(rows.find(r=>r.id===a.id).telefon_status,'telefoniert');assert.equal(rows.find(r=>r.id===b.id).telefon_status,'unbekannt');assert.equal(JSON.stringify(rows).includes(one.token),false);
 assert.equal((await svc.metadata(db,a.id,now+svc.FRESH+1)).status,'unbekannt');assert.equal((await profiles.liste(db,now+svc.FRESH+1)).find(r=>r.id===a.id).telefon_status,'unbekannt');
 await assert.rejects(svc.melden(db,one.token,{status:'angemeldet',benutzer_id:b.id},now));await assert.rejects(svc.melden(db,one.token,{status:'angemeldet',rufnummer:'123'},now));
 const two=await svc.koppeln(db,a.id,now);await assert.rejects(svc.melden(db,one.token,{status:'angemeldet'},now),e=>e.status===401);
 await assert.rejects(svc.melden(db,two.token,{status:'angemeldet'},two.ablauf_ms),e=>e.status===401);await svc.trennen(db,a.id);await assert.rejects(svc.melden(db,two.token,{status:'angemeldet'},now),e=>e.status===401);
});
test('Deaktivierte und reine Lesebenutzer können keinen Telefonstatus melden',async t=>{
 const {db,a}=await setup(t),key=await svc.koppeln(db,a.id);await db.run('UPDATE benutzer SET aktiv=0 WHERE id=?',[a.id]);await assert.rejects(svc.melden(db,key.token,{status:'angemeldet'}),e=>e.status===401);
 await db.run("UPDATE benutzer SET aktiv=1,rolle='leser' WHERE id=?",[a.id]);await assert.rejects(svc.melden(db,key.token,{status:'angemeldet'}),e=>e.status===401);
});
test('Telefonie-API trennt Bearer-Meldungen von angemeldeter eigener Kopplungsverwaltung',async t=>{
 const {db,a,b}=await setup(t);const server=require('../lib/appFactory').baueApp(db,{hausperfekt:{publicUrl:'https://curaaed.test'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port+'/api';
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({benutzername:'a',passwort:'test12345'})}),cookie=login.headers.get('set-cookie').split(';')[0];
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await post('/telefonie/ich/koppeln',{})).status,401);assert.equal((await post('/telefonie/ich/koppeln',{}, {cookie,origin:'https://fremd.test'})).status,403);
 const r=await post('/telefonie/ich/koppeln',{benutzer_id:b.id},{cookie,origin:'https://curaaed.test'});assert.equal(r.status,200);const key=await r.json();assert.equal((await svc.metadata(db,a.id)).gekoppelt,true);assert.equal((await svc.metadata(db,b.id)).gekoppelt,false);
 assert.equal((await post('/telefonie/status',{status:'angemeldet'},{authorization:'Bearer '+key.token})).status,200);
 assert.equal((await fetch(base+'/telefonie/ich',{headers:{authorization:'Bearer '+key.token}})).status,401);
 assert.equal((await fetch(base+'/adressen',{headers:{authorization:'Bearer '+key.token}})).status,401);
 assert.equal((await post('/telefonie/status',{status:'telefoniert'},{cookie})).status,401);
 assert.equal((await post('/telefonie/ich/trennen',{}, {cookie,origin:'https://curaaed.test'})).status,200);assert.equal((await post('/telefonie/status',{status:'angemeldet'},{authorization:'Bearer '+key.token})).status,401);
});
