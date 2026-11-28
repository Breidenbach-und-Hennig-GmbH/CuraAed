'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),os=require('node:os'),path=require('node:path'),fs=require('node:fs');
const {openDatabase}=require('../db'),{baueApp}=require('../lib/appFactory'),users=require('../services/benutzer');
test('Adressabgleich-API: Mitarbeiter schreibt normale Maske, Freigabe nur Admin, Origin und getrennte Bearer-Zugänge',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());for(const [name,role]of [['admin','admin'],['team','mitarbeiter']])await users.anlegen(db,{benutzername:name,name,rolle:role,passwort:'test12345'});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hp-address-api-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const server=baueApp(db,{uploadDir:dir,hpDirekt:{publicUrl:'https://curaaed.test'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const login=async name=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({benutzername:name,passwort:'test12345'})});return r.headers.get('set-cookie').split(';')[0];};const admin=await login('admin'),staff=await login('team');
 const post=(p,body,cookie='',origin='https://curaaed.test',bearer='')=>fetch(base+'/api'+p,{method:'POST',headers:{'content-type':'application/json',cookie,origin,...(bearer?{authorization:'Bearer '+bearer}:{})},body:JSON.stringify(body)});
 const input={name:'Testkunde',datenbank:'HPTEST',zustimmung:true};assert.equal((await post('/hp-adressen/verbindungen',input,staff)).status,403);assert.equal((await post('/hp-adressen/verbindungen',input,admin,'https://fremd.test')).status,403);assert.equal((await fetch(base+'/api/hp-adressen/verbindungen')).status,401);
 const c=await (await post('/hp-adressen/verbindungen',input,admin)).json();const record={nummer:42,anrede:'Herr',vorname:'Test',name1:'Person',zusatz:'',strasse:'Test 1',land:'DE',plz:'12345',ort:'Test'};assert.equal((await post('/hp-adressen/agent/'+c.id+'/abgleich',{datenbank:'HPTEST',records:[record]},'','',c.token)).status,200);
 assert.equal((await post('/hp-adressen/verbindungen/'+c.id+'/dauerhaft',{zustimmung:true},staff)).status,403);
 assert.equal((await post('/hp-adressen/verbindungen/'+c.id+'/dauerhaft',{zustimmung:true},admin,'https://fremd.test')).status,403);
 assert.equal((await post('/hp-adressen/verbindungen/'+c.id+'/dauerhaft',{zustimmung:false},admin)).status,400);
 assert.equal((await post('/hp-adressen/verbindungen/'+c.id+'/dauerhaft',{zustimmung:true},admin)).status,200);
 assert.equal((await db.get('SELECT ablauf_ms FROM hp_adress_verbindungen WHERE id=?',[c.id])).ablauf_ms,0);
 const a=await db.get('SELECT id FROM adressen WHERE nummer=?',['HP-42']);const current=await(await fetch(base+'/api/adressen/'+a.id,{headers:{cookie:staff}})).json();const result=await fetch(base+'/api/adressen/'+a.id,{method:'PUT',headers:{cookie:staff,'content-type':'application/json'},body:JSON.stringify({ort:'Team-Ort',hp_version:current.hp_sync.version})});assert.equal(result.status,200);const scan=await(await post('/hp-adressen/agent/'+c.id+'/abgleich',{datenbank:'HPTEST',records:[record]},'','',c.token)).json();assert.equal(scan.jobs[0].neu.ort,'Team-Ort');
 const pilot=await(await post('/hp-direkt/verbindungen',{name:'Titeltest',datenbank:'HPTEST',test_nummer:42,zustimmung:true},admin)).json();assert.equal((await post('/hp-adressen/agent/'+c.id+'/abgleich',{datenbank:'HPTEST',records:[]},'','',pilot.token)).status,401);
 const full=await(await post('/hp-adressen/verbindungen',{...input,vollstaendig:true},admin)).json();assert.equal(full.scope,'adressen-v2');
 const spec=require('../lib/hpAdressBereiche.json').telefon,r=Object.fromEntries(spec.fields.map(f=>[f.name,f.typ===0?'':'0']));Object.assign(r,{AdrNr:'42',LfdNrIDXTel:'1',TelNr:'012345',TelTxt:'Büro'});
 const body={datenbank:'HPTEST',eintraege:[{nummer:42,bereich:'telefon',zeilen:[r]},{nummer:42,bereich:'__proto__',zeilen:[]}]};
 assert.equal((await post('/hp-adressen/agent/'+full.id+'/bereiche/stapel',body,'','',c.token)).status,401);
 const batch=await post('/hp-adressen/agent/'+full.id+'/bereiche/stapel',body,'','',full.token);assert.equal(batch.status,200);const results=await batch.json();assert.deepEqual(results.ergebnisse.map(v=>v.ok),[true,false]);
 const get=async(path,cookie='')=>fetch(base+'/api'+path,{headers:{cookie}});
 assert.equal((await get('/hp-adressen/adressen/'+a.id+'/bereiche')).status,401);assert.equal((await get('/hp-adressen/adressen/'+a.id+'/bereiche/telefon',staff)).status,403);
 const source=await get('/hp-adressen/adressen/'+a.id+'/bereiche/telefon',admin);assert.equal(source.status,200);assert.equal((await source.json()).zeilen[0].TelNr,'012345');
 assert.equal((await get('/hp-adressen/adressen/'+a.id+'/bereiche/__proto__',admin)).status,400);

 const creation=await(await post('/hp-adressen/verbindungen',{...input,vollstaendig:true,neuanlagen:true},admin)).json();assert.equal(creation.scope,'adressen-v3');
 const newAddress={nachname:'Eigenständige HP-Neuanlage',vorname:'API'};const created=await post('/adressen',newAddress,staff);assert.equal(created.status,201);assert.equal((await created.json()).hp_neuanlage.status,'wartend');
 await db.run("UPDATE benutzer SET kuerzel='TK' WHERE benutzername='team'");
 assert.equal((await post('/hp-adressen/agent/'+creation.id+'/neuanlagen/abholen',{datenbank:'HPTEST'},staff)).status,401);
 const taken=await post('/hp-adressen/agent/'+creation.id+'/neuanlagen/abholen',{datenbank:'HPTEST',stamm_version:1},'','',creation.token);assert.equal(taken.status,200);assert.equal((await taken.json()).anlegen.daten.sb,'CA');

});
