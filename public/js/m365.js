'use strict';
async function m365Maske(){
 const lauf=S.lauf,root=el('section',{class:'cu-karte'},[el('h1',{text:'Firmenpostfach und Postversand'}),el('p',{text:'Einladungen werden einzeln archiviert. E-Mails werden über das gemeinsame Firmenpostfach übergeben; der Postweg gilt je Verwaltung.'})]);if(!zeigeAufDesktop(lauf,root))return;S.kontext={typ:'m365'};
 try{
  const firms=await API.get('/m365/firmen');if(lauf!==S.lauf)return;
  if(!firms.length)root.append(el('p',{text:'Bitte zuerst eine Verwaltung in den Stammdaten anlegen.'}),el('a',{href:'#/verwaltungen',text:'Verwaltungsstammdaten öffnen'}));
  for(const f of firms){
   const u=formular([{grid:2,felder:[{name:'absender',label:'Gemeinsames Firmenpostfach',value:f.absender,required:true},{name:'postweg',label:'Postversand',type:'select',value:f.postweg,options:[{value:'drucker',label:'Bürodrucker · Druckdialog'},{value:'epostbox',label:'epostbox'}]}]},{felder:[{name:'drucker',label:'Gewünschter Bürodrucker (Name im Druckdialog)',value:f.drucker}]}]),message=el('p',{role:'status'});
   const save=el('button',{text:'Versandeinstellungen speichern',class:'btn-primary',disabled:!istAdmin(),onclick:async()=>{if(!u.form.reportValidity())return;save.disabled=true;try{await API.put('/m365/firmen/'+f.firma_id,{...u.werte(),revision:f.revision});toast('Versandeinstellungen gespeichert','success');m365Maske();}catch(e){message.textContent=e.message;save.disabled=false;}}});
   const connect=el('button',{text:f.m365_verbunden?'Microsoft 365 erneut verbinden':'Microsoft 365 verbinden',disabled:!istAdmin()||!f.m365_bereit||!f.revision,onclick:async()=>{
    if(!await bestaetigen('CuraAed mit Microsoft 365 verbinden? Ein berechtigtes Microsoft-Konto erlaubt danach den Versand aus dem gemeinsamen Firmenpostfach '+f.absender+'. Die Freigabe erfolgt auf der Microsoft-Anmeldeseite.'))return;
    try{const r=await API.post('/m365/firmen/'+f.firma_id+'/verbinden',{zustimmung:true});const url=new URL(r.url);if(url.origin!=='https://login.microsoftonline.com')throw Error('Unzulässige Microsoft-Anmeldeseite.');location.assign(r.url);}catch(e){message.textContent=e.message;}
   }});
   root.append(el('section',{class:'cu-karte',style:'margin-top:12px'},[el('h2',{text:f.name}),u.form,
    el('p',{text:f.m365_verbunden?'Microsoft 365 verbunden über '+f.m365_konto:'Microsoft 365 noch nicht verbunden.'}),
    f.hinweis?el('p',{class:'small muted',text:f.hinweis}):null,
    el('p',{class:'small muted',text:'Für das Firmenpostfach sind eine einmalige Microsoft-App-Registrierung und die Berechtigung zum Senden als dieses Postfach nötig. Passwörter werden hier nicht gespeichert.'}),
    el('p',{class:'small muted',text:'Bürodruck: Die PDF öffnet sich mit einer Druckfunktion. Den gewünschten Drucker wählen Sie im Systemdialog; ein geöffneter Dialog ist noch kein Drucknachweis.'}),
    el('p',{class:'small muted',text:'epostbox: Der automatische Zugang ist noch nicht eingerichtet. Einzel-PDFs können heruntergeladen und im Portal hochgeladen werden; dies wird nicht als automatische Übergabe verbucht.'}),
    el('div',{class:'cu-aktionen'},[save,connect,f.m365_verbunden?el('button',{text:'Microsoft 365 trennen',disabled:!istAdmin(),onclick:async()=>{try{await API.post('/m365/firmen/'+f.firma_id+'/trennen',{});m365Maske();}catch(e){message.textContent=e.message;}}}):null,el('a',{href:'https://printing.epostbox.de/',target:'_blank',rel:'noopener',class:'btn',text:'epostbox öffnen'})]),message]));
   u.form.addEventListener('submit',e=>e.preventDefault());for(const input of Object.values(u.inputs))input.disabled=!istAdmin();
  }
 }catch(e){if(lauf===S.lauf)root.append(el('p',{role:'alert',text:e.message}));}
}
