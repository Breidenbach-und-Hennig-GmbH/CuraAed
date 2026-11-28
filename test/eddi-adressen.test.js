'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../db'),{baue,daten}=require('../services/eddiAdressen');
const row=(nummer='1')=>({adresstyp:'person',vorname:'Anna',nachname:'Mustermann',strasse:'Testweg 1',plz:'12345',ort:'Teststadt',email:'anna@example.test',wohnung_nummer:nummer,wohnung_bezeichnung:'WE '+nummer,einheitstyp:'wohnung',funktion:'mieter',beleg:{seite:1,zitat:'Mieter Anna Mustermann anna@example.test'}});
const data=()=>({objekt:{nummer:'868',bezeichnung:'Testweg',strasse:'Testweg 1',plz:'12345',ort:'Teststadt'},adressen:[row(),row('2')]});
async function fixture(t){const db=await openDatabase(':memory:');t.after(()=>db.close());await db.run("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'admin','Admin','synthetic','admin')");await db.run("INSERT INTO eddi_teilungen(id,benutzer_id,dateiname,speicher_name,groesse,datei_hash,status,seiten) VALUES('job',1,'Adressliste.pdf','synthetic.pdf',1,'hash','gelesen',?)",[JSON.stringify([{seite:1,text:'Mieter Anna Mustermann anna@example.test'}])]);const svc=baue(db,{complete:async()=>({content:JSON.stringify(data())})});return{db,svc,user:{id:1,rolle:'admin'}};}
test('Adressliste legt Adressen und Wohnungen gemeinsam ohne MEA an, prüft Dubletten und wiederholt ohne doppelte Datensätze',async t=>{
 const f=await fixture(t);await f.svc.analysieren(f.user,'job',true);const p=await f.svc.vorschau(f.user,'job',{});assert.equal(p.objekt.neu,true);
 await assert.rejects(f.svc.uebernehmen(f.user,'job',{pruefwert:'alt',geprueft:true}),e=>e.status===409);
 const r=await f.svc.uebernehmen(f.user,'job',{pruefwert:p.pruefwert,geprueft:true});assert.equal(r.adressen_neu,1);assert.equal(r.wohnungen_neu,2);assert.equal(r.zuordnungen,2);
 assert.equal((await f.db.get('SELECT count(*) AS n FROM objekte')).n,1);assert.equal((await f.db.get('SELECT count(*) AS n FROM adressen')).n,1);
 assert.equal((await f.db.get('SELECT count(*) AS n FROM einheiten WHERE mea IS NOT NULL')).n,0);
 assert.equal((await f.svc.uebernehmen(f.user,'job',{})).wiederverwendet,true);
 await assert.rejects(f.svc.vorschau({id:99},'job',{}),e=>e.status===404);
});
test('Adressliste verwendet vorhandenes Objekt und genaue Adresse; mögliche Dubletten blockieren alles',async t=>{
 const f=await fixture(t);await require('../services/objekte').anlegen(f.db,{nummer:'18736',bezeichnung:'Vorhanden',strasse:'Testweg 1',plz:'12345',ort:'Teststadt'});
 await require('../services/adressen').anlegen(f.db,{...row(),strasse:'Andere Straße 2'});await f.svc.analysieren(f.user,'job',true);
 const p=await f.svc.vorschau(f.user,'job',{});assert.equal(p.objekt.neu,false);assert.equal(p.objekt.nummer,'18736');assert.equal(p.zeilen[0].pruefen,true);
 await assert.rejects(f.svc.uebernehmen(f.user,'job',{pruefwert:p.pruefwert,geprueft:true}),/Dubletten/);
 assert.equal((await f.db.get('SELECT count(*) AS n FROM einheiten')).n,0);
});
test('Erkennung akzeptiert nur belegte Kontakte; eine nicht belegte Eigentümerfunktion wird nicht geraten',()=>{
 const d=data();d.adressen[0].funktion='eigentuemer';const p=[{seite:1,text:'Mieter Anna Mustermann anna@example.test'}];assert.equal(daten(d,p).adressen[0].funktion,'unklar');
 d.adressen[0].email='erfunden@example.test';assert.throws(()=>daten(d,p),/Fundstelle/);
});
