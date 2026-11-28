'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {openDatabase}=require('../db'),{baueArchiv}=require('../services/hpDmsArchiv');
const users=require('../services/benutzer');
async function fixture(t){
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-dms-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 for(const name of ['eins','zwei'])await users.anlegen(db,{benutzername:name,name,rolle:'admin',passwort:'test12345'});
 const owner=(await db.get("SELECT id FROM benutzer WHERE benutzername='eins'")).id,other=(await db.get("SELECT id FROM benutzer WHERE benutzername='zwei'")).id;
 await db.run("INSERT INTO hp_mobile_verbindungen VALUES('mobile',?,'kunde-a','hp','not-a-token','now')",[owner]);
 await db.run("INSERT INTO hp_adress_verbindungen VALUES('direct',?,'HP','HPSD','synthetic',0,0,NULL)",[owner]);
 await db.run("INSERT INTO adressen(nummer,adresstyp,nachname) VALUES('HP-2348','person','Test')");
 const address=(await db.get("SELECT id FROM adressen WHERE nummer='HP-2348'")).id;
 await db.run("INSERT INTO hp_adress_zuordnung(verbindung_id,hp_nummer,adresse_id,basis,status) VALUES('direct',2348,?,'{}','synchron')",[address]);
 const file={id:9,titel:'Rechnung',dateiname:'test.pdf',datum:'2026-11-10',dokumentart:'Rechnungen',groesse:8,version:'v1'};
 const detail={dokument:file,dateien:[file],zuordnungen:[{art:'persons',gesamt:1,eintraege:[{hpNummer:2348,name:'Test'}]}]};
 let calls=0;
 const remote={dmsDetails:async()=>{calls++;return detail;},dmsDownload:async()=>{calls++;return{bytes:Buffer.from('%PDF-1.7'),name:'test.pdf',version:'v1'};},dmsListe:async()=>({dokumente:[file],weitere:false})};
 const svc=baueArchiv(db,dir,remote);return {db,dir,owner,other,address,detail,remote,svc,calls:()=>calls};
}
test('Dauerhaftes DMS: Zuordnung über HP-Quelle, unveränderte Datei nach Trennung und Neustart, fremder Benutzer ausgeschlossen',async t=>{
 const f=await fixture(t);const s=await f.svc.remember(f.owner,'mobile',f.detail);
 assert.equal((await f.svc.archiveList(f.owner,{adresseId:f.address})).eintraege.length,0);
 await f.svc.bind(f.owner,'mobile','direct');
 const list=await f.svc.archiveList(f.owner,{adresseId:f.address});assert.equal(list.eintraege.length,1);assert.equal(list.eintraege[0].kategorie,'rechnung');assert.equal((await f.svc.archiveList(f.owner,{adresseId:f.address,kategorie:'rechnung'})).eintraege.length,1);assert.equal((await f.svc.archiveList(f.owner,{adresseId:f.address,kategorie:'korrespondenz'})).eintraege.length,0);assert.equal(list.eintraege[0].verknuepfungen[0].ziel_id,f.address);
 assert.equal((await f.svc.archiveList(f.other)).eintraege.length,0);
 await assert.rejects(f.svc.localFile(f.other,s.id,9),e=>e.status===404);assert.equal(f.calls(),0);
 const original=await f.svc.store(f.owner,'mobile',9);assert.equal((await fs.readFile(original.path)).toString(),'%PDF-1.7');
 await f.db.run("DELETE FROM hp_mobile_verbindungen WHERE id='mobile'");
 const offline=baueArchiv(f.db,f.dir,{});assert.deepEqual(await fs.readFile((await offline.localFile(f.owner,s.id,9)).path),await fs.readFile(original.path));assert.equal(f.calls(),1);
 assert.equal((await offline.archiveList(f.owner,{adresseId:f.address})).eintraege[0].hp.gesichert,true);
 const row=await f.db.get('SELECT speicher_name FROM hp_dms_dateien');await fs.writeFile(path.join(f.dir,row.speicher_name),'damaged');
 await assert.rejects(offline.localFile(f.owner,s.id,9),e=>e.status===502);
});

test('Firmenadministratoren lesen den bestätigten Altbestand; fehlende Mitgliedschaft, andere Firma und Mitarbeiterrolle bleiben gesperrt',async t=>{
 const f=await fixture(t),s=await f.svc.remember(f.owner,'mobile',f.detail);await f.svc.bind(f.owner,'mobile','direct');await f.svc.store(f.owner,'mobile',9);
 await f.db.run("INSERT INTO firmenbriefkoepfe(id,name,daten) VALUES(1,'Firma 1','{}'),(2,'Firma 2','{}')");
 await require('../services/kundenFirmen').binden(f.db,f.owner,s.id,1);
 assert.equal((await f.svc.archiveList(f.other)).eintraege.length,0);
 await f.db.run('INSERT INTO kunden_firmen_benutzer VALUES(1,?)',[f.other]);
 assert.equal((await f.svc.archiveList(f.other)).eintraege.length,1);assert.equal((await fs.readFile((await f.svc.localFile(f.other,s.id,9)).path)).toString(),'%PDF-1.7');
 await f.db.run("INSERT INTO hp_dms_quellen(id,benutzer_id,subdomain,direkt_id) VALUES('fremd',?,'anderer-bestand','direct')",[f.owner]);
 await require('../services/kundenFirmen').binden(f.db,f.owner,'fremd',2);
 await f.db.run("INSERT INTO hp_dms_dateien SELECT 'fremd',datei_id,titel,dateiname,datum,art,groesse,details,gelesen_am,speicher_name,sha256,gesichert_am,fehler FROM hp_dms_dateien WHERE quelle_id=?",[s.id]);
 assert.equal((await f.svc.archiveList(f.other)).eintraege.length,1);await assert.rejects(f.svc.localFile(f.other,'fremd',9),e=>e.status===404);
 await f.db.run("UPDATE benutzer SET rolle='mitarbeiter' WHERE id=?",[f.other]);assert.equal((await f.svc.archiveList(f.other)).eintraege.length,0);
 await f.db.run("UPDATE benutzer SET rolle='admin' WHERE id=?",[f.other]);await f.db.run('DELETE FROM kunden_firmen_benutzer WHERE benutzer_id=?',[f.other]);await assert.rejects(f.svc.localFile(f.other,s.id,9),e=>e.status===404);
});
test('DMS-Übernahme: dauerhafter Cursor, Fortsetzung nach Fehler, keine Dubletten und Prüfsummenänderungen erhalten Sicherung',async t=>{
 const f=await fixture(t);let broken=true;
 const base=f.remote.dmsDownload;f.remote.dmsDownload=async(...a)=>{if(broken)throw new Error('synthetic');return base(...a);};
 await f.svc.start(f.owner,'mobile','Test');
 for(let i=0;i<100;i++){if((await f.svc.status(f.owner,'mobile')).auftrag.status!=='laeuft')break;await new Promise(r=>setTimeout(r,5));}
 let status=await f.svc.status(f.owner,'mobile');assert.equal(status.auftrag.status,'angehalten');assert.equal(status.dateien,0);
 broken=false;await f.svc.start(f.owner,'mobile','Test');
 for(let i=0;i<100;i++){if((await f.svc.status(f.owner,'mobile')).auftrag.status!=='laeuft')break;await new Promise(r=>setTimeout(r,5));}
 status=await f.svc.status(f.owner,'mobile');assert.equal(status.auftrag.status,'fertig');assert.equal(status.dateien,1);assert.equal(status.metadaten,1);
 await assert.rejects(f.svc.remember(f.owner,'mobile',{...f.detail,dokument:{...f.detail.dokument,version:'v2'}}),e=>e.status===409);
 assert.equal((await fs.readFile((await f.svc.localFile(f.owner,status.quelle,9)).path)).toString(),'%PDF-1.7');
});
