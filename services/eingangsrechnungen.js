'use strict';
const {ValidationError}=require('../lib/validation');
const fail=(m,s=400)=>{throw new ValidationError(m,s);};
const TEXT={lieferantenkonto:40,bankverbindung:20,rechnungs_nr:100,rechnungsbeleg:500,objekt_nr:100,buchungskonto:20,bank_verb_nr:20,steuerschluessel:20,buchungstext:500,buchungstext2:500,buchungstext3:500,verwendungszweck1:140,verwendungszweck2:140,hwa_nr:40,akte:40,notiz:4000};
const MONEY=['betrag','anerkannt','hndl_re','hndl_teil','bagatellgrenze','teilzahlung'];
const DAYS=['netto_tage','ziel1_tage','ziel2_tage'];
const DATES=['rechnungsdatum','eingangsdatum','faelligkeit'];
const FLAGS=['rechnerisch_richtig','sachlich_richtig','zahlung_freigegeben','abgrenzen'];
function money(v){
 if(typeof v!=='string'||!/^\-?\d{1,9}(,\d{1,2})?$/.test(v))fail('Beträge bitte in EUR eingeben, z. B. 1234,56.');
 const [whole,part='']=v.replace('-','').split(',');const n=(Number(whole)*100+Number(part.padEnd(2,'0')))*(v.startsWith('-')?-1:1);return n;
}
const euro=n=>(n/100).toFixed(2).replace('.',',');
function normalize(b){
 if(!b||typeof b!=='object')fail('Ungültige Rechnungsangaben.');const d={};
 for(const [k,max] of Object.entries(TEXT)){if(typeof b[k]!=='string'||b[k].length>max)fail('Ungültiges Feld: '+k);d[k]=b[k].trim();}
 for(const k of MONEY)d[k]=money(b[k]);
 for(const k of DAYS){if(!/^\d{0,3}$/.test(String(b[k]??'')))fail('Bitte ganze Tage zwischen 0 und 999 eingeben.');d[k]=b[k]===''?null:Number(b[k]);}
 for(const k of ['ziel1_skonto','ziel2_skonto']){const v=money(b[k]);if(v<0||v>10000)fail('Skonto muss zwischen 0 und 100 % liegen.');d[k]=v;}
 for(const k of DATES){const v=b[k];if(typeof v!=='string'||(v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)))fail('Ungültiges Datum: '+k);d[k]=v||null;}
 for(const k of FLAGS){if(typeof b[k]!=='boolean')fail('Ungültiger Prüfvermerk.');d[k]=b[k];}
 if(!['ueberweisung','abbuchung'].includes(b.zahlungsart))fail('Ungültige Zahlungsart.');d.zahlungsart=b.zahlungsart;
 if(b.fibu_bj!==''&&!/^\d{4}$/.test(String(b.fibu_bj)))fail('Ungültiges Buchungsjahr.');d.fibu_bj=b.fibu_bj===''?null:Number(b.fibu_bj);
 if(d.zahlung_freigegeben&&(!d.rechnerisch_richtig||!d.sachlich_richtig||!d.lieferantenkonto||!d.objekt_nr||!d.buchungskonto||!d.rechnungs_nr||!d.rechnungsdatum||!d.faelligkeit||!d.betrag))fail('Für den Freigabevermerk fehlen Pflichtangaben oder Prüfungen.');
 return d;
}
function baueRechnungen(db,archiv){
 async function document(owner,ref){
  if(!ref||!['archiv','hp'].includes(ref.typ)||!Number.isSafeInteger(Number(ref.id))||Number(ref.id)<1)fail('Bitte ein Archivdokument auswählen.');
  if(ref.typ==='archiv'){const d=await require('./archiv').holen(db,Number(ref.id));if(!d)fail('Dokument nicht gefunden.',404);return{key:'archiv:'+d.id,dokument:d};}
  if(typeof ref.quelle!=='string'||ref.quelle.length>100)fail('Ungültiger Archivbestand.');
  if(!await db.get('SELECT 1 FROM hp_dms_quellen WHERE id=? AND benutzer_id=?',[ref.quelle,owner]))fail('Dokument nicht gefunden.',404);
  const row=await db.get('SELECT * FROM hp_dms_dateien WHERE quelle_id=? AND datei_id=?',[ref.quelle,Number(ref.id)]);if(!row)fail('Dokument noch nicht übernommen.',404);
  return{key:'hp:'+ref.quelle+':'+Number(ref.id),dokument:await archiv.archiveDocument(owner,ref.quelle,Number(ref.id))};
 }
 function view(row){if(!row)return null;const daten=JSON.parse(row.daten);for(const k of [...MONEY,'ziel1_skonto','ziel2_skonto'])daten[k]=euro(daten[k]);return{...row,daten,pruefungen:JSON.parse(row.pruefungen)};}
 async function get(owner,ref){const doc=await document(owner,ref);return{dokument:doc.dokument,rechnung:view(await db.get('SELECT r.*,b.name AS erfasst_name,b.kuerzel AS erfasst_sb FROM eingangsrechnungen r LEFT JOIN benutzer b ON b.id=r.erstellt_von WHERE dokument_schluessel=?',[doc.key]))};}
 async function save(owner,b){
  const doc=await document(owner,b.dokument),daten=normalize(b.daten);if(!Number.isSafeInteger(b.revision)||b.revision<0)fail('Ungültige Version.');
  return db.transaktion(async tx=>{
   const old=await tx.get('SELECT * FROM eingangsrechnungen WHERE dokument_schluessel=?',[doc.key]);if((old?.revision||0)!==b.revision)fail('Rechnung inzwischen geändert. Bitte schließen und neu öffnen.',409);
   if(daten.objekt_nr&&!await tx.get('SELECT id FROM objekte WHERE nummer=?',[daten.objekt_nr]))fail('Objekt-Nr. nicht gefunden.');
   if(daten.buchungskonto&&!await tx.get('SELECT k.id FROM sachkonten k JOIN objekte o ON o.id=k.objekt_id WHERE o.nummer=? AND k.nummer=? AND k.aktiv=1',[daten.objekt_nr,daten.buchungskonto]))fail('Buchungskonto für dieses Objekt nicht gefunden.');
   for(const [key,art] of [['hwa_nr','handwerker'],['akte','akte']])if(daten[key]){const id=Number(daten[key].replace(/^CA-/i,''));if(!Number.isSafeInteger(id)||!await tx.get('SELECT id FROM fach_vorgaenge WHERE id=? AND art=? AND (benutzer_id=? OR zustaendig_id=?)',[id,art,owner,owner]))fail('Verknüpfter Vorgang nicht gefunden: '+key);}
   const checks=old?JSON.parse(old.pruefungen):{},previous=old?JSON.parse(old.daten):{};
   const changed=Object.keys(daten).some(k=>!FLAGS.includes(k)&&JSON.stringify(daten[k])!==JSON.stringify(previous[k]));
   // Änderungen an einer bereits geprüften Rechnung verlangen eine erneute Prüfung.
   if(old&&changed&&FLAGS.slice(0,3).some(k=>previous[k]&&daten[k]))fail('Prüfvermerke vor einer Änderung zurücknehmen und die Rechnung danach erneut prüfen.',409);
   const user=await tx.get('SELECT name,kuerzel FROM benutzer WHERE id=?',[owner]);
   for(const k of FLAGS.slice(0,3)){if(daten[k]&&!previous[k])checks[k]={sb:user.kuerzel||'',benutzer:user.name,zeit:new Date().toISOString()};if(!daten[k])delete checks[k];}
   let id;if(old){id=old.id;await tx.run("UPDATE eingangsrechnungen SET daten=?,pruefungen=?,revision=revision+1,geaendert_am=datetime('now') WHERE id=?",[JSON.stringify(daten),JSON.stringify(checks),id]);}
   else{const inserted=await tx.run('INSERT INTO eingangsrechnungen(dokument_schluessel,erstellt_von,daten,pruefungen) VALUES(?,?,?,?)',[doc.key,owner,JSON.stringify(daten),JSON.stringify(checks)]);id=inserted.lastID;}
   await tx.run('INSERT INTO rechnungs_verlauf(rechnung_id,benutzer_id,vorher,nachher) VALUES(?,?,?,?)',[id,owner,old?JSON.stringify({daten:JSON.parse(old.daten),pruefungen:JSON.parse(old.pruefungen)}):null,JSON.stringify({daten,pruefungen:checks})]);return{id,revision:(old?.revision||0)+1};
  });
 }
 return{get,save};
}
module.exports={baueRechnungen,normalize,money,euro};
