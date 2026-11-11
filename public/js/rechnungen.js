'use strict';
let rechnungOeffnet=false;
function rechnungsReferenz(d){return d.hp?{typ:'hp',quelle:d.hp.quelle,id:d.hp.datei}:{typ:'archiv',id:d.dokument_id||d.id};}
function rechnungAktuell(){
 const dialog=[...document.querySelectorAll('.modal')].at(-1);
 const d=dialog?dialog.hpRechnungsDokument:(document.activeElement?.closest('tr')?.hpDaten||S.kontext?.rechnungsDokument);
 if(!d||(!d.hp&&!d.original_name&&!d.dokument_id)){toast('Bitte zuerst ein Dokument auswählen.');return;}
 rechnungMaske(d).catch(fehler);
}
async function rechnungMaske(dokument,kontext={}){
 if(!darfSchreiben()||rechnungOeffnet)return;rechnungOeffnet=true;
 const lauf=S.lauf,ref=rechnungsReferenz(dokument);let result;
 try{result=await API.get('/eingangsrechnungen/dokument'+API.qs(ref));}finally{rechnungOeffnet=false;}
 if(lauf!==S.lauf)return;
 if(document.querySelector('.cu-rechnungsmaske'))return;
 const doc=result.dokument,saved=result.rechnung,today=new Date().toLocaleDateString('sv-SE'),f={},prüf=saved?.pruefungen||{};
 const defaults={lieferantenkonto:'',bankverbindung:'000',rechnungs_nr:'',rechnungsbeleg:doc.titel||doc.original_name||'',rechnungsdatum:doc.dokument_datum?.slice(0,10)||'',eingangsdatum:today,betrag:'0,00',anerkannt:'0,00',hndl_re:'0,00',hndl_teil:'0,00',bagatellgrenze:'0,00',teilzahlung:'0,00',netto_tage:'',ziel1_tage:'',ziel2_tage:'',ziel1_skonto:'0,00',ziel2_skonto:'0,00',objekt_nr:(doc.verknuepfungen?.filter(r=>r.typ==='objekt').length===1?doc.verknuepfungen.find(r=>r.typ==='objekt').nummer:''),buchungskonto:'',bank_verb_nr:'000',steuerschluessel:'000',buchungstext:'',buchungstext2:'',buchungstext3:'',verwendungszweck1:'',verwendungszweck2:'',hwa_nr:kontext.hwa?'CA-'+kontext.hwa.id:'',akte:kontext.hwa?.auftrag?.akte_id?'CA-'+kontext.hwa.auftrag.akte_id:'',faelligkeit:'',fibu_bj:String(new Date().getFullYear()),notiz:'',rechnerisch_richtig:false,sachlich_richtig:false,zahlung_freigegeben:false,abgrenzen:false,zahlungsart:'ueberweisung'};
 if(kontext.hwa){defaults.objekt_nr=kontext.hwa.auftrag?.objekt?.nummer||defaults.objekt_nr;defaults.lieferantenkonto=kontext.hwa.auftrag?.handwerker?.lkto_nr||'';}
 const erkannt=result.erkennung?.rechnung?result.erkennung:null;const values={...defaults,...(!saved?erkannt?.felder:{}),...saved?.daten};let revision=saved?.revision||0,closed=false,busy=false;
 const form=el('form',{class:'cu-rechnungsmaske',autocomplete:'off'}),alert=el('p',{role:'alert',class:'cu-rechnung-fehler'}),nameInfo=el('span',{class:'small muted'}),calcHints={};
 const cents=v=>{const s=String(v);if(!/^-?\d{1,9}(,\d{1,2})?$/.test(s))return null;const [w,p='']=s.replace('-','').split(',');return(Number(w)*100+Number(p.padEnd(2,'0')))*(s.startsWith('-')?-1:1);};
 const euros=n=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n/100);
 function input(k,label,type='text',extra={}){
  const i=el('input',{id:'rechnung-'+k,name:k,type,value:values[k]??'',...extra});f[k]=i;
  if(['betrag','anerkannt','hndl_re','hndl_teil','bagatellgrenze','teilzahlung','ziel1_skonto','ziel2_skonto'].includes(k)){i.inputMode='decimal';i.addEventListener('blur',()=>{const n=cents(i.value);if(n!==null)i.value=(n/100).toFixed(2).replace('.',',');update();});}
  return el('div',{class:'cu-rechnung-zeile'},[el('label',{for:i.id,text:label}),i]);
 }
 function check(k,label){const i=el('input',{id:'rechnung-'+k,name:k,type:'checkbox',checked:values[k]});f[k]=i;
  const stamp=prüf[k],text=stamp?(stamp.sb||stamp.benutzer)+' · '+new Date(stamp.zeit).toLocaleString('de-DE'):'SB: – · Datum/Zeit: –';
  return el('div',{class:'cu-rechnung-pruefung'},[el('label',{for:i.id,class:'check-inline'},[i,document.createTextNode(' '+label)]),k==='abgrenzen'?null:el('span',{class:'small muted',text})]);
 }
 function card(cls,children){return el('section',{class:'cu-karte '+cls},children);}
 function addDays(date,n){if(!date||n===''||!/^\d{1,3}$/.test(n))return null;const d=new Date(date+'T12:00:00Z');if(Number.isNaN(d.valueOf()))return null;d.setUTCDate(d.getUTCDate()+Number(n));return d.toISOString().slice(0,10);}
 function update(){
  const amount=cents(f.betrag.value);for(const nr of [1,2]){const percent=cents(f['ziel'+nr+'_skonto'].value),day=addDays(f.rechnungsdatum.value,f['ziel'+nr+'_tage'].value);calcHints[nr].textContent=(amount!==null&&percent!==null?euros(Math.round(amount*percent/10000)):'–')+' / '+(day?datum(day):'–');}
 }
 function terms(){const box=el('div',{},[el('p',{text:'Zahlungsbedingungen für diese Rechnung'}),el('p',{text:'Rein netto: '+(f.netto_tage.value||'–')+' Tage · Basis: Rechnungsdatum'}),el('p',{text:'Ziel 1: '+(f.ziel1_tage.value||'–')+' Tage / '+f.ziel1_skonto.value+' %'}),el('p',{text:'Ziel 2: '+(f.ziel2_tage.value||'–')+' Tage / '+f.ziel2_skonto.value+' %'})]);modal({titel:'Zahlungsbedingungen',inhalt:box,footer:close=>[el('button',{text:'Nettofälligkeit übernehmen',onclick:()=>{const d=addDays(f.rechnungsdatum.value,f.netto_tage.value);if(d){f.faelligkeit.value=d;f.faelligkeit.dispatchEvent(new Event('input',{bubbles:true}));close();}else fehler(new Error('Bitte Rechnungsdatum und Nettotage eingeben.'));}}),el('button',{text:'Schließen',onclick:close})]});}
 function note(){const text=el('textarea',{'aria-label':'Notiz zur Rechnung',rows:8,maxlength:4000,value:f.notiz.value});modal({titel:'Z.I.S. / Notiz zur Rechnung',inhalt:el('div',{},[el('p',{class:'small muted',text:'Die Notiz wird mit der Rechnung gespeichert.'}),text]),footer:close=>[el('button',{text:'Übernehmen',class:'btn-primary',onclick:()=>{f.notiz.value=text.value;f.notiz.dispatchEvent(new Event('input',{bubbles:true}));close();}}),el('button',{text:'Abbrechen',onclick:close})]});}
 function partial(){const i=el('input',{'aria-label':'Teilzahlung in EUR',value:f.teilzahlung.value,inputmode:'decimal'});modal({titel:'Teilzahlung erfassen',inhalt:el('div',{},[el('p',{text:'Bereits geleisteter Teilbetrag (EUR)'}),i]),footer:close=>[el('button',{text:'Übernehmen',class:'btn-primary',onclick:()=>{if(cents(i.value)===null){fehler(new Error('Bitte einen gültigen Betrag eingeben.'));return;}f.teilzahlung.value=i.value;f.teilzahlung.dispatchEvent(new Event('input',{bubbles:true}));close();}}),el('button',{text:'Abbrechen',onclick:close})]});}
 function handwerker(){const total=cents(f.betrag.value),part=cents(f.teilzahlung.value),hndl=cents(f.hndl_re.value);if(total===null||!total||part===null||hndl===null){fehler(new Error('Bitte Rechnungsbetrag, Teilzahlung und HNDL-Anteil prüfen.'));return;}f.hndl_teil.value=(Math.round(hndl*part/total)/100).toFixed(2).replace('.',',');f.hndl_teil.dispatchEvent(new Event('input',{bubbles:true}));}
 const header=el('div',{class:'cu-rechnung-kopf'},[el('span',{text:'Lfd. Nr.: '+(saved?'CA-R-'+saved.id:'wird beim Speichern vergeben')}),el('strong',{text:'Eingangsrechnung erfassen'}),el('span',{text:'erfasst SB: '+(saved?.erfasst_sb||saved?.erfasst_name||S.benutzer?.kuerzel||S.benutzer?.name||'–')+' · Datum/Zeit: '+(saved?new Date(saved.erstellt_am.replace(' ','T')+'Z').toLocaleString('de-DE'):new Date().toLocaleString('de-DE'))})]);
 const payment=el('fieldset',{class:'cu-rechnung-zahlungsart'},[el('legend',{text:'Zahlungsart'})]);
 for(const [value,label] of [['ueberweisung','Überweisung'],['abbuchung','Abbuchung']])payment.append(el('label',{class:'check-inline'},[el('input',{type:'radio',name:'zahlungsart',value,checked:values.zahlungsart===value}),document.createTextNode(' '+label)]));
 const left=el('div',{class:'cu-rechnung-spalte'},[input('lieferantenkonto','Lieferantenkonto'),input('bankverbindung','Bankverbindung'),input('rechnungs_nr','Rechnungs-Nr.'),input('rechnungsbeleg','Rechnungsbeleg'),input('rechnungsdatum','Rechnungsdatum','date'),input('betrag','Rechnungs-Betrag (EUR)'),input('hndl_re','HNDL lt. RE relevant (EUR)'),input('netto_tage','Rein netto Tage','text',{inputmode:'numeric',maxlength:3}),el('button',{type:'button',class:'cu-rechnung-link',text:'F5 · Zahlungsbedingungen',onclick:terms})]);
 for(const nr of [1,2]){calcHints[nr]=el('span',{class:'small muted'});left.append(el('div',{class:'cu-rechnung-ziel'},[input('ziel'+nr+'_tage','Ziel '+nr+' · Tage','text',{inputmode:'numeric',maxlength:3}),input('ziel'+nr+'_skonto','Skonto (%)'),calcHints[nr]]));}
 const right=el('div',{class:'cu-rechnung-spalte'},[payment,input('bagatellgrenze','Bagatellgrenze (EUR)'),input('eingangsdatum','Eingangsdatum','date'),input('anerkannt','anerkannter Betrag (EUR)'),input('hndl_teil','HNDL Teil-RE relevant (EUR)'),el('div',{class:'cu-rechnung-nebenaktionen'},[
 el('button',{type:'button',text:'Freistellungsbescheinigungen',disabled:true,title:'Bescheinigungsverwaltung noch nicht angebunden.'}),el('button',{type:'button',text:'Teilzahlung',onclick:partial}),el('button',{type:'button',text:'Ber. Anteil HND',onclick:handwerker})]),check('rechnerisch_richtig','rechnerisch richtig')]);
 const bankInfo=el('p',{class:'small muted',text:'Bankverbindung wird anhand des Objekts angezeigt.'});
 const books=el('div',{class:'cu-rechnung-spalte'},[input('objekt_nr','Objekt-Nr.'),nameInfo,input('buchungskonto','Buchungskonto'),input('buchungstext','Buchungstext'),input('buchungstext2','Buchungstext 2'),input('buchungstext3','Buchungstext 3'),input('verwendungszweck1','Verwendungszweck 1'),input('verwendungszweck2','Verwendungszweck 2')]);
 const refs=el('div',{class:'cu-rechnung-spalte'},[input('bank_verb_nr','Bank Verbr. Nr.'),bankInfo,input('steuerschluessel','StSchl.'),input('hwa_nr','HWA-Nr.','text',{placeholder:'CA-…'}),input('akte','Akte','text',{placeholder:'CA-…'}),check('sachlich_richtig','sachlich richtig')]);
 f.notiz=el('textarea',{name:'notiz',hidden:true,value:values.notiz});f.teilzahlung=el('input',{name:'teilzahlung',type:'hidden',value:values.teilzahlung});
 for(const key of ['lieferantenkonto','objekt_nr','buchungskonto'])f[key].addEventListener('input',()=>f[key].classList.remove('cu-rechnung-auto'));
 const approve=card('cu-rechnung-freigabe',[el('div',{class:'cu-rechnung-spalte'},[input('faelligkeit','Fälligkeit','date'),check('abgrenzen','Buchung abgrenzen'),input('fibu_bj','FIBU-BJ','text',{inputmode:'numeric',maxlength:4})]),el('div',{class:'cu-rechnung-spalte'},[check('zahlung_freigegeben','zur Zahlung freigegeben')])]);
 const state=el('span',{text:saved?.daten.zahlung_freigegeben?'Zur Zahlung freigegeben · noch nicht ausgeführt':'Erfassung · noch nicht angewiesen'});
 const footer=card('cu-rechnung-status',[el('div',{},[el('strong',{text:'Bearbeitungsstand: '}),state,el('div',{class:'small muted',text:'angewiesen am: –'}),el('div',{class:'small muted',text:'Zahlungsart: '+(values.zahlungsart==='abbuchung'?'Abbuchung':'Überweisung')})]),el('div',{class:'cu-rechnung-nebenaktionen'},[el('button',{type:'button',text:'Z.I.S. / Notiz zur Rechnung',onclick:note}),el('button',{type:'button',text:'Tagesaktivität',disabled:true,title:'Tagesaktivität noch nicht angebunden.'}),el('button',{type:'button',text:'Wiedervorlage',onclick:()=>vorgangForm({art:'wiedervorlage',titel:'Rechnung: '+(f.rechnungs_nr.value||doc.titel),text:'Zum Dokument '+doc.original_name+(saved?' · Rechnung CA-R-'+saved.id:''),faellig_am:f.faelligkeit.value||null})})])]);
 if(erkannt){
 const labels={rechnungs_nr:'Rechnungs-Nr.',rechnungsdatum:'Rechnungsdatum',faelligkeit:'Fälligkeit',betrag:'Rechnungsbetrag',netto_tage:'Nettotage',verwendungszweck1:'Verwendungszweck',ziel1_tage:'Ziel 1',ziel2_tage:'Ziel 2',ziel1_skonto:'Skonto 1',ziel2_skonto:'Skonto 2',lieferantenkonto:'Lieferantenkonto',objekt_nr:'Objekt-Nr.',buchungskonto:'Buchungskonto',teilzahlung:'Bereits geleistete Zahlung',zahlungsart:'Zahlungsart'};
 const banner=el('section',{class:'cu-rechnung-erkannt'},[el('strong',{text:saved?'Erkennung zum Beleg vorhanden · gespeicherte Rechnung unverändert':'Rechnungsdaten automatisch erkannt – bitte prüfen'}),el('p',{text:'Erkennung: '+(erkannt.methode||'Dokumenttext')+'. Keine Prüfung oder Zahlungsfreigabe übernommen.'})]);
 banner.append(el('ul',{},Object.entries(erkannt.felder).filter(([k])=>k!=='verwendungszweck1').map(([k,v])=>el('li',{text:(labels[k]||k)+': '+(k==='zahlungsart'?({ueberweisung:'Überweisung',abbuchung:'Abbuchung'})[v]||v:(["rechnungsdatum","faelligkeit"].includes(k)?datum(v):v))}))));
 if(erkannt.hinweise?.length)banner.append(el('ul',{},erkannt.hinweise.map(text=>el('li',{text}))));
 if(!erkannt.zuordnungen&&erkannt.lieferanten?.length)banner.append(el('p',{text:'Mögliche Lieferanten: '+erkannt.lieferanten.map(a=>a.name+' (Adr. '+a.nummer+')').join(', ')+'. Lieferantenkonto bitte prüfen.'}));
 for(const k of Object.keys(erkannt.felder))if(!saved&&f[k]){f[k].classList.add('cu-rechnung-auto');f[k].title='Automatisch erkannt – bitte am Beleg prüfen. '+(erkannt.belege?.[k]||'');}
 if(erkannt.struktur){
  const z=erkannt.struktur,profile=/xrechnung/i.test(z.profil)?'XRechnung (CII)':/:(basicwl|basic|minimum|extended|comfort)$/i.exec(z.profil)?.[1]?.toUpperCase()||(/en16931/i.test(z.profil)?'EN 16931':z.profil||'Nicht angegeben');
  const xmlDetails=el('details',{class:'cu-zugferd-daten'},[el('summary',{text:'ZUGFeRD-Rechnungsdaten anzeigen'})]);
  const party=p=>[p?.name,p?.strasse,[p?.plz,p?.ort].filter(Boolean).join(' '),p?.land].filter(Boolean).join(' · ')||'–';
  xmlDetails.append(panel([['Format',z.format],['Profil',profile],['XML-Datei',z.dateiname||'Separate XML'],['Dokumenttyp',({'380':'Rechnung','381':'Gutschrift','384':'Korrigierte Rechnung','386':'Vorausrechnung'})[z.typ]||z.typ],['Währung',z.waehrung||'Nicht angegeben'],['Lieferant',party(z.lieferant)],['Rechnungsempfänger',party(z.empfaenger)],['Käuferreferenz',z.kaeuferreferenz||'–'],['Zahlungsreferenz',z.zahlungsreferenz||'–'],['IBAN laut XML',z.iban.join(' · ')||'–'],['Zahlungsbedingungen',z.zahlungsbedingungen.filter(Boolean).join(' · ')||'–']]),
   el('h3',{text:'Rechnungspositionen ('+z.positionen.length+')'}),raster([{label:'Pos.',render:p=>p.nummer},{label:'Leistung / Artikel',render:p=>p.name},{label:'Menge',render:p=>p.menge.replace('.',',')},{label:'Einheit',render:p=>p.einheit},{label:'Zeilensumme netto',render:p=>p.netto.replace('.',',')}],z.positionen,{leer:'Das XML-Profil enthält keine Positionsdaten.'}),
   el('h3',{text:'Steueraufteilung'}),raster([{label:'Steuer',render:t=>t.art+' / '+t.kategorie},{label:'Satz (%)',render:t=>t.satz.replace('.',',')},{label:'Steuerbasis',render:t=>t.basis.replace('.',',')},{label:'Steuerbetrag',render:t=>t.betrag.replace('.',',')}],z.steuern,{leer:'Keine Steueraufteilung angegeben.'}),
   panel([['Steuerbasis',z.summen.steuerbasis||'–'],['Steuersumme',z.summen.steuer||'–'],['Rechnungs-Gesamtbetrag',z.summen.brutto||'–'],['Vorauszahlung',z.summen.vorauszahlung||'–'],['Rundung',z.summen.rundung||'–'],['Verbleibender Zahlbetrag',z.summen.zahlbetrag||'–']]));
  banner.append(xmlDetails);
 }
 form.append(banner);
 }
 form.append(header,el('p',{class:'small muted',text:'Dokument: '+(doc.original_name||doc.titel)}),alert,card('cu-rechnung-bereich',[left,right]),card('cu-rechnung-bereich',[books,refs]),approve,footer,f.notiz,f.teilzahlung);
 const konten=el('datalist',{id:'rechnung-konten'});f.buchungskonto.setAttribute('list','rechnung-konten');form.append(konten);
 const suggestionBox=el('section',{class:'cu-rechnung-erkannt cu-rechnung-zuordnung','aria-label':'Automatische Zuordnung'});form.insertBefore(suggestionBox,header);
 let matchVersion=0;
 function showMatches(r){
  suggestionBox.replaceChildren(el('strong',{text:'Automatische Zuordnung · bitte prüfen'}));
  const groups=[['lieferanten','Lieferant','lieferantenkonto'],['objekte','Objekt','objekt_nr'],['konten','Buchungskonto','buchungskonto']];
  for(const [group,label,field] of groups){
   const items=r?.zuordnungen?.[group]||[];
   const select=el('select',{'aria-label':label+' zuordnen'},[el('option',{value:'',text:items.length?'Treffer auswählen …':'Kein eindeutiger Treffer · manuell erfassen'})]);
   for(const item of items){const value=group==='lieferanten'?item.konto:item.nummer;
    select.append(el('option',{value:value||'',disabled:!value,text:(value||'Kein Lieferantenkonto')+' · '+item.name+' · '+item.grund,selected:!!value&&f[field].value===value}));
   }
   select.addEventListener('change',()=>{if(!select.value)return;f[field].value=select.value;f[field].classList.add('cu-rechnung-auto');f[field].dispatchEvent(new Event('input',{bubbles:true}));if(field!=='buchungskonto'){if(field==='objekt_nr'){f.buchungskonto.value='';objectInfo();}else if(f.buchungskonto.classList.contains('cu-rechnung-auto'))f.buchungskonto.value='';refreshMatches(true).catch(e=>{alert.textContent=e.message;});}});
   suggestionBox.append(el('label',{text:label}),select);
  }
 }
 async function refreshMatches(apply=false){
  const n=++matchVersion,r=await API.post('/eingangsrechnungen/zuordnung',{dokument:ref,auswahl:{lieferantenkonto:f.lieferantenkonto.value,objekt_nr:f.objekt_nr.value}});
  if(closed||n!==matchVersion)return;
  if(apply&&!saved&&r?.felder.buchungskonto&&r.zuordnungen?.konten.some(k=>k.nummer===r.felder.buchungskonto&&k.objekt_nr===f.objekt_nr.value)&&!f.buchungskonto.value){f.buchungskonto.value=r.felder.buchungskonto;f.buchungskonto.classList.add('cu-rechnung-auto');f.buchungskonto.title=r.belege.buchungskonto;}
  showMatches(r);
 }
 if(erkannt)showMatches(erkannt);else suggestionBox.hidden=true;
 let objectVersion=0;
 async function objectInfo(){const n=++objectVersion;nameInfo.textContent='';konten.replaceChildren();if(!f.objekt_nr.value){bankInfo.textContent='Kein Objekt ausgewählt.';return;}try{
 const found=await API.post('/vorgaenge/aufloesen',{typ:'objekt',nummern:[f.objekt_nr.value]});if(closed||n!==objectVersion)return;const o=found[0];if(!o?.gefunden){nameInfo.textContent='Objekt-Nr. nicht gefunden.';bankInfo.textContent='Keine Bankverbindung ermittelt.';return;}
 nameInfo.textContent=o.label;const [accounts,banks]=await Promise.all([API.get('/objekte/'+o.id+'/sachkonten'),API.get('/objekte/'+o.id+'/bank')]);if(closed||n!==objectVersion)return;for(const a of (Array.isArray(accounts)?accounts:accounts.konten||[]))konten.append(el('option',{value:a.nummer,text:a.bezeichnung}));
 const b=Array.isArray(banks)?banks.find(x=>x.standard)||banks[0]:null;bankInfo.textContent=b?'Aktuelle Objektbank: '+(b.bankname||b.bezeichnung||b.kontoinhaber||'')+' · '+(b.iban||''):'Keine Objektbank hinterlegt.';
 }catch(e){if(!closed&&n===objectVersion)bankInfo.textContent=e.message;}}
 f.objekt_nr.addEventListener('change',()=>{f.buchungskonto.value='';objectInfo();if(erkannt)refreshMatches(true).catch(e=>{alert.textContent=e.message;});});f.lieferantenkonto.addEventListener('change',()=>{if(f.buchungskonto.classList.contains('cu-rechnung-auto'))f.buchungskonto.value='';if(erkannt)refreshMatches(true).catch(e=>{alert.textContent=e.message;});});f.rechnungsdatum.addEventListener('input',update);for(const k of ['betrag','ziel1_tage','ziel2_tage','ziel1_skonto','ziel2_skonto'])f[k].addEventListener('input',update);
 form.addEventListener('keydown',e=>{if(e.key==='F5'&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();e.stopPropagation();terms();}});
 async function save(close,button){if(busy||!form.reportValidity())return;busy=true;button.disabled=true;alert.textContent='';try{
 const daten={};for(const [k,i] of Object.entries(f))daten[k]=i.type==='checkbox'?i.checked:i.value;
 daten.zahlungsart=form.querySelector('input[name=zahlungsart]:checked').value;
 const r=await API.post('/eingangsrechnungen/dokument',{dokument:ref,revision,daten});revision=r.revision;toast('Rechnung CA-R-'+r.id+' gespeichert · Dokumentenart RE','success');close();if(S.lauf===lauf&&S.kontext?.rechnungGespeichert)S.kontext.rechnungGespeichert().catch(fehler);
 }catch(e){alert.textContent=e.message;}finally{busy=false;button.disabled=false;}}
 let submit;const m=modal({titel:'Eingangsrechnung',inhalt:form,wide:true,onClose:()=>{closed=true;},footer:close=>[el('button',{text:'Abbrechen',onclick:close}),submit=el('button',{type:'button',text:'OK',class:'btn-primary','data-speichern':'1',onclick:()=>save(close,submit)})]});m.box.classList.add('cu-rechnung-dialog');
 form.addEventListener('submit',e=>{e.preventDefault();save(m.close,submit);});update();if(f.objekt_nr.value)objectInfo();
}
