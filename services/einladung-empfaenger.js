'use strict';
const {anzeigename}=require('./adressen');
async function lesen(db,v){const reg=await require('./abstimmungen').register(db,v),members=new Map();for(const g of reg.gruppen)for(const o of g.eigentumer){if(!members.has(o.id))members.set(o.id,new Map());for(const e of g.einheiten)members.get(o.id).set(e.id,e);}
 const extra=await db.all("SELECT DISTINCT adresse_id FROM rollen_zuordnungen WHERE objekt_id=? AND einheit_id IS NULL AND rolle='eigentuemer' AND COALESCE(inaktiv,0)=0 AND (gueltig_von IS NULL OR gueltig_von<=?) AND (gueltig_bis IS NULL OR gueltig_bis>=?)",[v.objekt_id,v.datum,v.datum]);for(const o of extra)if(!members.has(o.adresse_id))members.set(o.adresse_id,new Map());
 const result=[];for(const [id,units] of members){const a=await db.get('SELECT id,nummer,adresstyp,anrede,vorname,nachname,firmenname,zusatz,strasse,plz,ort,land FROM adressen WHERE id=?',[id]);const name=anzeigename(a),country=(a.land||'').trim(),anschrift=[a.anrede,name,a.zusatz,a.strasse,[a.plz,a.ort].filter(Boolean).join(' '),/^(Deutschland|DE|Germany)$/i.test(country)?'':country].filter(Boolean);
 const anrede=a.adresstyp==='firma'?'Sehr geehrte Damen und Herren,':/^Herr(n)?(\s|$)/i.test(a.anrede||'')?'Sehr geehrter Herr '+name+',':/^Frau(\s|$)/i.test(a.anrede||'')?'Sehr geehrte Frau '+name+',':'Guten Tag '+name+',';
 const fehler=[];if(!units.size)fehler.push('Einheitenzuordnung fehlt');if(!a.strasse||!a.plz||!a.ort)fehler.push('Postanschrift unvollständig');if(name.startsWith('('))fehler.push('Name unvollständig');result.push({id,name,anrede,anschrift,einheiten:[...units.values()],fehler});}
 result.sort((a,b)=>a.name.localeCompare(b.name,'de')||a.id-b.id);return{empfaenger:result,hinweise:reg.hinweise};}
module.exports={lesen};
