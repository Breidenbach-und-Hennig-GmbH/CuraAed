'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {ValidationError}=require('../lib/validation'),firmen=require('./kundenFirmen');
const fail=(m='Dokument nicht verfügbar.',s=404)=>{throw new ValidationError(m,s);};
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function baue(db,uploadDir){
 const root=path.resolve(uploadDir);
 async function kontext(tx,sourceId,key){
  const q=await tx.get('SELECT s.*,f.firma_id FROM hp_dms_quellen s JOIN kunden_firmen_quellen f ON f.quelle_id=s.id WHERE s.id=?',[sourceId]);if(!q?.direkt_id)fail();
  let row,refs=[],hp=false;
  if(/^archiv:[1-9]\d*$/.test(key)){
   row=await tx.get('SELECT d.*,m.verfall_am FROM dokumente d LEFT JOIN dms_dokument_meta m ON m.dokument_id=d.id WHERE d.id=?',[Number(key.slice(7))]);if(!row)fail();
   refs=(await tx.all('SELECT objekt_id,einheit_id,adresse_id FROM archiv_verknuepfungen WHERE dokument_id=?',[row.id])).map(r=>r.adresse_id?{typ:'adresse',id:r.adresse_id}:r.einheit_id?{typ:'einheit',id:r.einheit_id}:{typ:'objekt',id:r.objekt_id});
  }else{
   const m=/^hp:([A-Za-z0-9-]+):([1-9]\d*)$/.exec(key);if(!m)fail();hp=true;
   const source=await tx.get('SELECT s.*,f.firma_id FROM hp_dms_quellen s LEFT JOIN kunden_firmen_quellen f ON f.quelle_id=s.id WHERE s.id=?',[m[1]]);
   if(!source||source.direkt_id!==q.direkt_id||source.firma_id&&source.firma_id!==q.firma_id)fail();
   row=await tx.get('SELECT *,dateiname AS original_name FROM hp_dms_dateien WHERE quelle_id=? AND datei_id=?',[m[1],Number(m[2])]);if(!row||row.fehler||!row.sha256)fail();
   let details;try{details=JSON.parse(row.details);}catch{fail();}
   if(!Array.isArray(details.zuordnungen)||details.zuordnungen.some(g=>!Array.isArray(g.eintraege)||g.gesamt>g.eintraege.length))fail();
   for(const r of await tx.all('SELECT * FROM hp_dms_bezuege WHERE quelle_id=? AND datei_id=?',[m[1],Number(m[2])])){
    let hit,typ;
    if(r.art==='persons'){typ='adresse';hit=await tx.get('SELECT adresse_id AS id FROM hp_adress_ziele WHERE verbindung_id=? AND hp_nummer=?',[q.direkt_id,r.hp_nummer]);}
    if(r.art==='buildings'){typ='objekt';hit=await tx.get('SELECT objekt_id AS id FROM hp_objekt_zuordnung WHERE verbindung_id=? AND hp_objnr=?',[q.direkt_id,r.hp_nummer]);}
    if(r.art==='units'){typ='einheit';hit=await tx.get('SELECT einheit_id AS id FROM hp_einheit_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND hp_whgnr=?',[q.direkt_id,r.objekt_nummer,r.hp_nummer]);}
    if(typ){if(!hit)fail();refs.push({typ,id:hit.id});}
   }
  }
  if(!row.speicher_name||!refs.length)fail();
  if(row.verfall_am&&row.verfall_am<new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date()))fail();
  const links=[...new Map(refs.map(r=>[r.typ+':'+r.id,r])).values()].sort((a,b)=>(a.typ+':'+a.id).localeCompare(b.typ+':'+b.id));
  for(const r of links){let found;
   if(r.typ==='adresse')found=await tx.get('SELECT a.id FROM hp_adress_ziele m JOIN adressen a ON a.id=m.adresse_id WHERE m.verbindung_id=? AND a.id=? AND a.archiviert=0',[q.direkt_id,r.id]);
   if(r.typ==='objekt')found=await tx.get("SELECT o.id FROM hp_objekt_zuordnung m JOIN objekte o ON o.id=m.objekt_id WHERE m.verbindung_id=? AND o.id=? AND o.archiviert=0 AND m.verwaltungsstatus='aktiv'",[q.direkt_id,r.id]);
   if(r.typ==='einheit')found=await tx.get("SELECT e.id FROM hp_einheit_zuordnung m JOIN einheiten e ON e.id=m.einheit_id JOIN hp_objekt_zuordnung h ON h.verbindung_id=m.verbindung_id AND h.objekt_id=e.objekt_id JOIN objekte o ON o.id=e.objekt_id WHERE m.verbindung_id=? AND e.id=? AND e.archiviert=0 AND o.archiviert=0 AND h.verwaltungsstatus='aktiv'",[q.direkt_id,r.id]);
   if(!found)fail();
  }
  const basis={quelle:sourceId,direkt:q.direkt_id,firma:q.firma_id,dokument:key,links,titel:row.titel,name:row.original_name,speicher_name:row.speicher_name,groesse:row.groesse,sha256:row.sha256||null,datum:row.dokument_datum||row.datum||null,verfall:row.verfall_am||null};
  return{basis,row,hp};
 }
 async function datei(c,expected=null){
  const base=path.resolve(root,c.hp?'hp-dms':'.'),name=c.row.speicher_name;
  if(path.basename(name)!==name||/[\\/\x00]/.test(name))fail();
  let handle;
  try{
   const realBase=await fs.realpath(base),real=await fs.realpath(path.join(base,name)),rel=path.relative(realBase,real);
   if(rel.startsWith('..')||path.isAbsolute(rel))fail();
   handle=await fs.open(path.join(base,name),require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0));
   const stat=await handle.stat();if(!stat.isFile())fail();
   const h=crypto.createHash('sha256');for await(const chunk of handle.createReadStream({autoClose:false,start:0}))h.update(chunk);const digest=h.digest('hex');
   if(expected&&digest!==expected||c.hp&&digest!==c.row.sha256)fail('Die gespeicherte Datei wurde verändert. Bitte die Freigabe prüfen.',409);
   const prefix=Buffer.alloc(5);await handle.read(prefix,0,5,0);
   return{handle,hash:digest,pdf:prefix.toString()==='%PDF-',name:c.row.original_name};
  }catch(e){if(handle)await handle.close().catch(()=>{});if(e instanceof ValidationError)throw e;fail('Die Datei ist noch nicht in CuraAed verfügbar.',410);}
 }
 function erlaubt(s,c,group){
  if(s.testkonto)return false;
  const roles=s.rollen.filter(r=>group==='beide'||r.rolle===group),addresses=new Set(roles.map(r=>r.adresse_id)),units=new Set(roles.map(r=>r.einheit_id).filter(Boolean)),objects=new Set(roles.map(r=>r.objekt_id));
  const links=c.basis.links,persons=links.filter(r=>r.typ==='adresse'),unitLinks=links.filter(r=>r.typ==='einheit'),objectLinks=links.filter(r=>r.typ==='objekt');
  // More specific references restrict broader building associations. A tenant
  // never gets a neighbour's statement just because the same building is linked.
  return !!roles.length&&(!persons.length||persons.some(r=>addresses.has(r.id)))&&unitLinks.every(r=>units.has(r.id))&&objectLinks.every(r=>objects.has(r.id))&&(persons.length||unitLinks.length||objectLinks.length);
 }
 async function vorschau(owner,sourceId,key){await firmen.quelle(db,owner,sourceId);const c=await kontext(db,sourceId,key),f=await datei(c);await f.handle.close();
  const grant=await db.get('SELECT id,aktiv,zielgruppe,basis,datei_hash FROM kunden_dokumentfreigaben WHERE quelle_id=? AND dokument=?',[sourceId,key]);
  const zuordnungen=[];
  for(const link of c.basis.links){let label;
   if(link.typ==='adresse'){const a=await db.get('SELECT a.*,m.hp_nummer FROM adressen a JOIN hp_adress_ziele m ON m.adresse_id=a.id AND m.verbindung_id=? WHERE a.id=?',[c.basis.direkt,link.id]);label='Adresse '+a.hp_nummer+' · '+require('./adressen').anzeigename(a);}
   if(link.typ==='objekt'){const o=await db.get('SELECT o.bezeichnung,m.hp_objnr FROM objekte o JOIN hp_objekt_zuordnung m ON m.objekt_id=o.id AND m.verbindung_id=? WHERE o.id=?',[c.basis.direkt,link.id]);label='Objekt '+o.hp_objnr+' · '+o.bezeichnung;}
   if(link.typ==='einheit'){const e=await db.get('SELECT e.bezeichnung,m.hp_objnr,m.hp_whgnr FROM einheiten e JOIN hp_einheit_zuordnung m ON m.einheit_id=e.id AND m.verbindung_id=? WHERE e.id=?',[c.basis.direkt,link.id]);label='Objekt '+e.hp_objnr+' / Wohnung '+e.hp_whgnr+' · '+e.bezeichnung;}
   zuordnungen.push({typ:link.typ,label});
  }
  return{titel:c.basis.titel,dateiname:c.basis.name,zuordnungen,pruefwert:hash([c.basis,f.hash]),freigabe:grant?{id:grant.id,aktiv:!!grant.aktiv,aktuell:grant.basis===JSON.stringify(c.basis)&&grant.datei_hash===f.hash,zielgruppe:grant.zielgruppe}:null};}
 async function speichern(owner,body){
  if(!['eigentuemer','mieter','beide'].includes(body.zielgruppe)||typeof body.aktiv!=='boolean')fail('Bitte Zielgruppe und Freigabestatus wählen.',400);
  return db.transaktion(async tx=>{await firmen.quelle(tx,owner,body.quelle);const c=await kontext(tx,body.quelle,body.dokument),f=await datei(c);await f.handle.close();if(body.pruefwert!==hash([c.basis,f.hash]))fail('Dokument oder Zuordnungen geändert. Bitte die Vorschau erneut prüfen.',409);
   await tx.run('INSERT INTO kunden_dokumentfreigaben(id,quelle_id,dokument,zielgruppe,basis,datei_hash,aktiv,erstellt_von) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(quelle_id,dokument) DO UPDATE SET zielgruppe=excluded.zielgruppe,basis=excluded.basis,datei_hash=excluded.datei_hash,aktiv=excluded.aktiv,erstellt_von=excluded.erstellt_von,geaendert_am=CURRENT_TIMESTAMP',[crypto.randomUUID(),body.quelle,body.dokument,body.zielgruppe,JSON.stringify(c.basis),f.hash,body.aktiv?1:0,owner]);return{ok:true};
  });
 }
 async function holen(tx,s,id){
  const g=await tx.get('SELECT * FROM kunden_dokumentfreigaben WHERE id=? AND quelle_id=? AND aktiv=1',[id,s.konto.quelle_id]);if(!g)fail();
  let c;try{c=await kontext(tx,g.quelle_id,g.dokument);}catch{fail();}
  if(g.basis!==JSON.stringify(c.basis)||!erlaubt(s,c,g.zielgruppe))fail();return{...c,freigabe:g.id,hash:g.datei_hash};
 }
 async function liste(tx,s,query={}){
  const offset=Number(query.nach||0),search=String(query.suche||'');if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||search.length>200)fail('Ungültige Dokumentensuche.',400);
  if(s.testkonto)return{eintraege:[],mehr:false,nach:null};
  const rows=await tx.all('SELECT id FROM kunden_dokumentfreigaben WHERE quelle_id=? AND aktiv=1 ORDER BY id LIMIT 101 OFFSET ?',[s.konto.quelle_id,offset]),out=[];
  for(const row of rows.slice(0,100)){try{const c=await holen(tx,s,row.id);if(![c.basis.titel,c.basis.name].join(' ').toLowerCase().includes(search.toLowerCase()))continue;out.push({id:row.id,titel:c.basis.titel,dateiname:c.basis.name,datum:c.basis.datum});}catch(e){if(!(e instanceof ValidationError))throw e;}}
  return{eintraege:out,mehr:rows.length>100,nach:rows.length>100?offset+100:null};
 }
 return{vorschau,speichern,holen,liste,datei};
}
module.exports={baue};
