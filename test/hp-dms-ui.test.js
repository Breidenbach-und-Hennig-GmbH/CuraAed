'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
const entry={id:9,titel:'<img src=x onerror=alert(1)>',dateiname:'test.pdf',dokumentart:'Schriftverkehr',datum:'2026-11-10',archivnummer:123,groesse:100,sachbearbeiter:'FD'};
function setup(t, get){
 const dom=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.example/'});t.after(()=>dom.window.close());
 const w=dom.window;w.API={get,qs:o=>'?'+new URLSearchParams(o)};
 for(const file of ['ui','kern','rechnungen','shell','dms-upload','dms-posteingang','dms'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+file+'.js'),'utf8'),dom.getInternalVMContext());
 vm.runInContext('S.lauf=1;S.benutzer={rolle:"admin"};',dom.getInternalVMContext());return w;
}
test('DMS-UI: persönliche Quelle, serverseitige Suche, Dateiliste und sichere Zuordnungsanzeige',async t=>{
 const calls=[];const w=setup(t,async url=>{
   calls.push(url);if(url.endsWith('/verbindungen'))return{verbindungen:[{id:'a',subdomain:'kunde-a'}]};
   if(url.endsWith('/9'))return{dokument:entry,dateien:[entry,{...entry,id:10}],zuordnungen:[{art:'units',titel:'Einheiten',gesamt:1,eintraege:[{hpNummer:2,objektNummer:4010,name:'Testweg'}]}]};
   return{dokumente:[entry],gesamt:100,seite:1,weitere:true};
 });
 await w.dmsUebernahmeMaske();assert.ok(calls.some(u=>u.includes('/dms/a/dokumente?')));assert.match(w.document.body.textContent,/100 Treffer/);
 assert.equal(w.document.querySelectorAll('img').length,0);assert.equal(w.document.querySelectorAll('a[href*="hausperfekt-mobile.de"]').length,0);
 const title=[...w.document.querySelectorAll('button')].find(b=>b.textContent===entry.titel);title.click();await tick();await tick();
 assert.match(w.document.querySelector('[role=dialog]').textContent,/Objekt 4010/);assert.equal(w.document.querySelectorAll('[role=dialog] button[title="Datei in CuraAed sichern und herunterladen"]').length,2);
 [...w.document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Schließen').click();
 const search=w.document.getElementById('dms-suche');search.value='A&B';w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 assert.ok(calls.some(u=>u.includes('suche=A%26B')));
});
test('DMS-UI: spätes Suchergebnis eines anderen Kundenbestands wird verworfen',async t=>{
 let resolveA;const w=setup(t,async url=>{
  if(url.endsWith('/verbindungen'))return{verbindungen:[{id:'a',subdomain:'kunde-a'},{id:'b',subdomain:'kunde-b'}]};
  if(url.includes('/dms/a/'))return new Promise(r=>{resolveA=r;});
  return{dokumente:[{...entry,titel:'Kunde B'}],gesamt:1,seite:1,weitere:false};
 });
 await w.dmsUebernahmeMaske();const select=w.document.getElementById('dms-verbindung');assert.equal(select.value,'');
 select.value='a';select.dispatchEvent(new w.Event('change'));await tick();
 select.value='b';select.dispatchEvent(new w.Event('change'));await tick();
 resolveA({dokumente:[{...entry,titel:'Fremdes spätes Ergebnis'}],gesamt:1,seite:1,weitere:false});await tick();
 assert.match(w.document.body.textContent,/Kunde B/);assert.doesNotMatch(w.document.body.textContent,/Fremdes spätes Ergebnis/);
});
test('DMS-UI: Download nutzt nur eigenen Endpunkt; Fehler speichert keine Datei',async t=>{
 const w=setup(t,async()=>({verbindungen:[]}));let objectUrls=0,fetchUrl;
 w.URL.createObjectURL=()=>{objectUrls++;return'blob:test';};w.URL.revokeObjectURL=()=>{};
 w.fetch=async(url,options)=>{fetchUrl=url;assert.equal(options.credentials,'same-origin');return{ok:false,json:async()=>({fehler:'Datei fehlt in HP-Mobile'})};};
 const b=w.dmsDownloadKnopf('a',entry);w.document.body.append(b);b.click();await tick();await tick();
 assert.equal(fetchUrl,'/api/hausperfekt/dms/a/dokumente/9/download');assert.equal(objectUrls,0);assert.match(w.document.body.textContent,/Datei fehlt/);assert.equal(b.disabled,false);
});

test('Dokumente: zuerst Sachbearbeiter-Abfrage, eigene Vorbelegung, Großbuchstaben und Auswahl vor Datenabruf',async t=>{
 const calls=[];const w=setup(t,async url=>{calls.push(url);if(url==='/mitarbeiter')return[{kuerzel:'FD',name:'Franziska Dawid'}];return{eintraege:[],gesamt:0,seite:1,weitere:false};});
 w.eval('S.benutzer.kuerzel="FD";S.benutzer.name="Franziska Dawid";');
 const running=w.dmsMaske();assert.equal(w.document.getElementById('dms-sachbearbeiter').value,'FD');assert.match(w.document.querySelector('[role=dialog]').textContent,/DMS Sachbearbeiter auswählen/);assert.equal(calls.filter(u=>u.includes('/dms-posteingang')).length,0);
 const input=w.document.getElementById('dms-sachbearbeiter');input.value='ad';input.dispatchEvent(new w.Event('input'));assert.equal(input.value,'AD');
 w.document.getElementById('dms-sb-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await running;
 assert.ok(calls.some(u=>u.includes('sb=AD')));assert.equal(w.document.querySelector('[role=dialog]'),null);assert.match(w.document.body.textContent,/AD/);
});
test('Dokumente: leeres Feld für alle, Abbrechen öffnet keine Dokumente',async t=>{
 const calls=[];const w=setup(t,async url=>{calls.push(url);return url==='/mitarbeiter'?[]:{eintraege:[],gesamt:0,seite:1,weitere:false};});
 let running=w.dmsMaske();w.document.getElementById('dms-sb-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await running;assert.ok(calls.some(u=>u.includes('sb=&')));assert.match(w.document.body.textContent,/Alle Sachbearbeiter/);
 const before=calls.filter(u=>u.startsWith('/dms-posteingang')).length;running=w.dmsMaske();[...w.document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Abbrechen').click();await running;assert.equal(calls.filter(u=>u.startsWith('/dms-posteingang')).length,before);
});

test('DMS-Maske: Auswahl zeigt lokale Datei, echte Zuordnungen und speichert Bemerkung mit Versionsschutz',async t=>{
 const detail={eingang:{dokument_id:9,sachbearbeiter:'FD',revision:3},dokument:{id:9,titel:'Brief',original_name:'brief.pdf',quelle:'upload',kategorie:'sonstiges',groesse:100,beschreibung:'Alte Bemerkung',erstellt_am:'2026-11-10 10:00:00',verknuepfungen:[{typ:'adresse',ziel_id:7,nummer:77,label:'Musterfirma'}]},autor:{kuerzel:'AD'},oeffentlich:false,verfall_am:null,verlauf:[]};
 const w=setup(t,async url=>url==='/dms-posteingang/9'?detail:{eintraege:[{dokument_id:9,titel:'Brief',sachbearbeiter:'FD',revision:3,status:'offen',erstellt_am:'2026-11-10 10:00:00',zugriffe:2}],gesamt:1,seite:1,weitere:false});
 let saved;w.API.put=async(url,body)=>{saved={url,body};detail.eingang.revision++;detail.dokument.beschreibung=body.bemerkung;};
 await w.dmsPosteingangMaske('FD',1);
 assert.ok(w.document.querySelector('.cu-dms-oben'));assert.ok(w.document.querySelector('.cu-dms-unten'));
 assert.match(w.document.body.textContent,/brief.pdf/);assert.ok(w.document.querySelector('a[href="#/adressen/7"]'));assert.match(w.document.querySelector('.cu-dms-bemerkung').textContent,/Bemerkung/);
 const note=w.document.querySelector('textarea');assert.equal(note.value,'Alte Bemerkung');note.value='Neue Bemerkung';note.dispatchEvent(new w.Event('input'));
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Angaben speichern').click();await tick();await tick();
 assert.equal(saved.url,'/dms-posteingang/9/metadaten');assert.equal(saved.body.revision,3);assert.equal(saved.body.basis_bemerkung,'Alte Bemerkung');assert.equal(saved.body.bemerkung,'Neue Bemerkung');
 assert.equal(w.document.querySelectorAll('a[href*="hausperfekt-mobile"]').length,0);
});

test('DMS Drag & Drop: mehrere Dateien, richtiger Sachbearbeiter und gezielter Wiederholungsversuch ohne Doppelupload',async t=>{
 const w=setup(t,async()=>({})),root=w.document.createElement('div');w.document.body.append(root);let uploads=0,assignments=0,reloads=0,fail=true;
 w.API.upload=async(p,fd)=>{assert.equal(p,'/archiv');assert.ok(fd.get('datei'));return{id:++uploads};};
 w.API.post=async(p,b)=>{assert.equal(p,'/dms-posteingang');assert.equal(b.sachbearbeiter,'FD');assignments++;if(b.dokument_id===2&&fail)throw new Error('Zuordnung vorübergehend fehlgeschlagen');};
 root.append(w.dmsDateiEingang(root,{sachbearbeiter:'FD',aktuell:()=>true,neuLaden:async()=>{reloads++;}}));
 const files=[new w.File(['%PDF'],'eins.pdf',{type:'application/pdf'}),new w.File(['Text'],'zwei.txt',{type:'text/plain'})];
 const drop=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{types:['Files'],files}});root.dispatchEvent(drop);assert.equal(drop.defaultPrevented,true);await tick();await tick();await tick();
 assert.equal(uploads,2);assert.equal(assignments,2);assert.match(root.textContent,/eins.pdf/);assert.match(root.textContent,/Datei bereits gespeichert/);
 fail=false;[...root.querySelectorAll('button')].find(b=>b.textContent==='Erneut versuchen').click();await tick();await tick();
 assert.equal(uploads,2);assert.equal(assignments,3);assert.ok(root.textContent.includes('2 Datei(en) übernommen'));assert.ok(reloads>=1);
});
test('DMS Drag & Drop: Text und Links werden nicht importiert, leere und ungeeignete Dateien abgewiesen',async t=>{
 const w=setup(t,async()=>({})),root=w.document.createElement('div');w.document.body.append(root);let uploads=0;w.API.upload=async()=>{uploads++;};
 root.append(w.dmsDateiEingang(root,{sachbearbeiter:'',aktuell:()=>true,neuLaden:async()=>{}}));
 const textDrop=new w.Event('drop',{cancelable:true});Object.defineProperty(textDrop,'dataTransfer',{value:{types:['text/plain'],files:[]}});root.dispatchEvent(textDrop);assert.equal(textDrop.defaultPrevented,false);
 const files=[new w.File([],'leer.pdf'),new w.File(['x'],'programm.exe')],drop=new w.Event('drop',{cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{types:['Files'],files}});root.dispatchEvent(drop);await tick();
 assert.equal(uploads,0);assert.match(root.textContent,/Datei ist leer/);assert.match(root.textContent,/Dateiformat wird nicht unterstützt/);
});

test('Drag & Drop: erkannte Rechnung öffnet automatisch die vorbelegte Rechnungsmaske ohne Freigaben',async t=>{
 const doc={id:77,titel:'rechnung.pdf',original_name:'rechnung.pdf',verknuepfungen:[]},erkennung={rechnung:true,methode:'Lokale OCR',felder:{rechnungs_nr:'RE-42',rechnungsdatum:'2026-11-09',betrag:'1190,00',faelligkeit:'2026-11-23'},hinweise:[],belege:{}};
 const w=setup(t,async()=>({dokument:doc,rechnung:null,erkennung})),root=w.document.createElement('div');w.document.body.append(root);let uploads=0,recognized=0;
 w.API.upload=async()=>{uploads++;return doc;};w.API.post=async(p,b)=>{if(p==='/eingangsrechnungen/erkennen'){recognized++;assert.equal(b.dokument.id,77);return erkennung;}return{ok:true};};
 root.append(w.dmsDateiEingang(root,{sachbearbeiter:'FD',aktuell:()=>true,neuLaden:async()=>{}}));
 const drop=new w.Event('drop',{cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{types:['Files'],files:[new w.File(['%PDF'],'rechnung.pdf',{type:'application/pdf'})]}});root.dispatchEvent(drop);
 await tick();await tick();await tick();assert.equal(uploads,1);assert.equal(recognized,1);assert.equal(w.document.getElementById('rechnung-rechnungs_nr').value,'RE-42');assert.equal(w.document.getElementById('rechnung-betrag').value,'1190,00');assert.equal(w.document.getElementById('rechnung-zahlung_freigegeben').checked,false);assert.match(w.document.querySelector('.cu-rechnung-erkannt').textContent,/bitte prüfen/);
});
