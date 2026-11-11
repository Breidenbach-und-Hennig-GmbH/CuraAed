'use strict';
async function einladungDialog(vid){
 const url='/versammlungen/'+vid+'/einladung';let s=await API.get(url),busy=false,closed=false,save;
 const v=s.versammlung,u=formular([{grid:2,felder:[{name:'absender',label:'Einladende Stelle / Person',value:s.daten.absender,required:true},{name:'datum',label:'Einladungsdatum',type:'date',value:s.daten.datum,required:true}]},{felder:[{name:'anschrift',label:'Absenderanschrift',type:'textarea',value:s.daten.anschrift},{name:'einleitung',label:'Einleitung / Zugangsdaten bei Online- oder Hybridversammlungen',type:'textarea',value:s.daten.einleitung,required:true},{name:'schluss',label:'Schlusstext',type:'textarea',value:s.daten.schluss,required:true}]}]);
 for(const [key,max] of Object.entries({absender:200,anschrift:1000,einleitung:5000,schluss:3000})){u.inputs[key].maxLength=max;}
 for(const [key,i] of Object.entries(u.inputs)){const label=u.form.querySelector('label[for="'+i.id+'"]');i.id='einladung-'+key;if(label)label.htmlFor=i.id;}
 const error=el('p',{role:'alert',class:'cu-rechnung-fehler'}),status=el('p',{role:'status',class:'small muted'}),fields=el('fieldset',{disabled:!darfSchreiben(),style:'border:0;padding:0;margin:0'},[u.form]);
 const ort=[v.ort,v.ort_strasse,[v.ort_plz,v.ort_stadt].filter(Boolean).join(' ')].filter(Boolean).join(', ');
 const content=el('div',{},[el('p',{text:v.name+' · Objekt '+v.objekt_nummer+' · '+datum(v.datum)+(v.uhrzeit?' · '+v.uhrzeit+' Uhr':'')}),el('p',{text:'Versammlungsort: '+(ort||'Noch nicht angegeben')}),s.hinweise.length?el('ul',{},s.hinweise.map(text=>el('li',{text}))):null,
  el('details',{},[el('summary',{text:'Enthaltene Tagesordnung · '+s.tops.length+' TOP(s)'}),el('ol',{},s.tops.map(t=>el('li',{text:t.titel})))]),el('p',{class:'small muted',text:'Die PDF enthält den Einladungsbrief, alle Erläuterungen und Beschlussvorschläge der Tagesordnung sowie ein ausfüllbares Vollmachtsformular. Die Angaben unten bleiben für diese Versammlung gespeichert.'}),fields,error,status]);
 const m=modal({titel:'Einladung als PDF · '+v.name,inhalt:content,wide:true,onClose:()=>{closed=true;},footer:close=>[el('button',{type:'button',text:'Schließen',onclick:close}),save=el('button',{type:'button',text:'PDF erstellen',class:'btn-primary',disabled:!darfSchreiben(),onclick:erstellen})]});
 async function erstellen(){
  if(busy||!darfSchreiben()||!u.form.reportValidity())return;busy=true;save.disabled=true;fields.disabled=true;error.textContent='';status.textContent='PDF wird erstellt …';
  try{
   const res=await fetch('/api'+url+'.pdf',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:s.revision,basis_hash:s.basis_hash,daten:u.werte()})});
   if(!res.ok){const data=await res.json().catch(()=>null);throw Error(data?.fehler||'PDF konnte nicht erstellt werden.');}
   if(!res.headers.get('content-type')?.includes('application/pdf'))throw Error('Die Antwort enthält keine PDF.');
   const blob=await res.blob();if(closed)return;const objectUrl=URL.createObjectURL(blob),a=el('a',{href:objectUrl,download:'Einladung-ETV-'+vid+'.pdf'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
   s=await API.get(url);if(!closed){status.textContent='PDF erstellt. Einladungstext gespeichert.';toast('Einladung als PDF erstellt','success');}
  }catch(e){if(!closed){error.textContent=e.message;status.textContent='';}}finally{busy=false;if(!closed){save.disabled=!darfSchreiben();fields.disabled=!darfSchreiben();}}
 }
 u.form.addEventListener('submit',e=>{e.preventDefault();erstellen();});
}
