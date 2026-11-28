'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom'),tick=()=>new Promise(r=>setImmediate(r));
function setup(t,role='admin'){const d=new JSDOM('<div id="host"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test'});t.after(()=>d.window.close());for(const f of ['adressdaten','ui','kern','shell','etv-ablauf','einlass','abstimmungen','etv-live'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());d.window.eval('S.lauf=1;S.benutzer={rolle:'+JSON.stringify(role)+'}');return d.window;}
const source=()=>({versammlung:{id:7,name:'ETV',objekt_id:1},raum:null,tops:[],anfragen:[],gruppen:[],abstimmung:null,gestartet:false});
test('Teams-Link speichern öffnet den QR-Zugang nicht automatisch; bewusstes Öffnen zeigt eigenen QR-Code',async t=>{
 const w=setup(t),s=source(),puts=[];w.API={get:async()=>s,put:async(url,b)=>{puts.push(b);s.raum={...b,revision:1,einwahl_url:'https://curaaed.test/teilnahme.html#7/key',ablauf_am:'2026-12-06T12:00:00Z'};}};await w.etvLiveMaske(7,{container:w.document.getElementById('host')});
 w.document.querySelector('[aria-label="Teams-Besprechungslink"]').value='https://teams.live.com/meet/123';[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Teams-Link speichern').click();await tick();await tick();assert.equal(puts[0].aktiv,false);assert.equal(w.document.querySelectorAll('img').length,0);
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='QR-Zugang öffnen').click();await tick();await tick();assert.equal(puts[1].aktiv,true);assert.equal(w.document.querySelector('img').getAttribute('src'),'/api/versammlungen/7/live/qr.png');
});
test('Digitale Gruppen bieten keine manuelle Doppelstimme an; Leser können keine Stimme erfassen',async t=>{
 const w=setup(t,'leser'),s=source();s.abstimmung={id:1,top_id:8,status:'offen',zeilen:[{key:'1',name:'Digital',modus:'digital',teilnahme:'selbst',stimme:'keine',version:0},{key:'2',name:'Manuell',modus:'manuell',teilnahme:'selbst',stimme:'keine',version:0}]};w.API={get:async()=>s};await w.etvLiveMaske(7,{container:w.document.getElementById('host')});assert.match(w.document.body.textContent,/manuelle Doppelstimme gesperrt/);assert.equal(w.document.querySelector('[aria-label="Ja manuell · Digital"]'),null);assert.equal(w.document.querySelector('[aria-label="Ja manuell · Manuell"]').disabled,true);
});

test('Manuelle Stimmabgabe bleibt nach dem Speichern bedienbar und verwendet die neue Version',async t=>{
 const w=setup(t),s=source(),votes=[];s.abstimmung={id:1,top_id:8,status:'offen',zeilen:[{key:'2',name:'Manuell',modus:'manuell',teilnahme:'selbst',stimme:'keine',version:0}]};w.API={get:async()=>s,post:async(url,b)=>{votes.push(b);s.abstimmung.zeilen[0].stimme=b.stimme;s.abstimmung.zeilen[0].version++;}};
 await w.etvLiveMaske(7,{container:w.document.getElementById('host')});w.document.querySelector('[aria-label="Ja manuell · Manuell"]').click();await tick();await tick();assert.equal(w.document.querySelector('[aria-label="Nein manuell · Manuell"]').disabled,false);w.document.querySelector('[aria-label="Nein manuell · Manuell"]').click();await tick();await tick();assert.equal(votes[1].version,1);
});
