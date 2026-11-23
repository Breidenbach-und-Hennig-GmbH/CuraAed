'use strict';
const ZAEHLER_MEDIEN={strom:'Strom',gas:'Gas',kaltwasser:'Kaltwasser',warmwasser:'Warmwasser',waerme:'Wärme',heizkostenverteiler:'Heizkostenverteiler'};
const ZAEHLER_ARTEN={haupt:'Hauptzähler',wohnung:'Wohnungszähler',unter:'Unterzähler'};
const zaehlerDatum=iso=>iso?new Intl.DateTimeFormat('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(iso)):'–';
function zaehlerDialog(titel,groups,save){
 const f=formular(groups),error=el('p',{role:'alert'});let button;
 const dialog=modal({titel,wide:true,inhalt:el('div',{},[f.form,error]),footer:close=>[el('button',{text:'Abbrechen',onclick:close}),button=el('button',{class:'btn-primary',text:'Speichern',onclick:async()=>{if(!f.form.reportValidity())return;button.disabled=true;error.textContent='';try{await save(f.werte());close();}catch(e){error.textContent=e.message;button.disabled=false;}}})]});
 f.form.addEventListener('submit',e=>{e.preventDefault();button.click();});return{...f,...dialog};
}
async function zaehlerMaske(oid){
 const lauf=S.lauf,root=el('section',{class:'cu-zaehler','aria-label':'Zählerverwaltung'});
 if(!arbeitsMaske(lauf,root,{titel:'Zählerverwaltung',aktionen:[{text:'Zum Objekt',onclick:()=>geheZu('#/objekte/'+oid)}]}))return;
 try{
  const url='/objekte/'+oid+'/zaehler',[data,status,wohnungen]=await Promise.all([API.get(url),API.get(url+'/lobaro'),API.get('/objekte/'+oid+'/einheiten')]);if(lauf!==S.lauf)return;
  const o=data.objekt,write=darfSchreiben(),reload=()=>{if(S.lauf===lauf)zaehlerMaske(oid);};
  root.cuTitelSetzen('Zähler · '+o.nummer+' · '+o.bezeichnung);
  const punktForm=p=>zaehlerDialog(p?'Zählpunkt bearbeiten':'Neuer Zählpunkt',[
   {grid:2,felder:[{name:'bezeichnung',label:'Bezeichnung / Einbauort',required:true,value:p?.bezeichnung},{name:'einheit_id',label:'Wohnung (leer = Gesamtobjekt)',type:'select',value:p?.einheit_id,options:[{value:'',label:'Gesamtobjekt'},...wohnungen.map(e=>({value:e.id,label:e.nummer+' · '+e.bezeichnung}))]}]},
   {grid:2,felder:[{name:'medium',label:'Medium',type:'select',value:p?.medium||'kaltwasser',options:opt(ZAEHLER_MEDIEN)},{name:'art',label:'Art',type:'select',value:p?.art||'haupt',options:opt(ZAEHLER_ARTEN)}]},
   {felder:[{name:'marktlokation',label:'Marktlokationsnummer (MaLo-ID · Strom/Gas)',value:p?.marktlokation,hint:'Elf Ziffern. Bleibt bei einem Gerätewechsel am Zählpunkt erhalten; bei Wasser und Wärme leer lassen.'}]}
  ],async b=>{b.revision=p?.revision;await (p?API.put(url+'/punkte/'+p.id,b):API.post(url+'/punkte',b));reload();});
  S.kontext={typ:'zaehler',objekt:o,erstellen:write?()=>punktForm():undefined};
  const search=el('input',{type:'search','aria-label':'Zähler suchen',placeholder:'Zählernummer, Zählpunkt, Wohnung oder MaLo-ID …'}),list=el('div');
  root.append(el('div',{class:'hp-filter'},[search,write?el('button',{class:'btn-primary',text:'Zählpunkt anlegen · F4',onclick:()=>punktForm()}):null,S.benutzer.rolle==='admin'?el('button',{text:'Lobaro einrichten / prüfen',onclick:()=>lobaroDialog(oid,reload)}):null]),el('p',{class:'small muted',text:status.status+'. Automatische Übernahme ist noch nicht eingeschaltet.'}),list);
  function zeichnen(){
   const q=search.value.trim().toLocaleLowerCase('de'),points=data.punkte.filter(p=>[p.bezeichnung,p.wohnung,p.marktlokation,...p.zaehler.map(z=>z.nummer)].join(' ').toLocaleLowerCase('de').includes(q));list.replaceChildren();
   if(!points.length)list.append(el('p',{text:q?'Keine passenden Zähler gefunden.':'Noch keine Zählpunkte vorhanden. Bestehende HP-Zähler wurden hier noch nicht übernommen.'}));
   for(const p of points){const controls=el('div',{class:'tel-plaud-knoepfe'},[write?el('button',{text:'Zählpunkt bearbeiten',onclick:()=>punktForm(p)}):null,write?el('button',{text:'Gerät hinzufügen',onclick:()=>zaehlerGeraetForm(o,p,null,reload)}):null]);
    list.append(el('section',{class:'cu-karte cu-zaehlpunkt'},[el('h2',{text:p.bezeichnung}),el('p',{text:ZAEHLER_MEDIEN[p.medium]+' · '+ZAEHLER_ARTEN[p.art]+' · '+(p.wohnung?'Wohnung '+p.wohnung:'Gesamtobjekt')+(p.marktlokation?' · MaLo-ID '+p.marktlokation:'')}),controls,raster([
     {label:'Zählernummer',render:z=>el('button',{text:z.nummer,onclick:()=>zaehlerMesswerte(o,z,reload)})},
     {label:'Einbau',render:z=>datum(z.eingebaut_am)},{label:'Ausbau',render:z=>z.ausgebaut_am?datum(z.ausgebaut_am):'Eingebaut'},
     {label:'Letzter Stand',render:z=>z.letzter_wert==null?'Kein Messwert':z.letzter_wert+' '+z.einheit},
     {label:'Messzeitpunkt',render:z=>zaehlerDatum(z.letzter_zeitpunkt)},
     {label:'Lobaro',render:z=>z.lobaro_geraet?'Gerät '+z.lobaro_geraet:'Nicht zugeordnet'},
     {label:'',render:z=>write?el('button',{text:'Bearbeiten',onclick:()=>zaehlerGeraetForm(o,p,z,reload)}):''}
    ],p.zaehler,{leer:'Noch kein Gerät angelegt.'})]));}
  }search.addEventListener('input',zeichnen);zeichnen();
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
 try{const url='/objekte/'+o.id+'/zaehler/geraete/'+z.id+'/messwerte',rows=await API.get(url),body=el('div',{},[el('p',{text:'Zähler '+z.nummer+' · neueste 500 Messwerte'}),raster([{label:'Messzeitpunkt',render:r=>zaehlerDatum(r.zeitpunkt)},{label:'Stand',render:r=>r.wert+' '+r.einheit},{label:'Quelle',render:r=>r.quelle==='lobaro'?'Lobaro':'Manuell'}],rows,{leer:'Noch keine Messwerte. Fehlende Werte werden nicht als null gewertet.'})]);
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
  modal({titel:'Lobaro · objektbezogene Anbindung',wide:true,inhalt:el('div',{},[el('a',{href:'https://platform.lobaro.com/api#/devices/get_api_devices',target:'_blank',rel:'noopener',text:'Lobaro-Schnittstellenbeschreibung öffnen'}),info,f.form,el('div',{class:'tel-plaud-knoepfe'},[speichern,devices,abruf]),error,result]),footer:close=>[el('button',{text:'Schließen',onclick:close}),importButton]});
  f.form.addEventListener('submit',e=>e.preventDefault());
 }catch(e){fehler(e);}
}
