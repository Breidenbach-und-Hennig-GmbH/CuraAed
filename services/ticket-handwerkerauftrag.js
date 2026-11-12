'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation'),T=require('./tickets');
const fail=(s,status=400)=>{throw new ValidationError(s,status);};
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function quelle(tx,user,id){
 const t=await T.detail(tx,user,id),objekt=await tx.get('SELECT id,nummer,bezeichnung,strasse,plz,ort FROM objekte WHERE id=? AND archiviert=0',[t.objekt_id]);if(!objekt)fail('Das Objekt ist nicht mehr verfügbar. Bitte das Ticket prüfen.');
 const einheit=t.einheit_id?await tx.get('SELECT id,nummer,bezeichnung,objekt_id FROM einheiten WHERE id=? AND archiviert=0',[t.einheit_id]):null;if(t.einheit_id&&(!einheit||einheit.objekt_id!==objekt.id))fail('Die Wohnung ist nicht mehr für dieses Objekt verfügbar.');
 const call=t.kontakt_id?await tx.get('SELECT anrufer_adresse_id,anrufer_name,rueckruf_tel FROM kontakte WHERE id=?',[t.kontakt_id]):null;
 const personId=call?.anrufer_adresse_id||t.adresse_id;
 const person=personId?await tx.get('SELECT id,nummer,firmenname,vorname,nachname,telefon,mobil,email FROM adressen WHERE id=? AND archiviert=0',[personId]):null;if(personId&&!person)fail('Der Ansprechpartner ist nicht mehr verfügbar. Bitte die Adresse prüfen.');
 const name=person?.firmenname||[person?.vorname,person?.nachname].filter(Boolean).join(' '),ansprechpartner=person?{...person,anzeigename:call?.anrufer_name||name,bezeichnung:'Ansprechpartner vor Ort',kontakt_name:call?.anrufer_name||name,kontakt_telefon:call?.rueckruf_tel||''}:null;
 return{ticket:t,objekt,einheit,ansprechpartner,basis_hash:hash({revision:t.revision,titel:t.titel,beschreibung:t.beschreibung,prioritaet:t.prioritaet,faellig_am:t.faellig_am,zustaendig_id:t.zustaendig_id,objekt,einheit,ansprechpartner})};
}
async function vorlage(db,user,id){return db.transaktion(async tx=>{const s=await quelle(tx,user,id);return{ticket:{id:s.ticket.id,nummer:s.ticket.nummer,revision:s.ticket.revision,basis_hash:s.basis_hash,entwurf_id:crypto.randomUUID()},auftrag:{id:null,art:'handwerker',titel:s.ticket.titel,text:s.ticket.beschreibung,status:'beauftragt',prioritaet:s.ticket.prioritaet,faellig_am:s.ticket.faellig_am,uhrzeit:null,zustaendig_id:s.ticket.zustaendig_id,bezuege:[],verlauf:[],rechnungen:[],auftrag:{status_code:'004',handwerker_id:null,objekt_id:s.objekt.id,einheit_id:s.einheit?.id||null,akte_id:null,firma:'',auftragsart:'normal',betrag:'',vorgang:s.ticket.nummer,objekt:s.objekt,einheit:s.einheit,adressaten_details:s.ansprechpartner?[s.ansprechpartner]:[],kommunikation:{telefone:[],emails:[],ansprechpartner:[]},dokumente:[]}}};});}
async function erstellen(db,user,id,b){
 if(!b||b.art!=='handwerker'||!b.auftrag||typeof b.auftrag!=='object'||Array.isArray(b.auftrag)||typeof b.entwurf_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.entwurf_id)||!Number.isSafeInteger(b.ticket_revision)||typeof b.basis_hash!=='string'||b.basis_hash.length!==64)fail('Die Ticketvorlage fehlt. Bitte die Neuanlage erneut aus dem Ticket öffnen.');
 const payload_hash=hash(b);
 return db.transaktion(async tx=>{
  const t=await T.detail(tx,user,id),old=await tx.get('SELECT vorgang_id,payload_hash FROM ticket_handwerkerauftraege WHERE ticket_id=? AND entwurf_id=?',[id,b.entwurf_id]);
  if(old){if(old.payload_hash!==payload_hash)fail('Dieser Entwurf wurde bereits mit anderen Angaben gespeichert.',409);if(!await tx.get('SELECT id FROM fach_vorgaenge WHERE id=? AND (benutzer_id=? OR zustaendig_id=?)',[old.vorgang_id,user.id,user.id]))fail('Auftrag nicht verfügbar.',404);return{id:old.vorgang_id};}
  const s=await quelle(tx,user,id);if(t.revision!==b.ticket_revision||s.basis_hash!==b.basis_hash)fail('Ticket oder Zuordnung inzwischen geändert. Bitte die HWA-Neuanlage erneut aus dem Ticket öffnen.',409);
  const result=await require('./vorgaenge').baueVorgaenge(tx).createInTransaction(tx,user.id,b);
  await tx.run('INSERT INTO ticket_handwerkerauftraege(ticket_id,vorgang_id,entwurf_id,payload_hash) VALUES(?,?,?,?)',[id,result.id,b.entwurf_id,payload_hash]);
  await tx.run("UPDATE tickets SET revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[id]);
  await tx.run("INSERT INTO ticket_verlauf(ticket_id,benutzer_id,aktion,daten) VALUES(?,?,'handwerkerauftrag_erstellt',?)",[id,user.id,JSON.stringify({vorgang_id:result.id,nummer:'CA-'+result.id})]);
  await tx.run("INSERT INTO fach_verlauf(vorgang_id,benutzer_id,aktion,nachher) VALUES(?,?,'aus_ticket_erstellt',?)",[result.id,user.id,JSON.stringify({ticket_id:t.id,ticket_nummer:t.nummer})]);return result;
 });
}
module.exports={vorlage,erstellen};
