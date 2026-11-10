'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../db'),users=require('../services/benutzer');
const {baueVorgaenge}=require('../services/vorgaenge'),HP=require('../services/hpFachbereiche');
async function fixture(t){
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 for(const name of ['eins','zwei'])await users.anlegen(db,{benutzername:name,name,rolle:'admin',passwort:'test12345'});
 const owner=(await db.get("SELECT id FROM benutzer WHERE benutzername='eins'")).id,other=(await db.get("SELECT id FROM benutzer WHERE benutzername='zwei'")).id;
 await db.run("INSERT INTO hp_adress_verbindungen VALUES('direct',?,'HP','HPSD','synthetic',0,0,NULL)",[owner]);
 await db.run("INSERT INTO hp_dms_quellen VALUES('source',?,'kunde-a','direct')",[owner]);
 await db.run("INSERT INTO adressen(nummer,adresstyp,nachname) VALUES('HP-2348','person','Test')");const address=(await db.get('SELECT id FROM adressen')).id;
 await db.run("INSERT INTO hp_adress_zuordnung(verbindung_id,hp_nummer,adresse_id,basis,status) VALUES('direct',2348,?,'{}','synchron')",[address]);
 return {db,owner,other,address,service:baueVorgaenge(db)};
}
const data=()=>({art:'akte',titel:'Testakte',text:'Beschreibung',status:'offen',prioritaet:'normal',faellig_am:null,uhrzeit:null});
const incoming=()=>({remote_id:9,hp_nummer:'111/0',werte:data(),snapshot:{id:9,search:'Testakte'},bezuege:[{typ:'adresse',remote_id:3,hp_nummer:'2348',objekt_nummer:null,name:'Test'}],unvollstaendig:[]});
test('Vorgänge: vollständig lokale Anlage, Bearbeitung, Kontext, Vermerke und Schutz vor fremdem Zugriff/veralteten Änderungen',async t=>{
 const f=await fixture(t),s=f.service;
 const r=await s.create(f.owner,{...data(),kontext:{typ:'adresse',id:f.address}});
 let d=await s.detail(f.owner,r.id);assert.equal(d.titel,'Testakte');assert.equal(d.bezuege[0].ziel_id,f.address);
 assert.equal((await s.list(f.owner,{typ:'adresse',ziel:f.address})).gesamt,1);
 assert.equal((await s.list(f.other)).gesamt,0);await assert.rejects(s.detail(f.other,r.id),e=>e.status===404);
 await assert.rejects(s.update(f.other,r.id,{...data(),revision:1}),e=>e.status===404);
 await s.update(f.owner,r.id,{...data(),titel:'Geändert',revision:1});await assert.rejects(s.update(f.owner,r.id,{...data(),revision:1}),e=>e.status===409);
 await s.comment(f.owner,r.id,{text:'Rückruf vereinbart'});d=await s.detail(f.owner,r.id);assert.equal(d.verlauf[0].aktion,'vermerk');assert.equal(d.titel,'Geändert');
 await s.update(f.owner,r.id,{...data(),zustaendig_id:f.other,revision:d.revision});
 const delegated=await s.detail(f.other,r.id);assert.equal(delegated.zustaendig_id,f.other);assert.equal((await s.list(f.other)).gesamt,1);
 await assert.rejects(s.update(f.other,r.id,{...data(),revision:delegated.revision,zustaendig_id:null}),e=>e.status===403);
 await s.update(f.other,r.id,{...data(),status:'in_bearbeitung',revision:delegated.revision,zustaendig_id:f.other});
 assert.equal((await s.detail(f.owner,r.id)).status,'in_bearbeitung');
 const child=await s.create(f.owner,{...data(),art:'handwerker',kontext:{typ:'akte',id:r.id}});assert.equal((await s.detail(f.owner,child.id)).bezuege[0].fach_id,r.id);
 await assert.rejects(s.create(f.owner,{...data(),art:'wiedervorlage'}),e=>e.status===400);
 await assert.rejects(s.create(f.owner,{...data(),faellig_am:'2026-02-30'}),e=>e.status===400);
 const w=await s.create(f.owner,{...data(),art:'wiedervorlage',faellig_am:'2020-01-01'});assert.ok((await s.due(f.owner)).some(r=>r.vorgang_id===w.id));
});

test('Zugewiesene Vorgänge: Dokumentzugriff bleibt auf konkret zugeordnete Dateien begrenzt',async t=>{
 const f=await fixture(t),calls=[];const s=baueVorgaenge(f.db,{archiv:{localFile:async(...args)=>{calls.push(args);return {path:'synthetic',name:'test.pdf'};}}});
 const a=incoming();a.bezuege.push({typ:'dokument',remote_id:99,hp_nummer:'1',objekt_nummer:null,name:'test.pdf'});
 const r=await s.importOne(f.owner,{id:'source'},'records',a);
 await assert.rejects(s.document(f.other,r.id,99),e=>e.status===404);assert.equal(calls.length,0);
 await s.update(f.owner,r.id,{...data(),revision:1,zustaendig_id:f.other});await s.document(f.other,r.id,99);
 assert.deepEqual(calls[0],[f.owner,'source',99]);await assert.rejects(s.document(f.other,r.id,100),e=>e.status===404);assert.equal(calls.length,1);
});

test('Vorgangs-API: Anmeldung, Rolle, Origin, persönliche Daten und ZIS-Verknüpfung',async t=>{
 const f=await fixture(t);await users.anlegen(f.db,{benutzername:'leser',name:'Leser',rolle:'leser',passwort:'test12345'});
 const {baueApp}=require('../lib/appFactory'),app=baueApp(f.db,{hausperfekt:{publicUrl:'https://curaaed.example'}});
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const login=async user=>(await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({benutzername:user,passwort:'test12345'})})).headers.get('set-cookie').split(';')[0];
 const one=await login('eins'),two=await login('zwei'),reader=await login('leser'),headers={cookie:one,origin:'https://curaaed.example','content-type':'application/json'};
 assert.equal((await fetch(base+'/vorgaenge')).status,401);assert.equal((await fetch(base+'/vorgaenge',{headers:{cookie:reader}})).status,403);
 assert.equal((await fetch(base+'/vorgaenge',{method:'POST',headers:{...headers,origin:'https://else.example'},body:JSON.stringify(data())})).status,403);
 const response=await fetch(base+'/vorgaenge',{method:'POST',headers,body:JSON.stringify({...data(),kontext:{typ:'adresse',id:f.address}})});assert.equal(response.status,201);const created=await response.json();
 assert.equal((await fetch(base+'/vorgaenge/'+created.id,{headers:{cookie:two}})).status,404);
 const timeline=await(await fetch(base+'/adressen/'+f.address+'/zis',{headers:{cookie:one}})).json();assert.ok(timeline.eintraege.some(r=>r.quelle==='vorgang'&&r.id===created.id),JSON.stringify({created,timeline,rows:await f.service.list(f.owner,{typ:'adresse',ziel:f.address,_timeline:true})}));
 const otherTimeline=await(await fetch(base+'/adressen/'+f.address+'/zis',{headers:{cookie:two}})).json();assert.equal(otherTimeline.eintraege.filter(r=>r.quelle==='vorgang').length,0);
 const resolve=await fetch(base+'/vorgaenge/aufloesen',{method:'POST',headers,body:JSON.stringify({typ:'adresse',nummern:['HP-2348']})});assert.equal((await resolve.json())[0].id,f.address);
 assert.equal((await fetch(base+'/vorgaenge/'+created.id+'/dokumente/1906',{headers:{cookie:one}})).status,404);
});
test('HP-Übernahme: identische Nummern verschiedener Quellen bleiben getrennt; Offline-Zugriff und Zuordnung über Quellschlüssel',async t=>{
 const f=await fixture(t),s=f.service,a=incoming();const r=await s.importOne(f.owner,{id:'source'},'records',a);
 assert.equal((await s.list(f.owner,{typ:'adresse',ziel:f.address})).gesamt,1);
 await s.importOne(f.owner,{id:'source'},'records',a);assert.equal((await s.list(f.owner)).gesamt,1);
 await f.db.run("INSERT INTO hp_dms_quellen VALUES('other-source',?,'kunde-b',NULL)",[f.owner]);
 await s.importOne(f.owner,{id:'other-source'},'records',a);assert.equal((await s.list(f.owner)).gesamt,2);assert.equal((await s.list(f.owner,{typ:'adresse',ziel:f.address})).gesamt,1);
 const offline=baueVorgaenge(f.db);assert.equal((await offline.detail(f.owner,r.id)).remote_snapshot.search,'Testakte');assert.equal((await offline.detail(f.owner,r.id)).bezuege[0].ziel_id,f.address);
});
test('HP-Abgleich: lokale Änderungen bleiben erhalten, unabhängige Änderungen werden vereinigt, Konflikte explizit aufgelöst',async t=>{
 const f=await fixture(t),s=f.service,a=incoming();const r=await s.importOne(f.owner,{id:'source'},'records',a);
 await s.update(f.owner,r.id,{...data(),titel:'Lokaler Titel',revision:1});
 const remote={...a,werte:{...a.werte,text:'HP neuer Text'},snapshot:{...a.snapshot,text:'HP neuer Text'}};
 await s.importOne(f.owner,{id:'source'},'records',remote);let d=await s.detail(f.owner,r.id);assert.equal(d.titel,'Lokaler Titel');assert.equal(d.text,'HP neuer Text');assert.equal(d.quelle_status,'lokal_geaendert');
 const conflict={...remote,werte:{...remote.werte,titel:'HP neuer Titel'},snapshot:{...remote.snapshot,search:'HP neuer Titel'}};
 await s.importOne(f.owner,{id:'source'},'records',conflict);d=await s.detail(f.owner,r.id);assert.equal(d.quelle_status,'konflikt');assert.equal(d.titel,'Lokaler Titel');assert.equal(d.incoming.werte.titel,'HP neuer Titel');
 await assert.rejects(s.resolve(f.other,r.id,{fassung:'hp',revision:d.revision}),e=>e.status===404);
 await s.resolve(f.owner,r.id,{fassung:'lokal',revision:d.revision});d=await s.detail(f.owner,r.id);assert.equal(d.titel,'Lokaler Titel');assert.equal(d.incoming,null);
 await s.importOne(f.owner,{id:'source'},'records',conflict);assert.equal((await s.detail(f.owner,r.id)).titel,'Lokaler Titel');
});
test('HP-Fachbereiche: geprüfte Projektion, verschachtelte Auftragspersonen, Dokumentdateien und bereinigte Originaldaten',async()=>{
 const raw={id:7,hp_id:120553,subject:'Heizung',text:'<script>synthetic</script>',deadline:'2026-11-10T00:00:00',type:{name:'Eilauftrag'},persons:[{person:{id:3,hp_id:2348,lastname:'Test'}}],units:[{id:5,hp_id:2,building:{id:6,hp_id:4010}}],documents:[{id:10,document_files:[{id:99,hp_id:1,file_original_name:'test.pdf'}]}],user:{access_token:'must-not-retain'},access_token:'must-not-retain'};
 const d=await HP.details({fachDetails:async()=>raw},'craftsman_tasks',7);assert.equal(d.werte.art,'handwerker');assert.equal(d.werte.prioritaet,'hoch');assert.equal(d.werte.faellig_am,'2026-11-10');assert.ok(d.bezuege.some(b=>b.typ==='adresse'&&b.hp_nummer==='2348'));assert.ok(d.bezuege.some(b=>b.typ==='dokument'&&b.remote_id===99));assert.doesNotMatch(JSON.stringify(d.snapshot),/must-not-retain|access_token/);
 await assert.rejects(HP.details({fachDetails:async()=>raw},'craftsman_tasks',8),e=>e.status===502);await assert.rejects(HP.liste({},'../whoami'),e=>e.status===400);
});

test('Fachbereichsübernahme: gespeicherter Fortschritt, Fortsetzung und idempotente Wiederholung über alle fünf Bereiche',async t=>{
 const f=await fixture(t),{HpMobileError}=require('../services/hausperfektMobile');let blocked=true;
 const hp={fachListe:async(owner,connection,resource)=>{if(blocked&&resource==='records')throw new HpMobileError('Bitte erneut verbinden.',401);return {eintraege:[{id:9}],weitere:false};},fachDetails:async(owner,connection,resource)=>({...incoming(),werte:{...data(),art:HP.BEREICHE[resource]},snapshot:{id:9,resource}})};
 const s=baueVorgaenge(f.db,{hp,archiv:{source:async()=>({id:'source'})}});
 async function finish(){for(let i=0;i<200;i++){const info=await s.overview(f.owner);if(info.auftraege[0]?.status!=='laeuft')return info;await new Promise(r=>setTimeout(r,5));}throw new Error('Job did not settle');}
 await s.start(f.owner,'synthetic');let info=await finish();assert.equal(info.auftraege[0].status,'angehalten');assert.equal(info.auftraege[0].resource,'records');assert.equal((await s.list(f.owner)).gesamt,2);
 blocked=false;await s.start(f.owner,'synthetic');info=await finish();assert.equal(info.auftraege[0].status,'fertig');assert.equal((await s.list(f.owner)).gesamt,5);
 await s.start(f.owner,'synthetic');await finish();assert.equal((await s.list(f.owner)).gesamt,5);
});

test('Kalender: Monatsgrenzen, Fälligkeiten, erledigte Vorgänge und persönliche Rechte',async t=>{
 const f=await fixture(t),s=f.service;
 const a=await s.create(f.owner,{...data(),art:'wiedervorlage',faellig_am:'2026-11-30',uhrzeit:'12:30'});
 await s.create(f.owner,{...data(),art:'wiedervorlage',faellig_am:'2026-12-01'});
 await s.create(f.owner,{...data(),faellig_am:'2026-11-30',status:'erledigt'});
 const c=await s.calendar(f.owner,'2026-11');assert.equal(c.eintraege.length,1);assert.equal(c.eintraege[0].vorgang_id,a.id);assert.equal((await s.calendar(f.other,'2026-11')).eintraege.length,0);
 await assert.rejects(s.calendar(f.owner,'2026-13'),e=>e.status===400);
});
