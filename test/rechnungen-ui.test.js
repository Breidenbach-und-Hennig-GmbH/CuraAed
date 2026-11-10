'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t,get){const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window;w.logout=()=>{};w.passwortDialog=()=>{};w.pfktCodesDialog=()=>{};w.API={get,qs:o=>'?'+new URLSearchParams(o)};for(const file of ['ui','kern','rechnungen','shell'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());w.eval('S.lauf=1;S.benutzer={rolle:"admin",name:"Test"};');return w;}
const doc={id:3,titel:'Lieferantenrechnung',original_name:'rechnung.pdf',dokument_datum:'2026-11-07',verknuepfungen:[]};
test('Rechnungsmaske: Strg+R öffnet ausgewähltes Dokument, bildet Felder ab und speichert verknüpft',async t=>{
 const w=setup(t,async()=>({dokument:doc,rechnung:null}));let payload;w.API.post=async(url,b)=>{payload={url,b};return{id:12,revision:1};};
 w.eval('S.kontext.rechnungsDokument='+JSON.stringify(doc));
 const event=new w.KeyboardEvent('keydown',{key:'r',code:'KeyR',ctrlKey:true,cancelable:true,bubbles:true});w.document.dispatchEvent(event);assert.equal(event.defaultPrevented,true);await tick();
 assert.match(w.document.querySelector('[role=dialog]').textContent,/Eingangsrechnung erfassen/);
 for(const label of ['Lieferantenkonto','Bankverbindung','Rechnungs-Nr.','Rechnungsbeleg','Rechnungsdatum','Eingangsdatum','Buchungstext 3','Verwendungszweck 2','HWA-Nr.','Akte','FIBU-BJ'])assert.ok([...w.document.querySelectorAll('label')].some(l=>l.textContent===label),label);
 assert.equal(w.document.getElementById('rechnung-rechnungsbeleg').value,doc.titel);
 w.document.getElementById('rechnung-betrag').value='1234,56';w.document.getElementById('rechnung-ziel1_tage').value='7';w.document.getElementById('rechnung-ziel1_skonto').value='2,00';w.document.getElementById('rechnung-ziel1_skonto').dispatchEvent(new w.Event('input'));
 assert.match(w.document.querySelector('.cu-rechnung-ziel').textContent,/24,69/);assert.match(w.document.querySelector('.cu-rechnung-ziel').textContent,/14.11.2026/);
 const second=new w.KeyboardEvent('keydown',{key:'r',code:'KeyR',ctrlKey:true,cancelable:true,bubbles:true});w.document.dispatchEvent(second);assert.equal(second.defaultPrevented,true);assert.equal(w.document.querySelectorAll('.cu-rechnungsmaske').length,1);
 [...w.document.querySelectorAll('footer button')].find(b=>b.textContent==='OK').click();await tick();assert.equal(payload.url,'/eingangsrechnungen/dokument');assert.equal(payload.b.dokument.id,3);assert.equal(payload.b.revision,0);assert.equal(payload.b.daten.betrag,'1234,56');assert.equal(w.document.querySelector('[role=dialog]'),null);
});
test('Rechnungsmaske: Abbrechen schreibt nichts; verspäteter Abruf nach Navigation öffnet kein Fenster',async t=>{
 let calls=0;const w=setup(t,async()=>({dokument:doc,rechnung:null}));w.API.post=async()=>{calls++;};
 await w.rechnungMaske(doc);[...w.document.querySelectorAll('footer button')].find(b=>b.textContent==='Abbrechen').click();assert.equal(calls,0);
 let resolve;w.API.get=()=>new Promise(r=>resolve=r);const pending=w.rechnungMaske(doc);w.eval('S.lauf=2');resolve({dokument:doc,rechnung:null});await pending;assert.equal(w.document.querySelector('[role=dialog]'),null);
});

test('Alt+S, R: Dokumentauswahl bleibt beim Menüaufruf erhalten, auch mit gehaltener Alt-Taste',async t=>{
 for(const halten of [false,true]){
  const w=setup(t,async()=>({dokument:doc,rechnung:null}));w.document.body.prepend(w.baueMenueleiste());
  const table=w.document.createElement('table'),row=w.document.createElement('tr');row.tabIndex=0;row.hpDaten=doc;table.append(row);w.document.body.append(table);row.focus();
  row.dispatchEvent(new w.KeyboardEvent('keydown',{key:'s',code:'KeyS',altKey:true,bubbles:true,cancelable:true}));
  const menu=w.document.querySelector('[role=menu][aria-label="Sprünge"]');assert.ok(menu);
  w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'r',code:'KeyR',altKey:halten,bubbles:true,cancelable:true}));await tick();
  assert.ok(w.document.querySelector('.cu-rechnungsmaske'));assert.equal(w.document.getElementById('rechnung-rechnungsbeleg').value,doc.titel);assert.equal(w.document.querySelector('[role=menu]'),null);
 }
});
test('Alt+S, R öffnet die Rechnungsmaske auch aus der Dokumentvorschau',async t=>{
 const w=setup(t,async()=>({dokument:doc,rechnung:null}));w.document.body.prepend(w.baueMenueleiste());
 const m=w.eval("UI.modal({titel:'Dokumentvorschau',inhalt:document.createElement('p')})");m.box.hpRechnungsDokument=doc;
 m.box.dispatchEvent(new w.KeyboardEvent('keydown',{key:'s',code:'KeyS',altKey:true,bubbles:true,cancelable:true}));
 assert.ok(w.document.querySelector('[role=menu][aria-label="Sprünge"]'));
 w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'r',code:'KeyR',bubbles:true,cancelable:true}));await tick();assert.ok(w.document.querySelector('.cu-rechnungsmaske'));
});

test('Startseite: Dokumente öffnet das DMS mit Sachbearbeiterauswahl',t=>{
 const w=setup(t,async()=>({}));w.eval(fs.readFileSync(path.join(__dirname,'../public/js/masken.js'),'utf8')+'\nstartMaske();');
 const tile=[...w.document.querySelectorAll('a.cu-kachel')].find(a=>a.querySelector('strong').textContent==='Dokumente');assert.equal(tile.getAttribute('href'),'#/dms');
});

test('Rechnungserkennung überschreibt eine bereits gespeicherte Rechnung nicht',async t=>{
 const w=setup(t,async()=>({dokument:doc,erkennung:{rechnung:true,felder:{rechnungs_nr:'OCR-NEU',betrag:'999,00'},hinweise:[]},rechnung:{id:2,revision:4,erstellt_am:'2026-11-10 10:00:00',daten:{rechnungs_nr:'MANUELL-42',betrag:'120,50'},pruefungen:{}}}));
 await w.rechnungMaske(doc);assert.equal(w.document.getElementById('rechnung-rechnungs_nr').value,'MANUELL-42');assert.equal(w.document.getElementById('rechnung-betrag').value,'120,50');assert.match(w.document.querySelector('.cu-rechnung-erkannt').textContent,/unverändert/);
});

test('ZUGFeRD-Maske: Positionen, Lieferant, Steuern und Zahlbetrag sind sichtbar; XML-Text bleibt Text',async t=>{
 const erkennung={rechnung:true,methode:'ZUGFeRD / Factur-X (XML)',felder:{rechnungs_nr:'ZF-42',betrag:'1190,00',teilzahlung:'200,00'},hinweise:[],struktur:{format:'ZUGFeRD / Factur-X',profil:'urn:cen.eu:en16931:2017',typ:'380',waehrung:'EUR',dateiname:'factur-x.xml',lieferant:{name:'<img src=x onerror=alert(1)>'},empfaenger:{name:'Testverwaltung'},kaeuferreferenz:'OB-42',zahlungsreferenz:'ZF-42',iban:['DE89370400440532013000'],zahlungsbedingungen:['14 Tage'],positionen:[{nummer:'1',name:'Wartung',menge:'1',einheit:'C62',netto:'1000.00'}],steuern:[{art:'VAT',kategorie:'S',satz:'19.00',basis:'1000.00',betrag:'190.00'}],summen:{brutto:'1190,00',zahlbetrag:'990,00',vorauszahlung:'200,00',steuerbasis:'1000,00',steuer:'190,00',rundung:''}}};
 const w=setup(t,async()=>({dokument:doc,rechnung:null,erkennung}));await w.rechnungMaske(doc);assert.equal(w.document.getElementById('rechnung-betrag').value,'1190,00');assert.equal(w.document.querySelector('input[name=teilzahlung]').value,'200,00');
 const section=w.document.querySelector('.cu-zugferd-daten');assert.match(section.textContent,/990,00/);assert.match(section.textContent,/Wartung/);assert.match(section.textContent,/19,00/);assert.equal(w.document.querySelectorAll('img').length,0);
});
