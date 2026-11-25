'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../db'),objekte=require('../services/objekte'),fibu=require('../services/fibu'),svc=require('../services/fibuJahresdaten');
async function setup(t){const db=await openDatabase(':memory:');t.after(()=>db.close());const o=await objekte.anlegen(db,{nummer:'7001',bezeichnung:'Testobjekt'});await fibu.grundwerteSpeichern(db,o.id,{erstes_bj:2024,aktuelles_bj:2025});const bank=await fibu.kontoAnlegen(db,o.id,{nummer:8100,art:'B',bezeichnung:'Testbank'});await fibu.kontoAnlegen(db,o.id,{nummer:9400,art:'S',bezeichnung:'Sachkonto'});return {db,o,bank};}
test('Jahresgrundwerte und mehrere Bankzuordnungen bleiben objekt- und jahresbezogen; 0, Nein und leer bleiben erhalten',async t=>{
 const {db,o}=await setup(t),w={zeitraum_von:'2025-01-01',zeitraum_bis:'2025-12-31',gebucht_bis:'2025-11-30',letzte_stapelnummer:0,automatische_leerstandsbuchung:false,waehrung:'EUR',vorsteuer_abzugsquote:null};
 const banken=[{lfdnr:2,konto:0,aktiv:true},{lfdnr:1,konto:8100,aktiv:false},{lfdnr:3,konto:null,aktiv:null}];
 await svc.speichern(db,o.id,2025,{version:0,werte:w,banken},null);const r=await svc.holen(db,o.id,2025);assert.deepEqual(r.werte,w);assert.deepEqual(r.banken,banken.sort((a,b)=>a.lfdnr-b.lfdnr));assert.equal(r.version,1);assert.deepEqual((await svc.holen(db,o.id,2024)).werte,{});
 const zweit=await objekte.anlegen(db,{nummer:'7002',bezeichnung:'Zweites'});assert.deepEqual((await svc.holen(db,zweit.id,2025)).banken,[]);
 assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_buchungen')).n,0);assert.equal((await db.get('SELECT COUNT(*) n FROM sachkonto_werte')).n,0);
 assert.equal((await fibu.grundwerte(db,o.id)).grundwerte.aktuelles_bj,2025);
});
test('Ungültige Datumswerte, Zeiträume, Quoten, Bankkonten und doppelte Banknummern werden atomar abgewiesen',async t=>{
 const {db,o}=await setup(t);
 for(const werte of [{zeitraum_von:'2025-02-30'},{zeitraum_von:'2024-01-01'},{zeitraum_von:'2025-12-31',zeitraum_bis:'2025-01-01'},{gebucht_bis:'2026-01-01'},{vorsteuer_abzugsquote:101},{automatische_leerstandsbuchung:'Ja'},{waehrung:'euro'},{unbekannt:1}])await assert.rejects(svc.speichern(db,o.id,2025,{version:0,werte},null));
 for(const banken of [[{lfdnr:1,konto:9999,aktiv:true}],[{lfdnr:1,konto:9400,aktiv:true}],[{lfdnr:0,konto:0,aktiv:null}],[{lfdnr:1,konto:0,aktiv:null},{lfdnr:1,konto:0,aktiv:null}]])await assert.rejects(svc.speichern(db,o.id,2025,{version:0,werte:{},banken},null));
 await assert.rejects(svc.speichern(db,o.id,2026,{version:0,werte:{}},null),/nicht eingerichtet/);assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_jahresdaten')).n,0);
});
test('Konkurrierende Änderungen überschreiben keine Werte; Bankkonto-Schutz gilt auch für Kontenimporte',async t=>{
 const {db,o,bank}=await setup(t);await svc.speichern(db,o.id,2025,{version:0,werte:{waehrung:'EUR'},banken:[{lfdnr:1,konto:8100,aktiv:false}]},null);
 await assert.rejects(svc.speichern(db,o.id,2025,{version:0,werte:{waehrung:'USD'}},null),/zwischenzeitlich/);
 await svc.speichern(db,o.id,2025,{version:1,werte:{sachbearbeiter:'AB'}},null);assert.equal((await svc.holen(db,o.id,2025)).werte.waehrung,'EUR');assert.equal((await svc.holen(db,o.id,2025)).banken.length,1);
 await assert.rejects(fibu.kontoLoeschen(db,bank.id),/Festkonto/);await assert.rejects(fibu.kontoAendern(db,bank.id,{nummer:8101,art:'B',bezeichnung:'Test'}),/Festkonto/);
 await assert.rejects(require('../services/kontenImport').importieren(db,o.id,Buffer.from('Konto-Nr.;Bezeichnung;Art\n8100;Test;S\n'),{ausfuehren:true}),/Festkonto/);
 assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_jahresdaten_historie')).n,2);
});
test('HTTP: Lesen verlangt Anmeldung, Speichern Schreibrecht und aktuellen Stand',async t=>{
 const {db,o}=await setup(t),users=require('../services/benutzer');for(const [benutzername,rolle]of [['admin','admin'],['leser','leser']])await users.anlegen(db,{benutzername,name:benutzername,rolle,passwort:'Jahresdaten-Test-2026'});
 const app=require('../lib/appFactory').baueApp(db,{uploadDir:require('os').tmpdir()}),server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}/api`,url=base+`/objekte/${o.id}/fibu-jahresdaten?jahr=2025`;
 const login=async benutzername=>{const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({benutzername,passwort:'Jahresdaten-Test-2026'})});return r.headers.get('set-cookie').split(';')[0];};
 assert.equal((await fetch(url)).status,401);const leser=await login('leser'),admin=await login('admin');assert.equal((await fetch(url,{headers:{cookie:leser}})).status,200);
 const put=cookie=>fetch(url,{method:'PUT',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({version:0,werte:{waehrung:'EUR'},banken:[]})});assert.equal((await put(leser)).status,403);assert.equal((await put(admin)).status,200);assert.equal((await put(admin)).status,409);
});
