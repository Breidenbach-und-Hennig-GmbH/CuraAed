'use strict';

async function dmsPosteingangMaske(sb,lauf){
 const root=el('div',{class:'cu-dms'}),list=el('div',{class:'cu-dms-liste'}),details=el('div'),links=el('div'),assignment=el('div'),files=el('div'),status=el('p',{role:'status',class:'small muted'}),
  search=el('input',{type:'search','aria-label':'DMS durchsuchen',placeholder:'Titel, Dateiname oder Bemerkung',maxlength:'200'}),
  sort=el('select',{'aria-label':'Sortierung'},Object.entries({standard:'Standard – neueste zuerst',datum_alt:'Älteste zuerst',titel:'Dokumenttitel',sachbearbeiter:'Sachbearbeiter'}).map(([value,text])=>el('option',{value,text}))),
  closed=el('input',{type:'checkbox',id:'dms-alle'}),note=el('textarea',{'aria-label':'Bemerkung',maxlength:'4000',rows:'9'}),
  publicFlag=el('input',{type:'checkbox',id:'dms-oeffentlich',title:'Kennzeichnung in der Ablage; keine externe Veröffentlichung'}),expiry=el('input',{type:'date',id:'dms-verfall'}),selectedLabel=el('p',{class:'small muted',text:'Kein Dokument ausgewählt.'});
 let rows=[],active=null,page=1,listVersion=0,detailVersion=0,dirty=false,checked=new Set();const buttons=[];
 const time=value=>{if(!value)return '–';const d=new Date(value.includes('T')?value:value.replace(' ','T')+'Z');return Number.isNaN(d.valueOf())?'–':d.toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',second:'2-digit'});};
 const date=value=>{if(!value)return '–';const d=new Date(value.includes('T')?value:value.replace(' ','T')+'Z');return Number.isNaN(d.valueOf())?'–':d.toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'});};
 const action=(text,onclick,title)=>{const b=el('button',{type:'button',text,onclick,title:title||text});buttons.push(b);return b;};
 function targets(){return rows.filter(r=>checked.size?checked.has(r.dokument_id):r.dokument_id===active?.eingang.dokument_id);}
 async function change(state,code){const todo=targets();if(!todo.length)return;try{for(const d of todo)await API.put('/dms-posteingang/'+d.dokument_id,{revision:d.revision,sachbearbeiter:code===undefined?d.sachbearbeiter:code,status:state||d.status});checked.clear();await load(page);}catch(e){fehler(e);await load(page);}}
 async function forward(){if(!targets().length)return;const code=await dmsSachbearbeiterDialog(active?.eingang.sachbearbeiter||sb);if(code!==null&&lauf===S.lauf)await change(null,code);}
 async function edit(){if(active)archivBearbeiten(active.dokument.id,()=>load(page));}
 async function open(){if(active)dmsVorschau('/api/dms-posteingang/'+active.dokument.id+'/datei',active.dokument);}
 async function protocol(){if(!active)return;const d=await API.get('/dms-posteingang/'+active.dokument.id);if(lauf!==S.lauf)return;modal({titel:'DMS-Protokoll',inhalt:raster([{label:'Datum',render:h=>date(h.erstellt_am)},{label:'Uhrzeit',render:h=>time(h.erstellt_am)},{label:'Bearbeitung',render:h=>({eingang:'Eingang',weitergeleitet:'Weitergeleitet',abgeschlossen:'Abgeschlossen',geoeffnet:'Wieder geöffnet',dokumentangaben_geaendert:'Dokumentangaben geändert'})[h.aktion]||h.aktion},{label:'Benutzer',render:h=>h.benutzer||'–'},{label:'Sachbearbeiter',render:h=>h.sachbearbeiter||'Nicht zugewiesen'}],d.verlauf,{leer:'Noch keine Bearbeitungsschritte.'}),wide:true,footer:close=>[el('button',{text:'Schließen',onclick:close})]});}
 const forwardButton=action('Datei verschieben',forward,'An einen anderen Sachbearbeiter weiterleiten'),wvButton=action('Wvl an SB',()=>{if(active)vorgangForm({art:'wiedervorlage',titel:active.dokument.titel,text:'Zum DMS-Dokument '+active.dokument.original_name+' · Archivnummer '+active.dokument.id});}),
  merge=el('button',{type:'button',text:'Dateien zusammenführen',disabled:true,title:'Zusammenführen ist noch nicht verfügbar.'}),
  postage=action('Portooptimierung',async()=>{const ref=active?.dokument.verknuepfungen.find(r=>r.typ==='adresse');if(!ref)return;try{const [a,v]=await Promise.all([API.get('/adressen/'+ref.ziel_id),API.get('/adressen/'+ref.ziel_id+'/versand')]);if(lauf===S.lauf)versandDialog(a,v);}catch(e){fehler(e);}}),
  protocolButton=action('Protokoll',()=>protocol().catch(fehler)),finish=action('Abschließen',()=>change('abgeschlossen')),openButton=action('Dokument öffnen',open),editButton=action('Zuordnungen bearbeiten',edit),
  reopen=action('Wieder öffnen',()=>change('offen'));
 const upload=()=>archivUpload(null,async d=>{try{await API.post('/dms-posteingang',{dokument_id:d.id,sachbearbeiter:sb});await load(1);}catch(e){fehler(new Error('Datei im Archiv gespeichert; Zuordnung fehlgeschlagen: '+e.message));}});
 const side=el('aside',{class:'cu-karte cu-dms-aktionen','aria-label':'DMS-Aktionen'},[
  el('h2',{class:'cu-karten-titel',text:'Aktionen'}),action('Rechnung erfassen · Strg + R',()=>{if(active)rechnungMaske(active.dokument).catch(fehler);}),forwardButton,wvButton,el('button',{type:'button',text:'Suche',onclick:()=>search.focus()}),merge,postage,protocolButton,
  el('label',{text:'Sortierung'}),sort,finish,reopen,el('hr'),el('button',{type:'button',text:'Dokument hochladen',onclick:upload}),el('button',{type:'button',text:'Sachbearbeiter wechseln',onclick:()=>geheZu('#/dms')}),
  el('a',{href:'#/archiv',text:'Archiv öffnen'}),el('a',{href:'#/dms-uebernahme',text:'HP-Archiv übernehmen'})]);
 const save=el('button',{type:'button',class:'btn-primary',text:'Angaben speichern',disabled:true,onclick:async()=>{if(!active)return;save.disabled=true;try{
  await API.put('/dms-posteingang/'+active.dokument.id+'/metadaten',{revision:active.eingang.revision,basis_bemerkung:active.dokument.beschreibung||'',bemerkung:note.value,oeffentlich:publicFlag.checked,verfall_am:expiry.value});dirty=false;await load(page);toast('Dokumentangaben gespeichert','success');
 }catch(e){fehler(e);save.disabled=false;}}});
 for(const field of [note,publicFlag,expiry])field.addEventListener('input',()=>{dirty=true;save.disabled=!active;});
 const noteCard=el('aside',{class:'cu-karte cu-dms-bemerkung'},[el('h2',{class:'cu-karten-titel',text:'Bemerkung'}),note,save]);
 const prev=el('button',{text:'Vorherige Seite',disabled:true,onclick:()=>load(page-1)}),next=el('button',{text:'Nächste Seite',disabled:true,onclick:()=>load(page+1)});
 root.append(el('div',{class:'cu-dms-oben'},[el('section',{class:'cu-karte'},[el('div',{class:'hp-filter'},[search,el('label',{for:'dms-alle'},[closed,document.createTextNode(' abgeschlossene anzeigen')])]),status,list,el('div',{class:'tel-plaud-knoepfe'},[prev,next])]),side]),
  el('div',{class:'cu-dms-unten'},[el('div',{class:'cu-dms-unterlagen'},[
   el('section',{class:'cu-karte cu-dms-datei'},[el('div',{},[el('h2',{class:'cu-karten-titel',text:'Dokumentdateien'}),files,openButton]),el('div',{},[el('h2',{class:'cu-karten-titel',text:'Dokumentangaben'}),selectedLabel,details,el('label',{for:'dms-oeffentlich',class:'check-inline'},[publicFlag,document.createTextNode(' Öffentliches Dokument (Kennzeichnung)')]),el('label',{for:'dms-verfall',text:'Verfalldatum'}),expiry])]),
   el('section',{class:'cu-karte'},[el('h2',{class:'cu-karten-titel',text:'Mehrfachzuweisung'}),assignment,editButton]),
   el('section',{class:'cu-karte'},[el('h2',{class:'cu-karten-titel',text:'Verknüpfungen'}),links])]),noteCard]),
  el('p',{class:'small muted',text:'Die bestehenden HP-Posteingänge sind noch nicht übernommen. Hier werden die in CuraAed erfassten Posteingänge angezeigt.'}));
 S.kontext={typ:'dms',sachbearbeiter:sb,erstellen:upload,bearbeiten:edit};
 const frame=maskenFenster({titel:'DMS-Posteingang',kopf:{ueberschrift:'DMS – Posteingang',badge:sb||'Alle Sachbearbeiter',unterzeile:'Dokument auswählen, bearbeiten und zuordnen',drucken:false,brot:[{text:'Dokumente'},{text:'DMS-Posteingang'}]},inhalt:root});
 if(!zeigeAufDesktop(lauf,frame))return;
 function refreshButtons(){for(const b of buttons)b.disabled=!active;finish.disabled=!targets().some(r=>r.status==='offen');reopen.disabled=!targets().some(r=>r.status==='abgeschlossen');postage.disabled=!active?.dokument.verknuepfungen.some(r=>r.typ==='adresse');for(const field of [note,publicFlag,expiry])field.disabled=!active;}
 function highlight(){list.querySelectorAll('tbody tr.klick').forEach(tr=>{const yes=tr.hpDaten?.dokument_id===active?.dokument.id;tr.classList.toggle('cu-dms-aktiv',yes);tr.setAttribute('aria-selected',String(yes));});}
 function empty(){active=null;S.kontext.rechnungsDokument=null;details.replaceChildren(panel([['Dateiart','–'],['Dateiname','–'],['Datei – Datum / SB','–'],['Archivnummer','–']]));files.replaceChildren(el('p',{class:'small muted',text:'Kein Dokument ausgewählt.'}));assignment.replaceChildren(el('p',{class:'small muted',text:'Keine Zuordnungen ausgewählt.'}));links.replaceChildren(panel([['Adresse','–'],['Objekt','–'],['Wohnung','–'],['Akte','–'],['HWA','–'],['PKto','–']]));note.value='';publicFlag.checked=false;expiry.value='';save.disabled=true;selectedLabel.textContent='Kein Dokument ausgewählt.';refreshButtons();}
 async function choose(row){
  if(dirty&&row.dokument_id===active?.dokument.id)return;
  if(dirty&&row.dokument_id!==active?.dokument.id&&!await bestaetigen('Ungespeicherte Dokumentangaben verwerfen?'))return;
  const nr=++detailVersion;try{const d=await API.get('/dms-posteingang/'+row.dokument_id);if(lauf!==S.lauf||nr!==detailVersion)return;active=d;S.kontext.rechnungsDokument=d.dokument;dirty=false;
   const doc=d.dokument;selectedLabel.textContent='Archivnummer: '+doc.id+' · Sachbearbeiter: '+(d.eingang.sachbearbeiter||'Nicht zugewiesen');
   frame.querySelector('.cu-unterzeile').textContent=[doc.original_name,'Archiv '+doc.id,'SB '+(d.eingang.sachbearbeiter||'–')].join(' · ');
   files.replaceChildren(el('button',{type:'button',class:'cu-dms-dateiname',text:doc.titel||doc.original_name,onclick:open}));
   details.replaceChildren(panel([['Dateiart',doc.quelle==='upload'?'Externes Dokument':L.quelle[doc.quelle]||'–'],['Kategorie',L.kategorie[doc.kategorie]||doc.kategorie],['Dateiname',doc.original_name],['Datei – Datum / SB',(doc.dokument_datum?datum(doc.dokument_datum):date(doc.erstellt_am))+' · '+time(doc.erstellt_am)+' · '+(d.autor?.kuerzel||d.autor?.name||'–')],['Archivnummer',doc.id],['Größe',dateiGroesse(doc.groesse)]]));
   const types={akte:'Akte',objekt:'Objekt',einheit:'Wohnung',adresse:'Adresse',handwerker:'HWA'};
   assignment.replaceChildren(el('div',{class:'cu-dms-typen'},Object.entries(types).map(([typ,text])=>el('label',{class:'check-inline'},[el('input',{type:'checkbox',disabled:true,checked:doc.verknuepfungen.some(r=>r.typ===typ),title:'Zuordnungen über die Schaltfläche bearbeiten'}),document.createTextNode(' '+text)]))),
    raster([{label:'Archivdatum',render:()=>date(doc.erstellt_am)},{label:'Uhrzeit',render:()=>time(doc.erstellt_am)},{label:'Art',render:r=>types[r.typ]||r.typ},{label:'Nummer',render:r=>r.nummer},{label:'Zuordnung',render:r=>r.label},{label:'Verfalldatum',render:()=>datum(d.verfall_am)}],doc.verknuepfungen,{leer:'Noch keine Zuordnungen hinterlegt.'}));
   const relation=typ=>{const found=doc.verknuepfungen.filter(r=>r.typ===typ);return found.length?el('div',{},found.map(r=>el('div',{},[el('a',{href:'#/'+({adresse:'adressen',objekt:'objekte',einheit:'einheiten'})[typ]+'/'+r.ziel_id,text:r.nummer+' · '+r.label})]))):'–';};
   links.replaceChildren(panel([['Adresse',relation('adresse')],['Objekt',relation('objekt')],['Wohnung',relation('einheit')],['Akte','–'],['HWA','–'],['PKto','–'],['Sachbearbeiter',d.eingang.sachbearbeiter||'Nicht zugewiesen']]));
   note.value=doc.beschreibung||'';publicFlag.checked=d.oeffentlich;expiry.value=d.verfall_am||'';save.disabled=true;refreshButtons();highlight();
  }catch(e){if(lauf===S.lauf&&nr===detailVersion)fehler(e);}
 }
 async function load(p=1){if(dirty){if(!await bestaetigen('Ungespeicherte Dokumentangaben verwerfen?'))return;dirty=false;}const nr=++listVersion;status.textContent='Posteingang wird geladen …';try{
  const r=await API.get('/dms-posteingang'+API.qs({sb,seite:p,alle:closed.checked?'1':'',suche:search.value,sortierung:sort.value}));if(lauf!==S.lauf||nr!==listVersion)return;
  rows=r.eintraege;checked.clear();page=r.seite;prev.disabled=page<=1;next.disabled=!r.weitere;status.textContent=r.gesamt+' Posteingänge · Seite '+page;
  list.replaceChildren(raster([{label:'',render:d=>el('input',{type:'checkbox','aria-label':'Dokument '+d.titel+' auswählen',onclick:e=>e.stopPropagation(),onchange:e=>{e.target.checked?checked.add(d.dokument_id):checked.delete(d.dokument_id);refreshButtons();}})},
   {label:'Importdatum',render:d=>date(d.erstellt_am)},{label:'Uhrzeit',render:d=>time(d.erstellt_am)},{label:'Zugriff',render:d=>d.zugriffe},{label:'Dokument / Archivnummer',render:d=>el('div',{},[el('strong',{text:d.titel}),el('div',{class:'small muted',text:'Archiv '+d.dokument_id+' · SB '+(d.sachbearbeiter||'–')})])}],rows,{onOpen:choose,leer:'Keine Posteingänge für diese Auswahl.',mindestZeilen:rows.length?8:0}));
  if(rows.length)await choose(rows.find(d=>d.dokument_id===active?.dokument.id)||rows[0]);else{detailVersion++;empty();}
 }catch(e){if(lauf===S.lauf&&nr===listVersion)status.textContent=e.message;}}
 search.addEventListener('input',debounce(()=>load(1)));sort.addEventListener('change',()=>load(1));closed.addEventListener('change',()=>load(1));empty();await load(1);
}
