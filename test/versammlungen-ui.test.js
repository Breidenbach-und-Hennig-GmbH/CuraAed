'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
test('ETV-Maske: Versammlungsort ist sichtbar, wird gespeichert und beim Kopieren vorbelegt',async t=>{
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});
 t.after(()=>dom.window.close());const w=dom.window;let saved;
 w.API={get:async url=>url==='/mitarbeiter'?[{id:1,name:'Testleitung'}]:url.endsWith('/versammlungsorte')?[]:[{id:1,nummer:'1001',bezeichnung:'Testobjekt'}],put:async(url,data)=>{saved={url,data};},post:async(url,data)=>{saved={url,data};return{id:9,...data};}};
 for(const file of ['ui','kern','dialoge','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());
 w.neuLaden=()=>{};
 const v={id:7,objekt_id:1,leitung_id:1,name:'ETV Test',datum:'2026-11-20',ort:'Rathaus',ort_strasse:'Testweg 12',ort_plz:'01234',ort_stadt:'Musterstadt',ort_beschreibung:'<b>Hintereingang</b>'};
 await w.versammlungForm(v);
 assert.ok(w.document.querySelector('[aria-label="Versammlungsort"]'));
 assert.equal(w.document.getElementById('f_ort_plz').value,'01234');assert.equal(w.document.querySelector('[aria-label="Versammlungsort"] b'),null);
 w.document.getElementById('f_ort_strasse').value='Testweg 14';
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Speichern').click();await tick();
 assert.equal(saved.url,'/versammlungen/7');assert.equal(saved.data.ort_strasse,'Testweg 14');assert.equal(saved.data.ort_beschreibung,'<b>Hintereingang</b>');
 await w.versammlungForm(v,{kopie:true});
 assert.equal(w.document.getElementById('f_ort_stadt').value,'Musterstadt');assert.equal(w.document.getElementById('f_datum').value,'');
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Neuen Ort hinzufügen').click();
 const name=w.document.getElementById('etv-neu-ort');assert.ok(name);assert.equal(w.document.querySelectorAll('#f_ort').length,1);name.value='Neuer Saal';
 w.document.getElementById('etv-neu-ort_stadt').value='Neue Stadt';
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Ort speichern').click();await tick();await tick();
 assert.equal(saved.url,'/objekte/1/versammlungsorte');assert.equal(w.document.getElementById('f_ort').value,'Neuer Saal');assert.equal(w.document.getElementById('f_ort_stadt').value,'Neue Stadt');

});

test('ETV-Ortsauswahl: Auswahl übernimmt Adresse, Objektwechsel entfernt alte Orte und ignoriert verspätete Antworten',async t=>{
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());
 const w=dom.window;let resolveA;
 const a={id:1,ort:'Saal A',ort_strasse:'A-Weg 1',ort_plz:'01234',ort_stadt:'A-Stadt'},b={id:2,ort:'Saal B',ort_strasse:'B-Weg 2',ort_stadt:'B-Stadt'};
 w.API={get:async url=>url==='/mitarbeiter'?[]:url==='/objekte'?[{id:1,nummer:'1001'},{id:2,nummer:'1002'}]:url.includes('/2/')?[b]:new Promise(r=>{resolveA=r;})};
 for(const file of ['ui','kern','dialoge','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());
 await w.versammlungForm(null);
 const object=w.document.getElementById('f_objekt_id'),select=w.document.getElementById('etv-ort-auswahl');
 assert.equal(select.disabled,true);
 object.value='1';object.dispatchEvent(new w.Event('change'));await tick();
 object.value='2';object.dispatchEvent(new w.Event('change'));await tick();
 select.value='2';select.dispatchEvent(new w.Event('change'));assert.equal(w.document.getElementById('f_ort_stadt').value,'B-Stadt');
 resolveA([a]);await tick();assert.equal(select.value,'2');assert.doesNotMatch(select.textContent,/Saal A/);
 object.value='';object.dispatchEvent(new w.Event('change'));assert.equal(w.document.getElementById('f_ort').value,'');assert.equal(w.document.getElementById('f_ort_stadt').value,'');assert.equal(select.disabled,true);
});

test('ETV-Leitung: Personenauswahl speichert ID und bietet bisherige inaktive Leitung beim Bearbeiten weiter an',async t=>{
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());
 const w=dom.window;let saved;w.API={get:async url=>url==='/mitarbeiter'?[{id:1,name:'Testleitung',kuerzel:'TST'}]:url==='/objekte'?[{id:1,nummer:'1001'}]:[],post:async(url,data)=>{saved=data;}};
 for(const file of ['ui','kern','dialoge','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());w.neuLaden=()=>{};
 await w.versammlungForm(null);assert.ok(w.document.querySelector('[aria-label="Versammlungsteilnahme (intern)"]'));
 const person=w.document.getElementById('f_leitung_id');person.value='1';
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Speichern').click();await tick();assert.equal(saved.leitung_id,'1');
 const old={id:8,objekt_id:1,name:'Alte ETV',datum:'2026-11-20',leitung_id:9,leitung_name:'Frühere Leitung'};
 await w.versammlungForm(old);assert.equal(w.document.getElementById('f_leitung_id').value,'9');assert.match(w.document.getElementById('f_leitung_id').textContent,/Frühere Leitung/);
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Abbrechen').click();
 await w.versammlungForm(old,{kopie:true});assert.equal(w.document.getElementById('f_leitung_id').value,'');
});
