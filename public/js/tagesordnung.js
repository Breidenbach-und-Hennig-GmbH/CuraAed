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

 function vorlageForm(vorlage,ausTop,danach){
  const x=vorlage||ausTop||{},fields=[
   {name:'name',label:'Vorlagenname',value:vorlage?.name||x.titel||'',required:true},
   {name:'titel',label:'TOP-Titel',value:x.titel||'',required:true},
   {name:'art',label:'TOP-Art',type:'select',value:x.art||'besprechung',options:[{value:'besprechung',label:'Besprechung'},{value:'beschluss',label:'Beschlussfassung'}]},
   {name:'erlaeuterung',label:'Erläuterung',type:'textarea',value:x.erlaeuterung},
   {name:'beschlussvorschlag',label:'Beschlussvorschlag',type:'textarea',value:x.beschlussvorschlag}
  ],ui=formular([{felder:fields}]),error=el('p',{role:'alert',class:'cu-rechnung-fehler'});ui.form.append(error);
  for(const [key,input] of Object.entries(ui.inputs)){const label=ui.form.querySelector('label[for="'+input.id+'"]');input.id='vorlage-'+key;if(label)label.htmlFor=input.id;input.maxLength=['name','titel'].includes(key)?200:10000;}
  let busy=false,save;
  const m=modal({titel:vorlage?'TOP-Vorlage bearbeiten':ausTop?'TOP als Vorlage speichern':'TOP-Vorlage anlegen',inhalt:ui.form,wide:true,footer:close=>[el('button',{text:'Abbrechen',onclick:close}),save=el('button',{text:'Vorlage speichern',class:'btn-primary',onclick:()=>speichern(close)})]});
  async function speichern(close){
   if(busy||!ui.form.reportValidity())return;busy=true;save.disabled=true;
   try{await API.post('/top-vorlagen/'+(vorlage?'bearbeiten':'anlegen'),{...ui.werte(),id:vorlage?.id,revision:vorlage?.revision});close();toast('TOP-Vorlage gespeichert','success');if(danach)await danach();}
   catch(e){error.textContent=e.message;}finally{busy=false;save.disabled=false;}
  }
  ui.form.addEventListener('submit',e=>{e.preventDefault();speichern(m.close);});
 }
 async function vorlagenDialog(){
  const agendaRevision=stand?.revision,selected=[],content=el('div'),liste=el('div'),error=el('p',{role:'alert',class:'cu-rechnung-fehler'}),count=el('p',{role:'status',class:'small muted'});
  const search=el('input',{type:'search','aria-label':'TOP-Vorlagen durchsuchen',placeholder:'Vorlagenname, TOP-Titel oder Text suchen …'});
  let rows=[],closed=false,busy=false,request=0,apply;
  content.append(el('p',{text:'Zentrale Vorlagen für alle Versammlungen. Übernommene TOPs lassen sich unabhängig von der Vorlage bearbeiten.'}),search,
   darfSchreiben()?el('button',{type:'button',text:'Vorlage anlegen',onclick:()=>vorlageForm(null,null,neuLaden)}):null,count,error,liste);
  const m=modal({titel:'TOP-Vorlagen',inhalt:content,wide:true,onClose:()=>{closed=true;request++;},footer:close=>[
   el('button',{text:'Schließen',onclick:close}),
   darfSchreiben()?apply=el('button',{text:'Auswahl übernehmen',class:'btn-primary',disabled:true,onclick:async()=>{
    if(busy||!selected.length)return;busy=true;apply.disabled=true;error.textContent='';
    try{
     const vorlagen=selected.map(id=>{const r=rows.find(v=>v.id===id);return{id:r.id,revision:r.revision};});
     await API.post('/versammlungen/'+id+'/top-vorlagen-uebernehmen',{revision:agendaRevision,vorlagen});
     close();toast(vorlagen.length+' TOP-Vorlage(n) übernommen','success');if(aktuell())await laden();
    }catch(e){error.textContent=e.message;}finally{busy=false;if(!closed)zeichnen();}
   }}):null
  ]});
  function zeichnen(){
   count.textContent=rows.length+' Vorlage(n) · '+selected.length+' ausgewählt. Übernahme in der Reihenfolge Ihrer Auswahl.';
   if(apply)apply.disabled=busy||!selected.length||!stand?.versammlung.leitung_id;
   const q=search.value.trim().toLocaleLowerCase('de'),filtered=rows.filter(v=>[v.name,v.titel,v.erlaeuterung,v.beschlussvorschlag].join(' ').toLocaleLowerCase('de').includes(q));
   liste.replaceChildren(raster([{label:'Auswahl',render:v=>darfSchreiben()?el('input',{type:'checkbox',checked:selected.includes(v.id),disabled:busy,'aria-label':'Vorlage auswählen: '+v.name,onchange:e=>{const i=selected.indexOf(v.id);if(e.target.checked&&i<0)selected.push(v.id);else if(!e.target.checked&&i>=0)selected.splice(i,1);zeichnen();}}):''},
    {label:'Vorlage',render:v=>el('details',{},[el('summary',{text:v.name}),el('p',{text:'TOP: '+v.titel}),el('p',{text:v.art==='beschluss'?'Beschlussfassung':'Besprechung'}),el('p',{text:v.erlaeuterung||'Keine Erläuterung'}),el('p',{text:v.beschlussvorschlag||'Kein Beschlussvorschlag'})])},
    {label:'TOP-Titel',render:v=>v.titel},{label:'Aktionen',render:v=>darfSchreiben()?el('div',{class:'cu-etv-aktionen'},[
     el('button',{type:'button',text:'Bearbeiten',disabled:busy,onclick:()=>vorlageForm(v,null,neuLaden)}),
     el('button',{type:'button',text:'Entfernen',disabled:busy,onclick:async()=>{
      if(!await bestaetigen('Vorlage „'+v.name+'“ aus der Auswahl entfernen? Bereits übernommene TOPs bleiben erhalten.'))return;
      try{await API.post('/top-vorlagen/archivieren',{id:v.id,revision:v.revision});await neuLaden();}catch(e){error.textContent=e.message;}
     }})
    ]):''}],filtered,{leer:q?'Keine passenden Vorlagen.':'Noch keine Vorlagen. Über „Vorlage anlegen“ oder „Als Vorlage speichern“ starten.'}));
  }
  async function neuLaden(){
   const n=++request;try{const r=await API.get('/top-vorlagen');if(closed||n!==request)return;rows=r;for(let i=selected.length-1;i>=0;i--)if(!rows.some(v=>v.id===selected[i]))selected.splice(i,1);zeichnen();}
   catch(e){if(!closed&&n===request)error.textContent=e.message;}
  }
  search.addEventListener('input',zeichnen);await neuLaden();
 }

 const neuerTop=darfSchreiben()?el('button',{type:'button',class:'btn-primary',text:'Tagesordnungspunkt anlegen',onclick:()=>topForm(null)}):null;
 const werkzeug=el('div',{class:'cu-etv-werkzeug'},[suche,el('span',{class:'hp-spacer'}),el('a',{href:'/api/versammlungen/'+id+'/tagesordnung.txt',download:'',class:'button',text:'Tagesordnung herunterladen'}),el('button',{type:'button',text:'TOP-Vorlagen',onclick:vorlagenDialog}),neuerTop]);
 const kopf=el('p',{class:'small muted'});
 root.append(el('div',{class:'cu-etv-werkzeug'},[el('button',{type:'button',text:'Einladung als PDF',onclick:()=>einladungDialog(id).catch(fehler)}),el('button',{type:'button',text:'Teilnehmerliste',onclick:()=>teilnehmerDialog(id).catch(fehler)}),el('a',{href:'#/etv',text:'← Versammlungen'}),el('button',{type:'button',text:'Basisdaten bearbeiten',onclick:()=>{if(stand&&darfSchreiben())versammlungForm(stand.versammlung);},disabled:!darfSchreiben()})]),kopf,werkzeug,hinweis,box);
 function zeichnen(){
  const v=stand.versammlung;if(neuerTop)neuerTop.disabled=!v.leitung_id;kopf.textContent=v.name+' · Objekt '+v.objekt_nummer+' · '+datum(v.datum)+(v.uhrzeit?' · '+v.uhrzeit:'');
  const q=suche.value.trim().toLocaleLowerCase('de'),rows=stand.tops.filter(t=>[t.position,t.titel,t.erlaeuterung,t.beschlussvorschlag].join(' ').toLocaleLowerCase('de').includes(q));
  hinweis.textContent=(!v.leitung_id?'Bitte zuerst die Basisdaten mit Versammlungsleitung speichern. ':'')+stand.tops.length+' Tagesordnungspunkt(e)'+(q?' · '+rows.length+' Treffer':'');
  box.replaceChildren(raster([{label:'TOP',render:t=>String(t.position)},{label:'Titel',render:t=>el('strong',{text:t.titel})},{label:'Art',render:t=>t.art==='beschluss'?'Beschlussfassung':'Besprechung'},{label:'Erläuterung',render:t=>t.erlaeuterung||'–'},{label:'Beschlussvorschlag',render:t=>t.beschlussvorschlag||'–'},{label:'Aktionen',render:t=>darfSchreiben()?el('div',{class:'cu-etv-aktionen'},[
   el('button',{type:'button',text:'↑',title:'TOP '+t.position+' nach oben','aria-label':'TOP '+t.position+' nach oben',disabled:t.position===1,onclick:e=>{e.stopPropagation();bewegen(t,-1);}}),
   el('button',{type:'button',text:'↓',title:'TOP '+t.position+' nach unten','aria-label':'TOP '+t.position+' nach unten',disabled:t.position===stand.tops.length,onclick:e=>{e.stopPropagation();bewegen(t,1);}}),
   el('button',{type:'button',text:'Bearbeiten',onclick:e=>{e.stopPropagation();topForm(t);}}),
   el('button',{type:'button',text:'Mehrheit / Abstimmen',disabled:t.art!=='beschluss',onclick:e=>{e.stopPropagation();abstimmungDialog(id,t.id).catch(fehler);}}),
   el('button',{type:'button',text:'Als Vorlage speichern',onclick:e=>{e.stopPropagation();vorlageForm(null,t);}}),
   el('button',{type:'button',text:'Löschen',onclick:e=>{e.stopPropagation();loeschen(t);}})
  ]):''}],rows,{onOpen:t=>{if(darfSchreiben())topForm(t);},leer:q?'Keine passenden TOPs.':'Noch keine Tagesordnungspunkte. Über „Tagesordnungspunkt anlegen“ starten.'}));
 }
 suche.addEventListener('input',()=>{if(stand)zeichnen();});
 S.kontext={typ:'tagesordnung',erstellen:()=>topForm(null)};
 if(!zeigeAufDesktop(lauf,maskenFenster({titel:'Tagesordnung',kopf:{ueberschrift:'Tagesordnung',brot:[{text:'ETV',href:'#/etv'},{text:'Tagesordnung'}],drucken:false},inhalt:root})))return;
 await laden();
}
