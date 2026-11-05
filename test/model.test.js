'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');

const objekte = require('../services/objekte');
const einheiten = require('../services/einheiten');
const adressen = require('../services/adressen');
const zuordnungen = require('../services/zuordnungen');
const archiv = require('../services/archiv');
const benutzer = require('../services/benutzer');

async function frischeDb() {
  return openDatabase(':memory:');
}

test('Objekte: anlegen, WEG/Miete unterscheiden, suchen, archivieren', async () => {
  const db = await frischeDb();
  const weg = await objekte.anlegen(db, {
    bezeichnung: 'Musterstraße 1',
    objekttyp: 'WEG',
    ort: 'Köln',
    plz: '50667',
  });
  assert.equal(weg.objekttyp, 'WEG');
  const miete = await objekte.anlegen(db, { bezeichnung: 'Miethaus Nord', objekttyp: 'MIETE' });
  assert.equal(miete.objekttyp, 'MIETE');

  const alle = await objekte.liste(db, {});
  assert.equal(alle.length, 2);

  const nurWeg = await objekte.liste(db, { objekttyp: 'WEG' });
  assert.equal(nurWeg.length, 1);

  const gefunden = await objekte.liste(db, { suche: 'köln' });
  assert.equal(gefunden.length, 1);
  assert.equal(gefunden[0].id, weg.id);

  await objekte.setzeArchiviert(db, weg.id, true);
  const aktiv = await objekte.liste(db, {});
  assert.equal(aktiv.length, 1);
  const archiviert = await objekte.liste(db, { archiviert: true });
  assert.equal(archiviert.length, 1);

  await assert.rejects(() => objekte.anlegen(db, { bezeichnung: '' }), /erforderlich/);
  await assert.rejects(() => objekte.anlegen(db, { bezeichnung: 'X', objekttyp: 'FOO' }), /Ungültig/);
  await db.close();
});

test('Einheiten: beliebig viele je Objekt, Typen, Kaskade beim Objekt', async () => {
  const db = await frischeDb();
  const o = await objekte.anlegen(db, { bezeichnung: 'Haus A' });
  for (let i = 1; i <= 5; i++) {
    await einheiten.anlegen(db, o.id, { bezeichnung: `WE ${i}`, einheitstyp: 'wohnung' });
  }
  await einheiten.anlegen(db, o.id, { bezeichnung: 'TG 1', einheitstyp: 'stellplatz' });
  const liste = await einheiten.listeNachObjekt(db, o.id);
  assert.equal(liste.length, 6);

  await assert.rejects(() => einheiten.anlegen(db, 9999, { bezeichnung: 'X' }), /nicht gefunden/);

  // Kaskade: Einheiten verschwinden mit dem Objekt
  await db.run('DELETE FROM objekte WHERE id = ?', [o.id]);
  const nach = await einheiten.listeNachObjekt(db, o.id);
  assert.equal(nach.length, 0);
  await db.close();
});

test('Adressen: zentral anlegen (Person/Firma), mehrfach verknüpfbar', async () => {
  const db = await frischeDb();
  const person = await adressen.anlegen(db, {
    adresstyp: 'person',
    vorname: 'Anna',
    nachname: 'Muster',
    email: 'anna@example.de',
  });
  assert.equal(person.anzeigename, 'Anna Muster');
  const firma = await adressen.anlegen(db, { adresstyp: 'firma', firmenname: 'Bau GmbH' });
  assert.equal(firma.anzeigename, 'Bau GmbH');

  await assert.rejects(() => adressen.anlegen(db, { adresstyp: 'firma' }), /Firmenname/);
  await assert.rejects(() => adressen.anlegen(db, { adresstyp: 'person', vorname: 'Nur' }), /Nachname/);

  const treffer = await adressen.liste(db, { suche: 'anna@example' });
  assert.equal(treffer.length, 1);
  await db.close();
});

test('Zuordnungen: eine Adresse trägt mehrere Rollen an mehreren Objekten/Einheiten', async () => {
  const db = await frischeDb();
  const o1 = await objekte.anlegen(db, { bezeichnung: 'Objekt 1' });
  const o2 = await objekte.anlegen(db, { bezeichnung: 'Objekt 2' });
  const e1 = await einheiten.anlegen(db, o1.id, { bezeichnung: 'WE 1' });
  const a = await adressen.anlegen(db, { vorname: 'Max', nachname: 'Meier' });

  // gleiche Adresse: Eigentümer an Objekt 1, Beirat an Objekt 2, Mieter an Einheit
  await zuordnungen.anlegen(db, { adresse_id: a.id, objekt_id: o1.id, rolle: 'eigentuemer' });
  await zuordnungen.anlegen(db, { adresse_id: a.id, objekt_id: o2.id, rolle: 'beirat' });
  await zuordnungen.anlegen(db, { adresse_id: a.id, einheit_id: e1.id, rolle: 'mieter' });

  const rollen = await zuordnungen.nachAdresse(db, a.id);
  assert.equal(rollen.length, 3);
  const rollennamen = rollen.map((r) => r.rolle).sort();
  assert.deepEqual(rollennamen, ['beirat', 'eigentuemer', 'mieter']);

  // Einheit-Zuordnung leitet Objektbezug automatisch ab
  const anEinheit = rollen.find((r) => r.rolle === 'mieter');
  assert.equal(anEinheit.objekt_id, o1.id);

  // Objektbezug muss vorhanden sein
  await assert.rejects(() => zuordnungen.anlegen(db, { adresse_id: a.id, rolle: 'mieter' }), /Objekt oder eine Einheit/);
  await db.close();
});

test('Mieterwechsel: Historie bleibt erhalten, aktiv/inaktiv per Stichtag', async () => {
  const db = await frischeDb();
  const o = await objekte.anlegen(db, { bezeichnung: 'Haus' });
  const e = await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 1' });
  const altmieter = await adressen.anlegen(db, { vorname: 'Alt', nachname: 'Mieter' });
  const neumieter = await adressen.anlegen(db, { vorname: 'Neu', nachname: 'Mieter' });

  const z1 = await zuordnungen.anlegen(db, {
    adresse_id: altmieter.id,
    einheit_id: e.id,
    rolle: 'mieter',
    gueltig_von: '2020-01-01',
  });
  // Wechsel: alten Mieter beenden, neuen ab Folgetag
  await zuordnungen.beenden(db, z1.id, '2023-12-31');
  await zuordnungen.anlegen(db, {
    adresse_id: neumieter.id,
    einheit_id: e.id,
    rolle: 'mieter',
    gueltig_von: '2024-01-01',
  });

  // Historie vollständig vorhanden (nichts gelöscht)
  const alle = await zuordnungen.nachEinheit(db, e.id);
  assert.equal(alle.length, 2);

  // Stichtag 2022: alter Mieter aktiv, neuer noch nicht
  const in2022 = await zuordnungen.nachEinheit(db, e.id, { stichtag: '2022-06-01' });
  const altAktiv = in2022.find((z) => z.adresse_id === altmieter.id);
  const neuAktiv = in2022.find((z) => z.adresse_id === neumieter.id);
  assert.equal(altAktiv.aktiv, true);
  assert.equal(neuAktiv.aktiv, false);

  // Stichtag 2024: umgekehrt
  const in2024 = await zuordnungen.nachEinheit(db, e.id, { stichtag: '2024-06-01' });
  assert.equal(in2024.find((z) => z.adresse_id === altmieter.id).aktiv, false);
  assert.equal(in2024.find((z) => z.adresse_id === neumieter.id).aktiv, true);

  // Datumslogik: Ende vor Beginn wird abgelehnt
  await assert.rejects(
    () => zuordnungen.anlegen(db, { adresse_id: neumieter.id, einheit_id: e.id, rolle: 'mieter', gueltig_von: '2025-01-01', gueltig_bis: '2024-01-01' }),
    /nicht vor/
  );
  await db.close();
});

test('Benutzer/Auth: Passwort-Hashing (bcrypt) und Anmeldeprüfung', async () => {
  const db = await frischeDb();
  const u = await benutzer.anlegen(db, {
    benutzername: 'MaxAdmin',
    name: 'Max Admin',
    passwort: 'geheim1234',
    rolle: 'admin',
  });
  assert.equal(u.benutzername, 'maxadmin');
  assert.equal(u.passwort_hash, undefined, 'Hash darf nicht nach außen gelangen');

  const roh = await benutzer.holenPerName(db, 'maxadmin');
  assert.notEqual(roh.passwort_hash, 'geheim1234', 'Passwort darf nicht im Klartext gespeichert werden');
  assert.match(roh.passwort_hash, /^\$2[aby]\$/, 'muss ein bcrypt-Hash sein');

  assert.ok(await benutzer.pruefeAnmeldung(db, 'maxadmin', 'geheim1234'));
  assert.equal(await benutzer.pruefeAnmeldung(db, 'maxadmin', 'falsch'), null);

  await assert.rejects(() => benutzer.anlegen(db, { benutzername: 'a', name: 'A', passwort: 'kurz' }), /8 Zeichen/);
  await assert.rejects(
    () => benutzer.anlegen(db, { benutzername: 'MaxAdmin', name: 'X', passwort: 'langgenug1' }),
    /bereits vergeben/
  );
  await db.close();
});
