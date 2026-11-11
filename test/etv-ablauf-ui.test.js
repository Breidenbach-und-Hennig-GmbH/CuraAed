'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t){const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/#/etv/7?schritt=teilnehmer'});t.after(()=>dom.window.close());for(const f of ['ui','kern','shell','etv-ablauf']){vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),dom.getInternalVMContext());if(f==='ui')dom.window.eval('UI.bestaetigen=async()=>window.confirmation===true');}dom.window.eval('S.benutzer={rolle:"admin"};S.lauf=1');return dom.window;}
test('Schrittleiste zeigt die aktuelle Phase, behält die Versammlung bei und schützt ungespeicherte Änderungen',async t=>{
 const w=setup(t),field=w.document.createElement('input');field.value='Alt';let links=[],confirmation=false;
 w.geheZu=h=>links.push(h);w.confirmation=false;
 const flow=w.etvAblaufRahmen(7,'teilnehmer',field);w.document.getElementById('hp-desktop').append(flow.layout);flow.merken();
 const nav=w.document.querySelector('nav[aria-label="Versammlungsablauf"]');assert.equal(nav.querySelectorAll('a').length,4);assert.match(nav.querySelector('[aria-current="step"]').textContent,/Teilnehmer/);
 field.value='Neu';nav.querySelector('a[href$="schritt=durchfuehrung"]').click();await tick();assert.equal(links.length,0);
 w.confirmation=true;nav.querySelector('a[href$="schritt=durchfuehrung"]').click();await tick();assert.equal(links[0],'#/etv/7?schritt=durchfuehrung');
 flow.merken();nav.querySelector('a[href$="schritt=basisdaten"]').click();await tick();assert.equal(links[1],'#/etv/7?schritt=basisdaten');
 assert.doesNotMatch(w.document.body.textContent,/Versammlung abbrechen|Mehrheit|Abstimmen/);
});
test('Teilnehmer und Einlass werden innerhalb der Schrittleiste geöffnet',async t=>{
 const w=setup(t),calls=[];w.API={get:async()=>({id:7,name:'ETV Test',objekt_nummer:'1001',datum:'2026-12-05'})};
 w.teilnehmerDialog=async(id,{container})=>{calls.push(['teilnehmer',id]);container.append(w.document.createElement('input'));};
 w.einlassMaske=async(id,{container})=>{calls.push(['einlass',id]);container.append(w.document.createElement('textarea'));};
 await w.versammlungSchrittMaske(7,'teilnehmer');assert.equal(calls[0][0],'teilnehmer');assert.ok(w.document.querySelector('.cu-etv-seitenleiste'));assert.equal(w.document.querySelectorAll('[role="dialog"]').length,0);
 await w.versammlungSchrittMaske(7,'durchfuehrung');assert.equal(calls[1][0],'einlass');assert.match(w.document.querySelector('[aria-current="step"]').textContent,/Durchführung/);
});
