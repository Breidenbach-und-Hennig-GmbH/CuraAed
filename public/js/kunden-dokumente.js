'use strict';
async function kundenDokumentFreigabe(d){
 try{
  const key=String(d.id).startsWith('hp:')?String(d.id):'archiv:'+d.id,r=await API.get('/kunden/quellen'),qs=r.quellen.filter(q=>q.firma_id);
  if(!qs.length)throw Error('Bitte zuerst einen Kundenbestand einer Firma zuordnen.');
  const source=el('select',{'aria-label':'Firma des Dokumentzugriffs'},qs.map(q=>el('option',{value:q.id,text:q.firma_name+' · '+q.subdomain}))),group=el('select',{'aria-label':'Zielgruppe'},[['eigentuemer','Eigentümer'],['mieter','Mieter'],['beide','Eigentümer und Mieter']].map(([value,text])=>el('option',{value,text}))),info=el('p',{role:'status'}),targets=el('div');let proof=null,busy=false;
  async function preview(){proof=null;try{const p=await API.post('/kunden/dokumente/vorschau',{quelle:source.value,dokument:key});proof=p.pruefwert;group.value=p.freigabe?.zielgruppe||'eigentuemer';targets.replaceChildren(el('strong',{text:p.titel}),...p.zuordnungen.map(x=>el('p',{text:x.label})));info.textContent=p.freigabe?.aktiv?(p.freigabe.aktuell?'Freigabe aktiv.':'Dokument geändert; bisherige Freigabe gesperrt.'):'Noch nicht im Kundenportal freigegeben.';}catch(e){info.textContent=e.message;targets.replaceChildren();}}
  async function save(aktiv){if(busy||!proof)return;busy=true;try{await API.post('/kunden/dokumente/freigabe',{quelle:source.value,dokument:key,zielgruppe:group.value,aktiv,pruefwert:proof});await preview();}catch(e){info.textContent=e.message;}finally{busy=false;}}
  source.addEventListener('change',preview);
  modal({titel:'Dokument im Kundenportal freigeben',inhalt:el('div',{},[el('p',{text:'Nur angemeldete Kunden der gewählten Firma mit passender aktueller Zuordnung erhalten Zugriff. Persönliche Adress- und Wohnungsbezüge schränken eine allgemeine Objektzuordnung ein. Die interne Kennzeichnung „öffentlich“ genügt nicht.'}),el('label',{},['Firma ',source]),el('label',{},['Zielgruppe ',group]),targets,info]),footer:close=>[el('button',{text:'Freigeben',onclick:()=>save(true)}),el('button',{text:'Freigabe entziehen',onclick:()=>save(false)}),el('button',{text:'Schließen',onclick:close})]});await preview();
 }catch(e){fehler(e);}
}
