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
