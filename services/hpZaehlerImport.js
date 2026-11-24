'use strict';
const crypto=require('node:crypto'),Z=require('./zaehler'),{ordinalDatum}=require('../lib/hpObjektstatus');
const {ValidationError}=require('../lib/validation');
const fail=s=>{throw new ValidationError(s,409);};
const medien={STG:'strom',STR:'strom',SZ:'strom',GAG:'gas',GAS:'gas',GZ:'gas',KWZ:'kaltwasser',WAG:'kaltwasser',WWZ:'warmwasser',WMZ:'waerme',FEW:'waerme',HKV:'heizkostenverteiler',EHK:'heizkostenverteiler',EHV:'heizkostenverteiler'};
function nr(v){if(typeof v!=='string'||!/^\d{1,10}$/.test(v))fail('Ungültiger HP-Schlüssel.');return v;}
function tag(v){try{return ordinalDatum(Number(nr(v)));}catch{fail('Ungültiges HP-Datum.');}}
function uhr(v){nr(v);const n=Number(v);if(n===0)return null;if(n>86399)fail('Ungültige HP-Uhrzeit.');return new Date(n*1000).toISOString().slice(11,19);}
async function planen(db,oid,report){
 await Z.objekt(db,oid);
 if(!report||report.format!=='curaaed-hp-zaehler-v1'||report.nur_lesend!==true||!Number.isSafeInteger(report.objnr)||!Array.isArray(report.zaehler)||!Array.isArray(report.ablesungen)||report.zaehler.length>10000||report.ablesungen.length>100000||report.zaehler_anzahl!==report.zaehler.length||report.ablesungen_anzahl!==report.ablesungen.length)fail('Unvollständiger HP-Zählerbericht.');
 const bind=await db.get('SELECT m.* FROM hp_objekt_zuordnung m JOIN hp_adress_verbindungen v ON v.id=m.verbindung_id WHERE m.objekt_id=? AND m.hp_objnr=? AND v.datenbank=?',[oid,report.objnr,report.datenbank]);
 if(!bind)fail('HP-Datenbank und Objektnummer passen nicht zu diesem Objekt.');
 const units=await db.all('SELECT hp_whgnr,einheit_id FROM hp_einheit_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND objekt_id=?',[bind.verbindung_id,report.objnr,oid]);
 const meterIds=new Set(),readingIds=new Set(),meters=[],readings=[],hinweise=[];
 for(const raw of report.zaehler){
  const hp=nr(raw.Z_lfdNr),whg=Number(nr(raw.Z_Whg_Nr));if(meterIds.has(hp)||Number(nr(raw.Z_Obj_Nr))!==report.objnr)fail('Doppelter Zähler oder falsches Objekt.');meterIds.add(hp);
  const medium=medien[raw.Z_Geraeteart_Schlues],einheit=({'3':'m3','5':'kWh'})[raw.Z_Messeinheit_AbtrSc];
  if(!medium||!einheit||!Z.EINHEITEN[medium].includes(einheit))fail('Geräteart oder HP-Messeinheit noch nicht bestätigt: '+raw.Z_Geraeteart_Schlues+' / '+raw.Z_Messeinheit_AbtrSc);
  const unit=whg?units.find(u=>u.hp_whgnr===whg):null;if(whg&&!unit)fail('Wohnung '+whg+' ist noch nicht eindeutig übernommen.');
  const nummer=Z.text(raw.Z_Zaehlernummer);if(!nummer)fail('Zählernummer fehlt.');
  const von=tag(raw.Z_Einbaudatum),bis=raw.Z_Ausbaudatum==='0'?null:tag(raw.Z_Ausbaudatum);if(bis&&bis<von)fail('Ausbaudatum liegt vor Einbau: '+nummer);
  const original=JSON.stringify(raw),old=await db.get('SELECT * FROM hp_zaehler_quellen WHERE objekt_id=? AND hp_id=?',[oid,hp]);
  if(old&&old.original!==original)fail('HP-Zähler '+nummer+' wurde geändert. Vorhandene Daten bleiben erhalten; Änderung zuerst prüfen.');
  if(!old&&await db.get('SELECT z.id FROM zaehler z JOIN zaehlpunkte p ON p.id=z.zaehlpunkt_id WHERE p.objekt_id=? AND z.nummer=?',[oid,nummer]))fail('Zählernummer '+nummer+' ist bereits vorhanden. Zuordnung zuerst prüfen.');
  meters.push({hp,nummer,medium,einheit,von,bis,einheit_id:unit?.einheit_id||null,original,old,ort:Z.text(raw.Z_Einbauort)||raw.Z_Geraeteart_Schlues});
 }
 for(const raw of report.ablesungen){
  const hp=nr(raw.B_lfdNr),meter=meters.find(m=>m.hp===nr(raw.B_Z_lfdNr));if(!meter||readingIds.has(hp))fail('Doppelte oder nicht zugeordnete Ablesung.');readingIds.add(hp);
  const datum=tag(raw.B_Ablesedatum),uhrzeit=uhr(raw.B_Ableseuhrzeit),wert=Z.wert(raw.B_Wert),original=JSON.stringify(raw);
  const old=await db.get('SELECT * FROM hp_zaehler_ablesungen WHERE objekt_id=? AND hp_id=?',[oid,hp]);if(old&&old.original!==original)fail('Eine bereits übernommene HP-Ablesung wurde geändert. Original bleibt erhalten.');
  if(datum<meter.von||meter.bis&&datum>meter.bis)hinweise.push('HP-Ablesung '+hp+' liegt außerhalb des Einbauzeitraums; Original wird unverändert erhalten.');
  readings.push({hp,meter,datum,uhrzeit,wert,original,old});
 }
 const pruefsumme=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
 return{meters,readings,summary:{objektnummer:report.objnr,zaehler:meters.length,aktiv:meters.filter(m=>!m.bis||m.bis>new Date().toISOString().slice(0,10)).length,ablesungen:readings.length,neue_zaehler:meters.filter(m=>!m.old).length,neue_ablesungen:readings.filter(m=>!m.old).length,ohne_uhrzeit:readings.filter(m=>!m.uhrzeit).length,hinweise,pruefsumme}};
}
async function vorschau(db,oid,report){return(await planen(db,oid,report)).summary;}
async function uebernehmen(db,oid,report,pruefsumme,user){return db.transaktion(async tx=>{
 const plan=await planen(tx,oid,report);if(plan.summary.pruefsumme!==pruefsumme)fail('Der geprüfte Bericht hat sich geändert. Bitte Vorschau erneuern.');
 for(const m of plan.meters){
  if(m.old){m.zid=m.old.zaehler_id;continue;}
  const p=await tx.run('INSERT INTO zaehlpunkte(objekt_id,einheit_id,bezeichnung,medium,art,erstellt_von) VALUES(?,?,?,?,?,?)',[oid,m.einheit_id,m.ort,m.medium,m.einheit_id?'wohnung':'haupt',user.id]);
  const z=await tx.run('INSERT INTO zaehler(zaehlpunkt_id,nummer,einheit,eingebaut_am,ausgebaut_am) VALUES(?,?,?,?,?)',[p.lastID,m.nummer,m.einheit,m.von,m.bis]);m.zid=z.lastID;
  await tx.run('INSERT INTO hp_zaehler_quellen(objekt_id,hp_id,zaehler_id,original) VALUES(?,?,?,?)',[oid,m.hp,m.zid,m.original]);
 }
 for(const r of plan.readings)if(!r.old)await tx.run('INSERT INTO hp_zaehler_ablesungen(objekt_id,hp_id,zaehler_id,datum,uhrzeit,wert,original) VALUES(?,?,?,?,?,?,?)',[oid,r.hp,r.meter.zid,r.datum,r.uhrzeit,r.wert,r.original]);
 return plan.summary;
});}
async function messwerte(db,zid){const rows=await db.all('SELECT h.*,z.einheit FROM hp_zaehler_ablesungen h JOIN zaehler z ON z.id=h.zaehler_id WHERE h.zaehler_id=? ORDER BY datum DESC,CAST(hp_id AS INTEGER) DESC',[zid]);return rows.map(r=>{const raw=JSON.parse(r.original);return{id:'hp-'+r.hp_id,quelle:'hausperfekt',quell_id:r.hp_id,quell_original:r.original,wert:r.wert,einheit:r.einheit,ablesedatum:r.datum,ableseuhrzeit:r.uhrzeit,zeitpunkt:r.datum+'T'+(r.uhrzeit||'00:00:00')+'Z',info:raw.B_Info,ueberlauf:raw.B_Ueberlauf,erfasst_sb:raw.B_Erfasst_SB,beleg:raw.B_Archiv_Nr_Beleg};});}
module.exports={vorschau,uebernehmen,messwerte};

