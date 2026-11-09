'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {openDatabase} = require('../db');
const users = require('../services/benutzer');
const {migrieren} = require('../db/migrate');
const make = (benutzername, kuerzel) => ({benutzername, name: 'Test Person', passwort: 'test12345', rolle: 'mitarbeiter', kuerzel});

test('Benutzerkürzel: Großschreibung, Grenzen, Eindeutigkeit und Beibehalten bei Updates', async t => {
  const db = await openDatabase(':memory:'); t.after(() => db.close());
  const a = await users.anlegen(db, make('eins', 'fd'));
  assert.equal(a.kuerzel, 'FD'); assert.equal(a.passwort_hash, undefined);
  const b = await users.anlegen(db, make('zwei', 'ABC'));
  assert.equal(b.kuerzel, 'ABC');
  await assert.rejects(users.anlegen(db, make('doppelt', 'Fd')), e => e.status === 409);
  for (const value of ['ABCD','A1','Ä','A B','ß',42,{}]) {
    await assert.rejects(users.aktualisieren(db, a.id, {name:a.name, kuerzel:value}), e => e.status === 400);
  }
  assert.equal((await users.aktualisieren(db,a.id,{name:'Anderer Name'})).kuerzel,'FD');
  await assert.rejects(users.aktualisieren(db,b.id,{name:b.name,kuerzel:'fd'}),e=>e.status===409);
  assert.equal((await users.aktualisieren(db,a.id,{name:a.name,kuerzel:''})).kuerzel,null);
  assert.equal((await users.aktualisieren(db,b.id,{name:b.name,kuerzel:'FD'})).kuerzel,'FD');
  assert.equal((await users.anlegen(db,make('ohne'))).kuerzel,null);
  assert.equal((await users.anlegen(db,make('auch-ohne',''))).kuerzel,null);
  assert.equal((await users.anlegen(db,make('ein-buchstabe','x'))).kuerzel,'X');
  await assert.rejects(db.run('UPDATE benutzer SET kuerzel=? WHERE id=?',['abcd',b.id]),/CHECK/);
});

test('Benutzerkürzel: Migration erhält Benutzer, Passwort und Sitzung; wiederholbar', async t => {
  const db = await openDatabase(':memory:'); t.after(() => db.close());
  const a = await users.anlegen(db,make('bestand'));
  await db.run('INSERT INTO sitzungen(token,benutzer_id,ablauf_am) VALUES (?,?,?)',['test-session',a.id,'2099-01-01']);
  const before = await db.get('SELECT * FROM benutzer WHERE id=?',[a.id]);
  await db.run('DROP INDEX idx_benutzer_kuerzel');
  await db.run('ALTER TABLE benutzer DROP COLUMN kuerzel');
  await migrieren(db,':memory:'); await migrieren(db,':memory:');
  assert.deepEqual(await db.get('SELECT * FROM benutzer WHERE id=?',[a.id]),before);
  assert.equal((await db.get('SELECT benutzer_id FROM sitzungen WHERE token=?',['test-session'])).benutzer_id,a.id);
  await users.aktualisieren(db,a.id,{name:a.name,kuerzel:'FD'});
  assert.equal((await users.holen(db,a.id)).kuerzel,'FD');
});

test('Benutzerkürzel-API: nur Admin ändert, Mitarbeiterliste nutzt hinterlegtes HP-Kürzel',async t=>{
 const {baueApp}=require('../lib/appFactory');
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 await users.anlegen(db,{...make('admin'),rolle:'admin'});
 const b=await users.anlegen(db,make('team','ZZ'));
 const app=baueApp(db);const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const login=async name=>(await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({benutzername:name,passwort:'test12345'})})).headers.get('set-cookie').split(';')[0];
 const admin=await login('admin'),team=await login('team');
 const put=(cookie,kuerzel)=>fetch(base+'/benutzer/'+b.id,{method:'PUT',headers:{'content-type':'application/json',cookie},body:JSON.stringify({name:b.name,kuerzel})});
 assert.equal((await put(team,'XX')).status,403);
 const changed=await put(admin,'abc');assert.equal(changed.status,200);assert.equal((await changed.json()).kuerzel,'ABC');
 assert.equal((await put(admin,'ABCD')).status,400);
 const list=await (await fetch(base+'/mitarbeiter',{headers:{cookie:team}})).json();
 assert.deepEqual(list.find(x=>x.id===b.id),{id:b.id,name:b.name,kuerzel:'ABC'});
});
