'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const objekte = require('../services/objekte');
const einheiten = require('../services/einheiten');
const adressen = require('../services/adressen');
const zuordnungen = require('../services/zuordnungen');
const verteiler = require('../services/verteiler');
const objektbank = require('../services/objektbank');
const benutzer = require('../services/benutzer');
const zis = require('../services/zis');
const kontakte = require('../services/kontakte');

test('Objektmaske: Felder, Verteilerschlüssel, Bankkonten, Kennzahlen, Z.I.S', async () => {
  const db = await openDatabase(':memory:');
  const sb = await benutzer.anlegen(db, { benutzername: 'adawid', name: 'Alina Dawid', passwort: 'test12345', rolle: 'mitarbeiter' });
  const o = await objekte.anlegen(db, {
    nummer: '21350', bezeichnung: 'ACKERSTRAßE 77', objekttyp: 'MIETE', strasse: 'Ackerstraße 77', plz: '40233', ort: 'Düsseldorf',
    objekt_art: 'Mehrfamilienhaus eines Eigentümers', buero_kst: '20020', sachbearbeiter_id: sb.id,
    gruppe1: 'Düsseldorf', heizungsart: 'Gas-Zentral', anzahl_gebaeude: '1', anzahl_eingaenge: 2, verkauf: '1', vermietung: '0',
  });
  assert.equal(o.objekt_art, 'Mehrfamilienhaus eines Eigentümers');
  assert.equal(o.sachbearbeiter_name, 'Alina Dawid');
  assert.equal(o.anzahl_eingaenge, 2);
  assert.equal(o.vermietung, 0);
  await assert.rejects(() => objekte.anlegen(db, { bezeichnung: 'X', anzahl_gebaeude: '1.5' }), /ganze Zahl/);
  await assert.rejects(() => objekte.anlegen(db, { bezeichnung: 'X', sachbearbeiter_id: 999 }), /Sachbearbeiter/);
  const geaendert = await objekte.aktualisieren(db, o.id, { ...o, nummer: '', heizungsart: 'Fernwärme' });
  assert.equal(geaendert.nummer, '21350', 'Nummer bleibt');
  assert.equal(geaendert.heizungsart, 'Fernwärme');

  const e1 = await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 1', flaeche_qm: 60, mea: '400/1000' });
  const e2 = await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 2', flaeche_qm: 80.5, mea: '600/1000', einheitstyp: 'wohnung' });
  const fremd = await einheiten.anlegen(db, (await objekte.anlegen(db, { bezeichnung: 'Anderes' })).id, { bezeichnung: 'X' });

  const s200 = await verteiler.anlegen(db, o.id, { kuerzel: '200', bezeichnung: 'Einheiten Gesamtobjekt', gesamt: '2', anteile: [{ einheit_id: e1.id, anteil: '1' }, { einheit_id: e2.id, anteil: 1 }] });
  assert.equal(s200.anteile.length, 2);
  await verteiler.anlegen(db, o.id, { kuerzel: 'SWA', bezeichnung: 'Sonderschlüssel Schornsteinfeger', anteile: [{ einheit_id: e1.id, anteil: '518,7' }] });
  await verteiler.anlegen(db, o.id, { kuerzel: '500', bezeichnung: 'Personenschlüssel', gesamt: '14.600', anteile: [{ einheit_id: e1.id, anteil: '3' }] });
  let l = await verteiler.liste(db, o.id);
  assert.deepEqual(l.map((x) => x.kuerzel), ['200', '500', 'SWA'], 'Zahlen zuerst, dann Text');
  assert.equal(l[0].anteil, 2);
  assert.equal(l[0].abweichung, false);
  assert.equal(l[1].anteil, 14600, 'Tausenderpunkt/Komma deutsch');
  assert.equal(l[1].abweichung, true, 'Summe Einheiten ≠ Gesamt');
  assert.equal(l[2].anteil, 518.7, 'ohne Gesamt: Summe der Einheiten');
  await assert.rejects(() => verteiler.anlegen(db, o.id, { kuerzel: '200', bezeichnung: 'doppelt' }), /bereits/);
  await assert.rejects(() => verteiler.aktualisieren(db, s200.id, { kuerzel: '200', bezeichnung: 'x', anteile: [{ einheit_id: fremd.id, anteil: 1 }] }), /nicht zu diesem Objekt/);
  assert.equal((await verteiler.holen(db, s200.id)).bezeichnung, 'Einheiten Gesamtobjekt', 'Rollback bei Fehler');
  await verteiler.aktualisieren(db, s200.id, { kuerzel: '200', bezeichnung: 'Einheiten', gesamt: 2, anteile: [{ einheit_id: e2.id, anteil: '' }] });
  assert.equal((await verteiler.holen(db, s200.id)).anteile.filter((a) => a.anteil != null).length, 1, 'leerer Anteil entfernt');
  await verteiler.loeschen(db, s200.id);
  assert.equal((await verteiler.liste(db, o.id)).length, 2);

  const k1 = await objektbank.anlegen(db, o.id, { kontoart: 'hausgeld', kontoinhaber: 'WEG Ackerstraße 77', iban: 'DE89 3704 0044 0532 0130 00' });
  assert.equal(k1.standard, 1);
  const k2 = await objektbank.anlegen(db, o.id, { kontoart: 'ruecklage', kontoinhaber: 'WEG Ackerstraße 77', iban: 'AT611904300234573201', standard: 1 });
  assert.deepEqual((await objektbank.liste(db, o.id)).map((b) => [b.id, b.standard]), [[k2.id, 1], [k1.id, 0]]);
  await assert.rejects(() => objektbank.anlegen(db, o.id, { kontoinhaber: 'X', iban: 'DE00123' }), /ungültig/);
  await assert.rejects(() => objektbank.anlegen(db, o.id, { kontoinhaber: 'X', iban: 'DE89370400440532013000', kontoart: 'geheim' }), /Kontoart/);
  await objektbank.loeschen(db, k2.id);
  assert.equal((await objektbank.liste(db, o.id))[0].standard, 1);

  const a = await adressen.anlegen(db, { vorname: 'Luka', nachname: 'Vujica' });
  await zuordnungen.anlegen(db, { adresse_id: a.id, einheit_id: e1.id, rolle: 'eigentuemer', gueltig_von: '2020-01-01' });
  await zuordnungen.anlegen(db, { adresse_id: a.id, einheit_id: e1.id, rolle: 'mieter', gueltig_von: '2020-01-01' });
  const kz = await objekte.kennzahlen(db, o.id);
  assert.equal(kz.einheiten, 2);
  assert.equal(kz.flaeche_qm, 140.5);
  assert.equal(kz.mea_summe, 1000);
  assert.equal(kz.personen_je_rolle.eigentuemer, 1);
  assert.equal(kz.ohne_mieter, 1, 'WE 2 ohne Mieter');

  await kontakte.kontaktAnlegen(db, a.id, { art: 'anruf', betreff: 'Heizung kalt', zeitpunkt: '2026-10-01T09:00', einheit_nr: e1.nummer }, sb.id);
  const z = await zis.objektEintraege(db, o.id);
  assert.equal(z.gesamt, 1);
  assert.ok(z.eintraege[0].text.startsWith('Luka Vujica: Heizung kalt'));
  await db.close();
});
