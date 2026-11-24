'use strict';
const {ValidationError}=require('../lib/validation');
const fail=(text,status=400)=>{throw new ValidationError(text,status);};
const text=(x,max)=>{if(typeof x!=='string'||x.length>max)fail('Ungültige Teilnehmerangabe.');return x.trim();};
async function lesen(db,vid){
 const m=await db.get('SELECT m.*,b.name AS benutzer FROM etv_teilnahme_version m LEFT JOIN benutzer b ON b.id=m.benutzer_id WHERE m.versammlung_id=?',[vid]);
 const r=await db.get('SELECT daten FROM etv_teilnahme WHERE versammlung_id=?',[vid]);
 return{revision:m?.revision||0,basis_hash:m?.basis_hash||null,benutzer:m?.benutzer||null,geaendert_am:m?.geaendert_am||null,daten:JSON.parse(r?.daten||'{}')};
}
async function stand(db,vid){
 const v=await db.get('SELECT v.*,o.nummer AS objekt_nummer,o.bezeichnung AS objekt_bezeichnung FROM versammlungen v JOIN objekte o ON o.id=v.objekt_id WHERE v.id=?',[vid]);
 if(!v)fail('Versammlung nicht gefunden.',404);
 const register=await require('./abstimmungen').register(db,v),teilnahme=await lesen(db,vid);
 return{versammlung:v,register,teilnahme,historisch:!!teilnahme.basis_hash&&teilnahme.basis_hash!==register.basis_hash};
}
function pruefen(register,rows){
 if(!Array.isArray(rows)||rows.length!==register.gruppen.length)fail('Bitte jede Eigentümergruppe genau einmal erfassen.');
 const map=new Map();for(const r of rows){if(!r||typeof r.key!=='string'||map.has(r.key))fail('Doppelte oder ungültige Eigentümergruppe.');map.set(r.key,r);}
 return Object.fromEntries(register.gruppen.map(g=>{
  const r=map.get(g.key);if(!r||!['selbst','vollmacht','abwesend'].includes(r.teilnahme)||typeof r.vollmacht_textform!=='boolean')fail('Ungültige Teilnahme.');
  if(r.kanal!==undefined&&!['praesenz','online'].includes(r.kanal))fail('Ungültiger Teilnahmeweg.');if(r.zugang_gesperrt!==undefined&&typeof r.zugang_gesperrt!=='boolean')fail('Ungültiger Einlassstatus.');if(r.zugang_gesperrt&&r.teilnahme!=='abwesend')fail('Gesperrte Eigentümergruppen bitte als Nichtteilnahme führen.');
  const d={kanal:r.kanal||'praesenz',zugang_gesperrt:r.zugang_gesperrt===true,teilnahme:r.teilnahme,vertreter:text(r.vertreter,200),nachweis:text(r.nachweis,500),vollmacht_textform:r.vollmacht_textform};
  if(d.teilnahme==='vollmacht'){
   if(!d.vertreter||!d.nachweis||!d.vollmacht_textform)fail('Bitte für '+g.name+' die bevollmächtigte Person und den Nachweis der Vollmacht in Textform ergänzen.');
  }else{d.vertreter='';d.nachweis='';d.vollmacht_textform=false;}
  // Gemeinsame Eigentümer üben ihr Stimmrecht einheitlich aus; die Liste hält zusätzlich die persönliche Anwesenheit fest.
  const ids=r.anwesende_eigentuemer===undefined?[]:r.anwesende_eigentuemer;
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||!g.eigentumer.some(o=>o.id===id)))fail('Ungültige anwesende Eigentümer.');
  if(r.anwesende_eigentuemer!==undefined&&d.teilnahme==='selbst'&&!ids.length)fail('Bitte die persönlich anwesenden Eigentümer für '+g.name+' auswählen.');if(d.teilnahme==='abwesend'&&ids.length)fail('Persönliche Anwesenheit und Nichtteilnahme widersprechen sich.');d.anwesende_eigentuemer=ids;
  return[g.key,d];
 }));
}
async function schreiben(tx,vid,register,rows,user){
 const daten=pruefen(register,rows),previous=await lesen(tx,vid);
 if(previous.basis_hash===register.basis_hash&&JSON.stringify(previous.daten)===JSON.stringify(daten))return{revision:previous.revision,daten};
 const revision=previous.revision+1;
 await tx.run('INSERT INTO etv_teilnahme(versammlung_id,daten) VALUES(?,?) ON CONFLICT(versammlung_id) DO UPDATE SET daten=excluded.daten',[vid,JSON.stringify(daten)]);
 await tx.run("INSERT INTO etv_teilnahme_version(versammlung_id,revision,basis_hash,benutzer_id) VALUES(?,?,?,?) ON CONFLICT(versammlung_id) DO UPDATE SET revision=excluded.revision,basis_hash=excluded.basis_hash,benutzer_id=excluded.benutzer_id,geaendert_am=datetime('now')",[vid,revision,register.basis_hash,user]);
 return{revision,daten};
}
async function speichern(db,vid,b,user){return db.transaktion(async tx=>{
 const s=await stand(tx,vid);if(b.revision!==s.teilnahme.revision||b.basis_hash!==s.register.basis_hash)fail('Teilnehmerliste oder Eigentümerstand inzwischen geändert. Bitte neu öffnen.',409);
 return schreiben(tx,vid,s.register,b.teilnehmer,user);
});}
async function download(db,vid){const s=await stand(db,vid),clean=x=>String(x??'').replace(/[\r\n\t]/g,' '),rows=['Teilnehmerliste · '+s.versammlung.name,'Objekt '+s.versammlung.objekt_nummer+' · '+s.versammlung.objekt_bezeichnung,'Versammlung: '+s.versammlung.datum,'Stand: '+(s.teilnahme.geaendert_am||'Noch nicht gespeichert')+' · Version '+s.teilnahme.revision,
 s.historisch?'ACHTUNG: Eigentümerstand geändert; Teilnehmerliste neu prüfen.':'',...s.register.hinweise,...s.register.meaHinweise,'','Eigentümergruppe\tEinheiten\tMEA\tTeilnahme\tPersönlich anwesend\tBevollmächtigt\tNachweis\tTextform geprüft'];
 for(const g of s.register.gruppen){const d=s.teilnahme.daten[g.key]||{};rows.push([g.name,g.einheiten.map(u=>u.nummer||u.bezeichnung).join(', '),g.mea_anzeige||g.mea,{selbst:'Selbst',vollmacht:'Vollmacht',abwesend:'Nicht teilgenommen'}[d.teilnahme]||'Nicht erfasst',g.eigentumer.filter(o=>(d.anwesende_eigentuemer||[]).includes(o.id)).map(o=>o.name).join(', '),d.vertreter,d.nachweis,d.vollmacht_textform?'Ja':''].map(clean).join('\t'));}
 return rows.join('\r\n')+'\r\n';}
module.exports={lesen,stand,pruefen,schreiben,speichern,download};
