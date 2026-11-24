'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../db');
const objekte = require('../services/objekte');

test('Objektliste zeigt HP-Nummern ohne Präfix und sortiert numerisch, ohne Zuordnungen zu verändern', async t => {
  const db = await openDatabase(':memory:');
  t.after(() => db.close());
  const nummern = ['HP-a75beb7-100419', 'HP-abcdef01-10017', 'HP-a75beb7-10009', '9', 'HP-abcdef01-2', 'B-12'];
  for (const nummer of nummern) await db.run('INSERT INTO objekte(nummer, bezeichnung) VALUES (?, ?)', [nummer, 'Testobjekt']);
  const vorher = await db.all('SELECT id, nummer FROM objekte ORDER BY id');
  const liste = await objekte.liste(db);
  assert.deepEqual(liste.map(o => o.anzeigenummer), ['2', '9', '10009', '10017', '100419', 'B-12']);
  assert.deepEqual(await db.all('SELECT id, nummer FROM objekte ORDER BY id'), vorher);
  assert.equal(liste.find(o => o.anzeigenummer === '10009').nummer, 'HP-a75beb7-10009');
  assert.equal((await objekte.liste(db, { suche: '10017' }))[0].anzeigenummer, '10017');
  const id = liste.find(o => o.anzeigenummer === '10009').id;
  const detail = await objekte.holen(db, id);
  assert.equal(detail.anzeigenummer, '10009');
  assert.equal(detail.nummer, 'HP-a75beb7-10009', 'Detail behält die interne Importkennung für Bearbeitung und Zuordnungen');
});
