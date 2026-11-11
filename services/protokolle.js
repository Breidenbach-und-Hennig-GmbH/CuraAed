'use strict';
const crypto=require('node:crypto'),A=require('./abstimmungen'),T=require('./teilnehmer'),{ValidationError}=require('../lib/validation');
const fail=(s,status=400)=>{throw new ValidationError(s,status);};
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const text=(v,max)=>{if(typeof v!=='string'||v.length>max)fail('Ungültige Protokollangabe.');return v.trim();};
async function stand(db,id){
 const {versammlung:v,tops}=await require('./tagesordnung').liste(db,id),register=await A.register(db,v),config=await A.config(db,v.objekt_id),teilnahme=await T.lesen(db,id);
 const counts=await db.all('SELECT a.*,b.name AS benutzer FROM etv_abstimmungen a JOIN versammlung_tops t ON t.id=a.top_id LEFT JOIN benutzer b ON b.id=a.benutzer_id WHERE t.versammlung_id=? ORDER BY a.top_id',[id]);
 const rules=await db.all('SELECT r.* FROM top_stimmregeln r JOIN versammlung_tops t ON t.id=r.top_id WHERE t.versammlung_id=? ORDER BY r.top_id',[id]);
 const enriched=tops.map(t=>{const row=counts.find(c=>c.top_id===t.id);if(!row)return{...t,auszaehlung:null,historisch:false};const snapshot=JSON.parse(row.snapshot),ergebnis=JSON.parse(row.ergebnis),r=rules.find(r=>r.top_id===t.id);
 const historisch=snapshot.basis_hash!==register.basis_hash||snapshot.top_hash!==A.topHash({...t,objekt_id:v.objekt_id,datum:v.datum})||snapshot.config_revision!==config.revision||snapshot.regel_revision!==(r?.revision||0);
 ergebnis.details=ergebnis.details.filter(d=>d.ausgeschlossen).map(d=>({name:d.name,ausschlussgrund:d.ausschlussgrund,ausgeschlossen:true}));
 return{...t,historisch,auszaehlung:{revision:row.revision,erstellt_am:row.erstellt_am,benutzer:row.benutzer,ergebnis}};});
 const basis_hash=hash({v,tops,register:register.basis_hash,config,counts,rules,teilnahme}),saved=await db.get('SELECT * FROM etv_protokolle WHERE versammlung_id=?',[id]),old=saved?JSON.parse(saved.daten):{};
 const daten={beginn:old.beginn??v.uhrzeit??'',ende:old.ende||'',protokollfuehrung:old.protokollfuehrung??v.protokollfuehrer_name??'',einleitung:old.einleitung||'',schluss:old.schluss||'',modus:old.modus||'entwurf',teilnehmer_anlage:old.teilnehmer_anlage??true,geprueft:false,verwaltung_anwesend:old.verwaltung_anwesend||'',wohnungseigentuemer:old.wohnungseigentuemer??'',teileigentuemer:old.teileigentuemer??'',einladung_festgestellt:old.einladung_festgestellt===true,beschlussfaehigkeit_festgestellt:old.beschlussfaehigkeit_festgestellt===true,beschluesse_verlesen:old.beschluesse_verlesen===true,tops:enriched.map(t=>{const d=old.tops?.find(x=>x.id===t.id);return{id:t.id,verlauf:d?.verlauf||'',beschlusswortlaut:d?.beschlusswortlaut??t.beschlussvorschlag??'',wortlaut_geprueft:!!d?.wortlaut_geprueft,beschlussstatus:t.art==='beschluss'?(d?.beschlussstatus==='besprechung'?'offen':d?.beschlussstatus||'offen'):'besprechung',abweichung:d?.abweichung||''};})};
 return{versammlung:v,tops:enriched,register,teilnahme,teilnahme_historisch:!!teilnahme.basis_hash&&teilnahme.basis_hash!==register.basis_hash,revision:saved?.revision||0,quellen_geaendert:!!saved&&saved.quellen_hash!==basis_hash,basis_hash,daten};
}
function daten(b,s){
 if(!b||!['entwurf','protokoll'].includes(b.modus)||typeof b.teilnehmer_anlage!=='boolean'||typeof b.geprueft!=='boolean')fail('Ungültige Protokollausgabe.');
 const d={modus:b.modus,teilnehmer_anlage:b.teilnehmer_anlage,geprueft:b.geprueft};for(const [k,max] of [['beginn',5],['ende',5],['protokollfuehrung',200],['einleitung',10000],['schluss',10000]])d[k]=text(b[k],max);
 d.verwaltung_anwesend=text(b.verwaltung_anwesend??'',500);
 for(const k of ['wohnungseigentuemer','teileigentuemer']){const value=b[k]??'';if(typeof value!=='string'||(value!==''&&!/^(0|[1-9]\d{0,5})$/.test(value)))fail('Eigentümeranzahl bitte als ganze Zahl angeben.');d[k]=value;}
 for(const k of ['einladung_festgestellt','beschlussfaehigkeit_festgestellt','beschluesse_verlesen']){if(b[k]!==undefined&&typeof b[k]!=='boolean')fail('Ungültige Feststellung auf dem Deckblatt.');d[k]=b[k]===true;}
 for(const k of ['beginn','ende'])if(d[k]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(d[k]))fail('Beginn und Ende bitte als HH:MM angeben.');
 if(!Array.isArray(b.tops)||b.tops.length!==s.tops.length)fail('Bitte jeden TOP genau einmal erfassen.');const ids=new Set();d.tops=b.tops.map(x=>{if(!x||!Number.isSafeInteger(x.id)||ids.has(x.id))fail('Doppelte oder ungültige TOP-Angabe.');ids.add(x.id);const t=s.tops.find(t=>t.id===x.id);if(!t)fail('Fremder TOP im Protokoll.');
 if(typeof x.wortlaut_geprueft!=='boolean'||!['offen','angenommen','abgelehnt','nicht_abgestimmt','vertagt','besprechung'].includes(x.beschlussstatus))fail('Ungültiges Beschlussergebnis.');if((t.art==='beschluss'&&x.beschlussstatus==='besprechung')||(t.art!=='beschluss'&&x.beschlussstatus!=='besprechung'))fail('Beschlussstatus passt nicht zur TOP-Art.');
 return{id:x.id,verlauf:text(x.verlauf,10000),beschlusswortlaut:text(x.beschlusswortlaut,10000),wortlaut_geprueft:x.wortlaut_geprueft,beschlussstatus:x.beschlussstatus,abweichung:text(x.abweichung,2000)};});
 if(JSON.stringify(d).length>500000)fail('Das Protokoll ist für eine einzelne PDF zu umfangreich.');return d;
}
function offen(s,d){const list=[];if(!s.tops.length)list.push('Es sind noch keine Tagesordnungspunkte vorhanden.');if(!s.versammlung.ort)list.push('Der Versammlungsort fehlt.');if(!s.versammlung.leitung_name)list.push('Die Versammlungsleitung fehlt.');if(!d.beginn||!d.ende)list.push('Beginn und Ende der Versammlung ergänzen.');if(!s.teilnahme.revision||s.teilnahme_historisch)list.push('Die Teilnehmerliste ist noch nicht gespeichert oder seitdem hat sich der Eigentümerstand geändert.');list.push(...s.register.hinweise);
 for(const t of s.tops){if(t.art!=='beschluss')continue;const x=d.tops.find(x=>x.id===t.id);if(['nicht_abgestimmt','vertagt'].includes(x.beschlussstatus)&&t.auszaehlung&&!x.abweichung)list.push('TOP '+t.position+': vorhandene Auszählung trotz Vertagung / Nichtabstimmung erläutern.');if(x.beschlussstatus==='offen')list.push('TOP '+t.position+': verkündetes Ergebnis fehlt.');if(['angenommen','abgelehnt'].includes(x.beschlussstatus)){
 if(!x.wortlaut_geprueft||!x.beschlusswortlaut)list.push('TOP '+t.position+': Beschlusswortlaut prüfen und bestätigen.');if(!t.auszaehlung)list.push('TOP '+t.position+': gespeicherte Auszählung fehlt.');else{if(t.historisch)list.push('TOP '+t.position+': Auszählung ist historisch; TOP, Eigentümerstand oder Regel haben sich geändert.');if(t.auszaehlung.ergebnis.status!==x.beschlussstatus&&!x.abweichung)list.push('TOP '+t.position+': Abweichung zwischen Auszählung und verkündetem Ergebnis erläutern.');}
 }}return list;
}
async function speichern(db,id,b,pdf=false){
 const snapshot=await db.transaktion(async tx=>{const s=await stand(tx,id);if(b.revision!==s.revision||b.basis_hash!==s.basis_hash)fail('Protokoll, TOPs, Teilnehmer oder Abstimmungen inzwischen geändert. Bitte das Protokoll neu öffnen.',409);const d=daten(b.daten,s),hinweise=offen(s,d);
 if(pdf&&JSON.stringify({tops:s.tops,daten:d}).length>700000)fail('Das Protokoll ist für eine einzelne PDF zu umfangreich.');
 if(pdf&&d.modus==='protokoll'&&(hinweise.length||!d.geprueft))fail(hinweise.length?hinweise.join(' '):'Bitte Inhalt und verkündete Beschlüsse prüfen und bestätigen.');
 const stored=JSON.stringify({...d,geprueft:false});const current=await tx.get('SELECT daten,quellen_hash FROM etv_protokolle WHERE versammlung_id=?',[id]);let revision=s.revision;
 if(!current||current.daten!==stored||current.quellen_hash!==s.basis_hash){await tx.run('INSERT INTO etv_protokolle(versammlung_id,daten,quellen_hash,revision) VALUES(?,?,?,1) ON CONFLICT(versammlung_id) DO UPDATE SET daten=excluded.daten,quellen_hash=excluded.quellen_hash,revision=revision+1',[id,stored,s.basis_hash]);revision++;}
 return{...s,daten:d,hinweise,revision};});
 if(pdf)return require('../lib/protokoll-pdf').erstellen(snapshot);return{revision:snapshot.revision};
}
module.exports={stand,daten,offen,speichern};
