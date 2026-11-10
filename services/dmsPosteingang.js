'use strict';
const {ValidationError}=require('../lib/validation');
function kuerzel(value){if(typeof value!=='string')throw new ValidationError('Ungültiger Sachbearbeiter.');const s=value.trim().toUpperCase();if(!/^[A-Z]{0,3}$/.test(s))throw new ValidationError('Bitte höchstens drei Großbuchstaben oder ein leeres Feld eingeben.');return s;}
function bauePosteingang(db){
 async function list(q={}){
  const sb=kuerzel(q.sb??''),seite=q.seite===undefined?1:Number(q.seite);if(!Number.isSafeInteger(seite)||seite<1||seite>1000000)throw new ValidationError('Ungültige Seite.');
  const args=[];let where=q.alle==='1'?'1=1':"p.status='offen'";if(sb){where+=' AND p.sachbearbeiter=?';args.push(sb);}
  const from=' FROM dms_posteingang p JOIN dokumente d ON d.id=p.dokument_id WHERE '+where;
  const count=await db.get('SELECT COUNT(*) AS n'+from,args);
  const rows=await db.all('SELECT p.*,d.titel,d.original_name,d.groesse,d.dokument_datum,d.kategorie'+from+' ORDER BY p.erstellt_am DESC,p.dokument_id DESC LIMIT 50 OFFSET ?',[...args,(seite-1)*50]);
  return {eintraege:rows,gesamt:count.n,seite,weitere:seite*50<count.n,sachbearbeiter:sb};
 }
 async function add(owner,b){
  const sb=kuerzel(b.sachbearbeiter??''),id=Number(b.dokument_id);if(!Number.isSafeInteger(id)||id<1)throw new ValidationError('Ungültiges Dokument.');
  return db.transaktion(async tx=>{
   if(!await tx.get('SELECT id FROM dokumente WHERE id=?',[id]))throw new ValidationError('Archivdokument nicht gefunden.',404);
   if(await tx.get('SELECT 1 FROM dms_posteingang WHERE dokument_id=?',[id]))throw new ValidationError('Dokument bereits im Posteingang erfasst.',409);
   await tx.run("INSERT INTO dms_posteingang(dokument_id,sachbearbeiter,status,erstellt_von) VALUES(?,?,'offen',?)",[id,sb,owner]);
   await tx.run("INSERT INTO dms_posteingang_verlauf(dokument_id,benutzer_id,aktion,sachbearbeiter) VALUES(?,?,'eingang',?)",[id,owner,sb]);return {ok:true};
  });
 }
 async function update(owner,id,b){
  const sb=kuerzel(b.sachbearbeiter??'');if(!['offen','abgeschlossen'].includes(b.status)||!Number.isSafeInteger(b.revision))throw new ValidationError('Ungültiger Bearbeitungsstand.');
  return db.transaktion(async tx=>{const old=await tx.get('SELECT * FROM dms_posteingang WHERE dokument_id=?',[id]);if(!old)throw new ValidationError('Posteingang nicht gefunden.',404);if(old.revision!==b.revision)throw new ValidationError('Eintrag inzwischen geändert. Bitte neu laden.',409);
   await tx.run("UPDATE dms_posteingang SET sachbearbeiter=?,status=?,revision=revision+1,geaendert_am=datetime('now') WHERE dokument_id=?",[sb,b.status,id]);
   await tx.run('INSERT INTO dms_posteingang_verlauf(dokument_id,benutzer_id,aktion,sachbearbeiter) VALUES(?,?,?,?)',[id,owner,b.status==='abgeschlossen'?'abgeschlossen':sb!==old.sachbearbeiter?'weitergeleitet':'geoeffnet',sb]);return {ok:true};
  });
 }
 return {list,add,update};
}
module.exports={bauePosteingang,kuerzel};
