'use strict';
async function m365Maske(){
 const lauf=S.lauf,root=el('div',{class:'cu-m365'});S.kontext={typ:'m365'};
 const seite=seitenleiste([{text:'Benutzerverwaltung',onclick:()=>geheZu('#/benutzer'),gesperrt:!istAdmin()},{text:'Verwaltungen',onclick:()=>geheZu('#/verwaltungen')}]);
 if(!zeigeAufDesktop(lauf,maskenFenster({titel:'Firmenpostfach und Postversand',kopf:{brot:[{text:'Einstellungen'},{text:'Firmenpostfach / Postversand'}],ueberschrift:'Firmenpostfach und Postversand',drucken:false},inhalt:maskenRaster({oben:[panel([['Versand','Gemeinsames Firmenpostfach und Postweg je Verwaltung'],['Microsoft 365','Einrichtung in der Benutzerverwaltung']], 'hp-such-panel')],seite,unten:[root]})})))return;
 try{
  const firms=await API.get('/m365/firmen');if(lauf!==S.lauf)return;
  if(!firms.length)root.append(el('p',{text:'Bitte zuerst eine Verwaltung in den Stammdaten anlegen.'}),el('a',{href:'#/verwaltungen',text:'Verwaltungsstammdaten öffnen'}));
  for(const f of firms){
   const u=formular([{grid:2,felder:[{name:'absender',label:'Gemeinsames Firmenpostfach',value:f.absender,required:true},{name:'postweg',label:'Postversand',type:'select',value:f.postweg,options:[{value:'drucker',label:'Bürodrucker · Druckdialog'},{value:'epostbox',label:'epostbox'}]}]},{felder:[{name:'drucker',label:'Gewünschter Bürodrucker (Name im Druckdialog)',value:f.drucker}]}]),message=el('p',{role:'status'});
   m365KompakteFelder(u,[['Firmenpostfach',u.inputs.absender],['Postversand',u.inputs.postweg],['Bürodrucker',u.inputs.drucker]]);
   const save=el('button',{text:'Versandeinstellungen speichern',class:'btn-primary cu-knopf',disabled:!istAdmin(),onclick:async()=>{if(!u.form.reportValidity())return;save.disabled=true;try{await API.put('/m365/firmen/'+f.firma_id,{...u.werte(),revision:f.revision});toast('Versandeinstellungen gespeichert','success');m365Maske();}catch(e){message.textContent=e.message;save.disabled=false;}}});
   const connect=el('button',{text:f.m365_verbunden?'Microsoft 365 erneut verbinden':'Microsoft 365 verbinden',class:'cu-knopf',disabled:!istAdmin()||!f.m365_bereit||!f.revision,onclick:async()=>{
    if(!await bestaetigen('CuraAed mit Microsoft 365 verbinden? Ein berechtigtes Microsoft-Konto erlaubt danach den Versand aus dem gemeinsamen Firmenpostfach '+f.absender+'. Die Freigabe erfolgt auf der Microsoft-Anmeldeseite.'))return;
    try{const r=await API.post('/m365/firmen/'+f.firma_id+'/verbinden',{zustimmung:true});const url=new URL(r.url);if(url.origin!=='https://login.microsoftonline.com')throw Error('Unzulässige Microsoft-Anmeldeseite.');location.assign(r.url);}catch(e){message.textContent=e.message;}
   }});
   const box=el('div',{class:'cu-m365-form'},[u.form,
    panel([['Verbindung',el('span',{class:f.m365_verbunden?'badge badge-aktiv':'badge badge-inaktiv',text:f.m365_verbunden?'Verbunden':'Nicht verbunden'})],f.m365_verbunden?['Microsoft-Konto',f.m365_konto]:null,['ETV / Teams',f.teams_bereit?'Freigegeben':'Zusätzliche Microsoft-Freigabe erforderlich'],['Firmenkalender',f.kalender_bereit?'Freigegeben':'Zusätzliche Microsoft-Freigabe erforderlich']]),
    f.hinweis?el('p',{class:'small muted',text:f.hinweis}):null,
    el('details',{class:'cu-m365-hinweise'},[el('summary',{text:'Hinweise zum Versand'}),el('p',{class:'small muted',text:'Für das Firmenpostfach sind eine einmalige Microsoft-App-Registrierung und die Berechtigung zum Senden als dieses Postfach nötig. Passwörter werden hier nicht gespeichert.'}),
    el('p',{class:'small muted',text:'Bürodruck: Die PDF öffnet sich mit einer Druckfunktion. Den gewünschten Drucker wählen Sie im Systemdialog; ein geöffneter Dialog ist noch kein Drucknachweis.'}),
    el('p',{class:'small muted',text:'epostbox: Der automatische Zugang ist noch nicht eingerichtet. Einzel-PDFs können heruntergeladen und im Portal hochgeladen werden; dies wird nicht als automatische Übergabe verbucht.'})]),
    el('div',{class:'cu-aktionen'},[save,connect,el('a',{href:'#/kalender',class:'btn cu-knopf',text:'Kalender öffnen'}),el('a',{href:'#/posteingang?quelle=firma:'+f.firma_id,class:'btn cu-knopf',text:'Posteingang öffnen'}),el('button',{class:'cu-knopf',text:f.postfach_bereit?'Posteingangsfreigabe erneuern':'Posteingang freigeben',disabled:!istAdmin()||!f.m365_bereit||!f.revision,onclick:async()=>{if(!await bestaetigen('Das Firmenpostfach '+f.absender+' zusätzlich zum Lesen freigeben?'))return;try{const r=await API.post('/m365/firmen/'+f.firma_id+'/verbinden',{zustimmung:true,postfach:true});const u=new URL(r.url);if(u.origin!=='https://login.microsoftonline.com')throw Error('Ungültige Microsoft-Seite.');location.assign(u.href);}catch(e){message.textContent=e.message;}}}),el('button',{class:'cu-knopf',text:f.teams_bereit?'Teams-Freigabe erneuern':'Microsoft 365 für ETV / Teams freigeben',disabled:!istAdmin()||!f.m365_bereit||!f.revision,onclick:async()=>{if(!await bestaetigen('CuraAed zusätzlich erlauben, Teams-Besprechungen des verbundenen Microsoft-Kontos zu lesen, zu erstellen und zu aktualisieren? Die Zustimmung erfolgt bei Microsoft. Es werden keine Eigentümer automatisch eingeladen.'))return;try{const r=await API.post('/m365/firmen/'+f.firma_id+'/verbinden',{zustimmung:true,teams:true});const u=new URL(r.url);if(u.origin!=='https://login.microsoftonline.com')throw Error('Ungültige Microsoft-Seite.');location.assign(r.url);}catch(e){message.textContent=e.message;}}}),f.m365_verbunden?el('button',{text:'Microsoft 365 trennen',class:'cu-knopf',disabled:!istAdmin(),onclick:async()=>{try{await API.post('/m365/firmen/'+f.firma_id+'/trennen',{});m365Maske();}catch(e){message.textContent=e.message;}}}):null,el('a',{href:'https://printing.epostbox.de/',target:'_blank',rel:'noopener',class:'btn cu-knopf',text:'epostbox öffnen'})]),message]);
   root.append(abschnitt(f.name,box));
   u.form.addEventListener('submit',e=>e.preventDefault());for(const input of Object.values(u.inputs))input.disabled=!istAdmin();
  }
 }catch(e){if(lauf===S.lauf)root.append(el('p',{role:'alert',text:e.message}));}
}

async function m365KonfigurationsPanel(){
 const c=await API.get('/m365/konfiguration');
 const u=formular([{grid:2,felder:[
  {name:'mandant_id',label:'Microsoft-Mandanten-ID',value:c.mandant_id,required:true},
  {name:'client_id',label:'Anwendungs-ID (Client-ID)',value:c.client_id,required:true}
 ]},{felder:[{name:'secret',label:c.secret_vorhanden?'Geheimer Schlüssel · gespeichert, leer lassen zum Beibehalten':'Geheimer Schlüssel (Wert)',type:'password'}]}]);
 m365KompakteFelder(u,[['Mandanten-ID',u.inputs.mandant_id],['Anwendungs-ID',u.inputs.client_id],['Geheimer Schlüssel',u.inputs.secret]]);
 u.inputs.secret.autocomplete='new-password';
 if(c.secret_vorhanden)u.inputs.secret.placeholder='Gespeichert · leer lassen zum Beibehalten';
 const status=el('p',{role:'status',class:'small muted',text:c.secret_vorhanden?'Die Microsoft-Einrichtung ist verschlüsselt in CuraAed gespeichert.':'Die Microsoft-Einrichtung gilt für CuraAed; das Firmenpostfach wird anschließend verbunden.'});
 const save=el('button',{type:'submit',class:'btn-primary cu-knopf',text:'Microsoft-Einrichtung speichern'});
 u.form.append(el('p',{class:'small muted',text:'Rückleitungsadresse für Microsoft: '+c.redirect_uri}),el('div',{class:'cu-aktionen'},[save,el('a',{href:'#/m365',class:'btn cu-knopf',text:'Firmenpostfach verbinden / verwalten'})]),status);
 u.form.addEventListener('submit',async e=>{
  e.preventDefault();if(!u.form.reportValidity())return;
  const b={...u.werte(),revision:c.revision};
  const changed=c.revision>0&&(b.client_id.toLowerCase()!==c.client_id.toLowerCase()||b.mandant_id.toLowerCase()!==c.mandant_id.toLowerCase());
  if(changed){if(!await bestaetigen('Andere Microsoft-App verwenden? Bestehende Postfachverbindungen werden getrennt und müssen neu verbunden werden. Dafür muss auch ein neuer geheimer Schlüssel eingegeben werden.')){u.inputs.secret.value='';b.secret='';return;}b.verbindungen_trennen=true;}
  save.disabled=true;
  try{const next=await API.put('/m365/konfiguration',b);Object.assign(c,next);u.inputs.secret.value='';status.textContent='Microsoft-Einrichtung verschlüsselt gespeichert.';toast('Microsoft-Einrichtung gespeichert','success');}
  catch(error){status.textContent=error.message;}
  finally{b.secret='';u.inputs.secret.value='';save.disabled=false;}
 });
 return abschnitt('Microsoft 365',el('div',{class:'cu-m365 cu-m365-form'},[u.form]));
}

function m365KompakteFelder(u,zeilen){
 for(const [label,input] of zeilen){input.setAttribute('aria-label',label);if(!input.id)input.id='m365-'+input.name;}
 u.form.replaceChildren(panel(zeilen));
}
