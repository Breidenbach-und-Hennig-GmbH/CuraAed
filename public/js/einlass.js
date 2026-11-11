'use strict';
function einlassReiter(id,ansicht){return el('nav',{class:'cu-einlass-reiter','aria-label':'Durchführung'},[['einlass','Einlass'],['live','TOPs & Abstimmung'],['protokoll','Protokoll']].map(([key,text])=>el('a',{href:'#/etv/'+id+'?schritt=durchfuehrung&ansicht='+key,text,class:key===ansicht?'aktiv':'','aria-current':key===ansicht?'page':null})));}
async function einlassMaske(id,{container,buehne=false}={}){
 const lauf=S.lauf;let s,mode='mea',busy=false,request=0;
 const stageTitle=el('h2',{text:'Anwesenheit'}),root=el('div'),message=el('p',{role:'alert',class:'cu-rechnung-fehler'}),chart=el('div'),status=el('div'),hint=el('div'),actions=el('div',{class:'cu-einlass-start'});
 container.replaceChildren(root);
 const fmt=x=>/^\d+$/.test(String(x))?BigInt(x).toLocaleString('de-DE'):String(x);
 const einheit=(n,dativ=false)=>mode==='koepfe'?(String(n)==='1'?'Kopf':dativ?'Köpfen':'Köpfe'):mode==='einheiten'?(String(n)==='1'?'Einheit':'Einheiten'):'MEA';
 const labels={mea:'MEA',koepfe:'Köpfe',einheiten:'Einheiten'},categories={praesenz:['Vor Ort / Handzeichen','#35852c'],online:['Online','#55b94b'],abwesend:['Abwesend','#d2d2d2'],gesperrt:['Gesperrt','#252525']};
 const summary=el('section',{class:'cu-karte cu-einlass-karte'},[el('h3',{text:'Anwesenheitsübersicht'})]),selection=el('fieldset',{class:'cu-einlass-auswahl','aria-label':'Anwesenheit anzeigen nach'});
 for(const key of Object.keys(labels)){const radio=el('input',{type:'radio',name:'einlass-ansicht-'+id,value:key,checked:key===mode,'aria-label':labels[key],title:key==='koepfe'?'Eigentümergruppen einschließlich ihrer Vertretung':labels[key],onchange:()=>{mode=key;zeichnenChart();}});selection.append(el('label',{},[radio,document.createTextNode(' '+labels[key])]));}
 summary.append(selection,chart);
 const refresh=el('button',{type:'button',text:'Anwesenheit aktualisieren',onclick:()=>laden().catch(e=>message.textContent=e.message)});
 async function laden(){const n=++request;const r=await API.get('/versammlungen/'+id+'/einlass');if(lauf!==S.lauf||!container.isConnected||n!==request)return;s=r;zeichnen();}
 function zeichnenChart(){
  if(!s)return;const u=s.uebersicht[mode],usable=u.verfuegbar,percent=usable?u.prozent.toLocaleString('de-DE',{maximumFractionDigits:2})+'%':'–';let pos=0;const stops=[];
  for(const key of ['praesenz','online','gesperrt','abwesend']){const end=pos+(usable?u.anteile[key]:0);stops.push(categories[key][1]+' '+pos+'% '+end+'%');pos=end;}
  const ring=el('div',{class:'cu-einlass-ring',role:'img','aria-label':usable?percent+' anwesend nach '+labels[mode]:'Anwesenheit nach '+labels[mode]+' nicht vollständig berechenbar',style:'background:'+(usable?'conic-gradient('+stops.join(',')+')':'#d2d2d2')},[el('div',{},[el('strong',{text:percent}),el('span',{text:'anwesend'})])]);
  chart.replaceChildren(ring,el('p',{class:'cu-einlass-summe',text:usable?'Anwesend: '+fmt(u.anwesend)+' '+einheit(u.anwesend)+' (von '+fmt(u.total)+' '+einheit(u.total,true)+')':'Keine vollständige Grundlage für '+labels[mode]+'.'}),el('div',{class:'cu-einlass-legende'},Object.entries(categories).map(([key,[label,color]])=>el('span',{},[el('i',{'aria-hidden':'true',style:'background:'+color}),document.createTextNode((usable?fmt(u.werte[key]):'–')+' '+einheit(u.werte[key])+' '+label)]))));
 }
 function zeichnen(){
  refresh.disabled=busy;const d=s.durchfuehrung,v=s.versammlung;stageTitle.textContent=v.name+' · '+datum(v.datum);
  status.replaceChildren(el('strong',{text:d?'Versammlung läuft':'Einlass'}),el('p',{text:d?'Gestartet am '+new Date(d.gestartet_am).toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'medium',timeStyle:'short'})+' Uhr · '+(d.gestartet_von||'Benutzer nicht mehr vorhanden'):'Der Einlass zählt noch nicht als Versammlungsstart. Erst „Versammlung starten“ protokolliert den tatsächlichen Beginn.'}));
  hint.replaceChildren(...s.hinweise.map(text=>el('p',{class:'cu-rechnung-fehler',text})));
  actions.replaceChildren(el('div',{},[el('span',{class:'small muted',text:'Geplanter Beginn'}),el('strong',{text:datum(v.datum)+' · '+(v.uhrzeit?v.uhrzeit+' Uhr':'Uhrzeit nicht erfasst')})]));
  if(d)actions.append(el('a',{href:'#/etv/'+id+'?schritt=durchfuehrung&ansicht=live',class:'button btn-primary',text:'Zur Durchführung und Abstimmung'}));
  else actions.append(el('button',{type:'button',class:'btn-primary',text:'Versammlung starten',disabled:busy||!darfSchreiben()||!s.start_moeglich,onclick:async()=>{
   if(busy||!darfSchreiben())return;busy=true;request++;zeichnen();message.textContent='';
   try{const r=await API.post('/versammlungen/'+id+'/starten',{basis_hash:s.basis_hash,teilnahme_revision:s.teilnahme_revision});if(lauf!==S.lauf||!container.isConnected)return;s=r;toast('Versammlung gestartet. Der Beginn wurde protokolliert.','success');}
   catch(e){message.textContent=e.message;await laden().catch(()=>{});}finally{busy=false;if(lauf===S.lauf&&container.isConnected)zeichnen();}
  }}));
  zeichnenChart();
 }
 if(buehne){root.className='cu-einlass-buehne';const stageTop=el('section');root.append(stageTitle,stageTop,status,summary,refresh,message,el('a',{href:'#/etv/'+id+'?schritt=durchfuehrung',text:'Zurück zum Einlass'}));}
 else{
  const info=el('section',{class:'cu-karte cu-einlass-karte'},[el('h3',{text:'Information'}),status,el('h3',{text:'Checkliste vor der Versammlung'}),el('ol',{class:'cu-einlass-checkliste'},[
   el('li',{},[el('a',{href:'#/etv/'+id+'?schritt=durchfuehrung&ansicht=buehne',target:'_blank',rel:'noopener',text:'Bühnenansicht öffnen'}),el('p',{text:'Zeigen Sie die Anwesenheitsübersicht auf einem Bildschirm oder Beamer. Persönliche Eigentümerdaten werden dort nicht angezeigt.'})]),
   el('li',{},[el('a',{href:'#/etv/'+id+'?schritt=teilnehmer',text:'Vollmachten und Vertreter eintragen'}),el('p',{text:'Unter Teilnehmer erfassen und speichern Sie Anwesenheit, Vollmachten und bevollmächtigte Personen.'})]),
   el('li',{},[el('a',{href:'#/etv/'+id+'?schritt=teilnehmer',text:'Teilnahme vor Ort oder online markieren'}),el('p',{text:'Ordnen Sie den Teilnahmeweg zu. Bei einer Einlasssperre wird die betreffende Gruppe getrennt ausgewiesen.'})])
  ]),el('p',{class:'small muted',text:'Anwesenheit und Vollmachten können während der gesamten Versammlung nachgetragen und geändert werden. Die Übersicht aktualisiert sich alle 15 Sekunden.'}),hint]);
  root.append(einlassReiter(id,'einlass'),el('a',{href:'#/etv/'+id+'?schritt=durchfuehrung&ansicht=live',class:'button',text:'QR-Zugang, Teams und Live-Abstimmung'}),el('h2',{text:'Einlass'}),el('div',{class:'cu-einlass-grid'},[info,el('div',{class:'cu-einlass-rechts'},[summary,refresh,actions])]),message);
 }
 await laden();if(buehne&&typeof liveBuehneBox==='function'){const host=root.querySelector('section');if(host)liveBuehneBox(id,host).catch(()=>{});}
 const timer=window.setInterval(()=>{if(!container.isConnected||lauf!==S.lauf)window.clearInterval(timer);else if(!busy)laden().catch(e=>message.textContent=e.message);},15000);
}
