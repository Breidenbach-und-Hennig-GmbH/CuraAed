'use strict';
const PROFIL_PLATZHALTER='/images/mitarbeiter-platzhalter.svg';
function profilBild(src,name,cls=''){
 const img=el('img',{src:src||PROFIL_PLATZHALTER,alt:name||'',class:'cu-profilbild '+cls,width:'36',height:'36'});
 img.addEventListener('error',()=>{if(img.getAttribute('src')!==PROFIL_PLATZHALTER)img.src=PROFIL_PLATZHALTER;});
 return img;
}
function mitarbeiterFrist(work){
 let timer;return Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Status konnte nicht aktualisiert werden')),10000);})]).finally(()=>clearTimeout(timer));
}
let mitarbeiterLauf=0,mitarbeiterAnfrage=0,mitarbeiterCleanup=null;
function statusBild(row){
 return el('span',{class:'cu-mitarbeiter-avatar','data-mitarbeiter-id':String(row.id)},[profilBild(row.bild_url,''),el('span',{class:'cu-praesenzpunkt','aria-hidden':'true'})]);
}
function statusAnwenden(rows){
 for(const row of rows){
  const state=row.status||{farbe:'grau',text:'STARFACE-Status nicht verfügbar'};
  const color=['rot','gelb','gruen','grau'].includes(state.farbe)?state.farbe:'grau';
  for(const node of document.querySelectorAll('[data-mitarbeiter-id="'+row.id+'"]')){
   node.className='cu-mitarbeiter-avatar status-'+color;
   node.title=row.name+' · '+state.text;
   const image=node.querySelector('img');if(image&&image.getAttribute('src')!==row.bild_url)image.src=row.bild_url||PROFIL_PLATZHALTER;
   const button=node.closest('.cu-team-symbol');if(button){button.title=node.title;button.setAttribute('aria-label',node.title);}
   const text=node.closest('.cu-team-person')?.querySelector('.cu-mitarbeiter-status');if(text)text.textContent=state.text;
  }
 }
}
async function mitarbeiterListe(){
 try{
  const user=S.benutzer?.id,rows=await mitarbeiterFrist(()=>API.get('/mitarbeiterprofile'));if(user!==S.benutzer?.id)return;
  modal({titel:'Mitarbeiter',inhalt:el('div',{class:'cu-team-liste'},rows.map(r=>el('div',{class:'cu-team-person'},[statusBild(r),el('div',{},[el('strong',{text:r.name}),el('p',{class:'small muted cu-mitarbeiter-status'})]),r.id===user?el('button',{text:'Mein Profil',onclick:()=>meinProfil().catch(fehler)}):null]))),footer:close=>[el('button',{text:'Schließen',onclick:close})]});statusAnwenden(rows);
 }catch(e){fehler(e);}
}
async function mitarbeiterSymbole(){
 const target=document.getElementById('cu-team'),own=document.getElementById('cu-eigenes-bild'),user=S.benutzer?.id,request=++mitarbeiterAnfrage;
 if(!target||!darfSchreiben())return;
 try{
  const rows=await mitarbeiterFrist(()=>API.get('/mitarbeiterprofile'));
  if(user!==S.benutzer?.id||!target.isConnected||request!==mitarbeiterAnfrage)return;
  const me=rows.find(r=>r.id===user);
  if(own&&me&&!own.querySelector('[data-mitarbeiter-id="'+user+'"]'))own.replaceChildren(statusBild(me));
  // Bestehende Knöpfe erhalten den Tastaturfokus bei jeder Aktualisierung.
  const team=rows.filter(r=>r.id!==user).slice(0,5),key=team.map(r=>r.id).join(',');
  if(target.dataset.team!==key){
   target.dataset.team=key;
   target.replaceChildren(...team.map(r=>el('button',{type:'button',class:'cu-team-symbol',onclick:mitarbeiterListe},[statusBild(r)])),el('button',{type:'button',class:'cu-rund',title:'Alle Mitarbeiter','aria-label':'Alle Mitarbeiter',onclick:mitarbeiterListe},[icon('users')]));
  }
  statusAnwenden(rows);
 }catch{
  if(user!==S.benutzer?.id||request!==mitarbeiterAnfrage)return;
  for(const node of document.querySelectorAll('.cu-mitarbeiter-avatar')){node.className='cu-mitarbeiter-avatar status-grau';node.title='Status konnte nicht aktualisiert werden';const text=node.closest('.cu-team-person')?.querySelector('.cu-mitarbeiter-status');if(text)text.textContent=node.title;const button=node.closest('.cu-team-symbol');if(button){button.title=node.title;button.setAttribute('aria-label',node.title);}}
 }
}
function mitarbeiterStoppen(){
 ++mitarbeiterLauf;++mitarbeiterAnfrage;
 if(mitarbeiterCleanup){mitarbeiterCleanup();mitarbeiterCleanup=null;}
}
function mitarbeiterStarten(){
 mitarbeiterStoppen();if(!darfSchreiben())return;
 const lauf=mitarbeiterLauf,user=S.benutzer.id;let fenster=crypto.randomUUID(),active=true,pending=false;
 const alive=()=>active&&lauf===mitarbeiterLauf&&user===S.benutzer?.id;
 const leave=()=>{if(!active)return;active=false;const data=JSON.stringify({fenster_id:fenster,zustand:'geschlossen'});try{navigator.sendBeacon('/api/mitarbeiterprofile/praesenz',new Blob([data],{type:'application/json'}));}catch{/* Spätestens nach zwei Minuten läuft die Meldung ab. */}};
 const tick=async()=>{if(!alive()||pending)return;pending=true;try{await mitarbeiterFrist(()=>API.post('/mitarbeiterprofile/praesenz',{fenster_id:fenster,zustand:'offen'}));if(alive())await mitarbeiterSymbole();}catch{if(alive())await mitarbeiterSymbole();}finally{pending=false;}};
 const show=e=>{if(e.persisted&&lauf===mitarbeiterLauf){fenster=crypto.randomUUID();active=true;tick();}};
 const wake=()=>{if(document.visibilityState==='visible')tick();};
 window.addEventListener('pagehide',leave);window.addEventListener('pageshow',show);document.addEventListener('visibilitychange',wake);
 const timer=setInterval(tick,30000);
 mitarbeiterCleanup=()=>{leave();clearInterval(timer);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',show);document.removeEventListener('visibilitychange',wake);};
 tick();
}
async function profilDatei(file){
 if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Bitte PNG, JPEG oder WebP bis 10 MB wählen.');
 const bmp=await createImageBitmap(file);
 try{
  if(!bmp.width||!bmp.height||bmp.width*bmp.height>40000000)throw new Error('Das Bild ist zu groß. Bitte vorher verkleinern.');
  const c=document.createElement('canvas');c.width=c.height=256;const size=Math.min(bmp.width,bmp.height);
  c.getContext('2d').drawImage(bmp,(bmp.width-size)/2,(bmp.height-size)/2,size,size,0,0,256,256);
  return c.toDataURL('image/png');
 }finally{bmp.close();}
}
async function meinProfil(){
 if(!darfSchreiben())return;
 const user=S.benutzer.id,p=await API.get('/mitarbeiterprofile/ich');if(user!==S.benutzer?.id)return;
 let image,busy=false,save;
 const login=el('input',{id:'profil-starface',type:'text',inputmode:'numeric',maxlength:'20',autocomplete:'off',value:p.starface_login_id||''});
 const preview=el('div',{class:'cu-profil-vorschau'},[profilBild(p.bild_url,'Ihr Profilbild')]);
 const file=el('input',{id:'profil-foto',type:'file',accept:'image/png,image/jpeg,image/webp'});
 const err=el('p',{role:'alert'});
 const remove=el('button',{type:'button',text:'Platzhalter verwenden',onclick:()=>{image=null;preview.replaceChildren(profilBild(null,'Platzhalter'));file.value='';}});
 file.addEventListener('change',async()=>{
  if(busy)return;busy=true;save.disabled=true;remove.disabled=true;err.textContent='';
  try{image=await profilDatei(file.files[0]);preview.replaceChildren(profilBild(image,'Bildvorschau'));}
  catch(e){err.textContent=e.message;file.value='';}
  finally{busy=false;save.disabled=false;remove.disabled=false;}
 });
 modal({titel:'Mein Profil',inhalt:el('div',{class:'cu-profil-form'},[
  el('strong',{text:S.benutzer.name}),preview,el('label',{for:'profil-foto',text:'Profilbild'}),file,remove,
  el('label',{for:'profil-starface',text:'Persönliche STARFACE-Login-ID'}),login,
  el('p',{class:'small muted',text:'Einmal eintragen: Ihre Login-ID und Ihr Bild bleiben in Ihrem CuraAed-Profil gespeichert. Die Login-ID allein stellt noch keine Verbindung zur Telefonanlage her.'}),err
 ]),footer:close=>[el('button',{text:'Abbrechen',onclick:close}),save=el('button',{text:'Speichern',class:'btn-primary',onclick:async()=>{
  if(busy)return;save.disabled=true;file.disabled=true;remove.disabled=true;
  try{await API.put('/mitarbeiterprofile/ich',{revision:p.revision,starface_login_id:login.value,...(image!==undefined?{bild:image}:{})});close();await mitarbeiterSymbole();toast('Profil gespeichert','success');}
  catch(e){err.textContent=e.message;save.disabled=false;file.disabled=false;remove.disabled=false;}
 }})]});login.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save.click();}});
}
