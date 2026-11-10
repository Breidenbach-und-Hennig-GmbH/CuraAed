'use strict';
function dmsDateiEingang(root,{sachbearbeiter,aktuell,neuLaden}){
 const accept='.pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt,.csv';
 const input=el('input',{type:'file',multiple:true,accept,'aria-label':'Dokumentdateien auswählen',class:'cu-dms-dateiwahl'});
 const hinweis=el('p',{class:'small muted',text:'PDF, Bilder, Word, Excel, Text oder CSV · maximal 50 MB je Datei'});
 const queue=el('ul',{class:'cu-dms-upload-liste','aria-label':'Dateiübernahmen'}),meldung=el('p',{role:'status','aria-live':'polite'});
 const zone=el('section',{class:'cu-dms-dropzone','aria-label':'Dokumente hinzufügen'},[
  el('strong',{text:'Dokumente hierher ziehen'}),el('span',{text:'Eine oder mehrere Dateien direkt in den Posteingang übernehmen.'}),
  el('button',{type:'button',text:'Dateien auswählen',onclick:()=>input.click()}),input,hinweis,meldung,queue]);
 let running=false,depth=0;const jobs=[];
 const hasFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
 function render(job){
  job.row.replaceChildren(el('span',{text:job.name}),el('span',{text:job.state==='fertig'?'Im Posteingang':job.state==='laeuft'?'Wird übernommen …':job.error||'Wartet …'}));
  if(job.state==='fehler')job.row.append(el('button',{type:'button',class:'hp-mini',text:'Erneut versuchen',onclick:()=>{if(job.state!=='fehler')return;job.state='wartet';job.error='';render(job);run();}}));
 }
 async function run(){
  if(running)return;running=true;let changed=false;
  try{for(const job of jobs){
   if(job.state!=='wartet')continue;
   job.state='laeuft';render(job);
   try{
    if(!job.saved){const fd=new FormData();fd.append('titel',job.file.name);fd.append('kategorie','korrespondenz');fd.append('datei',job.file);job.saved=await API.upload('/archiv',fd);}
    try{await API.post('/dms-posteingang',{dokument_id:job.saved.id,sachbearbeiter});}
    catch(e){if(e.status!==409)throw e;const d=await API.get('/dms-posteingang/'+job.saved.id);if(d.eingang?.dokument_id!==job.saved.id)throw e;}
    job.state='fertig';job.file=null;changed=true;
   }catch(e){job.state='fehler';job.error=(job.saved?'Datei bereits gespeichert; Posteingangszuordnung fehlgeschlagen: ':'')+(e.message||'Übernahme fehlgeschlagen.');}
   if(aktuell())render(job);
  }}finally{running=false;if(aktuell()){const done=jobs.filter(j=>j.state==='fertig').length,failed=jobs.filter(j=>j.state==='fehler').length;meldung.textContent=done+' Datei(en) übernommen'+(failed?' · '+failed+' fehlgeschlagen':'');if(changed)await neuLaden();}}
 }
 function add(files){
  if(!aktuell())return;const selected=Array.from(files||[]);
  if(!selected.length){meldung.textContent='Bitte Dateien vom Computer hierher ziehen. Ordner werden nicht übernommen.';return;}
  for(const file of selected){
   const name=file.name||'Unbenannte Datei';
   if(!/\.(pdf|jpe?g|png|webp|tiff?|docx?|xlsx?|txt|csv)$/i.test(name)||file.size>50*1024*1024||!file.size){queue.append(el('li',{class:'cu-dms-upload-fehler',text:name+': '+(!file.size?'Datei ist leer.':file.size>50*1024*1024?'Datei ist größer als 50 MB.':'Dateiformat wird nicht unterstützt.') }));continue;}
   const job={file,name,state:'wartet',row:el('li')};jobs.push(job);queue.append(job.row);render(job);
  }
  run();
 }
 input.addEventListener('change',()=>{add(input.files);input.value='';});
 root.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();depth++;zone.classList.add('cu-dms-drop-aktiv');});
 root.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';});
 root.addEventListener('dragleave',e=>{if(!hasFiles(e))return;e.preventDefault();depth=Math.max(0,depth-1);if(!depth)zone.classList.remove('cu-dms-drop-aktiv');});
 root.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();depth=0;zone.classList.remove('cu-dms-drop-aktiv');add(e.dataTransfer.files);});
 return zone;
}
