'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t){
 const dom=new JSDOM('<button id="start">Suchen</button><div id="modal-container"></div><div id="toast-container"></div>',{url:'https://example.test',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window,calls=[];w.API={qs:p=>'?'+new URLSearchParams(p),get:async url=>{calls.push(url);return [{id:1,nummer:'HP-9',name:'Test, Anna',pf_status:'ohne'}];}};
 w.geheZu=url=>calls.push(url);
 for(const file of ['adressdaten','ui','kern','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());
 return {w,calls,button:text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text)};
}
test('Gesamtliste kombiniert Filter und Sortierung, Tab/Enter bleiben nutzbar',async t=>{
 const {w,calls}=setup(t);w.gesamtlisteAdresse(1);await tick();
 const name=w.document.querySelector('[aria-label="Name / Firma filtern"]'),ort=w.document.querySelector('[aria-label="Ort filtern"]');
 name.value='Anna';ort.value='Köln';ort.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();
 let p=new URL('https://test'+calls.at(-1)).searchParams;assert.equal(p.get('name'),'Anna');assert.equal(p.get('ort'),'Köln');
 const sort=w.document.querySelector('th[aria-sort] button');sort.click();await tick();sort.click();await tick();
 p=new URL('https://test'+calls.at(-1)).searchParams;assert.equal(p.get('sort'),'nummer');assert.equal(p.get('richtung'),'desc');assert.equal(p.get('ort'),'Köln');
 w.document.querySelector('[aria-label="Adressen"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(w.location.hash,'#/adressen/1');assert.equal(w.document.querySelector('[role=dialog]'),null);
});
test('Arbeitsfenster lässt sich ziehen, skalieren, maximieren und merkt seine Größe',async t=>{
 const {w}=setup(t);w.document.getElementById('start').focus();w.gesamtlisteAdresse(1);await tick();
 const box=w.document.querySelector('[role=dialog]'),griff=box.querySelector('[aria-label="Fenstergröße ändern"]');
 const original=+box.style.width.replace('px','');griff.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(parseFloat(box.style.width),original-24);
 const pointer=(node,type,x,y)=>node.dispatchEvent(new w.MouseEvent(type,{button:0,clientX:x,clientY:y,bubbles:true,cancelable:true}));
 pointer(box.querySelector('h2'),'pointerdown',30,40);pointer(w.document,'pointermove',50,60);pointer(w.document,'pointerup',50,60);assert.equal(box.style.left,'44px');
 box.querySelector('[aria-label="Maximieren"]').click();assert.equal(box.style.width,(w.innerWidth-16)+'px');box.querySelector('[aria-label="Wiederherstellen"]').click();assert.equal(parseFloat(box.style.width),original-24);
 box.querySelector('[aria-label="Schließen"]').click();assert.equal(w.document.activeElement.id,'start');
 w.gesamtlisteAdresse(1);assert.equal(parseFloat(w.document.querySelector('[role=dialog]').style.width),original-24);
});
test('Gesamtliste verwirft verspätete Antworten nach Schließen',async t=>{
 const {w}=setup(t);let resolve;w.API.get=()=>new Promise(r=>{resolve=r;});w.gesamtlisteAdresse();w.document.querySelector('[aria-label="Schließen"]').click();resolve([{id:1}]);await tick();assert.equal(w.document.querySelector('[role=dialog]'),null);assert.equal(w.document.getElementById('toast-container').textContent,'');
});
