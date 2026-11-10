'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const objekte = require('../services/objekte');
const vs = require('../services/versammlungen');

test('Versammlungen (ETV): anlegen, sortieren, suchen, archivieren, löschen', async () => {
  const db = await openDatabase(':memory:');
  const o1 = await objekte.anlegen(db, { nummer: '100446', bezeichnung: 'Schlosserstraße 34-38' });
  const o2 = await objekte.anlegen(db, { nummer: '100502', bezeichnung: 'Burgkstr. 12' });
  const a = await vs.anlegen(db, { objekt_id: o1.id, name: 'ETV - 2026', datum: '2026-10-14', uhrzeit: '18:00' });
  const b = await vs.anlegen(db, { objekt_id: o2.id, nummer: '27', name: 'ETV 2026', datum: '2026-09-27', uhrzeit: '12:00', art: 'hybrid', status: 'durchgefuehrt' });
  assert.equal(a.art, 'praesenz');
  assert.equal(a.status, 'vorbereitung');
  assert.equal(b.nummer, 27);
  assert.equal(b.objekt_nummer, '100502');
  assert.deepEqual((await vs.liste(db)).map((x) => x.id), [a.id, b.id], 'neueste zuerst');
  assert.deepEqual((await vs.liste(db, { sort: 'asc' })).map((x) => x.id), [b.id, a.id]);
  assert.deepEqual((await vs.liste(db, { suche: 'burgk' })).map((x) => x.id), [b.id], 'Suche im Objekt');
  assert.deepEqual((await vs.liste(db, { suche: '100446' })).map((x) => x.id), [a.id], 'Suche Objekt-ID');
  await assert.rejects(() => vs.anlegen(db, { objekt_id: o1.id, name: 'X' }), /Datum/);
  await assert.rejects(() => vs.anlegen(db, { objekt_id: 999, name: 'X', datum: '2026-01-01' }), /Objekt/);
  await assert.rejects(() => vs.anlegen(db, { objekt_id: o1.id, name: 'X', datum: '2026-01-01', uhrzeit: '25:00' }), /HH:MM/);
  await assert.rejects(() => vs.anlegen(db, { objekt_id: o1.id, name: 'X', datum: '2026-01-01', art: 'telepathie' }), /Art/);
  await vs.archivieren(db, b.id, true);
  assert.deepEqual((await vs.liste(db)).map((x) => x.id), [a.id]);
  assert.deepEqual((await vs.liste(db, { archiv: true })).map((x) => x.id), [b.id]);
  await vs.loeschen(db, a.id);
  assert.equal(await vs.holen(db, a.id), undefined);
  await db.close();
});

test('ETV-Versammlungsort: strukturierte Adresse bleibt beim Bearbeiten, Kopieren und Archivieren erhalten',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 const objekt=await objekte.anlegen(db,{bezeichnung:'Testobjekt'});
 const location={ort:'Gemeindesaal · Raum 2',ort_strasse:'Testweg 12',ort_plz:'01234',ort_stadt:'Musterstadt',ort_beschreibung:'Eingang im Hof, 1. Etage'};
 const v=await vs.anlegen(db,{objekt_id:objekt.id,name:'ETV Test',datum:'2026-11-20',...location});
 for(const [k,value] of Object.entries(location))assert.equal((await vs.holen(db,v.id))[k],value);
 const updated=await vs.aktualisieren(db,v.id,{name:'ETV geändert'});assert.equal(updated.ort_plz,'01234');
 for(const suche of ['01234','Musterstadt','Testweg','Eingang im Hof'])assert.equal((await vs.liste(db,{suche}))[0].id,v.id);
 const copy=await vs.anlegen(db,{...updated,name:'Kopie',datum:'2027-11-20'});assert.notEqual(copy.id,v.id);assert.equal(copy.ort_beschreibung,location.ort_beschreibung);
 await vs.archivieren(db,v.id,true);assert.equal((await vs.liste(db,{archiv:true}))[0].ort_strasse,location.ort_strasse);
 await assert.rejects(vs.aktualisieren(db,v.id,{ort_stadt:'x'.repeat(101)}),/zu lang/);
 const cleared=await vs.aktualisieren(db,v.id,{ort_strasse:'',ort_plz:'',ort_stadt:'',ort_beschreibung:''});assert.equal(cleared.ort_strasse,null);assert.equal(cleared.ort,location.ort);
});
test('ETV-Migration: bestehender freier Versammlungsort bleibt unverändert, neue Felder werden idempotent ergänzt',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 const objekt=await objekte.anlegen(db,{bezeichnung:'Altbestand'});
 const old=await vs.anlegen(db,{objekt_id:objekt.id,name:'Bestehende ETV',datum:'2026-11-20',ort:'Altes Rathaus, Saal 3'});
 for(const k of ['ort_strasse','ort_plz','ort_stadt','ort_beschreibung'])await db.run('ALTER TABLE versammlungen DROP COLUMN '+k);
 for(let i=0;i<2;i++)await require('../db/migrate').migrieren(db,':memory:');
 const restored=await vs.holen(db,old.id);assert.equal(restored.ort,'Altes Rathaus, Saal 3');assert.equal(restored.ort_stadt,null);assert.equal((await vs.liste(db)).length,1);
});
