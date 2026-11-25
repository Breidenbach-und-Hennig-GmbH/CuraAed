'use strict';
async function festkontenDialog(o,jahr) {
  let r;
  try { r=await API.get(`/objekte/${o.id}/festkonten?jahr=${jahr}`); } catch(e) { fehler(e);return; }
  const schreiben=darfSchreiben(), inputs={}, namen=new Map(r.konten.map(k=>[k.nummer,k.bezeichnung]));
  const tabs=el('div',{role:'tablist',style:'display:flex;flex-wrap:wrap;gap:2px;margin-bottom:8px'}), panels=[];
  r.gruppen.forEach((g,i)=>{
    const panel=el('div',{role:'tabpanel',class:'cu-festkonten',id:`fest-panel-${i}`}); panels.push(panel);panel.hidden=i!==0;
    const tab=el('button',{type:'button',class:i===0?'btn-primary':'',role:'tab',id:`fest-tab-${i}`,'aria-controls':panel.id,'aria-selected':i===0?'true':'false',text:g.titel,tabindex:i===0?'0':'-1'});
    panel.setAttribute('aria-labelledby',tab.id);
    const aktivieren=()=>{panels.forEach((p,n)=>{p.hidden=n!==i;});Array.from(tabs.children).forEach((t,n)=>{t.setAttribute('aria-selected',String(n===i));t.classList.toggle('btn-primary',n===i);t.tabIndex=n===i?0:-1;});};
    tab.addEventListener('click',aktivieren);
    tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?r.gruppen.length-1:(i+(e.key==='ArrowRight'?1:-1)+r.gruppen.length)%r.gruppen.length;tabs.children[n].click();tabs.children[n].focus();});
    tabs.appendChild(tab);
    g.felder.forEach(f=>{
      const v=r.werte[f.key];
      const input=el('input',{type:'text',id:`fest-${f.key}`,inputmode:f.typ==='betrag'?'decimal':'numeric',value:v==null?'':f.typ==='betrag'?Number(v).toFixed(2).replace('.',','):String(v),style:'width:7em',readonly:schreiben?null:'readonly'});
      inputs[f.key]=input;
      const info=el('span',{class:'small muted',style:'margin-left:8px',text:f.typ==='konto'&&v?namen.get(Number(v))||'Konto fehlt':''});
      if(f.typ==='konto')input.addEventListener('input',()=>{info.textContent=input.value&&input.value!=='0'?(namen.get(Number(input.value))||'Konto fehlt'):'';});
      panel.appendChild(el('div',{class:'cu-fest-zeile'},[el('label',{for:input.id,text:f.label}),input,info]));
    });
  });
  const m=modal({titel:`Festkonten · Objekt ${UI.objektNummer(o)} · BJ ${jahr}`,wide:false,
    inhalt:el('div',{},[el('p',{class:'small',text:'Zuordnung je Buchungsjahr. 0 = nicht verwendet; leere Felder sind noch nicht belegt. Es werden keine Buchungen oder Zahlungen ausgelöst.'}),tabs,...panels]),
    footer:close=>[el('button',{text:'Abbrechen',onclick:close}),schreiben?el('button',{text:'Speichern',class:'btn-primary',onclick:async e=>{
      e.currentTarget.disabled=true;
      try {await API.put(`/objekte/${o.id}/festkonten?jahr=${jahr}`,{version:r.version,werte:Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]))});close();toast('Festkonten gespeichert','success');}
      catch(err){e.currentTarget.disabled=false;fehler(err);}
    }}):null]});
  m.box.classList.add('cu-hp-eingabe');
}
