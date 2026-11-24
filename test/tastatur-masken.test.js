'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t){const d=new JSDOM('<button id="zurueck">Ausgang</button><div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/'});t.after(()=>d.window.close());for(const f of ['ui','kern','shell','dialoge','masken','vorgaenge','hwa-status','handwerkerauftraege','hwa-erfassung'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());const w=d.window;w.ui=w.eval("UI");w.eval('S.benutzer={id:1,rolle:"admin"};S.lauf=1');return w;}
function key(w,k,opts={}){w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,code:k.length===1?'Key'+k.toUpperCase():k,bubbles:true,cancelable:true,...opts}));}
test('Dialog hält Tab und Rückwärts-Tab im obersten Fenster und stellt den Ausgangsfokus wieder her',t=>{
 const w=setup(t),start=w.document.getElementById('zurueck');start.focus();
 const m=w.ui.modal({titel:'Test',inhalt:w.ui.el('input'),footer:close=>[w.ui.el('button',{text:'Abbrechen',onclick:close})]});
 for(const e of m.box.querySelectorAll('input,button'))e.getClientRects=()=>[{}];
 const first=m.box.querySelector('button'),last=m.box.querySelector('footer button');last.focus();key(w,'Tab');assert.equal(w.document.activeElement,first);key(w,'Tab',{shiftKey:true});assert.equal(w.document.activeElement,last);
 const child=w.ui.modal({titel:'Auswahl',inhalt:w.ui.el('input')});child.close();assert.equal(w.document.activeElement,last);m.close();assert.equal(w.document.activeElement,start);
});
test('Objekt, Adresse und Wohnung öffnen mit F2/F4 die richtigen Formulare; Pflichtfelder verhindern leere Speicherung',async t=>{
 const w=setup(t);let posts=0,puts=0;w.API={get:async()=>[],post:async()=>{posts++;return{id:3};},put:async()=>{puts++;}};w.neuLaden=()=>{};
 const cases=[['objekt',()=>w.objektFormular({id:1,nummer:'4236',bezeichnung:'Test'}),()=>w.objektFormular(),'Objekt ändern','Neues Objekt','f_bezeichnung'],['adresse',()=>w.adresseFormular({id:1,nummer:'1',nachname:'Test'}),()=>w.adresseFormular(),'Adresse bearbeiten','Neue Adresse','f_nachname'],['einheit',()=>w.einheitFormular(1,{id:1,nummer:'1',bezeichnung:'Test'}),()=>w.einheitFormular(1),'Einheit bearbeiten','Neue Einheit','f_bezeichnung']];
 for(const [typ,edit,create,editTitle,newTitle,required] of cases){w.eval('S.kontext={}');w.editCase=edit;w.createCase=create;w.eval(`S.kontext={typ:'${typ}',bearbeiten:window.editCase,erstellen:window.createCase}`);key(w,'F2');await tick();assert.match(w.document.querySelector('[role=dialog]').getAttribute('aria-label'),new RegExp(editTitle));key(w,'Escape',{ctrlKey:true});key(w,'F4');await tick();assert.equal(w.document.querySelector('[role=dialog]').getAttribute('aria-label'),newTitle);
  if(typ!=='adresse'){w.document.querySelector('footer .btn-primary').click();await tick();assert.equal(posts,0);assert.ok(w.document.querySelector('[role=dialog]'));}
  w.document.getElementById(required).value='Tastaturtest';key(w,'Escape');await tick();await tick();assert.equal(w.document.querySelector('[role=dialog]'),null);
  posts=0;
 }
 assert.equal(puts,0);
});
test('Kontextsprünge behalten Objekt, Wohnung und Adresse; Wohnung-Adresse filtert auf ihre Personenfunktionen',async t=>{
 const w=setup(t);for(const [typ,path,h] of [['objekt','objekte','hwa'],['einheit','einheiten','handwerker'],['adresse','adressen','handwerker']]){
  w.eval(`S.kontext={typ:'${typ}',${typ}:{id:7},objekt:{id:7}}`);
  w.befehl('h');assert.equal(w.location.hash,'#/'+path+'/7?tab='+h);w.befehl('k');assert.equal(w.location.hash,'#/'+path+'/7?tab=korrespondenz');w.befehl('v');assert.equal(w.location.hash,'#/'+path+'/7?tab=vorgaenge');
  if(typ!=='einheit'){w.befehl('m');assert.equal(w.location.hash,'#/posteingang?typ='+typ+'&ziel=7');}
 }
 w.API={get:async()=>[{aktiv:true,einheit_id:3,adresse_id:8,anzeigename:'Richtig'},{aktiv:true,einheit_id:4,adresse_id:9,anzeigename:'Andere Wohnung'}]};await w.adresseWahl({id:7,nummer:'4236'},3);assert.match(w.document.querySelector('[role=dialog]').textContent,/Richtig/);assert.doesNotMatch(w.document.querySelector('[role=dialog]').textContent,/Andere Wohnung/);
});
test('Strg+A und Strg+V bleiben in Eingaben unverändert; leere HWA-Anzeige lässt F2 keine Neuanlage auslösen',async t=>{
 const w=setup(t),i=w.ui.el('input');w.document.body.append(i);i.focus();for(const k of ['a','v']){const e=new w.KeyboardEvent('keydown',{key:k,code:'Key'+k.toUpperCase(),ctrlKey:true,bubbles:true,cancelable:true});i.dispatchEvent(e);assert.equal(e.defaultPrevented,false);}
 w.handwerkerMaske(w.hwaLeereAnzeige());key(w,'F2');await tick();assert.equal(w.document.querySelector('.cu-hwa-form'),null);
});
test('HWA-Sprünge öffnen den zugeordneten Handwerker, das Objekt und die Wohnung; Enter überspringt eingeklappte Zusatzfelder',async t=>{
 const w=setup(t);w.eval('S.kontext={typ:"handwerker",id:8,hwaRecord:{auftrag:{handwerker:{id:2},objekt:{id:3},einheit:{id:4}}}}');
 for(const [k,route] of [['a','#/adressen/2'],['o','#/objekte/3'],['w','#/einheiten/4'],['k','#/vorgaenge/8?tab=korrespondenz'],['v','#/vorgaenge/8?tab=vorgaenge']]){w.befehl(k);assert.equal(w.location.hash,route);}
 w.API={get:async()=>[{id:1,kuerzel:'FD',name:'Test'}]};w.handwerkerMaske(w.hwaLeereAnzeige());await w.handwerkerForm();
 w.document.getElementById('f_betreff2').focus();key(w,'Enter');assert.equal(w.document.activeElement.textContent,'OK');
 w.document.getElementById('f_pfkt').focus();key(w,'Enter');assert.equal(w.document.activeElement.id,'f_titel');
 key(w,'Escape',{ctrlKey:true});assert.equal(w.document.querySelector('.cu-hwa-form'),null);
});
