'use strict';
const HWA_ART={normal:'Normalauftrag',eilauftrag:'Eilauftrag',notdienst:'Notdienst',angebot:'Angebotsanfrage'};
const HWA_STATUS={offen:'001 · Offen',in_bearbeitung:'002 · In Bearbeitung',beauftragt:'004 · Auftrag erteilt',erledigt:'Erledigt',storniert:'Storniert'};
const hwaName=a=>a?.anzeigename||a?.firmenname||[a?.vorname,a?.nachname].filter(Boolean).join(' ')||a?.bezeichnung||'';
const hwaNr=r=>r.hp_nummer||'CA-'+r.id;

function hwaAuswahl(typ,chosen,{objektId}={}){
 const label={adresse:'Adresse',objekt:'Objekt',einheit:'Wohnung',akte:'Akte'}[typ];
 const input=el('input',{type:'search','aria-label':label+' suchen',placeholder:'Nummer, Name oder Anschrift …'}),body=el('div'),hint=el('p',{role:'status'});let seq=0,m;
 async function load(){const n=++seq;try{
  const url=typ==='akte'?'/vorgaenge'+API.qs({art:'akte',suche:input.value}):'/'+({adresse:'adressen',objekt:'objekte',einheit:'einheiten'}[typ])+API.qs({suche:input.value});
  const data=await API.get(url);if(n!==seq||!m||!body.isConnected)return;
  const all=Array.isArray(data)?data:data.eintraege||[],rows=(typ==='einheit'&&objektId?all.filter(r=>r.objekt_id===objektId):all).slice(0,100);
  body.replaceChildren(raster([{label:'Nr.',render:r=>r.nummer||'CA-'+r.id},{label:'Bezeichnung',render:r=>el('button',{type:'button',class:'cu-hwa-auswahl',text:hwaName(r)||r.titel,onclick:()=>{m.close();chosen(r);}})},{label:'Anschrift / Objekt',render:r=>[r.strasse||r.objekt_bezeichnung,[r.plz,r.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')}],rows,{leer:'Keine passenden Einträge gefunden.',onOpen:r=>{m.close();chosen(r);}}));hint.textContent=rows.length+' Treffer'+(all.length>=100?' · Suche bei Bedarf eingrenzen':'');
 }catch(e){if(n===seq)hint.textContent=e.message;}}
 input.addEventListener('input',debounce(load));m=modal({titel:label+' auswählen',wide:true,inhalt:el('div',{class:'cu-hwa-auswahldialog'},[input,hint,body]),footer:close=>[el('button',{text:'Abbrechen',onclick:close})]});load();input.focus();
}

async function handwerkerForm(r={},kontext=null){
 const lauf=S.lauf;let users;try{users=await API.get('/mitarbeiter');if(lauf!==S.lauf)return;}catch(e){fehler(e);return;}
 const a=r.auftrag||{},today=new Date().toLocaleDateString('sv-SE'),selected={handwerker:a.handwerker||null,objekt:a.objekt||null,einheit:a.einheit||null,akte:a.akte_id?{id:a.akte_id,titel:'CA-'+a.akte_id}:null},recipients=(a.adressaten_details||[]).map(p=>({...p}));
 if(!r.id&&kontext&&['objekt','einheit','adresse'].includes(kontext.typ)){
  try{const row=await API.get('/'+({objekt:'objekte',einheit:'einheiten',adresse:'adressen'}[kontext.typ])+'/'+kontext.id);if(lauf!==S.lauf)return;selected[{objekt:'objekt',einheit:'einheit',adresse:'handwerker'}[kontext.typ]]=row;if(kontext.typ==='einheit')selected.objekt=await API.get('/objekte/'+row.objekt_id);}catch(e){fehler(e);return;}
 }
 const {form,werte,inputs}=formular([
  {grid:2,felder:[{name:'titel',label:'Betreff',required:true,value:r.titel||''},{name:'auftragsart',label:'Auftragsart',type:'select',options:opt(HWA_ART),value:a.auftragsart||'normal'}]},
  {grid:3,felder:[{name:'status',label:'Status',type:'select',options:opt(HWA_STATUS),value:r.status||'offen'},{name:'zustaendig_id',label:'Sachbearbeiter',type:'select',options:[{value:'',label:'Nicht zugewiesen'},...users.map(u=>({value:String(u.id),label:[u.kuerzel,u.name].filter(Boolean).join(' · ')}))],value:String(r.zustaendig_id||S.benutzer.id||'')},{name:'firma',label:'Firma / Verwaltungskennung',value:a.firma||''}]},
  {grid:3,felder:[{name:'datum',label:'Auftragsdatum',type:'date',value:a.datum||today},{name:'faellig_am',label:'Frist',type:'date',value:r.faellig_am||''},{name:'erledigt_am',label:'Erledigt am',type:'date',value:a.erledigt_am||''}]},
  {grid:2,felder:[{name:'betrag',label:'Auftragsbetrag (EUR)',value:a.betrag||'',placeholder:'z. B. 250,00'},{name:'prioritaet',label:'Priorität',type:'select',options:opt({normal:'Normal',hoch:'Hoch',dringend:'Dringend'}),value:r.prioritaet||'normal'}]},
  {felder:[{name:'text',label:'Auftragstext / Leistungsbeschreibung',type:'textarea',value:r.text||''}]},
  {grid:2,felder:[{name:'gewaehrleistung_bis',label:'Gewährleistung bis',type:'date',value:a.gewaehrleistung_bis||''},{name:'garantie_notiz',label:'Gewährleistung / Hinweise',value:a.garantie_notiz||''}]},
 ]);
 const refs=el('fieldset',{class:'cu-hwa-referenzen'},[el('legend',{text:'Auftrag zuordnen'})]),refGrid=el('div',{class:'grid-2'}),refLabels={};
 for(const [key,typ,label] of [['handwerker','adresse','Handwerker / Auftragnehmer'],['objekt','objekt','Objekt'],['einheit','einheit','Wohnung'],['akte','akte','Akte']]){
  const value=el('span',{class:'cu-hwa-auswahlwert'});refLabels[key]=value;
  refGrid.append(el('div',{class:'cu-hwa-referenz'},[el('strong',{text:label}),value,el('div',{},[el('button',{type:'button',text:label+' auswählen',onclick:()=>hwaAuswahl(typ,async row=>{selected[key]=row;if(key==='objekt'&&selected.einheit?.objekt_id!==row.id)selected.einheit=null;if(key==='einheit'){try{selected.objekt=await API.get('/objekte/'+row.objekt_id);}catch(e){selected.einheit=null;fehler(e);}}showRefs();},{objektId:key==='einheit'?selected.objekt?.id:undefined})}),el('button',{type:'button',text:'Entfernen',onclick:()=>{selected[key]=null;if(key==='objekt')selected.einheit=null;showRefs();}})])]));
 }
 function showRefs(){for(const [k,value] of Object.entries(refLabels)){const row=selected[k];value.textContent=row?[row.nummer||'CA-'+row.id,hwaName(row)||row.titel].filter(Boolean).join(' · '):'Nicht ausgewählt';}}showRefs();refs.append(refGrid);form.prepend(refs);
 const people=el('div'),peopleSection=el('fieldset',{class:'cu-hwa-referenzen'},[el('legend',{text:'Weitere Adressaten / Ansprechpartner vor Ort'}),people,el('button',{type:'button',text:'Adressat hinzufügen',onclick:()=>hwaAuswahl('adresse',p=>{if(recipients.some(x=>x.id===p.id))return;recipients.push({...p,bezeichnung:'Ansprechpartner vor Ort'});showPeople();})})]);
 function showPeople(){people.replaceChildren(...recipients.map(p=>{const desc=el('input',{'aria-label':'Funktion von '+hwaName(p),maxlength:100,value:p.bezeichnung||'',oninput:e=>p.bezeichnung=e.target.value});return el('div',{class:'cu-hwa-adressat'},[el('span',{text:hwaName(p)}),desc,el('button',{type:'button',text:'Adressat entfernen',onclick:()=>{recipients.splice(recipients.indexOf(p),1);showPeople();}})]);}));}showPeople();form.append(peopleSection);
 if(r.id&&r.benutzer_id!==S.benutzer.id)inputs.zustaendig_id.disabled=true;
 form.classList.add('cu-hwa-form');form.id='hwa-form';inputs.titel.maxLength=500;inputs.text.maxLength=65535;inputs.firma.maxLength=30;inputs.garantie_notiz.maxLength=2000;inputs.betrag.inputMode='decimal';
 const error=el('p',{role:'alert'});form.append(error);let m;const save=el('button',{type:'submit',form:form.id,class:'btn-primary',text:'Speichern'});
 form.addEventListener('submit',async e=>{e.preventDefault();if(save.disabled)return;save.disabled=true;error.textContent='';try{
  const v=werte(),auftrag={handwerker_id:selected.handwerker?.id||null,objekt_id:selected.objekt?.id||null,einheit_id:selected.einheit?.id||null,akte_id:selected.akte?.id||null,firma:v.firma,auftragsart:v.auftragsart,datum:v.datum,erledigt_am:v.erledigt_am,betrag:v.betrag,gewaehrleistung_bis:v.gewaehrleistung_bis,garantie_notiz:v.garantie_notiz,adressaten:recipients.map(p=>({adresse_id:p.id,bezeichnung:p.bezeichnung||''}))};
  const body={art:'handwerker',titel:v.titel,text:v.text,status:v.status,prioritaet:v.prioritaet,faellig_am:v.faellig_am||null,uhrzeit:r.uhrzeit||null,zustaendig_id:v.zustaendig_id,revision:r.revision,auftrag};
  const result=r.id?await API.put('/vorgaenge/'+r.id,body):await API.post('/vorgaenge',body);m.close();toast('Handwerkerauftrag gespeichert','success');geheZu('#/vorgaenge/'+result.id);glockeAktualisieren();
 }catch(e){error.textContent=e.message;}finally{save.disabled=false;}});
 m=modal({titel:r.id?'Handwerkerauftrag bearbeiten':'Handwerkerauftrag anlegen',wide:true,inhalt:form,footer:close=>[el('button',{text:'Abbrechen',onclick:close}),save]});
}

function hwaMail(r){
 const a=r.auftrag,supplier=a.handwerker,mail=a.kommunikation.emails.find(e=>e.ist_email)?.adresse||supplier?.email;
 const text=['Sehr geehrte Damen und Herren,','','hiermit bitten wir um Ausführung des folgenden Auftrags:','','Auftrag: '+hwaNr(r),'Betreff: '+r.titel,'Auftragsart: '+HWA_ART[a.auftragsart],a.objekt?'Objekt: '+[a.objekt.nummer,a.objekt.bezeichnung,a.objekt.strasse,a.objekt.plz,a.objekt.ort].filter(Boolean).join(' '):'',a.einheit?'Wohnung: '+a.einheit.nummer+' '+a.einheit.bezeichnung:'','Frist: '+datum(r.faellig_am),a.betrag?'Auftragsbetrag: '+a.betrag+' EUR':'','',r.text,'',...a.adressaten_details.map(p=>'Ansprechpartner: '+hwaName(p)+(p.telefon?' · '+p.telefon:'')+(p.mobil?' · '+p.mobil:'')),'','Bitte bestätigen Sie uns den Auftrag und stimmen Sie den Termin mit dem Ansprechpartner ab.'].filter(x=>x!==null).join('\r\n');
 const body=el('textarea',{'aria-label':'E-Mail-Entwurf',rows:16,text,style:'width:100%'}),to=el('input',{'aria-label':'Empfänger E-Mail',type:'email',value:mail||'',style:'width:100%'});
 modal({titel:'HWA senden – E-Mail vorbereiten',wide:true,inhalt:el('div',{},[el('label',{text:'Empfänger'}),to,el('p',{text:'Der Entwurf wird im E-Mail-Programm geöffnet. Vor dem Versand prüfen; Anlagen dort ergänzen.'}),body]),footer:close=>[el('button',{text:'Schließen',onclick:close}),el('button',{class:'btn-primary',text:'Im E-Mail-Programm öffnen',onclick:()=>{if(!to.checkValidity()||!to.value){to.reportValidity();return;}location.href='mailto:'+encodeURIComponent(to.value)+'?subject='+encodeURIComponent('Handwerkerauftrag '+hwaNr(r)+' – '+r.titel)+'&body='+encodeURIComponent(body.value);}})]});
}

function hwaVerlauf(r,root){
 const note=el('textarea',{'aria-label':'Neuer Auftragsvermerk',rows:3,maxlength:10000}),save=el('button',{text:'Vermerk speichern',onclick:async()=>{save.disabled=true;try{await API.post('/vorgaenge/'+r.id+'/vermerke',{text:note.value});neuLaden();}catch(e){fehler(e);}finally{save.disabled=false;}}});root.append(abschnitt('Neuer Vermerk',el('div',{},[note,save])));
 for(const h of r.verlauf){let data;try{data=JSON.parse(h.nachher);}catch{data={};}root.append(el('details',{class:'cu-hwa-verlauf'},[el('summary',{text:h.erstellt_am+' · '+h.aktion.replaceAll('_',' ')+' · '+(h.benutzer||'')}),el('p',{text:data.text||data.titel||''}),el('pre',{text:JSON.stringify(data,null,2)})]));}
}

function handwerkerMaske(r,params=new URLSearchParams()){
 const lauf=S.lauf,a=r.auftrag,basis='#/vorgaenge/'+r.id,tab=params.get('tab')||'allgemein',supplier=a.handwerker;
 S.kontext={typ:'handwerker',id:r.id,bearbeiten:()=>handwerkerForm(r),erstellen:()=>handwerkerForm(),drucken:()=>window.print(),rechnungGespeichert:async()=>neuLaden()};
 const tabs=[{key:'allgemein',label:'Allgemein'},{key:'korrespondenz',label:'Korrespondenz'},{key:'archiv',label:'Archiv'},{key:'rechnung',label:'Rechnung'},{key:'vorgaenge',label:'Akten / Vorgänge'},{key:'historie',label:'Historie'}];
 const ref=(row,path)=>row?el('a',{href:'#/'+path+'/'+row.id,text:[row.nummer,hwaName(row)].filter(Boolean).join(' · ')}):'–';
 const oben=[el('div',{class:'cu-hwa-kopf'},[
  panel([['Auftrags-Nr.',hwaNr(r)],['Status',HWA_STATUS[r.status]||r.status],['Sachbearbeiter',r.zustaendig||r.auftrag_sb_name||'Nicht zugewiesen'],['Firma',a.firma||'–'],['Betrag',a.betrag?a.betrag+' EUR':'–']]),
  panel([['Akte',a.akte_id?el('a',{href:'#/vorgaenge/'+a.akte_id,text:'CA-'+a.akte_id}):'–'],['Objekt',ref(a.objekt,'objekte')],['Wohnung',ref(a.einheit,'einheiten')],['Datum',datum(a.datum)],['Frist',datum(r.faellig_am)],['Erledigt',datum(a.erledigt_am)]]),
 ]),el('div',{class:'cu-karte cu-hwa-betreff'},[el('span',{class:'small muted',text:'Betreff'}),el('h2',{text:r.titel}),el('span',{class:'cu-chip',text:HWA_ART[a.auftragsart]||a.auftragsart})])];
 const content=el('div',{class:'cu-hwa-inhalt'});
 const changeTab=t=>geheZu(basis+'?tab='+t);
 const upload=()=>archivUpload(a.objekt?{typ:'objekt',nummer:a.objekt.nummer,kategorie:tab==='rechnung'?'rechnung':'korrespondenz'}:null,async saved=>{try{const latest=await API.get('/vorgaenge/'+r.id);await API.post('/vorgaenge/'+r.id+'/auftragsdokumente',{dokument_id:saved.id,revision:latest.revision});neuLaden();}catch(e){fehler(new Error('Datei ist im Archiv gespeichert; Auftragszuordnung fehlgeschlagen: '+e.message));}});
 const seite=seitenleiste([
  {text:'Suche',onclick:()=>geheZu('#/vorgaenge?art=handwerker')},{text:'Neu',onclick:()=>handwerkerForm()},
  {text:'Bearbeiten',onclick:()=>handwerkerForm(r)},{text:'Drucken',onclick:()=>window.print()},
  {text:'Historie',onclick:()=>changeTab('historie')},{text:'Texte',onclick:()=>handwerkerForm(r)},
  {text:'Adressaten',onclick:()=>handwerkerForm(r)},{text:'Öffnen',onclick:()=>changeTab('archiv')},
  {text:'Rechnung',onclick:()=>changeTab('rechnung')},{text:'Gewährleist.',onclick:()=>handwerkerForm(r)},
  {text:'HWA senden',titel:'E-Mail-Entwurf im Mailprogramm vorbereiten',onclick:()=>hwaMail(r)},
  supplier?{text:'Adresse öffnen',onclick:()=>geheZu('#/adressen/'+supplier.id)}:null,
 ]);
 if(r.incoming){const conflict=el('div',{class:'hp-hinweis'},[el('strong',{text:'HP-Änderungskonflikt'}),el('p',{text:'Die lokale Fassung wurde erhalten. Beide Fassungen vor der Übernahme prüfen.'}),el('pre',{text:JSON.stringify(r.incoming.werte,null,2)})]);for(const [side,label] of [['lokal','Lokale Fassung behalten'],['hp','HP-Fassung übernehmen']])conflict.append(el('button',{text:label,onclick:async()=>{try{await API.post('/vorgaenge/'+r.id+'/konflikt',{fassung:side,revision:r.revision});neuLaden();}catch(e){fehler(e);}}}));content.append(conflict);}
 if(tab==='allgemein'){
  const rows=[...(supplier?[{...supplier,bezeichnung:'Auftragnehmer'}]:[]),...a.adressaten_details];
  content.append(abschnitt('Auftrag · Adressaten',raster([{label:'Adressat',render:p=>ref({...p,bezeichnung:hwaName(p)},'adressen')},{label:'Wohnungs-Nr.',render:()=>a.einheit?.nummer||'–'},{label:'Bezeichnung',render:p=>p.bezeichnung}],rows,{mindestZeilen:3,leer:'Noch kein Handwerker zugeordnet.'})));
  const address=supplier?el('div',{class:'cu-hwa-anschrift'},[el('strong',{text:hwaName(supplier)}),el('span',{text:supplier.strasse||''}),el('span',{text:[supplier.land,supplier.plz,supplier.ort].filter(Boolean).join(' ')}),supplier.email?el('a',{href:'mailto:'+encodeURIComponent(supplier.email),text:supplier.email}):null]):el('p',{text:'Auftragnehmer in „Bearbeiten“ auswählen.'});
  let phones=a.kommunikation.telefone;if(!phones.length&&supplier)phones=[...(supplier.telefon?[{art:'Telefon',nummer:supplier.telefon}]:[]),...(supplier.mobil?[{art:'Mobil',nummer:supplier.mobil}]:[])];
  content.append(el('div',{class:'cu-hwa-kontakte'},[abschnitt('Anschrift',address),abschnitt('Telefon',raster([{label:'Telefontext',render:t=>t.art},{label:'Telefon-Nr.',render:t=>el('a',{href:telHref(t.nummer),text:t.nummer})},{label:'Bemerkung',render:t=>t.bemerkung}],phones,{mindestZeilen:3,leer:'Keine Telefonnummern hinterlegt.'}))]));
  if(a.kommunikation.ansprechpartner.length)content.append(abschnitt('Ansprechpartner',raster([{label:'Name',render:p=>p.name},{label:'Funktion',render:p=>p.funktion},{label:'Telefon',render:p=>p.telefon}],a.kommunikation.ansprechpartner)));
  content.append(abschnitt('Auftragstext / Leistungsbeschreibung',el('div',{class:'cu-hwa-text',text:r.text||'Noch kein Auftragstext erfasst.'})));
  if(a.gewaehrleistung_bis||a.garantie_notiz)content.append(abschnitt('Gewährleistung',panel([['Bis',datum(a.gewaehrleistung_bis)],['Hinweise',a.garantie_notiz||'–']])));
 }else if(tab==='archiv'||tab==='korrespondenz'||tab==='rechnung'){
  content.append(el('div',{class:'cu-hwa-werkzeuge'},[el('button',{text:tab==='rechnung'?'Rechnungsbeleg hochladen':'Dokument hochladen',onclick:upload}),el('button',{text:'Archivdokument zuordnen',onclick:()=>hwaDokumentWaehlen(r)})]));
  if(tab==='rechnung'){
   content.append(abschnitt('Zugeordnete Rechnungen',raster([{label:'Rechnungs-Nr.',render:x=>x.daten.rechnungs_nr||'–'},{label:'Datum',render:x=>datum(x.daten.rechnungsdatum)},{label:'Betrag',render:x=>(x.daten.betrag/100).toFixed(2).replace('.',',')+' EUR'},{label:'Öffnen',render:x=>el('button',{text:'Rechnung öffnen',onclick:()=>hwaRechnungOeffnen(r,x)})}],r.rechnungen,{leer:'Noch keine Rechnung mit diesem Auftrag verknüpft.'})));
   content.append(el('p',{class:'small muted',text:'Einen Beleg unten wählen. Bei einer neuen Rechnung wird die HWA-Nr. automatisch übernommen.'}));
  }
  const docs=a.dokumente.filter(d=>tab!=='korrespondenz'||d.kategorie==='korrespondenz');
  content.append(abschnitt(tab==='rechnung'?'Auftragsbelege':'Dokumente zum Auftrag',raster([{label:'Datum',render:d=>datum(d.dokument_datum)},{label:'Titel',render:d=>d.titel},{label:'Kategorie',render:d=>L.kategorie[d.kategorie]||d.kategorie},{label:'Datei',render:d=>el('div',{class:'cu-hwa-dateiknoepfe'},[el('button',{text:'Ansehen',onclick:()=>dmsVorschau('/api/archiv/'+d.id+'/download',{titel:d.titel})}),el('a',{href:'/api/archiv/'+d.id+'/download',download:d.original_name,text:'Herunterladen'}),tab==='rechnung'?el('button',{text:'Rechnung erfassen',onclick:()=>rechnungMaske(d,{hwa:r}).catch(fehler)}):null])}],docs,{leer:'Noch keine Dokumente zum Auftrag zugeordnet.'})));
  const hpdocs=r.bezuege.filter(b=>b.typ==='dokument');if(hpdocs.length)content.append(abschnitt('Übernommene Auftragsdokumente',el('div',{},hpdocs.map(d=>el('p',{},[el('button',{text:d.name,onclick:()=>tab==='rechnung'?rechnungMaske({hp:{quelle:r.quelle_id,datei:d.remote_id}},{hwa:r}).catch(fehler):dmsVorschau('/api/vorgaenge/'+r.id+'/dokumente/'+d.remote_id,{titel:d.name})})])))));
 }else if(tab==='vorgaenge'){
  const refs=r.bezuege.filter(b=>b.typ!=='dokument');content.append(el('button',{text:'Zuordnung ergänzen',onclick:()=>vorgangZuordnung(r)}),abschnitt('Akten / Vorgänge und Zuordnungen',refs.length?el('ul',{},refs.map(b=>el('li',{},[vorgangLink(b)]))):el('p',{text:'Keine weiteren Verknüpfungen.'})));if(a.akte_id)content.append(el('a',{href:'#/vorgaenge/'+a.akte_id,text:'Akte CA-'+a.akte_id+' öffnen'}));
 }else hwaVerlauf(r,content);
 zeigeAufDesktop(lauf,maskenFenster({titel:'Handwerkerauftrag Nr. '+hwaNr(r),kopf:{brot:[{text:'Handwerkeraufträge',href:'#/vorgaenge?art=handwerker'},{text:hwaNr(r)}],ueberschrift:'Handwerkerauftrag '+hwaNr(r),badge:VORGANG_STATUS[r.status],unterzeile:[a.objekt?.bezeichnung,a.einheit?.nummer].filter(Boolean).join(' · ')},inhalt:maskenRaster({oben,seite,unten:[reiterLeiste(tabs,tab,basis),content]})}));
}

function hwaDokumentWaehlen(r){
 const input=el('input',{type:'search','aria-label':'Archivdokument suchen',placeholder:'Titel oder Dateiname …'}),body=el('div');let seq=0,m;
 async function load(){const n=++seq;try{const rows=await API.get('/archiv'+API.qs({suche:input.value}));if(n!==seq||!body.isConnected)return;body.replaceChildren(raster([{label:'Titel',render:d=>d.titel},{label:'Datei',render:d=>d.original_name},{label:'Zuordnen',render:d=>el('button',{text:'Zum Auftrag zuordnen',onclick:async()=>{try{await API.post('/vorgaenge/'+r.id+'/auftragsdokumente',{dokument_id:d.id,revision:r.revision});m.close();neuLaden();}catch(e){fehler(e);}}})}],Array.isArray(rows)?rows:rows.eintraege||[],{leer:'Keine Dokumente gefunden.'}));}catch(e){body.textContent=e.message;}}
 input.addEventListener('input',debounce(load));m=modal({titel:'Archivdokument zum Auftrag zuordnen',wide:true,inhalt:el('div',{},[input,body]),footer:close=>[el('button',{text:'Abbrechen',onclick:close})]});load();
}
function hwaRechnungOeffnen(r,x){const p=x.dokument_schluessel.split(':');return rechnungMaske(p[0]==='hp'?{hp:{quelle:p[1],datei:Number(p[2])}}:{id:Number(p[1]),original_name:'Rechnung'},{hwa:r}).catch(fehler);}
