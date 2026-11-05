'use strict';

const test = require('node:test');
const assert = require('node:assert');
const IBAN = require('../lib/iban');
const { openDatabase } = require('../db');
const adressen = require('../services/adressen');
const bank = require('../services/bank');

/** Gültige deutsche IBAN zu BLZ + Kontonummer bauen (Prüfziffern nach ISO 13616). */
function deIban(blz, konto) {
  const bban = blz + String(konto).padStart(10, '0');
  const zahl = (bban + '131400').split('').reduce((rest, z) => (rest * 10 + Number(z)) % 97, 0);
  return 'DE' + String(98 - zahl).padStart(2, '0') + bban;
}

test('IBAN: Bank und BIC aus der Bankleitzahlendatei, Plausibilitätsprüfung', async () => {
  const p = IBAN.pruefen('de89 3704 0044 0532 0130 00', '');
  assert.equal(p.fehler, null);
  assert.equal(p.blz, '37040044');
  assert.equal(p.bank.name, 'Commerzbank');
  assert.equal(p.bank.ort, 'Köln');
  assert.equal(p.bic_vorschlag, 'COBADEFFXXX');
  assert.equal(p.iban_format, 'DE89 3704 0044 0532 0130 00');

  const steinfurt = IBAN.pruefen(deIban('40351060', '1234567'));
  assert.equal(steinfurt.fehler, null);
  assert.deepEqual([steinfurt.bank.name, steinfurt.bank.ort, steinfurt.bic_vorschlag], ['Kreissparkasse Steinfurt', 'Ibbenbüren', 'WELADED1STF']);

  assert.match(IBAN.pruefen('DE89370400440532013001').fehler, /Prüfziffer/, 'Zahlendreher');
  assert.match(IBAN.pruefen('DE8937040044053201300').fehler, /22 Stellen/);
  assert.match(IBAN.pruefen(deIban('99999999', '1')).fehler, /Bankleitzahl 99999999 gibt es laut Bundesbank nicht/);
  assert.match(IBAN.pruefen('DE89370400440532013000', 'WELADED1STF').hinweise.join(), /passt nicht zur Bankleitzahl/);
  assert.equal(IBAN.pruefen('DE89370400440532013000', 'COBADEFF').hinweise.length, 0, '8-stellige BIC = XXX');
  assert.match(IBAN.pruefen('AT611904300234573201', 'COBADEFFXXX').hinweise.join(), /anderen Land/);
  assert.equal(IBAN.pruefen('AT611904300234573201').bank, null, 'Ausland: keine Bankermittlung');

  const geloescht = Object.keys(require('../lib/blz-daten.json').banken).find((b) => IBAN.blzInfo(b).geloescht);
  if (geloescht) assert.match(IBAN.pruefen(deIban(geloescht, '1')).hinweise.join(), /Löschung/);

  // Bankverbindung: BIC/Bank automatisch, doppelte IBAN, IBAN bei anderer Adresse, Mandat in der Zukunft
  const db = await openDatabase(':memory:');
  const a1 = await adressen.anlegen(db, { vorname: 'Swen', nachname: 'Trautmann' });
  const a2 = await adressen.anlegen(db, { vorname: 'Anna', nachname: 'Trautmann' });
  const iban = deIban('40351060', '727525');
  const b = await bank.anlegen(db, a1.id, { kontoinhaber: 'Swen Trautmann', iban });
  assert.equal(b.bic, 'WELADED1STF', 'BIC automatisch ergänzt');
  assert.equal(b.bankname, 'Kreissparkasse Steinfurt', 'Bank automatisch ergänzt');
  await assert.rejects(() => bank.anlegen(db, a1.id, { kontoinhaber: 'X', iban }), /bereits hinterlegt/);
  const b2 = await bank.anlegen(db, a2.id, { kontoinhaber: 'Anna Trautmann', iban, bankname: 'Eigene Angabe' });
  assert.equal(b2.bankname, 'Eigene Angabe', 'eingetragener Bankname bleibt');
  assert.match(b2.hinweise.join(), /auch hinterlegt bei: .*Swen Trautmann/);
  await assert.rejects(() => bank.anlegen(db, a2.id, { kontoinhaber: 'X', iban: deIban('37040044', '1'), mandatsreferenz: 'M1', mandat_datum: '2999-01-01' }), /Zukunft/);
  await db.close();
});
