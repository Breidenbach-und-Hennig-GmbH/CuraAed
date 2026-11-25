'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase}=require('../db');
const objekte=require('../services/objekte');
const fibu=require('../services/fibu');
const svc=require('../services/festkonten');
async function setup(t) {
  const db=await openDatabase(':memory:');t.after(()=>db.close());
  const o=await objekte.anlegen(db,{nummer:'7001',bezeichnung:'Testobjekt'});
  await fibu.grundwerteSpeichern(db,o.id,{erstes_bj:2024,aktuelles_bj:2025,rechnungsart:'eue'});
  const bank=await fibu.kontoAnlegen(db,o.id,{nummer:8100,art:'B',bezeichnung:'Testbank'});
  const sammel=await fibu.kontoAnlegen(db,o.id,{nummer:9400,art:'S',bezeichnung:'Sammelkonto'});
  return {db,o,bank,sammel};
}
test('Festkonten bleiben je Objekt/Jahr isoliert, erhalten 0 und leere Felder und erzeugen keine Buchungen',async t=>{
  const {db,o}=await setup(t);const zweites=await objekte.anlegen(db,{nummer:'7002',bezeichnung:'Zweites'});
  const p=await svc.holen(db,o.id,2025);assert.equal(p.version,0);assert.deepEqual(p.werte,{});
  const r=await svc.speichern(db,o.id,2025,{version:0,werte:{SammelKtoDebiKunde:'9400',SammelKtoKrediInt:'0',ObjNrBank1:'7001',BankkKto1:'8100',Dispo_Bankkonto1:'',AARuecklastEigene:'851',BetragRuecklastEigen:'3,00'}},null);
  assert.deepEqual(r.werte,{SammelKtoDebiKunde:9400,SammelKtoKrediInt:0,ObjNrBank1:7001,BankkKto1:8100,Dispo_Bankkonto1:null,AARuecklastEigene:851,BetragRuecklastEigen:3});
  assert.equal(r.version,1);assert.deepEqual((await svc.holen(db,o.id,2024)).werte,{});assert.deepEqual((await svc.holen(db,zweites.id,2025)).werte,{});
  assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_buchungen')).n,0);
  assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_festkonten_historie')).n,1);
});
test('Fehlende oder falsche Konten, unbekannte Felder und Fremdobjekte werden atomar abgewiesen',async t=>{
  const {db,o}=await setup(t);
  for(const werte of [{BankkKto1:9999},{BankkKto1:9400},{ObjNrBank1:7002},{SammelKtoDebiKunde:'94.00'},{AARuecklastBank:1000},{BetragRuecklastEigen:'3.001'},{unbekannt:1}]) {
    await assert.rejects(svc.speichern(db,o.id,2025,{version:0,werte},null));
  }
  await assert.rejects(svc.speichern(db,o.id,2026,{version:0,werte:{}},null),/nicht eingerichtet/);
  assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_festkonten')).n,0);
});
test('Konkurrierende Änderungen überschreiben keine neuere Zuordnung; Historie erhält frühere Stände',async t=>{
  const {db,o}=await setup(t);
  await svc.speichern(db,o.id,2025,{version:0,werte:{SammelKtoDebiKunde:9400}},null);
  await assert.rejects(svc.speichern(db,o.id,2025,{version:0,werte:{SammelKtoDebiKunde:0}},null),/zwischenzeitlich/);
  await svc.speichern(db,o.id,2025,{version:1,werte:{SammelKtoDebiKunde:0}},null);
  const h=await db.all('SELECT werte FROM fibu_festkonten_historie ORDER BY version');
  assert.equal(JSON.parse(h[0].werte).SammelKtoDebiKunde,9400);assert.equal(JSON.parse(h[1].werte).SammelKtoDebiKunde,0);
});
test('Zugeordnete Festkonten lassen sich nicht löschen, umnummerieren oder in eine andere Kontoart ändern',async t=>{
  const {db,o,bank}=await setup(t);await svc.speichern(db,o.id,2024,{version:0,werte:{BankkKto1:8100}},null);
  await assert.rejects(fibu.kontoLoeschen(db,bank.id),/Festkonto/);
  await assert.rejects(fibu.kontoAendern(db,bank.id,{nummer:8101,art:'B',bezeichnung:'Testbank'}),/Festkonto/);
  await assert.rejects(fibu.kontoAendern(db,bank.id,{nummer:8100,art:'S',bezeichnung:'Testbank'}),/Festkonto/);
  await assert.rejects(require('../services/kontenImport').importieren(db,o.id,Buffer.from('Konto-Nr.;Bezeichnung;Art\n8100;Testbank;S\n'),{ausfuehren:true}),/Festkonto/);
  await fibu.kontoAendern(db,bank.id,{nummer:8100,art:'B',bezeichnung:'Neue Bezeichnung'});
});
test('HTTP: Lesen verlangt Anmeldung; Schreiben verlangt Schreibrecht und aktuellen Stand',async t=>{
  const {db,o}=await setup(t), users=require('../services/benutzer');
  for(const [benutzername,rolle] of [['admin','admin'],['leser','leser']])await users.anlegen(db,{benutzername,name:benutzername,rolle,passwort:'Festkonten-Test-2026'});
  const app=require('../lib/appFactory').baueApp(db,{uploadDir:require('os').tmpdir()});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api`,url=base+`/objekte/${o.id}/festkonten?jahr=2025`;
  const login=async name=>{const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({benutzername:name,passwort:'Festkonten-Test-2026'})});return r.headers.get('set-cookie').split(';')[0];};
  assert.equal((await fetch(url)).status,401);const leser=await login('leser'), admin=await login('admin');
  assert.equal((await fetch(url,{headers:{cookie:leser}})).status,200);
  const put=cookie=>fetch(url,{method:'PUT',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({version:0,werte:{SammelKtoDebiKunde:9400}})});
  assert.equal((await put(leser)).status,403);assert.equal((await put(admin)).status,200);assert.equal((await put(admin)).status,409);
});
