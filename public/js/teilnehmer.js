'use strict';
async function teilnehmerDialog(vid,{container=null}={}){
 const url='/versammlungen/'+vid+'/teilnehmer';let s=await API.get(url),rows=[],busy=false,closed=false,save;
 const content=el('div'),error=el('p',{role:'alert',class:'cu-rechnung-fehler'}),status=el('p',{role:'status',class:'small muted'}),suche=el('input',{type:'search','aria-label':'Teilnehmer durchsuchen',placeholder:'Eigentümer, Einheit oder bevollmächtigte Person suchen …'});
 let fieldset,summary;
 const m=(container?options=>etvInlineFenster(container,options):modal)({titel:'Teilnehmerliste · '+s.versammlung.name,inhalt:content,wide:true,onClose:()=>{closed=true;},footer:close=>[
  el('button',{type:'button',text:'Schließen',onclick:close}),save=el('button',{type:'button',text:'Teilnehmerliste speichern',class:'btn-primary',disabled:!darfSchreiben(),onclick:speichern})
 ]});
 function daten(){return rows.map(r=>({key:r.g.key,teilnahme:r.teilnahme.value,kanal:r.kanal.value,zugang_gesperrt:r.gesperrt.checked,vertreter:r.vertreter.value,nachweis:r.nachweis.value,vollmacht_textform:r.textform.checked,anwesende_eigentuemer:r.personen.filter(p=>p.input.checked).map(p=>p.id)}));}
 function zusammenfassung(){
  const d=daten(),personal=new Set(d.flatMap(r=>r.anwesende_eigentuemer));summary.textContent=s.register.gruppen.length+' Eigentümergruppe(n) · selbst: '+d.filter(r=>r.teilnahme==='selbst').length+' · per Vollmacht: '+d.filter(r=>r.teilnahme==='vollmacht').length+' · nicht teilgenommen: '+d.filter(r=>r.teilnahme==='abwesend').length+' · persönlich anwesende Eigentümer: '+personal.size;
  const q=suche.value.trim().toLocaleLowerCase('de');for(const r of rows)r.card.style.display=(!q||[r.g.name,...r.g.einheiten.map(u=>u.nummer+' '+u.bezeichnung),r.vertreter.value].join(' ').toLocaleLowerCase('de').includes(q))?'':'none';
 }
 function zeichnen(){
  rows=[];content.replaceChildren();const v=s.versammlung;
  content.append(el('p',{text:'Objekt '+v.objekt_nummer+' · '+v.objekt_bezeichnung+' · '+datum(v.datum)}),el('p',{class:'small muted',text:'Eigentümer werden aus den Einheitenzuordnungen zum Versammlungsdatum übernommen. Identische Eigentümergruppen über mehrere Einheiten erscheinen einmal. Gemeinsame Eigentümer üben ihr Stimmrecht einheitlich aus.'}),
   el('p',{class:'small muted',text:s.teilnahme.revision?'Gespeicherter Stand: Version '+s.teilnahme.revision+' · '+s.teilnahme.geaendert_am+' · '+s.teilnahme.benutzer:'Noch keine Teilnehmerliste gespeichert.'}));
  if(s.historisch)content.append(el('p',{role:'alert',class:'cu-rechnung-fehler',text:'Der Eigentümerstand oder das Versammlungsdatum wurde geändert. Bitte alle Teilnehmer und Vollmachten neu prüfen und die Liste speichern.'}));
  if(s.register.hinweise.length)content.append(el('ul',{class:'cu-rechnung-fehler'},s.register.hinweise.map(text=>el('li',{text}))),el('p',{text:'Fehlende Zuordnungen bitte in den Einheiten / Personenfunktionen ergänzen. Die vorhandenen Teilnehmer können bereits erfasst werden.'}));
  if(s.register.meaHinweise.length)content.append(el('details',{},[el('summary',{text:'Hinweise zu fehlenden MEA'}),el('ul',{},s.register.meaHinweise.map(text=>el('li',{text})))]));
  summary=el('p',{role:'status'});content.append(suche,summary);
  fieldset=el('fieldset',{'aria-label':'Teilnehmer und Vollmachten',disabled:!darfSchreiben(),style:'border:0;padding:0;margin:0'});
  for(const g of s.register.gruppen){
   const a=s.teilnahme.daten[g.key]||{},r={g,personen:[]},select=el('select',{'aria-label':'Teilnahme · '+g.name},[['abwesend','Nicht teilgenommen'],['selbst','Selbst anwesend'],['vollmacht','Durch Vollmacht vertreten']].map(([value,text])=>el('option',{value,text})));select.value=a.teilnahme||'abwesend';r.teilnahme=select;
   r.kanal=el('select',{'aria-label':'Teilnahmeweg · '+g.name},[['praesenz','Vor Ort / Handzeichen'],['online','Online']].map(([value,text])=>el('option',{value,text})));r.kanal.value=a.kanal||'praesenz';
   r.gesperrt=el('input',{type:'checkbox',checked:a.zugang_gesperrt===true,'aria-label':'Für den Einlass gesperrt · '+g.name});
   r.gesperrt.addEventListener('change',()=>{if(r.gesperrt.checked){select.value='abwesend';select.dispatchEvent(new Event('change'));}zusammenfassung();});
   r.vertreter=el('input',{type:'text','aria-label':'Bevollmächtigte Person · '+g.name,value:a.vertreter||'',maxlength:200});
   r.nachweis=el('input',{type:'text','aria-label':'Vollmachtsnachweis · '+g.name,value:a.nachweis||'',maxlength:500,placeholder:'z. B. Dokumentnummer oder Fundstelle'});
   r.textform=el('input',{type:'checkbox','aria-label':'Vollmacht in Textform geprüft · '+g.name,checked:!!a.vollmacht_textform});
   const proxy=el('div',{},[el('label',{},[document.createTextNode('Bevollmächtigte Person'),r.vertreter]),el('label',{},[document.createTextNode('Nachweis der Vollmacht'),r.nachweis]),el('label',{class:'check-inline'},[r.textform,document.createTextNode(' Vollmacht in Textform geprüft')])]);
   const people=el('div',{},[el('p',{class:'small muted',text:'Persönlich anwesende Eigentümer (zusätzlich zur einheitlichen Vertretung der Gruppe):'})]);
   for(const o of g.eigentumer){const checked=(a.anwesende_eigentuemer||[]).includes(o.id)||(a.teilnahme==='selbst'&&g.eigentumer.length===1),input=el('input',{type:'checkbox','aria-label':'Persönlich anwesend · '+o.name+' · '+g.key,checked});r.personen.push({id:o.id,input});people.append(el('label',{class:'check-inline'},[input,document.createTextNode(' '+o.name)]));input.addEventListener('change',()=>{if(input.checked&&select.value==='abwesend')select.value='selbst';aktualisieren();});}
   const card=el('section',{class:'cu-karte',style:'padding:14px;margin:12px 0'},[el('h3',{text:g.name}),el('p',{class:'small muted',text:g.einheiten.map(u=>(u.nummer||u.bezeichnung)+(u.mea?' · MEA '+u.mea:'')).join(' / ')}),el('label',{},[document.createTextNode('Teilnahme / Vertretung'),select]),el('label',{},[document.createTextNode('Teilnahmeweg'),r.kanal]),el('label',{class:'check-inline'},[r.gesperrt,document.createTextNode(' Für den Einlass gesperrt')]),people,proxy]);r.card=card;
   function aktualisieren(){if(select.value!=='abwesend')r.gesperrt.checked=false;r.kanal.disabled=select.value==='abwesend';proxy.style.display=select.value==='vollmacht'?'':'none';zusammenfassung();}
   select.addEventListener('change',()=>{if(select.value==='abwesend')for(const p of r.personen)p.input.checked=false;if(select.value==='selbst'&&r.personen.length===1)r.personen[0].input.checked=true;aktualisieren();});
   for(const i of [r.vertreter,r.nachweis,r.textform])i.addEventListener('input',zusammenfassung);
   rows.push(r);fieldset.append(card);proxy.style.display=select.value==='vollmacht'?'':'none';r.kanal.disabled=select.value==='abwesend';
  }
  if(!rows.length)fieldset.append(el('p',{text:'Noch keine Eigentümergruppen vorhanden. Bitte zuerst die Eigentümer den Einheiten dieses Objekts zuordnen.'}));
  content.append(fieldset,error,status,el('a',{href:'/api'+url+'.txt',download:'',class:'button',text:'Gespeicherte Teilnehmerliste herunterladen'}),el('p',{class:'small muted',text:'Anwesenheit und Vollmachten bleiben für die Durchführung dieser Versammlung gespeichert.'}));zusammenfassung();
  if(container)etvMerkeStand(container.closest('.cu-etv-inhalt')||container);
 }
 async function speichern(){
  if(busy||!darfSchreiben())return;busy=true;save.disabled=true;fieldset.disabled=true;error.textContent='';
  try{await API.put(url,{revision:s.teilnahme.revision,basis_hash:s.register.basis_hash,teilnehmer:daten()});s=await API.get(url);if(!closed){zeichnen();status.textContent='Teilnehmerliste gespeichert.';toast('Teilnehmerliste gespeichert','success');}}
  catch(e){if(!closed)error.textContent=e.message;}finally{busy=false;if(!closed){save.disabled=!darfSchreiben();fieldset.disabled=!darfSchreiben();}}
 }
 suche.addEventListener('input',zusammenfassung);zeichnen();
}
