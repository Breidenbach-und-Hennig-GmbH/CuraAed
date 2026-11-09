'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../db'),users=require('../services/benutzer'),adressen=require('../services/adressen');
const {service,record}=require('../services/hpAdressSync');
test('Adress-Delta: unveränderte Datensätze nicht übertragen, neue und Änderungen beider Seiten erkennen, Neustart erhält Basis',async t=>{
 const f=await fixture(t),hash=require('../services/hpAdressSync').fingerprint;
 const check=async records=>f.svc.compare(f.c.id,f.c.token,{datenbank:'HPTEST',fingerprints:records.map(r=>({nummer:r.nummer,hash:hash(r)}))});
 assert.deepEqual((await check([f.r])).benoetigt,[]);
 const remote={...f.r,ort:'HP neu'},added={...f.r,nummer:100};assert.deepEqual((await check([remote,added])).benoetigt,[99,100]);
 await f.scan([remote]);assert.deepEqual((await check([remote])).benoetigt,[]);
 await f.save({ort:'Cura neu'});assert.deepEqual((await check([remote])).benoetigt,[99]);
 const jobs=(await f.scan([remote])).jobs;await f.svc.result(f.c.id,f.c.token,{id:jobs[0].id,status:'erfolg',record:jobs[0].neu});
 const fresh=service(f.db);assert.deepEqual((await fresh.compare(f.c.id,f.c.token,{datenbank:'HPTEST',fingerprints:[{nummer:99,hash:hash(jobs[0].neu)}]})).benoetigt,[]);
 await assert.rejects(f.svc.compare(f.c.id,'x'.repeat(43),{datenbank:'HPTEST',fingerprints:[]}),e=>e.status===401);
 await assert.rejects(f.svc.compare(f.c.id,f.c.token,{datenbank:'FREMD',fingerprints:[]}),e=>e.status===409);
 await assert.rejects(f.svc.compare(f.c.id,f.c.token,{datenbank:'HPTEST',fingerprints:[{nummer:99,hash:'bad'}]}),e=>e.status===400);
 assert.equal(hash({nummer:65937,anrede:'Herr',vorname:'Jörg',name1:'Müller',zusatz:'',strasse:'Test 1',land:'DE',plz:'12345',ort:'Köln'}),'952062ac5ba53f2fa432a4a8bb144c4613774b205a35016de908d5e22e1ec34f');
});
test('HP-Importdiagnose: nennt Feld und Grund ohne den Adresswert offenzulegen',()=>{
 const r={nummer:1,anrede:'',vorname:'',name1:'Test',zusatz:'',strasse:'',land:'DE',plz:'',ort:''};
 assert.throws(()=>record({...r,anrede:'Vertraulich\n'}),e=>e.message.includes('anrede')&&e.message.includes('U+000A')&&!e.message.includes('Vertraulich'));
 assert.throws(()=>record({...r,name1:'x'.repeat(31)}),/31 Zeichen; maximal 30/);
 assert.throws(()=>record({...r,ort:'Test\u00a0'}),/Abstandszeichen/);
});

test('HP-Adressen: dauerhafte Freigabe erhält Token und Zuordnungen, überlebt Zeitablauf und bleibt widerrufbar',async t=>{
 const f=await fixture(t);const original=await f.db.get('SELECT * FROM hp_adress_verbindungen WHERE id=?',[f.c.id]);
 await assert.rejects(f.svc.permanent(f.user.id,f.c.id,{zustimmung:false}),e=>e.status===400);
 await assert.rejects(f.svc.permanent(f.user.id+1,f.c.id,{zustimmung:true}),e=>e.status===404);
 await f.svc.permanent(f.user.id,f.c.id,{zustimmung:true});const saved=await f.db.get('SELECT * FROM hp_adress_verbindungen WHERE id=?',[f.c.id]);assert.equal(saved.token_hash,original.token_hash);assert.equal(saved.ablauf_ms,0);
 f.advance(366*24*3600000);await service(f.db,{now:()=>Date.now()+366*24*3600000}).scan(f.c.id,f.c.token,{datenbank:'HPTEST',records:[f.r]});
 assert.equal((await adressen.holen(f.db,f.a.id)).hp_sync.aktiv,true);assert.equal((await f.svc.list(f.user.id))[0].ablauf_ms,0);assert.equal((await f.db.all('SELECT * FROM hp_adress_zuordnung')).length,1);
 await f.svc.disconnect(f.user.id,f.c.id);await assert.rejects(f.scan([]),e=>e.status===401);
});
test('HP-Adressen: neue dauerhafte Kopplung und Schlüsselrotation erhalten unbefristete Dauer; befristete Freigaben laufen weiter ab',async t=>{
 const f=await fixture(t);const input={name:'Büro',datenbank:'HPTEST',zustimmung:true,dauerhaft:true};
 await assert.rejects(f.svc.create(f.user.id,{...input,dauerhaft:'ja'}),e=>e.status===400);
 const permanent=await f.svc.create(f.user.id,input);assert.equal(permanent.id,f.c.id);assert.equal(permanent.ablauf_ms,0);await assert.rejects(f.scan([]),e=>e.status===401);
 const rotated=await f.svc.create(f.user.id,{name:'Büro',datenbank:'HPTEST',zustimmung:true});assert.equal(rotated.ablauf_ms,0);assert.notEqual(rotated.token,permanent.token);
 f.advance(10*24*3600000);await f.svc.scan(rotated.id,rotated.token,{datenbank:'HPTEST',records:[]});
 const bounded=await f.svc.create(f.user.id,{...input,dauerhaft:false});assert.notEqual(bounded.ablauf_ms,0);f.advance(8*3600000);await assert.rejects(f.svc.scan(bounded.id,bounded.token,{datenbank:'HPTEST',records:[]}),e=>e.status===401);
});

test('HP-Adressen: fehlerhafte Bestandsdaten halten nicht die gesamte Leseseite an und werden gezielt nachgeprüft',async t=>{
 const f=await fixture(t);const broken={...f.r,nummer:100,name1:'Test\n'};const good={...f.r,nummer:101,name1:'Weiterer Test'};
 assert.deepEqual((await f.scan([broken,good])).jobs,[]);
 assert.equal((await f.db.all('SELECT * FROM adressen')).length,2);
 const first=(await f.svc.list(f.user.id))[0];assert.equal(first.importfehler.length,1);assert.equal(first.importfehler[0].hp_nummer,100);assert.match(first.importfehler[0].meldung,/name1/);assert.ok(!JSON.stringify(first.importfehler).includes('Test\\n'));
 await f.scan([{...broken,name1:'Korrigierter Test'}]);assert.equal((await f.svc.list(f.user.id))[0].importfehler.length,0);assert.equal((await f.db.all('SELECT * FROM adressen')).length,3);
 await f.svc.report(f.c.id,f.c.token,Object.assign(new Error('secret SQL text'),{code:'SQLITE_CONSTRAINT'}));const diagnostic=(await f.svc.list(f.user.id))[0].importfehler[0];assert.equal(diagnostic.hp_nummer,0);assert.ok(!diagnostic.meldung.includes('secret'));await f.scan([]);assert.equal((await f.svc.list(f.user.id))[0].importfehler.length,0);
});
async function fixture(t){const db=await openDatabase(':memory:');t.after(()=>db.close());const user=await users.anlegen(db,{benutzername:'sync-admin',name:'Admin',rolle:'admin',passwort:'test12345'});let clock=Date.now();const svc=service(db,{now:()=>clock});const c=await svc.create(user.id,{name:'Büro',datenbank:'HPTEST',zustimmung:true});const r={nummer:99,anrede:'Herr',vorname:'Jörg',name1:'Test',zusatz:'',strasse:'Alt 1',land:'DE',plz:'12345',ort:'Testort'};const scan=records=>svc.scan(c.id,c.token,{datenbank:'HPTEST',records});await scan([r]);const a=await db.get('SELECT * FROM adressen WHERE nummer=?',['HP-99']);const save=async patch=>{const current=await adressen.holen(db,a.id);return adressen.aktualisieren(db,a.id,{...patch,hp_version:current.hp_sync.version});};return {db,svc,c,r,a,scan,save,user,advance:n=>clock+=n};}
test('HP-Adressen: HP-Import und Änderungen erscheinen in der normalen Maske, lokale Zusatzfelder bleiben erhalten',async t=>{const f=await fixture(t);await f.save({notizen:'Lokal'});await f.scan([{...f.r,strasse:'Neu 2'}]);const a=await adressen.holen(f.db,f.a.id);assert.equal(a.strasse,'Neu 2');assert.equal(a.notizen,'Lokal');assert.equal(a.hp_sync.status,'synchron');assert.ok((await f.db.all("SELECT * FROM aenderungen WHERE benutzer_name='HausPerfekt-Abgleich'")).length);});
test('HP-Adressen: Mitarbeiter-Speicherweg führt zu genau einem versionsgebundenen Schreibauftrag',async t=>{const f=await fixture(t);await f.save({ort:'Cura-Ort'});assert.equal((await adressen.holen(f.db,f.a.id)).hp_sync.status,'ausstehend');const {jobs}=await f.scan([f.r]);assert.equal(jobs.length,1);assert.equal(jobs[0].neu.ort,'Cura-Ort');assert.equal((await f.scan([f.r])).jobs.length,0);await f.svc.result(f.c.id,f.c.token,{id:jobs[0].id,status:'erfolg',record:jobs[0].neu});await f.scan([jobs[0].neu]);assert.equal((await adressen.holen(f.db,f.a.id)).hp_sync.status,'synchron');});
test('HP-Adressen: verschiedene Felder werden zusammengeführt, gleicher Feldkonflikt überschreibt nichts',async t=>{const f=await fixture(t);await f.save({ort:'Cura'});const {jobs}=await f.scan([{...f.r,strasse:'HP 2'}]);assert.equal(jobs[0].neu.strasse,'HP 2');assert.equal(jobs[0].neu.ort,'Cura');await f.svc.result(f.c.id,f.c.token,{id:jobs[0].id,status:'erfolg',record:jobs[0].neu});await f.save({ort:'Cura erneut'});const next=await f.scan([{...jobs[0].neu,ort:'HP neu'}]);assert.equal(next.jobs.length,0);const a=await adressen.holen(f.db,f.a.id);assert.equal(a.ort,'Cura erneut');assert.equal(a.hp_sync.status,'konflikt');await assert.rejects(f.save({strasse:'Nicht freigegeben'}),e=>e.status===409);await f.svc.resolve(f.a.id,{version:a.hp_sync.konflikt_version,uebernehmen:'hp'});assert.equal((await adressen.holen(f.db,f.a.id)).ort,'HP neu');});
test('HP-Adressen: veraltete Formulare, Feldgrenzen und unveränderliche Nummer geschützt',async t=>{const f=await fixture(t);const old=await adressen.holen(f.db,f.a.id);await f.scan([{...f.r,ort:'HP Änderung'}]);await assert.rejects(adressen.aktualisieren(f.db,f.a.id,{ort:'Alt',hp_version:old.hp_sync.version}),e=>e.status===409);await assert.rejects(f.save({nummer:'Andere'}),e=>e.status===409);await assert.rejects(f.save({strasse:'x'.repeat(31)}),e=>e.status===400);await assert.rejects(f.save({nachname:'Emoji 🏠'}),e=>e.status===400);assert.equal(record({...f.r,name1:'Müller & Söhne'}).name1,'Müller & Söhne');});
test('HP-Adressen: verlorenes Ergebnis wird durch Rücklesen geklärt und niemals erneut geschrieben',async t=>{const f=await fixture(t);await f.save({ort:'Ziel'});const {jobs}=await f.scan([f.r]);f.advance(121000);assert.equal((await f.scan([f.r])).jobs.length,0);assert.equal((await adressen.holen(f.db,f.a.id)).hp_sync.status,'unklar');await f.scan([jobs[0].neu]);assert.equal((await adressen.holen(f.db,f.a.id)).hp_sync.status,'synchron');assert.equal((await f.scan([jobs[0].neu])).jobs.length,0);});
test('HP-Adressen: Kundenbestand, Token, Ablauf, erneute Kopplung und doppelte Ergebnisse geschützt',async t=>{const f=await fixture(t);await assert.rejects(f.svc.scan(f.c.id,'x'.repeat(43),{datenbank:'HPTEST',records:[]}),e=>e.status===401);await assert.rejects(f.svc.scan(f.c.id,f.c.token,{datenbank:'FREMD',records:[]}),e=>e.status===409);await f.save({ort:'Ziel'});const {jobs}=await f.scan([f.r]);const result={id:jobs[0].id,status:'erfolg',record:jobs[0].neu};await f.svc.result(f.c.id,f.c.token,result);await f.svc.result(f.c.id,f.c.token,result);await assert.rejects(f.svc.result(f.c.id,f.c.token,{...result,status:'fehler'}),e=>e.status===409);await assert.rejects(f.svc.create(f.user.id,{name:'Fremd',datenbank:'FREMD',zustimmung:true}),e=>e.status===409);f.advance(8*3600000);await assert.rejects(f.scan([]),e=>e.status===401);const renewed=await f.svc.create(f.user.id,{name:'Büro',datenbank:'HPTEST',zustimmung:true});assert.equal(renewed.id,f.c.id);assert.notEqual(renewed.token,f.c.token);assert.equal((await f.db.all('SELECT * FROM adressen')).length,1);});
test('HP-Adressen: bestehende gleichnamige lokale Adresse wird nicht automatisch zugeordnet',async t=>{const f=await fixture(t);await adressen.anlegen(f.db,{nachname:'Test',nummer:'99'});await f.scan([{...f.r,ort:'HP'}]);assert.equal((await f.db.get("SELECT ort FROM adressen WHERE nummer='99'")).ort,null);assert.equal((await f.db.get("SELECT ort FROM adressen WHERE nummer='HP-99'")).ort,'HP');});


