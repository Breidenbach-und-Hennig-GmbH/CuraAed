'use strict';
function hpAdressStatus(a) {
 const s=a.hp_sync;if(!s)return 'Lokal in CuraAed · noch keiner HP-Adresse zugeordnet';
 const names={synchron:'Synchron',ausstehend:'Übertragung ausstehend',unterwegs:'Wird an HP übertragen',konflikt:'Konflikt – Entscheidung erforderlich',unklar:'Ergebnis unklar – Abgleich angehalten',fehler:'Übertragung angehalten'};
 return 'HP '+s.nummer+' · '+(names[s.status]||s.status)+(s.aktiv?(s.online?'':' · Connector offline'):' · Freigabe beendet')+(s.meldung?' · '+s.meldung:'');
}
function hpAdressInfo(a) {
 const text=el('p',{role:'status',text:hpAdressStatus(a)}),box=el('div',{class:'hp-panel'},[text]);
 if(a.hp_sync) {
  box.append(el('p',{class:'small muted',text:'HP-Abgleich: Anrede, Vorname, Name/Firma, Zusatz und Postanschrift. Weitere Felder bleiben lokal.'}));
  box.append(el('button',{type:'button',text:'Aktuellen Stand laden',onclick:()=>neuLaden()}));
  if(S.benutzer?.rolle==='admin'&&['konflikt','unklar','fehler'].includes(a.hp_sync.status))for(const [value,label]of [['hp','HP-Stand übernehmen'],['curaaed','CuraAed-Änderung erneut abgleichen']])box.append(el('button',{type:'button',text:label,onclick:async()=>{
   if(!await bestaetigen(label+'? Die Entscheidung gilt nur für diese Adresse.'))return;
   try{await API.post('/hp-adressen/adressen/'+a.id+'/konflikt',{version:a.hp_sync.konflikt_version,uebernehmen:value});neuLaden();}catch(e){fehler(e);}
  }}));
  const lauf=S.lauf;async function poll(){if(lauf!==S.lauf||!box.isConnected)return;try{const fresh=await API.get('/adressen/'+a.id);text.textContent=hpAdressStatus(fresh);if(fresh.hp_sync?.version!==a.hp_sync.version)text.textContent+=' · Neue HP-Daten verfügbar: aktuellen Stand laden.';}catch{}if(lauf===S.lauf&&box.isConnected)setTimeout(poll,10000);}setTimeout(poll,10000);
 }
 return box;
}
async function hpAdressBereich(lauf,desktop) {
 if(S.benutzer?.rolle!=='admin')return;
 const list=el('div'),status=el('p',{role:'status'});
 async function load(){try{
  const data=await API.get('/hp-adressen/verbindungen');if(lauf!==S.lauf)return;list.replaceChildren();
  for(const v of data.verbindungen){
   const duration=!v.aktiv?'Freigabe beendet':v.ablauf_ms===0?'Dauerhaft freigegeben · jederzeit widerrufbar':Date.now()<v.ablauf_ms?'Freigabe bis '+new Date(v.ablauf_ms).toLocaleString('de-DE'):'Freigabe abgelaufen';
   list.append(el('p',{text:v.name+' · '+v.datenbank+' · '+v.anzahl+' Adressen · '+v.probleme+' angehalten · '+(v.importfehler?.length||0)+' Importprobleme · '+duration}));
   if(v.aktiv&&v.ablauf_ms!==0)list.append(el('button',{text:'Dauerhaft freigeben',onclick:async()=>{
    if(!await bestaetigen('Den Namens- und Postanschriftabgleich für '+v.datenbank+' dauerhaft freigeben? Die bestehende Kopplung bleibt erhalten. Über „Adressabgleich trennen“ kannst du die Freigabe jederzeit widerrufen.'))return;
    try{await API.post('/hp-adressen/verbindungen/'+v.id+'/dauerhaft',{zustimmung:true});status.textContent='Dauerhafte Freigabe gespeichert. Der laufende Connector benötigt keine neuen Kopplungsdaten.';await load();}catch(e){status.textContent=e.message;}
   }}));
   list.append(el('button',{text:'Adressabgleich trennen',onclick:async()=>{if(await bestaetigen('Adressabgleich für diesen Kundenbestand beenden? Ein zugehöriger Objektimport wird ebenfalls widerrufen.')){await API.post('/hp-adressen/verbindungen/'+v.id+'/trennen',{});load();}}}));
   if(v.importfehler?.length)list.append(el('p',{text:'Diese HP-Adressen wurden nicht übernommen. Andere Adressen werden weiter abgeglichen.'}),el('ul',{},v.importfehler.map(e=>el('li',{text:(e.hp_nummer?'HP '+e.hp_nummer:'Verbindung')+': '+e.meldung}))));
  }
 }catch(e){status.textContent=e.message;}}
 desktop.append(el('section',{class:'cu-karte',style:'padding:20px;max-width:1100px;margin:16px auto'},[
  el('h2',{text:'Adressmasken automatisch mit HP abgleichen'}),
  el('p',{text:'Anrede, Vorname, Name/Firma, Zusatz und Postanschrift werden bei laufendem Windows-Connector automatisch abgeglichen. HP-Adressen erscheinen in den normalen Adressmasken. Telefon, E-Mail, Bankdaten, Neuanlage und Löschung in HP sind noch nicht angebunden. Eine CuraAed-Installation gehört genau zu einem HP-Kundenbestand.'}),
  el('a',{href:'/downloads/HP-Adressconnector.exe',download:'HP-Adressconnector.exe',text:'HP-Adressconnector für Windows herunterladen'}),
  el('p',{text:'Der neue Connector überträgt nach dem Erstabgleich nur neue oder geänderte vollständige Adressen. Zum Erkennen von HP-Änderungen prüft er den lokalen Bestand weiterhin über Fingerabdrücke.'}),
  el('p',{},[el('a',{href:'/downloads/HP-Strukturpruefung.exe',download:'HP-Strukturpruefung.exe',text:'HP-Feldprüfung für Objekte und weitere Datenbereiche herunterladen (nur Metadaten)'})]),
  el('button',{text:'Adressabgleich koppeln / Freigabe erneuern',onclick:()=>{
   const f=formular([[{name:'name',label:'Name des Kundenbestands',required:true},{name:'datenbank',label:'HP-Datenbank',required:true}]]),consent=el('input',{type:'checkbox'}),info=el('p',{role:'status'});let secret,busy=false;
   const duration=el('select',{'aria-label':'Freigabedauer'},[el('option',{value:'dauerhaft',text:'Dauerhaft · bis zum Widerruf'}),el('option',{value:'acht',text:'Zeitlich begrenzt · acht Stunden'})]);
   f.form.append(el('label',{},['Freigabedauer ',duration]),el('label',{},[consent,' Für die gewählte Dauer alle Namens- und Postanschriften dieses HP-Kundenbestands nach CuraAed übernehmen und Änderungen daran nach HP zurückschreiben. Dauerhafte Freigaben gelten bis zum Widerruf.']));
   modal({titel:'Adressabgleich freigeben',inhalt:el('div',{},[f.form,info]),onClose:()=>{if(secret)secret.value='';},footer:close=>[el('button',{text:'Freigabe erstellen',onclick:()=>f.form.requestSubmit()}),el('button',{text:'Schließen',onclick:close})]});
   f.form.addEventListener('submit',async ev=>{ev.preventDefault();if(busy||!consent.checked)return;busy=true;try{
    const r=await API.post('/hp-adressen/verbindungen',{name:f.inputs.name.value,datenbank:f.inputs.datenbank.value,zustimmung:true,dauerhaft:duration.value==='dauerhaft'});
    secret=el('input',{type:'password',readonly:'readonly',autocomplete:'off','aria-label':'Geschützte Adresskopplung',style:'width:100%'});secret.value=JSON.stringify({...r,scope:'adressen-v1',datenbank:f.inputs.datenbank.value.toUpperCase()});
    f.form.replaceChildren(el('p',{text:'Im HP-Adressconnector einfügen. Keine Testkopplung verwenden. Nicht im Chat senden.'}),secret,el('button',{type:'button',text:'Adresskopplungsdaten kopieren',onclick:async()=>{try{await navigator.clipboard.writeText(secret.value);info.textContent='Kopiert. Im HP-Adressconnector einfügen.';}catch{info.textContent='Zwischenablage nicht verfügbar.';}}}));await load();
   }catch(e){info.textContent=e.message;busy=false;}});
  }}),el('button',{text:'Adressabgleich-Status aktualisieren',onclick:load}),status,list,
 ]));await load();
}
