'use strict';
const {ValidationError}=require('../lib/validation');
const STATUS=['offen','in_bearbeitung','wartet','erledigt'];
const PRIORITAET=['normal','hoch','dringend'];
const fail=(s,status=400)=>{throw new ValidationError(s,status);};
const nummer=id=>'TK-'+String(id).padStart(6,'0');
const sicht=(u,alias='t')=>u.rolle==='admin'?{sql:'1=1',args:[]}:{sql:`(${alias}.erstellt_von=? OR ${alias}.zustaendig_id=?)`,args:[u.id,u.id]};
async function log(tx,id,user,aktion,daten){await tx.run('INSERT INTO ticket_verlauf(ticket_id,benutzer_id,aktion,daten) VALUES(?,?,?,?)',[id,user,aktion,JSON.stringify(daten)]);}
async function syncTelefon(tx,k,user,vorher=null){
 const old=await tx.get('SELECT * FROM tickets WHERE kontakt_id=?',[k.id]);
 if(!k.objekt_id){if(old)fail('Zu diesem Anruf besteht bereits ein Ticket. Bitte das Objekt beibehalten oder ein anderes Objekt auswählen.');return null;}
 const sb=k.rueckruf_sb_id||k.erfasst_von||user;
 if(!await tx.get("SELECT id FROM benutzer WHERE id=? AND aktiv=1 AND rolle IN ('admin','mitarbeiter')",[sb]))fail('Bitte für das Ticket einen aktiven Mitarbeiter als Sachbearbeiter auswählen.');
 const quelle={objekt_id:k.objekt_id,einheit_id:k.einheit_id,adresse_id:k.adresse_id,zustaendig_id:sb};
 let id=old?.id;
 if(!old){
  const titel=(k.betreff==='Telefoneingang'?'Telefoneingang: '+(k.anrufer_name||'Anfrage zum Objekt'):k.betreff).slice(0,200);
  const result=await tx.run("INSERT INTO tickets(kontakt_id,objekt_id,einheit_id,adresse_id,erstellt_von,zustaendig_id,titel,beschreibung,status,prioritaet,faellig_am) VALUES(?,?,?,?,?,?,?,?,'offen','normal',?)",[k.id,k.objekt_id,k.einheit_id,k.adresse_id,k.erfasst_von||user,sb,titel,k.notiz||'',k.zeitpunkt.slice(0,10)]);
  id=result.lastID;await log(tx,id,user,'aus_telefoneingang_angelegt',{...quelle,titel,beschreibung:k.notiz||'',kontakt_id:k.id});
 }else if(Object.entries(quelle).some(([key,value])=>old[key]!==value)){
  await tx.run("UPDATE tickets SET objekt_id=?,einheit_id=?,adresse_id=?,zustaendig_id=?,revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[k.objekt_id,k.einheit_id,k.adresse_id,sb,id]);
  await log(tx,id,user,'telefonzuordnung_geaendert',{vorher:Object.fromEntries(Object.keys(quelle).map(key=>[key,old[key]])),nachher:quelle});
 }
 if(old&&vorher&&['notiz','anrufer_name','rueckruf_tel','zeitpunkt','team','erledigt'].some(key=>vorher[key]!==k[key])){await tx.run("UPDATE tickets SET revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[id]);await log(tx,id,user,'telefoneingang_geaendert',{vorher:{bemerkung:vorher.notiz,anrufer:vorher.anrufer_name,rueckruf:vorher.erledigt},nachher:{bemerkung:k.notiz,anrufer:k.anrufer_name,rueckruf:k.erledigt}});}
 return{id,nummer:nummer(id)};
}
const from=" FROM tickets t JOIN objekte o ON o.id=t.objekt_id LEFT JOIN einheiten e ON e.id=t.einheit_id LEFT JOIN adressen a ON a.id=t.adresse_id LEFT JOIN benutzer b ON b.id=t.zustaendig_id LEFT JOIN kontakte k ON k.id=t.kontakt_id";
const columns="t.*,o.nummer AS objekt_nummer,o.bezeichnung AS objekt_name,e.nummer AS einheit_nummer,e.bezeichnung AS einheit_name,COALESCE(NULLIF(a.firmenname,''),TRIM(COALESCE(a.vorname,'')||' '||COALESCE(a.nachname,''))) AS adresse_name,b.name AS zustaendig_name,b.kuerzel AS zustaendig_kuerzel,k.anrufer_name,k.rueckruf_tel,k.notiz AS telefon_bemerkung,k.zeitpunkt AS telefon_zeitpunkt,k.erledigt AS rueckruf_erledigt";
async function liste(db,user,q={}){
 const scope=sicht(user),args=[...scope.args];let where=scope.sql;
 const page=q.seite===undefined?1:Number(q.seite);if(!Number.isSafeInteger(page)||page<1||page>1000000)fail('Ungültige Seite.');
 if(q.status==='aktiv')where+=" AND t.status<>'erledigt'";else if(q.status){if(!STATUS.includes(q.status))fail('Ungültiger Ticketstatus.');where+=' AND t.status=?';args.push(q.status);}
 if(q.suche){if(typeof q.suche!=='string'||q.suche.length>200)fail('Ungültige Suche.');where+=" AND (t.titel LIKE ? OR t.beschreibung LIKE ? OR o.nummer LIKE ? OR o.bezeichnung LIKE ? OR ('TK-'||printf('%06d',t.id)) LIKE ?)";args.push(...Array(5).fill('%'+q.suche+'%'));}
 if(q.objekt){const id=Number(q.objekt);if(!Number.isSafeInteger(id)||id<1)fail('Ungültiges Objekt.');where+=' AND t.objekt_id=?';args.push(id);}
 const gesamt=(await db.get('SELECT COUNT(*) AS n'+from+' WHERE '+where,args)).n;
 const rows=await db.all('SELECT '+columns+from+' WHERE '+where+" ORDER BY t.status='erledigt',t.faellig_am IS NULL,t.faellig_am,t.id LIMIT 50 OFFSET ?",[...args,(page-1)*50]);
 return{gesamt,seite:page,weitere:page*50<gesamt,eintraege:rows.map(r=>({...r,nummer:nummer(r.id)}))};
}
async function detail(db,user,id){const scope=sicht(user);const r=await db.get('SELECT '+columns+from+' WHERE t.id=? AND '+scope.sql,[id,...scope.args]);if(!r)fail('Ticket nicht gefunden.',404);r.nummer=nummer(r.id);r.verlauf=await db.all('SELECT v.*,b.name AS benutzer_name FROM ticket_verlauf v LEFT JOIN benutzer b ON b.id=v.benutzer_id WHERE v.ticket_id=? ORDER BY v.id DESC',[r.id]);return r;}
function werte(b){
 const d={};for(const [key,max] of [['titel',200],['beschreibung',10000]]){if(typeof b[key]!=='string'||b[key].length>max)fail('Ungültige Ticketangabe: '+key);d[key]=b[key].trim();}if(!d.titel)fail('Bitte einen Titel eingeben.');
 if(!STATUS.includes(b.status)||!PRIORITAET.includes(b.prioritaet))fail('Bitte Status und Priorität prüfen.');d.status=b.status;d.prioritaet=b.prioritaet;
 d.faellig_am=b.faellig_am||null;if(d.faellig_am!==null&&(typeof d.faellig_am!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.faellig_am)||!Number.isFinite(Date.parse(d.faellig_am))||new Date(d.faellig_am+'T12:00:00Z').toISOString().slice(0,10)!==d.faellig_am))fail('Ungültige Frist.');
 d.zustaendig_id=Number(b.zustaendig_id);if(!Number.isSafeInteger(d.zustaendig_id)||d.zustaendig_id<1)fail('Bitte einen Sachbearbeiter auswählen.');if(!Number.isSafeInteger(b.revision))fail('Bitte das Ticket neu laden.',409);return d;
}
async function speichern(db,user,id,b){const d=werte(b);return db.transaktion(async tx=>{const old=await detail(tx,user,id);if(old.revision!==b.revision)fail('Das Ticket wurde inzwischen geändert. Bitte neu laden.',409);if(!await tx.get("SELECT id FROM benutzer WHERE id=? AND aktiv=1 AND rolle IN ('admin','mitarbeiter')",[d.zustaendig_id]))fail('Sachbearbeiter nicht verfügbar.');
 await tx.run("UPDATE tickets SET titel=?,beschreibung=?,status=?,prioritaet=?,faellig_am=?,zustaendig_id=?,revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[d.titel,d.beschreibung,d.status,d.prioritaet,d.faellig_am,d.zustaendig_id,id]);
 // Die Zuständigkeit am Anruf bleibt mit dem Ticket konsistent. Ein erledigter
 // Rückruf schließt das fachliche Ticket hingegen nicht automatisch ab.
 if(old.kontakt_id&&old.zustaendig_id!==d.zustaendig_id)await tx.run('UPDATE kontakte SET rueckruf_sb_id=? WHERE id=?',[d.zustaendig_id,old.kontakt_id]);
 await log(tx,id,user.id,'bearbeitet',{vorher:Object.fromEntries(Object.keys(d).map(k=>[k,old[k]])),nachher:d});return{id:Number(id)};});}
async function vermerk(db,user,id,b){if(typeof b.text!=='string'||!b.text.trim()||b.text.length>10000)fail('Bitte einen Vermerk bis 10.000 Zeichen eingeben.');return db.transaktion(async tx=>{const old=await detail(tx,user,id);if(old.revision!==b.revision)fail('Das Ticket wurde inzwischen geändert. Bitte neu laden.',409);await log(tx,id,user.id,'vermerk',{text:b.text.trim()});await tx.run("UPDATE tickets SET revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[id]);return{id:Number(id)};});}
async function zaehler(db,user,heute){const scope=sicht(user);const r=await db.get("SELECT COALESCE(SUM(faellig_am>? OR faellig_am IS NULL),0) AS zeitplan,COALESCE(SUM(faellig_am=?),0) AS faellig,COALESCE(SUM(faellig_am<?),0) AS ueberfaellig FROM tickets t WHERE "+scope.sql+" AND status<>'erledigt'",[heute,heute,heute,...scope.args]);return r;}
module.exports={syncTelefon,liste,detail,speichern,vermerk,zaehler,nummer};
