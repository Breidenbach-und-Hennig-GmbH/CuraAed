'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('Adressvorschau übernimmt nur nach aktueller Dublettenprüfung; Änderungen sperren Übernahme, Fehler stehen am Knopf',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://curaaed.example',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,calls=[];
 for(const f of ['ui','kern','eddi-adressen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),dom.getInternalVMContext());
 w.API={post:async(url,body)=>{calls.push({url,body});if(url.endsWith('/vorschau'))return{objekt:{neu:false,nummer:'868'},pruefwert:'checked',zeilen:[{index:0,aktion:'Neue Adresse',daten:{wohnung_nummer:'1'},dubletten:[],pruefen:false}]};throw Error('Zuordnung geändert. Bitte erneut prüfen.');}};
 const root=w.document.getElementById('root'),state=w.document.createElement('p');root.append(state);w.eddiAdressvorschlag(root,state,'job',{daten:{objekt:{nummer:'868',bezeichnung:'Test',strasse:'Testweg 1',plz:'12345',ort:'Stadt'},adressen:[{adresstyp:'person',vorname:'Anna',nachname:'Test',wohnung_nummer:'1',funktion:'mieter',beleg:{seite:1,zitat:'Mieter Anna Test'}}]}});
 const button=text=>[...root.querySelectorAll('button')].find(x=>x.textContent===text),take=button('Adressen, Objekt und Wohnungen übernehmen'),check=button('Vorschau und Dubletten prüfen'),tick=()=>new Promise(r=>setImmediate(r));
 assert.equal(take.disabled,true);check.click();await tick();assert.equal(take.disabled,false);
 const name=root.querySelector('input[aria-label="Nachname · Zeile 1"]');name.value='Anderer Name';name.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(take.disabled,true);
 check.click();await tick();take.click();await tick();assert.match(root.lastChild.textContent,/Zuordnung geändert/);
 assert.equal(calls[2].body.geprueft,true);assert.equal(calls[2].body.pruefwert,'checked');assert.equal(root.querySelectorAll('input[aria-label="Miteigentumsanteil"]').length,0);
});

test('Erneutes Öffnen einer übernommenen Liste zeigt das Ergebnis statt veralteter editierbarer Auslesedaten',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://curaaed.example',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 for(const f of ['ui','kern','eddi-adressen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),dom.getInternalVMContext());
 w.API={post:()=>{throw Error('Abgeschlossener Import darf nicht erneut schreiben.');}};
 const root=w.document.getElementById('root'),state=w.document.createElement('p'),control=w.eddiAdressvorschlag(root,state,'job',{daten:{objekt:{nummer:'alte Nummer'}},ergebnis:{objekt_id:261,adressen_neu:9,wohnungen_neu:14,adressen_vorhanden:7,zuordnungen:16,hinweise:[]}});
 assert.equal(root.querySelectorAll('input,select,button').length,0);assert.equal(root.querySelector('a').getAttribute('href'),'#/objekte/261');assert.doesNotMatch(root.textContent,/alte Nummer/);assert.match(await control.uebernehmen(),/bereits übernommen/);assert.match(root.textContent,/16 Funktionen zugeordnet/);
});

test('Dubletten lassen sich direkt entscheiden; Auswahl und Datenänderung verlangen jeweils eine neue Vorschau',async t=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://curaaed.example',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,calls=[];
 for(const f of ['ui','kern','eddi-adressen'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),dom.getInternalVMContext());
 w.API={post:async(url,body)=>{calls.push(body);const choice=body.dublettenwahl?.[0]||'';return{objekt:{neu:true,nummer:'868'},pruefwert:'checked',zeilen:[{index:0,aktion:choice?'Vorhandene Adresse':'Prüfen',daten:{wohnung_nummer:'1'},dubletten:[{id:7,nummer:'10007',name:'Anna Test'}],dublettenwahl:choice,pruefen:!choice}]};}};
 const root=w.document.getElementById('root'),state=w.document.createElement('p');w.eddiAdressvorschlag(root,state,'job',{daten:{objekt:{nummer:'868',bezeichnung:'Test',strasse:'Testweg 1',plz:'12345',ort:'Stadt'},adressen:[{adresstyp:'person',vorname:'Anna',nachname:'Test',wohnung_nummer:'1',funktion:'mieter'}]}});
 const button=text=>[...root.querySelectorAll('button')].find(x=>x.textContent===text),take=button('Adressen, Objekt und Wohnungen übernehmen'),check=button('Vorschau und Dubletten prüfen'),tick=()=>new Promise(r=>setImmediate(r));
 check.click();await tick();assert.equal(take.disabled,true);
 let select=root.querySelector('[aria-label="Dublettenentscheidung · Zeile 1"]');select.value='7';select.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(take.disabled,true);
 check.click();await tick();assert.equal(take.disabled,false);assert.equal(calls.at(-1).dublettenwahl[0],'7');
 const name=root.querySelector('[aria-label="Nachname · Zeile 1"]');name.value='Anderer';name.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(take.disabled,true);
 check.click();await tick();assert.equal(calls.at(-1).dublettenwahl[0],undefined);assert.equal(take.disabled,true);
});
