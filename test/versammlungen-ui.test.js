'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
test('ETV-Maske: Versammlungsort ist sichtbar, wird gespeichert und beim Kopieren vorbelegt',async t=>{
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});
 t.after(()=>dom.window.close());const w=dom.window;let saved;
 w.API={get:async()=>[{id:1,nummer:'1001',bezeichnung:'Testobjekt'}],put:async(url,data)=>{saved={url,data};},post:async(url,data)=>{saved={url,data};}};
 for(const file of ['ui','kern','dialoge','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());
 w.neuLaden=()=>{};
 const v={id:7,objekt_id:1,name:'ETV Test',datum:'2026-11-20',ort:'Rathaus',ort_strasse:'Testweg 12',ort_plz:'01234',ort_stadt:'Musterstadt',ort_beschreibung:'<b>Hintereingang</b>'};
 await w.versammlungForm(v);
 assert.ok(w.document.querySelector('[aria-label="Versammlungsort"]'));
 assert.equal(w.document.getElementById('f_ort_plz').value,'01234');assert.equal(w.document.querySelector('[aria-label="Versammlungsort"] b'),null);
 w.document.getElementById('f_ort_strasse').value='Testweg 14';
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Speichern').click();await tick();
 assert.equal(saved.url,'/versammlungen/7');assert.equal(saved.data.ort_strasse,'Testweg 14');assert.equal(saved.data.ort_beschreibung,'<b>Hintereingang</b>');
 await w.versammlungForm(v,{kopie:true});
 assert.equal(w.document.getElementById('f_ort_stadt').value,'Musterstadt');assert.equal(w.document.getElementById('f_datum').value,'');
});
