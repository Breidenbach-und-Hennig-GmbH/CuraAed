'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
test('Benutzerformular: Kürzel groß, maximal 3, ungültige Eingaben sperren, Speichern über API',async t=>{
 const dom=new JSDOM('<div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://example.test/'});t.after(()=>dom.window.close());
 const w=dom.window,calls=[]; w.API={put:async(url,body)=>calls.push({url,body})};
 for(const f of ['ui','kern','dialoge'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),dom.getInternalVMContext());
 vm.runInContext('L.benutzerRolle={mitarbeiter:"Mitarbeiter"}; neuLaden=()=>{};',dom.getInternalVMContext());
 w.benutzerFormular({id:7,name:'Test Person',rolle:'mitarbeiter',aktiv:1,kuerzel:'FD'});
 const input=w.document.getElementById('f_kuerzel');assert.equal(input.maxLength,3);assert.equal(input.value,'FD');
 input.value='abc';input.dispatchEvent(new w.Event('input'));assert.equal(input.value,'ABC');
 const save=[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Speichern');
 for(const value of ['ABCD','A1','Ä']){input.value=value;save.click();await tick();assert.equal(calls.length,0);}
 input.value='ZZ';save.click();await tick();assert.equal(calls.length,1);assert.equal(calls[0].body.kuerzel,'ZZ');assert.equal(calls[0].url,'/benutzer/7');
});
