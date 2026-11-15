'use strict';
const {ValidationError}=require('../lib/validation');
const ONLINE_MS=120000,STARFACE_MS=90000;
function auswerten(curaOnline,login,snapshot,now=Date.now()){
 if(!curaOnline)return{farbe:'rot',text:'In CuraAed abgemeldet oder nicht erreichbar'};
 if(!login)return{farbe:'grau',text:'STARFACE-Login-ID fehlt'};
 if(!snapshot||typeof snapshot.angemeldet!=='boolean'||typeof snapshot.telefoniert!=='boolean'||!Number.isSafeInteger(snapshot.empfangen_am)||snapshot.empfangen_am>now+5000||now-snapshot.empfangen_am>STARFACE_MS||!snapshot.angemeldet&&snapshot.telefoniert)return{farbe:'grau',text:'STARFACE-Status nicht verfügbar'};
 if(!snapshot.angemeldet)return{farbe:'rot',text:'In STARFACE abgemeldet'};
 return snapshot.telefoniert?{farbe:'gelb',text:'Telefoniert'}:{farbe:'gruen',text:'In CuraAed und STARFACE angemeldet'};
}
async function melden(db,token,b,now=Date.now()){
 if(!token)throw new ValidationError('Nicht angemeldet.',401);
 if(typeof b.fenster_id!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(b.fenster_id)||!['offen','geschlossen'].includes(b.zustand))throw new ValidationError('Ungültige Anwesenheitsmeldung.');
 // Geschlossene Fenster werden durch verspätete Anfragen nicht wieder online.
 const result=await db.run("INSERT INTO mitarbeiter_anwesenheit(sitzung_token,fenster_id,gesehen_am,geschlossen) SELECT ?,?,?,? FROM sitzungen WHERE token=? AND julianday(ablauf_am)>julianday('now') ON CONFLICT(sitzung_token,fenster_id) DO UPDATE SET gesehen_am=excluded.gesehen_am,geschlossen=MAX(mitarbeiter_anwesenheit.geschlossen,excluded.geschlossen)",[token,b.fenster_id,now,b.zustand==='geschlossen'?1:0,token]);
 if(!result.changes)throw new ValidationError('Nicht angemeldet.',401);
 await db.run('DELETE FROM mitarbeiter_anwesenheit WHERE geschlossen=0 AND gesehen_am<?',[now-86400000]);
 return{ok:true};
}
async function onlineIds(db,now=Date.now()){
 const rows=await db.all("SELECT DISTINCT s.benutzer_id FROM sitzungen s JOIN mitarbeiter_anwesenheit a ON a.sitzung_token=s.token JOIN benutzer b ON b.id=s.benutzer_id WHERE b.aktiv=1 AND a.geschlossen=0 AND a.gesehen_am>=? AND a.gesehen_am<=? AND julianday(s.ablauf_am)>julianday('now')",[now-ONLINE_MS,now+5000]);
 return new Set(rows.map(r=>r.benutzer_id));
}
// Der spätere STARFACE-Adapter liefert frische, serverseitig empfangene Meldungen.
// Ohne freigegebene Anbindung werden keine Telefondaten erfunden.
async function liste(db,provider,now=Date.now()){
 const [online,profiles]=await Promise.all([onlineIds(db,now),db.all('SELECT benutzer_id,starface_login_id FROM mitarbeiterprofile')]);
 const ids=[...new Set(profiles.map(r=>r.starface_login_id).filter(Boolean))];
 let snapshots=new Map();
 if(provider?.statusFuerLogins){try{const data=await provider.statusFuerLogins(ids);if(data instanceof Map)snapshots=data;}catch{/* Störung ist unbekannt, kein Logout. */}}
 return new Map((await db.all("SELECT id FROM benutzer WHERE aktiv=1 AND rolle IN ('admin','mitarbeiter')")).map(r=>{
  const login=profiles.find(p=>p.benutzer_id===r.id)?.starface_login_id;
  return[r.id,auswerten(online.has(r.id),login,snapshots.get(login),now)];
 }));
}
module.exports={auswerten,melden,onlineIds,liste,ONLINE_MS,STARFACE_MS};
