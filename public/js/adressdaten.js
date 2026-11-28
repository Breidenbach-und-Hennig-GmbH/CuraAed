'use strict';
(function(root){
 const text=v=>String(v??'').trim();
 const felder=[
  ['suchbegriff','Suchbegriff',30,'SBegrAdr'],['titel','Titel',30,'Titel'],['name3','Name 3',30,'Name3'],['beruf','Berufsbezeichnung',30,'BerufsBez'],
  ['briefanrede1','Briefanrede 1',50,'BriefAnZeil1'],['briefanrede2','Briefanrede 2',50,'BriefAnZeil2'],['geburtsname','Geburtsname',50,'Geburtsname'],
  ['geburtstag2','Geburtstag 2',10,'GebDat2','date'],['sterbedatum1','Sterbedatum 1',10,'SterbeDat1','date'],['sterbedatum2','Sterbedatum 2',10,'SterbeDat2','date'],
  ...Array.from({length:10},(_,i)=>['sonderfunktion'+(i+1),'Sonderfunktion '+(i+1),3,'SF'+(i+1)])
 ].map(([name,label,max,hp,type])=>({name,label,max,hp,type:type||'text'}));
 function standard(a){
  const firma=a.adresstyp==='firma'||/^firma\.?$/i.test(text(a.anrede));
  const last=text(firma?a.firmenname||a.nachname:a.nachname),first=firma?'':text(a.vorname),title=text(a.titel),anrede=text(a.anrede);
  const suchbegriff=(last+(first?', '+first:'')).toLocaleUpperCase('de-DE').slice(0,30);
  const full=[title,first,last].filter(Boolean).join(' '),briefName=[title,last].filter(Boolean).join(' ');
  let brief=firma?'Sehr geehrte Damen und Herren,':/^herrn?\.?$/i.test(anrede)?'Sehr geehrter Herr '+briefName+',':/^frau\.?$/i.test(anrede)?'Sehr geehrte Frau '+briefName+',':/^eheleute$/i.test(anrede)?'Sehr geehrte Eheleute '+last+',':'Guten Tag'+(full?' '+full:'')+',';
  let split=brief.length>50?brief.lastIndexOf(' ',50):-1;
  return{suchbegriff,briefanrede1:split>0?brief.slice(0,split):brief,briefanrede2:split>0?brief.slice(split+1):''};
 }
 function vorbereiten(a,alt=null){
  const out={...a},computed=standard(out),before=alt?standard(alt):null;
  for(const k of ['suchbegriff','briefanrede1','briefanrede2'])if(!text(out[k])||before&&text(out[k])===before[k])out[k]=computed[k];
  if(out.adresstyp==='firma'&&!text(out.anrede))out.anrede='Firma';
  if(!text(out.land))out.land='DE';
  for(const f of felder)if(out[f.name]!==undefined&&out[f.name]!==null)out[f.name]=text(out[f.name]);
  return out;
 }
 function binden(inputs,initial={}){
  let before={...initial};
  const read=()=>({...initial,...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]))});
  const update=()=>{const current=read(),next=vorbereiten(current,before);for(const key of ['suchbegriff','briefanrede1','briefanrede2'])if(inputs[key]&&!inputs[key].readOnly)inputs[key].value=next[key]||'';if(inputs.anrede&&!inputs.anrede.value)inputs.anrede.value=next.anrede||'';if(inputs.land&&!inputs.land.value)inputs.land.value=next.land;before={...next};};
  for(const key of ['adresstyp','anrede','titel','vorname','nachname','firmenname'])if(inputs[key])for(const event of ['input','change'])inputs[key].addEventListener(event,update);
  for(const key of ['suchbegriff','briefanrede1','briefanrede2'])if(inputs[key])inputs[key].addEventListener('input',()=>{before=read();});
  update();return{aktualisieren:update};
 }
 const api={felder,standard,vorbereiten,binden};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.Adressdaten=api;
})(typeof window==='undefined'?null:window);
