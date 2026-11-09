'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const sqlite3=require('sqlite3');
const {Database,openDatabase}=require('../db');
const {migrieren}=require('../db/hpStrukturen');

async function v4(file=':memory:') {
  const raw=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(file,e=>e?reject(e):resolve(d));});
  const db=new Database(raw);
  await db.exec(await fs.readFile(path.join(__dirname,'../db/schema.sql'),'utf8'));
  await db.run('ALTER TABLE rollen_zuordnungen ADD COLUMN pfkt_code TEXT');
  await db.run('PRAGMA user_version=4');
  await db.exec(`
    INSERT INTO benutzer(id,benutzername,passwort_hash,name,rolle) VALUES(1,'migration-test','x','Test','admin');
    INSERT INTO objekte(id,nummer,bezeichnung) VALUES(1,'A-4010','Test A'),(2,'B-4010','Test B');
    INSERT INTO einheiten(id,objekt_id,nummer,bezeichnung) VALUES(1,1,'A-4010-1','Einheit A'),(2,2,'B-4010-1','Einheit B');
    INSERT INTO adressen(id,nummer,nachname) VALUES(1,'A-65937','Test');
    INSERT INTO rollen_zuordnungen(id,adresse_id,objekt_id,einheit_id,rolle) VALUES(1,1,1,1,'eigentuemer');
    INSERT INTO personenkonten(id,objekt_id,zuordnung_id,nummer,ref_nr,bemerkung) VALUES(7,1,1,'10001','007','Erhalten');
    UPDATE sqlite_sequence SET seq=8000 WHERE name='personenkonten';
    INSERT INTO pkto_sollwerte(id,personenkonto_id,gilt_ab,bezeichnung,netto,betrag) VALUES(9,7,'2026-01-01','Hausgeld',123.45,123.45);
    INSERT INTO verteilerschluessel(id,objekt_id,kuerzel,bezeichnung,gesamt) VALUES(1,1,'300','MEA alt',1000);
    INSERT INTO einheit_verteilung(schluessel_id,einheit_id,anteil) VALUES(1,1,123.456);
    INSERT INTO hp_adress_verbindungen(id,benutzer_id,name,datenbank,token_hash,ablauf_ms) VALUES('A',1,'A','HPSERVSD','hash-A',0),('B',1,'B','HPSERVB','hash-B',0);
    INSERT INTO hp_adress_zuordnung(verbindung_id,hp_nummer,adresse_id,basis,status) VALUES('A',65937,1,'{}','synchron');
  `);
  return db;
}

async function oldValues(db) {
  const result={};
  for(const table of ['pkto_sollwerte','einheit_verteilung','verteilerschluessel','hp_adress_verbindungen','hp_adress_zuordnung','benutzer']) result[table]=await db.all(`SELECT * FROM ${table} ORDER BY rowid`);
  result.konto=await db.get('SELECT id,objekt_id,zuordnung_id,nummer,ref_nr,sachbearbeiter_id,bemerkung,erstellt_am FROM personenkonten WHERE id=7');
  return result;
}

test('v4-Migration erhält Konten, Sollwerte, alte Anteile und bestehende Adresskopplungen; Wiederanlauf bleibt unverändert',async()=>{
  const db=await v4();
  try {
    const before=await oldValues(db);
    await migrieren(db,':memory:');
    // Neue optionale Sollfelder ändern keine vorhandenen Werte.
    const after=await oldValues(db);
    for(const row of after.pkto_sollwerte) for(const key of Object.keys(row)) if(!(key in before.pkto_sollwerte[0])) delete row[key];
    assert.deepEqual(after,before);
    assert.deepEqual(await db.get('SELECT adresse_id,einheit_id,kontoname FROM personenkonten WHERE id=7'),{adresse_id:1,einheit_id:1,kontoname:null});
    assert.equal((await db.get('PRAGMA user_version')).user_version,5);
    assert.equal((await db.get('PRAGMA foreign_keys')).foreign_keys,1);
    assert.deepEqual(await db.all('PRAGMA foreign_key_check'),[]);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM verteilerschluessel_jahre')).n,0);
    await migrieren(db,':memory:');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM personenkonto_funktionen')).n,1);
    const next=await db.run("INSERT INTO personenkonten(objekt_id,nummer,kontoname,adresse_id,einheit_id) VALUES(1,'10002','Separates HP-Konto',1,1)");
    assert.equal(next.lastID,8001);
    await db.run('INSERT INTO personenkonto_funktionen(personenkonto_id,objekt_id,zuordnung_id) VALUES(?,1,1)',[next.lastID]);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM personenkonto_funktionen WHERE zuordnung_id=1')).n,2);
    await assert.rejects(db.run("INSERT INTO personenkonten(objekt_id,zuordnung_id,nummer) VALUES(1,1,'10003')"),/UNIQUE/);
    await assert.rejects(db.run("INSERT INTO personenkonten(objekt_id,nummer,einheit_id) VALUES(1,'10004',2)"),/FOREIGN KEY/);
  } finally {await db.close();}
});

test('Jahreswerte und Konto-/Einheitenanteile bleiben exakt getrennt, objektfremde Verknüpfungen werden abgewiesen',async()=>{
  const db=await v4();
  try {
    await migrieren(db,':memory:');
    for(const jahr of [2025,2026]) {
      await db.run('INSERT INTO objekt_buchungsjahre(objekt_id,jahr) VALUES(1,?)',[jahr]);
      await db.run("INSERT INTO verteilerschluessel_jahre(schluessel_id,objekt_id,jahr,bezeichnung,gesamt_dezimal) VALUES(1,1,?,'MEA','1000.000000000000000001')",[jahr]);
    }
    await db.run("INSERT INTO einheit_verteilung_jahre VALUES(1,2025,1,1,'123.000000000000000001')");
    await db.run("INSERT INTO einheit_verteilung_jahre VALUES(1,2026,1,1,'124.000000000000000002')");
    await db.run("INSERT INTO personenkonto_verteilung_jahre VALUES(1,2026,1,7,'4.500000000000000003')");
    assert.deepEqual((await db.all('SELECT jahr,anteil_dezimal FROM einheit_verteilung_jahre ORDER BY jahr')).map(r=>r.anteil_dezimal),['123.000000000000000001','124.000000000000000002']);
    assert.equal((await db.get('SELECT anteil FROM einheit_verteilung')).anteil,123.456);
    assert.equal((await db.get('SELECT gesamt FROM verteilerschluessel WHERE id=1')).gesamt,1000);
    await assert.rejects(db.run("INSERT INTO einheit_verteilung_jahre VALUES(1,2026,1,2,'1')"),/FOREIGN KEY/);
    await assert.rejects(db.run("INSERT INTO einheit_verteilung_jahre VALUES(1,2027,1,1,'1')"),/FOREIGN KEY/);
    for(const invalid of ['NaN','Infinity','1.2.3','1e3','--1','1-2','-','1.','', ' 1']) {
      await assert.rejects(db.run('UPDATE einheit_verteilung_jahre SET anteil_dezimal=? WHERE jahr=2025',[invalid]),/CHECK/);
    }
    await db.run("INSERT INTO personenkonto_verteilung_zeitwerte(schluessel_id,jahr,objekt_id,personenkonto_id,hp_dat_anders,anzahl_personen_dezimal) VALUES(1,2026,1,7,0,'2.5')");
    await assert.rejects(db.run("INSERT INTO personenkonto_verteilung_zeitwerte(schluessel_id,jahr,objekt_id,personenkonto_id,hp_dat_anders) VALUES(1,2026,2,7,1)"),/FOREIGN KEY/);
  } finally {await db.close();}
});

test('gleiche HP-Nummer in verschiedenen Kundenbeständen bleibt getrennt; Kinder müssen Quelle und lokales Objekt erfüllen',async()=>{
  const db=await v4();
  try {
    await migrieren(db,':memory:');
    await db.run("INSERT INTO hp_objekt_zuordnung(verbindung_id,hp_objnr,objekt_id) VALUES('A',4010,1),('B',4010,2)");
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM hp_objekt_zuordnung WHERE hp_objnr=4010')).n,2);
    assert.deepEqual(await db.get("SELECT verwaltungsstatus,fi_beendet FROM hp_objekt_zuordnung WHERE verbindung_id='A'"),{verwaltungsstatus:'unklar',fi_beendet:null});
    await db.run("INSERT INTO hp_einheit_zuordnung(verbindung_id,hp_objnr,objekt_id,hp_whgnr,einheit_id) VALUES('A',4010,1,1,1)");
    await assert.rejects(db.run("INSERT INTO hp_einheit_zuordnung(verbindung_id,hp_objnr,objekt_id,hp_whgnr,einheit_id) VALUES('B',4010,1,2,2)"),/FOREIGN KEY/);
    await assert.rejects(db.run("INSERT INTO hp_einheit_zuordnung(verbindung_id,hp_objnr,objekt_id,hp_whgnr,einheit_id) VALUES('A',4010,1,2,2)"),/FOREIGN KEY/);
    await db.run("INSERT INTO hp_personenkonto_zuordnung(verbindung_id,hp_objnr,objekt_id,hp_pktonr,personenkonto_id) VALUES('A',4010,1,10001,7)");
    await assert.rejects(db.run("UPDATE hp_personenkonto_zuordnung SET verbindung_id='B'"),/FOREIGN KEY/);
    await assert.rejects(db.run("INSERT INTO hp_objekt_zuordnung(verbindung_id,hp_objnr,objekt_id) VALUES('B',4020,1)"),/UNIQUE/);
    assert.deepEqual(await db.all('PRAGMA foreign_key_check'),[]);
  } finally {await db.close();}
});

test('Fehler am Ende des Umbaus rollt Tabellen und Werte vollständig zurück und schaltet Fremdschlüssel wieder ein',async()=>{
  const db=await v4(); const before=await oldValues(db);
  const original=db.transaktion.bind(db);
  db.transaktion=fn=>original(tx=>fn({...tx,run:(sql,params)=>{if(sql==='PRAGMA user_version = 5')throw Error('Testfehler vor Commit');return tx.run(sql,params);}}));
  try {
    await assert.rejects(migrieren(db,':memory:'),/Testfehler/);
    assert.deepEqual(await oldValues(db),before);
    assert.equal((await db.get('PRAGMA user_version')).user_version,4);
    assert.equal((await db.get('PRAGMA foreign_keys')).foreign_keys,1);
    assert.equal((await db.get("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='verteilerschluessel_jahre'")).n,0);
    assert.equal((await db.get("SELECT seq FROM sqlite_sequence WHERE name='personenkonten'")).seq,8000);
  } finally {await db.close();}
});

test('dateibasierter Umbau erstellt lesbare Sicherung vor Änderungen und übersteht erneutes Öffnen',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-hp-struktur-'));
  const file=path.join(dir,'test.db'); let db=await v4(file);
  try {
    await migrieren(db,file); await db.close(); db=null;
    const backups=(await fs.readdir(dir)).filter(f=>f.startsWith('sicherung-vor-hp-strukturen-'));
    assert.equal(backups.length,1);
    const raw=await new Promise((resolve,reject)=>{const d=new sqlite3.Database(path.join(dir,backups[0]),e=>e?reject(e):resolve(d));});
    const backup=new Database(raw);
    try { assert.equal((await backup.get('PRAGMA user_version')).user_version,4); assert.equal((await backup.get('SELECT betrag FROM pkto_sollwerte WHERE id=9')).betrag,123.45); }
    finally {await backup.close();}
    db=await openDatabase(file);
    assert.equal((await db.get('PRAGMA user_version')).user_version,5);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM personenkonten')).n,1);
    assert.equal((await fs.readdir(dir)).filter(f=>f.startsWith('sicherung-vor-hp-strukturen-')).length,1);
    assert.deepEqual(await db.all('PRAGMA foreign_key_check'),[]);
  } finally {if(db)await db.close();await fs.rm(dir,{recursive:true,force:true});}
});

test('unbekannte Kontofelder werden nicht verworfen; gültige alte Rollen mit indirektem Objektbezug bleiben erhalten',async()=>{
  const db=await v4();
  try {
    await db.run('ALTER TABLE personenkonten ADD COLUMN kundenfeld TEXT');
    await db.run("UPDATE personenkonten SET kundenfeld='erhalten'");
    await assert.rejects(migrieren(db,':memory:'),/Unbekannte Personenkonto/);
    assert.equal((await db.get('SELECT kundenfeld FROM personenkonten')).kundenfeld,'erhalten');
    assert.equal((await db.get('PRAGMA foreign_keys')).foreign_keys,1);
  } finally {await db.close();}
  const indirect=await v4();
  try {
    await indirect.run('UPDATE rollen_zuordnungen SET objekt_id=NULL WHERE id=1');
    await migrieren(indirect,':memory:');
    assert.equal((await indirect.get('SELECT zuordnung_id FROM personenkonten WHERE id=7')).zuordnung_id,1);
    assert.deepEqual(await indirect.all('PRAGMA foreign_key_check'),[]);
  } finally {await indirect.close();}
});

test('fehlgeschlagene Sicherung verhindert den Umbau vor der ersten Schemaänderung',async()=>{
  const db=await v4(); const before=await oldValues(db); const run=db.run.bind(db);
  db.run=(sql,params)=>{if(sql==='VACUUM INTO ?')throw Error('Sicherung nicht möglich');return run(sql,params);};
  try {
    await assert.rejects(migrieren(db,path.join(os.tmpdir(),'curaaed-test-backup-blockiert.db')),/Sicherung nicht möglich/);
    assert.deepEqual(await oldValues(db),before);
    assert.equal((await db.get('PRAGMA user_version')).user_version,4);
    assert.equal((await db.get('PRAGMA foreign_keys')).foreign_keys,1);
  } finally {await db.close();}
});
