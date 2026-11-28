'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
test('Kontenrahmen: nur bebuchte Konten im ausgewählten Jahr, Storno-Saldo null bleibt sichtbar, Ausblenden löscht nichts',async t=>{
 const dom=new JSDOM('<div id="target"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());
 const w=dom.window,calls=[],konten=[{id:1,nummer:1000,bezeichnung:'Storno ausgeglichen',art:'S',aktiv:1,buchungen:2,saldo:0,wp_ansatz:10},{id:2,nummer:1100,bezeichnung:'Noch nicht bebucht',art:'S',aktiv:1,buchungen:0,saldo:null,wp_ansatz:100},{id:3,nummer:8100,bezeichnung:'Girokonto',art:'B',aktiv:1,buchungen:1,saldo:25,wp_ansatz:0}];
 w.API={qs:o=>'?jahr='+o.jahr,get:async url=>{calls.push(url);return url.endsWith('/fibu')?{objekt:{objekttyp:'WEG'},jahre:[2025],grundwerte:{erstes_bj:2025,aktuelles_bj:2025,rechnungsart:'eue'}}:konten;}};
 for(const name of ['adressdaten','ui','kern','shell','dialoge','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js',name+'.js'),'utf8'),dom.getInternalVMContext());
 vm.runInContext('S.lauf=1;S.kontext={};S.benutzer={id:1,rolle:"admin"};',dom.getInternalVMContext());
 await w.kontenrahmenAnsicht({id:1,nummer:'4074',bezeichnung:'Test'},w.document.getElementById('target'),1,'2025');await new Promise(r=>setImmediate(r));
 const rows=()=>[...w.document.querySelectorAll('tbody tr')].map(r=>r.textContent);
 assert.equal(rows().length,2);assert.ok(rows().some(r=>r.includes('Storno ausgeglichen')));assert.ok(!rows().some(r=>r.includes('Noch nicht bebucht')));
 assert.match(w.document.querySelector('.cu-summe').textContent,/110,00/);
 const checkbox=w.document.querySelector('input[type=checkbox]');assert.equal(checkbox.checked,true);
 checkbox.checked=false;checkbox.dispatchEvent(new w.Event('change'));assert.equal(rows().length,3);assert.equal(konten.length,3);
 checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change'));assert.equal(rows().length,2);
 assert.ok(calls.includes('/objekte/1/sachkonten?jahr=2025'));assert.equal(calls.length,2);
});
