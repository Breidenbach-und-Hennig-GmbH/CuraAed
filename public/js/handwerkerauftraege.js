'use strict';
const HWA_ART={normal:'Normalauftrag',eilauftrag:'Eilauftrag',notdienst:'Notdienst',angebot:'Angebotsanfrage'};
const HWA_STATUS={offen:'001 · Offen',in_bearbeitung:'002 · In Bearbeitung',beauftragt:'004 · Auftrag erteilt',erledigt:'Erledigt',storniert:'Storniert'};
const hwaName=a=>a?.anzeigename||a?.firmenname||[a?.vorname,a?.nachname].filter(Boolean).join(' ')||a?.bezeichnung||'';
const hwaNr=r=>r.hp_nummer||(r.id?'CA-'+r.id:'–');
let handwerkerSprungLaeuft=false;
async function handwerkerSprung(){
 if(!darfSchreiben()){toast('Keine Schreibberechtigung.');return;}
 if(handwerkerSprungLaeuft||document.querySelector('.cu-hwa-form'))return;
 handwerkerSprungLaeuft=true;
 try{geheZu('#/hwa');}catch(e){fehler(e);}finally{handwerkerSprungLaeuft=false;}
}

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

async function handwerkerForm(r={},kontext=null){return handwerkerErfassung(r,{kontext});}

function hwaMail(r){
 const a=r.auftrag,supplier=a.handwerker,mail=a.kommunikation.emails.find(e=>e.ist_email)?.adresse||supplier?.email;
 const text=['Sehr geehrte Damen und Herren,','','hiermit bitten wir um Ausführung des folgenden Auftrags:','','Auftrag: '+hwaNr(r),'Betreff: '+r.titel,'Auftragsart: '+HWA_ART[a.auftragsart],a.objekt?'Objekt: '+[a.objekt.nummer,a.objekt.bezeichnung,a.objekt.strasse,a.objekt.plz,a.objekt.ort].filter(Boolean).join(' '):'',a.einheit?'Wohnung: '+a.einheit.nummer+' '+a.einheit.bezeichnung:'','Frist: '+datum(r.faellig_am),a.betrag?'Auftragsbetrag: '+a.betrag+' EUR':'','',r.text||a.originaltext,'',...a.adressaten_details.map(p=>'Ansprechpartner: '+hwaName(p)+(p.telefon?' · '+p.telefon:'')+(p.mobil?' · '+p.mobil:'')),'','Bitte bestätigen Sie uns den Auftrag und stimmen Sie den Termin mit dem Ansprechpartner ab.'].filter(x=>x!==null).join('\r\n');
 const body=el('textarea',{'aria-label':'E-Mail-Entwurf',rows:16,text,style:'width:100%'}),to=el('input',{'aria-label':'Empfänger E-Mail',type:'email',value:mail||'',style:'width:100%'});
 modal({titel:'HWA senden – E-Mail vorbereiten',wide:true,inhalt:el('div',{},[el('label',{text:'Empfänger'}),to,el('p',{text:'Der Entwurf wird im E-Mail-Programm geöffnet. Vor dem Versand prüfen; Anlagen dort ergänzen.'}),body]),footer:close=>[el('button',{text:'Schließen',onclick:close}),el('button',{class:'btn-primary',text:'Im E-Mail-Programm öffnen',onclick:()=>{if(!to.checkValidity()||!to.value){to.reportValidity();return;}location.href='mailto:'+encodeURIComponent(to.value)+'?subject='+encodeURIComponent('Handwerkerauftrag '+hwaNr(r)+' – '+r.titel)+'&body='+encodeURIComponent(body.value);}})]});
}

function hwaVerlauf(r,root){
 const note=el('textarea',{'aria-label':'Neuer Auftragsvermerk',rows:3,maxlength:10000}),save=el('button',{text:'Vermerk speichern',onclick:async()=>{save.disabled=true;try{await API.post('/vorgaenge/'+r.id+'/vermerke',{text:note.value});neuLaden();}catch(e){fehler(e);}finally{save.disabled=false;}}});root.append(abschnitt('Neuer Vermerk',el('div',{},[note,save])));
 for(const h of r.verlauf){let data;try{data=JSON.parse(h.nachher);}catch{data={};}root.append(el('details',{class:'cu-hwa-verlauf'},[el('summary',{text:h.erstellt_am+' · '+h.aktion.replaceAll('_',' ')+' · '+(h.benutzer||'')}),el('p',{text:data.text||data.titel||''}),el('pre',{text:JSON.stringify(data,null,2)})]));}
}

function handwerkerMaske(r,params=new URLSearchParams()){
 const lauf=S.lauf,a=r.auftrag,basis=r.id?'#/vorgaenge/'+r.id:'#/hwa',tab=params.get('tab')||'allgemein',supplier=a.handwerker;
 if(r.id)S.hwaLetzter=r.id;
 S.kontext={typ:'handwerker',id:r.id,hwaRecord:r,bearbeiten:()=>handwerkerForm(r),erstellen:()=>handwerkerForm(),drucken:()=>hwaDruckDialog(r.id).catch(fehler),rechnungGespeichert:async()=>neuLaden()};
 const tabs=[{key:'allgemein',label:'Allgemein'},{key:'korrespondenz',label:'Korrespondenz'},{key:'archiv',label:'Archiv'},{key:'rechnung',label:'Rechnung'},{key:'vorgaenge',label:'Akten / Vorgänge'},{key:'historie',label:'Historie'}];
 const ref=(row,path)=>row&&!row.id?el('span',{text:[row.nummer,hwaName(row),'(Originalzuordnung)'].filter(Boolean).join(' · ')}):row?el('a',{href:'#/'+path+'/'+row.id,text:[row.nummer,hwaName(row)].filter(Boolean).join(' · ')}):'–';
 const oben=[...(r.ticket_quellen||[]).map(t=>el('p',{class:'hp-hinweis'},[document.createTextNode('Erstellt aus '),el('a',{href:'#/tickets/'+t.id,text:t.nummer})])),el('div',{class:'cu-hwa-kopf'},[
  panel([['Auftrags-Nr.',hwaNr(r)],['Status',a.status_code&&HWA_STATI[a.status_code]?a.status_code+' · '+HWA_STATI[a.status_code].text:a.source_status||HWA_STATUS[r.status]||r.status,el('span',{text:'Firma: '+(a.firma||'–')})],['Sachbearbeiter',r.zustaendig||r.auftrag_sb_name||a.source_sb||'Nicht zugewiesen',el('span',{text:'Betrag: '+(a.betrag?a.betrag+' EUR':'–')})]]),
  panel([['Akte',a.akte_id?el('a',{href:'#/vorgaenge/'+a.akte_id,text:'CA-'+a.akte_id}):'–'],['Objekt/Wohnung',el('span',{},[ref(a.objekt,'objekte'),document.createTextNode(' / '),ref(a.einheit,'einheiten')])],['Datum',datum(a.datum),el('span',{text:'Frist: '+datum(r.faellig_am)+' · erledigt: '+datum(a.erledigt_am)})]]),
 ]),el('div',{class:'cu-karte cu-hwa-betreff'},[el('span',{class:'small muted',text:'Betreff'}),el('h2',{text:r.titel||'Kein Handwerkerauftrag ausgewählt'}),a.betreff2?el('div',{text:a.betreff2}):null,el('span',{class:'cu-chip',text:HWA_ART[a.auftragsart]||a.auftragsart})])];
 const content=el('div',{class:'cu-hwa-inhalt'});
 const changeTab=t=>geheZu(basis+'?tab='+t);
 const upload=()=>archivUpload(a.objekt?.id?{typ:'objekt',nummer:a.objekt.nummer,kategorie:tab==='rechnung'?'rechnung':'korrespondenz'}:null,async saved=>{try{const latest=await API.get('/vorgaenge/'+r.id);await API.post('/vorgaenge/'+r.id+'/auftragsdokumente',{dokument_id:saved.id,revision:latest.revision});neuLaden();}catch(e){fehler(new Error('Datei ist im Archiv gespeichert; Auftragszuordnung fehlgeschlagen: '+e.message));}});
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
  content.append(abschnitt('Auftrag · Adressaten',raster([{label:'Adressat',render:p=>ref({...p,bezeichnung:hwaName(p)},'adressen')},{label:'Wohnungs-Nr.',render:()=>a.einheit?.nummer||'–'},{label:'PFkt',render:p=>p.pfkt||'–'},{label:'Bezeichnung',render:p=>p.bezeichnung}],rows,{mindestZeilen:3,leer:'Noch kein Handwerker zugeordnet.'})));
  const address=supplier?el('div',{class:'cu-hwa-anschrift'},[el('strong',{text:hwaName(supplier)}),el('span',{text:supplier.strasse||''}),el('span',{text:[supplier.land,supplier.plz,supplier.ort].filter(Boolean).join(' ')}),supplier.email?el('a',{href:'mailto:'+encodeURIComponent(supplier.email),text:supplier.email}):null]):el('p',{text:'Auftragnehmer in „Bearbeiten“ auswählen.'});
  let phones=a.kommunikation.telefone;if(!phones.length&&supplier)phones=[...(supplier.telefon?[{art:'Telefon',nummer:supplier.telefon}]:[]),...(supplier.mobil?[{art:'Mobil',nummer:supplier.mobil}]:[])];
  content.append(el('div',{class:'cu-hwa-kontakte'},[abschnitt('Anschrift',address),abschnitt('Telefon',raster([{label:'Telefontext',render:t=>t.art},{label:'Telefon-Nr.',render:t=>el('a',{href:telHref(t.nummer),text:t.nummer})},{label:'Bemerkung',render:t=>t.bemerkung}],phones,{mindestZeilen:3,leer:'Keine Telefonnummern hinterlegt.'}))]));
  if(a.kommunikation.ansprechpartner.length)content.append(abschnitt('Ansprechpartner',raster([{label:'Name',render:p=>p.name},{label:'Funktion',render:p=>p.funktion},{label:'Telefon',render:p=>p.telefon}],a.kommunikation.ansprechpartner)));
  content.append(abschnitt('Auftragstext / Leistungsbeschreibung',el('div',{class:'cu-hwa-text',text:r.text||a.originaltext||'Noch kein Auftragstext erfasst.'})));
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
 const fenster=maskenFenster({titel:'Handwerkerauftrag Nr. '+hwaNr(r),kopf:{drucken:false,knoepfe:[{text:'Drucken',icon:'printer',onclick:()=>hwaDruckDialog(r.id).catch(fehler)}],brot:[{text:'Handwerkeraufträge',href:'#/vorgaenge?art=handwerker'},{text:hwaNr(r)}],ueberschrift:'Handwerkerauftrag '+hwaNr(r),badge:a.status_text||VORGANG_STATUS[r.status],unterzeile:[a.objekt?.bezeichnung,a.einheit?.nummer].filter(Boolean).join(' · ')},inhalt:maskenRaster({oben,seite,unten:[reiterLeiste(tabs,tab,basis),content]})});fenster.classList.add('cu-hwa-anzeige');zeigeAufDesktop(lauf,fenster);
}

function hwaDokumentWaehlen(r){
 const input=el('input',{type:'search','aria-label':'Archivdokument suchen',placeholder:'Titel oder Dateiname …'}),body=el('div');let seq=0,m;
 async function load(){const n=++seq;try{const rows=await API.get('/archiv'+API.qs({suche:input.value}));if(n!==seq||!body.isConnected)return;body.replaceChildren(raster([{label:'Titel',render:d=>d.titel},{label:'Datei',render:d=>d.original_name},{label:'Zuordnen',render:d=>el('button',{text:'Zum Auftrag zuordnen',onclick:async()=>{try{await API.post('/vorgaenge/'+r.id+'/auftragsdokumente',{dokument_id:d.id,revision:r.revision});m.close();neuLaden();}catch(e){fehler(e);}}})}],Array.isArray(rows)?rows:rows.eintraege||[],{leer:'Keine Dokumente gefunden.'}));}catch(e){body.textContent=e.message;}}
 input.addEventListener('input',debounce(load));m=modal({titel:'Archivdokument zum Auftrag zuordnen',wide:true,inhalt:el('div',{},[input,body]),footer:close=>[el('button',{text:'Abbrechen',onclick:close})]});load();
}
function hwaRechnungOeffnen(r,x){const p=x.dokument_schluessel.split(':');return rechnungMaske(p[0]==='hp'?{hp:{quelle:p[1],datei:Number(p[2])}}:{id:Number(p[1]),original_name:'Rechnung'},{hwa:r}).catch(fehler);}
