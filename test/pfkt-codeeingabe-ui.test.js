'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const codes=[{code:'002',rolle:'eigentuemer',bezeichnung:'Eigentümer fremdvermietet'},{code:'005',rolle:'mieter',bezeichnung:'Mieter'},{code:'00X',rolle:'eigentuemer',bezeichnung:'Sonstiges Abr.'},{code:'$',rolle:'handwerker',bezeichnung:'Sonderfunktion'}];
function setup(t){const d=new JSDOM('<div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/#/einheiten/1'});t.after(()=>d.window.close());for(const f of ['adressdaten','ui','kern','shell','dialoge','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());d.window.eval('S.lauf=1;S.benutzer={id:1,rolle:"mitarbeiter"}');d.window.API={qs:o=>'?',get:async url=>url==='/pfkt-codes'?codes:[]};return d.window;}
const type=(w,input,value)=>{input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));};
const save=w=>[...w.document.querySelectorAll('footer button')].find(b=>b.textContent==='Speichern').click();
const tick=()=>new Promise(r=>setTimeout(r,10));
test('002 direkt tippen und Tab: Rolle, Bezeichnung und gespeicherter Code stimmen überein',async t=>{
 const w=setup(t);let payload;w.API.post=async(url,b)=>payload=b;
 await w.zuordnungFormular({adresse_id:11,einheit_id:1,rolle:'mieter'},()=>{});
 const input=w.document.getElementById('f_pfkt_code');assert.equal(input.tagName,'INPUT');assert.equal(input.type,'text');
 type(w,input,'002');const tab=new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});input.dispatchEvent(tab);
 assert.equal(tab.defaultPrevented,false);assert.equal(input.value,'002');assert.equal(w.document.getElementById('f_rolle').value,'eigentuemer');
 assert.match(w.document.getElementById('f_pfkt_code_bezeichnung').textContent,/fremdvermietet/);
 save(w);await tick();assert.equal(payload.pfkt_code,'002');assert.equal(payload.rolle,'eigentuemer');
});
test('Unbekannte Codes sperren Speichern, kurze Nummern werden nur auf bekannte Codes ergänzt; Buchstaben und $ bleiben möglich',async t=>{
 const w=setup(t);let posts=0;w.API.post=async()=>posts++;
 await w.zuordnungFormular({adresse_id:11,einheit_id:1},()=>{});
 const input=w.document.getElementById('f_pfkt_code');type(w,input,'999');save(w);await tick();assert.equal(posts,0);assert.equal(input.checkValidity(),false);
 type(w,input,'2');input.dispatchEvent(new w.Event('blur'));assert.equal(input.value,'002');assert.equal(input.checkValidity(),true);
 type(w,input,'00x');input.dispatchEvent(new w.Event('blur'));assert.equal(input.value,'00X');assert.equal(input.checkValidity(),true);
 type(w,input,'$');input.dispatchEvent(new w.Event('blur'));assert.equal(input.value,'$');assert.equal(w.document.getElementById('f_rolle').value,'handwerker');
 type(w,input,'005');assert.equal(w.document.getElementById('f_rolle').value,'mieter');
 w.document.getElementById('f_rolle').value='eigentuemer';w.document.getElementById('f_rolle').dispatchEvent(new w.Event('change'));assert.equal(input.value,'');
});
test('Eigentümer-Code lässt sich nicht als allgemeine Objektfunktion anlegen',async t=>{
 const w=setup(t);await w.zuordnungFormular({objekt_id:1},()=>{});
 const input=w.document.getElementById('f_pfkt_code');type(w,input,'002');input.dispatchEvent(new w.Event('blur'));
 assert.equal(input.checkValidity(),false);assert.match(input.validationMessage,/Wohnung/);assert.notEqual(w.document.getElementById('f_rolle').value,'eigentuemer');
});
test('Personenkonto übernimmt direkt eingegebenen Code mit führenden Nullen',async t=>{
 const w=setup(t);let payload;w.API.post=async(url,b)=>{payload=b;return{pkto_id:8};};
 await w.pktoAnlegen({rolle:'eigentuemer',name:'Test',zuordnung_id:10});
 const input=w.document.getElementById('f_pfkt_code');type(w,input,'2');save(w);await tick();assert.equal(payload.pfkt_code,'002');assert.equal(payload.zuordnung_id,10);
});
