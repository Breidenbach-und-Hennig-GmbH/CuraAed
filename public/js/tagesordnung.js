'use strict';
async function tagesordnungMaske(id){
 const lauf=S.lauf,root=el('div'),box=el('div'),hinweis=el('p',{role:'status',class:'small muted'}),suche=el('input',{type:'search','aria-label':'Tagesordnung durchsuchen',placeholder:'TOP, Titel oder Text suchen …'});let stand=null,version=0;
 const aktuell=()=>lauf===S.lauf;
 async function laden(){
  const n=++version;
  try{const r=await API.get('/versammlungen/'+id+'/tops');if(!aktuell()||n!==version)return;stand=r;zeichnen();}
  catch(e){if(aktuell())fehler(e);}
 }
 async function aktion(art,b){
  const r=await API.post('/versammlungen/'+id+'/tops/'+art,{...b,revision:stand.revision});await laden();return r;
 }
 function topForm(top){
  if(!stand)return;
  const revision=stand.revision,ui=formular([{felder:[{name:'titel',label:'Titel',value:top?.titel,required:true}]},{felder:[{name:'art',label:'TOP-Art',type:'select',value:top?.art||'besprechung',options:[{value:'besprechung',label:'Besprechung'},{value:'beschluss',label:'Beschlussfassung'}]}]},{felder:[{name:'erlaeuterung',label:'Erläuterung',type:'textarea',value:top?.erlaeuterung}]},{felder:[{name:'beschlussvorschlag',label:'Beschlussvorschlag',type:'textarea',value:top?.beschlussvorschlag}]}]);
  for(const [k,max] of Object.entries({titel:200,erlaeuterung:10000,beschlussvorschlag:10000}))ui.inputs[k].maxLength=max;
  const error=el('p',{role:'alert',class:'cu-rechnung-fehler'});ui.form.append(error);let busy=false,save;
  const m=modal({titel:top?'TOP '+top.position+' bearbeiten':'Tagesordnungspunkt anlegen',inhalt:ui.form,wide:true,footer:close=>[el('button',{text:'Abbrechen',onclick:close}),save=el('button',{text:'TOP speichern',class:'btn-primary',onclick:()=>speichern(close)})]});
  async function speichern(close){
   if(busy||!ui.form.reportValidity())return;busy=true;save.disabled=true;
   try{await API.post('/versammlungen/'+id+'/tops/'+(top?'bearbeiten':'anlegen'),{...ui.werte(),id:top?.id,revision});close();if(aktuell())await laden();}
   catch(e){error.textContent=e.message;}finally{busy=false;save.disabled=false;}
  }
  ui.form.addEventListener('submit',e=>{e.preventDefault();speichern(m.close);});
 }
 async function loeschen(t){
  if(!await bestaetigen('TOP '+t.position+' „'+t.titel+'“ löschen?',{danger:true,text:'Löschen'}))return;
  try{await aktion('loeschen',{id:t.id});}catch(e){fehler(e);}
 }
 async function bewegen(t,richtung){try{await aktion('verschieben',{id:t.id,richtung});}catch(e){fehler(e);}}
 const neuerTop=darfSchreiben()?el('button',{type:'button',class:'btn-primary',text:'Tagesordnungspunkt anlegen',onclick:()=>topForm(null)}):null;
 const werkzeug=el('div',{class:'cu-etv-werkzeug'},[suche,el('span',{class:'hp-spacer'}),el('a',{href:'/api/versammlungen/'+id+'/tagesordnung.txt',download:'',class:'button',text:'Tagesordnung herunterladen'}),neuerTop]);
 const kopf=el('p',{class:'small muted'});
 root.append(el('div',{class:'cu-etv-werkzeug'},[el('a',{href:'#/etv',text:'← Versammlungen'}),el('button',{type:'button',text:'Basisdaten bearbeiten',onclick:()=>{if(stand&&darfSchreiben())versammlungForm(stand.versammlung);},disabled:!darfSchreiben()})]),kopf,werkzeug,hinweis,box);
 function zeichnen(){
  const v=stand.versammlung;if(neuerTop)neuerTop.disabled=!v.leitung_id;kopf.textContent=v.name+' · Objekt '+v.objekt_nummer+' · '+datum(v.datum)+(v.uhrzeit?' · '+v.uhrzeit:'');
  const q=suche.value.trim().toLocaleLowerCase('de'),rows=stand.tops.filter(t=>[t.position,t.titel,t.erlaeuterung,t.beschlussvorschlag].join(' ').toLocaleLowerCase('de').includes(q));
  hinweis.textContent=(!v.leitung_id?'Bitte zuerst die Basisdaten mit Versammlungsleitung speichern. ':'')+stand.tops.length+' Tagesordnungspunkt(e)'+(q?' · '+rows.length+' Treffer':'');
  box.replaceChildren(raster([{label:'TOP',render:t=>String(t.position)},{label:'Titel',render:t=>el('strong',{text:t.titel})},{label:'Art',render:t=>t.art==='beschluss'?'Beschlussfassung':'Besprechung'},{label:'Erläuterung',render:t=>t.erlaeuterung||'–'},{label:'Beschlussvorschlag',render:t=>t.beschlussvorschlag||'–'},{label:'Aktionen',render:t=>darfSchreiben()?el('div',{class:'cu-etv-aktionen'},[
   el('button',{type:'button',text:'↑',title:'TOP '+t.position+' nach oben','aria-label':'TOP '+t.position+' nach oben',disabled:t.position===1,onclick:e=>{e.stopPropagation();bewegen(t,-1);}}),
   el('button',{type:'button',text:'↓',title:'TOP '+t.position+' nach unten','aria-label':'TOP '+t.position+' nach unten',disabled:t.position===stand.tops.length,onclick:e=>{e.stopPropagation();bewegen(t,1);}}),
   el('button',{type:'button',text:'Bearbeiten',onclick:e=>{e.stopPropagation();topForm(t);}}),
   el('button',{type:'button',text:'Löschen',onclick:e=>{e.stopPropagation();loeschen(t);}})
  ]):''}],rows,{onOpen:t=>{if(darfSchreiben())topForm(t);},leer:q?'Keine passenden TOPs.':'Noch keine Tagesordnungspunkte. Über „Tagesordnungspunkt anlegen“ starten.'}));
 }
 suche.addEventListener('input',()=>{if(stand)zeichnen();});
 S.kontext={typ:'tagesordnung',erstellen:()=>topForm(null)};
 if(!zeigeAufDesktop(lauf,maskenFenster({titel:'Tagesordnung',kopf:{ueberschrift:'Tagesordnung',brot:[{text:'ETV',href:'#/etv'},{text:'Tagesordnung'}],drucken:false},inhalt:root})))return;
 await laden();
}
