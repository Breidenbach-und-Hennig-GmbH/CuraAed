'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const adressen = require('../services/adressen');
const bank = require('../services/bank');

test('Bank: IBAN-Prüfziffer, Standard-Verbindung, SEPA-Mandat', async () => {
  // Offizielle Beispiel-IBANs
  assert.equal(bank.ibanGueltig('DE89370400440532013000'), true);
  assert.equal(bank.ibanGueltig('DE89370400440532013001'), false, 'falsche Prüfziffer');
  assert.equal(bank.ibanGueltig('DE8937040044053201300'), false, 'falsche Länge');
  assert.equal(bank.ibanGueltig('AT611904300234573201'), true);

  const db = await openDatabase(':memory:');
  const a = await adressen.anlegen(db, { vorname: 'Luka', nachname: 'Vujica' });
  const b1 = await bank.anlegen(db, a.id, { kontoinhaber: 'Luka Vujica', iban: 'de89 3704 0044 0532 0130 00', bic: 'cobadeffxxx' });
  assert.equal(b1.iban, 'DE89370400440532013000', 'IBAN normalisiert');
  assert.equal(b1.bic, 'COBADEFFXXX');
  assert.equal(b1.standard, 1, 'erste Verbindung ist Standard');
  const b2 = await bank.anlegen(db, a.id, {
    kontoinhaber: 'Luka Vujica', iban: 'AT611904300234573201', standard: 1,
    mandatsreferenz: 'WEG18505-0001', mandat_datum: '2024-06-01', mandat_aktiv: 1,
  });
  let l = await bank.liste(db, a.id);
  assert.deepEqual(l.map((x) => [x.id, x.standard]), [[b2.id, 1], [b1.id, 0]], 'nur eine Standard-Verbindung');
  await bank.loeschen(db, b2.id);
  l = await bank.liste(db, a.id);
  assert.equal(l[0].standard, 1, 'nach Löschen wird die nächste Standard');

  await assert.rejects(() => bank.anlegen(db, a.id, { kontoinhaber: 'X', iban: 'DE00123' }), /ungültig/);
  await assert.rejects(() => bank.anlegen(db, a.id, { kontoinhaber: 'X', iban: 'DE89370400440532013000', bic: 'FOO' }), /BIC/);
  await assert.rejects(() => bank.anlegen(db, a.id, { kontoinhaber: 'X', iban: 'DE89370400440532013000', mandat_aktiv: 1 }), /Mandatsreferenz und Unterschriftsdatum/);
  await assert.rejects(() => bank.anlegen(db, a.id, { kontoinhaber: 'X', iban: 'DE89370400440532013000', mandatsreferenz: 'ä<script>' }), /Mandatsreferenz/);
  await db.close();
});
