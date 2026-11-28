'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');const tick=()=>new Promise(r=>setImmediate(r));

test('HP-Adressstatus zeigt die genaue Neuanlagediagnose auch bei vorläufiger HP-Zuordnung',t=>{
 const dom=new JSDOM('',{runScripts:'outside-only'});t.after(()=>dom.window.close());vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/hp-adressen.js'),'utf8'),dom.getInternalVMContext());
 const text=dom.window.hpAdressStatus({hp_sync:{nummer:100,status:'unklar',aktiv:true,online:true},hp_neuanlage:{status:'pruefen',meldung:'Prüfschritt: email/HY000/-4990'}});assert.match(text,/email\/HY000\/-4990/);assert.doesNotMatch(text,/Synchron/);
});
test('Adressabgleich-UI: bestehende Zeitfreigabe nur nach Bestätigung unbefristet, keine neue Kopplung',async t=>{
 const dom=new JSDOM('<div id="desktop"></div><div id="modal-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window,calls=[];let expiry=Date.now()+100000;
 w.API={get:async()=>({verbindungen:[{id:'existing',name:'Eigener Bestand',datenbank:'HPTEST',aktiv:1,ablauf_ms:expiry,anzahl:10,probleme:0}]}),post:async(url,body)=>{calls.push({url,body});expiry=0;return {ok:true};}};
 for(const file of ['adressdaten','ui','kern','hp-adressen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());vm.runInContext('S.lauf=1;S.benutzer={rolle:"admin"};',dom.getInternalVMContext());await w.hpAdressBereich(1,w.document.getElementById('desktop'));
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);button('Dauerhaft freigeben').click();await tick();assert.equal(calls.length,0);button('Abbrechen').click();await tick();assert.equal(calls.length,0);
 button('Dauerhaft freigeben').click();await tick();button('Bestätigen').click();await tick();await tick();assert.equal(calls.length,1);assert.equal(calls[0].url,'/hp-adressen/verbindungen/existing/dauerhaft');assert.equal(calls[0].body.zustimmung,true);assert.match(w.document.body.textContent,/Dauerhaft freigegeben/);assert.ok(!w.document.body.textContent.includes('1970'));assert.ok(button('Adressabgleich trennen'));
});
test('Adressabgleich-UI: eigene Freigabe, verdeckte Daten, explizite Kopieraktion und Löschen beim Schließen',async t=>{
 const dom=new JSDOM('<div id="desktop"></div><div id="modal-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window,calls=[];let copied='';Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async x=>{copied=x;}}});
 w.API={get:async()=>({verbindungen:[]}),post:async(url,body)=>{calls.push({url,body});return {id:'synthetic',token:'synthetic-secret'};}};
 for(const file of ['adressdaten','ui','kern','hp-adressen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());vm.runInContext('S.lauf=1;S.benutzer={rolle:"admin"};',dom.getInternalVMContext());await w.hpAdressBereich(1,w.document.getElementById('desktop'));
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent===text);button('Adressabgleich koppeln / Freigabe erneuern').click();w.document.getElementById('f_name').value='Testkunde';w.document.getElementById('f_datenbank').value='HPTEST';const form=w.document.querySelector('form');form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(calls.length,0);
 form.querySelector('input[aria-label="Adressabgleich zustimmen"]').checked=true;form.dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();const secret=w.document.querySelector('input[aria-label="Geschützte Adresskopplung"]');assert.equal(secret.type,'password');assert.equal(w.document.body.textContent.includes('synthetic-secret'),false);assert.equal(copied,'');button('Adresskopplungsdaten kopieren').click();await tick();assert.equal(JSON.parse(copied).scope,'adressen-v1');button('Schließen').click();assert.equal(secret.value,'');
});

test('HP-Adressbereiche: Auswahl bleibt pro Bereich lesend, Quelltexte werden nicht als HTML ausgeführt',async t=>{
 const dom=new JSDOM('<div id="modal-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window,calls=[];
 w.API={get:async path=>{calls.push(path);return path.endsWith('/bereiche')?{bereiche:[{key:'telefon',label:'Telefonnummern',anzahl:1,status:'synchron'}]}:{felder:['TelNr','Bemerkung'],zeilen:[{TelNr:'01234',Bemerkung:'<img src=x onerror=alert(1)>'}],status:'synchron'};},post:async()=>{throw Error('Kein Schreibweg');}};
 for(const file of ['adressdaten','ui','kern','hp-adressen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());await w.hpAdressQuelldaten(42);const d=w.document.querySelector('details');d.open=true;d.dispatchEvent(new w.Event('toggle'));await tick();assert.match(w.document.body.textContent,/01234/);assert.match(w.document.body.textContent,/<img src=x/);assert.equal(w.document.querySelector('img'),null);assert.equal(calls.length,2);
});

test('HP-Neuanlagefreigabe schließt die vollständigen Adressbereiche ein und bleibt ausdrücklich wählbar',async t=>{
 const dom=new JSDOM('<div id="desktop"></div><div id="modal-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());const w=dom.window,calls=[];
 w.API={get:async()=>({verbindungen:[]}),post:async(url,body)=>{calls.push(body);return{id:'synthetic',token:'synthetic',scope:'adressen-v3'};}};
 for(const file of ['adressdaten','ui','kern','hp-adressen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());vm.runInContext('S.lauf=1;S.benutzer={rolle:"admin"};',dom.getInternalVMContext());await w.hpAdressBereich(1,w.document.getElementById('desktop'));
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Adressabgleich koppeln / Freigabe erneuern').click();const creation=w.document.querySelector('[aria-label="Neue Adressen in HP anlegen"]'),full=w.document.querySelector('[aria-label="Alle HP-Adressbereiche"]');assert.equal(creation.checked,false);creation.checked=true;creation.dispatchEvent(new w.Event('change'));assert.equal(full.checked,true);
 w.document.getElementById('f_name').value='Test';w.document.getElementById('f_datenbank').value='HPTEST';w.document.querySelector('[aria-label="Adressabgleich zustimmen"]').checked=true;w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(calls[0].neuanlagen,true);assert.equal(calls[0].vollstaendig,true);
});
