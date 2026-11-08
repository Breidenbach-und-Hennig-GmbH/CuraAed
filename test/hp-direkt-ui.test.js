'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');const tick=()=>new Promise(r=>setImmediate(r));
async function fixture(t,{fresh=true,role='admin'}={}){
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example'});t.after(()=>dom.window.close());const w=dom.window,calls=[];
 const v={id:'own-test',name:'Eigener Test',datenbank:'TESTDB',test_nummer:123,ablauf_ms:Date.now()+100000,zuletzt_gesehen:Date.now(),snapshot:{name:'CURAAED-TEST',titel:'Alt'},version:'fresh-version',gelesen_am:Date.now()-(fresh?0:61000),auftraege:[]};
 w.API={get:async url=>{calls.push({method:'GET',url});return {verbindungen:[v]};},post:async(url,body)=>{calls.push({method:'POST',url,body:JSON.parse(JSON.stringify(body))});return {id:'own-test',token:'synthetic-token',ablauf_ms:Date.now()+100000};}};
 for(const file of ['ui','kern','hp-direkt'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js',file+'.js'),'utf8'),dom.getInternalVMContext());
 vm.runInContext('S.lauf=1;S.benutzer={rolle:'+JSON.stringify(role)+'};',dom.getInternalVMContext());await w.hpDirektBereich(1,w.document.getElementById('hp-desktop'));
 return {w,calls,button:text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text)};
}
test('Direkte HP UI: schreibt erst nach ausdrücklicher Bestätigung mit passender Verbindung und Version',async t=>{
 const f=await fixture(t);assert.equal(f.calls.filter(x=>x.method==='POST').length,0);
 const input=f.w.document.querySelector('input[aria-label="Titel des HP-Testkontakts"]');input.value='Neuer Test';f.button('Titel in HP speichern').click();await tick();
 assert.equal(f.calls.filter(x=>x.method==='POST').length,0);f.button('Bestätigen').click();await tick();
 const sent=f.calls.find(x=>x.method==='POST');assert.equal(sent.url,'/hp-direkt/verbindungen/own-test/auftrag');assert.equal(sent.body.art,'titel');assert.equal(sent.body.neu,'Neuer Test');assert.equal(sent.body.version,'fresh-version');
});
test('Direkte HP UI: veralteter Lesestand sperrt Schreiben, Mitarbeiter erhält keine Kopplungsoberfläche',async t=>{
 const stale=await fixture(t,{fresh:false});assert.equal(stale.button('Titel in HP speichern').disabled,true);
 const staff=await fixture(t,{role:'mitarbeiter'});assert.equal(staff.calls.length,0);assert.equal(staff.w.document.querySelectorAll('button').length,0);
});

