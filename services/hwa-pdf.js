'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation'),STATI=require('../public/js/hwa-status');
const fail=(m,s=400)=>{throw new ValidationError(m,s);};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const name=a=>a?.firmenname||[a?.vorname,a?.nachname].filter(Boolean).join(' '),address=a=>a?[a.anrede,name(a),a.zusatz,a.strasse,[a.plz,a.ort].filter(Boolean).join(' ')].filter(Boolean).join('\n'):'';
const HINWEISE=STATI['004'].hinweise;
async function source(tx,owner,id){
 const r=await require('./vorgaenge').baueVorgaenge(tx).detail(owner,id);if(r.art!=='handwerker')fail('Kein Handwerkerauftrag.',404);
 const a=r.auftrag,firmen=await require('./firmenbriefkoepfe').liste(tx),saved=await tx.get('SELECT * FROM handwerker_pdf WHERE vorgang_id=?',[id]);
 const sb=r.zustaendig_id?await tx.get('SELECT b.name,b.email,a.telefon FROM benutzer b LEFT JOIN adressen a ON a.id=b.adresse_id WHERE b.id=?',[r.zustaendig_id]):null;
 let rechnungsempfaenger='';
 if(a.objekt?.objekttyp==='WEG')rechnungsempfaenger='WEG '+[a.objekt.strasse||a.objekt.bezeichnung,[a.objekt.plz,a.objekt.ort].filter(Boolean).join(' ')].filter(Boolean).join('\n');
 else if(a.objekt?.id){const owners=await tx.all("SELECT DISTINCT a.* FROM rollen_zuordnungen z JOIN adressen a ON a.id=z.adresse_id WHERE z.rolle='eigentuemer' AND COALESCE(z.inaktiv,0)=0 AND (z.gueltig_von IS NULL OR z.gueltig_von<=?) AND (z.gueltig_bis IS NULL OR z.gueltig_bis>=?) AND "+(a.einheit?.id?'z.einheit_id=?':'z.objekt_id=? AND z.einheit_id IS NULL'),[today(),today(),a.einheit?.id||a.objekt.id]);rechnungsempfaenger=owners.map(address).join('\n\n');}
 const kontakte=[];for(const p of a.adressaten_details){const full=await tx.get('SELECT * FROM adressen WHERE id=?',[p.id]);const telefone=await tx.all('SELECT art,nummer,bemerkung FROM adress_telefone WHERE adresse_id=? ORDER BY id',[p.id]),emails=await tx.all('SELECT adresse FROM adress_emails WHERE adresse_id=? AND ist_email=1 ORDER BY standard DESC,id',[p.id]);if(!telefone.length){if(p.telefon)telefone.push({art:'Telefon',nummer:p.telefon});if(p.mobil)telefone.push({art:'Mobil',nummer:p.mobil});}if(!emails.length&&p.email)emails.push({adresse:p.email});kontakte.push({name:p.anzeigename,bezeichnung:p.bezeichnung,anschrift:address(full),telefone,emails});}
 const code=a.status_code||'004',defaults={firma_id:firmen.length===1?firmen[0].id:null,datum:today(),ansprechpartner:sb?.name||a.source_sb||'',durchwahl:sb?.telefon||'',email:sb?.email||'',handwerker_anschrift:address(a.handwerker),rechnungsempfaenger,leistungsempfaenger:'',auftragstext:r.text||a.originaltext||'',einleitung:STATI[code].einleitung,hinweise:['003','004','011'].includes(code)?HINWEISE:''};
 const daten={...defaults,...(saved?JSON.parse(saved.daten):{})};
 const firma=firmen.find(f=>f.id===Number(daten.firma_id));
 const vorlage=firma?.hwa_texte?.[code];
 defaults.einleitung=vorlage?.einleitung??STATI[code].einleitung;defaults.hinweise=vorlage?.hinweise??STATI[code].hinweise??'';
 const vorlage_hash=crypto.createHash('sha256').update(JSON.stringify([daten.firma_id,code,defaults.einleitung,defaults.hinweise])).digest('hex');
 if(daten.vorlage_hash!==vorlage_hash){daten.einleitung=defaults.einleitung;daten.hinweise=defaults.hinweise;}daten.vorlage_hash=vorlage_hash;
 // A status change must never silently reuse an old offer/order/reminder introduction.
 if(daten.status_code!==code){daten.einleitung=defaults.einleitung;daten.hinweise=defaults.hinweise;}daten.status_code=code;
 const basis_hash=crypto.createHash('sha256').update(JSON.stringify({revision:r.revision,auftrag:a,titel:r.titel,text:r.text,kontakte,sb,firmen,defaults})).digest('hex');
 return{auftrag:r,firmen,kontakte,daten,basis_hash,revision:r.revision,druck_revision:saved?.revision||0};
}
function validate(b,source){
 if(!source.auftrag.auftrag.objekt?.nummer)fail('Bitte zuerst die Objektzuordnung im Handwerkerauftrag ergänzen.');
 const d={};for(const [k,max] of Object.entries({datum:10,ansprechpartner:200,durchwahl:100,email:254,handwerker_anschrift:1500,rechnungsempfaenger:2000,leistungsempfaenger:2000,auftragstext:65535,einleitung:4000,hinweise:6000})){if(typeof b?.[k]!=='string'||b[k].length>max)fail('Ungültige Druckangabe: '+k);d[k]=b[k].trim();}
 d.firma_id=Number(b.firma_id);if(!Number.isSafeInteger(d.firma_id)||!source.firmen.some(f=>f.id===d.firma_id))fail('Bitte eine Verwaltung aus den Stammdaten auswählen.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.datum)||!Number.isFinite(Date.parse(d.datum+'T12:00:00Z'))||new Date(d.datum+'T12:00:00Z').toISOString().slice(0,10)!==d.datum)fail('Ungültiges Briefdatum.');
 if(!d.handwerker_anschrift||!d.auftragstext||!d.ansprechpartner||!d.einleitung)fail('Bitte Handwerkeranschrift, Ansprechpartner, Einleitung und Auftragstext ergänzen.');
 if(source.auftrag.auftrag.rechnungsempfaenger_drucken!==false&&!d.rechnungsempfaenger)fail('Bitte die Angebots-/Rechnungsanschrift prüfen und ergänzen.');
 d.status_code=source.auftrag.auftrag.status_code;const firma=source.firmen.find(f=>f.id===d.firma_id),v=firma.hwa_texte?.[d.status_code]||STATI[d.status_code];d.vorlage_hash=crypto.createHash('sha256').update(JSON.stringify([d.firma_id,d.status_code,v.einleitung,v.hinweise||''])).digest('hex');return d;
}
async function stand(db,owner,id){return db.transaktion(tx=>source(tx,owner,id));}
async function erstellen(db,owner,id,b){
 const snapshot=await db.transaktion(async tx=>{const s=await source(tx,owner,id);if(s.revision!==b.revision||s.druck_revision!==b.druck_revision||s.basis_hash!==b.basis_hash)fail('Auftrag, Kontakte oder Briefkopf inzwischen geändert. Bitte Druckansicht neu öffnen.',409);
  const d=validate(b.daten,s),firma=await require('./firmenbriefkoepfe').holen(tx,d.firma_id,true);if(!firma.logo)fail('Im ausgewählten Firmenbriefkopf fehlt das Firmenlogo. Bitte das Logo in den Stammdaten der Verwaltung hinterlegen.');
  return{...s,daten:d,firma};});
 const pdf=await require('../lib/hwa-pdf').erstellen(snapshot);
 await db.transaktion(async tx=>{const s=await source(tx,owner,id);if(s.revision!==snapshot.revision||s.druck_revision!==snapshot.druck_revision||s.basis_hash!==snapshot.basis_hash)fail('Auftrag inzwischen geändert. Bitte Druckansicht neu öffnen.',409);await tx.run('INSERT INTO handwerker_pdf(vorgang_id,daten,revision) VALUES(?,?,1) ON CONFLICT(vorgang_id) DO UPDATE SET daten=excluded.daten,revision=revision+1',[id,JSON.stringify(snapshot.daten)]);});return pdf;
}
module.exports={stand,erstellen,HINWEISE};
