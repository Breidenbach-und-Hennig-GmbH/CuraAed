'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function setup(t){const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/'});t.after(()=>dom.window.close());for(const f of ['ui','kern','shell'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),dom.getInternalVMContext());dom.window.eval('S.benutzer={rolle:"admin",kuerzel:"FD"};S.lauf=1');return dom.window;}
test('Gemeinsamer Rahmen verschiebt bestehende Aktionen ohne Verlust von Zustand oder Listenern',t=>{
 const w=setup(t);w.eval(`let geklickt=0;const originalKnopf=el('button',{text:'Prüfen',onclick:()=>geklickt++});const eingabe=el('input',{value:'Entwurf'});const rail=seitenleiste([]);rail.querySelector('.hp-knoepfe').append(originalKnopf);const frame=maskenFenster({titel:'Test',inhalt:maskenRaster({oben:[],seite:rail,unten:[eingabe]})});document.getElementById('hp-desktop').append(frame);originalKnopf.click();window.ergebnis={geklickt,identisch:frame.querySelector('.cu-hp-arbeitsbereich>.hp-seitenleiste')===rail,wert:eingabe.value,knopf:frame.contains(originalKnopf)};`);
 assert.equal(w.ergebnis.geklickt,1);assert.equal(w.ergebnis.identisch,true);assert.equal(w.ergebnis.wert,'Entwurf');assert.equal(w.ergebnis.knopf,true);assert.equal(w.document.querySelectorAll('.hp-seitenleiste').length,1);
});
test('DMS-Knöpfe behalten ihre deaktivierte und später aktivierte Originalinstanz',t=>{
 const w=setup(t);w.eval(`let aufrufe=0;const b=el('button',{text:'Rechnung',disabled:true,onclick:()=>aufrufe++}),root=el('div',{},[el('aside',{class:'cu-dms-aktionen'},[b])]);const frame=maskenFenster({titel:'DMS',inhalt:root});document.getElementById('hp-desktop').append(frame);b.click();b.disabled=false;b.click();window.dmsErgebnis={aufrufe,verschoben:!!frame.querySelector('.hp-seitenleiste .cu-dms-aktionen'),identisch:frame.querySelector('.cu-dms-aktionen button')===b};`);
 assert.equal(w.dmsErgebnis.aufrufe,1);assert.equal(w.dmsErgebnis.verschoben,true);assert.equal(w.dmsErgebnis.identisch,true);
});
test('Asynchrone Maskentitel können nach dem Laden weiter aktualisiert werden',t=>{
 const w=setup(t);w.eval(`const root=el('div');arbeitsMaske(1,root,{titel:'Ticket lädt'});root.cuTitelSetzen('Ticket CA-42');`);
 assert.equal(w.document.querySelector('.cu-hp-titelbar h1').textContent,'Ticket CA-42');assert.equal(w.document.querySelector('.hp-maske').getAttribute('aria-label'),'Ticket CA-42');
});
test('Kompaktes Eingabefenster behält Esc-Speichern und Strg-Esc-Abbrechen',t=>{
 const w=setup(t);w.eval(`let saves=0;function oeffnen(){const form=el('form',{},[el('input',{value:'Alt'})]);return UI.modal({titel:'Ändern',inhalt:form,footer:close=>[el('button',{class:'btn-primary',text:'Speichern',onclick:()=>{saves++;close();}})]});}let m=oeffnen();m.box.querySelector('input').value='Neu';document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));window.nachSpeichern=saves;m=oeffnen();m.box.querySelector('input').value='Weiter';document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',ctrlKey:true,bubbles:true}));window.nachAbbruch=saves;`);
 assert.equal(w.nachSpeichern,1);assert.equal(w.nachAbbruch,1);assert.equal(w.document.querySelector('[role=dialog]'),null);
});
test('F1 enthält die im HP-Original vorhandenen maskenspezifischen Befehle',t=>{
 const w=setup(t);w.eval(`S.kontext={typ:'objekt'};sprungUebersicht();`);assert.match(w.document.querySelector('[role=dialog]').textContent,/Tastaturbefehle zum Objekt · HausPerfekt-Original/);assert.match(w.document.querySelector('[role=dialog]').textContent,/Strg jJahreskalender/);assert.match(w.document.querySelector('[role=dialog]').textContent,/Alt S, FFiBu Gesamtmenü/);
});
test('Nach rechts verschobener Submit-Knopf sendet weiterhin nur sein ursprüngliches Formular',t=>{
 const w=setup(t);w.eval(`let gesendet=0;const form=el('form',{onsubmit:e=>{e.preventDefault();gesendet++;}}),button=el('button',{type:'submit',text:'Senden'}),actions=el('div',{},[button]),root=el('div',{},[form]);form.append(actions);arbeitsMaske(1,root,{titel:'E-Mail'});maskenAktionenRechts(root,actions);window.formverbunden=button.form===form;button.click();window.gesendet=gesendet;`);
 assert.equal(w.formverbunden,true);assert.equal(w.gesendet,1);
});
