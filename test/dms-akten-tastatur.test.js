'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t){const d=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/'});t.after(()=>d.window.close());for(const f of ['adressdaten','ui','kern','shell','dialoge','masken','vorgaenge','akten','rechnungen','dms-upload','dms-posteingang','dms'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());const w=d.window;w.eval('S.lauf=1;S.benutzer={id:1,rolle:"admin",name:"Test"}');w.glockeAktualisieren=()=>{};return w;}
const key=(w,k,opts={})=>w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,code:k.length===1?'Key'+k.toUpperCase():k,bubbles:true,cancelable:true,...opts}));
const record={id:1,art:'akte',titel:'Testakte',text:'',status:'offen',revision:1,bezuege:[],verlauf:[],akte:{objekt:{id:3,nummer:'4236'},einheit:{id:4,nummer:'1'},adressen:[{id:5,name:'Testadresse'}]}};
test('Akten: Esc speichert OK-Formulare, Strg+Esc verwirft; Kontextsprünge behalten die zugeordneten Ziele',async t=>{
 const w=setup(t);let saved=0;w.API={get:async()=>[],put:async(url,b)=>{saved++;assert.equal(b.titel,'Geändert');return{id:1};}};
 w.aktenMaske(record);for(const [k,url]of [['o','#/objekte/3'],['w','#/einheiten/4'],['a','#/adressen/5'],['h','#/vorgaenge/1?tab=handwerker'],['k','#/vorgaenge/1?tab=korrespondenz'],['v','#/vorgaenge/1?tab=adressen']]){w.befehl(k);assert.equal(w.location.hash,url);}
 key(w,'F2');await tick();w.document.getElementById('f_titel').value='Geändert';key(w,'Escape');await tick();await tick();assert.equal(saved,1);assert.equal(w.document.querySelector('[role=dialog]'),null);
 key(w,'F2');await tick();w.document.getElementById('f_titel').value='Verworfen';key(w,'Escape',{ctrlKey:true});assert.equal(saved,1);assert.equal(w.document.querySelector('[role=dialog]'),null);
});
test('Akten-Suchfenster: F2 bearbeitet die Tastaturzeile und F4 öffnet genau eine Neuanlage',async t=>{
 const w=setup(t);w.API={qs:q=>'?'+new URLSearchParams(q),get:async url=>url==='/vorgaenge/1'?record:{eintraege:[record],seite:1,gesamt:1,weitere:false}};
 w.akteSuchen();await tick();w.document.querySelector('tr.klick').focus();key(w,'F2');await tick();assert.equal(w.document.querySelector('[role=dialog]').getAttribute('aria-label'),'Akte bearbeiten');key(w,'Escape',{ctrlKey:true});w.akteSuchen();key(w,'F4');await tick();assert.equal(w.document.querySelectorAll('[role=dialog]').length,1);assert.equal(w.document.querySelector('[role=dialog]').getAttribute('aria-label'),'Neuanlage Akte / Vorgang');
});
test('Vorgangslisten und Detail: F4 behält Bereich und Kontext, F2 bearbeitet die ausgewählte Zeile',async t=>{
 const w=setup(t),r={...record,art:'notiz',akte:undefined};w.API={qs:q=>'?'+new URLSearchParams(q),get:async url=>url==='/vorgaenge/1'?r:url==='/mitarbeiter'?[]:url.includes('verbindungen')?{verbindungen:[]}:url.includes('uebersicht')?{quellen:[]}:{eintraege:[r],seite:1,gesamt:1,weitere:false}};
 await w.vorgaengeMaske(new w.URLSearchParams('art=notiz&typ=objekt&ziel=3'));await tick();key(w,'F4');await tick();assert.equal(w.document.getElementById('f_art').value,'notiz');key(w,'Escape',{ctrlKey:true});w.document.querySelector('tr.klick').focus();key(w,'F2');await tick();assert.equal(w.document.querySelector('[role=dialog]').getAttribute('aria-label'),'Vorgang bearbeiten');key(w,'Escape',{ctrlKey:true});
 await w.vorgangDetail(1);key(w,'F2');await tick();assert.equal(w.document.getElementById('f_titel').value,'Testakte');assert.equal(w.document.activeElement.id,'f_titel');
});
test('DMS: Suche, Zuordnungssprünge und Fokus nach Metadatenspeicherung funktionieren ohne Maus',async t=>{
 const w=setup(t),d={eingang:{dokument_id:9,revision:1,sachbearbeiter:'FD'},dokument:{id:9,titel:'Rechnung',original_name:'test.pdf',quelle:'upload',erstellt_am:'2026-11-10 10:00:00',verknuepfungen:[{typ:'objekt',ziel_id:3,nummer:'4236',label:'Testobjekt'},{typ:'einheit',ziel_id:4,nummer:'1',label:'Wohnung'}]},verlauf:[]};w.API={qs:q=>'?'+new URLSearchParams(q),get:async url=>url==='/dms-posteingang/9'?d:{eintraege:[{dokument_id:9,titel:'Rechnung',revision:1,status:'offen'}],gesamt:1,seite:1,weitere:false},put:async()=>{}};
 await w.dmsPosteingangMaske('',1);w.befehl('s',true);assert.equal(w.document.activeElement.getAttribute('aria-label'),'DMS durchsuchen');w.befehl('o');assert.equal(w.location.hash,'#/objekte/3');w.befehl('w',true);assert.equal(w.location.hash,'#/einheiten/4');
 const note=w.document.querySelector('[aria-label="Bemerkung"]');note.value='Notiz';note.dispatchEvent(new w.Event('input'));[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Angaben speichern').click();await tick();await tick();assert.equal(w.document.activeElement,note);
});
test('Rechnung: Einstieg im Lieferantenfeld, F5-Unterfenster und Fokus bei erneuerten Zuordnungsvorschlägen',async t=>{
 const w=setup(t),erkennung={rechnung:true,felder:{},zuordnungen:{lieferanten:[{konto:'70001',name:'Test',grund:'Name'}],objekte:[],konten:[]}};w.API={qs:q=>'?'+new URLSearchParams(q),get:async()=>({dokument:{id:9,titel:'Test',original_name:'test.pdf'},rechnung:null,erkennung}),post:async()=>({...erkennung,belege:{}})};
 await w.rechnungMaske({id:9});assert.equal(w.document.activeElement.id,'rechnung-lieferantenkonto');key(w,'F5');assert.equal(w.document.querySelectorAll('[role=dialog]').length,2);key(w,'Escape',{ctrlKey:true});assert.equal(w.document.activeElement.id,'rechnung-lieferantenkonto');
 const select=w.document.querySelector('[aria-label="Lieferant zuordnen"]');select.focus();select.value='70001';select.dispatchEvent(new w.Event('change'));await tick();assert.notEqual(w.document.activeElement,select);assert.equal(w.document.activeElement.getAttribute('aria-label'),'Lieferant zuordnen');assert.equal(w.document.activeElement.isConnected,true);
});
