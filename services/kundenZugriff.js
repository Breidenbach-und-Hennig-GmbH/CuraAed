'use strict';
const crypto=require('node:crypto');
const {ValidationError}=require('../lib/validation');
const fail=(m,s=409)=>{throw new ValidationError(m,s);};
async function pruefen(db,id,{owner=null,now=Date.now()}={}){
 const k=await db.get(`SELECT k.*,s.direkt_id,f.firma_id,b.name AS firma_name FROM kunden_konten k
 JOIN hp_dms_quellen s ON s.id=k.quelle_id JOIN kunden_firmen_quellen f ON f.quelle_id=k.quelle_id
 JOIN firmenbriefkoepfe b ON b.id=f.firma_id WHERE k.id=?`,[id]);
 if(!k)fail('Kundenkonto nicht gefunden.',404);
 if(owner!==null)await require('./kundenFirmen').quelle(db,owner,k.quelle_id);
 if(k.status!=='vorbereitet'||!k.direkt_id||!k.email||!k.name)fail('Diese Kundenzuordnung muss zuerst geprüft werden.');
 let personen;try{personen=JSON.parse(k.personen);}catch{fail('Die Personenbezüge sind ungültig.');}
 const numbers=personen.map(p=>p.hp_id);
 if(!numbers.length||numbers.length>200||numbers.some(n=>!Number.isSafeInteger(n)||n<1)||new Set(numbers).size!==numbers.length)fail('Die Personenbezüge sind nicht eindeutig.');
 const placeholders=numbers.map(()=>'?').join(',');
 const mappings=await db.all(`SELECT m.hp_nummer,m.adresse_id,a.archiviert FROM hp_adress_ziele m
 JOIN adressen a ON a.id=m.adresse_id WHERE m.verbindung_id=? AND m.hp_nummer IN (${placeholders}) ORDER BY m.hp_nummer`,[k.direkt_id,...numbers]);
 const stored=await db.all('SELECT hp_nummer,adresse_id FROM kunden_konto_adressen WHERE konto_id=? ORDER BY hp_nummer',[id]);
 if(mappings.length!==numbers.length||mappings.some(m=>m.archiviert)||JSON.stringify(mappings.map(({hp_nummer,adresse_id})=>({hp_nummer,adresse_id})))!==JSON.stringify(stored))fail('Die Adresszuordnung wurde geändert. Bitte den Kundenimport erneut prüfen.');
 const ids=[...new Set(mappings.map(m=>m.adresse_id))], day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date(now));
 const roles=await db.all(`SELECT r.id,r.adresse_id,r.rolle,r.gueltig_von,r.gueltig_bis,o.id AS objekt_id,h.hp_objnr AS objekt_nummer,o.bezeichnung AS objekt_name,
 e.id AS einheit_id,he.hp_whgnr AS einheit_nummer,e.bezeichnung AS einheit_name FROM rollen_zuordnungen r
 LEFT JOIN einheiten e ON e.id=r.einheit_id JOIN objekte o ON o.id=COALESCE(e.objekt_id,r.objekt_id)
 JOIN hp_objekt_zuordnung h ON h.objekt_id=o.id AND h.verbindung_id=?
 LEFT JOIN hp_einheit_zuordnung he ON he.einheit_id=e.id AND he.verbindung_id=h.verbindung_id AND he.objekt_id=o.id
 WHERE r.adresse_id IN (${ids.map(()=>'?').join(',')}) AND r.rolle IN ('eigentuemer','mieter')
 AND (r.gueltig_von IS NULL OR r.gueltig_von<=?) AND (r.gueltig_bis IS NULL OR r.gueltig_bis>=?)
 AND o.archiviert=0 AND (r.einheit_id IS NULL OR e.archiviert=0) AND h.verwaltungsstatus='aktiv'
 AND (r.einheit_id IS NULL OR he.einheit_id IS NOT NULL)
 AND (r.objekt_id IS NULL OR r.einheit_id IS NULL OR r.objekt_id=e.objekt_id)
 AND (r.rolle<>'mieter' OR r.einheit_id IS NOT NULL) ORDER BY r.id`,[k.direkt_id,...ids,day,day]);
 if(ids.some(id=>!roles.some(r=>r.adresse_id===id)))fail('Aktuelle Eigentümer-/Mieterfunktionen in einem aktiven Objekt dieses Firmenbestands sind nicht vollständig bestätigt.');
 const basis={konto:k.id,revision:k.revision,email:k.email,quelle:k.quelle_id,direkt:k.direkt_id,firma:k.firma_id,adressen:stored,
  rollen:roles.map(({id,adresse_id,rolle,gueltig_von,gueltig_bis,objekt_id,einheit_id})=>({id,adresse_id,rolle,gueltig_von,gueltig_bis,objekt_id,einheit_id}))};
 return {konto:k,rollen:roles,pruefwert:crypto.createHash('sha256').update(JSON.stringify(basis)).digest('hex')};
}
function oeffentlich(s){
 return {name:s.konto.name,email:s.konto.email,firma:{id:s.konto.firma_id,name:s.konto.firma_name},
 objekte:[...new Map(s.rollen.map(r=>[r.objekt_id,{nummer:r.objekt_nummer,bezeichnung:r.objekt_name}])).values()],
 wohnungen:s.rollen.filter(r=>r.einheit_id!==null).map(r=>({objekt_nummer:r.objekt_nummer,nummer:r.einheit_nummer,bezeichnung:r.einheit_name,rolle:r.rolle}))};
}
module.exports={pruefen,oeffentlich};
