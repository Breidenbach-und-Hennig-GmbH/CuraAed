'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation');
const firmen=require('./kundenFirmen'),zugriff=require('./kundenZugriff');
const fail=(m,s=409)=>{throw new ValidationError(m,s);};
// An explicitly selected address can get a customer identity even if its old
// Mobile identity was a team account. No employee privileges are copied.
async function anlegen(db,owner,sourceId,hpNumbers,email){
 if(!Array.isArray(hpNumbers)||!hpNumbers.length||hpNumbers.length>200||hpNumbers.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(hpNumbers).size!==hpNumbers.length)fail('Bitte eindeutige HP-Adressnummern eingeben.',400);
 if(typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>320)fail('Bitte die gespeicherte E-Mail-Adresse auswählen.',400);
 email=email.trim().toLowerCase();const numbers=hpNumbers.slice().sort((a,b)=>a-b);
 return db.transaktion(async tx=>{
  const q=await firmen.quelle(tx,owner,sourceId);
  if(!q.direkt_id)fail('Die direkte HP-Adressquelle fehlt.');
  const rows=await tx.all(`SELECT m.hp_nummer,m.adresse_id,a.archiviert,a.email,a.vorname,a.nachname,a.firmenname FROM hp_adress_ziele m JOIN adressen a ON a.id=m.adresse_id WHERE m.verbindung_id=? AND m.hp_nummer IN (${numbers.map(()=>'?').join(',')}) ORDER BY m.hp_nummer`,[q.direkt_id,...numbers]);
  if(rows.length!==numbers.length||rows.some(r=>r.archiviert))fail('Nicht alle Adressen gehören zum aktiven Adressbestand dieser Quelle.');
  const emails=await tx.all(`SELECT adresse FROM adress_emails WHERE ist_email=1 AND adresse_id IN (${rows.map(()=>'?').join(',')})`,rows.map(r=>r.adresse_id));
  if(![...rows.map(r=>r.email),...emails.map(r=>r.adresse)].some(v=>String(v||'').trim().toLowerCase()===email))fail('Die E-Mail-Adresse ist bei keiner ausgewählten Adresse gespeichert.');
  const existing=await tx.all('SELECT k.id FROM kunden_konten k JOIN kunden_firmen_quellen f ON f.quelle_id=k.quelle_id WHERE f.firma_id=? AND k.email=?',[q.firma_id,email]);
  if(existing.length){
   if(existing.length!==1)fail('Diese E-Mail gehört bereits zu mehreren Kundenkonten. Bitte einzeln prüfen.');
   const s=await zugriff.pruefen(tx,existing[0].id,{owner});
   const actual=JSON.parse(s.konto.personen).map(p=>p.hp_id).sort((a,b)=>a-b);
   if(s.konto.quelle_id!==sourceId||JSON.stringify(actual)!==JSON.stringify(numbers))fail('Es gibt bereits einen Zugang mit anderen Adresszuordnungen. Keine automatische Zusammenführung.');
   return{id:s.konto.id,neu:false,...zugriff.oeffentlich(s),pruefwert:s.pruefwert};
  }
  const names=[...new Set(rows.map(r=>r.firmenname||[r.vorname,r.nachname].filter(Boolean).join(' ')).filter(Boolean))];
  const name=names.join(' / ').slice(0,500);if(!name)fail('Ein Name fehlt in der Adresse.');
  const personen=JSON.stringify(numbers.map(hp_id=>({id:'ca:'+hp_id,hp_id})));
  const id=(await tx.run("INSERT INTO kunden_konten(quelle_id,externe_id,name,email,status,hinweise,personen,fingerprint) VALUES(?,?,?,?,'vorbereitet','[]',?,?)",[sourceId,'ca:'+crypto.randomUUID(),name,email,personen,crypto.createHash('sha256').update(JSON.stringify([sourceId,numbers,email])).digest('hex')])).lastID;
  for(const r of rows)await tx.run('INSERT INTO kunden_konto_adressen(konto_id,adresse_id,hp_nummer) VALUES(?,?,?)',[id,r.adresse_id,r.hp_nummer]);
  const s=await zugriff.pruefen(tx,id,{owner}); // invalid roles roll the entire preparation back
  return{id,neu:true,...zugriff.oeffentlich(s),pruefwert:s.pruefwert};
 });
}
async function testkonto(db,owner,sourceId,name,email){
 if(typeof name!=='string'||!name.trim()||name.length>500||typeof email!=='string'||email.length>320||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Bitte Name und E-Mail des Testkunden eingeben.',400);
 name=name.trim();email=email.toLowerCase();
 return db.transaktion(async tx=>{
  const q=await firmen.quelle(tx,owner,sourceId);if(!q.direkt_id)fail('Die direkte Firmenquelle fehlt.');
  const existing=await tx.all('SELECT k.id,k.externe_id,k.name,k.quelle_id FROM kunden_konten k JOIN kunden_firmen_quellen f ON f.quelle_id=k.quelle_id WHERE f.firma_id=? AND k.email=?',[q.firma_id,email]);
  let id;
  if(existing.length){if(existing.length!==1||!existing[0].externe_id.startsWith('test:')||existing[0].quelle_id!==sourceId||existing[0].name!==name)fail('Diese E-Mail gehört bereits zu einem anderen Kundenkonto.');id=existing[0].id;}
  else id=(await tx.run("INSERT INTO kunden_konten(quelle_id,externe_id,name,email,status,hinweise,personen,fingerprint) VALUES(?,?,?,?,'vorbereitet',?,'[]',?)",[sourceId,'test:'+crypto.randomUUID(),name,email,JSON.stringify(['Testkonto ohne echte Objekt- oder Wohnungsfreigabe']),crypto.createHash('sha256').update(JSON.stringify([sourceId,name,email,'test'])).digest('hex')])).lastID;
  const s=await zugriff.pruefen(tx,id,{owner});return{id,...zugriff.oeffentlich(s),pruefwert:s.pruefwert};
 });
}
module.exports={anlegen,testkonto};
