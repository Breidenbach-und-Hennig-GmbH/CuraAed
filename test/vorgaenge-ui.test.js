'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t,api){const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window;w.API={...api,qs:o=>'?'+new URLSearchParams(o)};
 for(const file of ['adressdaten','ui','kern','shell','kalender','vorgaenge','akten'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());
 vm.runInContext('S.lauf=1;S.benutzer={id:1,rolle:"admin"};',dom.getInternalVMContext());w.glockeAktualisieren=()=>{};return w;}
test('Arbeitsbereiche: Formular speichert ausgewählte Art, Fälligkeit und Kontext lokal',async t=>{
 let saved;const w=setup(t,{get:async()=>[{id:1,name:'Test'}],post:async(url,data)=>{assert.equal(url,'/vorgaenge');saved=data;return{id:9};}});
 await w.vorgangForm({art:'notiz'},{typ:'adresse',id:2222});const doc=w.document;doc.getElementById('f_art').value='wiedervorlage';doc.getElementById('f_titel').value='Rückruf';doc.getElementById('f_faellig_am').value='2026-11-12';doc.getElementById('vorgang-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();await tick();
 assert.equal(saved.art,'wiedervorlage');assert.equal(saved.faellig_am,'2026-11-12');assert.equal(saved.kontext.id,2222);assert.equal(w.location.hash,'#/vorgaenge/9');
});
test('Arbeitsbereiche: sichere Textanzeige und verspätete Antwort nach Navigation',async t=>{
 let resolve;const w=setup(t,{get:async()=>new Promise(r=>{resolve=r;})});
 const p=w.vorgangDetail(9);await tick();w.eval('S.lauf=2');resolve({titel:'Verspätet'});await p;assert.doesNotMatch(w.document.body.textContent,/Verspätet/);
});
test('Arbeitsbereiche: lokaler Datensatz öffnet Bearbeitung und zeigt Quelltext als Text',async t=>{
 const r={id:9,art:'akte',titel:'<img src=x onerror=alert(1)>',text:'Beschreibung',status:'offen',bezuege:[],verlauf:[],remote_snapshot:{text:'<script>unsafe()</script>'}};
 const w=setup(t,{get:async url=>url==='/mitarbeiter'?[]:r});await w.vorgangDetail(9,new w.URLSearchParams('tab=folge'));assert.equal(w.document.querySelectorAll('img,script').length,0);assert.match(w.document.body.textContent,/<script>unsafe/);
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Bearbeiten').click();await tick();assert.ok(w.document.getElementById('akte-form'));assert.equal(w.document.getElementById('f_art'),null);
});
test('Kalender: Monat, Fälligkeiten und Verknüpfung zum gespeicherten Vorgang',async t=>{
 const w=setup(t,{get:async url=>{if(url==='/kalender/m365/quellen')return [];assert.match(url,/monat=2026-11/);return {monat:'2026-11',eintraege:[{vorgang_id:9,faellig_am:'2026-11-12',uhrzeit:'10:00',titel:'Rückruf'}],mehr:false};}});
 await w.vorgangKalender(new w.URLSearchParams('monat=2026-11'));await tick();assert.match(w.document.body.textContent,/10:00 Rückruf/);assert.equal(w.document.querySelector('a[href="#/vorgaenge/9"]').textContent,'10:00 Rückruf');
});

test('Aktenstart zeigt die Anzeigemaske mit Originalreitern und F4-Neuanlage statt Arbeitsbereiche',async t=>{
 const calls=[],w=setup(t,{get:async url=>{calls.push(url);return{eintraege:[]};}});await w.vorgaengeMaske();const d=w.document;
 assert.ok(d.querySelector('.cu-akte-anzeige'));assert.deepEqual([...d.querySelectorAll('[role=tab]')].map(x=>x.textContent),['Zugeordnete Adressen','Folgeblätter','Archiv','Korrespondenz','Handwerkeraufträge']);assert.match(d.body.textContent,/Tagesaktivität \/ Wiedervorlage/);assert.doesNotMatch(d.body.textContent,/Arbeitsbereiche|HP-Daten übernehmen/);assert.equal(d.querySelector('.modal'),null);
 w.eval('S.kontext.erstellen()');assert.ok(d.getElementById('akte-form'));assert.equal(d.activeElement.id,'f_art_code');assert.equal(d.getElementById('f_art_code').maxLength,3);assert.equal(calls.length,1);
});

test('Aktenformular löst eingetippte Objektnummer auf und speichert BB0 samt Sonderleistung',async t=>{
 let saved;const w=setup(t,{post:async(url,b)=>{if(url==='/vorgaenge/hwa-nummer'){assert.equal(b.nummer,'18059');return{id:4,nummer:'18059',bezeichnung:'Am Steinberg 49'};}assert.equal(url,'/vorgaenge');saved=b;return{id:12};}});await w.akteForm();const d=w.document;
 d.getElementById('f_art_code').value='BB0';d.getElementById('f_art_code').dispatchEvent(new w.Event('blur'));d.getElementById('f_titel').value='Protokolle 2026';d.getElementById('f_objekt_nr').value='18059';d.getElementById('f_sonderleistung').checked=true;d.getElementById('akte-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();await tick();
 assert.equal(saved.akte.art_code,'BB0');assert.equal(saved.akte.art_text,'Protokollakte');assert.equal(saved.akte.objekt_id,4);assert.equal(saved.akte.sonderleistung,true);assert.equal(saved.art,'akte');assert.equal(w.location.hash,'#/vorgaenge/12');
});

test('Aktenmaske erhält BB0 und zeigt echte Dokument- und HWA-Zuordnungen',async t=>{
 const w=setup(t,{get:async()=>[]}),r={id:7,titel:'Protokollakte',art:'akte',status:'offen',bezuege:[],verlauf:[],akte:{art_code:'BB0',art_text:'Protokollakte',sonderleistung:true,objekt:{id:3,nummer:'18059',bezeichnung:'Am Steinberg 49',plz:'51377',ort:'Leverkusen'},handwerkerauftraege:[{id:8,titel:'Leckageortung',status:'beauftragt'}],dokumente:[{id:21,titel:'Einladung',original_name:'Einladung.pdf'}]}};
 w.aktenMaske(r,new w.URLSearchParams('tab=handwerker'));assert.ok(w.document.querySelector('a[href="#/vorgaenge/8"]'));assert.ok(w.document.querySelector('input[type=checkbox]').checked);assert.match(w.document.body.textContent,/BB0|Am Steinberg 49/);
 w.aktenMaske(r,new w.URLSearchParams('tab=archiv'));assert.match(w.document.body.textContent,/Einladung.pdf/);
});

test('HP-Aktenarchiv zeigt lokale Sicherung und öffnet Dateien innerhalb CuraAed',t=>{
 const w=setup(t,{get:async()=>[]});let opened;w.dmsVorschau=(url,d)=>{opened={url,d};};
 const r={id:7,art:'akte',titel:'HP-Akte',status:'offen',bezuege:[{typ:'dokument',remote_id:99,name:'Dokument'}],akte:{hp_dokumente:[{id:99,hp:true,titel:'Schaden',original_name:'Schaden.pdf',gesichert:true},{id:100,hp:true,titel:'Offen',original_name:'Offen.pdf',gesichert:false}]}};
 w.aktenMaske(r,new w.URLSearchParams('tab=archiv'));const d=w.document;assert.match(d.body.textContent,/In CuraAed gespeichert/);assert.match(d.body.textContent,/Dateiübernahme ausstehend/);[...d.querySelectorAll('button')].find(b=>b.textContent==='Schaden.pdf').click();assert.equal(opened.url,'/api/vorgaenge/7/dokumente/99');assert.equal(opened.d.original_name,'Schaden.pdf');assert.equal(d.querySelectorAll('a[href*="hausperfekt-mobile"]').length,0);
});
