'use strict';
const Q=require('./stimmbruch'),anteil=require('./te-anteil');
// Preserve the documented denominator for display; calculations keep exact fractions.
async function ergaenzen(db,rows){
 const maps=new Map();
 const ids=[...new Set(rows.map(r=>r.objekt_id).filter(Boolean))];
 if(!ids.length)return rows;
 const sources=await db.all('SELECT t.objekt_id,j.uebernahme,j.ergebnis FROM objekt_teilungserklaerung t JOIN eddi_teilungen j ON j.id=t.job_id WHERE t.objekt_id IN ('+ids.map(()=>'?').join(',')+')',ids);
 for(const source of sources){
  try{
   const data=JSON.parse(source.uebernahme||'null'),result=JSON.parse(source.ergebnis||'null');
   if(data?.daten?.wohnungen)maps.set(source.objekt_id,new Map(data.daten.wohnungen.map(w=>{
    const original=result?.wohnungen?.find(x=>x.nummer===w.nummer)?.mea_original;
    return[data.objektnummer+'-'+w.nummer,original&&anteil(original)===anteil(w.mea)?original:w.mea];
   })));
  }catch{/* No usable source: retain the stored value. */}
 }
 return rows.map(row=>{
  const original=maps.get(row.objekt_id)?.get(row.nummer);
  try{if(typeof original==='string'&&original.includes('/')&&Q.cmp(Q.parse(row.mea),Q.parse(anteil(original)))===0)return{...row,mea_anzeige:original};}catch{/* Changed or invalid MEA must never acquire an old source label. */}
  return row;
 });
}
function dezimal(q){
 const whole=q.n/q.d;let remainder=q.n%q.d,digits='';
 for(let i=0;remainder&&i<12;i++){remainder*=10n;digits+=String(remainder/q.d);remainder%=q.d;}
 if(remainder)return null;
 return whole.toLocaleString('de-DE')+(digits?','+digits:'');
}
function summe(rows){
 if(!rows.length)return null;
 let basis,total=Q.q(0n);
 for(const row of rows){
  if(!row.mea_anzeige)return null;
  const parts=row.mea_anzeige.split('/'),d=parts[1]?.trim().replace(/\./g,'');
  if(!/^\d+$/.test(d||'')||BigInt(d)<=0n)return null;
  if(basis&&basis!==d)return null;basis=d;
  try{total=Q.add(total,Q.parse(row.mea));}catch{return null;}
 }
 const numerator=dezimal(Q.mul(total,BigInt(basis)));
 return numerator===null?null:numerator+'/'+BigInt(basis).toLocaleString('de-DE');
}
module.exports={ergaenzen,summe};
