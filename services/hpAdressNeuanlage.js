'use strict';
const crypto=require('node:crypto'),H=require('./hpAdressSync'),D=require('./adressDubletten'),V=require('../lib/validation'),enc=require('iconv-lite');
const fail=(m,s=409)=>{throw new V.ValidationError(m,s);},hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function text(v,max,label){v=String(v||'');if(v.length>max||/[\x00-\x1f\x7f]/.test(v)||v!==v.trimEnd()||enc.decode(enc.encode(v,'cp850'),'cp850')!==v)fail(label+' passt nicht in das HP-Feld (maximal '+max+' Zeichen, HP-Zeichensatz).',400);return v;}
function snapshot(a,sb,bekannt=[]){if(a.email&&!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(a.email))fail('Bitte eine gültige E-Mail-Adresse für die HP-Neuanlage angeben.',400);const record=H.record(H.local(a,1));if(!record.name1.trim())fail('Für die HP-Neuanlage fehlt der Name.',400);if(!/^[A-Z]{1,3}$/.test(sb||''))fail('Bitte zuerst das persönliche HP-Sachbearbeiterkürzel in der Benutzerverwaltung hinterlegen.',400);return{record,sb,telefon:text(a.telefon,25,'Telefonnummer'),mobil:text(a.mobil,25,'Mobilnummer'),email:text(a.email,60,'E-Mail-Adresse'),bekannte_hp:bekannt};}
async function vorbereiten(tx,owner,b){
 const v=await tx.get('SELECT v.* FROM hp_adress_verbindungen v JOIN hp_adress_vollfreigaben f ON f.verbindung_id=v.id WHERE v.aktiv=1 AND f.neuanlagen=1');if(!v)return null;
 if(v.ablauf_ms!==0&&v.ablauf_ms<=Date.now())fail('Die Freigabe für HP-Neuanlagen ist abgelaufen. Bitte vor der Neuanlage erneuern.');
 const user=await tx.get('SELECT kuerzel FROM benutzer WHERE id=?',[owner]),duplicates=await D.pruefen(tx,b),known=[];
 for(const a of duplicates.treffer){const m=await tx.get('SELECT hp_nummer FROM hp_adress_zuordnung WHERE adresse_id=? AND verbindung_id=?',[a.id,v.id]);if(m)known.push(m.hp_nummer);}
 return{verbindung_id:v.id,daten:snapshot(b,user?.kuerzel,known)};
}
async function einreihen(tx,aid,prepared){if(!prepared)return;await tx.run("INSERT INTO hp_adress_neuanlagen(id,verbindung_id,adresse_id,daten,status) VALUES(?,?,?,?,'wartend')",[crypto.randomUUID(),prepared.verbindung_id,aid,JSON.stringify(prepared.daten)]);}
async function metadata(db,a){const j=await db.get('SELECT status,meldung,hp_nummer FROM hp_adress_neuanlagen WHERE adresse_id=?',[a.id]);return j?{...a,hp_neuanlage:j}:a;}
async function kommunikationZuordnen(tx,j){
 const data=JSON.parse(j.daten),n=String(j.hp_nummer);let index=0;
 for(const [key,field]of [['telefon','telefon'],['telefon','mobil'],['email','email']]){
  if(!data[field])continue;let local;
  if(key==='telefon'){index++;local=await tx.get('SELECT id,art,nummer,bemerkung,kurzwahl FROM adress_telefone WHERE adresse_id=? AND nummer=? AND art=? ORDER BY id LIMIT 1',[j.adresse_id,data[field],field==='mobil'?'Funktelefon':'Telefon']);}
  else local=await tx.get('SELECT id,adresse,bemerkung,ist_email,standard,hpmobile FROM adress_emails WHERE adresse_id=? AND adresse=? ORDER BY id LIMIT 1',[j.adresse_id,data[field]]);
  if(!local)continue;const {id:localId,...projection}=local;
  await tx.run("INSERT OR IGNORE INTO hp_adress_bereiche(verbindung_id,hp_nummer,bereich,rohdaten,hash,status) VALUES(?,?,?,'[]','','ausstehend')",[j.verbindung_id,j.hp_nummer,key]);
  await tx.run("INSERT OR IGNORE INTO hp_adress_detail_zuordnung(verbindung_id,hp_nummer,bereich,quellschluessel,lokal_id,projektion,status) VALUES(?,?,?,?,?,?,'synchron')",[j.verbindung_id,j.hp_nummer,key,JSON.stringify([n,key==='telefon'?String(index):'1']),localId,JSON.stringify(projection)]);
 }
}
function service(db){
 async function auth(tx,id,token,database){await H.service(tx).zugang(id,token,database);if(!await tx.get('SELECT 1 FROM hp_adress_vollfreigaben WHERE verbindung_id=? AND neuanlagen=1',[id]))fail('HP-Neuanlagen sind für diese Verbindung nicht freigegeben.',403);}
 async function auftrag(tx,id,jid){const j=await tx.get('SELECT * FROM hp_adress_neuanlagen WHERE id=? AND verbindung_id=?',[jid,id]);if(!j)fail('HP-Neuanlage nicht gefunden.',404);return j;}
 return{
  async abholen(id,token,b){return db.transaktion(async tx=>{
   await auth(tx,id,token,b.datenbank);
   // Only an already reserved operation may be read back. Never reissue a write attempt.
   const unresolved=await tx.get("SELECT * FROM hp_adress_neuanlagen WHERE verbindung_id=? AND status='reserviert' ORDER BY erstellt_am LIMIT 1",[id]);
   if(unresolved&&Date.now()-unresolved.abgeholt_ms<120000)return{};
   if(unresolved)return{pruefen:{id:unresolved.id,daten:JSON.parse(unresolved.daten),reservierung:JSON.parse(unresolved.reservierung)}};
   await tx.run("UPDATE hp_adress_neuanlagen SET status='pruefen',meldung='Abholung ohne bestätigte Reservierung unterbrochen. Kein automatischer Neuversuch.' WHERE verbindung_id=? AND status='abgeholt' AND abgeholt_ms<?",[id,Date.now()-120000]);
   const j=await tx.get("SELECT * FROM hp_adress_neuanlagen WHERE verbindung_id=? AND status='wartend' ORDER BY erstellt_am,id LIMIT 1",[id]);if(!j)return{};
   const a=await tx.get('SELECT * FROM adressen WHERE id=?',[j.adresse_id]);if(!a||a.archiviert){await tx.run("UPDATE hp_adress_neuanlagen SET status='pruefen',meldung='Lokale Adresse archiviert oder nicht mehr vorhanden.' WHERE id=?",[j.id]);return{};}
   let data;try{const old=JSON.parse(j.daten);data=snapshot(a,old.sb,old.bekannte_hp);}catch(e){if(!(e instanceof V.ValidationError))throw e;await tx.run("UPDATE hp_adress_neuanlagen SET status='pruefen',meldung=? WHERE id=?",[e.message,j.id]);return{};}
   await tx.run("UPDATE hp_adress_neuanlagen SET daten=?,status='abgeholt',abgeholt_ms=? WHERE id=?",[JSON.stringify(data),Date.now(),j.id]);return{anlegen:{id:j.id,daten:data}};
  });},
  async reservieren(id,token,b){return db.transaktion(async tx=>{
   await auth(tx,id,token,b.datenbank);const j=await auftrag(tx,id,b.id),r=b.reservierung;
   if(!r||!Number.isSafeInteger(r.nummer)||r.nummer<1||r.nummer>2147483647||!Number.isSafeInteger(r.datum)||r.datum<700000||r.datum>800000||!Number.isSafeInteger(r.uhrzeit)||r.uhrzeit<0||r.uhrzeit>86399||!Number.isSafeInteger(r.protokoll)||r.protokoll<1)fail('Ungültige HP-Neuanlagereservierung.',400);
   const canonical={nummer:r.nummer,datum:r.datum,uhrzeit:r.uhrzeit,protokoll:r.protokoll};
   if(j.reservierung){if(hash(JSON.parse(j.reservierung))!==hash(canonical))fail('HP-Nummer für diesen Auftrag bereits festgelegt.');return{ok:true};}
   if(j.status!=='abgeholt')fail('HP-Neuanlage wurde nicht zur Ausführung abgeholt.');
   const current=await tx.get('SELECT * FROM adressen WHERE id=?',[j.adresse_id]),data=JSON.parse(j.daten);
   if(!current||current.archiviert||hash(snapshot(current,data.sb,data.bekannte_hp))!==hash(data))fail('Lokale Adresse wurde während der Vorbereitung geändert. Keine HP-Neuanlage.');
   const record={...JSON.parse(j.daten).record,nummer:r.nummer};
   if(await tx.get('SELECT 1 FROM hp_adress_zuordnung WHERE adresse_id=? OR (verbindung_id=? AND hp_nummer=?)',[j.adresse_id,id,r.nummer]))fail('HP-Nummer oder lokale Adresse ist bereits zugeordnet.');
   await tx.run("INSERT INTO hp_adress_zuordnung(verbindung_id,hp_nummer,adresse_id,basis,status,meldung,gelesen_am) VALUES(?,?,?,?,'neuanlage','HP-Neuanlage läuft; Rückprüfung steht aus.',CURRENT_TIMESTAMP)",[id,r.nummer,j.adresse_id,JSON.stringify(record)]);
   await tx.run("UPDATE hp_adress_neuanlagen SET hp_nummer=?,reservierung=?,status='reserviert' WHERE id=?",[r.nummer,JSON.stringify(canonical),j.id]);return{ok:true};
  });},
  async ergebnis(id,token,b){return db.transaktion(async tx=>{
   await auth(tx,id,token,b.datenbank);const j=await auftrag(tx,id,b.id);if(!['erfolg','fehler','unklar','dublette'].includes(b.status))fail('Ungültiges Neuanlageergebnis.',400);
   const digest=hash([b.status,b.record||null]);if(j.result_hash){if(j.result_hash!==digest)fail('Abweichendes Ergebnis für bereits abgeschlossenen Auftrag.');return{ok:true};}
   if(!['abgeholt','reserviert'].includes(j.status))fail('Neuanlageauftrag ist nicht ausführbar.');
   if(b.status==='erfolg'){
    if(!j.reservierung)fail('HP-Neuanlage wurde nicht reserviert.');const wanted={...JSON.parse(j.daten).record,nummer:j.hp_nummer},actual=H.record(b.record);if(hash(actual)!==hash(wanted)||b.vollstaendig_geprueft!==true)fail('HP-Rückprüfung stimmt nicht mit der Neuanlage überein.');
    await tx.run("UPDATE hp_adress_zuordnung SET basis=?,remote=?,status='synchron',meldung=NULL,gelesen_am=CURRENT_TIMESTAMP WHERE adresse_id=?",[JSON.stringify(actual),JSON.stringify(actual),j.adresse_id]);
    const number='HP-'+j.hp_nummer,other=await tx.get('SELECT id FROM adressen WHERE nummer=? AND id!=?',[number,j.adresse_id]);if(other)fail('HP-Adressnummer lokal bereits vergeben. Bitte Zuordnung prüfen.');
    await tx.run("UPDATE adressen SET nummer=?,geaendert_am=CURRENT_TIMESTAMP WHERE id=?",[number,j.adresse_id]);
    await kommunikationZuordnen(tx,j);
   }else if(j.reservierung)await tx.run("UPDATE hp_adress_zuordnung SET status='unklar',meldung='HP-Neuanlage nicht vollständig bestätigt. Kein automatischer Neuversuch.' WHERE adresse_id=?",[j.adresse_id]);
   const message=b.status==='erfolg'?null:b.status==='dublette'?'In HP wurde eine mögliche Dublette gefunden. Bitte bestehende Adresse prüfen.':'HP-Neuanlage nicht bestätigt. Kein automatischer Neuversuch; bitte prüfen.';
   await tx.run('UPDATE hp_adress_neuanlagen SET status=?,meldung=?,result_hash=?,erledigt_am=CURRENT_TIMESTAMP WHERE id=?',[b.status==='erfolg'?'synchron':'pruefen',message,digest,j.id]);return{ok:true};
  });},
 };
}
module.exports={service,snapshot,vorbereiten,einreihen,metadata};
