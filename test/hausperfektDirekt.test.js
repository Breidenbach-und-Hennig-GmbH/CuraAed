'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openDatabase}=require('../db');
const users=require('../services/benutzer');
const {baueHpDirekt}=require('../services/hausperfektDirekt');
const {baueApp}=require('../lib/appFactory');
const uuid=()=>crypto.randomUUID();
async function fixture(t, filename=':memory:'){
 const db=await openDatabase(filename);t.after(()=>db.close());
 const owner=await users.anlegen(db,{benutzername:'direkt-admin',name:'Admin',rolle:'admin',passwort:'test12345'});
 const other=await users.anlegen(db,{benutzername:'anderer-admin',name:'Andere',rolle:'admin',passwort:'test12345'});
 let clock=1000000;const svc=baueHpDirekt(db,{now:()=>clock});
 const c=await svc.anlegen(owner.id,{name:'Testbestand',datenbank:'TESTDB',test_nummer:123});
 const identity={datenbank:'TESTDB',test_nummer:123,test_name:'CURAAED-TEST'};
 const record={nummer:123,name:'CURAAED-TEST',titel:''};
 const queue=(input={art:'lesen'})=>svc.auftrag(owner.id,c.id,{id:uuid(),...input});
 const poll=()=>svc.poll(c.id,c.token,identity);
 const finish=(job,status='erfolg',r=record)=>svc.ergebnis(c.id,c.token,{id:job.id,claim:job.claim,status,record:r});
 const read=async()=>{await queue();const {auftrag}=await poll();await finish(auftrag);return (await svc.liste(owner.id))[0];};
 return {db,owner,other,svc,c,record,identity,queue,poll,finish,read,advance:n=>clock+=n};
}
test('HP direkt: Token nur einmal sichtbar, Kunden- und Benutzerbindung erzwingen',async t=>{
 const f=await fixture(t);const raw=await f.db.get('SELECT * FROM hp_direkt_verbindungen WHERE id=?',[f.c.id]);
 assert.ok(!JSON.stringify(raw).includes(f.c.token));assert.ok(!JSON.stringify(await f.svc.liste(f.owner.id)).includes(raw.token_hash));
 await assert.rejects(f.svc.auftrag(f.other.id,f.c.id,{id:uuid(),art:'lesen'}),e=>e.status===404);
 await assert.rejects(f.svc.poll(f.c.id,'x'.repeat(43),f.identity),e=>e.status===401);
 await assert.rejects(f.svc.poll(f.c.id,f.c.token,{...f.identity,datenbank:'FREMD'}),e=>e.status===409);
 await assert.rejects(f.svc.poll(f.c.id,f.c.token,{...f.identity,test_nummer:999}),e=>e.status===409);
});
test('HP direkt: Frischlesen, Versionsprüfung, ASCII-Grenzen und bestätigter Commit-Rücklesestatus',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.queue({art:'titel',version:'alt',neu:'Test'}),e=>e.status===409);
 const v=await f.read();
 await assert.rejects(f.queue({art:'titel',version:'fremd',neu:'Test'}),e=>e.status===409);
 for(const neu of ['ä','x'.repeat(31),'Test ','Test\n'])await assert.rejects(f.queue({art:'titel',version:v.version,neu}),e=>e.status===400);
 await f.queue({art:'titel',version:v.version,neu:'CuraAed Test'});const {auftrag}=await f.poll();
 assert.equal(auftrag.alt,'');assert.equal(auftrag.neu,'CuraAed Test');
 assert.equal((await f.svc.liste(f.owner.id))[0].version,null);
 await assert.rejects(f.finish(auftrag,'erfolg',f.record),e=>e.status===409);
 await f.finish(auftrag,'erfolg',{...f.record,titel:'CuraAed Test'});
 const after=(await f.svc.liste(f.owner.id))[0];assert.equal(after.snapshot.titel,'CuraAed Test');assert.equal(after.auftraege[0].status,'erfolg');
 await assert.rejects(f.finish(auftrag,'erfolg',{...f.record,titel:'abweichend'}),e=>e.status===409);
});
test('HP direkt: Doppelabsenden und paralleles Abholen führen nur zu einem Auftrag',async t=>{
 const f=await fixture(t);const input={id:uuid(),art:'lesen'};
 const pair=await Promise.all([f.svc.auftrag(f.owner.id,f.c.id,input),f.svc.auftrag(f.owner.id,f.c.id,input)]);
 assert.equal(pair[0].id,pair[1].id);
 const claimed=await Promise.all([f.poll(),f.poll()]);assert.equal(claimed.filter(x=>x.auftrag).length,1);
 const job=claimed.find(x=>x.auftrag).auftrag;await f.finish(job);await f.finish(job);
 assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM hp_direkt_auftraege')).n,1);
 await assert.rejects(f.svc.auftrag(f.owner.id,f.c.id,{...input,art:'titel',neu:'X'}),e=>e.status===409);
});
test('HP direkt: Unklare Aufträge werden nie automatisch erneut ausgegeben, späte Antworten überschreiben keine neueren Daten',async t=>{
 const f=await fixture(t);const initial=await f.read();
 await f.queue({art:'titel',version:initial.version,neu:'Test'});const old=(await f.poll()).auftrag;
 f.advance(121000);assert.equal((await f.poll()).auftrag,null);
 assert.equal((await f.svc.liste(f.owner.id))[0].auftraege[0].status,'unklar');
 await f.queue();const newer=(await f.poll()).auftrag;
 await f.finish(newer,'erfolg',{...f.record,titel:'Neue HP Aenderung'});
 await f.finish(old,'erfolg',{...f.record,titel:'Test'});
 assert.equal((await f.svc.liste(f.owner.id))[0].snapshot.titel,'Neue HP Aenderung');
});
test('HP direkt: Konflikte, falsche Datensätze und abgelaufene/entzogene Freigaben',async t=>{
 const f=await fixture(t);await f.queue();const job=(await f.poll()).auftrag;
 await assert.rejects(f.finish(job,'erfolg',{...f.record,name:'Kunde'}),e=>e.status===409);
 await f.finish(job,'konflikt',{...f.record,titel:'Extern'});
 assert.equal((await f.svc.liste(f.owner.id))[0].snapshot.titel,'Extern');
 f.advance(60001);const view=(await f.svc.liste(f.owner.id))[0];
 await assert.rejects(f.queue({art:'titel',version:view.version,neu:'Neu'}),e=>e.status===409);
 await f.svc.trennen(f.owner.id,f.c.id);await assert.rejects(f.poll(),e=>e.status===401);
 const second=await f.svc.anlegen(f.owner.id,{name:'Zweite',datenbank:'TESTDB',test_nummer:123});f.advance(8*3600000);
 await assert.rejects(f.svc.poll(second.id,second.token,f.identity),e=>e.status===401);
});
test('HP direkt: Dateidatenbank bewahrt wartende Aufträge über Neustart',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'curaaed-direct-'));let reopened;
 t.after(async()=>{if(reopened)await reopened.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('curaaed-direct-'));fs.rmSync(dir,{recursive:true,force:true});});
 const filename=path.join(dir,'test.db'),db=await openDatabase(filename);
 const user=await users.anlegen(db,{benutzername:'admin',name:'Admin',rolle:'admin',passwort:'test12345'});
 const svc=baueHpDirekt(db),c=await svc.anlegen(user.id,{name:'Test',datenbank:'TESTDB',test_nummer:123});const id=uuid();await svc.auftrag(user.id,c.id,{id,art:'lesen'});await db.close();
 reopened=await openDatabase(filename);const second=baueHpDirekt(reopened);
 assert.equal((await second.poll(c.id,c.token,{datenbank:'TESTDB',test_nummer:123,test_name:'CURAAED-TEST'})).auftrag.id,id);
});
test('HP direkt HTTP: getrennte Authentifizierung, Admin/Origin-Pflicht und keine Token-Ausgabe beim Lesen',async t=>{
 const f=await fixture(t);const dir=fs.mkdtempSync(path.join(os.tmpdir(),'curaaed-direct-api-'));
 const app=baueApp(f.db,{uploadDir:dir,hpDirekt:{publicUrl:'https://curaaed.example'}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{server.closeIdleConnections();await new Promise(r=>server.close(r));assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('curaaed-direct-api-'));fs.rmSync(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({benutzername:'direkt-admin',passwort:'test12345'})});const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/api/hp-direkt/verbindungen')).status,401);
 const payload={name:'Neue',datenbank:'TESTDB',test_nummer:123,zustimmung:true};
 const post=(origin)=>fetch(base+'/api/hp-direkt/verbindungen',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 assert.equal((await post('https://fremd.example')).status,403);const created=await post('https://curaaed.example');assert.equal(created.status,200);const c=await created.json();
 const list=await fetch(base+'/api/hp-direkt/verbindungen',{headers:{Cookie:cookie}});assert.equal(list.headers.get('cache-control'),'no-store');assert.ok(!(await list.text()).includes(c.token));
 const poll=await fetch(base+'/api/hp-direkt/agent/'+c.id+'/poll',{method:'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify(f.identity)});assert.equal(poll.status,200);
 await f.db.run("UPDATE benutzer SET rolle='mitarbeiter' WHERE id=?",[f.owner.id]);
 assert.equal((await fetch(base+'/api/hp-direkt/verbindungen',{headers:{Cookie:cookie}})).status,403);
});

