'use strict';
function hpAdressStatus(a) {
 const s=a.hp_sync;if(!s&&a.hp_neuanlage)return 'HP-Neuanlage · '+({wartend:'wartet auf den Connector',abgeholt:'wird vorbereitet',reserviert:'Rückprüfung läuft',pruefen:'Bitte prüfen'}[a.hp_neuanlage.status]||a.hp_neuanlage.status)+(a.hp_neuanlage.meldung?' · '+a.hp_neuanlage.meldung:'');if(!s)return 'Lokal in CuraAed · noch keiner HP-Adresse zugeordnet';
 const names={synchron:'Synchron',neuanlage:'Neuanlage wird geprüft',ausstehend:'Übertragung ausstehend',unterwegs:'Wird an HP übertragen',konflikt:'Konflikt – Entscheidung erforderlich',unklar:'Ergebnis unklar – Abgleich angehalten',fehler:'Übertragung angehalten'};
 return 'HP '+s.nummer+' · '+(names[s.status]||s.status)+(s.aktiv?(s.online?'':' · Connector offline'):(s.abgelaufen?' · Freigabe abgelaufen – kein Abgleich':' · Freigabe beendet'))+(s.zuletzt_gesehen?' · Letzter Kontakt: '+new Date(s.zuletzt_gesehen).toLocaleString('de-DE'):'')+(s.meldung?' · '+s.meldung:'');
}
function hpAdressInfo(a) {
 const text=el('p',{role:'status',text:hpAdressStatus(a)}),box=el('div',{class:'hp-panel'},[text]);
 if(a.hp_sync||a.hp_neuanlage) {
  if(a.hp_sync&&![a.vorname,a.nachname,a.firmenname].some(v=>v?.trim()))box.append(el('p',{role:'status',class:'small',text:a.zusatz?'In HP sind Vorname und Name1 leer. Die Anzeige verwendet die originale Zusatzzeile (Name2). Die HP-Felder wurden nicht verändert.':'In HP fehlen die Namensfelder. Bitte den Quelldatensatz unter HP-Adressnummer '+a.hp_sync.nummer+' prüfen.'}));
  box.append(el('p',{class:'small muted',text:'HP-Abgleich: Name und Postanschrift in beide Richtungen. Zusätzlich freigegebene Adressbereiche werden aus HP übernommen; lokale Änderungen daran bleiben geschützt.'}));
  box.append(el('button',{type:'button',text:'Aktuellen Stand laden',onclick:()=>neuLaden()}));
  if(a.hp_sync&&S.benutzer?.rolle==='admin')box.append(el('button',{type:'button',text:'HP-Adressbereiche',onclick:()=>hpAdressQuelldaten(a.id)}));
  if(S.benutzer?.rolle==='admin'&&['konflikt','unklar','fehler'].includes(a.hp_sync?.status))for(const [value,label]of [['hp','HP-Stand übernehmen'],['curaaed','CuraAed-Änderung erneut abgleichen']])box.append(el('button',{type:'button',text:label,onclick:async()=>{
   if(!await bestaetigen(label+'? Die Entscheidung gilt nur für diese Adresse.'))return;
   try{await API.post('/hp-adressen/adressen/'+a.id+'/konflikt',{version:a.hp_sync.konflikt_version,uebernehmen:value});neuLaden();}catch(e){fehler(e);}
  }}));
  const lauf=S.lauf;async function poll(){if(lauf!==S.lauf||!box.isConnected)return;try{const fresh=await API.get('/adressen/'+a.id);text.textContent=hpAdressStatus(fresh);if(fresh.hp_sync?.version!==a.hp_sync?.version)text.textContent+=' · Neue HP-Daten verfügbar: aktuellen Stand laden.';}catch{}if(lauf===S.lauf&&box.isConnected)setTimeout(poll,10000);}setTimeout(poll,10000);
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
   list.append(el('p',{text:v.name+' · '+v.datenbank+' · '+v.anzahl+' Adressen · '+v.probleme+' angehalten · '+(v.importfehler?.length||0)+' Importprobleme · '+duration+(v.vollstaendig?' · Alle Adressbereiche freigegeben · '+(v.bereiche?.uebernommen||0)+' Bereiche gelesen · '+(v.bereiche?.pruefen||0)+' prüfen'+(v.neuanlagen?' · HP-Neuanlage aktiv':''):' · Nur Name und Postanschrift')}));
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
  el('p',{text:'Anrede, Vorname, Name/Firma, Zusatz und Postanschrift werden bei laufendem Windows-Connector automatisch abgeglichen. HP-Adressen erscheinen in den normalen Adressmasken. Telefonnummern, E-Mails, Bankverbindungen, Mandate und Ansprechpartner können zusätzlich aus HP übernommen werden. Neue Adressen können nach gesonderter Freigabe automatisch in HP angelegt werden. Löschungen werden nicht übertragen. Eine CuraAed-Installation gehört genau zu einem HP-Kundenbestand.'}),
  el('a',{href:'/downloads/HP-Adressconnector.exe',download:'HP-Adressconnector.exe',text:'HP-Adressconnector für Windows herunterladen'}),
  el('p',{text:'Der neue Connector überträgt nach dem Erstabgleich nur neue oder geänderte vollständige Adressen. Zum Erkennen von HP-Änderungen prüft er den lokalen Bestand weiterhin über Fingerabdrücke.'}),
  el('p',{},[el('a',{href:'/downloads/HP-Strukturpruefung.exe',download:'HP-Strukturpruefung.exe',text:'HP-Feldprüfung für Objekte und weitere Datenbereiche herunterladen (nur Metadaten)'})]),
  el('p',{},[el('a',{href:'/downloads/HP-Adresspruefung.exe',download:'HP-Adresspruefung.exe',text:'Adressbereiche, Nummernvergabe und Protokollkennungen prüfen (nur lesend)'})]),
  el('button',{text:'Adressabgleich koppeln / Freigabe erneuern',onclick:()=>{
   const f=formular([[{name:'name',label:'Name des Kundenbestands',required:true},{name:'datenbank',label:'HP-Datenbank',required:true}]]),consent=el('input',{type:'checkbox','aria-label':'Adressabgleich zustimmen'}),info=el('p',{role:'status'}),full=el('input',{type:'checkbox','aria-label':'Alle HP-Adressbereiche'}),create=el('input',{type:'checkbox','aria-label':'Neue Adressen in HP anlegen'});let secret,busy=false;create.addEventListener('change',()=>{if(create.checked)full.checked=true;});full.addEventListener('change',()=>{if(!full.checked)create.checked=false;});
   const duration=el('select',{'aria-label':'Freigabedauer'},[el('option',{value:'dauerhaft',text:'Dauerhaft · bis zum Widerruf'}),el('option',{value:'acht',text:'Zeitlich begrenzt · acht Stunden'})]);
   f.form.append(el('label',{},[full,' Zusätzlich alle verknüpften Adressbereiche lesen: weitere Namenszeilen, Telefonnummern, E-Mails, Bankverbindungen, SEPA-Mandate, Ansprechpartner, Zusatzinformationen und Adressprotokoll.']),el('label',{},[create,' Neue Adressen automatisch in HausPerfekt anlegen, einschließlich Telefon, Mobil und E-Mail. Nummernvergabe und Rückprüfung erfolgen durch den laufenden Windows-Connector. Bestehende lokale Adressen werden nicht automatisch nachträglich angelegt.']),el('label',{},['Freigabedauer ',duration]),el('label',{},[consent,' Für die gewählte Dauer alle Namens- und Postanschriften dieses HP-Kundenbestands nach CuraAed übernehmen und Änderungen daran nach HP zurückschreiben. Dauerhafte Freigaben gelten bis zum Widerruf.']));
   modal({titel:'Adressabgleich freigeben',inhalt:el('div',{},[f.form,info]),onClose:()=>{if(secret)secret.value='';},footer:close=>[el('button',{text:'Freigabe erstellen',onclick:()=>f.form.requestSubmit()}),el('button',{text:'Schließen',onclick:close})]});
   f.form.addEventListener('submit',async ev=>{ev.preventDefault();if(busy||!consent.checked)return;busy=true;try{
    const r=await API.post('/hp-adressen/verbindungen',{name:f.inputs.name.value,datenbank:f.inputs.datenbank.value,zustimmung:true,dauerhaft:duration.value==='dauerhaft',vollstaendig:full.checked,neuanlagen:create.checked});
    secret=el('input',{type:'password',readonly:'readonly',autocomplete:'off','aria-label':'Geschützte Adresskopplung',style:'width:100%'});secret.value=JSON.stringify({...r,scope:r.scope||'adressen-v1',datenbank:f.inputs.datenbank.value.toUpperCase()});
    f.form.replaceChildren(el('p',{text:'Im HP-Adressconnector einfügen. Keine Testkopplung verwenden. Nicht im Chat senden.'}),secret,el('button',{type:'button',text:'Adresskopplungsdaten kopieren',onclick:async()=>{try{await navigator.clipboard.writeText(secret.value);info.textContent='Kopiert. Im HP-Adressconnector einfügen.';}catch{info.textContent='Zwischenablage nicht verfügbar.';}}}));await load();
   }catch(e){info.textContent=e.message;busy=false;}});
  }}),el('button',{text:'Adressabgleich-Status aktualisieren',onclick:load}),status,list,
 ]));await load();
}

async function hpAdressQuelldaten(id) {
 const wrap=el('div'),status=el('p',{role:'status',text:'HP-Bereiche werden geladen …'});wrap.append(status);
 let active=true;
 modal({titel:'HP-Adressbereiche',wide:true,inhalt:wrap,onClose:()=>{active=false;},footer:close=>[el('button',{text:'Schließen',onclick:close})]});
 try {
  const data=await API.get('/hp-adressen/adressen/'+id+'/bereiche');if(!active)return;
  const names={synchron:'Übernommen',pruefen:'Bitte prüfen',fehler:'Lesefehler',ausstehend:'Noch nicht übernommen'};
  status.textContent='Telefon, E-Mail, Bank und Ansprechpartner stehen zusätzlich in den üblichen Adressbereichen. Hier sind die HP-Originaldaten lesend einsehbar.';
  for(const b of data.bereiche){
   const d=el('details'),body=el('div');let loaded=false;
   d.append(el('summary',{text:b.label+' · '+(names[b.status]||b.status)+(b.anzahl!=null?' · '+b.anzahl+' Einträge':'')}),body);
   if(b.meldung)body.append(el('p',{role:'status',text:b.meldung}));
   d.addEventListener('toggle',async()=>{if(!d.open||loaded)return;loaded=true;try{
    const r=await API.get('/hp-adressen/adressen/'+id+'/bereiche/'+encodeURIComponent(b.key));if(!active)return;
    if(!r.zeilen.length){body.append(el('p',{text:r.status==='ausstehend'?'Noch keine Lesung. Freigabe und laufenden Connector prüfen.':'Keine Einträge in diesem HP-Bereich.'}));return;}
    const pager=el('div'),view=el('div');let offset=0;
    function draw(){view.replaceChildren();pager.replaceChildren();for(const row of r.zeilen.slice(offset,offset+10)){
     const dl=el('dl',{style:'display:grid;grid-template-columns:minmax(120px,1fr) 3fr;gap:2px 12px;margin:8px 0 16px'});
     for(const key of r.felder){const v=row[key];if(v===null||v==='')continue;dl.append(el('dt',{text:key}),el('dd',{text:String(v),style:'margin:0;white-space:pre-wrap;overflow-wrap:anywhere'}));}view.append(dl);
    }pager.append(el('span',{text:(offset+1)+'–'+Math.min(offset+10,r.zeilen.length)+' von '+r.zeilen.length+' '}));
     if(offset>0)pager.append(el('button',{text:'Zurück',onclick:()=>{offset-=10;draw();}}));
     if(offset+10<r.zeilen.length)pager.append(el('button',{text:'Weitere',onclick:()=>{offset+=10;draw();}}));
    }body.append(pager,view);draw();
   }catch(e){loaded=false;body.append(el('p',{role:'status',text:e.message}));}});wrap.append(d);
  }
 }catch(e){if(active)status.textContent=e.message;}
}
