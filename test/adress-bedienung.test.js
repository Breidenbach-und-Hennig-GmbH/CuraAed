'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const {openDatabase}=require('../db'),bedienung=require('../services/adressBedienung'),adressen=require('../services/adressen');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t){const d=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{url:'https://curaaed.test',runScripts:'outside-only'});t.after(()=>d.window.close());for(const f of ['ui','kern','shell','dialoge','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());const w=d.window;w.eval('S.benutzer={id:42,rolle:"admin"};S.lauf=1');return w;}
function key(w,node,key,opts={}){return node.dispatchEvent(new w.KeyboardEvent('keydown',{key,code:key,bubbles:true,cancelable:true,...opts}));}
test('Adressnavigation reicht über 500 Datensätze, sortiert Zahlen und trennt deaktivierte Adressen',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 await db.transaktion(async tx=>{for(let i=1;i<=505;i++)await tx.run('INSERT INTO adressen(nummer,nachname,ort) VALUES(?,?,?)',[String(i),'Name '+i,'Ort']);});
 const n=await bedienung.navigation(db,{id:504,sort:'nummer'});assert.equal(n.anzahl,505);assert.equal(n.position,504);assert.equal(n.naechster,505);assert.equal(n.erster,1);assert.equal(n.letzter,505);
 assert.equal((await bedienung.navigation(db,{id:505,sort:'nummer'})).naechster,null);
 const reverse=await bedienung.navigation(db,{id:1,sort:'nummer',richtung:'desc'});assert.equal(reverse.erster,505);assert.equal(reverse.letzter,1);assert.equal(reverse.vorheriger,2);
 await db.run('UPDATE adressen SET archiviert=1 WHERE id=505');assert.equal((await bedienung.navigation(db,{id:1})).letzter,504);
 assert.equal((await bedienung.navigation(db,{id:505})).anzahl,1);
 await assert.rejects(bedienung.navigation(db,{id:1,sort:'nummer;DROP TABLE adressen'}));
 assert.equal((await bedienung.letzte(db)).id,504);
});
test('Nur ausdrückliche Firmenanrede korrigiert den Typ, HP-Inhalt und Personennamen bleiben erhalten',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 const a=await adressen.anlegen(db,{nachname:'Muster GmbH',anrede:'Firma',nummer:'11'});
 assert.equal(a.adresstyp,'firma');assert.equal(a.firmenname,'Muster GmbH');assert.equal(a.anzeigename,'Muster GmbH');
 assert.equal((await db.get('SELECT adresstyp FROM adressen WHERE id=?',[a.id])).adresstyp,'person');
 assert.equal((await adressen.liste(db,{adresstyp:'firma'}))[0].id,a.id);assert.equal((await adressen.liste(db,{adresstyp:'person'})).length,0);
 const p={adresstyp:'person',anrede:'Herr',nachname:'Firma',vorname:'Max'};assert.equal(bedienung.normalisieren(p),p);
 assert.equal(bedienung.normalisieren({adresstyp:'person',nachname:'Müller GmbH'}).adresstyp,'person');
 assert.ok((await bedienung.anreden(db)).includes('Firma'));
 const hp=require('../services/hpAdressSync');assert.deepEqual(hp.local(a,11),hp.local(await db.get('SELECT * FROM adressen WHERE id=?',[a.id]),11));
});
test('F5 kopiert nur Anschrift, startet beim neuesten Datensatz und erhält den ungespeicherten Entwurf',async t=>{
 const w=setup(t);let posts=0;const quelle={id:900,nummer:'900',anzeigename:'Vorlage',strasse:'Testweg 7',plz:'12345',ort:'Testort',land:'DE',zusatz:'c/o Büro',email:'nicht-kopieren@example.test',geburtstag:'2000-01-01'};
 w.API={qs:p=>'?'+new URLSearchParams(p),get:async url=>url==='/adressen/letzte'?quelle:quelle,post:async()=>{posts++;}};
 w.adresseFormular();w.document.getElementById('f_nachname').value='Neue Person';key(w,w.document.getElementById('f_strasse'),'F5');await tick();
 assert.equal(w.document.querySelectorAll('[role=dialog]').length,2);assert.equal(w.document.getElementById('f_quelle_id').value,'900');
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Übernehmen').click();await tick();
 assert.equal(w.document.getElementById('f_nachname').value,'Neue Person');assert.equal(w.document.getElementById('f_strasse').value,'Testweg 7');assert.equal(w.document.getElementById('f_email').value,'');assert.equal(w.document.getElementById('f_nummer').value,'');assert.equal(w.document.getElementById('f_geburtstag').value,'');assert.equal(w.document.activeElement.id,'f_strasse');assert.equal(posts,0);
});
test('F5 im Anredefeld öffnet eine filterbare Auswahl; Enter übernimmt und gibt den Fokus zurück',async t=>{
 const w=setup(t);w.API={get:async()=>['Herr','Frau','Firma']};w.adresseFormular();const anrede=w.document.getElementById('f_anrede');anrede.focus();key(w,anrede,'F5');await tick();
 const q=w.document.querySelector('[aria-label="Anrede filtern"]');q.value='Fir';q.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(w.document.querySelectorAll('tr.klick').length,1);key(w,q,'ArrowDown');key(w,w.document.activeElement,'Enter');
 assert.equal(anrede.value,'Firma');assert.equal(w.document.activeElement,anrede);assert.equal(w.document.querySelectorAll('[role=dialog]').length,1);
});
test('Strg+F7 in der Adressmaske sortiert Adressen statt der Personenfunktionstabelle; Navigation schützt Eingaben',async t=>{
 const w=setup(t),calls=[];w.API={qs:p=>'?'+new URLSearchParams(p),get:async u=>{calls.push(u);return {letzter:905};}};w.eval('S.kontext={typ:"adresse",adresse:{id:1},blaettern:adressBlaettern,sortieren:adressSortierDialog}');
 key(w,w.document.body,'F7',{ctrlKey:true});assert.equal(w.document.querySelector('[role=dialog]').getAttribute('aria-label'),'Sortierschlüssel – Adressen');
 w.document.getElementById('f_sort').value='ort';w.document.getElementById('f_richtung').value='desc';w.document.querySelector('footer .btn-primary').click();
 key(w,w.document.body,'End',{ctrlKey:true});await tick();assert.match(calls[0],/sort=ort/);assert.match(calls[0],/richtung=desc/);assert.equal(w.location.hash,'#/adressen/905');
 const input=w.document.createElement('input');w.document.body.append(input);input.focus();key(w,input,'Home',{ctrlKey:true});await tick();assert.equal(calls.length,1);
});
test('Gefilterte Suchreihenfolge bleibt beim Blättern erhalten, String-IDs werden erkannt',async t=>{
 const w=setup(t);w.API={get:async()=>{throw Error('Darf keine Gesamtnavigation laden');}};w.eval('S.kontext={typ:"adresse",adresse:{id:5},blaettern:adressBlaettern};S.trefferliste={basis:"#/adressen/",ids:["9","5","1"]}');
 await w.adressBlaettern('naechster');assert.equal(w.location.hash,'#/adressen/1');
});
test('Leere Namen lassen sich weder bei Person noch Firma speichern',async t=>{
 const w=setup(t);let writes=0;w.API={post:async()=>{writes++;}};w.adresseFormular();w.document.querySelector('footer .btn-primary').click();await tick();assert.equal(writes,0);
 const typ=w.document.getElementById('f_adresstyp');typ.value='firma';typ.dispatchEvent(new w.Event('change'));w.document.querySelector('footer .btn-primary').click();await tick();assert.equal(writes,0);assert.ok(w.document.querySelector('[role=dialog]'));
});
test('Beide HP-Geburtstage werden als echte Kalenderdaten angezeigt, lokale Korrektur hat Vorrang',async()=>{
 const ordinal=s=>(Date.parse(s+'T00:00:00Z')+62135596800000)/86400000+1;
 const db={get:async()=>({rohdaten:JSON.stringify([{GebDat1:String(ordinal('1970-11-12')),GebDat2:String(ordinal('1972-03-05'))}])})};
 const g=await bedienung.geburtstage(db,{id:1});assert.deepEqual(g.map(x=>x.datum),['1970-11-12','1972-03-05']);
 const own=await bedienung.geburtstage(db,{id:1,geburtstag:'1971-01-01'});assert.deepEqual(own.map(x=>x.datum),['1971-01-01','1972-03-05']);
 assert.deepEqual(await bedienung.geburtstage({get:async()=>({rohdaten:'kaputt'})},{id:1}),[]);
});
test('Schließen während der Vorlagensuche öffnet kein verspätetes Fenster; doppelte Anschriftzeilen bleiben nur einmal sichtbar',async t=>{
 const w=setup(t);let resolve;w.API={get:()=>new Promise(r=>resolve=r)};w.adresseFormular();key(w,w.document.getElementById('f_strasse'),'F5');key(w,w.document.getElementById('f_strasse'),'Escape',{ctrlKey:true});resolve(null);await tick();assert.equal(w.document.querySelector('[role=dialog]'),null);
 assert.equal(w.anschriftZeilen({adresstyp:'person',vorname:'Anna',nachname:'Test',zusatz:'Anna Test'}).filter(s=>s==='Anna Test').length,1);
});
