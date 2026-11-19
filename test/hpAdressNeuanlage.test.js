'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db'),H=require('../services/hpAdressSync'),N=require('../services/hpAdressNeuanlage'),A=require('../services/adressen');
async function setup(t){const db=await openDatabase(':memory:');t.after(()=>db.close());await db.run("INSERT INTO benutzer(id,benutzername,name,rolle,kuerzel,passwort_hash) VALUES(1,'admin','Admin','admin','FD','x')");const sync=H.service(db),grant=await sync.create(1,{name:'HP',datenbank:'HPTEST',zustimmung:true,vollstaendig:true,neuanlagen:true,dauerhaft:true}),svc=N.service(db),body={datenbank:'HPTEST'},create=(b={})=>db.transaktion(async tx=>{const data={nachname:'Test',vorname:'Neu',telefon:'0221-1',email:'test@example.test',...b};await require('../services/adressDubletten').neuanlagePruefen(tx,data);const prepared=await N.vorbereiten(tx,1,data),a=await A.anlegen(tx,data);await N.einreihen(tx,a.id,prepared);return N.metadata(tx,a);}),take=()=>svc.abholen(grant.id,grant.token,body);return{db,sync,grant,svc,create,take,body};}
const reservation={nummer:100,datum:739936,uhrzeit:40000,protokoll:1000};

test('HP-Neuanlage erhält begrenzte native Fehlernummer ohne Freitext und übernimmt keine unbestätigte HP-Nummer',async t=>{
 const f=await setup(t),a=await f.create(),j=(await f.take()).anlegen;
 await f.svc.reservieren(f.grant.id,f.grant.token,{...f.body,id:j.id,reservierung:reservation});
 await assert.rejects(f.svc.ergebnis(f.grant.id,f.grant.token,{...f.body,id:j.id,status:'fehler',diagnose:'email/HY000/private text'}),e=>e.status===400);
 await f.svc.ergebnis(f.grant.id,f.grant.token,{...f.body,id:j.id,status:'fehler',diagnose:'email/HY000/-4990/BTR84'});
 const saved=await A.holen(f.db,a.id);assert.equal(saved.nummer,a.nummer);assert.equal(saved.hp_neuanlage.status,'pruefen');assert.match(saved.hp_neuanlage.meldung,/email\/HY000\/-4990\/BTR84/);assert.deepEqual(await f.take(),{});
 assert.equal(await f.db.get('SELECT * FROM hp_adress_zuordnung WHERE adresse_id=?',[a.id]),undefined);
 const history=await f.db.get("SELECT alt FROM aenderungen WHERE adresse_id=? AND feld='hp_neuanlage_ruecknahme'",[a.id]);assert.equal(JSON.parse(history.alt).vorlaeufige_zuordnung.hp_nummer,100);
 const other={...j.daten.record,nummer:100,name1:'Andere Verwaltung',vorname:''};await f.sync.scan(f.grant.id,f.grant.token,{...f.body,records:[other]});
 const imported=await f.db.get('SELECT * FROM adressen WHERE nummer=?',['HP-100']);assert.notEqual(imported.id,a.id);assert.equal((await A.holen(f.db,a.id)).nachname,'Test');
});

test('Zusatzbereiche einer unbestätigten Neuanlage dürfen keine fremden Kontakte zuordnen',async t=>{
 const f=await setup(t),a=await f.create(),j=(await f.take()).anlegen;await f.svc.reservieren(f.grant.id,f.grant.token,{...f.body,id:j.id,reservierung:reservation});
 const B=require('../services/hpAdressBereiche'),svc=B.service(f.db),r=Object.fromEntries(B.spec.email.fields.map(x=>[x.name,x.typ===0?'':'0']));Object.assign(r,{Adress_Nr:'100',lfd__Nr:'1',LfdIDXMail:'1',eMail_Adresse___Webs:'fremd@example.test',eMail:'1'});
 for(const status of ['reserviert','pruefen']){await f.db.run('UPDATE hp_adress_neuanlagen SET status=?',[status]);const result=await svc.speichern(f.grant.id,f.grant.token,{...f.body,nummer:100,bereich:'email',zeilen:[r]});assert.equal(result.gesperrt,true);}
 assert.equal((await f.db.get('SELECT COUNT(*) n FROM adress_emails WHERE adresse_id=? AND adresse=?',[a.id,'fremd@example.test'])).n,0);
 assert.equal((await f.db.get('SELECT COUNT(*) n FROM hp_adress_bereiche')).n,0);
 await f.db.run("UPDATE hp_adress_zuordnung SET status='unklar',remote=?",[JSON.stringify({...j.daten.record,nummer:100,name1:'Fremd'})]);
 const metadata=await H.metadata(f.db,await f.db.get('SELECT * FROM adressen WHERE id=?',[a.id]));
 for(const uebernehmen of ['hp','curaaed'])await assert.rejects(f.sync.resolve(a.id,{uebernehmen,version:metadata.hp_sync.konflikt_version}),/Unbestätigte HP-Neuanlage/);
});
test('Neue Adressen werden atomar mit HP-Kürzel CA eingereiht; Feldgrenzen bleiben geschützt und bestehende lokale Adressen werden nicht nachträglich angelegt',async t=>{
 const f=await setup(t);assert.equal(f.grant.scope,'adressen-v3');await A.anlegen(f.db,{nachname:'Alt'});const a=await f.create();assert.equal(a.hp_neuanlage.status,'wartend');assert.equal((await f.db.all('SELECT * FROM hp_adress_neuanlagen')).length,1);
 assert.equal(JSON.parse((await f.db.get('SELECT daten FROM hp_adress_neuanlagen')).daten).sb,'CA');
 const before=(await f.db.get('SELECT COUNT(*) n FROM adressen')).n;await assert.rejects(f.create({nachname:'Zu lang',email:'long@example.test',strasse:'x'.repeat(31)}),e=>e.status===400);assert.equal((await f.db.get('SELECT COUNT(*) n FROM adressen')).n,before);
 await f.db.run('UPDATE benutzer SET kuerzel=NULL WHERE id=1');await f.create({nachname:'Ohne persönliches Kürzel',email:'missing@example.test'});assert.ok((await f.db.all('SELECT daten FROM hp_adress_neuanlagen')).every(j=>JSON.parse(j.daten).sb==='CA'));
});

test('Wartende Altaufträge erhalten CA bei der Abholung; bereits reservierte Aufträge behalten ihre unveränderliche Rückprüfungsgrundlage',async t=>{
 const f=await setup(t);await f.create();const queued=await f.db.get('SELECT id,daten FROM hp_adress_neuanlagen'),old={...JSON.parse(queued.daten),sb:'FD'};await f.db.run('UPDATE hp_adress_neuanlagen SET daten=? WHERE id=?',[JSON.stringify(old),queued.id]);const job=(await f.take()).anlegen;assert.equal(job.daten.sb,'CA');
 // Simulate an operation claimed by the previous release before deployment.
 await f.db.run('UPDATE hp_adress_neuanlagen SET daten=? WHERE id=?',[JSON.stringify({...job.daten,sb:'FD'}),queued.id]);await f.svc.reservieren(f.grant.id,f.grant.token,{...f.body,id:job.id,reservierung:reservation});await f.db.run('UPDATE hp_adress_neuanlagen SET abgeholt_ms=0');assert.equal((await f.take()).pruefen.daten.sb,'FD');
});
test('Reservierung bindet genau eine HP-Nummer; Import erzeugt keine zweite CuraAed-Adresse und nur vollständige Rückprüfung bestätigt die Anlage',async t=>{
 const f=await setup(t),a=await f.create(),job=(await f.take()).anlegen,b={...f.body,id:job.id,reservierung:reservation};assert.equal((await f.take()).anlegen,undefined);
 await f.svc.reservieren(f.grant.id,f.grant.token,b);await f.svc.reservieren(f.grant.id,f.grant.token,b);await assert.rejects(f.svc.reservieren(f.grant.id,f.grant.token,{...b,reservierung:{...reservation,nummer:101}}),e=>e.status===409);
 assert.equal((await f.sync.compare(f.grant.id,f.grant.token,{...f.body,fingerprints:[]})).fortsetzen_ab,0);
 const record={...job.daten.record,nummer:100};await f.sync.scan(f.grant.id,f.grant.token,{...f.body,records:[record]});assert.equal((await f.db.get('SELECT COUNT(*) n FROM adressen')).n,1);assert.equal((await f.db.get('SELECT status FROM hp_adress_zuordnung')).status,'neuanlage');
 await assert.rejects(A.aktualisieren(f.db,a.id,{ort:'Während Anlage'}),e=>e.status===409);await assert.rejects(A.setzeArchiviert(f.db,a.id,true),e=>e.status===409);
 const result={...f.body,id:job.id,status:'erfolg',record,vollstaendig_geprueft:true};await assert.rejects(f.svc.ergebnis(f.grant.id,f.grant.token,{...result,vollstaendig_geprueft:false}),e=>e.status===409);await assert.rejects(f.svc.ergebnis(f.grant.id,f.grant.token,{...result,record:{...record,name1:'Fremd'}}),e=>e.status===409);
 await f.svc.ergebnis(f.grant.id,f.grant.token,result);await f.svc.ergebnis(f.grant.id,f.grant.token,result);const saved=await A.holen(f.db,a.id);assert.equal(saved.nummer,'HP-100');assert.equal(saved.hp_sync.status,'synchron');assert.equal(saved.hp_neuanlage.status,'synchron');
 const B=require('../services/hpAdressBereiche'),spec=B.spec.telefon,tel=Object.fromEntries(spec.fields.map(f=>[f.name,f.typ===0?'':'0']));Object.assign(tel,{AdrNr:'100',LfdNrIDXTel:'1',TelNr:'0221-1',TelTxt:'Telefon'});await B.service(f.db).speichern(f.grant.id,f.grant.token,{...f.body,nummer:100,bereich:'telefon',zeilen:[tel]});assert.equal((await f.db.get('SELECT COUNT(*) n FROM adress_telefone WHERE adresse_id=?',[a.id])).n,1);

});
test('Verlorener Commit führt ausschließlich zur Rückleseprüfung; fehlende oder abweichende Ergebnisse erzeugen keinen neuen Anlageversuch',async t=>{
 const f=await setup(t);await f.create();const j=(await f.take()).anlegen;await f.svc.reservieren(f.grant.id,f.grant.token,{...f.body,id:j.id,reservierung:reservation});assert.deepEqual(await f.take(),{});await f.db.run('UPDATE hp_adress_neuanlagen SET abgeholt_ms=0');const recovered=await f.take();assert.equal(recovered.anlegen,undefined);assert.equal(recovered.pruefen.reservierung.nummer,100);
 await f.svc.ergebnis(f.grant.id,f.grant.token,{...f.body,id:j.id,status:'unklar'});assert.deepEqual(await f.take(),{});assert.equal((await f.db.get('SELECT status FROM hp_adress_zuordnung')).status,'unklar');
});
test('Abholung ohne Reservierungsbestätigung wird nicht wiederholt; Widerruf und beschränkte Kopplungen sperren die Neuanlage',async t=>{
 const f=await setup(t);await f.create();await f.take();await f.db.run('UPDATE hp_adress_neuanlagen SET abgeholt_ms=0');assert.deepEqual(await f.take(),{});assert.equal((await f.db.get('SELECT status FROM hp_adress_neuanlagen')).status,'pruefen');
 const limited=await f.sync.create(1,{name:'HP',datenbank:'HPTEST',zustimmung:true,vollstaendig:true});await assert.rejects(f.svc.abholen(limited.id,limited.token,f.body),e=>e.status===403);await assert.rejects(f.take(),e=>e.status===401);
});

test('Während der Vorbereitung geänderte Kommunikationsdaten verhindern eine veraltete HP-Neuanlage',async t=>{const f=await setup(t),a=await f.create(),j=(await f.take()).anlegen;await f.db.run("UPDATE adressen SET telefon='NEU' WHERE id=?",[a.id]);await assert.rejects(f.svc.reservieren(f.grant.id,f.grant.token,{...f.body,id:j.id,reservierung:reservation}),e=>e.status===409);assert.equal((await f.db.get('SELECT COUNT(*) n FROM hp_adress_zuordnung')).n,0);});
