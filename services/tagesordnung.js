'use strict';
const V=require('../lib/validation'),versammlungen=require('./versammlungen');
async function liste(db,id){
 const versammlung=await versammlungen.holen(db,id);if(!versammlung)throw new V.ValidationError('Versammlung nicht gefunden.',404);
 return{versammlung,revision:versammlung.top_revision,tops:await db.all('SELECT * FROM versammlung_tops WHERE versammlung_id=? ORDER BY position,id',[id])};
}
function daten(b){
 const out={};for(const [key,max] of [['titel',200],['erlaeuterung',10000],['beschlussvorschlag',10000]]){
 if(b[key]!=null&&typeof b[key]!=='string')throw new V.ValidationError('Ungültige TOP-Angaben.');out[key]=V.str(b[key],max);
 }
 out.titel=V.requireStr(out.titel,'Titel');out.art=V.oneOf(b.art,['besprechung','beschluss'],'TOP-Art','besprechung');return out;
}
async function aendern(db,id,aktion,b={}){
 if(!Number.isSafeInteger(b.revision)||b.revision<1)throw new V.ValidationError('Ungültige Tagesordnungs-Version.');
 const value=['anlegen','bearbeiten'].includes(aktion)?daten(b):null;
 return db.transaktion(async tx=>{
 const v=await tx.get('SELECT id,top_revision,leitung_id FROM versammlungen WHERE id=?',[id]);if(!v)throw new V.ValidationError('Versammlung nicht gefunden.',404);
 if(!v.leitung_id)throw new V.ValidationError('Bitte zuerst die Basisdaten mit Versammlungsleitung speichern.');
 if(v.top_revision!==b.revision)throw new V.ValidationError('Tagesordnung inzwischen geändert. Bitte neu laden.',409);
 const rows=await tx.all('SELECT id FROM versammlung_tops WHERE versammlung_id=? ORDER BY position,id',[id]);
 const index=rows.findIndex(r=>r.id===Number(b.id));let topId=Number(b.id);
 if(aktion==='anlegen'){
 if(rows.length>=500)throw new V.ValidationError('Maximal 500 Tagesordnungspunkte.');
 const r=await tx.run('INSERT INTO versammlung_tops(versammlung_id,position,titel,art,erlaeuterung,beschlussvorschlag) VALUES(?,?,?,?,?,?)',[id,rows.length+1,value.titel,value.art,value.erlaeuterung,value.beschlussvorschlag]);topId=r.lastID;
 }else{
 if(index<0)throw new V.ValidationError('TOP nicht gefunden.',404);
 if(aktion==='bearbeiten')await tx.run('UPDATE versammlung_tops SET titel=?,art=?,erlaeuterung=?,beschlussvorschlag=? WHERE id=? AND versammlung_id=?',[value.titel,value.art,value.erlaeuterung,value.beschlussvorschlag,topId,id]);
 else if(aktion==='loeschen'){await tx.run('DELETE FROM versammlung_tops WHERE id=? AND versammlung_id=?',[topId,id]);rows.splice(index,1);}
 else if(aktion==='verschieben'){
 if(![-1,1].includes(b.richtung)||!rows[index+b.richtung])throw new V.ValidationError('TOP kann nicht weiter verschoben werden.');
 [rows[index],rows[index+b.richtung]]=[rows[index+b.richtung],rows[index]];
 }else throw new V.ValidationError('Ungültige TOP-Aktion.');
 if(['loeschen','verschieben'].includes(aktion))for(const [i,r] of rows.entries())await tx.run('UPDATE versammlung_tops SET position=? WHERE id=?',[i+1,r.id]);
 }
 await tx.run("UPDATE versammlungen SET top_revision=top_revision+1,geaendert_am=datetime('now') WHERE id=?",[id]);
 return{id:topId,revision:v.top_revision+1};
 });
}
async function text(db,id){
 const {versammlung:v,tops}=await liste(db,id);
 const ort=[v.ort,v.ort_strasse,[v.ort_plz,v.ort_stadt].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
 return ['TAGESORDNUNG',v.name,'Objekt: '+v.objekt_nummer+' · '+v.objekt_bezeichnung,'Datum: '+v.datum+(v.uhrzeit?' · '+v.uhrzeit:''),'Versammlungsort: '+(ort||'–'),'Versammlungsleitung: '+(v.leitung_name||'–'),'',
 ...tops.flatMap(t=>['TOP '+t.position+' · '+t.titel,t.art==='beschluss'?'Beschlussfassung':'Besprechung',t.erlaeuterung||'',t.beschlussvorschlag?'Beschlussvorschlag:\n'+t.beschlussvorschlag:'',''])].join('\n');
}
module.exports={liste,aendern,text};
