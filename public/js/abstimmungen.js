'use strict';
function stimmSummen(zeilen){return el('dl',{style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:16px 0'},zeilen.map(([label,value])=>el('div',{style:'padding:10px;border:1px solid var(--border,#e5e5ee);border-radius:8px'},[el('dt',{class:'small muted',text:label}),el('dd',{style:'font-size:22px;font-weight:600;margin:4px 0 0',text:value})])));}
const STIMM_PRINZIP={kopf:'Köpfe',mea:'Miteigentumsanteile (MEA)',einheiten:'Einheiten'};
function stimmForm(gruppen,prefix){
 const u=formular(gruppen);
 for(const [k,i] of Object.entries(u.inputs)){const l=u.form.querySelector('label[for="'+i.id+'"]');i.id=prefix+k;if(l)l.htmlFor=i.id;}
 return u;
}
async function objektStimmprinzipDialog(id,danach){
 const r=await API.get('/objekte/'+id+'/stimmprinzip'),u=stimmForm([{felder:[{name:'prinzip',label:'Stimmprinzip',type:'select',value:r.daten.prinzip,options:Object.entries(STIMM_PRINZIP).map(([value,label])=>({value,label}))}]},{felder:[{name:'grundlage',label:'Grundlage / Fundstelle der Gemeinschaftsordnung',type:'textarea',value:r.daten.grundlage}]}],'stimmobjekt-');
 u.inputs.grundlage.maxLength=2000;
 const checked=el('input',{type:'checkbox',checked:r.daten.geprueft,'aria-label':'Gemeinschaftsordnung und Stimmprinzip geprüft'}),error=el('p',{role:'alert',class:'cu-rechnung-fehler'});
 u.form.append(el('label',{class:'check-inline'},[checked,document.createTextNode(' Gemeinschaftsordnung und Stimmprinzip geprüft')]),el('p',{class:'small muted',text:'Gesetzlicher Ausgangspunkt: Kopfprinzip. Eine abweichende Gemeinschaftsordnung muss für dieses Objekt geprüft werden.'}),error);
 let busy=false,save;
 const m=modal({titel:'Stimmprinzip des Objekts',inhalt:u.form,wide:true,footer:close=>[el('button',{text:'Abbrechen',onclick:close}),save=el('button',{text:'Stimmprinzip speichern',class:'btn-primary',disabled:!darfSchreiben(),onclick:async()=>{
  if(busy||!u.form.reportValidity())return;busy=true;save.disabled=true;
  try{await API.put('/objekte/'+id+'/stimmprinzip',{revision:r.revision,daten:{...u.werte(),geprueft:checked.checked}});close();toast('Stimmprinzip gespeichert','success');if(danach)await danach();}
  catch(e){error.textContent=e.message;}finally{busy=false;save.disabled=false;}
 }})]});u.form.addEventListener('submit',e=>e.preventDefault());
}
async function abstimmungDialog(vid,tid){
 const url='/versammlungen/'+vid+'/tops/'+tid;
 let s=await API.get(url+'/abstimmung'),closed=false,busy=false,request=0,rows=[],entwurf=null,regelGeaendert=false;
 const content=el('div'),error=el('p',{role:'alert',class:'cu-rechnung-fehler'}),preview=el('section',{class:'cu-karte',style:'padding:14px;margin:12px 0','aria-label':'Aktuelle Auszählung'}),history=el('div');let checked,fieldset,save,countButton;
 const m=modal({titel:'Mehrheit und Abstimmung · TOP '+s.top.position+' · '+s.top.titel,inhalt:content,wide:true,onClose:()=>{closed=true;request++;},footer:close=>[
  el('button',{text:'Schließen',onclick:close}),
  countButton=el('button',{text:'Auszählen',disabled:!darfSchreiben(),onclick:()=>rechnen(false)}),
  save=el('button',{text:'Auszählung speichern',class:'btn-primary',disabled:!darfSchreiben(),onclick:()=>rechnen(true)})
 ]});
 function stimmen(){return rows.map(row=>({key:row.key,teilnahme:row.teilnahme.value,stimme:row.stimme.value,ausgeschlossen:row.ausgeschlossen.checked,vertreter:row.vertreter.value,nachweis:row.nachweis.value,ausschlussgrund:row.ausschlussgrund.value,vollmacht_textform:row.vollmacht_textform.checked,stimme_textform:row.stimme_textform.checked}));}
 async function auffrischen(){
  const alt=s.register.basis_hash,draft=stimmen();request++;const neu=await API.get(url+'/abstimmung');if(closed)return;
  entwurf=neu.register.basis_hash===alt?draft:null;s=neu;render();
 }
 function ergebnis(r,ziel){
  const sum=r.summen,titel={angenommen:'Rechnerisch angenommen',abgelehnt:'Rechnerisch abgelehnt',keine_gueltige_stimme:'Keine gültige Ja-/Nein-Stimme'};
  ziel.replaceChildren(el('h3',{text:titel[r.status]||r.status}),el('p',{text:'Stimmgewicht: '+STIMM_PRINZIP[r.prinzip]+' · Verfahren: '+(r.verfahren==='umlauf'?'Umlaufbeschluss':'Versammlung')}),el('p',{text:r.berechnung}),stimmSummen([['Ja',sum.ja],['Nein',sum.nein],['Enthaltungen',sum.enthaltung],['Ungültig',sum.ungueltig],['Nicht abgegeben',sum.ohne_stimme],['Stimmberechtigt',sum.berechtigt],['Anwesend / vertreten',sum.vertreten],['Ausgeschlossen',sum.ausgeschlossen]]),r.mea_quorum===null?document.createTextNode(''):stimmSummen([['Ja-MEA',sum.ja_mea],['Alle MEA',sum.alle_mea],['MEA-Zusatzquorum',r.mea_quorum?'Erreicht':'Nicht erreicht']]),el('p',{class:'small muted',text:'Rechtsgrundlage / Vereinbarung: '+r.grundlage+' · Brüche werden exakt ausgewertet. Die Verkündung des Beschlussergebnisses erfolgt durch die Versammlungsleitung.'}));
 }
 async function rechnen(speichern){
  if(closed||busy)return;if(regelGeaendert){error.textContent='Bitte die geänderte Mehrheitsregel zuerst speichern.';return;}const n=++request;error.textContent='';
  if(speichern){busy=true;fieldset.disabled=true;save.disabled=true;countButton.disabled=true;}
  const body={revision:s.revision,basis_hash:s.register.basis_hash,top_hash:s.top_hash,config_revision:s.config.revision,regel_revision:s.regel.revision,geprueft:checked.checked,stimmen:stimmen()};
  try{const r=await API.post(url+(speichern?'/abstimmung':'/auszaehlen'),body);if(closed||n!==request)return;
   ergebnis(r.ergebnis,preview);
   if(speichern){s.revision=r.revision;toast('Auszählung gespeichert · Version '+r.revision,'success');entwurf=body.stimmen;s=await API.get(url+'/abstimmung');if(!closed)render();}
  }catch(e){if(!closed&&n===request){error.textContent=e.message;preview.replaceChildren(el('p',{text:'Noch keine aktuelle Auszählung. Bitte Angaben prüfen.'}));}}
  finally{if(speichern){busy=false;if(!closed){fieldset.disabled=!darfSchreiben();save.disabled=!darfSchreiben();countButton.disabled=!darfSchreiben();}}}
 }
 const auto=debounce(()=>{if(!closed&&!busy&&checked?.checked&&s.config.daten.geprueft)rechnen(false);},350);
 function render(){
  regelGeaendert=false;rows=[];content.replaceChildren();error.textContent='';
  const info=el('section',{class:'cu-karte',style:'padding:14px;margin:12px 0'},[el('p',{text:'Objekt '+s.config.objekt_id+' · Versammlungsdatum '+datum(s.top.datum)+' · Stimmprinzip: '+STIMM_PRINZIP[s.config.daten.prinzip]}),el('p',{class:'small muted',text:s.config.daten.grundlage+(s.config.daten.geprueft?' · geprüft':' · noch nicht geprüft')}),el('button',{type:'button',text:'Stimmprinzip am Objekt bearbeiten',disabled:!darfSchreiben(),onclick:()=>objektStimmprinzipDialog(s.config.objekt_id,auffrischen).catch(fehler)})]);
  content.append(info);
  const old=el('section',{class:'cu-karte',style:'padding:14px;margin:12px 0'});
  if(s.auszaehlung){
   old.append(el('h3',{text:'Gespeicherte Auszählung · Version '+s.auszaehlung.revision}),el('p',{text:'Erfasst von '+s.auszaehlung.benutzer+' · '+s.auszaehlung.erstellt_am+(s.historisch?' · Eigentümerstand, TOP oder Regel inzwischen geändert: historischer Stand.':'')}));
   const target=el('div');ergebnis(s.auszaehlung.ergebnis,target);old.append(target);content.append(old);
  }
  const r=s.regel.daten;
  const rule=stimmForm([{felder:[{name:'mehrheit',label:'Mehrheitsregel',type:'select',value:r.mehrheit,options:[{value:'einfach',label:'Einfache Mehrheit · Ja > Nein'},{value:'drei_viertel',label:'Mindestens 3/4 der abgegebenen Stimmen'},{value:'zwei_drittel',label:'Mehr als 2/3 der abgegebenen Stimmen'},{value:'einstimmig',label:'Einstimmigkeit · Zustimmung ohne Gegenstimme'},{value:'allstimmig',label:'Allstimmigkeit · alle berechtigten Stimmrechte'},{value:'individuell',label:'Individuelle Quote laut Vereinbarung'}]}]},
   {grid:2,felder:[{name:'verfahren',label:'Verfahren',type:'select',value:r.verfahren,options:[{value:'versammlung',label:'Versammlung'},{value:'umlauf',label:'Umlaufbeschluss in Textform'}]},{name:'zusatz_mea',label:'Zusätzliches MEA-Quorum',type:'select',value:r.zusatz_mea,options:[{value:'keines',label:'Keines'},{value:'mehr_haelfte',label:'Ja-MEA > Hälfte aller MEA'},{value:'mindestens_haelfte',label:'Ja-MEA ≥ Hälfte aller MEA'}]}]},
   {grid:2,felder:[{name:'zaehler',label:'Individuelle Quote · Zähler',type:'number',value:r.zaehler},{name:'nenner',label:'Individuelle Quote · Nenner',type:'number',value:r.nenner}]},
   {grid:2,felder:[{name:'vergleich',label:'Individueller Vergleich',type:'select',value:r.vergleich,options:[{value:'gt',label:'Mehr als (>)'},{value:'gte',label:'Mindestens (≥)'}]},{name:'basis',label:'Individuelle Bezugsgröße',type:'select',value:r.basis,options:[{value:'abgegeben',label:'Gültige Ja- und Nein-Stimmen'},{value:'alle',label:'Alle berechtigten Stimmrechte'},{value:'vertreten',label:'Alle anwesenden / vertretenen Stimmrechte'}]}]},
   {felder:[{name:'grundlage',label:'Grundlage der Mehrheitsregel',type:'textarea',value:r.grundlage},{name:'umlauf_beschluss',label:'Absenkungsbeschluss bei Mehrheit im Umlaufverfahren',type:'textarea',value:r.umlauf_beschluss}]}],'stimmregel-');
  rule.inputs.grundlage.maxLength=rule.inputs.umlauf_beschluss.maxLength=2000;
  function details(){for(const key of ['zaehler','nenner','vergleich','basis']){const wrap=rule.inputs[key].closest('.field').parentElement;wrap.hidden=rule.inputs.mehrheit.value!=='individuell';wrap.style.display=wrap.hidden?'none':'';}const wrap=rule.inputs.umlauf_beschluss.closest('.field');wrap.hidden=rule.inputs.verfahren.value!=='umlauf';wrap.style.display=wrap.hidden?'none':'';}
  rule.inputs.mehrheit.addEventListener('change',details);rule.inputs.verfahren.addEventListener('change',details);details();
  const ruleSection=el('details',{},[el('summary',{text:'Mehrheitsregel dieses TOPs bearbeiten'}),rule.form,el('p',{class:'small muted',text:'Sondermehrheiten und Zusatzquoren nur mit passender Grundlage einstellen. Ein MEA-Zusatzquorum ersetzt keine Prüfung weiterer Voraussetzungen einer Kostenverteilung.'})]);
  ruleSection.append(el('button',{type:'button',text:'Mehrheitsregel speichern',disabled:!darfSchreiben(),onclick:async()=>{
   if(busy||!rule.form.reportValidity())return;busy=true;
   try{const d=rule.werte();d.zaehler=Number(d.zaehler);d.nenner=Number(d.nenner);await API.put(url+'/mehrheit',{revision:s.regel.revision,daten:d});await auffrischen();}
   catch(e){error.textContent=e.message;}finally{busy=false;}
  }}));rule.form.addEventListener('submit',e=>e.preventDefault());rule.form.addEventListener('input',()=>{regelGeaendert=true;request++;preview.replaceChildren(el('p',{text:'Mehrheitsregel geändert. Bitte zuerst die Regel speichern.'}));});content.append(el('p',{text:'Gespeicherte Mehrheitsregel: '+rule.inputs.mehrheit.selectedOptions[0].textContent}),ruleSection);
  const problems=[...s.register.hinweise,...((s.config.daten.prinzip==='mea'||r.zusatz_mea!=='keines')?s.register.meaHinweise:[])];
  if(problems.length)content.append(el('ul',{class:'cu-rechnung-fehler'},problems.map(text=>el('li',{text}))),el('p',{text:'Eigentümer und MEA bitte in den Einheiten bzw. Personenfunktionen korrigieren und die Abstimmung neu öffnen.'}));
  checked=el('input',{type:'checkbox','aria-label':'Eigentümergruppen, Einheiten und MEA geprüft'});
  fieldset=el('fieldset',{'aria-label':'Stimmabgaben',disabled:!darfSchreiben(),style:'border:0;padding:0;margin:12px 0'});
  fieldset.append(el('label',{class:'check-inline'},[checked,document.createTextNode(' Eigentümergruppen und Einheiten sowie bei MEA-Zählung die Anteile geprüft')]));
  checked.addEventListener('change',()=>{request++;preview.replaceChildren(el('p',{text:'Eigentümerstand bestätigen und auszählen.'}));auto();});
  const source=entwurf||(!s.historisch?s.auszaehlung?.snapshot.stimmen:null)||[];
  for(const g of s.register.gruppen){
   const alt=source.find(d=>d.key===g.key),a=alt||{...s.teilnahme[g.key],stimme:'keine',ausgeschlossen:false,stimme_textform:false,ausschlussgrund:''};
   const row={key:g.key};
   const select=(key,label,options,value)=>{
    const i=el('select',{'aria-label':label+' · '+g.name},options.map(([value,text])=>el('option',{value,text})));i.value=value||options[0][0];row[key]=i;return el('label',{},[document.createTextNode(label),i]);
   };
   const input=(key,label,value,max)=>{const i=el('input',{type:'text','aria-label':label+' · '+g.name,value:value||'',maxlength:max});row[key]=i;return el('label',{},[document.createTextNode(label),i]);};
   const check=(key,label,value)=>{const i=el('input',{type:'checkbox','aria-label':label+' · '+g.name,checked:!!value});row[key]=i;return el('label',{class:'check-inline'},[i,document.createTextNode(' '+label)]);};
   const card=el('section',{class:'cu-karte',style:'padding:14px;margin:12px 0'},[el('h3',{text:g.name}),el('p',{class:'small muted',text:g.einheiten.map(u=>(u.nummer||u.bezeichnung)+(u.mea?' · MEA '+u.mea:'')).join(' / ')+' · '+g.einheiten.length+' Einheit(en) · zusammen '+g.mea+' MEA'})]);
   const main=el('div',{class:'grid-3'},[
    select('teilnahme','Teilnahme / Vertretung',[['abwesend','Nicht teilgenommen'],['selbst','Selbst'],['vollmacht','Bevollmächtigte Person']],a.teilnahme),
    select('stimme','Stimme',[['keine','Noch nicht abgegeben'],['ja','Ja'],['nein','Nein'],['enthaltung','Enthaltung'],['ungueltig','Ungültig']],a.stimme),
    check('ausgeschlossen','Stimmrechtsausschluss für diesen TOP',a.ausgeschlossen)
   ]);
   const extra=el('details',{},[el('summary',{text:'Vollmacht, Textform und Ausschlussgrund'}),
    input('vertreter','Vertreten durch',a.vertreter,200),
    input('nachweis','Nachweis / Fundstelle der Vollmacht oder Textform-Stimme',a.nachweis,500),
    check('vollmacht_textform','Vollmacht in Textform geprüft',a.vollmacht_textform),
    check('stimme_textform','Umlauf-Stimme in Textform geprüft',a.stimme_textform),
    input('ausschlussgrund','Grund des Stimmrechtsausschlusses',a.ausschlussgrund,1000)
   ]);
   function aktualisieren(e){
    if(e?.target===row.ausgeschlossen&&row.ausgeschlossen.checked)row.stimme.value='keine';
    if(e?.target===row.teilnahme&&row.teilnahme.value==='abwesend')row.stimme.value='keine';
    row.stimme.disabled=row.ausgeschlossen.checked||row.teilnahme.value==='abwesend'||!darfSchreiben();
    if(row.ausgeschlossen.checked||row.teilnahme.value==='vollmacht'||r.verfahren==='umlauf')extra.open=true;
    if(e){request++;preview.replaceChildren(el('p',{text:'Stimmen geändert · Auszählung wird aktualisiert, sobald der Eigentümerstand bestätigt ist.'}));}auto();
   }
   for(const i of Object.values(row))if(i?.addEventListener){i.addEventListener('input',aktualisieren);i.addEventListener('change',aktualisieren);}
   card.append(main,extra);fieldset.append(card);rows.push(row);aktualisieren();
  }
  entwurf=null;preview.replaceChildren(el('p',{text:'Aktuelle Stimmen erfassen und Eigentümerstand bestätigen. Enthaltungen, Ausschlüsse und Vollmachten werden getrennt berücksichtigt.'}));
  content.append(fieldset,error,preview,el('button',{type:'button',text:'Gespeicherten Verlauf anzeigen',onclick:async()=>{
   try{const list=await API.get(url+'/abstimmungsverlauf');if(closed)return;
    modal({titel:'Abstimmungsverlauf',wide:true,inhalt:el('div',{},list.map(h=>{const box=el('section',{class:'cu-karte',style:'padding:12px;margin:10px 0'},[el('h3',{text:'Version '+h.revision+' · '+h.erstellt_am+' · '+h.benutzer})]);const x=el('div');ergebnis(JSON.parse(h.ergebnis),x);box.append(x);const snapshot=JSON.parse(h.snapshot);if(snapshot.top)box.append(el('p',{text:'Beschlussvorschlag: '+(snapshot.top.beschlussvorschlag||'–')}));box.append(el('details',{},[el('summary',{text:'Berücksichtigte Stimmabgaben'}),raster([{label:'Eigentümergruppe',render:d=>d.name},{label:'Teilnahme',render:d=>d.teilnahme},{label:'Stimme',render:d=>d.stimme},{label:'Stimmgewicht',render:d=>d.gewicht},{label:'Vertretung',render:d=>d.vertreter||'–'},{label:'Nachweis',render:d=>d.nachweis||'–'},{label:'Ausschlussgrund',render:d=>d.ausschlussgrund||'–'}],snapshot.stimmen)]));return box;})),footer:close=>[el('button',{text:'Schließen',onclick:close})]});
   }catch(e){error.textContent=e.message;}
  }}));
 }
 render();
}
