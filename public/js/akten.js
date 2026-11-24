'use strict';
const AKTEN_ARTEN={BB0:'Protokollakte','267':'Versicherungsschaden'};
const akteNummer=r=>r.hp_nummer||(r.id?'CA-'+r.id:'–');
const akteName=a=>a?.firmenname||a?.name||[a?.vorname,a?.nachname].filter(Boolean).join(' ')||a?.bezeichnung||'';
async function aktenStart(params=new URLSearchParams()){
 const lauf=S.lauf,context=['adresse','objekt','einheit'].includes(params.get('typ'))&&Number(params.get('ziel'))>0?{typ:params.get('typ'),id:Number(params.get('ziel'))}:null;
 try{const rows=await API.get('/vorgaenge'+API.qs({art:'akte',typ:context?.typ||'',ziel:context?.id||''}));if(lauf!==S.lauf)return;
  const id=rows.eintraege.some(r=>r.id===S.akteLetzte)?S.akteLetzte:rows.eintraege[0]?.id;
  const r=id?await API.get('/vorgaenge/'+id):{id:null,art:'akte',titel:'',status:'offen',text:'',bezuege:[],verlauf:[]};if(lauf===S.lauf)aktenMaske(r,params,context);
 }catch(e){if(lauf===S.lauf)fehler(e);}
}
function akteSuchen(){
 const list=el('div',{class:'cu-akte-suche'});let m;
 list.addEventListener('click',e=>{if(e.target.closest('a[href^="#/vorgaenge/"]'))m.close();});
 list.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('tr[tabindex]'))m.close();},true);
 m=modal({titel:'Akte / Vorgang suchen',wide:true,inhalt:list,footer:close=>[el('button',{text:'Schließen',onclick:close})]});vorgaengeListe(list,{art:'akte'});[...list.querySelectorAll('button')].find(b=>b.textContent==='Neu anlegen')?.addEventListener('click',()=>m.close(),true);list.querySelector('input')?.focus();
}
async function akteForm(r={},context=null){
 if(!darfSchreiben())return;const a=r.akte||{},lauf=S.lauf;
 const {form,werte,inputs}=formular([
  [{name:'art_code',label:'Aktenart',value:a.art_code||'',maxlength:3},{name:'art_text',label:'Bezeichnung',value:a.art_text||'',maxlength:100}],
  [{name:'titel',label:'Suchbegriff / Betreff',value:r.titel||'',required:true,maxlength:500}],
  [{name:'objekt_nr',label:'Objekt-Nr.',value:a.objekt?.nummer||'',maxlength:100},{name:'wohnung_nr',label:'Wohnungs-Nr.',value:a.einheit?.nummer||'',maxlength:100}],
  [{name:'begonnen_am',label:'Begonnen am',type:'date',value:a.begonnen_am||''},{name:'geschlossen_am',label:'Geschlossen am',type:'date',value:a.geschlossen_am||''}],
  [{name:'bemerkung',label:'Bemerkung',value:a.bemerkung||'',maxlength:2000},{name:'ablageort',label:'Ablageort',value:a.ablageort||'',maxlength:200}],
  [{name:'firma',label:'Firma',value:a.firma||'',maxlength:30},{name:'sb',label:'Sachbearbeiterkürzel',value:a.sb||'',maxlength:3}],
  [{name:'status',label:'Bearbeitungsstand',type:'select',options:opt(VORGANG_STATUS),value:r.status||'offen'},
   {name:'sonderleistung',label:'Sonderleistung',type:'checkbox',value:!!a.sonderleistung}],
  [{name:'text',label:'Aktenvermerk / Beschreibung',type:'textarea',value:r.text||'',maxlength:65535}]
 ].map(felder=>({grid:felder.length===1?1:2,felder})));form.id='akte-form';form.classList.add('cu-akte-form');inputs.sonderleistung.checked=!!a.sonderleistung;
 for(const [key,max]of Object.entries({art_code:3,art_text:100,titel:500,bemerkung:2000,ablageort:200,firma:30,sb:3,text:65535}))inputs[key].maxLength=max;
 for(const key of ['art_code','sb'])inputs[key].addEventListener('input',()=>{inputs[key].value=inputs[key].value.toUpperCase();});
 inputs.art_code.addEventListener('blur',()=>{if(AKTEN_ARTEN[inputs.art_code.value]&&!inputs.art_text.value)inputs.art_text.value=AKTEN_ARTEN[inputs.art_code.value];});
 const refs={objekt_nr:a.objekt||null,wohnung_nr:a.einheit||null},names={};let closed=false;
 async function resolve(key){const input=inputs[key],value=input.value.trim(),typ=key==='objekt_nr'?'objekt':'einheit';if(!value){refs[key]=null;names[key].textContent='';return null;}if(refs[key]&&String(refs[key].nummer)===value)return refs[key];
  const object=typ==='einheit'?await resolve('objekt_nr'):null;if(typ==='einheit'&&!object)throw new Error('Bitte zuerst die Objekt-Nr. eingeben.');
  const row=await API.post('/vorgaenge/hwa-nummer',{typ,nummer:value,...(object?{objekt_id:object.id}:{})});if(closed||lauf!==S.lauf||input.value.trim()!==value)throw new Error('Auswahl wurde inzwischen geändert.');refs[key]=row;names[key].textContent=row.anzeigename||row.bezeichnung||'';return row;
 }
 for(const [key,typ]of [['objekt_nr','objekt'],['wohnung_nr','einheit']]){
  const input=inputs[key],hint=el('span',{class:'cu-akte-aufgeloest','aria-live':'polite',text:refs[key]?.bezeichnung||''});names[key]=hint;input.parentNode.append(hint);
  input.addEventListener('input',()=>{refs[key]=null;hint.textContent='';input.setCustomValidity('');if(key==='objekt_nr'){refs.wohnung_nr=null;inputs.wohnung_nr.value='';if(names.wohnung_nr)names.wohnung_nr.textContent='';}});
  input.addEventListener('blur',()=>resolve(key).then(()=>input.setCustomValidity('')).catch(e=>{if(!closed){hint.textContent=e.message;input.setCustomValidity(e.message);}}));
  if(typeof tippAuswahl==='function')tippAuswahl(input,{label:typ==='objekt'?'Objekt':'Wohnung',format:row=>String(row.nummer),scope:()=>inputs.objekt_nr.value,suchen:async q=>{const object=typ==='einheit'?await resolve('objekt_nr'):null;return tippSuche(typ,q,{objektId:object?.id});},auswaehlen:row=>{refs[key]=row;hint.textContent=row.anzeigename||row.bezeichnung||'';input.setCustomValidity('');if(key==='objekt_nr'){refs.wohnung_nr=null;inputs.wohnung_nr.value='';names.wohnung_nr.textContent='';}}});
 }
 let m;const error=el('p',{role:'alert'}),save=el('button',{type:'submit',form:'akte-form',class:'btn-primary',text:'OK'});form.append(error);
 form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;error.textContent='';try{const object=await resolve('objekt_nr'),unit=await resolve('wohnung_nr'),v=werte();
  const data={art:'akte',titel:v.titel,text:v.text,status:v.geschlossen_am?'erledigt':v.status,prioritaet:r.prioritaet||'normal',faellig_am:r.faellig_am||null,uhrzeit:r.uhrzeit||null,zustaendig_id:r.zustaendig_id||null,revision:r.revision,kontext:context,
   akte:{...Object.fromEntries(['art_code','art_text','begonnen_am','geschlossen_am','bemerkung','ablageort','firma','sb'].map(k=>[k,v[k]])),sonderleistung:inputs.sonderleistung.checked,objekt_id:object?.id||null,einheit_id:unit?.id||null}};
  const saved=r.id?await API.put('/vorgaenge/'+r.id,data):await API.post('/vorgaenge',data);closed=true;m.close();toast('Akte gespeichert','success');geheZu('#/vorgaenge/'+saved.id);
 }catch(e){error.textContent=e.message;}finally{save.disabled=false;}});
 m=modal({titel:r.id?'Akte bearbeiten':'Neuanlage Akte / Vorgang',wide:true,inhalt:form,footer:close=>[el('button',{text:'Abbrechen',onclick:()=>{closed=true;close();}}),save]});inputs.art_code.focus();
}
function aktenMaske(r,params=new URLSearchParams(),context=null){
 const lauf=S.lauf,a=r.akte||{},refs=r.bezuege||[],basis=r.id?'#/vorgaenge/'+r.id:'#/vorgaenge',tab=params.get('tab')||'adressen';if(r.id)S.akteLetzte=r.id;
 S.kontext={typ:'akte',id:r.id,suchen:akteSuchen,erstellen:()=>akteForm({},context),...(r.id?{bearbeiten:()=>akteForm(r),drucken:()=>window.print()}:{})};
 const rows=a.adressen||refs.filter(b=>b.typ==='adresse').map(b=>({id:b.ziel_id,nummer:b.hp_nummer,name:b.name}));let selected=rows.find(v=>v.id===S.akteAdresse)||rows[0]||null;
 const pf=el('div'),content=el('div',{class:'cu-akte-inhalt'}),change=t=>geheZu(basis+'?tab='+t),name=akteNummer(r);
 const object=a.objekt?el('a',{href:'#/objekte/'+a.objekt.id,text:[a.objekt.nummer,a.objekt.bezeichnung].filter(Boolean).join(' · ')}):refs.find(b=>b.typ==='objekt')?.name||'–';
 const unit=a.einheit?el('a',{href:'#/einheiten/'+a.einheit.id,text:[a.einheit.nummer,a.einheit.lage||a.einheit.bezeichnung].filter(Boolean).join(' · ')}):refs.find(b=>b.typ==='einheit')?.name||'–';
 const oben=[el('div',{class:'cu-akte-kopf'},[panel([[a.art_code||'Aktenart',a.art_text||AKTEN_ARTEN[a.art_code]||'–'],['Suchbegriff',r.titel||'Keine Akte ausgewählt'],['Begonnen am',datum(a.begonnen_am)],['Bemerkung',a.bemerkung||'–'],['Objekt',object],['Ort',[a.objekt?.plz,a.objekt?.ort].filter(Boolean).join(' ')||'–'],['VE / Lage',unit],['Ablageort',a.ablageort||'–']]),el('div',{class:'cu-akte-status'},[panel([['Angelegt',datum(a.angelegt_hp||r.erstellt_am)],['Geschlossen',datum(a.geschlossen_am)],['Bearbeitungsstand',VORGANG_STATUS[r.status]||'–'],['Firma / SB',[a.firma,a.sb].filter(Boolean).join(' / ')||r.zustaendig||'–']]),el('label',{class:'cu-akte-sonder'},[el('input',{type:'checkbox',checked:!!a.sonderleistung,disabled:true}),document.createTextNode('Sonderleistung')])])])];
 const ensure=fn=>()=>{if(r.id)fn();else toast('Bitte zuerst eine Akte auswählen oder mit F4 anlegen.');};
 const seite=seitenleiste([{text:'Suche',onclick:akteSuchen},r.id?{text:'HP-Daten übernehmen',onclick:()=>geheZu(istAdmin()?'#/hp-akten':'#/vorgaenge?art=akte&liste=1')}:null,{text:'Neu (F4)',onclick:()=>akteForm({},context)},{text:'Bearbeiten',onclick:ensure(()=>akteForm(r))},{text:'Drucken',onclick:()=>window.print()},{text:'Z.I.S.',onclick:()=>change('historie')},{text:'Folgeblätter',onclick:()=>change('folge')},{text:'Archiv',onclick:()=>change('archiv')},{text:'Korrespondenz',onclick:()=>change('korrespondenz')},{text:'Handwerkeraufträge',onclick:()=>change('handwerker')},{text:'Adresse öffnen',onclick:()=>selected?.id?geheZu('#/adressen/'+selected.id):toast('Bitte eine zugeordnete Adresse auswählen.')},a.versammlung_id?{text:'ETV öffnen',onclick:()=>geheZu('#/etv/'+a.versammlung_id)}:null]);
 if(r.incoming){const conflict=el('div',{class:'hp-hinweis'},[el('strong',{text:'HP-Änderungskonflikt'}),el('pre',{text:JSON.stringify(r.incoming.werte,null,2)})]);for(const [fassung,text]of [['lokal','Lokale Fassung behalten'],['hp','HP-Fassung übernehmen']])conflict.append(el('button',{text,onclick:async()=>{try{await API.post('/vorgaenge/'+r.id+'/konflikt',{fassung,revision:r.revision});neuLaden();}catch(e){fehler(e);}}}));content.append(conflict);}
 const tabs=[{key:'adressen',label:'Zugeordnete Adressen'},{key:'folge',label:'Folgeblätter'},{key:'archiv',label:'Archiv'},{key:'korrespondenz',label:'Korrespondenz'},{key:'handwerker',label:'Handwerkeraufträge'}];
 async function personenfunktion(){const id=selected?.id;pf.replaceChildren(el('p',{class:'muted',text:id?'Personenfunktionen werden geladen …':'Keine Adresse ausgewählt.'}));if(!id)return;
  try{const data=await API.get('/adressen/'+id+'/zuordnungen');if(lauf!==S.lauf||selected?.id!==id||!pf.isConnected)return;pf.replaceChildren(raster([{label:'Zeitraum',render:z=>typeof zeitraum==='function'?zeitraum(z):'–'},{label:'Funktion',render:z=>typeof L!=='undefined'?L.rolle[z.rolle]||z.rolle:z.rolle},{label:'Nr.',render:z=>z.einheit_nummer||z.objekt_nummer},{label:'Objekt',render:z=>z.objekt_bezeichnung}],data.filter(z=>z.aktiv),{mindestZeilen:1,leer:'Keine aktuellen Personenfunktionen.'}));}catch(e){if(lauf===S.lauf&&selected?.id===id)pf.textContent=e.message;}}
 if(tab==='adressen'){
  const addresses=raster([{label:'Suchbegriff',render:v=>v.id?el('a',{href:'#/adressen/'+v.id,text:akteName(v)}):akteName(v)},{label:'PLZ',render:v=>v.plz},{label:'Ort',render:v=>v.ort},{label:'Straße',render:v=>v.strasse}],rows,{mindestZeilen:3,leer:'Noch keine Adressen zugeordnet.',onOpen:v=>{selected=v;S.akteAdresse=v.id;personenfunktion();}});
  content.append(abschnitt('Akten anzeigen',addresses,r.id?[{text:'Zuordnen',onclick:()=>vorgangZuordnung(r)}]:[]),abschnitt('Aktuelle Personenfunktion',pf));
 }else if(tab==='archiv'||tab==='korrespondenz'){
  const docs=[...(a.dokumente||r.archiv_dokumente||[]),...(a.hp_dokumente||[])].filter(d=>tab!=='korrespondenz'||d.kategorie==='korrespondenz');
  const upload=ensure(()=>archivUpload(a.objekt?{typ:'objekt',nummer:a.objekt.nummer,kategorie:tab==='korrespondenz'?'korrespondenz':'sonstiges'}:null,async saved=>{try{const latest=await API.get('/vorgaenge/'+r.id);await API.post('/vorgaenge/'+r.id+'/aktendokumente',{dokument_id:saved.id,revision:latest.revision});neuLaden();}catch(e){fehler(new Error('Datei gespeichert; Aktenzuordnung fehlgeschlagen: '+e.message));}}));
  if(tab==='korrespondenz'&&r.id)content.append(el('a',{href:'#/posteingang?typ=akte&ziel='+r.id,text:'Zugeordnete E-Mails öffnen',class:'btn'}));
  content.append(abschnitt(tab==='archiv'?'Archiv zur Akte':'Korrespondenz zur Akte',raster([{label:'Datum',render:d=>datum(d.dokument_datum)},{label:'Titel',render:d=>d.titel},{label:'Speicherstand',render:d=>d.hp&&!d.gesichert?'Dateiübernahme ausstehend':'In CuraAed gespeichert'},{label:'Datei',render:d=>el('button',{text:d.original_name||'Ansehen',onclick:()=>dmsVorschau(d.hp?'/api/vorgaenge/'+r.id+'/dokumente/'+d.id:'/api/archiv/'+d.id+'/download',{titel:d.titel,original_name:d.original_name})})}],docs,{mindestZeilen:4}),[{text:'Hochladen',onclick:upload}]));
  for(const d of refs.filter(b=>b.typ==='dokument'&&!a.hp_dokumente))content.append(el('button',{text:d.name,onclick:()=>dmsVorschau('/api/vorgaenge/'+r.id+'/dokumente/'+d.remote_id,{titel:d.name})}));
 }else if(tab==='handwerker'){
  content.append(abschnitt('Handwerkeraufträge zur Akte',raster([{label:'Auftrags-Nr.',render:v=>el('a',{href:'#/vorgaenge/'+v.id,text:akteNummer(v)})},{label:'Betreff',render:v=>v.titel},{label:'Status',render:v=>VORGANG_STATUS[v.status]},{label:'Frist',render:v=>datum(v.faellig_am)}],a.handwerkerauftraege||[],{mindestZeilen:4}),r.id?[{text:'Neu',onclick:()=>handwerkerForm({titel:r.titel,text:r.text,auftrag:{akte_id:r.id,objekt:a.objekt,einheit:a.einheit}})}]:[]));
 }else{
  if(tab==='folge'){content.append(abschnitt('Aktenvermerk',el('div',{class:'cu-akte-vermerk',text:r.text||'Noch kein Aktenvermerk.'})));
   const note=el('textarea',{'aria-label':'Neues Folgeblatt',rows:3,maxlength:10000}),save=el('button',{text:'Folgeblatt speichern',disabled:!r.id,onclick:async()=>{save.disabled=true;try{await API.post('/vorgaenge/'+r.id+'/vermerke',{text:note.value});neuLaden();}catch(e){fehler(e);}finally{save.disabled=false;}}});content.append(abschnitt('Neues Folgeblatt',el('div',{class:'cu-akte-notiz'},[note,save])));}
  for(const h of r.verlauf||[]){let text='';try{const after=JSON.parse(h.nachher);text=after.text||after.titel||'';}catch{}content.append(el('div',{class:'cu-akte-verlauf'},[el('strong',{text:[h.aktion==='vermerk'?'Folgeblatt':h.aktion,h.erstellt_am,h.benutzer].filter(Boolean).join(' · ')}),el('div',{text})]));}
  if(r.remote_snapshot)content.append(el('details',{},[el('summary',{text:'Übernommene HP-Originaldaten'}),el('pre',{text:JSON.stringify(r.remote_snapshot,null,2)})]));
 }
 const due=abschnitt('Tagesaktivität / Wiedervorlage',raster([{label:'Datum',render:v=>datum(v.faellig_am)},{label:'Zeit',render:v=>v.uhrzeit||'–'},{label:'Priorität',render:v=>v.prioritaet},{label:'Info',render:v=>el('a',{href:'#/vorgaenge/'+v.id,text:v.titel})}],a.wiedervorlagen||[],{mindestZeilen:2}),r.id?[{text:'Neu',onclick:()=>vorgangForm({art:'wiedervorlage'},{typ:'akte',id:r.id})}]:[]);
 const frame=maskenFenster({titel:'Vorgang · Vertrag · Akte '+name,kopf:{ueberschrift:'Akte / Vorgang '+name,brot:[{text:'Akten / Vorgänge',href:'#/vorgaenge'},{text:name}],unterzeile:r.titel||'Akte suchen oder mit F4 neu anlegen',badge:VORGANG_STATUS[r.status]},inhalt:maskenRaster({oben,seite,unten:[reiterLeiste(tabs,tab,basis),content,due]})});frame.classList.add('cu-akte-anzeige');zeigeAufDesktop(lauf,frame);if(tab==='adressen')personenfunktion();
}
