'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');const tick=()=>new Promise(r=>setImmediate(r));
test('Objektimport-UI erzeugt eigene Freigabe nur nach Zustimmung und zeigt Kopplung ausschließlich maskiert',async t=>{
 const dom=new JSDOM('<div id="desktop"></div><div id="modal-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window,calls=[];let copied='';
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});
 w.API={get:async url=>url==='/hp-adressen/verbindungen'?{verbindungen:[{id:'synthetic',aktiv:1,name:'Kunde',datenbank:'HPTEST'}]}:url==='/hp-objekte/konflikte'?{konflikte:[]}:{verbindungen:[]},post:async(url,body)=>{calls.push({url,body});return {id:'synthetic',token:'synthetic-secret',scope:'objekte-import-v1',datenbank:'HPTEST'};}};
 for(const file of ['ui','kern','shell','hp-objekte'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());vm.runInContext('S.lauf=1;S.benutzer={rolle:"admin"};',dom.getInternalVMContext());
 await w.hpObjektImportBereich(1,w.document.getElementById('desktop'));const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);
 button('Objektimport koppeln / Kopplung erneuern').click();await tick();button('Freigabe erstellen').click();await tick();assert.equal(calls.length,0);
 w.document.querySelector('input[type=checkbox]').checked=true;button('Freigabe erstellen').click();await tick();assert.equal(calls[0].url,'/hp-objekte/verbindungen');
 const secret=w.document.querySelector('input[aria-label="Geschützte Objektimport-Kopplung"]');assert.equal(secret.type,'password');assert.equal(w.document.body.textContent.includes('synthetic-secret'),false);assert.equal(copied,'');
 button('Objektimport-Kopplung kopieren').click();await tick();assert.equal(JSON.parse(copied).scope,'objekte-import-v1');button('Schließen').click();assert.equal(secret.value,'');
});

test('Prüffälle zeigen unveränderte Originalfelder als Text und lassen sich seitenweise lesen',async t=>{
 const dom=new JSDOM('<div id="modal-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window,urls=[];
 w.API={get:async url=>{urls.push(url);return {gesamt:26,seite:urls.length,weitere:urls.length===1,faelle:[{hp_objnr:4010,art:'funktion',quellschluessel:'1:7',grund:'Ende vor Beginn',gelesen_ms:1,original:{PFKt:'247',Info:'<img src=x onerror=alert(1)>',DatVon:'739230',DatBis:'739067'}}]};}};
 for(const file of ['ui','kern','shell','hp-objekte'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());
 await w.hpImportOriginaldaten();assert.ok(w.document.body.textContent.includes('739230'));assert.ok(w.document.body.textContent.includes('<img src=x onerror=alert(1)>'));assert.equal(w.document.querySelector('img'),null);
 const next=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Weitere Prüffälle');next.click();await tick();assert.ok(urls[1].endsWith('seite=2'));assert.equal(next.disabled,true);
});
