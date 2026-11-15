'use strict';
const PROFIL_PLATZHALTER='/images/mitarbeiter-platzhalter.svg';
function profilBild(src,name,cls=''){
 const img=el('img',{src:src||PROFIL_PLATZHALTER,alt:name||'',class:'cu-profilbild '+cls,width:'36',height:'36'});
 img.addEventListener('error',()=>{if(img.getAttribute('src')!==PROFIL_PLATZHALTER)img.src=PROFIL_PLATZHALTER;});
 return img;
}
async function mitarbeiterSymbole(){
 const target=document.getElementById('cu-team'),own=document.getElementById('cu-eigenes-bild'),user=S.benutzer?.id;
 if(!target||!darfSchreiben())return;
 try{
  const rows=await API.get('/mitarbeiterprofile');
  if(user!==S.benutzer?.id||!target.isConnected)return;
  const me=rows.find(r=>r.id===user);if(own&&me)own.replaceChildren(profilBild(me.bild_url,''));
  const open=()=>modal({titel:'Mitarbeiter',inhalt:el('div',{class:'cu-team-liste'},rows.map(r=>el('div',{class:'cu-team-person'},[profilBild(r.bild_url,''),el('span',{text:r.name}),r.id===user?el('button',{text:'Mein Profil',onclick:()=>meinProfil().catch(fehler)}):null]))),footer:close=>[el('button',{text:'Schließen',onclick:close})]});
  target.replaceChildren(...rows.filter(r=>r.id!==user).slice(0,5).map(r=>el('button',{type:'button',class:'cu-team-symbol',title:r.name,'aria-label':r.name,onclick:open},[profilBild(r.bild_url,'')])),el('button',{type:'button',class:'cu-rund',title:'Alle Mitarbeiter','aria-label':'Alle Mitarbeiter',onclick:open},[icon('users')]));
 }catch{target.replaceChildren();}
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
