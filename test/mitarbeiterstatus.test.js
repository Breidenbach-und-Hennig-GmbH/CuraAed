'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const {openDatabase}=require('../db'),users=require('../services/benutzer'),svc=require('../services/mitarbeiterprofile'),auth=require('../lib/auth');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t){const d=new JSDOM('<button id="maske">Maske</button><div id="cu-team"></div><div id="cu-eigenes-bild"></div><div id="modal-container"></div><div id="toast-container"></div>',{url:'https://curaaed.test',runScripts:'outside-only'});const w=d.window;for(const f of ['ui','kern','shell','mitarbeiterprofile','hp-adressen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());w.eval('S.benutzer={id:1,name:"Test",rolle:"mitarbeiter"}');t.after(()=>{w.mitarbeiterBeenden();w.close();});return w;}
test('CuraAed-Präsenz benötigt frischen Puls; Abmeldung und abgelaufene Sitzungen zählen nicht, zweiter Rechner bleibt erhalten',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());const a=await users.anlegen(db,{benutzername:'a',name:'A',passwort:'test12345'}),b=await users.anlegen(db,{benutzername:'b',name:'B',passwort:'test12345'});
 const one=await auth.sitzungErstellen(db,a.id),two=await auth.sitzungErstellen(db,a.id),now=Date.now();
 assert.equal((await svc.liste(db,now)).find(r=>r.id===a.id).cura_online,false);
 await svc.aktivitaet(db,one,now);await svc.aktivitaet(db,two,now);
 assert.equal((await svc.liste(db,now)).find(r=>r.id===a.id).cura_online,true);assert.equal((await svc.liste(db,now)).find(r=>r.id===b.id).cura_online,false);
 assert.equal((await svc.liste(db,now+120001)).find(r=>r.id===a.id).cura_online,false);
 await auth.sitzungLoeschen(db,one);assert.equal((await svc.liste(db,now)).find(r=>r.id===a.id).cura_online,true);
 await auth.sitzungLoeschen(db,two);assert.equal((await svc.liste(db,now)).find(r=>r.id===a.id).cura_online,false);
 await assert.rejects(svc.aktivitaet(db,two),e=>e.status===401);
 assert.ok((await svc.liste(db)).every(r=>r.telefon_status==='unbekannt'&&!('starface_login_id' in r)));
});
test('Rufnummer bleibt bei alten Profilclients erhalten und wird ohne STARFACE-Login-ID an Kollegen ausgegeben',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());const a=await users.anlegen(db,{benutzername:'a',name:'A',passwort:'test12345'});
 await svc.speichern(db,a.id,{revision:0,starface_login_id:'467',rufnummer:'02261 / 6041-18'});await svc.speichern(db,a.id,{revision:1,starface_login_id:'467'});
 assert.equal((await svc.liste(db))[0].rufnummer,'02261 / 6041-18');assert.equal((await svc.eigenes(db,a.id)).starface_login_id,'467');
 for(const rufnummer of ['tel:123','<script>',42,'-'.repeat(4),'1'.repeat(41)])await assert.rejects(svc.speichern(db,a.id,{revision:2,starface_login_id:'467',rufnummer}));
});
test('Mitarbeiterfenster bleibt modeless, sortiert numerisch und hält Filter und Geometrie; F4 wirkt nicht auf die darunterliegende Maske',async t=>{
 const w=setup(t);w.API={get:async()=>[{id:1,name:'Zeta',rufnummer:'10',cura_online:true,telefon_status:'unbekannt'},{id:2,name:'Anna',rufnummer:'2',cura_online:false}],post:async()=>({ok:true})};
 await w.mitarbeiterSymbole();w.document.querySelector('#cu-team button').click();await tick();
 let box=w.document.querySelector('[aria-label="Mitarbeiterstatus"]');assert.ok(box);assert.equal(w.document.querySelector('.modal-backdrop'),null);assert.equal(w.document.querySelectorAll('.cu-team-symbol').length,0);
 const names=()=>[...box.querySelectorAll('.cu-team-statusname strong')].map(e=>e.textContent);assert.deepEqual(names(),['Anna','Zeta']);
 assert.equal(box.querySelector('a.cu-team-rufnummer').getAttribute('href'),'tel:2');
 assert.equal(box.querySelectorAll('a.cu-team-rufnummer').length,2);
 const sort=box.querySelector('select');sort.value='rufnummer';sort.dispatchEvent(new w.Event('change'));assert.deepEqual(names(),['Anna','Zeta']);
 const q=box.querySelector('input');q.value='Zeta';q.dispatchEvent(new w.Event('input'));assert.deepEqual(names(),['Zeta']);
 let creates=0;w.createTest=()=>creates++;w.eval('S.kontext={erstellen:window.createTest}');q.dispatchEvent(new w.KeyboardEvent('keydown',{key:'F4',bubbles:true,cancelable:true}));assert.equal(creates,0);
 const header=box.querySelector('header'),before=parseFloat(box.style.left);header.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));assert.equal(parseFloat(box.style.left),Math.max(8,before-12));
 w.document.getElementById('modal-container').replaceChildren();assert.ok(box.isConnected);
 w.mitarbeiterFensterSchliessen();w.mitarbeiterFenster();box=w.document.querySelector('[aria-label="Mitarbeiterstatus"]');assert.equal(box.querySelector('select').value,'rufnummer');assert.equal(parseFloat(box.style.left),Math.max(8,before-12));
 w.mitarbeiterBeenden();assert.equal(w.document.querySelector('[aria-label="Mitarbeiterstatus"]'),null);
});
test('Farben berücksichtigen beide Anmeldungen; fehlende STARFACE- und veraltete Daten bleiben unbekannt',t=>{
 const w=setup(t);for(const [r,farbe]of [[{cura_online:true,telefon_status:'angemeldet'},'gruen'],[{cura_online:true,telefon_status:'telefoniert'},'gelb'],[{cura_online:false,telefon_status:'telefoniert'},'rot'],[{cura_online:true,telefon_status:'abgemeldet'},'rot'],[{cura_online:true,telefon_status:'unbekannt'},'unbekannt'],[{cura_online:false,veraltet:true},'unbekannt']])assert.equal(w.mitarbeiterStatus(r).farbe,farbe);
});
test('Abgleichinformationen und Konfliktaktionen sind für Mitarbeiter unsichtbar, für Administratoren weiterhin verfügbar',t=>{
 const w=setup(t),a={id:1,hp_sync:{nummer:1,status:'konflikt'}};const staff=w.hpAdressInfo(a);assert.equal(staff.hidden,true);assert.equal(staff.textContent,'');
 w.eval('S.benutzer.rolle="admin"');const admin=w.hpAdressInfo(a);assert.match(admin.textContent,/HP-Stand übernehmen/);assert.match(admin.textContent,/Aktuellen Stand laden/);
});
test('Präsenz-API prüft Rolle und Herkunft und ignoriert fremde Benutzer-IDs',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());for(const [name,rolle]of [['a','mitarbeiter'],['b','mitarbeiter'],['leser','leser']])await users.anlegen(db,{benutzername:name,name,rolle,passwort:'test12345'});
 const server=require('../lib/appFactory').baueApp(db,{hausperfekt:{publicUrl:'https://curaaed.test'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port+'/api';
 const login=async name=>(await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({benutzername:name,passwort:'test12345'})})).headers.get('set-cookie').split(';')[0];
 const cookie=await login('a'),reader=await login('leser'),post=(cookie,origin)=>fetch(base+'/mitarbeiterprofile/praesenz',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({benutzer_id:2,telefon_status:'telefoniert'})});
 assert.equal((await post('','https://curaaed.test')).status,401);assert.equal((await post(reader,'https://curaaed.test')).status,403);assert.equal((await post(cookie,'https://fremd.test')).status,403);assert.equal((await post(cookie,'https://curaaed.test')).status,200);
 const rows=await svc.liste(db);assert.equal(rows.find(r=>r.name==='a').cura_online,true);assert.equal(rows.find(r=>r.name==='b').cura_online,false);assert.equal(rows.find(r=>r.name==='a').telefon_status,'unbekannt');
});
