'use strict';
const crypto=require('node:crypto'),T=require('./teilnehmer'),Q=require('../lib/stimmbruch'),{ValidationError}=require('../lib/validation');
const fail=(m,status=400)=>{throw new ValidationError(m,status);};
const zeit=iso=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
async function lesen(db,id){return await db.get('SELECT d.*,b.name AS gestartet_von FROM etv_durchfuehrung d LEFT JOIN benutzer b ON b.id=d.benutzer_id WHERE d.versammlung_id=?',[id])||null;}
function uebersicht(register,teilnahme,units){
 const types=['praesenz','online','abwesend','gesperrt'],zero=()=>Object.fromEntries(types.map(k=>[k,Q.q(0n)])),sum=a=>a.reduce((s,n)=>Q.add(s,n),Q.q(0n)),out={};
 const denominator=units.map(u=>String(u.mea||'').match(/^(\d+)\/(\d+)$/)?.[2]);const scale=denominator.length&&denominator.every(d=>d&&d===denominator[0])?BigInt(denominator[0]):1n;
 for(const mode of ['mea','koepfe','einheiten']){
  const sums=zero();let total,valid=true;
  if(mode==='mea'){try{total=sum(units.map(u=>{const n=Q.parse(u.mea);if(n.n<=0n)throw Error();return n;}));}catch{valid=false;total=Q.q(0n);}}
  else total=Q.q(BigInt(mode==='koepfe'?register.gruppen.length:units.length));
  for(const g of register.gruppen){
   const r=teilnahme.daten[g.key]||{},category=r.zugang_gesperrt?'gesperrt':['selbst','vollmacht'].includes(r.teilnahme)?r.kanal==='online'?'online':'praesenz':'abwesend';
   if(category==='abwesend')continue;
   if(mode==='mea'&&!g.mea_vollstaendig){valid=false;continue;}
   const weight=mode==='mea'?Q.parse(g.mea,true):Q.q(BigInt(mode==='koepfe'?1:g.einheiten.length));
   sums[category]=Q.add(sums[category],weight);
  }
  const classified=sum([sums.praesenz,sums.online,sums.gesperrt]);
  sums.abwesend=Q.add(total,Q.mul(classified,-1n));if(sums.abwesend.n<0n)valid=false;
  const present=Q.add(sums.praesenz,sums.online),factor=mode==='mea'?scale:1n,fmt=n=>mode==='mea'&&register.mea_basis?require('../lib/meaAnzeige').darstellen(Q.str(n),register.mea_basis):Q.str(Q.mul(n,factor)),percent=n=>total.n>0n?Number(n.n*total.d*10000n/(n.d*total.n))/100:0;
  out[mode]={verfuegbar:valid&&units.length>0,total:fmt(total),anwesend:fmt(present),prozent:valid?percent(present):null,werte:Object.fromEntries(types.map(k=>[k,fmt(sums[k])])),anteile:Object.fromEntries(types.map(k=>[k,valid?percent(sums[k]):0]))};
 }
 return out;
}
async function stand(db,id){
 const s=await T.stand(db,id),units=await db.all('SELECT id,mea FROM einheiten WHERE objekt_id=? AND archiviert=0',[s.versammlung.objekt_id]),durchfuehrung=await lesen(db,id);
 const hinweise=[...s.register.hinweise,...s.register.meaHinweise];if(!s.teilnahme.revision)hinweise.push('Bitte die Anwesenheit und Vollmachten unter Teilnehmer erfassen und speichern.');
 if(s.historisch)hinweise.push('Eigentümerstand geändert: Teilnehmerliste bitte prüfen und erneut speichern.');
 return{versammlung:s.versammlung,durchfuehrung,teilnahme_revision:s.teilnahme.revision,basis_hash:crypto.createHash('sha256').update(JSON.stringify({v:s.versammlung,register:s.register.basis_hash,teilnahme:s.teilnahme})).digest('hex'),start_moeglich:!!s.teilnahme.revision&&!s.historisch,hinweise,uebersicht:uebersicht(s.register,s.teilnahme,units)};
}
async function starten(db,id,b,user,now=()=>new Date()){
 return db.transaktion(async tx=>{
  const s=await stand(tx,id);if(s.durchfuehrung)return s;
  if(!b||b.basis_hash!==s.basis_hash||b.teilnahme_revision!==s.teilnahme_revision)fail('Einlass oder Teilnehmerliste inzwischen geändert. Bitte aktualisieren.',409);
  if(!s.start_moeglich)fail('Bitte die aktuelle Teilnehmerliste vor dem Start speichern.');
  const timestamp=now().toISOString();
  await tx.run('INSERT INTO etv_durchfuehrung(versammlung_id,gestartet_am,benutzer_id,teilnahme_revision) VALUES(?,?,?,?)',[id,timestamp,user,s.teilnahme_revision]);
  const p=await tx.get('SELECT daten FROM etv_protokolle WHERE versammlung_id=?',[id]);
  if(p){const daten=JSON.parse(p.daten);daten.beginn=zeit(timestamp);daten.geprueft=false;await tx.run('UPDATE etv_protokolle SET daten=?,revision=revision+1 WHERE versammlung_id=?',[JSON.stringify(daten),id]);}
  return stand(tx,id);
 });
}
module.exports={lesen,stand,starten,uebersicht,zeit};
