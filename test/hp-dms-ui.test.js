'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
const entry={id:9,titel:'<img src=x onerror=alert(1)>',dateiname:'test.pdf',dokumentart:'Schriftverkehr',datum:'2026-11-10',archivnummer:123,groesse:100,sachbearbeiter:'FD'};
function setup(t, get){
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());
 const w=dom.window;w.API={get,qs:o=>'?'+new URLSearchParams(o)};
 for(const file of ['ui','kern','shell','dms'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());
 vm.runInContext('S.lauf=1;S.benutzer={rolle:"admin"};',dom.getInternalVMContext());return w;
}
test('DMS-UI: persönliche Quelle, serverseitige Suche, Dateiliste und sichere Zuordnungsanzeige',async t=>{
 const calls=[];const w=setup(t,async url=>{
   calls.push(url);if(url.endsWith('/verbindungen'))return{verbindungen:[{id:'a',subdomain:'kunde-a'}]};
   if(url.endsWith('/9'))return{dokument:entry,dateien:[entry,{...entry,id:10}],zuordnungen:[{art:'units',titel:'Einheiten',gesamt:1,eintraege:[{hpNummer:2,objektNummer:4010,name:'Testweg'}]}]};
   return{dokumente:[entry],gesamt:100,seite:1,weitere:true};
 });
 await w.dmsMaske();assert.ok(calls.some(u=>u.includes('/dms/a/dokumente?')));assert.match(w.document.body.textContent,/100 Treffer/);
 assert.equal(w.document.querySelectorAll('img').length,0);assert.equal(w.document.querySelectorAll('a[href*="hausperfekt-mobile.de"]').length,0);
 const title=[...w.document.querySelectorAll('button')].find(b=>b.textContent===entry.titel);title.click();await tick();await tick();
 assert.match(w.document.querySelector('[role=dialog]').textContent,/Objekt 4010/);assert.equal(w.document.querySelectorAll('[role=dialog] button[title="Datei in CuraAed sichern und herunterladen"]').length,2);
 [...w.document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Schließen').click();
 const search=w.document.getElementById('dms-suche');search.value='A&B';w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 assert.ok(calls.some(u=>u.includes('suche=A%26B')));
});
test('DMS-UI: spätes Suchergebnis eines anderen Kundenbestands wird verworfen',async t=>{
 let resolveA;const w=setup(t,async url=>{
  if(url.endsWith('/verbindungen'))return{verbindungen:[{id:'a',subdomain:'kunde-a'},{id:'b',subdomain:'kunde-b'}]};
  if(url.includes('/dms/a/'))return new Promise(r=>{resolveA=r;});
  return{dokumente:[{...entry,titel:'Kunde B'}],gesamt:1,seite:1,weitere:false};
 });
 await w.dmsMaske();const select=w.document.getElementById('dms-verbindung');assert.equal(select.value,'');
 select.value='a';select.dispatchEvent(new w.Event('change'));await tick();
 select.value='b';select.dispatchEvent(new w.Event('change'));await tick();
 resolveA({dokumente:[{...entry,titel:'Fremdes spätes Ergebnis'}],gesamt:1,seite:1,weitere:false});await tick();
 assert.match(w.document.body.textContent,/Kunde B/);assert.doesNotMatch(w.document.body.textContent,/Fremdes spätes Ergebnis/);
});
test('DMS-UI: Download nutzt nur eigenen Endpunkt; Fehler speichert keine Datei',async t=>{
 const w=setup(t,async()=>({verbindungen:[]}));let objectUrls=0,fetchUrl;
 w.URL.createObjectURL=()=>{objectUrls++;return'blob:test';};w.URL.revokeObjectURL=()=>{};
 w.fetch=async(url,options)=>{fetchUrl=url;assert.equal(options.credentials,'same-origin');return{ok:false,json:async()=>({fehler:'Datei fehlt in HP-Mobile'})};};
 const b=w.dmsDownloadKnopf('a',entry);w.document.body.append(b);b.click();await tick();await tick();
 assert.equal(fetchUrl,'/api/hausperfekt/dms/a/dokumente/9/download');assert.equal(objectUrls,0);assert.match(w.document.body.textContent,/Datei fehlt/);assert.equal(b.disabled,false);
});
