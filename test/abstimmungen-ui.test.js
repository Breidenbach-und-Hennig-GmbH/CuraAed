'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(t,api){const dom=new JSDOM('<div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window;w.API=api;for(const f of ['ui','kern','shell','abstimmungen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),dom.getInternalVMContext());w.eval('S.benutzer={rolle:"admin"}');return w;}
const data=()=>({top:{position:1,titel:'Testbeschluss',datum:'2026-11-20'},config:{objekt_id:1,revision:1,daten:{prinzip:'kopf',grundlage:'§ 25 WEG',geprueft:true}},regel:{revision:0,daten:{mehrheit:'einfach',verfahren:'versammlung',zusatz_mea:'keines',zaehler:1,nenner:2,vergleich:'gt',basis:'abgegeben',grundlage:'§ 25 WEG',umlauf_beschluss:''}},register:{basis_hash:'hash',hinweise:[],meaHinweise:[],gruppen:[{key:'1',name:'<img src=x> Eigentümer',einheiten:[{id:1,nummer:'WE 1',mea:'1/1'}],mea:'1'}]},revision:0,top_hash:'top',teilnahme:{},auszaehlung:null});
const button=(w,text)=>[...w.document.querySelectorAll('button')].find(x=>x.textContent===text);
test('Objektprinzip: Pulldown und geprüfte Grundlage werden mit Versionsschutz gespeichert',async t=>{
 let put;const w=setup(t,{get:async()=>data().config,put:async(url,b)=>{put={url,b};}});await w.objektStimmprinzipDialog(1);
 w.document.getElementById('stimmobjekt-prinzip').value='mea';w.document.getElementById('stimmobjekt-grundlage').value='GO § 8';
 button(w,'Stimmprinzip speichern').click();await tick();assert.equal(put.b.daten.prinzip,'mea');assert.equal(put.b.revision,1);assert.equal(put.b.daten.geprueft,true);assert.equal(put.b.daten.grundlage,'GO § 8');
});
test('Abstimmungsmaske: keine automatische Ja-Stimme, Vollmacht und Ausschluss werden getrennt übertragen',async t=>{
 let posted;const state=data();const w=setup(t,{get:async()=>state,post:async(url,b)=>{posted={url,b};throw Error('Testvorschau');}});await w.abstimmungDialog(1,2);
 assert.equal(w.document.querySelectorAll('img').length,0);const all=w.document.querySelectorAll('fieldset select'),p=all[0],v=all[1];assert.equal(p.value,'abwesend');assert.equal(v.value,'keine');assert.equal(v.disabled,true);
 p.value='vollmacht';p.dispatchEvent(new w.Event('change'));assert.equal(v.disabled,false);v.value='ja';
 const named=s=>[...w.document.querySelectorAll('fieldset input')].find(x=>x.getAttribute('aria-label')?.startsWith(s));
 named('Vertreten durch').value='Testperson';named('Nachweis /').value='DMS 12';named('Vollmacht in Textform').checked=true;named('Eigentümergruppen, Einheiten').checked=true;
 button(w,'Auszählen').click();await tick();assert.equal(posted.b.stimmen[0].stimme,'ja');assert.equal(posted.b.stimmen[0].vertreter,'Testperson');assert.equal(posted.b.stimmen[0].vollmacht_textform,true);assert.equal(posted.b.top_hash,'top');
 named('Stimmrechtsausschluss').checked=true;named('Stimmrechtsausschluss').dispatchEvent(new w.Event('change'));assert.equal(v.value,'keine');assert.equal(v.disabled,true);
 named('Grund des Stimmrechtsausschlusses').value='Rechtsgeschäft';button(w,'Auszählen').click();await tick();assert.equal(posted.b.stimmen[0].ausgeschlossen,true);assert.equal(posted.b.stimmen[0].ausschlussgrund,'Rechtsgeschäft');
});
test('Ungespeicherte Mehrheitsänderung verhindert Auszählung mit einer anderen Regel',async t=>{
 let calls=0;const w=setup(t,{get:async()=>data(),post:async()=>calls++});await w.abstimmungDialog(1,2);const i=w.document.getElementById('stimmregel-mehrheit');i.value='allstimmig';i.dispatchEvent(new w.Event('input',{bubbles:true}));i.dispatchEvent(new w.Event('change'));
 button(w,'Auszählen').click();await tick();assert.equal(calls,0);assert.match(w.document.body.textContent,/zuerst speichern/);
 assert.equal(w.document.getElementById('stimmregel-zaehler').closest('.field').parentElement.hidden,true);
});
