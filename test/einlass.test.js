'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db'),E=require('../services/einlass'),T=require('../services/teilnehmer'),P=require('../services/protokolle');
async function fixture(t){
 const db=await openDatabase(':memory:');t.after(()=>db.close());await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'admin','Testleitung','x','admin'),(2,'leser','Leser','x','leser');INSERT INTO objekte(id,nummer,bezeichnung) VALUES(1,'1001','Testobjekt');INSERT INTO versammlungen(id,objekt_id,name,datum,uhrzeit,leitung_id) VALUES(1,1,'ETV Test','2026-11-11','17:00',1);INSERT INTO adressen(id,nachname) VALUES(1,'Alpha'),(2,'Beta'),(3,'Gamma'),(4,'Delta');INSERT INTO einheiten(id,objekt_id,nummer,bezeichnung,mea) VALUES(1,1,'WE 1','Wohnung 1','400/1000'),(2,1,'WE 2','Wohnung 2','200/1000'),(3,1,'WE 3','Wohnung 3','250/1000'),(4,1,'WE 4','Wohnung 4','150/1000');INSERT INTO rollen_zuordnungen(einheit_id,adresse_id,rolle) VALUES(1,1,'eigentuemer'),(2,1,'eigentuemer'),(3,2,'eigentuemer'),(3,3,'eigentuemer'),(4,4,'eigentuemer');");return db;
}
async function attendance(db){
 const s=await T.stand(db,1);return T.speichern(db,1,{revision:s.teilnahme.revision,basis_hash:s.register.basis_hash,teilnehmer:[
 {key:'1',teilnahme:'selbst',kanal:'praesenz',zugang_gesperrt:false,anwesende_eigentuemer:[1],vertreter:'',nachweis:'',vollmacht_textform:false},
 {key:'2:3',teilnahme:'vollmacht',kanal:'online',zugang_gesperrt:false,anwesende_eigentuemer:[],vertreter:'Vertreter',nachweis:'DMS 42',vollmacht_textform:true},
 {key:'4',teilnahme:'abwesend',kanal:'praesenz',zugang_gesperrt:true,anwesende_eigentuemer:[],vertreter:'',nachweis:'',vollmacht_textform:false}
 ]},1);
}
const body=s=>({basis_hash:s.basis_hash,teilnahme_revision:s.teilnahme_revision});
test('Einlass ist lesend; MEA, Köpfe und Einheiten zählen Vertretung und Sperren getrennt',async t=>{
 const db=await fixture(t);let s=await E.stand(db,1);assert.equal(s.durchfuehrung,null);assert.equal(s.start_moeglich,false);assert.equal(s.uebersicht.mea.prozent,0);assert.equal(s.uebersicht.mea.total,'1000');
 await attendance(db);s=await E.stand(db,1);assert.equal(s.start_moeglich,true);assert.deepEqual(s.uebersicht.mea.werte,{praesenz:'600',online:'250',abwesend:'0',gesperrt:'150'});assert.equal(s.uebersicht.mea.prozent,85);assert.equal(s.uebersicht.koepfe.total,'3');assert.equal(s.uebersicht.koepfe.anwesend,'2');assert.equal(s.uebersicht.einheiten.prozent,75);assert.equal(await E.lesen(db,1),null);
});
test('Fehlende MEA werden nicht als vollständige Prozentzahl ausgegeben',async t=>{
 const db=await fixture(t);await attendance(db);await db.run("UPDATE einheiten SET mea=NULL WHERE id=4");const s=await E.stand(db,1);assert.equal(s.uebersicht.mea.verfuegbar,false);assert.equal(s.uebersicht.mea.prozent,null);assert.equal(s.uebersicht.einheiten.verfuegbar,true);assert.equal(s.start_moeglich,false);assert.ok(s.hinweise.length);
});
test('Start ist einmalig, atomar und verwendet Serverzeit; geplanter Beginn bleibt erhalten',async t=>{
 const db=await fixture(t);await attendance(db);const s=await E.stand(db,1),now=()=>new Date('2026-11-11T16:08:00.000Z');
 const [a,b]=await Promise.all([E.starten(db,1,body(s),1,now),E.starten(db,1,body(s),1,()=>new Date('2026-11-11T16:09:00Z'))]);
 assert.equal(a.durchfuehrung.gestartet_am,'2026-11-11T16:08:00.000Z');assert.equal(a.durchfuehrung.gestartet_am,b.durchfuehrung.gestartet_am);assert.equal(a.versammlung.uhrzeit,'17:00');assert.equal((await db.get('SELECT COUNT(*) AS n FROM etv_durchfuehrung')).n,1);assert.equal((await P.stand(db,1)).daten.beginn,'17:08');
});
test('Tatsächlicher Start aktualisiert vorhandenen Protokollentwurf und schützt offene Versionen',async t=>{
 const db=await fixture(t);await attendance(db);let p=await P.stand(db,1);await P.speichern(db,1,{revision:p.revision,basis_hash:p.basis_hash,daten:p.daten});p=await P.stand(db,1);const s=await E.stand(db,1);await E.starten(db,1,body(s),1,()=>new Date('2026-11-11T16:11:00Z'));const n=await P.stand(db,1);assert.equal(n.daten.beginn,'17:11');assert.ok(n.revision>p.revision);await assert.rejects(P.speichern(db,1,{revision:p.revision,basis_hash:p.basis_hash,daten:p.daten}),e=>e.status===409);
});
test('Veralteter Einlass und nicht gespeicherte Teilnehmer sperren den Start',async t=>{
 const db=await fixture(t);let s=await E.stand(db,1);await assert.rejects(E.starten(db,1,body(s),1),/Teilnehmerliste/);await attendance(db);s=await E.stand(db,1);await db.run("UPDATE versammlungen SET uhrzeit='18:00' WHERE id=1");await assert.rejects(E.starten(db,1,body(s),1),e=>e.status===409);assert.equal(await E.lesen(db,1),null);await assert.rejects(E.stand(db,99),e=>e.status===404);
});
test('Einlasssperre und Online-Teilnahme sind validiert und bleiben gespeichert',async t=>{
 const db=await fixture(t);await attendance(db);const s=await T.stand(db,1);assert.equal(s.teilnahme.daten['2:3'].kanal,'online');assert.equal(s.teilnahme.daten['4'].zugang_gesperrt,true);
 for(const change of [r=>r.kanal='fremd',r=>r.zugang_gesperrt='true',r=>r.zugang_gesperrt=true]){const rows=Object.entries(s.teilnahme.daten).map(([key,d])=>({key,...d}));change(rows[0]);await assert.rejects(T.speichern(db,1,{revision:s.teilnahme.revision,basis_hash:s.register.basis_hash,teilnehmer:rows},1));}
});
test('Einlass-API: Leser sehen die Übersicht; nur Schreibberechtigte dürfen starten',async t=>{
 const db=await fixture(t);await attendance(db);const auth=require('../lib/auth'),{baueApp}=require('../lib/appFactory'),server=baueApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const token=await auth.sitzungErstellen(db,1),reader=await auth.sitzungErstellen(db,2),base='http://127.0.0.1:'+server.address().port+'/api/versammlungen/';
 const req=(path,method='GET',data,session=token)=>fetch(base+path,{method,headers:{cookie:auth.COOKIE_NAME+'='+session,'content-type':'application/json'},body:data?JSON.stringify(data):undefined});
 assert.equal((await req('1/einlass','GET',null,'')).status,401);assert.equal((await req('1/einlass','GET',null,reader)).status,200);assert.equal((await req('1/starten','POST',{},reader)).status,403);assert.equal((await req('99/einlass')).status,404);const s=await(await req('1/einlass')).json();assert.equal((await req('1/starten','POST',body(s))).status,200);
});
