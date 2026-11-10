'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t,api){const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window;w.API={...api,qs:o=>'?'+new URLSearchParams(o)};
 for(const file of ['ui','kern','shell','vorgaenge'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());
 vm.runInContext('S.lauf=1;S.benutzer={id:1,rolle:"admin"};',dom.getInternalVMContext());w.glockeAktualisieren=()=>{};return w;}
test('Arbeitsbereiche: Formular speichert ausgewählte Art, Fälligkeit und Kontext lokal',async t=>{
 let saved;const w=setup(t,{get:async()=>[{id:1,name:'Test'}],post:async(url,data)=>{assert.equal(url,'/vorgaenge');saved=data;return{id:9};}});
 await w.vorgangForm({art:'akte'},{typ:'adresse',id:2222});const doc=w.document;doc.getElementById('f_art').value='wiedervorlage';doc.getElementById('f_titel').value='Rückruf';doc.getElementById('f_faellig_am').value='2026-11-12';doc.getElementById('vorgang-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();await tick();
 assert.equal(saved.art,'wiedervorlage');assert.equal(saved.faellig_am,'2026-11-12');assert.equal(saved.kontext.id,2222);assert.equal(w.location.hash,'#/vorgaenge/9');
});
test('Arbeitsbereiche: sichere Textanzeige und verspätete Antwort nach Navigation',async t=>{
 let resolve;const w=setup(t,{get:async()=>new Promise(r=>{resolve=r;})});
 const p=w.vorgangDetail(9);await tick();w.eval('S.lauf=2');resolve({titel:'Verspätet'});await p;assert.doesNotMatch(w.document.body.textContent,/Verspätet/);
});
test('Arbeitsbereiche: lokaler Datensatz öffnet Bearbeitung und zeigt Quelltext als Text',async t=>{
 const r={id:9,art:'akte',titel:'<img src=x onerror=alert(1)>',text:'Beschreibung',status:'offen',bezuege:[],verlauf:[],remote_snapshot:{text:'<script>unsafe()</script>'}};
 const w=setup(t,{get:async url=>url==='/mitarbeiter'?[]:r});await w.vorgangDetail(9);assert.equal(w.document.querySelectorAll('img,script').length,0);assert.match(w.document.body.textContent,/<script>unsafe/);
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Bearbeiten').click();await tick();assert.equal(w.document.getElementById('f_art').disabled,true);
});
test('Kalender: Monat, Fälligkeiten und Verknüpfung zum gespeicherten Vorgang',async t=>{
 const w=setup(t,{get:async url=>{assert.match(url,/monat=2026-11/);return {monat:'2026-11',eintraege:[{vorgang_id:9,faellig_am:'2026-11-12',uhrzeit:'10:00',titel:'Rückruf'}],mehr:false};}});
 await w.vorgangKalender(new w.URLSearchParams('monat=2026-11'));await tick();assert.match(w.document.body.textContent,/10:00 Rückruf/);assert.equal(w.document.querySelector('a[href="#/vorgaenge/9"]').textContent,'10:00 Rückruf');
});
