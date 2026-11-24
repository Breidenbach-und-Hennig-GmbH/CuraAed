'use strict';
const PROFIL_PLATZHALTER='/images/mitarbeiter-platzhalter.svg';
function profilBild(src,name,cls=''){
 const img=el('img',{src:src||PROFIL_PLATZHALTER,alt:name||'',class:'cu-profilbild '+cls,width:'36',height:'36'});
 img.addEventListener('error',()=>{if(img.getAttribute('src')!==PROFIL_PLATZHALTER)img.src=PROFIL_PLATZHALTER;});
 return img;
}
const TEAM={user:null,timer:null,fenster:null,zeichnen:null,daten:[],anfrage:0};
function mitarbeiterStatus(r){
 if(r.veraltet)return {farbe:'unbekannt',text:'Status nicht abrufbar'};
 if(r.cura_online===false)return {farbe:'rot',text:'In CuraAed abgemeldet / nicht erreichbar'};
 if(r.cura_online!==true)return {farbe:'unbekannt',text:'Status unbekannt'};
 const telefon={angemeldet:{farbe:'gruen',text:'Angemeldet'},telefoniert:{farbe:'gelb',text:'Telefoniert'},abgemeldet:{farbe:'rot',text:'An Telefonanlage abgemeldet'}};
 return telefon[r.telefon_status]||{farbe:'unbekannt',text:'CuraAed angemeldet · Telefonstatus unbekannt'};
}
function mitarbeiterFensterSchliessen(){TEAM.fenster?.close();}
function mitarbeiterBeenden(){
 clearTimeout(TEAM.timer);TEAM.timer=null;TEAM.user=null;++TEAM.anfrage;
 TEAM.fenster?.close(false);TEAM.daten=[];
}
async function mitarbeiterLaden(){
 const user=S.benutzer?.id,n=++TEAM.anfrage;
 try{const daten=await API.get('/mitarbeiterprofile');if(n!==TEAM.anfrage||user!==S.benutzer?.id)return;TEAM.daten=daten;TEAM.zeichnen?.(false);}
 catch(e){if(n!==TEAM.anfrage||user!==S.benutzer?.id)return;TEAM.daten=TEAM.daten.map(r=>({...r,veraltet:true}));TEAM.zeichnen?.(true);}
}
function mitarbeiterPulsStarten(){
 const user=S.benutzer?.id;if(TEAM.user===user)return;
 mitarbeiterBeenden();TEAM.user=user;
 const puls=async()=>{
  if(TEAM.user!==user||S.benutzer?.id!==user||!darfSchreiben())return;
  try{await API.post('/mitarbeiterprofile/praesenz',{});}catch{}
  if(TEAM.user!==user||S.benutzer?.id!==user)return;
  if(TEAM.fenster)await mitarbeiterLaden();
  if(TEAM.user===user)TEAM.timer=setTimeout(puls,30000);
 };
 puls();
}
function mitarbeiterFenster(){
 if(!darfSchreiben())return;
 if(TEAM.fenster){TEAM.fenster.box.querySelector('input')?.focus();return;}
 const user=S.benutzer.id,key='hp.team.sort.'+user;
 let sort='name';try{if(localStorage.getItem(key)==='rufnummer')sort='rufnummer';}catch{}
 const q=el('input',{type:'search','aria-label':'Mitarbeiter suchen',placeholder:'Name, Kürzel, Rufnummer …'});
 const auswahl=el('select',{'aria-label':'Mitarbeiter sortieren'},[['name','Name'],['rufnummer','Rufnummer']].map(([value,text])=>el('option',{value,text,selected:value===sort?'':null})));
 const liste=el('div',{class:'cu-team-statusliste'}),meldung=el('p',{class:'small muted',role:'status'});
 const zeichnen=fehlerhaft=>{
  if(!TEAM.fenster||S.benutzer?.id!==user)return;
  const cmp=new Intl.Collator('de',{numeric:true,sensitivity:'base'}),suche=q.value.trim().toLocaleLowerCase('de');
  const rows=TEAM.daten.filter(r=>[r.name,r.kuerzel,r.rufnummer].join(' ').toLocaleLowerCase('de').includes(suche)).slice().sort((a,b)=>{
   if(auswahl.value==='rufnummer'){const x=a.rufnummer||'',y=b.rufnummer||'';return (!x)-(!y)||cmp.compare(x.replace(/\D/g,''),y.replace(/\D/g,''))||cmp.compare(a.name,b.name);}
   return cmp.compare(a.name,b.name)||a.id-b.id;
  });
  liste.replaceChildren(...rows.map(r=>{const s=mitarbeiterStatus(r);return el('div',{class:'cu-team-statuszeile'},[
   profilBild(r.bild_url,''),el('span',{class:'cu-team-statuspunkt '+s.farbe,role:'img','aria-label':s.text,title:s.text}),
   el('div',{class:'cu-team-statusname'},[el('strong',{text:r.name}),el('span',{class:'small',text:[r.kuerzel,s.text].filter(Boolean).join(' · ')})]),
   el('span',{class:'cu-team-rufnummer',text:r.rufnummer||'–'}),
  ]);}));
  if(!rows.length)liste.append(el('p',{text:'Keine Mitarbeiter gefunden.'}));
  meldung.textContent=fehlerhaft?'Status konnte nicht aktualisiert werden. Erneut versuchen.':'Aktualisierung alle 30 Sekunden · STARFACE noch nicht verbunden. Grau = Telefonstatus unbekannt.';
 };
 let aufraeumen=()=>{};
 const close=(fokus=true)=>{if(!TEAM.fenster||TEAM.fenster.box!==box)return;TEAM.fenster=null;TEAM.zeichnen=null;aufraeumen();box.remove();if(fokus)document.querySelector('#cu-team button')?.focus();};
 const box=el('aside',{class:'cu-team-fenster',role:'region','aria-label':'Mitarbeiterstatus'},[
  el('header',{},[el('h2',{text:'Mitarbeiterstatus'}),el('button',{type:'button',class:'modal-x','aria-label':'Mitarbeiterfenster schließen',text:'✕',onclick:()=>close()})]),
  el('div',{class:'cu-team-filter'},[q,auswahl]),liste,meldung,
  el('footer',{},[el('button',{type:'button',text:'Aktualisieren',onclick:mitarbeiterLaden}),el('button',{type:'button',text:'Mein Profil',onclick:()=>meinProfil().catch(fehler)})]),
 ]);
 document.body.append(box);TEAM.fenster={box,close};TEAM.zeichnen=zeichnen;
 aufraeumen=UI.arbeitsfenster(box,'mitarbeiter-'+user,{minBreite:320,minHoehe:260,breite:460,hoehe:390,links:window.innerWidth-484,oben:112,tastatur:true});
 box.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'&&!document.querySelector('.modal-backdrop')){ev.preventDefault();ev.stopPropagation();close();return;}
  if((ev.ctrlKey||ev.metaKey)&&!ev.altKey&&ev.key==='F7'){ev.preventDefault();ev.stopPropagation();auswahl.focus();return;}
  if(!ev.ctrlKey&&!ev.altKey&&!ev.metaKey&&['F2','F3','F4','F5'].includes(ev.key)){
   ev.preventDefault();ev.stopPropagation();if(ev.key==='F5')mitarbeiterLaden();else if(ev.key==='F2')meinProfil().catch(fehler);else toast('Mitarbeiter werden in der Benutzerverwaltung angelegt und deaktiviert.');
  }
 });
 q.addEventListener('input',()=>zeichnen());auswahl.addEventListener('change',()=>{try{localStorage.setItem(key,auswahl.value);}catch{}zeichnen();});
 zeichnen();mitarbeiterLaden();q.focus();
}
async function mitarbeiterSymbole(){
 const target=document.getElementById('cu-team'),own=document.getElementById('cu-eigenes-bild'),user=S.benutzer?.id;
 if(!target||!darfSchreiben())return;
 mitarbeiterPulsStarten();
 target.replaceChildren(el('button',{type:'button',class:'cu-rund',title:'Mitarbeiterstatus','aria-label':'Alle Mitarbeiter',onclick:mitarbeiterFenster},[icon('users')]));
 await mitarbeiterLaden();if(user!==S.benutzer?.id||!target.isConnected)return;
 const me=TEAM.daten.find(r=>r.id===user);if(own&&me)own.replaceChildren(profilBild(me.bild_url,''));
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
 const rufnummer=el('input',{id:'profil-rufnummer',type:'tel',maxlength:'40',autocomplete:'tel',value:p.rufnummer||''});
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
  el('label',{for:'profil-rufnummer',text:'Rufnummer / Durchwahl (für Mitarbeiter sichtbar)'}),rufnummer,
  el('p',{class:'small muted',text:'Einmal eintragen: Ihre Login-ID und Ihr Bild bleiben in Ihrem CuraAed-Profil gespeichert. Die Login-ID allein stellt noch keine Verbindung zur Telefonanlage her.'}),err
 ]),footer:close=>[el('button',{text:'Abbrechen',onclick:close}),save=el('button',{text:'Speichern',class:'btn-primary',onclick:async()=>{
  if(busy)return;save.disabled=true;file.disabled=true;remove.disabled=true;
  try{await API.put('/mitarbeiterprofile/ich',{revision:p.revision,starface_login_id:login.value,rufnummer:rufnummer.value,...(image!==undefined?{bild:image}:{})});close();await mitarbeiterSymbole();toast('Profil gespeichert','success');}
  catch(e){err.textContent=e.message;save.disabled=false;file.disabled=false;remove.disabled=false;}
 }})]});login.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save.click();}});
}
