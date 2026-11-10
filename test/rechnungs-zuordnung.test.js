'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db');
const {zuordnen}=require('../services/rechnungsZuordnung');
async function setup(t){
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 await db.run("INSERT INTO adressen(id,nummer,firmenname,strasse,plz,lkto_nr) VALUES(1,'A1','Rohrfix GmbH','Handwerkerweg 7','51643','70001')");
 await db.run("INSERT INTO adress_bank(adresse_id,kontoinhaber,iban) VALUES(1,'Rohrfix GmbH','DE89370400440532013000')");
 await db.run("INSERT INTO objekte(id,nummer,bezeichnung,strasse) VALUES(1,'1001','Testhaus','Testweg 42'),(2,'1002','Zweites Haus','Testweg 43')");
 await db.run("INSERT INTO sachkonten(objekt_id,nummer,bezeichnung) VALUES(1,4100,'Heizungswartung'),(1,4200,'Gebäudereinigung'),(2,5100,'Heizungswartung')");
 return db;
}
const basis=()=>({rechnung:true,felder:{},belege:{},hinweise:[],ibans:['DE89 3704 0044 0532 0130 00'],struktur:{lieferant:{name:'Rohrfix GmbH',strasse:'Handwerkerweg 7',plz:'51643'},positionen:[{name:'Heizungswartung Objekt-Nr.: 1001'}]}});
test('Zuordnung: eindeutige IBAN, echtes Lieferantenkonto, Objekt und aktives objektspezifisches Sachkonto',async t=>{
 const db=await setup(t),r=await zuordnen(db,basis(),{},'archiv:1',{owner:1});
 assert.equal(r.felder.lieferantenkonto,'70001');assert.equal(r.felder.objekt_nr,'1001');assert.equal(r.felder.buchungskonto,'4100');assert.equal(r.zuordnungsbasis,undefined);assert.equal(r.ibans,undefined);
 assert.deepEqual(basis().felder,{});
 await db.run('UPDATE sachkonten SET aktiv=0 WHERE nummer=4100');
 assert.equal((await zuordnen(db,basis(),{},'archiv:1')).felder.buchungskonto,undefined);
});
test('Zuordnung: gemeinsame IBAN, widersprüchlicher Lieferant, mehrere Objekte und Konten bleiben zur Auswahl',async t=>{
 const db=await setup(t);await db.run("INSERT INTO adressen(id,nummer,firmenname,lkto_nr,strasse,plz) VALUES(2,'A2','Andere Firma','70002','Anderer Weg 5','51643')");
 await db.run("INSERT INTO adress_bank(adresse_id,kontoinhaber,iban) VALUES(2,'Andere Firma','DE89370400440532013000')");
 assert.equal((await zuordnen(db,basis(),{},'archiv:1')).felder.lieferantenkonto,undefined);
 const b=basis();b.struktur.positionen.push({name:'Gebäudereinigung Objekt-Nr.: 1002'});
 const r=await zuordnen(db,b,{},'archiv:1');assert.equal(r.felder.objekt_nr,undefined);assert.equal(r.felder.buchungskonto,undefined);assert.equal(r.zuordnungen.objekte.length,2);
 const chosen=await zuordnen(db,b,{},'archiv:1',{objekt_nr:'1001',lieferantenkonto:'70001'});assert.equal(chosen.felder.buchungskonto,undefined);assert.equal(chosen.zuordnungen.konten.length,2);
 await db.run('DELETE FROM adress_bank WHERE adresse_id=1');
 const conflict=await zuordnen(db,basis(),{},'archiv:1');assert.equal(conflict.felder.lieferantenkonto,undefined);assert.match(conflict.hinweise.join(' '),/verschiedene Adressen/);
});
test('Zuordnung: keine erfundenen Konten, keine archivierten Treffer, aktuelle Stammdaten und Belegzuordnungen',async t=>{
 const db=await setup(t);await db.run("UPDATE adressen SET lkto_nr=NULL");
 assert.equal((await zuordnen(db,basis(),{},'archiv:1')).felder.lieferantenkonto,undefined);
 await db.run("UPDATE adressen SET lkto_nr='70009'");
 assert.equal((await zuordnen(db,basis(),{},'archiv:1')).felder.lieferantenkonto,'70009');
 const r=await zuordnen(db,{rechnung:true,felder:{},belege:{},hinweise:[]},{verknuepfungen:[{typ:'objekt',nummer:'1002'}]},'archiv:1');
 assert.equal(r.felder.objekt_nr,'1002');assert.equal(r.felder.buchungskonto,undefined);
 await db.run('UPDATE objekte SET archiviert=1 WHERE id=2');
 assert.equal((await zuordnen(db,basis(),{verknuepfungen:[{typ:'objekt',nummer:'1002'}]},'archiv:1')).zuordnungen.objekte.some(o=>o.nummer==='1002'),false);
});
test('Zuordnung: OCR-Anschrift und eigene gespeicherte Rechnung, ohne fremde HP-Historie',async t=>{
 const db=await setup(t);
 await db.run("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'eins','Test','hash','admin'),(2,'zwei','Test2','hash','admin')");
 await db.run('INSERT INTO eingangsrechnungen(dokument_schluessel,erstellt_von,daten,pruefungen) VALUES(?,?,?,?)',['archiv:9',1,JSON.stringify({lieferantenkonto:'70001',objekt_nr:'1001',buchungskonto:'4100'}),'{}']);
 const b={rechnung:true,felder:{},belege:{},hinweise:[],zuordnungsbasis:'Rohrfix GmbH\nHandwerkerweg 7\nRechnung\nLeistung am Testweg 42'};
 assert.equal((await zuordnen(db,b,{},'archiv:1',{owner:1})).felder.buchungskonto,'4100');
 assert.equal((await zuordnen(db,b,{},'archiv:1',{owner:2})).felder.buchungskonto,undefined);
 assert.equal((await zuordnen(db,b,{},'archiv:9',{owner:1})).felder.buchungskonto,undefined);
});
