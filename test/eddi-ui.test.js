'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { JSDOM } = require('jsdom');
const tick = () => new Promise(r => setImmediate(r));
function setup(t, role = 'mitarbeiter') {
  const dom = new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>', { runScripts: 'outside-only', url: 'https://curaaed.test/#/' });
  t.after(() => dom.window.close()); const w = dom.window;
  for (const f of ['adressdaten','ui', 'kern', 'shell', 'eddi', 'eddi-adressen', 'eddi-teilung', 'eddi-modell']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/' + f + '.js'), 'utf8'), dom.getInternalVMContext());
  w.eval('S.benutzer={id:1,rolle:' + JSON.stringify(role) + ',name:"Test"}'); return w;
}

test('Eddi nimmt eine abgelegte PDF an, blockiert mehrere/ungeeignete Dateien und startet dabei keine KI', async t => {
  const w = setup(t); const uploads = []; let modelCalls = 0, finish;
  w.API = {
    get: async url => url === '/eddi/status' ? { bereit: true, sprachmodell: 'OpenAI', anleitungen: 0 } : { status: 'gelesen', dateiname: 'Teilung.pdf', gesamt: 2, gelesen: true },
    upload: async (url, data) => { uploads.push({url, file: data.get('datei')}); return new Promise(resolve => { finish = () => resolve({id:'test-pdf'}); }); },
    post: async () => { modelCalls++; }
  };
  const root = w.eddiLeiste(); w.document.getElementById('hp-desktop').append(root);
  function drag(type, files = []) {
    const e = new w.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'dataTransfer', {value:{types:['Files'], files, dropEffect:'none'}});
    root.dispatchEvent(e); return e;
  }
  const pdf = new w.File(['%PDF'], 'Teilung.pdf', {type:'application/pdf'});
  drag('dragenter'); assert.ok(root.classList.contains('cu-eddi-drop-aktiv'));
  assert.equal(drag('dragover').defaultPrevented, true);
  assert.equal(drag('drop',[pdf]).defaultPrevented, true); await tick();
  assert.equal(uploads.length,1); assert.equal(uploads[0].url,'/eddi/teilungen');
  assert.equal(uploads[0].file.name,'Teilung.pdf'); assert.equal(modelCalls,0);
  assert.equal(root.classList.contains('cu-eddi-drop-aktiv'),false);
  drag('drop',[pdf]); await tick(); assert.equal(uploads.length,1); // no competing upload
  finish(); await tick(); await tick();
  assert.match(root.textContent,/Alle 2 Seiten lokal gelesen/);
  drag('drop',[pdf,pdf]); await tick(); assert.match(root.textContent,/genau eine PDF/);
  drag('drop',[new w.File(['hello'],'Rechnung.exe')]); await tick();
  assert.match(root.textContent,/PDF bis 25 MB/); assert.equal(uploads.length,1);
  drag('drop',[{name:'gross.pdf',size:26*1024*1024}]); await tick(); assert.equal(uploads.length,1);
  assert.equal(modelCalls,0);
  assert.ok([...root.querySelectorAll('button')].some(b=>b.textContent==='Dokument analysieren'));
});
test('Eddi zeigt die gewünschte Zeile, startet ohne Einwilligung keine KI-Anfrage und lässt sich per Esc zuklappen', async t => {
  const w = setup(t); let requests = 0;
  w.API = { get: async () => ({ bereit: true, sprachmodell: 'OpenAI', anleitungen: 0 }), post: async () => { requests++; return { chat_id: 'test', text: '<img src=x onerror=alert(1)>', schritte: [], vorschlaege: [] }; } };
  const root = w.eddiLeiste(); w.document.getElementById('hp-desktop').append(root);
  assert.match(root.textContent, /Hallo, ich bin Eddi, wie kann ich dir helfen\?/); assert.equal(requests, 0);
  const input = root.querySelector('input[type=text]'); input.value = 'Hallo'; input.focus(); await tick();
  root.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); assert.equal(requests, 0);
  root.querySelector('input[type=checkbox]').checked = true;
  root.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
  assert.equal(requests, 1); assert.match(root.textContent, /<img src=x/); assert.equal(root.querySelectorAll('img').length, 0);
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(root.querySelector('.cu-eddi-panel').hidden, true);
  assert.equal([...root.querySelectorAll('button')].some(b => b.textContent === 'KI einrichten'), false);
});
test('Administratoren erhalten KI-Einrichtung, Mitarbeiter nicht; ohne Schlüssel wird keine Verarbeitung vorgetäuscht', async t => {
  const w = setup(t, 'admin'); let writes = 0;
  w.API = { get: async () => ({ bereit: false, sprachmodell: 'OpenAI', anleitungen: 0 }), post: async () => { writes++; } };
  const root = w.eddiLeiste(); w.document.getElementById('hp-desktop').append(root);
  root.querySelector('input[type=text]').focus(); await tick();
  assert.match(root.textContent, /noch nicht verbunden/); assert.ok([...root.querySelectorAll('button')].some(b => b.textContent === 'KI einrichten'));
  root.querySelector('input[type=text]').value = 'Erstelle ein Objekt';
  root.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); assert.equal(writes, 0);
});

async function adressAuftrag(t,duplicates=false){
 const w=setup(t),calls=[];w.sessionStorage.setItem('curaaed-teilung-1','job');
 const daten={objekt:{nummer:'868',bezeichnung:'Test',strasse:'Testweg 1',plz:'12345',ort:'Teststadt'},adressen:[{adresstyp:'person',vorname:'Anna',nachname:'Test',wohnung_nummer:'1',funktion:'eigentuemer'}]};
 const result={objekt_id:17,adressen_neu:1,wohnungen_neu:1,adressen_vorhanden:0,zuordnungen:1,hinweise:[]};
 w.API={get:async url=>url==='/eddi/status'?{bereit:false,sprachmodell:'OpenAI',anleitungen:0}:{dateiname:'Adressliste.pdf',status:'analysiert',gelesen:true,adressliste:{daten}},post:async(url,body)=>{
  calls.push({url,body});
  if(url.endsWith('/vorschau'))return{objekt:{nummer:body.objektnummer,neu:true},pruefwert:'proof',zeilen:[{index:0,aktion:duplicates?'Prüfen':'Neue Adresse',daten:body.daten.adressen[0],dubletten:duplicates?[{id:7,nummer:'10007',name:'Anna Test'}]:[],pruefen:duplicates}]};
  if(url.endsWith('/uebernehmen'))return result;
  throw Error('Unerwarteter Modellaufruf: '+url);
 }};
 const root=w.eddiLeiste();w.document.getElementById('hp-desktop').append(root);await new Promise(r=>w.setTimeout(r,0));await tick();
 const input=root.querySelector('[aria-label="Auftrag an Eddi"]');
 async function send(text){input.value=text;root.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();}
 return{w,root,calls,send};
}

test('Übernimm die geprüfte Liste führt die aktuelle Adressvorschau lokal aus, ohne erneute KI-Einwilligung oder doppelte Anlage',async t=>{
 const f=await adressAuftrag(t);const nummer=f.root.querySelector('[name="objektnummer"]');nummer.value='18736';nummer.dispatchEvent(new f.w.Event('input',{bubbles:true}));
 await f.send('Eddi, übernimm die geprüfte Liste');
 assert.equal(f.calls.length,2);assert.match(f.calls[0].url,/vorschau$/);assert.match(f.calls[1].url,/uebernehmen$/);assert.equal(f.calls[1].body.objektnummer,'18736');assert.equal(f.calls[1].body.pruefwert,'proof');assert.equal(f.calls[1].body.geprueft,true);
 assert.match(f.root.querySelector('[role="log"]').textContent,/1 Adressen und 1 Wohnungen neu angelegt/);
 await f.send('Bitte übernehmen');assert.equal(f.calls.length,2);assert.match(f.root.querySelector('[role="log"]').textContent,/bereits übernommen/);
});

test('Übernehmen als Texteingabe zeigt offene Dubletten an und legt keine ungeprüften Datensätze an',async t=>{
 const f=await adressAuftrag(t,true);await f.send('Übernimm die Adressliste');assert.equal(f.calls.length,1);assert.match(f.calls[0].url,/vorschau$/);assert.match(f.root.querySelector('[role="log"]').textContent,/Dubletten klären/);assert.equal(f.root.querySelector('[aria-label="Dublettenentscheidung · Zeile 1"]').value,'');
});

test('Verneinungen, Fragen, eingeschränkter Umfang und spätere Ausführung lösen keinen Adressimport aus',async t=>{
 const f=await adressAuftrag(t);
 for(const text of ['Noch nicht übernehmen','Wie kann ich die Liste übernehmen?','Kann ich die Liste übernehmen?','Übernimm nur die Adressen','Bitte übernimm die Liste morgen','Übernimm die Rechnung'])await f.send(text);
 assert.equal(f.calls.length,0);
});

test('Neue Adressliste versteht „leg … an“, behält den Auftrag bei fehlender Freigabe und startet danach nur Auswertung und Vorschau',async t=>{
 const w=setup(t),calls=[],saved=[];w.sessionStorage.setItem('curaaed-teilung-1','neu');
 const data={objekt:{nummer:'867',bezeichnung:'Neu',strasse:'Neuweg 1',plz:'12345',ort:'Stadt'},adressen:[{adresstyp:'person',nachname:'Test',funktion:'unklar'}]};let analysed=false;
 w.API={get:async url=>url==='/eddi/status'?{bereit:true,sprachmodell:'OpenAI',freigabe:{anbieter:'OpenAI',dauerhaft:false},anleitungen:0}:{dateiname:'867 - Eigentümer Adressliste.pdf',status:'gelesen',gelesen:true,dokumenttyp:'adressliste',adressliste:analysed?{daten:data}:null},put:async(url,body)=>{saved.push({url,body});return body;},post:async(url,body)=>{calls.push({url,body});if(url.endsWith('/auswerten')){analysed=true;return data;}if(url.endsWith('/vorschau'))return{objekt:{nummer:'18745',neu:false},pruefwert:'proof',zeilen:[]};throw Error('Kein allgemeiner Chat oder ungeprüfter Import erlaubt.');}};
 const root=w.eddiLeiste();w.document.getElementById('hp-desktop').append(root);await new Promise(r=>w.setTimeout(r,0));await tick();
 const input=root.querySelector('[aria-label="Auftrag an Eddi"]'),consent=root.querySelector('[aria-label="Verarbeitung durch das Sprachmodell erlauben"]'),remember=root.querySelector('[aria-label="OpenAI-Freigabe für meine Kennung dauerhaft merken"]'),button=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);
 const text='leg die nächsten adressen für dieses objekt an. prüfe ob das objekt in HP schon existiert.';input.value=text;
 const submit=async()=>{root.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();};
 await submit();assert.equal(calls.length,0);assert.equal(input.value,text);assert.equal(w.document.activeElement,consent);assert.equal(root.querySelector('.cu-eddi-starthilfe').hidden,false);assert.equal(button('Los').disabled,false);
 consent.checked=true;consent.dispatchEvent(new w.Event('change',{bubbles:true}));remember.checked=true;remember.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();assert.equal(saved[0].url,'/eddi/freigabe');assert.equal(saved[0].body.dauerhaft,true);
 await submit();assert.equal(calls.length,2);assert.match(calls[0].url,/\/neu\/adressen\/auswerten$/);assert.match(calls[1].url,/vorschau$/);assert.equal(calls[0].body.zustimmung,true);assert.match(root.textContent,/Vorhandenes Objekt 18745/);assert.match(root.textContent,/867 - Eigentümer Adressliste.pdf/);
 button('Neues Gespräch').click();assert.equal(consent.checked,true);
 consent.checked=false;consent.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();assert.equal(saved.at(-1).body.dauerhaft,false);assert.equal(remember.checked,false);
});

test('Gespeicherte Freigabe wird nur für denselben Anbieter geladen und auf neuen Gesprächen beibehalten',async t=>{
 for(const provider of ['OpenAI','anderer Anbieter']){
  const w=setup(t);w.API={get:async()=>({bereit:true,sprachmodell:provider,anleitungen:0,freigabe:{anbieter:'OpenAI',dauerhaft:true}})};const root=w.eddiLeiste();w.document.getElementById('hp-desktop').append(root);root.querySelector('[aria-label="Auftrag an Eddi"]').focus();await tick();
  const consent=root.querySelector('[aria-label="Verarbeitung durch das Sprachmodell erlauben"]'),remember=root.querySelector('[aria-label="OpenAI-Freigabe für meine Kennung dauerhaft merken"]');assert.equal(consent.checked,provider==='OpenAI');assert.equal(remember.checked,provider==='OpenAI');
 }
});
