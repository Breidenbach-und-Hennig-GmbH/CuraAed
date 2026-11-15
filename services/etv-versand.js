'use strict';
const crypto=require('node:crypto'),fs=require('node:fs/promises'),path=require('node:path');
const E=require('./einladungen'),{ValidationError}=require('../lib/validation');
const fail=(s,n=400)=>{throw new ValidationError(s,n);};
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
function baue(db,uploadDir,{m365,renderPdf=require('../lib/einladung-pdf').erstellen}={}){
 async function liste(vid){
  await E.stand(db,vid);
  const rows=await db.all("SELECT b.*,l.versammlung_id,l.firma_id,l.erstellt_am,d.original_name,a.vorgang_id FROM etv_einzelbriefe b JOIN etv_versandlaeufe l ON l.id=b.lauf_id JOIN dokumente d ON d.id=b.dokument_id LEFT JOIN etv_einladung_akten a ON a.versammlung_id=l.versammlung_id WHERE l.versammlung_id=? ORDER BY b.id DESC",[vid]);
  const result=[];for(const {datei_hash,...r} of rows){const einheiten=await db.all('SELECT e.id,e.nummer FROM archiv_verknuepfungen a JOIN einheiten e ON e.id=a.einheit_id WHERE a.dokument_id=? ORDER BY e.nummer',[r.dokument_id]);result.push({...r,einheiten,datei_url:'/api/archiv/'+r.dokument_id+'/download'});}return result;
 }
 async function erstellen(vid,b,user){
  if(typeof b.auftrag_id!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(b.auftrag_id))fail('Ungültiger Erstellungsauftrag.');
  const request=hash({revision:b.revision,basis_hash:b.basis_hash,daten:b.daten,empfaenger_id:b.empfaenger_id});
  const duplicate=await db.get('SELECT anfrage_hash FROM etv_versandlaeufe WHERE versammlung_id=? AND auftrag_id=?',[vid,b.auftrag_id]);
  if(duplicate){if(duplicate.anfrage_hash!==request)fail('Dieser Erstellungsauftrag gehört zu anderen Einladungsdaten.',409);return{einladungen:await liste(vid),wiederverwendet:true};}
  const snap=await db.transaktion(tx=>E.vorbereiten(tx,vid,b));
  const files=[];let persisted=false;
  try{
   for(const recipient of snap.briefempfaenger){
    const pdf=await renderPdf({...snap,briefempfaenger:[recipient]});
    if(pdf.length>15000000)fail('Die Einladung ist zu groß. Bitte Tagesordnung verkürzen.');
    const shipping=await require('./versand').versandFuer(db,recipient.id,'etv_einladung');
    const name=crypto.randomBytes(24).toString('hex')+'.pdf',file=path.join(uploadDir,name);
    try{await fs.writeFile(file,pdf,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')await fs.unlink(file).catch(()=>{});throw e;}
    files.push({recipient,shipping,name,file,size:pdf.length,sha:hash(pdf)});
   }
   const created=await db.transaktion(async tx=>{
    const existing=await tx.get('SELECT anfrage_hash FROM etv_versandlaeufe WHERE versammlung_id=? AND auftrag_id=?',[vid,b.auftrag_id]);
    if(existing){if(existing.anfrage_hash!==request)fail('Erstellungsauftrag inzwischen geändert.',409);return false;}
    await E.vorbereiten(tx,vid,b);await E.vorlageSpeichern(tx,vid,snap);
    let akte=await tx.get('SELECT vorgang_id FROM etv_einladung_akten WHERE versammlung_id=?',[vid]);
    if(!akte){
     const r=await tx.run("INSERT INTO fach_vorgaenge(benutzer_id,art,titel,text,status,prioritaet,zustaendig_id,quelle_status) VALUES(?,'akte',?,?,'offen','normal',?,'lokal')",[user.id,'ETV · '+snap.versammlung.name,'Einladungen und Versand zur Eigentümerversammlung. Objekt '+snap.versammlung.objekt_nummer,user.id]);
     akte={vorgang_id:r.lastID};await tx.run('INSERT INTO etv_einladung_akten(versammlung_id,vorgang_id) VALUES(?,?)',[vid,r.lastID]);
     await tx.run("INSERT INTO fach_bezuege(vorgang_id,typ,ziel_id,name) VALUES(?,'objekt',?,?)",[r.lastID,snap.versammlung.objekt_id,snap.objekt.bezeichnung]);
    }
    const run=await tx.run('INSERT INTO etv_versandlaeufe(versammlung_id,auftrag_id,anfrage_hash,basis_hash,vorlage_hash,firma_id,benutzer_id) VALUES(?,?,?,?,?,?,?)',[vid,b.auftrag_id,request,snap.basis_hash,hash(snap.daten),snap.daten.firma_id,user.id]);
    for(const f of files){
     const name='Einladung-ETV-'+vid+'-Eigentuemer-'+f.recipient.id+'.pdf';
     const doc=await tx.run('INSERT INTO dokumente(titel,kategorie,beschreibung,dokument_datum,original_name,speicher_name,mime_type,groesse,quelle,hochgeladen_von) VALUES(?,?,?,?,?,?,?,?,?,?)',['Einladung '+snap.versammlung.name+' · '+f.recipient.name,'korrespondenz','Persönliche Einladung mit Tagesordnung und Vollmacht',snap.daten.datum,name,f.name,'application/pdf',f.size,'formular',user.id]);
     await tx.run('INSERT INTO archiv_verknuepfungen(dokument_id,adresse_id) VALUES(?,?)',[doc.lastID,f.recipient.id]);
     await tx.run('INSERT INTO archiv_verknuepfungen(dokument_id,objekt_id) VALUES(?,?)',[doc.lastID,snap.versammlung.objekt_id]);
     for(const unit of f.recipient.einheiten)await tx.run('INSERT INTO archiv_verknuepfungen(dokument_id,einheit_id) VALUES(?,?)',[doc.lastID,unit.id]);
     await tx.run('INSERT INTO akte_dokumente(vorgang_id,dokument_id) VALUES(?,?)',[akte.vorgang_id,doc.lastID]);
     const letter=await tx.run('INSERT INTO etv_einzelbriefe(lauf_id,adresse_id,dokument_id,empfaenger,email,post,versand_hinweis,datei_hash,email_status,post_status) VALUES(?,?,?,?,?,?,?,?,?,?)',[run.lastID,f.recipient.id,doc.lastID,f.recipient.name,f.shipping.email,f.shipping.post?1:0,f.shipping.hinweis,f.sha,f.shipping.email?'offen':'nicht_vorgesehen',f.shipping.post?'offen':'nicht_vorgesehen']);
     await tx.run("INSERT INTO etv_versandverlauf(brief_id,kanal,status,meldung,benutzer_id) VALUES(?,'archiv','erstellt',?,?)",[letter.lastID,'Einzel-PDF mit Adresse, Wohnung(en), Objekt und ETV-Akte verknüpft.',user.id]);
    }
    await tx.run("UPDATE fach_vorgaenge SET revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[akte.vorgang_id]);
    return true;
   });
   persisted=created;
   if(!created)await Promise.all(files.map(f=>fs.unlink(f.file).catch(()=>{})));
   return{einladungen:await liste(vid),wiederverwendet:!created};
  }catch(e){if(!persisted)await Promise.all(files.map(f=>fs.unlink(f.file).catch(()=>{})));throw e;}
 }
 async function brief(vid,id){
  const r=await db.get('SELECT b.*,l.versammlung_id,l.firma_id,l.basis_hash,l.vorlage_hash,d.speicher_name,d.original_name FROM etv_einzelbriefe b JOIN etv_versandlaeufe l ON l.id=b.lauf_id JOIN dokumente d ON d.id=b.dokument_id WHERE b.id=? AND l.versammlung_id=?',[id,vid]);
  if(!r)fail('Einladung nicht gefunden.',404);return r;
 }
 async function email(vid,id,user){
  if(!m365)fail('Microsoft 365 ist noch nicht eingerichtet.',409);
  let r=await brief(vid,id);if(r.email&&!require('./m365').mailbox(r.email))fail('Die E-Mail-Adresse ist ungültig. Bitte in der Adresse korrigieren.');if(!r.email)fail('Für diese Einladung ist kein E-Mail-Versand vorgesehen.');
  const current=await E.stand(db,vid);
  if(current.basis_hash!==r.basis_hash||hash(current.daten)!==r.vorlage_hash)fail('Einladungsgrundlage inzwischen geändert. Bitte neue Einzel-PDFs erstellen.',409);
  const route=await require('./versand').versandFuer(db,r.adresse_id,'etv_einladung');
  if(route.email!==r.email)fail('Versandwunsch oder E-Mail-Adresse inzwischen geändert. Bitte Einladung neu erstellen.',409);
  const pdf=await fs.readFile(path.join(uploadDir,path.basename(r.speicher_name)));
  if(hash(pdf)!==r.datei_hash)fail('Die archivierte PDF stimmt nicht mit der erstellten Einladung überein.',409);
  if(pdf.length>2500000)fail('Die PDF ist für den direkten E-Mail-Versand zu groß.');
  const prepared=await m365.vorbereiten(r.firma_id); // Anmeldung prüfen, bevor ein Versandversuch beansprucht wird.
  const claimed=await db.run("UPDATE etv_einzelbriefe SET email_status='in_uebergabe' WHERE id=? AND email_status IN ('offen','fehler')",[r.id]);
  if(!claimed.changes)fail('Einladung bereits übergeben oder Versandstatus unklar. Kein erneuter Versand.',409);
  let status='unklar',message='Übertragungsergebnis unklar. Vor erneutem Versand im Firmenpostfach prüfen.';
  try{
   await m365.senden(prepared,{an:r.email,betreff:'Einladung zur Eigentümerversammlung · '+current.versammlung.name,text:"Guten Tag,\n\nanbei erhalten Sie Ihre persönliche Einladung zur Eigentümerversammlung mit Tagesordnung und Vollmachtsformular.\n\nMit freundlichen Grüßen\n"+current.daten.absender,dateiname:r.original_name,pdf});
   status='uebergeben';message='Von Microsoft 365 zur Verarbeitung angenommen. Dies ist keine Zustellbestätigung.';
  }catch(e){if(e.sicherAbgelehnt){status='fehler';message='Microsoft 365 hat die Übergabe abgelehnt. Verbindung und Versandberechtigung prüfen.';}}
  await db.transaktion(async tx=>{await tx.run('UPDATE etv_einzelbriefe SET email_status=? WHERE id=?',[status,r.id]);await tx.run("INSERT INTO etv_versandverlauf(brief_id,kanal,status,meldung,benutzer_id) VALUES(?,'email',?,?,?)",[r.id,status,message,user.id]);});
  if(status!=='uebergeben')fail(message,502);return{status,meldung:message};
 }
 async function druckBestaetigen(vid,id,user){
  const r=await brief(vid,id);if(!r.post)fail('Für diese Einladung ist kein Postversand vorgesehen.');
  const settings=await db.get('SELECT postweg FROM firmen_versand WHERE firma_id=?',[r.firma_id]);
  const firma=await db.get('SELECT name FROM firmenbriefkoepfe WHERE id=?',[r.firma_id]);
  if((settings?.postweg||(/breidenbach/i.test(firma?.name||'')?'epostbox':'drucker'))==='epostbox')fail('Ein epostbox-Auftrag benötigt eine bestätigte Übergabe. Ein Druckdialog ist kein Versandnachweis.');
  await db.transaktion(async tx=>{const changed=await tx.run("UPDATE etv_einzelbriefe SET post_status='druck_bestaetigt' WHERE id=? AND post_status='offen'",[r.id]);if(!changed.changes)fail('Druck bereits bestätigt.',409);await tx.run("INSERT INTO etv_versandverlauf(brief_id,kanal,status,meldung,benutzer_id) VALUES(?,'post','druck_bestaetigt','Mitarbeiter hat den lokalen Ausdruck bestätigt; keine postalische Zustellbestätigung.',?)",[r.id,user.id]);});return{ok:true};
 }
 return{liste,erstellen,email,druckBestaetigen};
}
module.exports={baue,hash};
