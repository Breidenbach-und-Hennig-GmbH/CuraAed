'use strict';
const A=require('../public/js/adressdaten'),V=require('../lib/validation');
function validieren(data){
 const a=A.vorbereiten(data);
 if(a.geburtstag){const value=V.isoDate(a.geburtstag,'Geburtstag'),d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value||value.startsWith('0000'))throw new V.ValidationError('Ungültiges Datum: Geburtstag.');}
 for(const f of A.felder){const v=V.str(a[f.name],f.max);if(v&&/[\x00-\x1f\x7f]/.test(v))throw new V.ValidationError('Ungültige Zeichen im Feld '+f.label+'.');if(f.type==='date'&&v){const d=new Date(v+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v.startsWith('0000')||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)throw new V.ValidationError('Ungültiges Datum: '+f.label+'.');}a[f.name]=v;}
 return a;
}
const ordinal=d=>d?String(Math.floor((Date.parse(d+'T00:00:00Z')+62135596800000)/86400000)+1):'0';
function hpStamm(data){const a=validieren(data),out={GebDat1:ordinal(V.isoDate(a.geburtstag,'Geburtstag'))};for(const f of A.felder)out[f.hp]=f.type==='date'?ordinal(a[f.name]):a[f.name]||'';return out;}
async function ausHP(db,a){
 const raw=await db.get("SELECT b.rohdaten FROM hp_adress_bereiche b JOIN hp_adress_zuordnung m ON m.verbindung_id=b.verbindung_id AND m.hp_nummer=b.hp_nummer WHERE m.adresse_id=? AND b.bereich='stamm'",[a.id]);
 if(!raw)return A.vorbereiten(a);let record;try{record=JSON.parse(raw.rohdaten)?.[0];}catch{return A.vorbereiten(a);}if(!record)return A.vorbereiten(a);
 const result={...a};if(!result.geburtstag){const n=Number(record.GebDat1);if(Number.isInteger(n)&&n>0)try{result.geburtstag=require('../lib/hpObjektstatus').ordinalDatum(n);}catch{}}for(const f of A.felder){if(result[f.name]!==null&&result[f.name]!==undefined)continue;const value=record[f.hp];if(f.type==='date'){const n=Number(value);if(Number.isInteger(n)&&n>0)try{result[f.name]=require('../lib/hpObjektstatus').ordinalDatum(n);}catch{}}else if(value!==null&&value!==undefined)result[f.name]=value;}
 return A.vorbereiten(result);
}
module.exports={...A,validieren,hpStamm,ausHP};
