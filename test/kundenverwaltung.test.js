'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {openDatabase}=require('../db'), {baue}=require('../services/kundenverwaltung');
const auth=require('../lib/auth');
function user(id=1,hp=101,email='kunde@example.test') {
  return {id,name:'Testkunde '+id,email,persons:[{id:id+1000,hp_id:hp}],persons_count:1,is_admin:false,is_team:false,is_sync:false,is_bots4you:false};
}
const input=users=>({version:1,portal:'kunde',vollstaendig:true,erwartete_anzahl:users.length,users});
async function fixture(t) {
  const db=await openDatabase(':memory:');t.after(()=>db.close());
  await db.run("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'admin','Admin','synthetic','admin'),(2,'other','Other','synthetic','admin'),(3,'employee','Employee','synthetic','mitarbeiter'),(4,'reader','Reader','synthetic','leser')");
  await db.run("INSERT INTO hp_adress_verbindungen VALUES('direct',1,'HP','HPDATA','synthetic',0,0,NULL)");
  await db.run("INSERT INTO hp_dms_quellen VALUES('source',1,'kunde','direct'),('foreign',2,'kunde',NULL)");
  await db.run("INSERT INTO firmenbriefkoepfe(id,name,daten) VALUES(1,'Firma A','{}'),(2,'Firma B','{}')");
  await require('../services/kundenFirmen').binden(db,1,'source',1);
  await require('../services/kundenFirmen').binden(db,2,'foreign',2);
  await db.run("INSERT INTO objekte(id,bezeichnung) VALUES(1,'Testobjekt')");
  await db.run("INSERT INTO einheiten(id,objekt_id,bezeichnung) VALUES(1,1,'Wohnung 1')");
  for(const id of [1,2,3]) {
    await db.run('INSERT INTO adressen(id,nummer,nachname) VALUES(?,?,?)',[id,String(100+id),'Test '+id]);
    await db.run("INSERT INTO hp_adress_zuordnung(verbindung_id,hp_nummer,adresse_id,basis,status) VALUES('direct',?,?,'{}','synchron')",[100+id,id]);
  }
  await db.run("INSERT INTO rollen_zuordnungen(adresse_id,einheit_id,rolle) VALUES(1,1,'eigentuemer')");
  await db.run("INSERT INTO rollen_zuordnungen(adresse_id,einheit_id,rolle,gueltig_bis) VALUES(2,1,'mieter','2020-01-01')");
  await db.run("INSERT INTO rollen_zuordnungen(adresse_id,einheit_id,rolle,gueltig_von) VALUES(3,1,'mieter','2099-01-01')");
  return {db,s:baue(db)};
}
test('Kundenübernahme: eigene Konten, exakte HP-Adressbezüge, interne Konten ausgeschlossen; keine Mitarbeiter oder Sitzungen erzeugt',async t=>{
  const f=await fixture(t), data=input([user(),{...user(2),is_admin:true},user(3,102,'alt@example.test'),user(4,103,'spaeter@example.test'),user(5,999,'fehlend@example.test')]);
  const preview=await f.s.vorschau(1,'source',data);
  assert.deepEqual(preview.summen,{erfasst:5,intern_ausgeschlossen:1,kunden:4,vorbereitet:1,pruefen:3});
  const result=await f.s.uebernehmen(1,'source',data,preview.pruefwert);
  assert.equal(result.neu,4);assert.equal(result.freigeschaltet,0);
  assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM benutzer')).n,4);
  assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM sitzungen')).n,0);
  const row=await f.db.get("SELECT * FROM kunden_konten WHERE externe_id='1'");
  assert.equal(row.status,'vorbereitet');assert.equal(row.passwort_hash,undefined);
  assert.equal((await f.s.liste(1,'source',{suche:'101'})).gesamt,1);
  assert.equal((await f.s.liste(1,'source',{suche:'kunde@example.test'})).gesamt,1);
  assert.deepEqual(await f.db.all('SELECT adresse_id,hp_nummer FROM kunden_konto_adressen WHERE konto_id=?',[row.id]),[{adresse_id:1,hp_nummer:101}]);
  assert.equal((await f.s.uebernehmen(1,'source',data,preview.pruefwert)).unveraendert,4);
});
test('Kundenvorschau: gleiche E-Mail wird nicht zusammengeführt, fremde Quellen und unvollständige Exporte gesperrt',async t=>{
  const f=await fixture(t), data=input([user(),user(2,102)]);
  const preview=await f.s.vorschau(1,'source',data);assert.equal(preview.summen.pruefen,2);
  assert.match(preview.konten[0].hinweise.join(' '),/mehreren Konten/);
  await assert.rejects(f.s.vorschau(2,'source',data),e=>e.status===404);
  await assert.rejects(f.s.vorschau(1,'foreign',data),e=>e.status===404);
  await assert.rejects(f.s.vorschau(1,'source',{...data,portal:'falsch'}),e=>e.status===409);
  await assert.rejects(f.s.vorschau(1,'source',{...data,vollstaendig:false}),e=>e.status===400);
  await assert.rejects(f.s.vorschau(1,'source',input([user(),user()])),e=>e.status===400);
  await assert.rejects(f.s.vorschau(1,'source',input([{...user(),is_admin:undefined}])),e=>e.status===400);
  const nullPerson=await f.s.vorschau(1,'source',input([{...user(),persons:[null]}]));assert.equal(nullPerson.summen.pruefen,1);
});

test('Leerer HP-Kontoname wird ausschließlich aus den exakt zugeordneten Adressen ergänzt',async t=>{
 const f=await fixture(t);
 const p=await f.s.vorschau(1,'source',input([{...user(),name:''}]));
 assert.equal(p.konten[0].name,'Test 1');assert.equal(p.konten[0].status,'vorbereitet');
 const missing=await f.s.vorschau(1,'source',input([{...user(1,999),name:''}]));
 assert.equal(missing.konten[0].status,'pruefen');assert.ok(missing.konten[0].hinweise.includes('Name fehlt'));
});

test('Firmenbestände bleiben trotz identischem Portal, Konto-ID und E-Mail getrennt; Quelle nicht umhängbar',async t=>{
 const f=await fixture(t),data=input([user()]);
 const a=await f.s.vorschau(1,'source',data),b=await f.s.vorschau(2,'foreign',data);
 await f.s.uebernehmen(1,'source',data,a.pruefwert);await f.s.uebernehmen(2,'foreign',data,b.pruefwert);
 assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM kunden_konten')).n,2);
 assert.equal((await f.s.liste(1,'source')).gesamt,1);
 await assert.rejects(f.s.liste(1,'foreign'),e=>e.status===404);
 await assert.rejects(require('../services/kundenFirmen').binden(f.db,1,'source',2),e=>e.status===409);
 await f.db.run('DELETE FROM kunden_firmen_benutzer WHERE benutzer_id=1');
 await assert.rejects(f.s.liste(1,'source'),e=>e.status===404);
});
test('Kundenübernahme: veränderte Vorschau verworfen, Quelländerungen idempotent und entfernte Konten bleiben gesperrt erhalten',async t=>{
  const f=await fixture(t), data=input([user()]);
  const p=await f.s.vorschau(1,'source',data);
  await f.db.run("UPDATE rollen_zuordnungen SET gueltig_bis='2020-01-01' WHERE adresse_id=1");
  await assert.rejects(f.s.uebernehmen(1,'source',data,p.pruefwert),e=>e.status===409);
  assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM kunden_konten')).n,0);
  const fresh=await f.s.vorschau(1,'source',data);await f.s.uebernehmen(1,'source',data,fresh.pruefwert);
  const empty=input([]), ep=await f.s.vorschau(1,'source',empty);
  assert.equal((await f.s.uebernehmen(1,'source',empty,ep.pruefwert)).nicht_mehr_in_quelle,1);
  assert.equal((await f.db.get('SELECT status FROM kunden_konten')).status,'gesperrt');
  const again=await f.s.vorschau(1,'source',data);await f.s.uebernehmen(1,'source',data,again.pruefwert);
  assert.equal((await f.db.get('SELECT status FROM kunden_konten')).status,'gesperrt');
});
test('Kunden-API: nur Administratoren, Herkunftsprüfung, keine öffentlichen Kunden- oder Aktivierungswege',async t=>{
  const f=await fixture(t),dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-kunden-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const origin='https://curaaed.example';
  const app=require('../lib/appFactory').baueApp(f.db,{uploadDir:dir,hausperfekt:{publicUrl:origin}});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{server.closeIdleConnections();await new Promise(r=>server.close(r));});
  const base='http://127.0.0.1:'+server.address().port;
  const session=async id=>'hv_session='+await auth.sitzungErstellen(f.db,id);
  const admin=await session(1),other=await session(2),employee=await session(3),reader=await session(4);
  assert.equal((await fetch(base+'/api/kunden/quellen')).status,401);
  for(const cookie of [employee,reader]) assert.equal((await fetch(base+'/api/kunden/quellen',{headers:{Cookie:cookie}})).status,403);
  assert.equal((await fetch(base+'/api/kunden?quelle=source',{headers:{Cookie:other}})).status,404);
  const data=input([user()]);
  const post=(part,body,requestOrigin=origin)=>fetch(base+'/api/kunden/'+part,{method:'POST',headers:{Cookie:admin,Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post('vorschau',{quelle:'source',export:data},'https://evil.test')).status,403);
  const r=await post('vorschau',{quelle:'source',export:data});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
  const p=await r.json();assert.equal((await post('uebernehmen',{quelle:'source',export:data,pruefwert:p.pruefwert})).status,200);
  const list=await fetch(base+'/api/kunden?quelle=source',{headers:{Cookie:admin}});assert.equal((await list.json()).gesamt,1);
  assert.equal((await fetch(base+'/api/kunden/aktivieren',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
});
