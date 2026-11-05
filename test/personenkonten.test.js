'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const objekte = require('../services/objekte');
const einheiten = require('../services/einheiten');
const adressen = require('../services/adressen');
const zuordnungen = require('../services/zuordnungen');
const bank = require('../services/bank');
const verteiler = require('../services/verteiler');
const pkto = require('../services/personenkonten');
const pfktCodes = require('../services/pfktCodes');

test('Personenkonten: Nummer, Sollwerte (W.Soll), Stammdaten aus Adresse/Wohnung', async () => {
  const db = await openDatabase(':memory:');
  const o = await objekte.anlegen(db, { nummer: '18059', bezeichnung: 'AM STEINBERG 49' });
  const e1 = await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 1' });
  const e2 = await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 2', lage: 'Souterrain re+PP I', flaeche_qm: 68 });
  const swen = await adressen.anlegen(db, { anrede: 'Herr', vorname: 'Swen A.', nachname: 'Trautmann', ort: 'Ibbenbüren' });
  const mieter = await adressen.anlegen(db, { nachname: 'Schwiese' });
  await bank.anlegen(db, swen.id, { kontoinhaber: 'Trautmann, Dr. med. Swen A.', iban: 'DE89370400440532013000', mandatsreferenz: 'A029679BV001FNR01', mandat_datum: '2021-01-01', mandat_aktiv: 1 });
  await verteiler.anlegen(db, o.id, { kuerzel: '100', bezeichnung: 'qm-Wohnfläche Gesamtobjekt', anteile: [{ einheit_id: e2.id, anteil: '68' }] });
  const alle = await pfktCodes.liste(db);
  assert.equal(alle.length, 340, 'Schlüsseltabelle PFkt aus HausPerfekt übernommen');
  assert.deepEqual(['001', '002', '007', '014', '050', '308'].map((c) => { const x = alle.find((y) => y.code === c); return `${c}:${x.rolle}:${x.kennz || ''}`; }),
    ['001:eigentuemer:E', '002:eigentuemer:E', '007:mieter:M', '014:mieter:L', '050:beirat:', '308:handwerker:']);
  await assert.rejects(() => zuordnungen.anlegen(db, { adresse_id: swen.id, einheit_id: e2.id, rolle: 'mieter', pfkt_code: '002' }), /passt nicht/);
  await assert.rejects(() => zuordnungen.anlegen(db, { adresse_id: swen.id, einheit_id: e2.id, rolle: 'eigentuemer', pfkt_code: '9-X' }), /Ungültiger/);
  await assert.rejects(() => zuordnungen.anlegen(db, { adresse_id: swen.id, einheit_id: e2.id, rolle: 'eigentuemer', pfkt_code: '036' }), /gibt es nicht/);
  const zEt = await zuordnungen.anlegen(db, { adresse_id: swen.id, einheit_id: e2.id, rolle: 'eigentuemer', pfkt_code: '002', gueltig_von: '1990-01-01' });
  const zMi = await zuordnungen.anlegen(db, { adresse_id: mieter.id, einheit_id: e2.id, rolle: 'mieter', gueltig_von: '1990-01-01' });
  const zObj = await zuordnungen.anlegen(db, { adresse_id: mieter.id, objekt_id: o.id, rolle: 'beirat' });

  let liste = await pkto.nachEinheit(db, e2.id);
  assert.equal(liste.length, 2);
  assert.ok(liste.every((x) => x.pkto_id === null && x.mit_pkto), 'noch keine Konten');

  const k = await pkto.anlegen(db, { zuordnung_id: zEt.id });
  assert.equal(k.pkto_nummer, '20002', 'Personenfunktion 002 (fremdvermietet) + Wechsler 0 + Einheit 002');
  assert.equal(k.pfkt_bezeichnung, 'Eigentümer -fremdvermietet-');
  await assert.rejects(() => pkto.anlegen(db, { zuordnung_id: zMi.id }), /Personenfunktion wählen/);
  const km = await pkto.anlegen(db, { zuordnung_id: zMi.id, pfkt_code: '007' });
  assert.equal(km.pkto_nummer, '70002', 'Code beim Anlegen gewählt');
  // Eigentümerwechsel: nächster Eigentümer (fremdvermietet) derselben Einheit → Wechsler 1
  const neuEt = await adressen.anlegen(db, { nachname: 'Nachfolger' });
  const zEt2 = await zuordnungen.anlegen(db, { adresse_id: neuEt.id, einheit_id: e2.id, rolle: 'eigentuemer', pfkt_code: '002', gueltig_von: '2027-01-01' });
  assert.equal((await pkto.anlegen(db, { zuordnung_id: zEt2.id })).pkto_nummer, '21002', 'zweiter Eigentümer = Wechsler 1');
  const selbst = await zuordnungen.anlegen(db, { adresse_id: neuEt.id, einheit_id: e1.id, rolle: 'eigentuemer', pfkt_code: '001' });
  assert.equal((await pkto.anlegen(db, { zuordnung_id: selbst.id })).pkto_nummer, '10001', '001 eigengenutzt, Einheit 001');
  await assert.rejects(() => pfktCodes.loeschen(db, '002'), /verwendet/);
  await assert.rejects(() => pkto.anlegen(db, { zuordnung_id: zEt.id }), /bereits ein Personenkonto/);
  await assert.rejects(() => pkto.anlegen(db, { zuordnung_id: zObj.id }), /Wohnung/);
  await assert.rejects(() => pkto.aendern(db, km.pkto_id, { nummer: '20002' }), /bereits vergeben/);
  await assert.rejects(() => pkto.aendern(db, km.pkto_id, { nummer: '12a' }), /Ziffern/);

  await pkto.sollAnlegen(db, k.pkto_id, { gilt_ab: '2025-01-01', bezeichnung: 'Hausgeld', netto: '400,00' });
  await pkto.sollAnlegen(db, k.pkto_id, { gilt_ab: '2026-07-01', bezeichnung: 'Hausgeld', netto: '440,00', betrag: '440,00' });
  await pkto.sollAnlegen(db, k.pkto_id, { gilt_ab: '2099-01-01', bezeichnung: 'Hausgeld', netto: '999' });
  await assert.rejects(() => pkto.sollAnlegen(db, k.pkto_id, { bezeichnung: 'x', netto: 1 }), /Gilt ab/);
  const d = await pkto.holen(db, k.pkto_id);
  assert.equal(d.soll.betrag, 440, 'aktuell gültiger Sollwert (ab 01.07.2026), künftiger zählt noch nicht');
  assert.equal(d.sollwerte.length, 3);
  assert.equal(d.adresse.vorname, 'Swen A.');
  assert.equal(d.bank.mandatsreferenz, 'A029679BV001FNR01');
  assert.deepEqual(d.verteiler.map((v) => [v.kuerzel, v.anteil]), [['100', 68]]);
  assert.equal(d.lage, 'Souterrain re+PP I');
  assert.equal(d.offene_posten, 0);
  liste = await pkto.nachEinheit(db, e2.id);
  assert.equal(liste.find((x) => x.pkto_id === k.pkto_id).soll.betrag, 440);
  assert.deepEqual((await pkto.nachAdresse(db, swen.id)).map((x) => x.pkto_nummer), ['20002']);
  assert.equal((await pkto.nachObjekt(db, o.id)).length, 4);
  await assert.rejects(() => zuordnungen.loeschen(db, zEt.id), /Beenden/);
  assert.equal(e1.objekt_id, o.id);
  await db.close();
});
