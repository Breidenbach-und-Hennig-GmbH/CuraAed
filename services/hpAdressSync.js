'use strict';
const crypto=require('node:crypto');
const encoding=require('iconv-lite');
const {ValidationError}=require('../lib/validation');
const fields={anrede:30,vorname:30,name1:30,zusatz:30,strasse:30,land:3,plz:6,ort:30};
const fail=(m,s=409)=>{throw new ValidationError(m,s);};
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function record(v) {
 if(!v || !Number.isSafeInteger(v.nummer) || v.nummer<1 || v.nummer>2147483647)fail('Ungültige HP-Adressnummer.',400);
 const out={nummer:v.nummer};
 for(const [k,max] of Object.entries(fields)) {
  if(typeof v[k]!=='string'||v[k].length>max||/[\x00-\x1f\x7f]/.test(v[k])||v[k]!==v[k].trimEnd())fail('Ungültiges HP-Adressfeld: '+k,400);
  if(encoding.decode(encoding.encode(v[k],'cp850'),'cp850')!==v[k])fail('Zeichen im HP-Adressfeld nicht darstellbar: '+k,400);
  out[k]=v[k];
 }
 return out;
}
function local(a,n) {return record({nummer:n,anrede:a.anrede||'',vorname:a.vorname||'',name1:(a.adresstyp==='firma'?a.firmenname:a.nachname)||'',zusatz:a.zusatz||'',strasse:a.strasse||'',land:a.land==='Deutschland'?'DE':a.land||'',plz:a.plz||'',ort:a.ort||''});}
function revision(a,n){return digest(local(a,n));}
async function metadata(db,a) {
 const m=await db.get('SELECT m.*,v.aktiv,v.ablauf_ms,v.zuletzt_gesehen FROM hp_adress_zuordnung m JOIN hp_adress_verbindungen v ON v.id=m.verbindung_id WHERE m.adresse_id=?',[a.id]);
 if(!m)return a;
 let status=m.status;
 if(status==='synchron'&&revision(a,m.hp_nummer)!==digest(JSON.parse(m.basis)))status='ausstehend';
 return {...a,hp_sync:{nummer:m.hp_nummer,status,aktiv:!!m.aktiv&&m.ablauf_ms>Date.now(),online:!!m.zuletzt_gesehen&&Date.now()-m.zuletzt_gesehen<30000,version:revision(a,m.hp_nummer),konflikt_version:digest([m.basis,m.remote,revision(a,m.hp_nummer)]),meldung:m.meldung}};
}
async function validateSave(db,old,data) {
 const m=await db.get('SELECT * FROM hp_adress_zuordnung WHERE adresse_id=?',[old.id]);if(!m)return;
 if(String(data.nummer)!==String(old.nummer))fail('Die HP-Adressnummer ist fest zugeordnet.');
 const before=local(old,m.hp_nummer),after=local(data,m.hp_nummer);
 if(!after.name1)fail('Der HP-Name darf nicht leer sein.',400);
 if(digest(before)!==digest(after)) {
  if(data.hp_version!==digest(before))fail('Die Adresse wurde inzwischen geändert. Bitte neu öffnen.');
  if(['konflikt','unklar','unterwegs'].includes(m.status))fail('HP-Abgleich bitte zuerst klären; die Übertragung dieser Adresse ist angehalten.');
 }
}
function service(db,{now=()=>Date.now()}={}) {
 const iso=()=>new Date(now()).toISOString();
 async function auth(tx,id,token) {
  const v=await tx.get("SELECT v.* FROM hp_adress_verbindungen v JOIN benutzer b ON b.id=v.benutzer_id WHERE v.id=? AND v.aktiv=1 AND b.aktiv=1 AND b.rolle='admin'",[id]);
  if(!v||typeof token!=='string'||!crypto.timingSafeEqual(Buffer.from(digest(token)),Buffer.from(v.token_hash))||v.ablauf_ms<=now())fail('Adressconnector-Freigabe ungültig oder abgelaufen.',401);
  return v;
 }
 async function audit(tx,a,k,old,value) {
  if((old||'')===(value||''))return;
  await tx.run("INSERT INTO aenderungen (adresse_id,bereich,aktion,feld,alt,neu,benutzer_name) VALUES (?,'adresse','geaendert',?,?,?,'HausPerfekt-Abgleich')",[a.id,k,old||'',value||'']);
 }
 async function apply(tx,a,r) {
  const values={anrede:r.anrede,vorname:r.vorname,[a.adresstyp==='firma'?'firmenname':'nachname']:r.name1,zusatz:r.zusatz,strasse:r.strasse,land:r.land,plz:r.plz,ort:r.ort};
  const changed=Object.entries(values).filter(([k,val])=>(a[k]||'')!==val);
  if(!changed.length)return;
  for(const [k,val] of changed)await audit(tx,a,k,a[k],val);
  await tx.run("UPDATE adressen SET "+changed.map(([k])=>k+'=?').join(',')+",geaendert_am=datetime('now') WHERE id=?",[...changed.map(([,v])=>v),a.id]);
 }
 return {
  async create(owner,input) {
   if(input.zustimmung!==true||typeof input.name!=='string'||!input.name.trim()||input.name.length>80||typeof input.datenbank!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(input.datenbank))fail('Name, Datenbank und Freigabe für den Adressabgleich fehlen.',400);
   return db.transaktion(async tx=>{
    const previous=await tx.get('SELECT * FROM hp_adress_verbindungen LIMIT 1');
    if(previous&&(previous.benutzer_id!==owner||previous.datenbank!==input.datenbank.toUpperCase()))fail('Diese Installation ist bereits einem anderen HP-Kundenbestand zugeordnet. Keine Vermischung von Kundendaten.');
    const id=previous?.id||crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url'),expires=now()+8*3600000;
    if(previous)await tx.run('UPDATE hp_adress_verbindungen SET token_hash=?,ablauf_ms=?,aktiv=1 WHERE id=?',[digest(token),expires,id]);
    else await tx.run('INSERT INTO hp_adress_verbindungen (id,benutzer_id,name,datenbank,token_hash,ablauf_ms) VALUES (?,?,?,?,?,?)',[id,owner,input.name.trim(),input.datenbank.toUpperCase(),digest(token),expires]);
    return {id,token,ablauf_ms:expires};
   });
  },
  async list(owner){const rows=await db.all('SELECT id,name,datenbank,aktiv,ablauf_ms,zuletzt_gesehen,(SELECT COUNT(*) FROM hp_adress_zuordnung m WHERE m.verbindung_id=v.id) AS anzahl,(SELECT COUNT(*) FROM hp_adress_zuordnung m WHERE m.verbindung_id=v.id AND m.status IN (\'konflikt\',\'unklar\',\'fehler\')) AS probleme FROM hp_adress_verbindungen v WHERE benutzer_id=?',[owner]);for(const v of rows){v.importfehler=await db.all('SELECT hp_nummer,meldung,gesehen_am FROM hp_adress_importfehler WHERE verbindung_id=? ORDER BY hp_nummer',[v.id]);}return rows;},
  async report(id,token,error){return db.transaktion(async tx=>{await auth(tx,id,token);const message=error instanceof ValidationError?error.message:'Interner Abgleichfehler'+(typeof error.code==='string'&&/^SQLITE_[A-Z_]+$/.test(error.code)?' ('+error.code+')':'')+'.';await tx.run('INSERT OR REPLACE INTO hp_adress_importfehler VALUES (?,?,?,?)',[id,0,message,iso()]);});},
  async disconnect(owner,id){await db.run('UPDATE hp_adress_verbindungen SET aktiv=0 WHERE id=? AND benutzer_id=?',[id,owner]);return {ok:true};},
  async resolve(address,input){return db.transaktion(async tx=>{
   const m=await tx.get('SELECT * FROM hp_adress_zuordnung WHERE adresse_id=?',[address]);
   if(!m||!['konflikt','fehler','unklar'].includes(m.status)||!m.remote)fail('Bitte zuerst einen aktuellen HP-Abgleich abwarten.');
   const a=await tx.get('SELECT * FROM adressen WHERE id=?',[address]);
   if(now()-Date.parse(m.gelesen_am)>60000||input.version!==digest([m.basis,m.remote,revision(a,m.hp_nummer)]))fail('Konfliktstand ist veraltet. Bitte Adresse neu öffnen.');
   if(!['hp','curaaed'].includes(input.uebernehmen))fail('Konfliktentscheidung fehlt.',400);
   if(input.uebernehmen==='hp')await apply(tx,a,JSON.parse(m.remote));
   await tx.run("UPDATE hp_adress_zuordnung SET basis=remote,status='synchron',ziel=NULL,meldung=NULL WHERE adresse_id=?",[address]);return {ok:true};
  });},
  async scan(id,token,input) {
   if(!input||!Array.isArray(input.records)||input.records.length>50)fail('Höchstens 50 Adressen je Abgleich.',400);
   if(input.records.some(r=>!r||!Number.isSafeInteger(r.nummer)||r.nummer<1||r.nummer>2147483647))fail('Ungültige HP-Adressnummer.',400);
   if(new Set(input.records.map(r=>r.nummer)).size!==input.records.length)fail('Doppelte HP-Adressnummer.',400);
   return db.transaktion(async tx=>{
    const v=await auth(tx,id,token);if(input.datenbank!==v.datenbank)fail('HP-Kundenbestand stimmt nicht überein.');
    await tx.run('DELETE FROM hp_adress_importfehler WHERE verbindung_id=? AND hp_nummer=0',[id]);
    const records=[];
    for(const raw of input.records){try{records.push(record(raw));await tx.run('DELETE FROM hp_adress_importfehler WHERE verbindung_id=? AND hp_nummer=?',[id,raw.nummer]);}catch(e){if(!(e instanceof ValidationError))throw e;await tx.run('INSERT OR REPLACE INTO hp_adress_importfehler VALUES (?,?,?,?)',[id,raw.nummer,e.message,iso()]);await tx.run("UPDATE hp_adress_zuordnung SET status='fehler',meldung=? WHERE verbindung_id=? AND hp_nummer=?",[e.message,id,raw.nummer]);}}
    await tx.run('UPDATE hp_adress_verbindungen SET zuletzt_gesehen=? WHERE id=?',[now(),id]);
    await tx.run("UPDATE hp_adress_zuordnung SET status='unklar',meldung='Keine bestätigte Rückmeldung; keine automatische Wiederholung.' WHERE verbindung_id=? AND status='unterwegs' AND unterwegs_ms<?",[id,now()-120000]);
    const jobs=[];
    for(const remote of records) {
     let m=await tx.get('SELECT * FROM hp_adress_zuordnung WHERE verbindung_id=? AND hp_nummer=?',[id,remote.nummer]);
     if(!m) {
      // Bestehende lokale Kontakte werden niemals allein anhand einer gleichen Nummer überschrieben.
      const number='HP-'+remote.nummer;
      if(await tx.get('SELECT id FROM adressen WHERE nummer=?',[number])){await tx.run('INSERT OR REPLACE INTO hp_adress_importfehler VALUES (?,?,?,?)',[id,remote.nummer,'Lokale Adressnummer bereits belegt. Zuordnung manuell prüfen.',iso()]);continue;}
      const a={id:(await tx.run("INSERT INTO adressen (nummer,adresstyp,nachname) VALUES (?,'person',?)",[number,remote.name1])).lastID,adresstyp:'person'};
      await apply(tx,a,remote);
      await tx.run("INSERT INTO hp_adress_zuordnung (verbindung_id,hp_nummer,adresse_id,basis,status,gelesen_am) VALUES (?,?,?,?,'synchron',?)",[id,remote.nummer,a.id,JSON.stringify(remote),iso()]);continue;
     }
     const a=await tx.get('SELECT * FROM adressen WHERE id=?',[m.adresse_id]);
     const base=JSON.parse(m.basis),current=local(a,m.hp_nummer);
     if(['unterwegs','unklar','fehler','konflikt'].includes(m.status)) {
      await tx.run('UPDATE hp_adress_zuordnung SET remote=?,gelesen_am=? WHERE adresse_id=?',[JSON.stringify(remote),iso(),a.id]);
      // Ein unterbrochener Commit kann durch genaues Rücklesen bestätigt werden, niemals durch erneutes Schreiben.
      const target=m.ziel&&JSON.parse(m.ziel);
      if(target&&digest(remote)===digest(target)) {
       await tx.run("UPDATE hp_adress_zuordnung SET basis=?,status='synchron',meldung=NULL,ziel=NULL,gelesen_am=? WHERE adresse_id=?",[JSON.stringify(remote),iso(),a.id]);
      }
      continue;
     }
     const merged={nummer:remote.nummer};let conflict=false;
     for(const k of Object.keys(fields)) {
      if(current[k]!==base[k]&&remote[k]!==base[k]&&current[k]!==remote[k])conflict=true;
      merged[k]=current[k]!==base[k]?current[k]:remote[k];
     }
     if(conflict) {
      await tx.run("UPDATE hp_adress_zuordnung SET status='konflikt',meldung='Dasselbe Feld wurde in HP und CuraAed geändert. Keine Seite wurde überschrieben.',remote=?,gelesen_am=? WHERE adresse_id=?",[JSON.stringify(remote),iso(),a.id]);continue;
     }
     await apply(tx,a,merged);
     if(digest(merged)===digest(remote)) {
      await tx.run("UPDATE hp_adress_zuordnung SET basis=?,status='synchron',meldung=NULL,gelesen_am=? WHERE adresse_id=?",[JSON.stringify(remote),iso(),a.id]);
     }else {
      const claim=crypto.randomUUID();
      await tx.run("UPDATE hp_adress_zuordnung SET status='unterwegs',claim=?,ziel=?,result_hash=NULL,unterwegs_ms=?,meldung='Änderung wird an HP übertragen.' WHERE adresse_id=?",[claim,JSON.stringify(merged),now(),a.id]);
      jobs.push({id:claim,alt:remote,neu:merged});
     }
    }
    return {jobs};
   });
  },
  async result(id,token,input) {
   return db.transaktion(async tx=>{
    await auth(tx,id,token);
    const m=await tx.get('SELECT * FROM hp_adress_zuordnung WHERE verbindung_id=? AND claim=?',[id,input.id]);if(!m)fail('Adressauftrag nicht gefunden.',404);
    const signature=digest(input);if(m.result_hash){if(signature!==m.result_hash)fail('Abweichende doppelte Rückmeldung.');return {ok:true};}
    if(!['erfolg','konflikt','fehler','unklar'].includes(input.status))fail('Ungültiger Adressstatus.',400);
    const remote=input.record?record(input.record):null;
    if(remote&&remote.nummer!==m.hp_nummer)fail('Fremde Adressnummer.');
    if(input.status==='erfolg'&&(!remote||digest(remote)!==digest(JSON.parse(m.ziel))))fail('HP hat die gewünschte Adresse nicht bestätigt.');
    await tx.run('UPDATE hp_adress_zuordnung SET status=?,basis=?,remote=?,meldung=?,result_hash=?,gelesen_am=? WHERE adresse_id=?',[input.status==='erfolg'?'synchron':input.status,input.status==='erfolg'?JSON.stringify(remote):m.basis,remote?JSON.stringify(remote):null,input.status==='erfolg'?null:'Abgleich angehalten: '+input.status,signature,iso(),m.adresse_id]);
    return {ok:true};
   });
  },
 };
}
module.exports={service,fields,record,local,metadata,validateSave,revision};

