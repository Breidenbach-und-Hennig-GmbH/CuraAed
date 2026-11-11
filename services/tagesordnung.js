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

async function vorlagen(db){return db.all('SELECT * FROM top_vorlagen WHERE archiviert=0 ORDER BY name COLLATE NOCASE,id');}
async function vorlageAendern(db,aktion,b={}){
 if(aktion!=='archivieren'&&typeof b.name!=='string')throw new V.ValidationError('Ungültiger Vorlagenname.');
 const w=aktion==='archivieren'?null:{...daten(b),name:V.requireStr(V.str(b.name,200),'Vorlagenname')};
 if(!['anlegen','bearbeiten','archivieren'].includes(aktion))throw new V.ValidationError('Ungültige Vorlagenaktion.');
 if(aktion==='anlegen'){
 const r=await db.run('INSERT INTO top_vorlagen(name,titel,art,erlaeuterung,beschlussvorschlag) VALUES(?,?,?,?,?)',[w.name,w.titel,w.art,w.erlaeuterung,w.beschlussvorschlag]);return db.get('SELECT * FROM top_vorlagen WHERE id=?',[r.lastID]);
 }
 if(!Number.isSafeInteger(b.id)||b.id<1||!Number.isSafeInteger(b.revision)||b.revision<1)throw new V.ValidationError('Ungültige Vorlagenversion.');
 const args=aktion==='archivieren'?[b.id,b.revision]:[w.name,w.titel,w.art,w.erlaeuterung,w.beschlussvorschlag,b.id,b.revision];
 const r=await db.run(aktion==='archivieren'?
 "UPDATE top_vorlagen SET archiviert=1,revision=revision+1,geaendert_am=datetime('now') WHERE id=? AND revision=? AND archiviert=0":
 "UPDATE top_vorlagen SET name=?,titel=?,art=?,erlaeuterung=?,beschlussvorschlag=?,revision=revision+1,geaendert_am=datetime('now') WHERE id=? AND revision=? AND archiviert=0",args);
 if(!r.changes)throw new V.ValidationError('Vorlage inzwischen geändert oder entfernt. Bitte Vorlagen neu öffnen.',409);
 return aktion==='archivieren'?{ok:true}:db.get('SELECT * FROM top_vorlagen WHERE id=?',[b.id]);
}
async function vorlagenUebernehmen(db,id,b={}){
 if(!Number.isSafeInteger(b.revision)||b.revision<1||!Array.isArray(b.vorlagen)||b.vorlagen.length<1||b.vorlagen.length>100)throw new V.ValidationError('Bitte 1 bis 100 Vorlagen auswählen.');
 const unique=new Set();for(const t of b.vorlagen){if(!t||!Number.isSafeInteger(t.id)||t.id<1||!Number.isSafeInteger(t.revision)||t.revision<1||unique.has(t.id))throw new V.ValidationError('Ungültige oder doppelte Vorlage.');unique.add(t.id);}
 return db.transaktion(async tx=>{
 const v=await tx.get('SELECT id,top_revision,leitung_id FROM versammlungen WHERE id=?',[id]);
 if(!v)throw new V.ValidationError('Versammlung nicht gefunden.',404);
 if(!v.leitung_id)throw new V.ValidationError('Bitte zuerst die Basisdaten mit Versammlungsleitung speichern.');
 if(v.top_revision!==b.revision)throw new V.ValidationError('Tagesordnung inzwischen geändert. Bitte neu laden.',409);
 const count=await tx.get('SELECT COUNT(*) AS n FROM versammlung_tops WHERE versammlung_id=?',[id]);
 if(count.n+b.vorlagen.length>500)throw new V.ValidationError('Maximal 500 Tagesordnungspunkte.');
 const ids=[];for(const [i,t] of b.vorlagen.entries()){
 const p=await tx.get('SELECT * FROM top_vorlagen WHERE id=? AND revision=? AND archiviert=0',[t.id,t.revision]);
 if(!p)throw new V.ValidationError('Eine Vorlage wurde inzwischen geändert oder entfernt. Bitte Auswahl neu laden.',409);
 const r=await tx.run('INSERT INTO versammlung_tops(versammlung_id,position,titel,art,erlaeuterung,beschlussvorschlag) VALUES(?,?,?,?,?,?)',[id,count.n+i+1,p.titel,p.art,p.erlaeuterung,p.beschlussvorschlag]);ids.push(r.lastID);
 }
 await tx.run("UPDATE versammlungen SET top_revision=top_revision+1,geaendert_am=datetime('now') WHERE id=?",[id]);
 return{ids,revision:v.top_revision+1};
 });
}
module.exports={liste,aendern,text,vorlagen,vorlageAendern,vorlagenUebernehmen};

