'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const objekte = require('../services/objekte');
const fibu = require('../services/fibu');
const imp = require('../services/kontenImport');

// Aufbau wie HausPerfekt-Export „Kontenrahmen" (StS und Eg stehen in einer Zelle)
const HP_CSV = [
  'Konto Nr;Bezeichnung;E;StS ;Eg;Mi;DE;JA;WP;S;F;Abr;GuV;Bil;Hn.DL;AA EG;MI ;VS EG;Typ;Art;VS MI;Typ;Art;BS;Referenz-Konto ;virt.Kto',
  '  1000 S;Hausmeister   ;N;000  J ;J ;N ;J ;J ;N;N;J  ;J  ;N  ;3;1;1;300;W  ;0;300;W  ;0;N ;0;0',
  '  1200 S;Heizkosten Gesamtobjekt;N;000  J ;J ;N ;N ;J ;N;N;J  ;J  ;N  ;0;1;1;HK0  ;P  ;0;HK0  ;P  ;0;N ;0;0',
  '  8100 B;WEG Giro Konto 1;N;000  N ;N ;N ;N ;N ;N;N;J  ;N  ;J  ;0;     ;   ;     ;   ;0;     ;   ;0;N ;0;0',
  '10001 K;HORN, DAGMAR;N;000  N ;N ;N ;N ;N ;N;N;N  ;N  ;J  ;0;;;;;0;;;0;N ;0;0',
  '921364 L;DIE HAFTPFLICHTKASSE VVAG;N;000  N ;N ;N ;N ;N ;N;N;N  ;N  ;J  ;0;;;;;0;;;0;N ;0;0',
].join('\r\n');

test('Kontenrahmen-Import aus HausPerfekt-Export (CSV/Excel)', async () => {
  const db = await openDatabase(':memory:');
  const o = await objekte.anlegen(db, { nummer: '4010', bezeichnung: 'Engelsplatz' });
  await fibu.kontoAnlegen(db, o.id, { nummer: 1000, bezeichnung: 'Hausmeister alt' });

  const probe = await imp.importieren(db, o.id, Buffer.from(HP_CSV, 'latin1'), { ausfuehren: false });
  assert.equal(probe.gesamt, 3);
  assert.deepEqual([probe.neu, probe.aktualisiert], [2, 1]);
  assert.deepEqual(probe.uebersprungen.map((u) => [u.art, u.anzahl]), [['K', 1], ['L', 1]]);
  assert.equal((await fibu.konten(db, o.id)).length, 1, 'Prüfen speichert nichts');

  const r = await imp.importieren(db, o.id, Buffer.from(HP_CSV, 'latin1'), { ausfuehren: true });
  assert.equal(r.ausgefuehrt, true);
  const konten = await fibu.konten(db, o.id);
  assert.deepEqual(konten.map((k) => [k.nummer, k.art]), [[1000, 'S'], [1200, 'S'], [8100, 'B']]);
  const hm = konten[0];
  assert.equal(hm.bezeichnung, 'Hausmeister', 'vorhandenes Konto aktualisiert');
  assert.deepEqual([hm.vs_eg, hm.vs_mi], ['300', '300']);
  const attr = JSON.parse(hm.hp_attribute);
  assert.deepEqual([attr.StS, attr.Eg, attr.Mi, attr['Hn.DL'], attr['Typ EG']], ['000', 'J', 'J', '3', 'W'], 'StS/Eg-Zelle korrekt getrennt');
  assert.equal(konten[1].vs_eg, 'HK0');

  const nochmal = await imp.importieren(db, o.id, Buffer.from(HP_CSV, 'latin1'), { ausfuehren: true });
  assert.deepEqual([nochmal.neu, nochmal.aktualisiert, nochmal.unveraendert], [0, 0, 3], 'zweiter Import ändert nichts');

  // Einfache Liste (eigene Excel/CSV): Konto-Nr.; Bezeichnung
  const einfach = await imp.importieren(db, o.id, Buffer.from('﻿Konto-Nr.;Bezeichnung\n2100;Gebäudeversicherung\n999;zu klein\n', 'utf8'), { ausfuehren: true });
  assert.equal(einfach.neu, 1);
  assert.match(einfach.fehler.join(), /999 liegt außerhalb/);
  await assert.rejects(() => imp.importieren(db, o.id, Buffer.from('a;b\n1;2'), { ausfuehren: false }), /Kopfzeile/);
  await assert.rejects(() => imp.importieren(db, o.id, Buffer.from('PK\u0003\u0004kaputt'), { ausfuehren: false }), /nicht gelesen werden/);
  await db.close();
});
