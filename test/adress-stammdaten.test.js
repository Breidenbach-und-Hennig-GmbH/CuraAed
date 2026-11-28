'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('../services/adressStammdaten'),{openDatabase}=require('../db'),adressen=require('../services/adressen');

test('Namensangaben liefern vollständige Such- und Briefanrede, individuelle Werte bleiben erhalten',()=>{
 const data=A.validieren({anrede:'Herr',titel:'Dr.',vorname:'Jörg',nachname:'Müller'});
 assert.equal(data.suchbegriff,'MÜLLER, JÖRG');assert.equal(data.briefanrede1,'Sehr geehrter Herr Dr. Müller,');assert.equal(data.land,'DE');
 assert.equal(A.vorbereiten({...data,nachname:'Schmidt'},data).briefanrede1,'Sehr geehrter Herr Dr. Schmidt,');
 assert.equal(A.vorbereiten({...data,suchbegriff:'MEIN SUCHBEGRIFF',briefanrede1:'Lieber Jörg,'},data).briefanrede1,'Lieber Jörg,');
 const neutral=A.validieren({vorname:'Alex',nachname:'Test'});assert.equal(neutral.anrede,undefined);assert.equal(neutral.briefanrede1,'Guten Tag Alex Test,');assert.equal(neutral.geburtstag,undefined);
 const company=A.validieren({adresstyp:'firma',firmenname:'Firma GmbH'});assert.equal(company.anrede,'Firma');assert.equal(company.briefanrede1,'Sehr geehrte Damen und Herren,');
});

test('Alle zusätzlichen Stammdaten werden gespeichert, wieder geladen und als HP-Felder vorbereitet',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());const data={nachname:'Müller',vorname:'Jörg',anrede:'Herr',titel:'Dr.',name3:'Zusatz 3',beruf:'Ingenieur',geburtsname:'Alt',geburtstag:'1980-02-29',geburtstag2:'1981-03-01',sterbedatum1:'2020-01-01',sterbedatum2:'2021-01-01',...Object.fromEntries(Array.from({length:10},(_,i)=>['sonderfunktion'+(i+1),String(i+1).padStart(3,'0')]))};
 const saved=await adressen.anlegen(db,data),again=await adressen.holen(db,saved.id);for(const key of Object.keys(data))assert.equal(again[key],data[key],key);
 const hp=A.hpStamm(again);assert.equal(hp.SBegrAdr,'MÜLLER, JÖRG');assert.equal(hp.Titel,'Dr.');assert.equal(hp.Name3,'Zusatz 3');assert.equal(hp.SF10,'010');assert.equal(hp.GebDat1,'722874');assert.equal(hp.BriefAnZeil1,'Sehr geehrter Herr Dr. Müller,');
 await adressen.aktualisieren(db,saved.id,{nachname:'Schmidt'});assert.equal((await adressen.holen(db,saved.id)).suchbegriff,'SCHMIDT, JÖRG');
 assert.equal((await adressen.liste(db,{suche:'SCHMIDT, JÖRG'}))[0].id,saved.id);
});

test('Ungültige Kalenderdaten, zu lange Felder und Steuerzeichen werden abgewiesen',()=>{
 for(const name of ['geburtstag','geburtstag2','sterbedatum1','sterbedatum2'])for(const value of ['2025-02-29','0000-01-01','2025-13-01'])assert.throws(()=>A.validieren({nachname:'Test',[name]:value}),/Datum/);
 assert.throws(()=>A.validieren({nachname:'Test',sonderfunktion1:'1234'}),/lang/);assert.throws(()=>A.validieren({nachname:'Test',titel:'A\nB'}),/Zeichen/);
});

test('Vorhandene importierte HP-Zusatzfelder werden ohne Datenbankzugriff auf HP aus dem lokalen Bestand gelesen',async()=>{
 const db={get:async()=>({rohdaten:JSON.stringify([{SBegrAdr:'CUSTOM',Titel:'Dr.',Name3:'Dritte Zeile',SF1:'001',GebDat1:'722874',GebDat2:'722874'}])})};const result=await A.ausHP(db,{id:1,nachname:'Test',titel:null,suchbegriff:null});assert.equal(result.suchbegriff,'CUSTOM');assert.equal(result.titel,'Dr.');assert.equal(result.geburtstag,'1980-02-29');assert.equal(result.geburtstag2,'1980-02-29');
 assert.equal((await A.ausHP(db,{id:1,nachname:'Test',titel:'Prof.'})).titel,'Prof.');
});
