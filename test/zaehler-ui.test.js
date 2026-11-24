'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
const button=(w,text)=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);
function setup(t,rolle='admin'){
 const d=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/#/zaehler/1'});t.after(()=>d.window.close());
 for(const f of ['ui','kern','dialoge','shell','masken','zaehler'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());
 d.window.eval('S.lauf=1;S.benutzer={id:1,rolle:'+JSON.stringify(rolle)+',name:"Testverwaltung"}');return d.window;
}
const o={id:1,nummer:'4236',bezeichnung:'Damiansweg 2'};
const point={id:1,objekt_id:1,bezeichnung:'<img src=x onerror=alert(1)>',medium:'strom',art:'haupt',marktlokation:'12345678901',revision:1,zaehler:[{id:1,nummer:'Testzähler',einheit:'kWh',eingebaut_am:'2026-01-01',letzter_wert:'0',letzter_zeitpunkt:'2026-10-01T00:00:00Z'}]};
function api(w,points=[point]){w.API={get:async url=>url.endsWith('/lobaro')?{revision:0,status:'Vorbereitet – Lobaro-Zugang fehlt',token_vorhanden:false}:url.endsWith('/einheiten')?[]:url.endsWith('/messwerte')?[]:{objekt:o,punkte:points}};}
test('Objektbezogene Maske zeigt MaLo, echte Nullwerte, sichere Texte und Tastatureinstieg',async t=>{
 const w=setup(t);api(w);await w.zaehlerMaske(1);assert.match(w.document.body.textContent,/4236/);assert.match(w.document.body.textContent,/12345678901/);assert.match(w.document.body.textContent,/0 kWh/);assert.equal(w.document.querySelectorAll('img').length,0);w.eval('S.kontext.erstellen()');assert.equal(w.document.querySelector('[role=dialog]').getAttribute('aria-label'),'Neuer Zählpunkt');
 const field=w.document.querySelector('#f_marktlokation');assert.ok(field);assert.equal(w.document.querySelector('#f_bezeichnung').required,true);
});
test('Suche filtert nach MaLo und Zähler; Leser bekommen keine Schreibschaltflächen',async t=>{
 const w=setup(t,'leser');api(w);await w.zaehlerMaske(1);assert.equal(button(w,'Neu · F4'),undefined);assert.equal(button(w,'Lobaro einrichten / prüfen'),undefined);assert.equal(button(w,'Zähler bearbeiten · F2'),undefined);const search=w.document.querySelector('[aria-label="Zähler suchen"]');search.value='unbekannt';search.dispatchEvent(new w.Event('input'));assert.match(w.document.body.textContent,/Keine passenden/);search.value='Testzähler';search.dispatchEvent(new w.Event('input'));assert.ok(button(w,'Testzähler'));
});
test('Zählpunktformular speichert Objektbezug und MaLo mit normalem Formular-Submit',async t=>{
 const w=setup(t);api(w,[]);let sent;w.API.post=async(url,b)=>{sent={url,b};return{id:1};};await w.zaehlerMaske(1);button(w,'Neu · F4').click();w.document.getElementById('f_bezeichnung').value='Strom gesamt';w.document.getElementById('f_medium').value='strom';w.document.getElementById('f_marktlokation').value='12345678901';w.document.querySelector('.modal form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(sent.url,'/objekte/1/zaehler/punkte');assert.equal(sent.b.marktlokation,'12345678901');assert.equal(w.document.querySelector('[role=dialog]'),null);
});

test('Zählerliste und Ablesungen bleiben in einer Maske; Pfeiltasten und ausgebaute Geräte',async t=>{
 const w=setup(t);api(w,[{...point,zaehler:[point.zaehler[0],{...point.zaehler[0],id:2,nummer:'Alter Zähler',ausgebaut_am:'2026-02-01'}]}]);
 const original=w.API.get;w.API.get=async url=>url.endsWith('/messwerte')?[{zeitpunkt:'2026-01-15T10:00:00Z',wert:url.includes('/2/')?'88.125':'12.5',einheit:'kWh',quelle:'manuell'}]:original(url);
 await w.zaehlerMaske(1);await tick();assert.equal(w.document.querySelectorAll('.cu-zaehlpunkt').length,0);assert.match(w.document.querySelector('.cu-zaehler-werte').textContent,/12,5 kWh/);assert.equal(button(w,'Alter Zähler'),undefined);
 const show=w.document.getElementById('zaehler-ausgebaut');show.checked=true;show.dispatchEvent(new w.Event('change'));await tick();const first=w.document.querySelector('.cu-zaehler-liste tr.klick');first.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await tick();assert.match(w.document.querySelector('.cu-zaehler-werte').textContent,/88,125/);assert.match(w.document.querySelector('.cu-zaehler-auswahl').textContent,/Alter Zähler/);assert.equal(w.document.querySelector('[role=dialog]'),null);
});

test('Wohnungseinstieg filtert dieselbe Zählermaske und lässt andere Wohnungen auswählbar',async t=>{
 const w=setup(t);api(w,[{...point,einheit_id:7,wohnung:'4236-0007'},{...point,id:2,einheit_id:8,wohnung:'4236-0008',zaehler:[{...point.zaehler[0],id:2,nummer:'Wohnung acht'}]}]);const original=w.API.get;w.API.get=async url=>url.endsWith('/einheiten')?[{id:7,nummer:'4236-0007',lage:'EG links'},{id:8,nummer:'4236-0008',lage:'EG rechts'}]:original(url);
 await w.zaehlerMaske(1,new URLSearchParams('einheit=7'));assert.equal(button(w,'Wohnung acht'),undefined);assert.ok(button(w,'Zur Wohnung'));const select=w.document.querySelector('[aria-label=Wohnung]');select.value='';select.dispatchEvent(new w.Event('change'));assert.ok(button(w,'Wohnung acht'));
});

test('Adresse öffnet eine eindeutige Wohnung direkt und bietet bei Mehrfachbezug eine Auswahl',async t=>{
 const w=setup(t);let target;w.geheZu=x=>{target=x;};await w.zaehlerAdresse({id:33},[{objekt_id:1,einheit_id:7,aktiv:true}]);assert.equal(target,'#/zaehler/1?adresse=33&einheit=7');
 target=null;await w.zaehlerAdresse({id:33},[{objekt_id:1,einheit_id:7,aktiv:true},{objekt_id:1,einheit_id:7,aktiv:true},{objekt_id:2,einheit_id:8,aktiv:true}]);assert.equal(target,null);const rows=w.document.querySelectorAll('.modal tbody tr.klick');assert.equal(rows.length,2);rows[1].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(target,'#/zaehler/2?adresse=33&einheit=8');
});
test('Lobaro-Vorschau schreibt erst nach ausdrücklicher Übernahme; Fehler sperren Übernahme',async t=>{
 const w=setup(t);api(w);let writes=0;w.API.post=async(url,b)=>{if(url.endsWith('/vorschau'))return{id:'preview',neu:1,bekannt:0,uebersprungen:0,fehler:[],eintraege:[{nummer:'TEST',zeitpunkt:'2026-10-01T00:00:00Z',wert:'1',einheit:'kWh'}]};if(url.endsWith('/uebernehmen')){writes++;assert.equal(b.id,'preview');return{neu:1,bekannt:0};}};
 await w.lobaroDialog(1,()=>{});assert.equal(button(w,'Geprüfte Werte übernehmen').disabled,true);w.document.getElementById('f_von').value='2026-10-01';w.document.getElementById('f_bis').value='2026-10-31';button(w,'Messwerte als Vorschau abrufen').click();await tick();assert.equal(writes,0);assert.equal(button(w,'Geprüfte Werte übernehmen').disabled,false);button(w,'Geprüfte Werte übernehmen').click();await tick();assert.equal(writes,1);assert.equal(button(w,'Geprüfte Werte übernehmen').disabled,true);
 w.API.post=async()=>({id:null,neu:0,bekannt:0,uebersprungen:0,eintraege:[],fehler:[{zaehler:'TEST',datensatz:'1',fehler:'Unbekannte Einheit'}]});button(w,'Messwerte als Vorschau abrufen').click();await tick();assert.equal(button(w,'Geprüfte Werte übernehmen').disabled,true);assert.match(w.document.body.textContent,/Unbekannte Einheit/);
});
