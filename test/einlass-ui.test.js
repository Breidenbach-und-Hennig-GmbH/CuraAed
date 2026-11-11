'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom'),tick=()=>new Promise(r=>setImmediate(r));
function source(){return{versammlung:{id:7,name:'ETV Test',datum:'2026-11-11',uhrzeit:'17:00'},durchfuehrung:null,start_moeglich:true,basis_hash:'basis',teilnahme_revision:2,hinweise:[],uebersicht:Object.fromEntries(['mea','koepfe','einheiten'].map((key,i)=>[key,{verfuegbar:true,total:i?'4':'1000',anwesend:i?'3':'850',prozent:i?75:85,werte:{praesenz:i?'2':'600',online:i?'1':'250',abwesend:'0',gesperrt:i?'1':'150'},anteile:{praesenz:60,online:25,abwesend:0,gesperrt:15}}]))};}
function setup(t,role='admin'){const dom=new JSDOM('<div id="host"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/'});t.after(()=>dom.window.close());for(const file of ['ui','kern','etv-ablauf','einlass'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());dom.window.eval('S.lauf=1;S.benutzer={rolle:'+JSON.stringify(role)+'}');return dom.window;}
const button=(w,name)=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===name);
test('Einlass zeigt gespeicherte Werte und wechselt Anzeige ohne Start; Start verwendet geprüfte Version',async t=>{
 const w=setup(t),s=source(),posts=[];w.API={get:async()=>s,post:async(url,b)=>{posts.push({url,b});s.durchfuehrung={gestartet_am:'2026-11-11T16:08:00Z',gestartet_von:'Testleitung'};return s;}};
 await w.einlassMaske(7,{container:w.document.getElementById('host')});assert.match(w.document.body.textContent,/85%/);assert.equal(posts.length,0);w.document.querySelector('[aria-label="Einheiten"]').click();assert.match(w.document.body.textContent,/75%/);assert.equal(posts.length,0);
 button(w,'Versammlung starten').click();await tick();await tick();assert.equal(posts.length,1);assert.equal(posts[0].url,'/versammlungen/7/starten');assert.equal(posts[0].b.basis_hash,'basis');assert.equal(posts[0].b.teilnahme_revision,2);assert.equal(button(w,'Versammlung starten'),undefined);assert.match(w.document.body.textContent,/Versammlung läuft/);assert.ok(w.document.querySelector('a[href$="ansicht=live"]'));
});
test('Leser und nicht aktuelle Teilnehmerliste können nicht starten; fehlende MEA werden gekennzeichnet',async t=>{
 const w=setup(t,'leser'),s=source();s.start_moeglich=false;s.uebersicht.mea.verfuegbar=false;s.uebersicht.mea.prozent=null;w.API={get:async()=>s};await w.einlassMaske(7,{container:w.document.getElementById('host')});assert.equal(button(w,'Versammlung starten').disabled,true);assert.match(w.document.body.textContent,/Keine vollständige Grundlage für MEA/);assert.doesNotMatch(w.document.body.textContent,/NaN|undefined/);
});
test('Bühnenansicht zeigt nur Übersicht und keinen Startknopf',async t=>{
 const w=setup(t),s=source();w.API={get:async()=>s};await w.einlassMaske(7,{container:w.document.getElementById('host'),buehne:true});assert.equal(button(w,'Versammlung starten'),undefined);assert.equal(w.document.querySelectorAll('a[target="_blank"]').length,0);assert.match(w.document.body.textContent,/ETV Test/);
});

test('Eine ältere Aktualisierung überschreibt den bestätigten Versammlungsstart nicht',async t=>{
 const w=setup(t),initial=source();let calls=0,finish;
 w.API={get:async()=>{if(++calls===1)return initial;return new Promise(resolve=>finish=resolve);},post:async()=>({...source(),durchfuehrung:{gestartet_am:'2026-11-11T16:08:00Z',gestartet_von:'Testleitung'}})};
 await w.einlassMaske(7,{container:w.document.getElementById('host')});button(w,'Anwesenheit aktualisieren').click();button(w,'Versammlung starten').click();await tick();await tick();assert.match(w.document.body.textContent,/Versammlung läuft/);finish(initial);await tick();await tick();assert.match(w.document.body.textContent,/Versammlung läuft/);assert.equal(button(w,'Versammlung starten'),undefined);
});
