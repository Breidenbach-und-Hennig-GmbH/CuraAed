'use strict';
async function cockpitMaske(){
 const lauf=S.lauf,root=el('section',{class:'cu-cockpit','aria-label':'Verwaltercockpit'});
 if(!zeigeAufDesktop(lauf,root))return;
 S.kontext={typ:'cockpit'};
 const loading=el('p',{role:'status',text:'Verwaltercockpit wird geladen …'});root.append(loading);
 if(!darfSchreiben()){loading.textContent='Das persönliche Verwaltercockpit steht Mitarbeitern und Administratoren zur Verfügung.';return;}
 try{const s=await API.get('/cockpit');if(lauf!==S.lauf)return;
  const date=new Date(s.heute+'T12:00:00Z'),greeting=el('header',{class:'cu-cockpit-gruss'},[
   el('h1',{text:'Guten Tag, '+S.benutzer.name}),el('p',{class:'cu-cockpit-datum',text:'Heute ist '+new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(date)}),el('p',{text:'Viel Spaß bei der Arbeit'})]);
  const counter=(label,n,cls)=>el('li',{},[el('span',{class:'cu-cockpit-anzahl '+cls,text:String(n)}),el('span',{text:label})]);
  const counts=el('div',{class:'cu-cockpit-zaehler'},[
   el('section',{},[el('h2',{text:'Ticketsystem'}),el('ul',{},[counter('im Zeitplan',s.tickets.zeitplan,'plan'),counter('heute fällig',s.tickets.faellig,'faellig'),counter('überfällig',s.tickets.ueberfaellig,'ueberfaellig')]),el('p',{class:'small muted',text:'Aufträge und Wiedervorlagen'})]),
   el('section',{},[el('h2',{text:'Prozesse'}),el('ul',{},[counter('in Arbeit',s.prozesse.in_arbeit,'arbeit'),counter('nicht gestartet',s.prozesse.nicht_gestartet,'offen')]),el('p',{class:'small muted',text:'Offene Akten / Vorgänge'})])]);
  const birthdays=el('section',{class:'cu-cockpit-geburtstage','aria-label':'Geburtstagsliste'},[el('h2',{text:'Geburtstagsliste · heute'}),raster([{label:'Geburtstag',render:r=>datum(r.geburtstag)},{label:'Name',render:r=>el('a',{href:'#/adressen/'+r.id,text:r.name})}],s.geburtstage,{leer:'Heute keine Geburtstage.',mindestZeilen:0})]);
  const utcDate=value=>{const d=new Date(String(value).replace(' ','T')+'Z');return Number.isFinite(d.getTime())?d:null;};
  const importDate=value=>{const d=utcDate(value);return d?new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin'}).format(d):dateOnly(value);};
  const importTime=value=>{const d=utcDate(value);return d?new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(d):time(value);};
  const time=value=>String(value||'').replace(' ','T').slice(11,16);
  const dateOnly=value=>datum(String(value||'').slice(0,10));
  const target=r=>r.quelle==='adresse'?'#/adressen/'+r.adresse_id:'#/vorgaenge/'+r.id;
  const section=(title,data,columns,action,open)=>el('section',{class:'cu-cockpit-liste','aria-label':title},[
   el('header',{},[el('h2',{},[el('button',{text:title,onclick:action})]),el('span',{class:'cu-cockpit-gesamt',text:String(data.gesamt),'aria-label':title+' gesamt: '+data.gesamt}),data.gesamt>data.eintraege.length?el('span',{class:'small muted',text:data.eintraege.length+' angezeigt'}):null]),
   raster(columns,data.eintraege,{leer:'Keine Einträge.',mindestZeilen:7,onOpen:open})]);
  const wieder=section('Wiedervorlagen',s.wiedervorlagen,[{label:'Priorität',render:r=>({normal:'Normal',hoch:'Hoch',dringend:'Dringend'})[r.prioritaet]||'Normal'},{label:'Datum',render:r=>datum(r.faellig_am)},{label:'Info',render:r=>el('a',{href:target(r),text:r.titel})}],()=>cockpitListe('Wiedervorlagen'),r=>geheZu(target(r)));
  const phones=section('Telefoneingänge',s.telefone,[{label:'SB',render:r=>r.kuerzel||'–'},{label:'Datum',render:r=>dateOnly(r.zeitpunkt)},{label:'Zeit',render:r=>time(r.zeitpunkt)},{label:'Anrufer',render:r=>r.anrufer||'–'},{label:'Bemerkung',render:r=>r.notiz||r.betreff}],()=>cockpitListe('Telefoneingänge'),r=>cockpitTelefon(r.id,lauf));
  const calendar=section('Jahreskalender',s.kalender,[{label:'Datum',render:r=>datum(r.faellig_am)},{label:'Zeit',render:r=>r.uhrzeit||'–'},{label:'Termin / Vorgang',render:r=>el('a',{href:target(r),text:r.titel})}],()=>geheZu('#/kalender'),r=>geheZu(target(r)));
  const docs=section('Dokumente',s.dokumente,[{label:'Datum',render:r=>importDate(r.erstellt_am)},{label:'Zeit',render:r=>importTime(r.erstellt_am)},{label:'Dateiname',render:r=>r.original_name},{label:'Dokument',render:r=>r.titel}],()=>geheZu('#/dms'),r=>dmsVorschau('/api/dms-posteingang/'+r.dokument_id+'/datei',{titel:r.titel,original_name:r.original_name}));
  const firma=s.firma,fd=firma?.daten;
  const side=el('aside',{class:'cu-cockpit-seite','aria-label':'Verwaltung und Schnellzugriff'},[
   firma?.logo_url?el('img',{src:firma.logo_url,alt:fd.name+' – Firmenlogo'}):el('div',{class:'cu-cockpit-marke'},[icon('building'),el('strong',{text:fd?.name||APP_NAME})]),
   fd?el('h2',{text:fd.name}):null,
   el('nav',{'aria-label':'Cockpit-Schnellzugriff'},[el('button',{text:'Tages-ZIS',onclick:()=>cockpitListe('Tages-ZIS')}),el('button',{text:'Auftragsmanagement',onclick:()=>geheZu('#/vorgaenge?art=handwerker')}),el('button',{text:'Hilfe · F1',onclick:sprungUebersicht}),el('button',{text:'Aktualisieren',onclick:()=>cockpitMaske()})]),
   el('section',{class:'cu-cockpit-abwesend'},[el('h2',{text:'Heute abwesend'}),el('p',{class:'small muted',text:'Es ist noch keine Abwesenheitsverwaltung eingerichtet.'})]),
   fd?el('address',{},[fd.anschrift?el('p',{text:fd.anschrift}):null,fd.telefon?el('p',{},[el('span',{text:'Telefon: '}),el('a',{href:telHref(fd.telefon),text:fd.telefon})]):null,fd.email?el('p',{},[el('span',{text:'E-Mail: '}),el('a',{href:'mailto:'+fd.email,text:fd.email})]):null]):null]);
  root.replaceChildren(el('div',{class:'cu-cockpit-kopf'},[greeting,counts,birthdays]),el('div',{class:'cu-cockpit-arbeitsbereich'},[el('div',{class:'cu-cockpit-listen'},[wieder,phones,calendar,docs]),side]));
 }catch(e){if(lauf===S.lauf)loading.replaceWith(el('p',{role:'alert',text:e.message}),el('button',{text:'Erneut laden',onclick:()=>cockpitMaske()}));}
}
async function cockpitTelefon(id,lauf){try{const k=await API.get('/telefoneingaenge/'+id);if(lauf!==S.lauf)return;if(darfSchreiben())await telefonEingang({},k,()=>cockpitMaske());}catch(e){fehler(e);}}
async function cockpitListe(art){
 const lauf=S.lauf;
 try{let rows,cols;
  if(art==='Telefoneingänge'){rows=await API.get('/telefoneingaenge/offen');cols=[{label:'Datum',render:r=>datum(r.zeitpunkt.slice(0,10))},{label:'Anrufer',render:r=>r.anrufer_name||r.adresse_name},{label:'Bemerkung',render:r=>r.notiz||r.betreff}];}
  else if(art==='Wiedervorlagen'){geheZu('#/kalender');return;}
  else{const s=await API.get('/cockpit');rows=s.tageszis;cols=[{label:'Info',render:r=>el('a',{href:'#/vorgaenge/'+r.id,text:r.titel})},{label:'Bemerkung',render:r=>r.text}];}
  if(lauf!==S.lauf)return;
  modal({titel:art,wide:true,inhalt:raster(cols,rows,{leer:'Keine Einträge.',onOpen:r=>art==='Telefoneingänge'?cockpitTelefon(r.id,lauf):geheZu('#/vorgaenge/'+r.id)}),footer:close=>[el('button',{text:'Schließen',onclick:close})]});
 }catch(e){fehler(e);}
}
async function cockpitFirmaDialog(){
 const lauf=S.lauf,s=await API.get('/cockpit/einstellungen');if(lauf!==S.lauf)return;
 const u=formular([[{name:'firma_id',label:'Firma für das Verwaltercockpit',type:'select',value:s.firma_id||'',options:[{value:'',label:'Keine Firma ausgewählt'},...s.firmen.map(f=>({value:f.id,label:f.name}))]}]]),logo=el('div'),err=el('p',{role:'alert'});
 const preview=()=>{const f=s.firmen.find(f=>String(f.id)===u.inputs.firma_id.value);logo.replaceChildren(...(f?.logo_url?[el('img',{src:f.logo_url,alt:'Firmenlogo '+f.name,style:'max-width:240px;max-height:100px;object-fit:contain'})]:[]));};u.inputs.firma_id.addEventListener('change',preview);preview();
 let save;modal({titel:'Einstellungen – Firma auswählen',inhalt:el('div',{},[el('p',{text:'Diese Auswahl gilt für Ihr persönliches Verwaltercockpit. Anschrift, Logo und HWA-Textvorlagen werden in den Verwaltungsstammdaten gepflegt.'}),u.form,logo,err]),footer:close=>[el('button',{text:'Abbrechen',onclick:close}),save=el('button',{text:'Speichern',class:'btn-primary',onclick:async()=>{save.disabled=true;try{await API.put('/cockpit/einstellungen',{firma_id:u.inputs.firma_id.value||null,revision:s.revision});close();toast('Firmenauswahl gespeichert','success');if(location.hash==='#/'||!location.hash)cockpitMaske();}catch(e){err.textContent=e.message;save.disabled=false;}}})]});u.form.addEventListener('submit',e=>e.preventDefault());
}
