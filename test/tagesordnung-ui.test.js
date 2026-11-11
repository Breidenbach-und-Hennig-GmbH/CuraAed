'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
test('TOP-Maske: Anlage, Suchfilter, Textsicherheit und separate Versammlungsversion',async t=>{
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window;
 let record;const data={versammlung:{id:7,name:'ETV Test',objekt_nummer:'1001',datum:'2026-11-20',leitung_id:1},revision:4,tops:[]};
 w.API={get:async()=>data,post:async(url,b)=>{record={url,b};data.revision++;data.tops.push({id:1,position:1,...b});return{id:1,revision:data.revision};}};
 for(const file of ['ui','kern','shell','tagesordnung'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());w.eval('S.lauf=1;S.benutzer={rolle:"admin"}');
 await w.tagesordnungMaske('7');[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Tagesordnungspunkt anlegen').click();
 w.document.getElementById('f_titel').value='<img src=x> Budget';w.document.getElementById('f_art').value='beschluss';
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='TOP speichern').click();await tick();await tick();
 assert.equal(record.url,'/versammlungen/7/tops/anlegen');assert.equal(record.b.revision,4);assert.equal(w.document.querySelectorAll('img').length,0);assert.match(w.document.body.textContent,/<img src=x> Budget/);
 const search=w.document.querySelector('[aria-label="Tagesordnung durchsuchen"]');search.value='nicht vorhanden';search.dispatchEvent(new w.Event('input'));assert.match(w.document.body.textContent,/Keine passenden TOPs/);
 assert.equal(w.document.querySelector('a[download]').getAttribute('href'),'/api/versammlungen/7/tagesordnung.txt');
});
