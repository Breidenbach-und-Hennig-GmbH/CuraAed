'use strict';
const HWA_CODES={status:Object.fromEntries(Object.entries(HWA_STATI).map(([k,v])=>[k,v.workflow])),art:{'01':'normal','02':'eilauftrag','03':'notdienst','04':'angebot'}};
function hwaDatumEingabe(v){
 const n=String(v||'').trim();if(!n)return '';
 if(/^\d{4}-\d{2}-\d{2}$/.test(n))return n;
 const m=/^(\d{2})\.?(\d{2})\.?(\d{2}|\d{4})$/.exec(n);if(!m)throw new Error('Datum bitte als TT.MM.JJ eingeben.');
 const iso=(m[3].length===2?'20'+m[3]:m[3])+'-'+m[2]+'-'+m[1],d=new Date(iso+'T00:00:00Z');
 if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==iso)throw new Error('Ungültiges Datum.');return iso;
}
const hwaDatumKurz=v=>v?datum(v).replace(/(\d{2}\.\d{2}\.)\d{2}(\d{2})/,'$1$2'):'';

async function handwerkerStart(){
 const lauf=S.lauf;try{
  const list=await API.get('/vorgaenge?art=handwerker');if(lauf!==S.lauf)return;
  const id=list.eintraege.some(r=>r.id===S.hwaLetzter)?S.hwaLetzter:list.eintraege[0]?.id;
  const r=id?await API.get('/vorgaenge/'+id):hwaLeereAnzeige();if(lauf!==S.lauf)return;handwerkerMaske(r);
 }catch(e){if(lauf===S.lauf)fehler(e);}
}
function hwaLeereAnzeige(){return{id:null,art:'handwerker',titel:'',text:'',status:'offen',bezuege:[],verlauf:[],rechnungen:[],auftrag:{auftragsart:'normal',kommunikation:{telefone:[],emails:[],ansprechpartner:[]},adressaten_details:[],dokumente:[]}};}

async function handwerkerErfassung(r={},options={}){
 if(!darfSchreiben())return;
 if(document.querySelector('.cu-hwa-form')&&!options.kopieren){document.querySelector('.cu-hwa-form input:not([readonly]):not([disabled])')?.focus();return;}
 const lauf=S.lauf;let users;try{users=await API.get('/mitarbeiter');}catch(e){fehler(e);return;}if(lauf!==S.lauf)return;
 if(!document.querySelector('.cu-hwa-inhalt'))handwerkerMaske(r.id?r:hwaLeereAnzeige());
 const host=options.container||document.querySelector('.cu-hwa-inhalt'),source=options.vorlage||r,a=source.auftrag||{},f={},refs={},people=(a.adressaten_details||[]).map(p=>({...p}));
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let changed=false,busy=false,closed=false;const form=el('form',{id:'hwa-form',class:'cu-hwa-form cu-hwa-erfassung',autocomplete:'off','aria-label':r.id?'Handwerkerauftrag bearbeiten':'Neuanlage Handwerkerauftrag'}),error=el('p',{role:'alert',class:'cu-hwa-fehler'});
 function input(k,value='',attrs={}){const i=el('input',{id:'f_'+k,name:k,type:'text',value:value??'',...attrs});f[k]=i;return i;}
 function field(label,i,cls=''){return el('div',{class:'hwa-feld '+cls},[el('label',{for:i.id,text:label}),i.tippWrap||i]);}
 function date(k,v){const i=input(k,hwaDatumKurz(v),{maxlength:10,placeholder:'TT.MM.JJ'});i.addEventListener('blur',()=>{try{i.setCustomValidity('');if(i.value)i.value=hwaDatumKurz(hwaDatumEingabe(i.value));}catch(e){i.setCustomValidity(e.message);}});i.addEventListener('input',()=>i.setCustomValidity(''));return i;}
 function coded(k,value,codes,labels){const i=input(k,Object.keys(codes).find(c=>codes[c]===value)||Object.keys(codes)[0],{maxlength:3,class:'hwa-code'}),hint=el('span',{class:'hwa-aufgeloest'});
  function refresh(){const key=i.value.trim().padStart(k==='status'?3:2,'0');hint.textContent=labels[codes[key]]||'Unbekannter Schlüssel';i.setCustomValidity(codes[key]?'':'Unbekannter Schlüssel.');}i.addEventListener('input',refresh);i.addEventListener('blur',()=>{i.value=i.value.trim().padStart(k==='status'?3:2,'0');refresh();});refresh();return el('div',{class:'hwa-schluessel'},[field(k==='status'?'Status:':'Auftragsart:',i),hint]);}
 function number(k,typ,value,row){
  const i=input(k,value||'',{maxlength:100,class:'hwa-nummer'}),hint=el('span',{class:'hwa-aufgeloest','aria-live':'polite',id:'hwa-name-'+k});i.setAttribute('aria-describedby',hint.id);
  const state={i,hint,row:row?.id?row:null,key:null,seq:0};refs[k]=state;hint.textContent=row?.id?(hwaName(row)||row.titel):'';
  const fingerprint=()=>i.value.trim()+'|'+(typ==='einheit'?refs.objekt_nr?.i.value.trim():'');
  if(state.row)state.key=fingerprint();
  state.resolve=async()=>{
   const key=fingerprint();if(state.row&&state.key===key)return state.row;
   const n=++state.seq,value=i.value.trim();state.row=null;state.key=null;i.setCustomValidity('');i.removeAttribute('aria-invalid');
   if(!value){hint.textContent='';return null;}
   hint.textContent='…';try{
    const objekt=typ==='einheit'?await refs.objekt_nr.resolve():null;
    if(typ==='einheit'&&!objekt)throw new Error('Bitte zuerst die Objekt-Nr. eingeben.');
    const found=await API.post('/vorgaenge/hwa-nummer',{typ,nummer:value,...(objekt?{objekt_id:objekt.id}:{})});
    if(n!==state.seq||fingerprint()!==key||closed||lauf!==S.lauf)return null;
    state.row=found;state.key=key;hint.textContent=[found.anzeigename,[found.strasse,found.plz,found.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · ');return found;
   }catch(e){if(n===state.seq&&fingerprint()===key&&!closed){hint.textContent=e.message;i.setCustomValidity(e.message);i.setAttribute('aria-invalid','true');}throw e;}
  };
  i.addEventListener('input',()=>{state.seq++;state.row=null;state.key=null;hint.textContent='';i.setCustomValidity('');i.removeAttribute('aria-invalid');if(k==='objekt_nr'&&refs.wohnung_nr){refs.wohnung_nr.seq++;refs.wohnung_nr.row=null;refs.wohnung_nr.key=null;refs.wohnung_nr.hint.textContent='';refs.wohnung_nr.i.value='';refs.wohnung_nr.control?.reset();}});
  if(['objekt','einheit','handwerker','adresse'].includes(typ)&&typeof tippAuswahl==='function'){
   state.control=tippAuswahl(i,{label:typ==='einheit'?'Wohnung':typ==='objekt'?'Objekt':'Name / Firma',scope:()=>typ==='einheit'?refs.objekt_nr?.i.value:'',format:found=>String(found.nummer),suchen:async suche=>{
    const objekt=typ==='einheit'?await refs.objekt_nr.resolve():null;
    if(typ==='einheit'&&!objekt)throw new Error('Bitte zuerst ein Objekt wählen.');
    return tippSuche(typ,suche,{objektId:objekt?.id});
   },auswaehlen:found=>{
    changed=true;state.seq++;state.row=found;state.key=fingerprint();hint.textContent=found.anzeigename||found.bezeichnung||found.label;
    if(k==='objekt_nr'&&refs.wohnung_nr){const unit=refs.wohnung_nr;unit.seq++;unit.row=null;unit.key=null;unit.i.value='';unit.hint.textContent='';unit.control?.reset();}
   }});i.tippWrap=state.control.wrap;
  }
  i.addEventListener('blur',()=>state.resolve().catch(()=>{}));return {i,hint};
 }
 const header=el('fieldset',{class:'hwa-block hwa-stamm'},[el('legend',{text:r.id?'Handwerkerauftrag bearbeiten':'Neuanlage Handwerkerauftrag'})]);
 const nr=input('auftrags_nr',r.id?hwaNr(r):'automatisch',{readonly:true,tabindex:'-1',class:'hwa-nummer'}),vorgang=input('vorgang',a.vorgang||'',{maxlength:40,class:'hwa-code'});
 const kopieren=el('button',{type:'button',text:'Kopieren',tabindex:'-1',disabled:!S.kontext.hwaRecord?.id,onclick:()=>handwerkerErfassung({}, {container:host,kopieren:true,vorlage:S.kontext.hwaRecord})});
 const sbUser=users.find(u=>u.id===(r.zustaendig_id??S.benutzer.id)),sb=input('zustaendig_id',sbUser?.kuerzel||'',{maxlength:3,class:'hwa-code'}),sbName=el('span',{class:'hwa-aufgeloest',text:sbUser?.name||''});let sbId=sbUser?.id||null;
 function resolveSB(){const code=sb.value.trim().toUpperCase();sb.value=code;const matches=users.filter(u=>u.kuerzel?.toUpperCase()===code);sbId=matches.length===1?matches[0].id:null;sbName.textContent=matches.length===1?matches[0].name:code?'Kürzel nicht eindeutig oder unbekannt':'';sb.setCustomValidity(code&&matches.length!==1?'Sachbearbeiter-Kürzel nicht eindeutig oder unbekannt.':'');return sbId;}
 sb.addEventListener('input',()=>{sbId=null;sb.setCustomValidity('');sbName.textContent='';});sb.addEventListener('blur',resolveSB);if(r.id&&r.benutzer_id!==S.benutzer.id)sb.disabled=true;
 header.append(el('div',{class:'hwa-zeile'},[field('Auftrags-Nr.:',nr),field('Vorgang:',vorgang),kopieren]),el('div',{class:'hwa-zeile'},[coded('status',options.vorlage?'004':a.status_code||'004',Object.fromEntries(Object.keys(HWA_STATI).map(k=>[k,k])),Object.fromEntries(Object.entries(HWA_STATI).map(([k,v])=>[k,v.text]))),field('Betrag:',input('betrag',a.betrag||'',{inputmode:'decimal',maxlength:13,class:'hwa-betrag'}))]),el('div',{class:'hwa-zeile'},[field('Firma:',input('firma',a.firma||'',{maxlength:30,class:'hwa-firma'})),field('Sachbearbeiter:',sb),sbName]));
 const akte=number('akte_nr','akte',a.akte_id?'CA-'+a.akte_id:'',a.akte_id?{id:a.akte_id,titel:'CA-'+a.akte_id}:null),obj=number('objekt_nr','objekt',a.objekt?.nummer||'',a.objekt),unit=number('wohnung_nr','einheit',a.einheit?.nummer||'',a.einheit);
 if(unit.i.value&&obj.i.value)refs.wohnung_nr.key=unit.i.value.trim()+'|'+obj.i.value.trim();
 const zuordnung=el('div',{class:'hwa-block hwa-zuordnung'},[el('div',{class:'hwa-zeile'},[field('Akte:',akte.i),akte.hint,field('Objekt:',obj.i),field('Wohnung:',unit.i)]),el('div',{class:'hwa-namen'},[obj.hint,unit.hint])]);
 const hw=number('handwerker_nr','handwerker',a.handwerker?.nummer||'',a.handwerker);
 const datumBlock=el('div',{class:'hwa-block hwa-termine'},[field('Datum:',date('datum',options.vorlage?today:a.datum||today)),field('Termin:',date('faellig_am',options.vorlage?'':source.faellig_am||'')),field('Sachkonto:',input('sachkonto',a.sachkonto||'0',{maxlength:20,class:'hwa-nummer'})),field('erledigt:',date('erledigt_am',options.vorlage?'':a.erledigt_am||''))]);
 function flag(k,label){const i=input(k,'',{type:'checkbox',checked:a[k]!==false});return el('label',{class:'hwa-flag',for:i.id},[i,document.createTextNode(label)]);}
 const handwerker=el('fieldset',{class:'hwa-block hwa-handwerker'},[el('legend',{text:'Handwerker'}),field('Adress-Nr.:',hw.i),hw.hint,el('div',{class:'hwa-druck'},[flag('rechnungsempfaenger_drucken','Rechnungsempfänger drucken'),flag('leistungsempfaenger_drucken','Leistungsempfänger drucken'),field('PFkt.:',input('pfkt',a.pfkt||'010',{maxlength:3,class:'hwa-code'}))])]);
 const titel=input('titel',source.titel||'',{maxlength:500,required:true}),titel2=input('betreff2',a.betreff2||'',{maxlength:500,'aria-label':'Betreff zweite Zeile'});
 const betreff=el('fieldset',{class:'hwa-block hwa-betreff-eingabe'},[el('legend',{text:'Betreff'}),el('label',{class:'sr-only',for:titel.id,text:'Betreff'}),titel,titel2]);
 const text=el('textarea',{id:'f_text',name:'text',rows:3,maxlength:65535,text:source.text||a.originaltext||''});f.text=text;
 const peopleBox=el('div'),newPerson=number('adressat_neu','adresse','',null);
 function showPeople(){peopleBox.replaceChildren(...people.map(p=>{const desc=el('input',{'aria-label':'Funktion von '+hwaName(p),value:p.bezeichnung||'',maxlength:100,oninput:e=>p.bezeichnung=e.target.value});return el('div',{class:'hwa-zeile'},[el('span',{text:hwaName(p)}),desc,el('button',{type:'button',text:'Entfernen',onclick:()=>{people.splice(people.indexOf(p),1);changed=true;showPeople();}})]);}));}showPeople();
 async function addPerson(){if(!newPerson.i.value.trim())return;const row=await refs.adressat_neu.resolve();if(!row)throw new Error('Adressat bitte erneut prüfen.');if(!people.some(p=>p.id===row.id))people.push({...row,bezeichnung:'Ansprechpartner vor Ort'});newPerson.i.value='';refs.adressat_neu.row=null;refs.adressat_neu.key=null;newPerson.hint.textContent='';changed=true;showPeople();}
 const extras=el('details',{class:'hwa-zusatz'},[el('summary',{text:'Auftragstext / weitere Angaben'}),field('Auftragstext:',text),coded('auftragsart',a.auftragsart||'normal',HWA_CODES.art,HWA_ART),field('Gewährleistung:',date('gewaehrleistung_bis',a.gewaehrleistung_bis||'')),field('Hinweise:',input('garantie_notiz',a.garantie_notiz||'',{maxlength:2000})),el('h3',{text:'Weitere Adressaten'}),peopleBox,el('div',{class:'hwa-zeile'},[field('Adress-Nr.:',newPerson.i),newPerson.hint,el('button',{type:'button',text:'Hinzufügen',onclick:()=>addPerson().catch(e=>error.textContent=e.message)})])]);
 function cancel(){closed=true;if(options.onCancel){options.onCancel();return;}const current=S.kontext.hwaRecord;if(current)handwerkerMaske(current);else handwerkerStart();}
 const save=el('button',{type:'submit',class:'btn-primary',text:'OK'}),cancelButton=el('button',{type:'button',text:'Abbrechen',onclick:cancel});
 if(options.ticketQuelle)form.append(el('p',{class:'hp-hinweis',text:'Übernommen aus '+options.ticketQuelle.nummer+' · Objekt, Wohnung, Ansprechpartner und Beschreibung bitte prüfen.'}));
 form.append(header,zuordnung,el('div',{class:'hwa-mitte'},[datumBlock,handwerker]),el('div',{class:'hwa-abschluss'},[betreff,el('div',{class:'hwa-form-knopf'},[save,cancelButton])]),extras,error);
 if(options.vorlage)changed=true;form.addEventListener('input',()=>{changed=true;});form.addEventListener('change',()=>{changed=true;});
 form.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(e.ctrlKey||!changed)cancel();else form.requestSubmit();}
  if(e.key==='F4'){e.preventDefault();e.stopPropagation();}
  if(e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.type!=='checkbox'){
   e.preventDefault();
   const fields=[...form.querySelectorAll('input:not([readonly]):not([disabled]):not([type="hidden"]),textarea,button:not([disabled]):not([tabindex="-1"]),summary')]
    .filter(field=>!field.closest('details:not([open])')||field.tagName==='SUMMARY');
   fields[fields.indexOf(e.target)+1]?.focus();
  }
 });
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;save.disabled=true;error.textContent='';let current;
  try{
   const values={};for(const [k,i] of Object.entries(f))values[k]=i.type==='checkbox'?i.checked:i.value.trim();
   values.status=values.status.padStart(3,'0');values.auftragsart=values.auftragsart.padStart(2,'0');
   if(!HWA_CODES.status[values.status])throw new Error('Ungültiger Statusschlüssel.');
   for(const k of ['akte_nr','objekt_nr','wohnung_nr','handwerker_nr']){current=refs[k].i;await refs[k].resolve();}
   if(!sb.disabled)resolveSB();await addPerson();if(!form.reportValidity())return;
   const dates={};for(const k of ['datum','faellig_am','erledigt_am','gewaehrleistung_bis']){current=f[k];dates[k]=hwaDatumEingabe(f[k].value);}
   const auftrag={status_code:values.status,handwerker_id:refs.handwerker_nr.row?.id||null,objekt_id:refs.objekt_nr.row?.id||null,einheit_id:refs.wohnung_nr.row?.id||null,akte_id:refs.akte_nr.row?.id||null,firma:values.firma,auftragsart:HWA_CODES.art[values.auftragsart],datum:dates.datum,erledigt_am:dates.erledigt_am,betrag:values.betrag,gewaehrleistung_bis:dates.gewaehrleistung_bis,garantie_notiz:values.garantie_notiz,vorgang:values.vorgang,sachkonto:values.sachkonto,pfkt:values.pfkt,betreff2:values.betreff2,rechnungsempfaenger_drucken:values.rechnungsempfaenger_drucken,leistungsempfaenger_drucken:values.leistungsempfaenger_drucken,adressaten:people.map(p=>({adresse_id:p.id,bezeichnung:p.bezeichnung||'',...(p.kontakt_name?{kontakt_name:p.kontakt_name}:{}),...(p.kontakt_telefon?{kontakt_telefon:p.kontakt_telefon}:{})}))};
   const body={art:'handwerker',titel:values.titel,text:f.text.value,status:(dates.erledigt_am||(r.id&&source.status==='erledigt'&&values.status===(a.status_code||'004')))?'erledigt':HWA_CODES.status[values.status],prioritaet:source.prioritaet||'normal',faellig_am:dates.faellig_am||null,uhrzeit:r.uhrzeit||null,zustaendig_id:sb.disabled?r.zustaendig_id:sbId,revision:r.revision,auftrag};
   const result=options.ticketQuelle?await API.post('/tickets/'+options.ticketQuelle.id+'/handwerkerauftraege',{...body,ticket_revision:options.ticketQuelle.revision,basis_hash:options.ticketQuelle.basis_hash,entwurf_id:options.ticketQuelle.entwurf_id}):r.id?await API.put('/vorgaenge/'+r.id,body):await API.post('/vorgaenge',body);closed=true;toast('Handwerkerauftrag gespeichert','success');geheZu('#/vorgaenge/'+result.id);glockeAktualisieren();
  }catch(err){error.textContent=err.message;current?.focus();}finally{busy=false;save.disabled=false;}
 });
 host.replaceChildren(form);f.vorgang.focus();
}
