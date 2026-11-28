'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(t,rolle='admin') {
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());
 const w=dom.window,calls=[],row={externe_id:'12',name:'<img src=x onerror=alert(1)>',email:'kunde@example.test',status:'pruefen',hinweise:['Zuordnung fehlt']};
 w.API={get:async url=>{calls.push({method:'GET',url});return url.endsWith('/quellen')?{quellen:[{id:'s',subdomain:'kunde',direkt_id:'direct'}]}:{gesamt:1,konten:[row]};},post:async(url,body)=>{calls.push({method:'POST',url,body});return url.endsWith('/vorschau')?{pruefwert:'checked',summen:{kunden:1,pruefen:1,intern_ausgeschlossen:0},konten:[row]}:{neu:1,aktualisiert:0,unveraendert:0,nicht_mehr_in_quelle:0};}};
 for(const name of ['adressdaten','ui','kern','shell','kundenverwaltung']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js',name+'.js'),'utf8'),dom.getInternalVMContext());
 vm.runInContext('S.lauf=1;S.benutzer={id:1,rolle:'+JSON.stringify(rolle)+'};',dom.getInternalVMContext());
 return {w,calls,open:async()=>{await w.kundenMaske();await tick();},button:text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text),async file(){const f=w.document.querySelector('input[type=file]');Object.defineProperty(f,'files',{configurable:true,value:[{name:'kunden.json',size:100,text:async()=>JSON.stringify({version:1})}]});f.dispatchEvent(new w.Event('change'));await tick();}};
}
test('Kundenmaske: kompakte Arbeitsmaske, Vorschau vor Übernahme, keine HTML-Ausführung oder Freischaltung',async t=>{
 const f=fixture(t);await f.open();assert.equal(f.w.document.querySelectorAll('img').length,0);
 f.button('Übernehmen').click();await tick();assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
 await f.file();f.button('Vorschau').click();await tick();
 assert.equal(f.calls.filter(c=>c.url==='/kunden/vorschau').length,1);
 f.button('Übernehmen').focus();assert.equal(f.w.document.activeElement,f.button('Übernehmen'));
 f.button('Übernehmen').click();await tick();
 assert.equal(f.calls.find(c=>c.url==='/kunden/uebernehmen').body.pruefwert,'checked');
 assert.match(f.w.document.body.textContent,/Keine Anmeldung freigeschaltet/);
 assert.equal(f.w.document.querySelectorAll('img').length,0);
 f.button('Übernehmen').click();await tick();assert.equal(f.calls.filter(c=>c.url==='/kunden/uebernehmen').length,1);
});
test('Kundenmaske: Mitarbeiter erhalten weder Kundenliste noch Importaktionen',async t=>{
 const f=fixture(t,'mitarbeiter');await f.open();assert.equal(f.calls.length,0);assert.equal(f.button('Übernehmen'),undefined);
});
