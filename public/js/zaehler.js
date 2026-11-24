'use strict';
const ZAEHLER_MEDIEN={strom:'Strom',gas:'Gas',kaltwasser:'Kaltwasser',warmwasser:'Warmwasser',waerme:'Wärme',heizkostenverteiler:'Heizkostenverteiler'};
// Nur die Anzeige vereinheitlichen; Zuordnungen verwenden weiterhin die Datensatz-IDs.
const zaehlerWohnungsnummer=v=>/^HP-[0-9a-f]{1,32}-\d+-(\d+)$/i.exec(String(v??''))?.[1]||String(v??'');
const ZAEHLER_ARTEN={haupt:'Hauptzähler',wohnung:'Wohnungszähler',unter:'Unterzähler'};
function hpZaehlerImportDialog(oid,reload){
 let bericht,pruefung;
 const file=el('input',{type:'file',accept:'.json,application/json','aria-label':'HP-Zählerbericht'}),status=el('p',{role:'status',text:'HP-Zählerbericht auswählen. Es werden nur Daten dieses Objekts übernommen.'}),result=el('div'),url='/objekte/'+oid+'/zaehler/hp-import';
 let dialog;
 const take=el('button',{class:'btn-primary',text:'Geprüfte Daten übernehmen',disabled:true,onclick:async()=>{take.disabled=true;try{const r=await API.post(url+'/uebernehmen',{bericht,pruefsumme:pruefung.pruefsumme});dialog.close();toast(r.neue_zaehler+' Zähler und '+r.neue_ablesungen+' Ablesungen übernommen.');reload();}catch(e){status.textContent=e.message;}}});
 file.addEventListener('change',async()=>{take.disabled=true;bericht=null;pruefung=null;result.replaceChildren();try{const f=file.files?.[0];if(!f)return;if(f.size>1500000)throw new Error('Der Bericht ist zu groß. Bitte objektweise übernehmen.');bericht=JSON.parse(await f.text());status.textContent='HP-Daten werden geprüft …';pruefung=await API.post(url+'/vorschau',{bericht});status.textContent='Objekt '+pruefung.objektnummer+': '+pruefung.zaehler+' Zähler ('+pruefung.aktiv+' aktiv), '+pruefung.ablesungen+' Ablesungen. Neu: '+pruefung.neue_zaehler+' Zähler / '+pruefung.neue_ablesungen+' Ablesungen.';result.append(el('p',{text:pruefung.ohne_uhrzeit+' Ablesungen ohne Uhrzeit. HP-Originale, Bemerkungen und ausgebaute Geräte bleiben erhalten.'}),...pruefung.hinweise.map(text=>el('p',{text})));take.disabled=false;}catch(e){status.textContent=e.message;}});
 dialog=modal({titel:'Zähler aus HausPerfekt übernehmen',wide:true,inhalt:el('div',{},[file,status,result]),footer:close=>[el('button',{text:'Abbrechen',onclick:close}),take]});
}
const zaehlerDatum=iso=>iso?new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(iso)):'–';
function zaehlerDialog(titel,groups,save){
 const f=formular(groups),error=el('p',{role:'alert'});let button;
 const dialog=modal({titel,wide:true,inhalt:el('div',{class:'cu-zaehler-dialog-inhalt'},[f.form,error]),footer:close=>[el('button',{text:'Abbrechen',onclick:close}),button=el('button',{class:'btn-primary',text:'Speichern',onclick:async()=>{if(!f.form.reportValidity())return;button.disabled=true;error.textContent='';try{await save(f.werte());close();}catch(e){error.textContent=e.message;button.disabled=false;}}})]});
 f.form.addEventListener('submit',e=>{e.preventDefault();button.click();});return{...f,...dialog};
}
const zaehlerStand=(v,unit)=>v==null?'–':String(v).replace('.',',')+' '+(unit==='m3'?'m³':unit||'');
async function zaehlerAdresse(a,zuordnungen){
 const lauf=S.lauf;
 try{
  const all=zuordnungen||await API.get('/adressen/'+a.id+'/zuordnungen'),active=all.filter(z=>z.aktiv&&!z.inaktiv),rows=active.length?active:all;
  const choices=new Map(),units=new Map();
  for(const z of rows){let oid=z.objekt_id;if(!oid&&z.einheit_id){if(!units.has(z.einheit_id))units.set(z.einheit_id,await API.get('/einheiten/'+z.einheit_id));oid=units.get(z.einheit_id).objekt_id;}if(!oid)continue;const key=oid+':'+(z.einheit_id||'');choices.set(key,{...z,objekt_id:oid});}
  if(lauf!==S.lauf)return;
  const list=[...choices.values()],open=z=>geheZu('#/zaehler/'+z.objekt_id+'?adresse='+a.id+(z.einheit_id?'&einheit='+z.einheit_id:''));
  if(!list.length){toast('Dieser Adresse ist noch kein Objekt und keine Wohnung zugeordnet.');return;}
  if(list.length===1){open(list[0]);return;}
  let dialog;const content=el('div',{},[el('p',{text:'Objekt oder Wohnung für die Zählerverwaltung wählen:'}),raster([{label:'Objekt',render:z=>UI.objektNummer(z.objekt_nummer||z.objekt_id)},{label:'Bezeichnung',render:z=>z.objekt_bezeichnung||z.objekt_strasse||''},{label:'Wohnung',render:z=>zaehlerWohnungsnummer(z.einheit_nummer)||'Gesamtobjekt'}],list,{onOpen:z=>{dialog.close();open(z);}})]);
  dialog=modal({titel:'Zähler · Objekt / Wohnung wählen',wide:true,inhalt:content,footer:close=>[el('button',{text:'Abbrechen',onclick:close})]});content.querySelector('tr.klick')?.focus();
 }catch(e){fehler(e);}
}
async function zaehlerMaske(oid,params=new URLSearchParams()){
 const lauf=S.lauf,root=el('section',{class:'cu-zaehler','aria-label':'Zählerverwaltung'});
 if(!arbeitsMaske(lauf,root,{titel:'Zählerverwaltung',aktionen:[]}))return;
 root.closest('.hp-maske')?.classList.add('cu-zaehler-fenster');
 try{
  const url='/objekte/'+oid+'/zaehler',[data,status,wohnungen]=await Promise.all([API.get(url),API.get(url+'/lobaro'),API.get('/objekte/'+oid+'/einheiten')]);if(lauf!==S.lauf)return;
  const o=data.objekt,write=darfSchreiben(),reload=()=>{if(S.lauf===lauf)zaehlerMaske(oid,params);};
  root.cuTitelSetzen('Zählerverwaltung · '+UI.objektNummer(o)+' · '+o.bezeichnung);
  const punktForm=p=>zaehlerDialog(p?'Zählpunkt bearbeiten':'Neuer Zählpunkt',[
   {grid:2,felder:[{name:'bezeichnung',label:'Bezeichnung / Einbauort',required:true,value:p?.bezeichnung},{name:'einheit_id',label:'Wohnung (leer = Gesamtobjekt)',type:'select',value:p?.einheit_id,options:[{value:'',label:'Gesamtobjekt'},...wohnungen.map(e=>({value:e.id,label:zaehlerWohnungsnummer(e.nummer)+' · '+e.bezeichnung}))]}]},
   {grid:2,felder:[{name:'medium',label:'Medium',type:'select',value:p?.medium||'kaltwasser',options:opt(ZAEHLER_MEDIEN)},{name:'art',label:'Art',type:'select',value:p?.art||'haupt',options:opt(ZAEHLER_ARTEN)}]},
   {felder:[{name:'marktlokation',label:'Marktlokationsnummer (MaLo-ID · Strom/Gas)',value:p?.marktlokation,hint:'Elf Ziffern. Bleibt bei einem Gerätewechsel am Zählpunkt erhalten; bei Wasser und Wärme leer lassen.'}]}
  ],async b=>{b.revision=p?.revision;await (p?API.put(url+'/punkte/'+p.id,b):API.post(url+'/punkte',b));reload();});
  let selected=null,readVersion=0;
  const search=el('input',{type:'search','aria-label':'Zähler suchen',placeholder:'Zählernummer, Einbauort oder MaLo-ID …'}),wohnung=el('select',{'aria-label':'Wohnung'},[el('option',{value:'',text:'Alle Wohnungen'}),...wohnungen.map(e=>el('option',{value:e.id,text:zaehlerWohnungsnummer(e.nummer)+' · '+(e.lage||e.bezeichnung)}))]);
  wohnung.value=params.get('einheit')||'';
  if(params.get('einheit')&&wohnung.value!==params.get('einheit'))throw new Error('Die vorausgewählte Wohnung gehört nicht zu diesem Objekt.');
  const expanded=el('input',{type:'checkbox',id:'zaehler-ausgebaut'}),list=el('div',{class:'cu-zaehler-liste'}),values=el('div',{class:'cu-zaehler-werte','aria-live':'polite'}),selectionInfo=el('span',{class:'cu-zaehler-auswahl',text:'Kein Zähler ausgewählt'});
  const edit=el('button',{text:'Zähler bearbeiten · F2',disabled:true,onclick:()=>selected?.z&&zaehlerGeraetForm(o,selected.p,selected.z,reload)});
  const addDevice=el('button',{text:'Gerät hinzufügen',disabled:true,onclick:()=>selected&&zaehlerGeraetForm(o,selected.p,null,reload)});
  const editPoint=el('button',{text:'Zählpunkt bearbeiten',disabled:true,onclick:()=>selected&&punktForm(selected.p)});
  const capture=()=>{if(!selected?.z||!write)return;const z=selected.z;zaehlerDialog('Stand erfassen · '+z.nummer,[{grid:2,felder:[{name:'zeitpunkt',label:'Messzeitpunkt',type:'datetime-local',required:true},{name:'wert',label:'Zählerstand · '+(z.einheit==='m3'?'m³':z.einheit),required:true}]}],async b=>{await API.post(url+'/geraete/'+z.id+'/messwerte',{...b,zeitpunkt:new Date(b.zeitpunkt).toISOString(),einheit:z.einheit});reload();});};
  const enter=el('button',{class:'btn-primary',text:'Daten erfassen',disabled:true,onclick:capture});
  const extra=el('details',{class:'cu-zaehler-weitere'},[el('summary',{text:'Weitere Funktionen'}),el('div',{},[write?addDevice:null,write?editPoint:null,write?el('button',{text:'HausPerfekt-Zähler übernehmen',onclick:()=>hpZaehlerImportDialog(oid,reload)}):null,S.benutzer.rolle==='admin'?el('button',{text:'Lobaro einrichten / prüfen',onclick:()=>lobaroDialog(oid,reload)}):null])]);
  S.kontext={typ:'zaehler',objekt:o,erstellen:write?()=>punktForm():undefined,bearbeiten:write?()=>edit.click():undefined};
  root.append(el('div',{class:'cu-zaehler-werkzeuge'},[search,wohnung,write?el('button',{text:'Neu · F4',onclick:()=>punktForm()}):null,el('button',{text:params.get('adresse')?'Zur Adresse':params.get('einheit')?'Zur Wohnung':'Zum Objekt',onclick:()=>geheZu(params.get('adresse')?'#/adressen/'+params.get('adresse'):params.get('einheit')?'#/einheiten/'+params.get('einheit'):'#/objekte/'+oid)})]),list,el('div',{class:'cu-zaehler-zwischenleiste'},[el('label',{for:'zaehler-ausgebaut'},[expanded,document.createTextNode(' Ausgebaute Zähler anzeigen')]),el('span',{class:'hp-spacer'}),write?edit:null,write?enter:null,extra]),el('div',{class:'cu-zaehler-ablesekopf'},[el('strong',{text:'Ablesungen'}),selectionInfo]),values,el('div',{class:'cu-zaehler-fuss'},[el('span',{text:'Objekt: '+UI.objektNummer(o)}),el('span',{class:'cu-zaehler-hinweis',text:status.token_vorhanden?'Lobaro-Zugang hinterlegt · Abruf über „Weitere Funktionen“':'Lobaro vorbereitet · Zugang fehlt'})]));
  function wertTabelle(rows){return raster([{label:'Wert',class:'zahl nowrap',render:r=>zaehlerStand(r.wert,r.einheit)},{label:'Ablesedatum',render:r=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short'}).format(new Date(r.zeitpunkt))},{label:'Ableseuhrzeit',render:r=>r.quelle==='hausperfekt'?(r.ableseuhrzeit||'–'):new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',timeStyle:'short'}).format(new Date(r.zeitpunkt))},{label:'Info',render:r=>r.info||'–'},{label:'Überlauf',render:r=>r.ueberlauf==='1'?'Ja':r.ueberlauf==='0'?'Nein':'–'},{label:'erfasst',render:r=>r.erfasst_sb||'–'},{label:'Quelle',render:r=>r.quelle==='hausperfekt'?'HausPerfekt':r.quelle==='lobaro'?'Lobaro':'Manuell'}],rows,{leer:selected?.z?'Keine Ablesungen vorhanden.':'Zähler oben auswählen.',mindestZeilen:rows.length?5:0});}
  async function auswaehlen(row,tr){
   selected=row;const version=++readVersion;
   for(const r of list.querySelectorAll('tbody tr.klick')){const yes=r===tr;r.classList.toggle('ausgewaehlt',yes);r.setAttribute('aria-selected',String(yes));}
   edit.disabled=!row?.z;enter.disabled=!row?.z;addDevice.disabled=!row;editPoint.disabled=!row;
   selectionInfo.textContent=row?.z?row.z.nummer+' · '+row.p.bezeichnung:row?'Zählpunkt ohne Gerät':'Kein Zähler ausgewählt';
   if(!row?.z){values.replaceChildren(wertTabelle([]));return;}
   values.replaceChildren(el('p',{role:'status',text:'Ablesungen werden geladen …'}));
   try{const readings=await API.get(url+'/geraete/'+row.z.id+'/messwerte');if(version!==readVersion||lauf!==S.lauf||!root.isConnected)return;values.replaceChildren(wertTabelle(readings));}catch(e){if(version===readVersion&&lauf===S.lauf)values.replaceChildren(el('p',{role:'alert',text:e.message}));}
  }
  function zeichnen(){
   const q=search.value.trim().toLocaleLowerCase('de'),heute=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',dateStyle:'short'}).format(new Date()),rows=[];
   for(const p of data.punkte){if(wohnung.value&&String(p.einheit_id)!==wohnung.value)continue;for(const z of p.zaehler.length?p.zaehler:[null]){if(!expanded.checked&&z?.ausgebaut_am&&z.ausgebaut_am<=heute)continue;if(![p.bezeichnung,zaehlerWohnungsnummer(p.wohnung),p.wohnung,p.marktlokation,z?.nummer].join(' ').toLocaleLowerCase('de').includes(q))continue;rows.push({p,z});}}
   const previous=selected;
   list.replaceChildren(raster([{label:'Zählernummer',render:r=>r.z?el('button',{class:'cu-zaehler-nummer',text:r.z.nummer,onclick:e=>auswaehlen(r,e.currentTarget.closest('tr'))}):'Noch kein Gerät'},{label:'Wohnung',render:r=>zaehlerWohnungsnummer(r.p.wohnung)||'–'},{label:'Wohnungslage',render:r=>wohnungen.find(e=>e.id===r.p.einheit_id)?.lage||wohnungen.find(e=>e.id===r.p.einheit_id)?.bezeichnung||'–'},{label:'Gerät',render:r=>r.z?.hp_geraeteart||({kaltwasser:'KWZ',warmwasser:'WWZ',waerme:'WMZ'})[r.p.medium]||ZAEHLER_MEDIEN[r.p.medium]},{label:'Einbaudat.',render:r=>r.z?datum(r.z.eingebaut_am):'–'},{label:'Einbauort / Zählpunkt',render:r=>r.p.bezeichnung},{label:'Letzter Stand',class:'nowrap',render:r=>r.z?zaehlerStand(r.z.letzter_wert,r.z.einheit):'–'},{label:'MaLo-ID',render:r=>r.p.marktlokation||'–'}],rows,{leer:q?'Keine passenden Zähler gefunden.':'Keine Zähler in dieser Auswahl. Vorhandene HP-Zähler sind noch abzugleichen.',mindestZeilen:rows.length?6:0,onOpen:()=>{}}));
   list.querySelector('table').setAttribute('aria-label','Zählerliste');const trs=[...list.querySelectorAll('tbody tr.klick')];
   trs.forEach((tr,i)=>{tr.addEventListener('click',ev=>{if(!ev.target.closest('button'))auswaehlen(rows[i],tr);});tr.addEventListener('keydown',ev=>{if(['ArrowDown','ArrowUp','Home','End'].includes(ev.key)){ev.preventDefault();const next=ev.key==='Home'?0:ev.key==='End'?trs.length-1:Math.max(0,Math.min(trs.length-1,i+(ev.key==='ArrowDown'?1:-1)));auswaehlen(rows[next],trs[next]);trs[next].focus();}else if(ev.key==='Enter'){ev.preventDefault();auswaehlen(rows[i],tr);capture();}});});
   const selectedIndex=rows.findIndex(r=>r.p.id===previous?.p.id&&r.z?.id===previous?.z?.id),index=selectedIndex<0?0:selectedIndex;auswaehlen(rows[index]||null,trs[index]);
  }search.addEventListener('input',zeichnen);wohnung.addEventListener('change',zeichnen);expanded.addEventListener('change',zeichnen);zeichnen();
 }catch(e){if(lauf===S.lauf)root.replaceChildren(el('p',{role:'alert',text:e.message}));}
}
function zaehlerGeraetForm(o,p,z,reload){
 const f=zaehlerDialog(z?'Zähler bearbeiten / Ausbau erfassen':'Zähler hinzufügen',[
  {grid:2,felder:[{name:'nummer',label:'Zählernummer',required:true,value:z?.nummer},{name:'einheit',label:'Messeinheit',type:'select',value:z?.einheit||(['kaltwasser','warmwasser','gas'].includes(p.medium)?'m3':p.medium==='heizkostenverteiler'?'HKV':'kWh'),options:['kWh','MWh','m3','GJ','HKV'].map(v=>({value:v,label:v==='m3'?'m³':v}))}]},
  {grid:2,felder:[{name:'eingebaut_am',label:'Eingebaut am',type:'date',required:true,value:z?.eingebaut_am},{name:'ausgebaut_am',label:'Ausgebaut am',type:'date',value:z?.ausgebaut_am}]},
  {grid:2,felder:[{name:'lobaro_geraet',label:'Lobaro-Geräte-ID (optional)',value:z?.lobaro_geraet},{name:'wert_pfad',label:'Lobaro-Feld für den Zählerstand',value:z?.wert_pfad}]},
  {grid:2,felder:[{name:'zeit_pfad',label:'Lobaro-Feld für den Messzeitpunkt',value:z?.zeit_pfad||'time'},{name:'einheit_pfad',label:'Lobaro-Feld für die Einheit (optional)',value:z?.einheit_pfad}]},
  {grid:2,felder:[{name:'kennung_pfad',label:'Feld für die Zählerkennung (bei gemeinsamem Gateway)',value:z?.kennung_pfad},{name:'kennung_wert',label:'Erwartete Zählerkennung',value:z?.kennung_wert}]}
 ],async b=>{b.revision=z?.revision;const u='/objekte/'+o.id+'/zaehler/punkte/'+p.id+'/geraete';await(z?API.put(u+'/'+z.id,b):API.post(u,b));reload();});
 const details=el('details',{},[el('summary',{text:'Lobaro-Zuordnung (optional)'})]);[...f.form.children].slice(2).forEach(e=>details.appendChild(e));f.form.appendChild(details);
 details.append(el('p',{class:'small muted',text:'Geräte-ID und Feldnamen erst nach Prüfung echter Lobaro-Daten eintragen. Bei mehreren Zählern an einem Gateway ist die eindeutige Zählerkennung erforderlich.'}));
}
async function zaehlerMesswerte(o,z,reload){
 try{const url='/objekte/'+o.id+'/zaehler/geraete/'+z.id+'/messwerte',rows=await API.get(url),body=el('div',{},[el('p',{text:'Zähler '+z.nummer+' · neueste 500 Messwerte'}),raster([{label:'Messzeitpunkt',render:r=>zaehlerDatum(r.zeitpunkt)},{label:'Stand',render:r=>r.wert+' '+r.einheit},{label:'Info',render:r=>r.info||'–'},{label:'Überlauf',render:r=>r.ueberlauf==='1'?'Ja':r.ueberlauf==='0'?'Nein':'–'},{label:'erfasst',render:r=>r.erfasst_sb||'–'},{label:'Quelle',render:r=>r.quelle==='hausperfekt'?'HausPerfekt':r.quelle==='lobaro'?'Lobaro':'Manuell'}],rows,{leer:'Noch keine Messwerte. Fehlende Werte werden nicht als null gewertet.'})]);
  modal({titel:'Messwerte · '+z.nummer,wide:true,inhalt:body,footer:close=>[el('button',{text:'Schließen',onclick:close}),darfSchreiben()?el('button',{class:'btn-primary',text:'Stand erfassen',onclick:()=>{close();zaehlerDialog('Stand erfassen · '+z.nummer,[{grid:2,felder:[{name:'zeitpunkt',label:'Messzeitpunkt',type:'datetime-local',required:true},{name:'wert',label:'Zählerstand · '+z.einheit,required:true}]}],async b=>{await API.post(url,{...b,zeitpunkt:new Date(b.zeitpunkt).toISOString(),einheit:z.einheit});reload();});}}):null]});
 }catch(e){fehler(e);}
}
async function lobaroDialog(oid,reload){
 try{const url='/objekte/'+oid+'/zaehler/lobaro';let status=await API.get(url);const f=formular([{felder:[{name:'token',label:'Lobaro-API-Token',type:'password',hint:status.token_vorhanden?'Zugang ist verschlüsselt gespeichert. Zum Ersetzen neuen Token eingeben.':'Token wird nur auf dem Server verschlüsselt gespeichert.'}]},{grid:2,felder:[{name:'von',label:'Messwerte von',type:'date'},{name:'bis',label:'Messwerte bis',type:'date'}]}]);f.inputs.token.autocomplete='new-password';
  const info=el('p',{role:'status',text:status.status}),result=el('div'),error=el('p',{role:'alert'});let importButton,preview=null;
  async function busy(fn,button){button.disabled=true;error.textContent='';try{await fn();}catch(e){error.textContent=e.message;}finally{button.disabled=button===importButton?!(preview?.id&&preview?.neu):false;}}
  const speichern=el('button',{text:'Zugang speichern',onclick:()=>busy(async()=>{status=await API.put(url,{revision:status.revision,token:f.inputs.token.value});f.inputs.token.value='';preview=null;result.replaceChildren();importButton.disabled=true;info.textContent=status.status;},speichern)});
  const devices=el('button',{text:'Geräte lesend prüfen',onclick:()=>busy(async()=>{preview=null;importButton.disabled=true;const rows=await API.post(url+'/geraete',{});result.replaceChildren(raster([{label:'Geräte-ID',render:r=>r.id},{label:'Name',render:r=>r.name},{label:'Seriennummer',render:r=>r.seriennummer},{label:'Adresse',render:r=>r.adresse}],rows,{leer:'Keine freigegebenen Geräte gefunden.'}));info.textContent=rows.length+' freigegebene Geräte gefunden. Bitte nur die Geräte des richtigen Objekts zuordnen.';},devices)});
  const abruf=el('button',{text:'Messwerte als Vorschau abrufen',onclick:()=>busy(async()=>{preview=null;importButton.disabled=true;const p=await API.post(url+'/vorschau',{von:f.inputs.von.value,bis:f.inputs.bis.value});preview=p;result.replaceChildren(el('p',{text:p.neu+' neue Werte · '+p.bekannt+' bereits vorhanden · '+p.fehler.length+' Fehler · '+p.uebersprungen+' nicht im gewählten Bereich / Zähler'}),...p.fehler.map(e=>el('p',{role:'alert',text:e.zaehler+' / '+e.datensatz+': '+e.fehler})),raster([{label:'Zähler',render:r=>r.nummer},{label:'Messzeitpunkt',render:r=>zaehlerDatum(r.zeitpunkt)},{label:'Stand',render:r=>r.wert+' '+r.einheit},{label:'Prüfung',render:r=>r.bekannt?'Bereits vorhanden':'Neu'}],p.eintraege,{leer:'Keine passenden Messwerte.'}));importButton.disabled=!p.id||!p.neu;},abruf)});
  importButton=el('button',{class:'btn-primary',text:'Geprüfte Werte übernehmen',disabled:true,onclick:()=>busy(async()=>{if(!preview?.id)return;const r=await API.post(url+'/uebernehmen',{id:preview.id});preview=null;info.textContent=r.neu+' Werte übernommen; '+r.bekannt+' bereits vorhanden.';result.replaceChildren();reload();},importButton)});
  modal({titel:'Lobaro · objektbezogene Anbindung',wide:true,inhalt:el('div',{class:'cu-zaehler-dialog-inhalt'},[el('a',{href:'https://platform.lobaro.com/api#/devices/get_api_devices',target:'_blank',rel:'noopener',text:'Lobaro-Schnittstellenbeschreibung öffnen'}),info,f.form,el('div',{class:'tel-plaud-knoepfe'},[speichern,devices,abruf]),error,result]),footer:close=>[el('button',{text:'Schließen',onclick:close}),importButton]});
  f.form.addEventListener('submit',e=>e.preventDefault());
 }catch(e){fehler(e);}
}

