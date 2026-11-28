'use strict';
function eddiAdressvorschlag(details,state,job,result){
 if(result.ergebnis){
  const r=result.ergebnis,text='Diese Adressliste wurde bereits übernommen. '+r.adressen_neu+' Adressen und '+r.wohnungen_neu+' Einheiten neu angelegt; '+r.adressen_vorhanden+' vorhandene Adressbezüge verwendet; '+r.zuordnungen+' Funktionen zugeordnet.';
  const message=el('p',{role:'status','aria-live':'polite',text});
  details.append(el('section',{class:'cu-eddi-adressen'},[el('h3',{text:'Adressliste · Übernahme abgeschlossen'}),message,...(r.hinweise||[]).map(text=>el('p',{text})),el('a',{href:'#/objekte/'+r.objekt_id,text:'Angelegtes Objekt öffnen'})]));
  state.textContent=text;return{uebernehmen:async()=>{state.textContent=message.textContent=text;return text;}};
 }
 const data=JSON.parse(JSON.stringify(result.daten)),form=formular([
  [{name:'objektnummer',label:'Objekt-Nr. (vorhanden oder neu)',value:data.objekt.nummer,required:true}],
  [{name:'bezeichnung',label:'Objektbezeichnung',value:data.objekt.bezeichnung,required:true},{name:'strasse',label:'Objektstraße',value:data.objekt.strasse,required:true}],
  [{name:'plz',label:'Objekt-PLZ',value:data.objekt.plz,required:true},{name:'ort',label:'Objekt-Ort',value:data.objekt.ort,required:true}]
 ]),rows=el('tbody'),fields=[],message=el('p',{role:'status','aria-live':'polite'}),preview=el('div'),choices={};let digest=null,busy=false,completed=null;
 const show=text=>{state.textContent=message.textContent=text;};
 const table=el('table',{'aria-label':'Erkannte Adressen'},[el('thead',{},[el('tr',{},['Name / Firma','Postanschrift','Kontakt','Wohnung','Funktion','Fundstelle'].map(text=>el('th',{text})))]),rows]);
 for(const [i,a]of data.adressen.entries()){
  const item={};const input=(key,label)=>item[key]=el('input',{'aria-label':label+' · Zeile '+(i+1),value:a[key]||''});
  const role=item.funktion=el('select',{'aria-label':'Funktion · Zeile '+(i+1)},[['unklar','Bitte prüfen'],['eigentuemer','Eigentümer'],['mieter','Mieter'],['sonstiges','Sonstiges']].map(([value,text])=>el('option',{value,text})));role.value=a.funktion;
  rows.append(el('tr',{},[
   el('td',{},[input('vorname','Vorname'),input('nachname','Nachname'),input('firmenname','Firma')]),
   el('td',{},[input('strasse','Straße'),input('plz','PLZ'),input('ort','Ort')]),
   el('td',{},[input('email','E-Mail'),input('telefon','Telefon'),input('mobil','Mobil')]),
   el('td',{},[input('wohnung_nummer','Wohnungsnummer'),input('wohnung_bezeichnung','Wohnungsbezeichnung'),input('lage','Lage')]),
   el('td',{},[role]),el('td',{},[el('details',{},[el('summary',{text:'Seite '+(a.beleg?.seite||'?')}),el('p',{text:a.beleg?.zitat||'Keine Fundstelle'})])])
  ]));fields.push(item);
 }
 function body(){const f=form.werte();return{objektnummer:f.objektnummer,dublettenwahl:{...choices},daten:{objekt:{...data.objekt,bezeichnung:f.bezeichnung,strasse:f.strasse,plz:f.plz,ort:f.ort},adressen:data.adressen.map((a,i)=>({...a,...Object.fromEntries(Object.entries(fields[i]).map(([k,v])=>[k,v.value]))}))}};}
 async function speichern(){
  if(completed){show('Diese Adressliste wurde bereits übernommen.');return message.textContent;}
  if(busy)return 'Die Adressliste wird gerade bearbeitet. Bitte kurz warten.';
  if(!digest)await pruefen();
  if(!digest||take.disabled)return message.textContent;
  busy=true;take.disabled=check.disabled=true;show('Adressen und Zuordnungen werden gespeichert …');
  try{const r=await API.post('/eddi/teilungen/'+job+'/adressen/uebernehmen',{...body(),pruefwert:digest,geprueft:true});completed=r;show(r.adressen_neu+' Adressen und '+r.wohnungen_neu+' Wohnungen neu angelegt; '+r.adressen_vorhanden+' vorhandene Adressbezüge verwendet; '+r.zuordnungen+' Funktionen zugeordnet.');preview.replaceChildren(...r.hinweise.map(text=>el('p',{text})),el('a',{href:'#/objekte/'+r.objekt_id,text:'Objekt öffnen'}));digest=null;}
  catch(e){digest=null;show(e.message);}finally{busy=false;check.disabled=!!completed;}
  return message.textContent;
 }
 const take=el('button',{text:'Adressen, Objekt und Wohnungen übernehmen',disabled:true,type:'button',onclick:speichern});
 async function pruefen(){
  if(busy||completed)return;
  if(!form.form.reportValidity()){show('Bitte die Pflichtangaben zum Objekt ergänzen. Es wurde nichts angelegt.');return;}
  busy=true;take.disabled=true;digest=null;show('Bestehende Objekte, Wohnungen und Adressen werden abgeglichen …');
  try{const r=await API.post('/eddi/teilungen/'+job+'/adressen/vorschau',body());digest=r.pruefwert;
   preview.replaceChildren(el('p',{text:(r.objekt.neu?'Neues Objekt ':'Vorhandenes Objekt ')+r.objekt.nummer}),...r.zeilen.map(z=>{
    const p=el('div',{},[el('p',{text:'Zeile '+(z.index+1)+': '+z.aktion+(z.dubletten.length?' · '+z.dubletten.map(x=>x.nummer+' '+x.name).join(', '):'')+' · Wohnung '+(z.daten.wohnung_nummer||'ohne')})]);
    if(z.pruefen||z.dublettenwahl){const select=el('select',{'aria-label':'Dublettenentscheidung · Zeile '+(z.index+1)},[el('option',{value:'',text:'Bitte Dublette prüfen'}),...z.dubletten.filter(x=>!x.archiviert).map(x=>el('option',{value:String(x.id),text:'Vorhandene Adresse verwenden: '+x.nummer+' '+x.name})),el('option',{value:'neu',text:'Bewusst eine zusätzliche Adresse anlegen'})]);select.value=choices[z.index]||'';select.addEventListener('change',()=>{if(select.value)choices[z.index]=select.value;else delete choices[z.index];show('Dublettenentscheidung geändert. Bitte Vorschau und Dubletten erneut prüfen.');});p.append(select,el('small',{text:'Vorhandene Adressdaten werden nicht überschrieben.'}));}return p;
   }));
   take.disabled=r.zeilen.some(z=>z.pruefen);show(take.disabled?'Mögliche Dubletten klären. Es wurde nichts angelegt.':'Vorschau geprüft. Die angezeigten Adressen und Zuordnungen können jetzt übernommen werden.');
  }catch(e){digest=null;show(e.message);}finally{busy=false;}
 }
 const check=el('button',{type:'button',text:'Vorschau und Dubletten prüfen',onclick:pruefen});
 form.form.addEventListener('submit',e=>e.preventDefault());
 const container=el('div',{class:'cu-eddi-adressen'},[el('h3',{text:'Adressliste · Objekt und Wohnungen zuordnen'}),el('p',{text:'Vorhandene Datensätze werden abgeglichen. Fehlende MEA verhindern diesen Import nicht; es werden keine MEA oder Stimmregeln erfunden.'}),form.form,el('div',{class:'cu-eddi-einheiten'},[table]),check,preview,message,take]);
 const invalidate=e=>{digest=null;take.disabled=true;if(!preview.contains(e.target))for(const key of Object.keys(choices))delete choices[key];};container.addEventListener('input',invalidate);container.addEventListener('change',invalidate);details.append(container);
 return{uebernehmen:speichern,pruefen};
}
