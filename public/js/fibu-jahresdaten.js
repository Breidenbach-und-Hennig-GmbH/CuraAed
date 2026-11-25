'use strict';
async function fibuJahresdatenDialog(o,jahr){
  let r;try{r=await API.get(`/objekte/${o.id}/fibu-jahresdaten?jahr=${jahr}`);}catch(e){fehler(e);return;}
  const schreiben=darfSchreiben(),inputs={},bankZeilen=[],panels=[],tabs=el('div',{role:'tablist',style:'display:flex;flex-wrap:wrap;gap:2px;margin-bottom:8px'});
  const gruppen=[{titel:'Buchungsjahr',keys:['zeitraum_von','zeitraum_bis','gebucht_bis','letzte_stapelnummer']},
    {titel:'Merkmale',keys:['erfassungsobjekt','sev_mv_mg_gzv','automatische_leerstandsbuchung','druck_netto_werte','abweichender_abrechnungszeitraum','sollversteuerung','waehrung','buchungsperioden_vorhanden']},
    {titel:'Weitere Angaben',keys:['sachbearbeiter','vorsteuer_abzugsquote','objekt_fremdnummer','beendet_am']},{titel:'E-Banking',keys:[]}];
  const jaNein=v=>el('select',{},[['','– nicht belegt –'],['0','Nein'],['1','Ja']].map(([value,text])=>el('option',{value,text,selected:value===(v==null?'':v?'1':'0')?'selected':null})));
  gruppen.forEach((g,i)=>{
    const panel=el('div',{role:'tabpanel',id:`fij-panel-${i}`});panels.push(panel);panel.hidden=i!==0;
    const tab=el('button',{type:'button',role:'tab',id:`fij-tab-${i}`,'aria-controls':panel.id,'aria-selected':String(i===0),tabindex:i===0?'0':'-1',class:i===0?'btn-primary':'',text:g.titel});panel.setAttribute('aria-labelledby',tab.id);
    tab.addEventListener('click',()=>{panels.forEach((p,n)=>p.hidden=n!==i);Array.from(tabs.children).forEach((t,n)=>{t.setAttribute('aria-selected',String(n===i));t.tabIndex=n===i?0:-1;t.classList.toggle('btn-primary',n===i);});});
    tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?gruppen.length-1:(i+(e.key==='ArrowRight'?1:-1)+gruppen.length)%gruppen.length;tabs.children[n].click();tabs.children[n].focus();});tabs.appendChild(tab);
    for(const key of g.keys){const f=r.felder.find(f=>f.key===key),v=r.werte[key],input=f.typ==='bool'?jaNein(v):el('input',{type:'text',inputmode:['nummer','quote'].includes(f.typ)?'decimal':null,placeholder:f.typ==='datum'?'TT.MM.JJJJ':null,value:v==null?'':f.typ==='datum'?String(v).split('-').reverse().join('.'):String(v)});input.id='fij-'+key;if(!schreiben)input.disabled=true;inputs[key]=input;panel.appendChild(el('div',{class:'cu-fest-zeile'},[el('label',{for:input.id,text:f.label}),input]));}
  });
  const bankListe=el('div',{},[el('div',{class:'cu-fibu-bankzeile small'},[el('span',{text:'HP-Nr.'}),el('span',{text:'Konto'}),el('span',{text:'Bezeichnung',class:'cu-fibu-bankname'}),el('span',{text:'Aktiv'}),el('span')])]);
  function bankZeile(b={lfdnr:'',konto:null,aktiv:null}){
    const nr=el('input',{type:'text',inputmode:'numeric',value:String(b.lfdnr),'aria-label':'HP-Bankverbindung Nr.'}),konto=el('input',{type:'text',inputmode:'numeric',value:b.konto==null?'':String(b.konto),'aria-label':'E-Banking-Konto'}),aktiv=jaNein(b.aktiv);aktiv.setAttribute('aria-label','Bankverbindung aktiv');
    const name=el('span',{class:'small muted cu-fibu-bankname'}),zeigen=()=>{const k=r.konten.find(k=>k.nummer===Number(konto.value));name.textContent=konto.value&&konto.value!=='0'?(k?.bezeichnung||'Bankkonto fehlt'):konto.value==='0'?'Nicht zugeordnet':'';};zeigen();konto.addEventListener('input',zeigen);
    const row={nr,konto,aktiv};bankZeilen.push(row);
    const zeile=el('div',{role:'group','aria-label':'Bankzuordnung',class:'cu-fibu-bankzeile'},[nr,konto,name,aktiv]);
    if(schreiben)zeile.appendChild(el('button',{type:'button',text:'×','aria-label':'Zuordnung entfernen',title:'Zuordnung entfernen',onclick:()=>{bankZeilen.splice(bankZeilen.indexOf(row),1);zeile.remove();}}));else[nr,konto,aktiv].forEach(e=>e.disabled=true);bankListe.appendChild(zeile);
  }
  r.banken.forEach(bankZeile);panels[3].append(el('p',{class:'small',text:'Zuordnung nach der laufenden Nummer in HausPerfekt. 0 = kein E-Banking-Konto zugeordnet. Der Aktivstatus ist unabhängig von der Kontozuordnung.'}),bankListe);
  if(schreiben)panels[3].appendChild(el('button',{type:'button',text:'Bankzuordnung hinzufügen',onclick:()=>{if(bankZeilen.length<100)bankZeile();}}));
  const m=modal({titel:`Jahresdaten · Objekt ${UI.objektNummer(o)} · BJ ${jahr}`,wide:false,
    inhalt:el('div',{},[el('p',{class:'small',text:'Jahresgrundwerte und Bankzuordnungen. Leer = noch nicht belegt. Automatische Buchungen oder Zahlungen werden hier nicht ausgelöst.'}),tabs,...panels]),
    footer:close=>[el('button',{text:'Abbrechen',onclick:close}),schreiben?el('button',{text:'Speichern',class:'btn-primary',onclick:async e=>{
      e.currentTarget.disabled=true;try{await API.put(`/objekte/${o.id}/fibu-jahresdaten?jahr=${jahr}`,{version:r.version,werte:Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,r.felder.find(f=>f.key===k).typ==='datum'&&/^\d{2}\.\d{2}\.\d{4}$/.test(v.value)?v.value.split('.').reverse().join('-'):v.value])),banken:bankZeilen.map(b=>({lfdnr:b.nr.value,konto:b.konto.value,aktiv:b.aktiv.value===''?null:b.aktiv.value}))});close();toast('Jahresdaten gespeichert','success');}catch(err){e.currentTarget.disabled=false;fehler(err);}
    }}):null]});m.box.classList.add('cu-hp-eingabe');
}
