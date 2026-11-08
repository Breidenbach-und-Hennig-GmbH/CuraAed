'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');const tick=()=>new Promise(r=>setImmediate(r));
test('Adressabgleich-UI: eigene Freigabe, verdeckte Daten, explizite Kopieraktion und Löschen beim Schließen',async t=>{
 const dom=new JSDOM('<div id="desktop"></div><div id="modal-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window,calls=[];let copied='';Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async x=>{copied=x;}}});
 w.API={get:async()=>({verbindungen:[]}),post:async(url,body)=>{calls.push({url,body});return {id:'synthetic',token:'synthetic-secret'};}};
 for(const file of ['ui','kern','hp-adressen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());vm.runInContext('S.lauf=1;S.benutzer={rolle:"admin"};',dom.getInternalVMContext());await w.hpAdressBereich(1,w.document.getElementById('desktop'));
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);button('Adressabgleich koppeln / Freigabe erneuern').click();w.document.getElementById('f_name').value='Testkunde';w.document.getElementById('f_datenbank').value='HPTEST';const form=w.document.querySelector('form');form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(calls.length,0);
 form.querySelector('input[type=checkbox]').checked=true;form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();const secret=w.document.querySelector('input[aria-label="Geschützte Adresskopplung"]');assert.equal(secret.type,'password');assert.equal(w.document.body.textContent.includes('synthetic-secret'),false);assert.equal(copied,'');button('Adresskopplungsdaten kopieren').click();await tick();assert.equal(JSON.parse(copied).scope,'adressen-v1');button('Schließen').click();assert.equal(secret.value,'');
});

