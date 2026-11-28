'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function setup(t){const d=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/#/einheiten/1'});t.after(()=>d.window.close());for(const f of ['adressdaten','ui','kern','shell','dialoge','masken'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());d.window.eval('S.lauf=1;S.benutzer={id:1,rolle:"mitarbeiter"}');return d.window;}
const settle=()=>new Promise(r=>setTimeout(r,220));
test('Neue Personenfunktion: Name statt Dropdown, Suche über API, Pfeile/Enter speichern ausschließlich ausgewählte ID',async t=>{
 const w=setup(t),queries=[],saves=[];w.API={qs:o=>'?'+new URLSearchParams(o),get:async url=>{
 if(url==='/pfkt-codes')return[];queries.push(url);return[{id:901,nummer:'90001',anzeigename:'Anna Muster',ort:'Köln'},{id:902,nummer:'90002',anzeigename:'Anne Muster',ort:'Bonn'}];},post:async(url,b)=>saves.push({url,b})};
 let reloaded=0;await w.zuordnungFormular({einheit_id:1},()=>reloaded++);
 assert.deepEqual(queries,[]);assert.equal(w.document.querySelector('select[name=adresse_id]'),null);
 const input=w.document.querySelector('[role=combobox]');assert.equal(w.document.activeElement,input);
 input.value='Must';input.dispatchEvent(new w.Event('input'));await settle();assert.match(queries[0],/suche=Must/);
 assert.equal(w.document.querySelectorAll('[role=option]').length,2);
 input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 assert.equal(w.document.querySelector('#f_adresse_id').value,'901');
 [...w.document.querySelectorAll('footer button')].find(b=>b.textContent==='Speichern').click();await settle();
 assert.equal(saves[0].b.adresse_id,'901');assert.equal(saves[0].b.einheit_id,1);assert.equal(reloaded,1);
});
test('Suche: ein Treffer per Tab, Änderung löscht alte ID, keine freie Textzuordnung, späte Antworten und Fehler',async t=>{
 const w=setup(t);let resolve;const field=w.eval('UI').feld({name:'person',label:'Person',type:'suche',required:true,suchen:q=>q==='alt'?new Promise(r=>resolve=r):q==='Fehler'?Promise.reject(Error('offline')):Promise.resolve([{value:'2',label:'Zweite Person'}])});
 w.document.body.append(field.wrap);const input=field.wrap.querySelector('[role=combobox]');
 input.value='alt';input.dispatchEvent(new w.Event('input'));await settle();
 input.value='neu';input.dispatchEvent(new w.Event('input'));await settle();
 resolve([{value:'1',label:'Alte Person'}]);await settle();assert.match(field.wrap.textContent,/Zweite Person/);assert.doesNotMatch(field.wrap.textContent,/Alte Person/);
 input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Tab',bubbles:true}));assert.equal(field.input.value,'2');assert.equal(input.checkValidity(),true);
 input.value='Fehler';input.dispatchEvent(new w.Event('input'));assert.equal(field.input.value,'');assert.equal(input.checkValidity(),false);await settle();assert.match(field.wrap.textContent,/Suche fehlgeschlagen/);
});
test('Wohnung zeigt aktive Eigentümer und Mieter aus den Personenfunktionen auch ohne Personenkonto',async t=>{
 const w=setup(t);
 const assignments=[{id:10,adresse_id:11,rolle:'eigentuemer',aktiv:true,adresstyp:'person',nachname:'Eigentümer',vorname:'Aktuell'},{id:12,adresse_id:13,rolle:'mieter',aktiv:true,adresstyp:'person',nachname:'Mieter',vorname:'Aktuell'},{id:14,adresse_id:15,rolle:'eigentuemer',aktiv:false,adresstyp:'person',nachname:'Ehemalig'},{id:16,adresse_id:17,rolle:'eigentuemer',aktiv:true,inaktiv:1,adresstyp:'person',nachname:'Inaktiv'}];
 w.API={get:async url=>url==='/einheiten/1'?{id:1,objekt_id:2,nummer:'100-01',bezeichnung:'Wohnung',einheitstyp:'wohnung'}:url==='/objekte/2'?{id:2,nummer:'100',bezeichnung:'Objekt',objekttyp:'WEG'}:url.endsWith('/zuordnungen')?assignments:[]};
 await w.einheitMaske(1,new w.URLSearchParams());
 const owner=w.document.querySelector('[aria-label=Eigentümer]'),tenant=w.document.querySelector('[aria-label=Mieter]');
 assert.match(owner.textContent,/EIGENTÜMER, AKTUELL/);assert.doesNotMatch(owner.textContent,/EHEMALIG|INAKTIV/);
 assert.match(tenant.textContent,/MIETER, AKTUELL/);assert.equal(owner.querySelector('a[href="#/adressen/11"]').textContent,'EIGENTÜMER, AKTUELL');
 assert.match(owner.textContent,/Kein PKto/);
});
