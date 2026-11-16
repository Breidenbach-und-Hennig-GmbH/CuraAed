'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db'),V=require('../services/versammlungen'),K=require('../services/m365-kalender'),E=require('../services/etv-kalender');
async function fixture(t){
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'creator','Anleger','x','admin'),(2,'leader','Leitung','x','mitarbeiter'),(3,'other','Neue Leitung','x','mitarbeiter');INSERT INTO objekte(id,nummer,bezeichnung) VALUES(1,'1001','Teststraße');INSERT INTO firmenbriefkoepfe(id,name,daten) VALUES(1,'Firma','{}');");
 const events=new Map(),calls=[],failed=new Set();let losePost=false,account='account-';
 const json=(b,s=200)=>new Response(JSON.stringify(b),{status:s});
 async function graph(url,o={}){
  if(url.endsWith('/token'))return json({access_token:'token-'+new URLSearchParams(o.body).get('code'),refresh_token:'refresh',expires_in:3600,scope:'User.Read Calendars.ReadWrite'});
  const uid=(o.headers?.Authorization||'').split('-').at(-1),target=url.includes('/users/')?'firm':'user-'+uid;
  if(url.includes('/me?$select'))return json({id:account+uid,mail:'user'+uid+'@example.test'});
  calls.push({target,method:o.method||'GET',body:o.body?JSON.parse(o.body):null});
  if(failed.has(target))return json({},403);
  if(o.method==='POST'){
   const b=JSON.parse(o.body),key=target+'|'+b.transactionId;
   if(!events.has(key))events.set(key,{id:key,...b,'@odata.etag':'W/"1"',isOrganizer:true,attendees:[]});
   if(losePost){losePost=false;throw Error('network response lost');}return json(events.get(key),201);
  }
  const id=decodeURIComponent(url.split('/').at(-1)),old=events.get(id);
  if(!old)return json({},404);
  if(o.method==='PATCH'){assert.equal(o.headers['If-Match'],old['@odata.etag']);events.set(id,{...old,...JSON.parse(o.body),'@odata.etag':'W/"2"'});}
  return json(events.get(id));
 }
 const shared={settings:async()=>({kalender_bereit:true,absender:'post@example.test',m365_konto:'delegate@example.test'}),kalenderAnfrage:async(id,{suffix,method,body,etag})=>graph('https://graph.microsoft.com/v1.0/users/post'+suffix,{method,body:body?JSON.stringify(body):undefined,headers:{'If-Match':etag}})};
 const kalender=K.baue(db,{origin:'https://curaaed.test',config:async()=>({clientId:'client',tenantId:'tenant',clientSecret:'secret'}),shared,fetch:graph}),m365={kalender},svc=E.baue(db,m365);
 async function connect(uid){const r=await kalender.verbinden({id:uid},'session');await kalender.callback({id:uid},'session',new URL(r.url).searchParams.get('state'),String(uid));}
 const create=(extra={})=>V.anlegen(db,{objekt_id:1,leitung_id:2,name:'ETV',datum:'2027-01-20',uhrzeit:'17:30',art:'praesenz',ort:'Saal',ort_strasse:'Testweg 1',ort_plz:'12345',ort_stadt:'Testort',...extra},1);
 return{db,svc,kalender,m365,connect,create,events,calls,failed,lose:()=>{losePost=true;},switchAccount:()=>{account='different-';}};
}
test('ETV schreibt in Firma und Kalender der gespeicherten Leitung, nicht des Anlegers; Wiederholen und Änderungen erzeugen keine Duplikate',async t=>{
 const f=await fixture(t);await f.connect(2);const v=await f.create();assert.equal((await f.svc.synchronisieren(v.id)).kalender_status,'bereit');assert.equal(f.events.size,2);assert.deepEqual(new Set(f.calls.filter(c=>c.method==='POST').map(c=>c.target)),new Set(['firm','user-2']));
 for(const e of f.events.values()){assert.equal(e.start.dateTime,'2027-01-20T16:30:00.000');assert.deepEqual(e.attendees,[]);assert.match(e.location.displayName,/Testweg 1/);}
 await Promise.all([f.svc.synchronisieren(v.id),f.svc.synchronisieren(v.id)]);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 await V.aktualisieren(f.db,v.id,{datum:'2027-07-20',uhrzeit:'18:00',ort:'Neuer Saal'});await f.svc.synchronisieren(v.id,{teams_dauer:90});assert.equal(f.events.size,2);for(const e of f.events.values()){assert.equal(e.start.dateTime,'2027-07-20T16:00:00.000');assert.equal(e.end.dateTime,'2027-07-20T17:30:00.000');assert.match(e.location.displayName,/Neuer Saal/);}
});
test('Fehlender Leitungskalender verhindert den Firmenkalender nicht; Verbindung holt ausstehenden Eintrag nach',async t=>{
 const f=await fixture(t),v=await f.create();let r=await f.svc.synchronisieren(v.id);assert.equal(r.kalender_status,'fehler');assert.match(r.kalender_meldung,/Versammlungsleitung.*verbinden/);assert.equal(f.events.size,1);await f.connect(2);await f.svc.nachholen(2);r=await V.holen(f.db,v.id);assert.equal(r.kalender_status,'bereit');assert.equal(f.events.size,2);
});
test('Nach verlorener POST-Antwort und ETV-Änderung bleiben Auftrag und Originalpayload erhalten, auch nach Neustart',async t=>{
 const f=await fixture(t);await f.connect(2);const v=await f.create();f.lose();assert.equal((await f.svc.synchronisieren(v.id)).kalender_status,'fehler');await V.aktualisieren(f.db,v.id,{uhrzeit:'19:00'});assert.equal((await E.baue(f.db,f.m365).synchronisieren(v.id)).kalender_status,'bereit');assert.equal(f.events.size,2);const posts=f.calls.filter(c=>c.target==='firm'&&c.method==='POST');assert.equal(posts.length,2);assert.deepEqual(posts[0].body,posts[1].body);for(const e of f.events.values())assert.equal(e.start.dateTime,'2027-01-20T18:00:00.000');
});
test('Leitungswechsel legt neuen persönlichen Eintrag an und kennzeichnet alten als entfallen; Wechsel zurück reaktiviert ohne Duplikat',async t=>{
 const f=await fixture(t);await f.connect(2);await f.connect(3);const v=await f.create();await f.svc.synchronisieren(v.id);await V.aktualisieren(f.db,v.id,{leitung_id:3});await f.svc.synchronisieren(v.id);assert.equal(f.events.size,3);const old=[...f.events.values()].find(e=>e.id.startsWith('user-2'));assert.match(old.subject,/ENTFÄLLT/);assert.equal(old.showAs,'free');await V.aktualisieren(f.db,v.id,{leitung_id:2});await f.svc.synchronisieren(v.id);assert.equal(f.events.size,3);assert.ok(![...f.events.values()].find(e=>e.id.startsWith('user-2')).subject.includes('ENTFÄLLT'));
});
test('Anderes Microsoft-Konto und fehlende Uhrzeit werden sichtbar, ohne in einen falschen Kalender zu schreiben',async t=>{
 const f=await fixture(t);await f.connect(2);const v=await f.create();await f.svc.synchronisieren(v.id);f.switchAccount();await f.connect(2);const count=f.calls.length,r=await f.svc.synchronisieren(v.id);assert.equal(r.kalender_status,'fehler');assert.match(r.kalender_meldung,/Konto.*gewechselt/);assert.equal(f.calls.slice(count).filter(c=>c.target==='user-2').length,0);const untimed=await f.create({uhrzeit:''});assert.match((await f.svc.synchronisieren(untimed.id)).kalender_meldung,/Uhrzeit/);
});

test('Präsenz-ETV synchronisiert über die API automatisch; Wiederholung benötigt Schreibrecht und eigenen Ursprung',async t=>{
 const f=await fixture(t),auth=require('../lib/auth'),app=require('../lib/appFactory').baueApp(f.db,{m365:{publicUrl:'https://curaaed.test'}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>{server.closeIdleConnections();server.close(r);}));
 const token=await auth.sitzungErstellen(f.db,1),base='http://127.0.0.1:'+server.address().port+'/api',headers={Cookie:auth.COOKIE_NAME+'='+token,'content-type':'application/json',origin:'https://curaaed.test'},body={objekt_id:1,leitung_id:2,name:'ETV Präsenz',datum:'2027-01-20',uhrzeit:'18:00',art:'praesenz'};
 const no=await fetch(base+'/versammlungen',{method:'POST',headers:{...headers,origin:'https://foreign.test'},body:JSON.stringify(body)});assert.equal(no.status,403);assert.equal((await f.db.get('SELECT COUNT(*) n FROM versammlungen')).n,0);
 const res=await fetch(base+'/versammlungen',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(res.status,201);const v=await res.json();assert.equal(v.kalender_status,'fehler');assert.match(v.kalender_meldung,/Firmenkalender/);assert.match(v.kalender_meldung,/Versammlungsleitung/);assert.equal((await f.db.get('SELECT COUNT(*) n FROM etv_kalender_termine')).n,2);
 assert.equal((await fetch(base+'/versammlungen/'+v.id+'/kalender',{method:'POST',headers:{...headers,origin:'https://foreign.test'},body:'{}'})).status,403);
 await f.db.run("UPDATE benutzer SET rolle='leser' WHERE id=1");assert.equal((await fetch(base+'/versammlungen/'+v.id+'/kalender',{method:'POST',headers,body:'{}'})).status,403);
});

test('Präsenz-Formular zeigt Kalenderverwaltung, fehlende Verbindung und Abgleich gespeicherter Daten',async t=>{
 const {JSDOM}=require('jsdom'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test'});t.after(()=>dom.window.close());const w=dom.window;let request;
 w.API={get:async url=>url==='/m365/firmen'?[{firma_id:1,name:'Firma',kalender_bereit:true}]:url==='/mitarbeiter'?[{id:2,name:'Leitung'}]:url.endsWith('/versammlungsorte')?[]:[{id:1,nummer:'1001',bezeichnung:'Teststraße'}],post:async(url,b)=>{request={url,b};return{kalender_status:'bereit'};}};
 for(const name of ['ui','kern','dialoge','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+name+'.js'),'utf8'),dom.getInternalVMContext());
 await w.versammlungForm({id:7,objekt_id:1,leitung_id:2,name:'ETV',datum:'2027-01-20',art:'praesenz',kalender_status:'fehler',kalender_meldung:'Leitungskalender bitte verbinden.'});
 const section=w.document.getElementById('f_m365_firma_id').closest('section');assert.equal(section.hidden,false);assert.match(section.textContent,/Leitungskalender bitte verbinden/);
 [...section.querySelectorAll('button')].find(b=>b.textContent.includes('Kalender aus gespeicherten')).click();await new Promise(r=>setImmediate(r));assert.deepEqual(JSON.parse(JSON.stringify(request)),{url:'/versammlungen/7/kalender',b:{}});assert.match(section.textContent,/persönlichen Kalender der Versammlungsleitung gespeichert/);
});
