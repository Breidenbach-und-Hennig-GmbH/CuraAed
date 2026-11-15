'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function setup(t){const d=new JSDOM('<div id="cu-team"></div><div id="cu-eigenes-bild"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test'});t.after(()=>d.window.close());for(const f of ['ui','kern','shell','mitarbeiterprofile'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());d.window.eval('S.benutzer={id:1,name:"Test",rolle:"mitarbeiter"}');return d.window;}
test('Statuspunkte und Beschriftungen aktualisieren sich ohne Verlust des Tastaturfokus; Fehler wird grau',async t=>{
 const w=setup(t),rows=[{id:1,name:'Eigenes Profil',bild_url:'/images/mitarbeiter-platzhalter.svg',status:{farbe:'gruen',text:'Angemeldet'}},{id:2,name:'Kollege',bild_url:'/images/mitarbeiter-platzhalter.svg',status:{farbe:'gelb',text:'Telefoniert'}}];
 w.API={get:async()=>rows};await w.mitarbeiterSymbole();
 const button=w.document.querySelector('.cu-team-symbol');button.focus();assert.match(button.title,/Telefoniert/);assert.ok(button.querySelector('.status-gelb'));
 rows[1].status={farbe:'rot',text:'Abgemeldet'};await w.mitarbeiterSymbole();
 assert.equal(w.document.activeElement,button);assert.ok(button.querySelector('.status-rot'));
 await w.mitarbeiterListe();assert.ok(w.document.querySelector('.cu-team-liste').textContent.includes('Abgemeldet'));
 w.API.get=async()=>{throw Error('offline');};await w.mitarbeiterSymbole();assert.ok(button.querySelector('.status-grau'));assert.match(button.title,/nicht aktualisiert/);
});
test('Anwesenheit: regelmäßige Meldung, Schließen, Wiederherstellung und Abmelden stoppen alte Meldungen',async t=>{
 const w=setup(t),calls=[],beacons=[];let interval;
 w.setInterval=fn=>{interval=fn;return 1;};w.clearInterval=()=>{};
 w.navigator.sendBeacon=(url,data)=>{beacons.push({url,data});return true;};
 w.API={post:async(url,b)=>calls.push({url,b}),get:async()=>[]};
 const settle=()=>new Promise(r=>setTimeout(r,5));
 w.mitarbeiterStarten();await settle();assert.equal(calls.length,1);const first=calls[0].b.fenster_id;
 await interval();assert.equal(calls.length,2);
 w.dispatchEvent(new w.PageTransitionEvent('pagehide'));await interval();assert.equal(calls.length,2);assert.equal(beacons.length,1);
 w.dispatchEvent(new w.PageTransitionEvent('pageshow',{persisted:true}));await settle();assert.equal(calls.length,3);assert.notEqual(calls[2].b.fenster_id,first);
 w.mitarbeiterStoppen();await interval();assert.equal(calls.length,3);assert.equal(beacons.length,2);
});
