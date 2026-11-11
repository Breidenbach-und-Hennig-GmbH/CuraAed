'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
test('TOP-Maske: Anlage, Suchfilter, Textsicherheit und separate Versammlungsversion',async t=>{
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window;
 let record;const data={versammlung:{id:7,name:'ETV Test',objekt_nummer:'1001',datum:'2026-11-20',leitung_id:1},revision:4,tops:[]};
 w.API={get:async()=>data,post:async(url,b)=>{record={url,b};data.revision++;data.tops.push({id:1,position:1,...b});return{id:1,revision:data.revision};}};
 for(const file of ['ui','kern','shell','etv-ablauf','tagesordnung'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());w.eval('S.lauf=1;S.benutzer={rolle:"admin"}');
 await w.tagesordnungMaske('7');[...w.document.querySelectorAll('button')].find(b=>b.textContent==='Tagesordnungspunkt anlegen').click();
 w.document.getElementById('f_titel').value='<img src=x> Budget';w.document.getElementById('f_art').value='beschluss';
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='TOP speichern').click();await tick();await tick();
 assert.ok(w.document.querySelector('nav[aria-label="Versammlungsablauf"]'));assert.match(w.document.querySelector('[aria-current="step"]').textContent,/Tagesordnung/);assert.doesNotMatch(w.document.body.textContent,/Mehrheit \/ Abstimmen/);assert.ok(w.document.querySelector('[aria-label="TOP 1 löschen"].btn-danger'));assert.equal(record.url,'/versammlungen/7/tops/anlegen');assert.equal(record.b.revision,4);assert.equal(w.document.querySelectorAll('img').length,0);assert.match(w.document.body.textContent,/<img src=x> Budget/);
 const search=w.document.querySelector('[aria-label="Tagesordnung durchsuchen"]');search.value='nicht vorhanden';search.dispatchEvent(new w.Event('input'));assert.match(w.document.body.textContent,/Keine passenden TOPs/);
 assert.equal(w.document.querySelector('a[download]').getAttribute('href'),'/api/versammlungen/7/tagesordnung.txt');
});

test('TOP-Vorlagenmaske: TOP als Vorlage vorbefüllen, Mehrfachauswahl übertragen und keine HTML-Ausführung',async t=>{
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window,posts=[];
 const data={versammlung:{id:7,name:'ETV',leitung_id:1,datum:'2026-11-20'},revision:3,tops:[{id:8,position:1,titel:'Begrüßung',art:'besprechung',erlaeuterung:'Start'}]};
 const templates=[{id:1,revision:2,name:'<img src=x> Vorlage',titel:'Begrüßung',art:'besprechung'}];
 w.API={get:async url=>url==='/top-vorlagen'?templates:data,post:async(url,b)=>{posts.push({url,b});return{id:1};}};
 for(const file of ['ui','kern','shell','etv-ablauf','tagesordnung'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());w.eval('S.lauf=1;S.benutzer={rolle:"admin"}');
 await w.tagesordnungMaske('7');
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Als Vorlage speichern').click();
 assert.equal(w.document.getElementById('vorlage-titel').value,'Begrüßung');assert.equal(w.document.getElementById('vorlage-erlaeuterung').value,'Start');
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Vorlage speichern').click();await tick();
 assert.equal(posts[0].url,'/top-vorlagen/anlegen');assert.equal(posts[0].b.titel,'Begrüßung');
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='TOP-Vorlagen').click();await tick();
 assert.equal(w.document.querySelectorAll('img').length,0);
 const checkbox=w.document.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change'));
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Auswahl übernehmen').click();await tick();
 assert.equal(posts[1].url,'/versammlungen/7/top-vorlagen-uebernehmen');assert.equal(posts[1].b.revision,3);assert.deepEqual(JSON.parse(JSON.stringify(posts[1].b.vorlagen)),[{id:1,revision:2}]);
});

test('TOP löschen nennt den ausgewählten Punkt und benötigt Bestätigung; danach wird die Liste neu geladen',async t=>{
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/'});t.after(()=>dom.window.close());const w=dom.window,posts=[];
 const data={versammlung:{id:7,name:'ETV',datum:'2026-11-20',leitung_id:1},revision:4,tops:[{id:8,position:1,titel:'Test-TOP',art:'besprechung'}]};
 w.API={get:async()=>data,post:async(url,body)=>{posts.push({url,body});data.tops=[];data.revision=5;return{};}};
 for(const f of ['ui','kern','shell','etv-ablauf','tagesordnung'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),dom.getInternalVMContext());w.eval('S.lauf=1;S.benutzer={rolle:"admin"}');
 await w.tagesordnungMaske('7');w.document.querySelector('[aria-label="TOP 1 löschen"]').click();await tick();assert.equal(posts.length,0);assert.match(w.document.querySelector('[role="dialog"]').textContent,/TOP 1.*Test-TOP.*löschen/);
 const cancel=[...w.document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Abbrechen');cancel.click();await tick();assert.equal(data.tops.length,1);
 w.document.querySelector('[aria-label="TOP 1 löschen"]').click();await tick();[...w.document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Löschen').click();await tick();await tick();
 assert.equal(posts.length,1);assert.equal(posts[0].url,'/versammlungen/7/tops/loeschen');assert.equal(posts[0].body.id,8);assert.equal(posts[0].body.revision,4);assert.match(w.document.body.textContent,/Noch keine Tagesordnungspunkte/);
});
