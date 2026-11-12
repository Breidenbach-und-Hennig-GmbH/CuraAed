'use strict';
// Auftragsstatus und Ticketstatus werden innerhalb derselben Transaktion
// abgeglichen. Auch nicht für den Bearbeiter sichtbare Aufträge zählen mit.
async function abgleichen(tx,ticketId,benutzerId,grund){
 const ticket=await tx.get('SELECT id,status FROM tickets WHERE id=?',[ticketId]);if(!ticket)return null;
 const n=await tx.get("SELECT COUNT(*) AS gesamt,COALESCE(SUM(v.status<>'erledigt'),0) AS offen FROM ticket_handwerkerauftraege l JOIN fach_vorgaenge v ON v.id=l.vorgang_id WHERE l.ticket_id=?",[ticketId]);
 if(!n.gesamt)return null;
 const status=n.offen===0?'erledigt':'in_bearbeitung';if(ticket.status===status)return null;
 await tx.run("UPDATE tickets SET status=?,revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[status,ticketId]);
 await tx.run("INSERT INTO ticket_verlauf(ticket_id,benutzer_id,aktion,daten) VALUES(?,?,'status_automatisch',?)",[ticketId,benutzerId||null,JSON.stringify({vorher:ticket.status,nachher:status,grund,auftraege_gesamt:n.gesamt,offene_auftraege:n.offen})]);
 return{ticket_id:ticket.id,status};
}
async function nachAuftrag(tx,vorgangId,benutzerId){
 const rows=await tx.all('SELECT ticket_id FROM ticket_handwerkerauftraege WHERE vorgang_id=?',[vorgangId]);
 for(const r of rows)await abgleichen(tx,r.ticket_id,benutzerId,'Status eines Handwerkerauftrags geändert');
}
async function initialisieren(db){
 return db.transaktion(async tx=>{
  if(await tx.get('SELECT version FROM ticket_status_migrationen WHERE version=1'))return;
  const rows=await tx.all('SELECT DISTINCT ticket_id FROM ticket_handwerkerauftraege');
  for(const r of rows)await abgleichen(tx,r.ticket_id,null,'Bestehende Aufträge mit automatischer Statusregel abgeglichen');
  await tx.run('INSERT INTO ticket_status_migrationen(version) VALUES(1)');
 });
}
module.exports={abgleichen,nachAuftrag,initialisieren};
