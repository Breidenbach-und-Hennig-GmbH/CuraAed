'use strict';
// Tastaturauswahl für bestehende Nummernfelder und dynamische Auswahllisten.
function tippAuswahl(input,spec){
 const wrap=el('span',{class:'cu-suchfeld cu-tippfeld'}),list=el('div',{role:'listbox',class:'cu-such-treffer',hidden:true,id:input.id+'_vorschlaege','aria-label':(spec.label||'Auswahl')+' – Treffer'}),info=el('span',{class:'cu-tipp-status',role:'status','aria-live':'polite'});
 if(input.parentNode)input.parentNode.insertBefore(wrap,input);wrap.append(input,list,info);
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
 let seq=0,timer,rows=[],active=-1,scope='';
 const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
 const reset=()=>{++seq;clearTimeout(timer);rows=[];close();info.textContent='';};
 const choose=row=>{if(input.disabled||String(spec.scope?.()||'')!==scope){reset();return;}reset();input.value=spec.format?spec.format(row):row.label;input.setCustomValidity('');spec.auswaehlen(row);input.dispatchEvent(new Event('change',{bubbles:true}));};
 const mark=i=>{active=i;[...list.children].forEach((n,k)=>n.setAttribute('aria-selected',String(i===k)));input.setAttribute('aria-activedescendant',list.children[i].id);list.children[i].scrollIntoView?.({block:'nearest'});};
 const search=async()=>{
  if(input.disabled)return;const value=input.value.trim(),n=++seq,key=String(spec.scope?.()||'');close();rows=[];scope=key;
  if(!value){info.textContent='';return;}info.textContent='Suche läuft …';
  try{const result=await spec.suchen(value);if(n!==seq||!wrap.isConnected||input.value.trim()!==value||String(spec.scope?.()||'')!==key)return;
   rows=result.filter(r=>!r.disabled).slice(0,25);list.replaceChildren(...rows.map((r,i)=>el('button',{type:'button',role:'option',tabindex:'-1',id:list.id+'_'+i,'aria-selected':'false',text:r.label,onclick:()=>choose(r)})));
   if(!rows.length)list.append(el('p',{class:'small muted',text:'Keine passenden Treffer.'}));list.hidden=false;input.setAttribute('aria-expanded','true');info.textContent=rows.length?(result.length>25?'Mehr als 25 Treffer – bitte genauer eingeben.':rows.length+' Treffer'):'Keine passenden Treffer.';
  }catch{if(n===seq){reset();info.textContent='Suche fehlgeschlagen. Bitte erneut tippen.';list.replaceChildren(el('p',{class:'small muted',text:info.textContent}));list.hidden=false;input.setAttribute('aria-expanded','true');}}
 };
 input.addEventListener('input',e=>{if(e.isComposing)return;reset();spec.bearbeitet?.();timer=setTimeout(search,180);});
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!list.hidden){e.preventDefault();e.stopPropagation();reset();return;}
  if((e.key==='ArrowDown'||e.key==='ArrowUp')&&rows.length){e.preventDefault();list.hidden=false;input.setAttribute('aria-expanded','true');mark(e.key==='ArrowDown'?Math.min(rows.length-1,active+1):active<0?rows.length-1:Math.max(0,active-1));return;}
  if((e.key==='Enter'||e.key==='Tab')&&!list.hidden){
   if(e.key==='Enter'){e.preventDefault();e.stopPropagation();}
   if(active>=0)choose(rows[active]);else if(rows.length===1)choose(rows[0]);if(e.key==='Tab')close();
  }
 });
 input.addEventListener('blur',()=>reset());list.addEventListener('mousedown',e=>e.preventDefault());
 input.addEventListener('focus',()=>{if(input.value.trim()&&spec.sucheBeiFokus)search();});
 return{wrap,reset,search};
}
function tippSelect(select,{label,typ}={}){
 const required=select.required,text=el('input',{id:select.id+'_suche',type:'text',placeholder:(label||'Eintrag')+' – Name oder Nummer tippen …'});
 select.required=false;select.hidden=true;select.before(text);
 const normal=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('de-DE');
 let selected=select.value,editing=false;
 const sync=()=>{text.disabled=select.disabled;text.required=required;if(selected!==select.value||!editing&&document.activeElement!==text){selected=select.value;text.value=select.value?select.selectedOptions[0]?.textContent||'':'';}text.setCustomValidity(required&&!select.value?'Bitte einen Treffer auswählen.':'');};
 const control=tippAuswahl(text,{label,sucheBeiFokus:true,suchen:async query=>{
  const local=[...select.options].filter(o=>o.value&&normal(o.textContent).includes(normal(query))).map(o=>({value:o.value,label:o.textContent,disabled:o.disabled}));
  if(typ!=='objekt')return local;
  const remote=await tippSuche('objekt',query);
  return [...new Map([...local,...remote].map(r=>[String(r.value),r])).values()];
 },bearbeitet:()=>{editing=true;selected='';select.value='';text.setCustomValidity(text.value.trim()?'Bitte einen Treffer auswählen.':required?'Bitte einen Treffer auswählen.':'');select.dispatchEvent(new Event('change',{bubbles:true}));editing=false;},auswaehlen:row=>{
  if(![...select.options].some(o=>o.value===String(row.value)))select.append(el('option',{value:row.value,text:row.label}));
  select.value=String(row.value);selected=select.value;text.setCustomValidity('');select.dispatchEvent(new Event('change',{bubbles:true}));
 }});
 // Vorhandene Formulare können Optionen und Sperren weiterhin dynamisch ändern.
 new MutationObserver(()=>{control.reset();sync();}).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label']});
 select.addEventListener('change',()=>{sync();});
 text.addEventListener('focus',sync);
 const labelNode=select.closest('.field')?.querySelector('label');if(labelNode)labelNode.htmlFor=text.id;
 sync();return control;
}
async function tippSuche(typ,suche,{objektId}={}){
 const url=typ==='einheit'&&objektId?'/objekte/'+encodeURIComponent(objektId)+'/einheiten':{objekt:'/objekte',einheit:'/einheiten',handwerker:'/adressen',adresse:'/adressen'}[typ];
 if(!url)throw new Error('Unbekannte Suchart');
 const result=await API.get(url+API.qs({suche})),rows=Array.isArray(result)?result:result.eintraege||[];
 return rows.map(r=>({...r,value:r.id,label:[r.nummer,r.anzeigename||r.bezeichnung||r.firmenname||[r.vorname,r.nachname].filter(Boolean).join(' '),[r.strasse||r.lage,r.plz,r.ort||r.objekt_bezeichnung].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}));
}
