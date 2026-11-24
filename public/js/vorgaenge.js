'use strict';
const VORGANG_ART={akte:'Akten',handwerker:'Handwerkeraufträge',wiedervorlage:'Wiedervorlagen',zis:'ZIS',notiz:'Notizen'};
const VORGANG_STATUS={offen:'Offen',in_bearbeitung:'In Bearbeitung',beauftragt:'Beauftragt',erledigt:'Erledigt',storniert:'Storniert'};
function vorgangLink(b){
 const paths={adresse:'adressen',objekt:'objekte',einheit:'einheiten'};
 if(paths[b.typ]&&b.ziel_id)return el('a',{href:'#/'+paths[b.typ]+'/'+b.ziel_id,text:[b.name,b.hp_nummer?'HP '+b.hp_nummer:''].filter(Boolean).join(' · ')});
 if(b.fach_id)return el('a',{href:'#/vorgaenge/'+b.fach_id,text:b.name});
 return el('span',{text:b.name+(b.hp_nummer?' · HP '+b.hp_nummer:'')});
}
async function vorgangForm(record={},context=null){
 if(record.art==='handwerker')return handwerkerForm(record,context);
 if(record.art==='akte')return akteForm(record,context);
 const lauf=S.lauf;let mitarbeiter;try{mitarbeiter=await API.get('/mitarbeiter');if(lauf!==S.lauf)return;}catch(e){fehler(e);return;}
 const {form,werte}=formular([
  [{name:'art',label:'Bereich',type:'select',options:opt(VORGANG_ART),value:record.art||'akte',disabled:!!record.id},
   {name:'titel',label:'Titel',required:true,value:record.titel||'',maxlength:500}],
  [{name:'text',label:'Beschreibung',type:'textarea',value:record.text||'',maxlength:65535}],
  [{name:'status',label:'Status',type:'select',options:opt(VORGANG_STATUS),value:record.status||'offen'},
   {name:'prioritaet',label:'Priorität',type:'select',options:opt({normal:'Normal',hoch:'Hoch',dringend:'Dringend'}),value:record.prioritaet||'normal'}],
  [{name:'faellig_am',label:'Fällig am',type:'date',value:record.faellig_am||''},
   {name:'uhrzeit',label:'Uhrzeit',type:'time',value:record.uhrzeit||''},
   {name:'zustaendig_id',label:'Zuständig',type:'select',options:[{value:'',label:'Nicht zugewiesen'},...mitarbeiter.map(m=>({value:String(m.id),label:m.name}))],value:String(record.zustaendig_id||'')}],
 ]);
 if(record.id)form.querySelector('#f_art').disabled=true;
 let m;const save=el('button',{type:'submit',class:'btn-primary',text:'Speichern',form:'vorgang-form'});form.id='vorgang-form';
 form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;try{
  const data={...werte(),art:record.id?record.art:werte().art,revision:record.revision,kontext:context};
  const result=record.id?await API.put('/vorgaenge/'+record.id,data):await API.post('/vorgaenge',data);m.close();toast('In CuraAed gespeichert','success');glockeAktualisieren();geheZu('#/vorgaenge/'+result.id);
 }catch(e){fehler(e);}finally{save.disabled=false;}});
 form.append(el('p',{class:'small',text:'Zuständige Mitarbeiter können diesen Vorgang ebenfalls sehen und bearbeiten.'}));
 m=modal({titel:record.id?'Vorgang bearbeiten':'Neuen Vorgang anlegen',inhalt:form,wide:true,footer:close=>[el('button',{text:'Abbrechen',onclick:close}),save]});
}
async function vorgangZuordnung(record){
 const {form,werte,inputs}=formular([[{name:'typ',label:'Zuordnen zu',type:'select',options:opt({adresse:'Adresse',objekt:'Objekt',einheit:'Einheit',...VORGANG_ART})},{name:'nummer',label:'Nummer oder CA-Vorgangsnummer',required:true}]]);
 if(typeof tippAuswahl==='function'){const control=tippAuswahl(inputs.nummer,{label:'Zuordnung',scope:()=>inputs.typ.value,format:r=>r.nummer,suchen:q=>['adresse','objekt','einheit'].includes(inputs.typ.value)?tippSuche(inputs.typ.value,q):Promise.resolve([]),auswaehlen:()=>{}});inputs.typ.addEventListener('change',()=>{inputs.nummer.value='';control.reset();});}
 const info=el('p',{class:'small',text:'Nummer, Name oder Anschrift tippen. Bei Akten und Vorgängen die genaue CA-Nummer verwenden.'});form.append(info);let m;
 const save=el('button',{type:'submit',text:'Zuordnen',form:'vorgang-zuordnung'});form.id='vorgang-zuordnung';
 form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{
  const v=werte(),r=await API.post('/vorgaenge/aufloesen',{typ:v.typ,nummern:[v.nummer]});
  const rows=Array.isArray(r)?r:r.ergebnisse||r.nummern||[];const found=rows.find(x=>x.gefunden);
  if(!found)throw new Error('Nummer nicht gefunden. Bitte die genaue CuraAed-Nummer prüfen.');
  await API.post('/vorgaenge/'+record.id+'/zuordnungen',{typ:v.typ,id:found.id,revision:record.revision});m.close();neuLaden();
 }catch(err){fehler(err);}finally{save.disabled=false;}});
 m=modal({titel:'Zuordnung ergänzen',inhalt:form,footer:close=>[el('button',{text:'Abbrechen',onclick:close}),save]});
}
async function vorgangDetail(id,params=new URLSearchParams()){
 const lauf=S.lauf,root=el('section');if(!arbeitsMaske(lauf,root,{titel:'Vorgang',aktionen:[{text:'Akten / Vorgänge',onclick:()=>geheZu('#/vorgaenge')},{text:'Kalender',onclick:()=>geheZu('#/kalender')}]}))return;
 try{
  const r=await API.get('/vorgaenge/'+encodeURIComponent(id));if(lauf!==S.lauf)return;
  if(r.art==='handwerker')return handwerkerMaske(r,params);
  if(r.art==='akte')return aktenMaske(r,params);
  S.kontext={typ:'vorgang',id:r.id,bearbeiten:()=>vorgangForm(r),erstellen:()=>vorgangForm({art:r.art}),suchen:()=>geheZu('#/vorgaenge?art='+r.art),spruenge:Object.fromEntries([['a','adresse'],['o','objekt'],['w','einheit'],['v','akte'],['h','handwerker']].map(([taste,typ])=>[taste,()=>zuordnungsSprung(typ,r.bezuege.filter(b=>b.typ===typ).map(b=>({...b,id:b.fach_id||b.ziel_id})))]))};
  root.cuTitelSetzen(r.titel);
  root.append(el('p',{},[el('a',{href:'#/vorgaenge?art='+r.art,text:'← '+VORGANG_ART[r.art]})]),
   panel([['Vorgangsnummer','CA-'+r.id],['Bereich',VORGANG_ART[r.art]],['Status',VORGANG_STATUS[r.status]],['Fällig',datum(r.faellig_am)+(r.uhrzeit?' '+r.uhrzeit:'')],['HP-Nummer',r.hp_nummer||'–'],['Datenhaltung','In CuraAed gespeichert'],['Herkunft',r.subdomain||'In CuraAed angelegt'],['HP-Status',r.remote_snapshot?.status?.name||r.remote_snapshot?.status?.description||'–']]),
   el('div',{class:'tel-plaud-knoepfe'},[el('button',{text:'Bearbeiten',onclick:()=>vorgangForm(r)}),el('button',{text:'Zuordnung ergänzen',onclick:()=>vorgangZuordnung(r)})]));
  if(r.incoming){
   const conflict=el('div',{class:'hp-hinweis'},[el('h2',{text:'Änderungskonflikt'}),el('p',{text:'Dieser Eintrag wurde in CuraAed und in HP geändert. Die lokale Fassung wurde erhalten.'})]);
   for(const [label,key] of [['Titel','titel'],['Beschreibung','text'],['Status','status'],['Priorität','prioritaet'],['Datum','faellig_am']]){
    if(r[key]!==r.incoming.werte[key])conflict.append(el('p',{text:label+' · CuraAed: '+(r[key]||'–')+' · HP: '+(r.incoming.werte[key]||'–')}));
   }
   const choose=side=>async()=>{try{await API.post('/vorgaenge/'+r.id+'/konflikt',{fassung:side,revision:r.revision});neuLaden();}catch(e){fehler(e);}};
   conflict.append(el('button',{text:'Lokale Fassung behalten',onclick:choose('lokal')}),el('button',{text:'HP-Fassung übernehmen',onclick:choose('hp')}));root.append(conflict);
  }
  if(r.art==='handwerker'&&r.remote_snapshot){const hp=r.remote_snapshot;root.append(el('h2',{text:'Auftragsinformationen'}),panel([['Auftragsart',hp.type?.name||'–'],['Vorgang',hp.process?.name||'–'],['Beauftragt am',datum(hp.to_occur)],['HP-Ansprechpartner',[hp.team?.first_name,hp.team?.last_name].filter(Boolean).join(' ')||'–'],['Informationen zum Status',hp.status_text?.text||'–'],['Schätzbetrag',hp.estimated_price??'–'],['Rechnungsbetrag',hp.bill_price??'–']]));}
  root.append(el('h2',{text:'Beschreibung'}),el('div',{style:'white-space:pre-wrap',text:r.text||'Keine Beschreibung.'}),el('h2',{text:'Zuordnungen'}));
  const refs=r.bezuege.filter(b=>b.typ!=='dokument');root.append(refs.length?el('ul',{},refs.map(b=>el('li',{},[vorgangLink(b)]))):el('p',{text:'Noch keine Zuordnungen vorhanden.'}));
  const docs=r.bezuege.filter(b=>b.typ==='dokument');if(docs.length){root.append(el('h2',{text:'Dokumente'}));for(const d of docs)root.append(el('p',{},[el('button',{text:d.name,onclick:()=>dmsVorschau('/api/vorgaenge/'+r.id+'/dokumente/'+d.remote_id,{titel:d.name})})]));}
  if(r.archiv_dokumente?.length){root.append(el('h2',{text:'Archivierte Dokumente'}));for(const d of r.archiv_dokumente)root.append(el('p',{},[el('button',{text:d.titel,onclick:()=>dmsVorschau('/api/archiv/'+d.id+'/download',{titel:d.titel,original_name:d.original_name})})]));}
  root.append(el('h2',{text:'Verlauf und Vermerke'}));
  const note=el('textarea',{'aria-label':'Neuer Vermerk',maxlength:'10000',rows:'3',style:'width:100%'}),saveNote=el('button',{text:'Vermerk speichern',onclick:async()=>{saveNote.disabled=true;try{await API.post('/vorgaenge/'+r.id+'/vermerke',{text:note.value});neuLaden();}catch(e){fehler(e);}finally{saveNote.disabled=false;}}});root.append(note,saveNote);
  for(const h of r.verlauf){const after=JSON.parse(h.nachher);root.append(el('div',{class:'hp-hinweis'},[el('strong',{text:(h.aktion==='vermerk'?'Vermerk':h.aktion.replaceAll('_',' '))+' · '+h.erstellt_am+' · '+(h.benutzer||'') }),el('p',{text:after.text||after.titel||''})]));}
  if(r.remote_snapshot)root.append(el('details',{},[el('summary',{text:'Übernommene HP-Originaldaten'}),el('pre',{style:'white-space:pre-wrap;overflow-wrap:anywhere',text:JSON.stringify(r.remote_snapshot,null,2)})]));
 }catch(e){if(lauf===S.lauf)root.replaceChildren(el('p',{role:'alert',text:e.message}));}
}
function vorgaengeListe(root,{art='',kontext=null,lauf=S.lauf}={}){
 const search=el('input',{type:'search','aria-label':'Vorgänge durchsuchen',placeholder:'Titel, Beschreibung oder HP-Nummer',maxlength:'200'}),
  statusSelect=el('select',{'aria-label':'Vorgangsstatus'},[el('option',{value:'aktiv',text:'Aktive Vorgänge'}),el('option',{value:'',text:'Alle Status'}),...Object.entries(VORGANG_STATUS).map(([value,text])=>el('option',{value,text}))]),
  result=el('div'),message=el('p',{role:'status'}),nav=el('div',{class:'tel-plaud-knoepfe'});let page=1,version=0;
 const prev=el('button',{text:'Vorherige Seite',disabled:true,onclick:()=>load(page-1)}),next=el('button',{text:'Nächste Seite',disabled:true,onclick:()=>load(page+1)});nav.append(prev,next);
 root.append(el('div',{class:'hp-filter'},[search,statusSelect,el('button',{text:'Neu anlegen',onclick:()=>vorgangForm({art:art||'akte'},kontext)})]),message,result,nav);
 async function load(p=1){const current=++version;message.textContent='Vorgänge werden geladen …';try{
  const r=await API.get('/vorgaenge'+API.qs({art,status:statusSelect.value,suche:search.value,seite:p,typ:kontext?.typ||'',ziel:kontext?.id||''}));
  if(lauf!==S.lauf||current!==version)return;
  result.replaceChildren(raster([{label:'Titel',render:v=>el('a',{href:'#/vorgaenge/'+v.id,text:v.titel})},{label:'Bereich',render:v=>VORGANG_ART[v.art]},{label:'Status',render:v=>VORGANG_STATUS[v.status]+(v.quelle_status==='konflikt'?' · Konflikt':'')},{label:'Fällig',render:v=>datum(v.faellig_am)},{label:'Zuständig',render:v=>v.zustaendig||'–'},{label:'HP-Nummer',render:v=>v.hp_nummer||'–'}],r.eintraege,{leer:'Keine Akten oder Vorgänge gefunden.',onOpen:v=>geheZu('#/vorgaenge/'+v.id)}));
  page=r.seite;prev.disabled=page<=1;next.disabled=!r.weitere;message.textContent=r.gesamt+' Vorgänge · Seite '+page;
 }catch(e){if(lauf===S.lauf&&current===version)message.textContent=e.message;}}
 search.addEventListener('input',debounce(()=>load(1)));statusSelect.addEventListener('change',()=>load(1));load(1);return()=>load(page);
}
async function vorgaengeMaske(params=new URLSearchParams()){
 const selectedArt=Object.hasOwn(VORGANG_ART,params.get('art'))?params.get('art'):'';if((!selectedArt||selectedArt==='akte')&&params.get('liste')!=='1')return aktenStart(params);
 const lauf=S.lauf,root=el('section');if(!arbeitsMaske(lauf,root,{titel:'Akten / Vorgänge',aktionen:Object.entries(VORGANG_ART).map(([art,text])=>({text,onclick:()=>geheZu('#/vorgaenge?art='+art)}))}))return;
 if(!darfSchreiben()){root.append(el('p',{text:'Akten und Vorgänge sind für Mitarbeiter und Administratoren verfügbar.'}));return;}
 const art=Object.hasOwn(VORGANG_ART,params.get('art'))?params.get('art'):'';
 S.kontext={typ:'vorgangsliste',erstellen:()=>vorgangForm({art:art||'akte'},context),suchen:()=>root.querySelector('input[type="search"]')?.focus(),bearbeiten:()=>{const row=document.activeElement?.closest('tr')?.hpDaten;if(row)API.get('/vorgaenge/'+row.id).then(vorgangForm).catch(fehler);else toast('Bitte zuerst eine Zeile mit Tab auswählen.');}};
 root.cuTitelSetzen(art?VORGANG_ART[art]:'Akten / Vorgänge');
 root.append(el('p',{text:'Akten, Aufträge, Wiedervorlagen, ZIS und Notizen werden in CuraAed geführt.'}),
  el('nav',{class:'tel-plaud-knoepfe'},[el('a',{href:'#/vorgaenge',text:'Alle Bereiche'}),...Object.entries(VORGANG_ART).map(([key,text])=>el('a',{href:'#/vorgaenge?art='+key,text}))]));
 const imports=el('details',{},[el('summary',{text:'Vorhandene HP-Daten übernehmen'})]),body=el('div'),list=el('div');imports.append(body);root.append(imports,list);const context=['adresse','objekt','einheit'].includes(params.get('typ'))&&Number(params.get('ziel'))>0?{typ:params.get('typ'),id:Number(params.get('ziel'))}:null;const refreshList=vorgaengeListe(list,{art,kontext:context,lauf});
 async function refresh(){try{
  const [info,connections]=await Promise.all([API.get('/vorgaenge/uebersicht'),API.get('/hausperfekt/dms/verbindungen')]);if(lauf!==S.lauf)return;
  refreshList();
  body.replaceChildren(el('p',{text:info.bereiche.map(b=>VORGANG_ART[b.art]+': '+b.gesamt+(b.konflikte?' ('+b.konflikte+' Konflikte)':'')).join(' · ')||'Noch keine HP-Fachbereiche übernommen.'}));
  if(info.uebernahme)body.append(el('p',{text:info.uebernahme.akten+' HP-Akten · '+info.uebernahme.handwerker+' HP-Handwerkeraufträge · '+info.uebernahme.gesichert+' zugeordnete Dateien gespeichert · '+info.uebernahme.ausstehend+' Dateiübernahmen ausstehend'}));
  for(const job of info.auftraege){body.append(el('p',{role:'status',text:(VORGANG_ART[{records:'akte',craftsman_tasks:'handwerker',tasks:'wiedervorlage',cis:'zis',notes:'notiz'}[job.resource]]||job.resource)+' · Seite '+job.seite+' · '+(job.status==='laeuft'?'Übernahme läuft':job.status==='fertig'?'Durchlauf abgeschlossen':'Übernahme angehalten')+' · '+job.fehler+' Fehler'+(job.meldung?' · '+job.meldung:'')}));
   if(job.status==='laeuft')body.append(el('button',{text:'Übernahme anhalten',onclick:async()=>{try{await API.post('/vorgaenge/anhalten',{quelle:job.quelle_id});refresh();}catch(e){fehler(e);}}}));
  }
  if(info.fehler?.length)body.append(raster([{label:'Bereich',render:e=>e.resource},{label:'HP-Eintrag',render:e=>e.remote_id},{label:'Übernahmefehler',render:e=>e.meldung}],info.fehler));
  const select=el('select',{'aria-label':'HP-Datenquelle für Vorgänge'},[el('option',{value:'',text:'HP-Datenquelle auswählen'}),...connections.verbindungen.map(c=>el('option',{value:c.id,text:c.subdomain}))]);if(connections.verbindungen.length===1)select.value=connections.verbindungen[0].id;
  body.append(select,el('button',{text:'Fachbereiche übernehmen / fortsetzen',disabled:info.auftraege.some(j=>j.status==='laeuft'),onclick:async()=>{if(!select.value)return;try{await API.post('/vorgaenge/uebernahme',{verbindung:select.value});refresh();}catch(e){fehler(e);}}}),el('p',{class:'small',text:'Gespeicherte Einträge bleiben nach dem Trennen der HP-Verbindung verfügbar. Lokale Änderungen werden bei einem erneuten Abgleich berücksichtigt; Konflikte bleiben zur Prüfung offen.'}));
  if(info.auftraege.some(j=>j.status==='laeuft'))setTimeout(()=>{if(lauf===S.lauf)refresh();},4000);
 }catch(e){if(lauf===S.lauf)body.textContent=e.message;}}
 refresh();
}

async function vorgangKalender(params=new URLSearchParams()){return m365KalenderMaske(params);}
