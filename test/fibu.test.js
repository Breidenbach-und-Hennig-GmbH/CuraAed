'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const objekte = require('../services/objekte');
const fibu = require('../services/fibu');

test('FIBU Objekt: Grundwerte, Buchungsjahre, Kontenrahmen 1000–9999', async () => {
  const db = await openDatabase(':memory:');
  const weg = await objekte.anlegen(db, { nummer: '4010', bezeichnung: 'Engelsplatz', objekttyp: 'WEG' });
  const miete = await objekte.anlegen(db, { nummer: '18739', bezeichnung: 'Blumenstraße 45', objekttyp: 'MIETE' });

  assert.equal((await fibu.grundwerte(db, weg.id)).grundwerte, null, 'noch nicht eingerichtet');
  await assert.rejects(() => fibu.buchungsjahrAnlegen(db, weg.id), /Grundwerte/);
  let g = await fibu.grundwerteSpeichern(db, weg.id, { rechnungsart: 'bilanz', erstes_bj: '2024' });
  assert.equal(g.grundwerte.rechnungsart, 'eue', 'WEG immer Einnahmen-Überschuss');
  assert.deepEqual(g.jahre, [2024]);
  assert.equal((await fibu.grundwerteSpeichern(db, miete.id, { rechnungsart: 'bilanz', erstes_bj: 2025 })).grundwerte.rechnungsart, 'bilanz', 'Miete wählbar');
  await assert.rejects(() => fibu.grundwerteSpeichern(db, weg.id, { erstes_bj: '1800' }), /Jahr/);
  await assert.rejects(() => fibu.grundwerteSpeichern(db, weg.id, { erstes_bj: 2025, aktuelles_bj: 2024 }), /nicht vor/);

  const k1 = await fibu.kontoAnlegen(db, weg.id, { nummer: '1200', bezeichnung: 'Heizkosten Gesamtobjekt', jahr: 2024, wp_ansatz: '8.000,00' });
  await fibu.kontoAnlegen(db, weg.id, { nummer: 1000, bezeichnung: 'Hausmeister' });
  await assert.rejects(() => fibu.kontoAnlegen(db, weg.id, { nummer: 1200, bezeichnung: 'doppelt' }), /bereits/);
  await assert.rejects(() => fibu.kontoAnlegen(db, weg.id, { nummer: 999, bezeichnung: 'zu klein' }), /1000 bis 9999/);
  await assert.rejects(() => fibu.kontoAnlegen(db, weg.id, { nummer: 10000, bezeichnung: 'zu groß' }), /1000 bis 9999/);
  let liste = await fibu.konten(db, weg.id, 2024);
  assert.deepEqual(liste.map((k) => k.nummer), [1000, 1200], 'sortiert nach Konto-Nr.');
  assert.equal(liste[1].wp_ansatz, 8000);
  assert.equal(liste[1].saldo, null, 'ohne Buchungen: kB');

  g = await fibu.buchungsjahrAnlegen(db, weg.id);
  assert.deepEqual(g.jahre, [2024, 2025]);
  assert.equal((await fibu.konten(db, weg.id, 2025))[1].wp_ansatz, 8000, 'WP-Ansatz ins neue Jahr übernommen');
  await fibu.kontoAendern(db, k1.id, { nummer: 1200, bezeichnung: 'Heizkosten', jahr: 2025, wp_ansatz: '8.500' });
  assert.equal((await fibu.konten(db, weg.id, 2025))[1].wp_ansatz, 8500);
  assert.equal((await fibu.konten(db, weg.id, 2024))[1].wp_ansatz, 8000, 'Vorjahr unverändert');

  assert.equal((await fibu.kontenKopieren(db, miete.id, weg.id)).uebernommen, 2);
  assert.equal((await fibu.kontenKopieren(db, miete.id, weg.id)).uebernommen, 0, 'keine Doppelten');
  const v = await fibu.kontenAusVorlage(db, miete.id);
  assert.equal(v.vorlage, 43);
  assert.equal(v.uebernommen, 42, 'nur fehlende Konten – 1200 existiert schon');
  const mk = await fibu.konten(db, miete.id, 2025);
  assert.equal(mk.find((k) => k.nummer === 8100).art, 'B', 'Bankkonto');
  assert.equal(mk.find((k) => k.nummer === 9930).art, 'A');
  assert.equal(mk.find((k) => k.nummer === 1200).bezeichnung, 'Heizkosten', 'bestehende Konten werden nicht überschrieben');
  await fibu.kontoLoeschen(db, k1.id);
  assert.equal((await fibu.konten(db, weg.id, 2025)).length, 1);
  await db.close();
});
