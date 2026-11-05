'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { openDatabase } = require('../db');

const objekte = require('../services/objekte');
const einheiten = require('../services/einheiten');
const adressen = require('../services/adressen');
const archiv = require('../services/archiv');

const datei = (n) => ({ original_name: `${n}.pdf`, speicher_name: `${n}.pdf`, mime_type: 'application/pdf' });

test('Nummern: automatische Vergabe, manuelle Nummer, Eindeutigkeit', async () => {
  const db = await openDatabase(':memory:');
  const o1 = await objekte.anlegen(db, { bezeichnung: 'Haus A' });
  const o2 = await objekte.anlegen(db, { bezeichnung: 'Haus B' });
  assert.equal(o1.nummer, '1001');
  assert.equal(o2.nummer, '1002');

  const o3 = await objekte.anlegen(db, { bezeichnung: 'Haus C', nummer: '4010' });
  assert.equal(o3.nummer, '4010');
  assert.equal((await objekte.anlegen(db, { bezeichnung: 'Haus D' })).nummer, '4011');

  await assert.rejects(() => objekte.anlegen(db, { bezeichnung: 'X', nummer: '4010' }), (e) => e.status === 409);
  await assert.rejects(() => objekte.anlegen(db, { bezeichnung: 'X', nummer: 'a b' }), /Ungültige Objekt-Nr/);

  const e1 = await einheiten.anlegen(db, o1.id, { bezeichnung: 'WE 1' });
  const e2 = await einheiten.anlegen(db, o1.id, { bezeichnung: 'WE 2' });
  assert.equal(e1.nummer, '1001-01');
  assert.equal(e2.nummer, '1001-02');

  const a1 = await adressen.anlegen(db, { nachname: 'Muster' });
  assert.equal(a1.nummer, '10001');

  // Bearbeiten ohne Nummer behält die bisherige
  const geaendert = await objekte.aktualisieren(db, o1.id, { bezeichnung: 'Haus A neu' });
  assert.equal(geaendert.nummer, '1001');
  await assert.rejects(() => objekte.aktualisieren(db, o1.id, { bezeichnung: 'A', nummer: '1002' }), (e) => e.status === 409);
  await db.close();
});

test('Archiv: Eintrag über Nummern mehreren Objekten/Einheiten/Adressen zuordnen', async () => {
  const db = await openDatabase(':memory:');
  const o = await objekte.anlegen(db, { bezeichnung: 'Engelsplatz', nummer: '4010' });
  const e = await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 1' }); // 4010-01
  const a = await adressen.anlegen(db, { vorname: 'Erika', nachname: 'Muster' }); // 10001
  const o2 = await objekte.anlegen(db, { bezeichnung: 'Anderes Haus' });

  const d = await archiv.anlegen(
    db,
    { titel: 'Schreiben an Eigentümerin', kategorie: 'korrespondenz', dokument_datum: '2026-03-01', ...datei('a') },
    { einheit: '4010-01', adresse: '10001' }
  );
  assert.equal(d.verknuepfungen.length, 2);
  assert.deepEqual(d.verknuepfungen.map((v) => v.typ).sort(), ['adresse', 'einheit']);

  // Objekt-Archiv enthält auch Einträge seiner Einheiten
  assert.equal((await archiv.liste(db, { objektId: o.id })).eintraege.length, 1);
  assert.equal((await archiv.liste(db, { einheitId: e.id })).eintraege.length, 1);
  assert.equal((await archiv.liste(db, { adresseId: a.id })).eintraege.length, 1);
  assert.equal((await archiv.liste(db, { objektId: o2.id })).eintraege.length, 0);

  // Nachträglich zuordnen (Groß-/Kleinschreibung egal), Duplikat → 409
  await archiv.verknuepfen(db, d.id, 'objekt', o2.nummer);
  assert.equal((await archiv.liste(db, { objektId: o2.id })).eintraege.length, 1);
  await assert.rejects(() => archiv.verknuepfen(db, d.id, 'objekt', o2.nummer), (err) => err.status === 409);
  await assert.rejects(() => archiv.verknuepfen(db, d.id, 'adresse', '99999'), /nicht gefunden: 99999/);

  // Zuordnung lösen
  const v = (await archiv.holen(db, d.id)).verknuepfungen.find((x) => x.typ === 'objekt');
  await archiv.verknuepfungLoeschen(db, v.id);
  assert.equal((await archiv.liste(db, { objektId: o2.id })).eintraege.length, 0);

  // Suche nach Nummer und Name der Zuordnung
  assert.equal((await archiv.liste(db, { suche: '4010-01' })).eintraege.length, 1);
  assert.equal((await archiv.liste(db, { suche: 'Erika' })).eintraege.length, 1);
  await db.close();
});

test('Archiv: unbekannte Nummer speichert nichts; Einträge ohne Zuordnung', async () => {
  const db = await openDatabase(':memory:');
  await objekte.anlegen(db, { bezeichnung: 'Haus' }); // 1001
  await assert.rejects(
    () => archiv.anlegen(db, { titel: 'X', ...datei('x') }, { objekt: '1001, 7777' }),
    /Objekt-Nr\. nicht gefunden: 7777/
  );
  assert.equal((await db.get('SELECT COUNT(*) n FROM dokumente')).n, 0);

  await archiv.anlegen(db, { titel: 'Eingang ohne Zuordnung', ...datei('y') }, {});
  await archiv.anlegen(db, { titel: 'Zugeordnet', ...datei('z') }, { objekt: '1001' });
  const offen = await archiv.liste(db, { ohneZuordnung: true });
  assert.deepEqual(offen.eintraege.map((d) => d.titel), ['Eingang ohne Zuordnung']);
  await db.close();
});

test('Archiv: Transaktion verwirft keine parallelen Schreibvorgänge', async () => {
  const db = await openDatabase(':memory:');
  // Transaktion schlägt fehl, während parallel ein Objekt angelegt wird.
  const fehlschlag = db.transaktion(async (tx) => {
    await tx.run("INSERT INTO objekte (nummer, bezeichnung) VALUES ('T1', 'temporär')");
    await new Promise((r) => setTimeout(r, 20));
    throw new Error('absichtlich');
  });
  const parallel = objekte.anlegen(db, { bezeichnung: 'Parallel' });
  await assert.rejects(fehlschlag, /absichtlich/);
  await parallel;
  const namen = (await db.all('SELECT bezeichnung FROM objekte')).map((r) => r.bezeichnung);
  assert.deepEqual(namen, ['Parallel']);
  await db.close();
});

test('Migration: alte Datenbank (v1) wird verlustfrei umgestellt und gesichert', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-mig-'));
  const file = path.join(dir, 'alt.db');
  const v1 = fs.readFileSync(path.join(__dirname, 'fixtures', 'schema_v1.sql'), 'utf8');
  await new Promise((resolve, reject) => {
    const raw = new sqlite3.Database(file);
    raw.exec(
      v1 +
        `INSERT INTO objekte (id, bezeichnung, interne_nr) VALUES (1, 'Engelsplatz', '4010'), (2, 'Ohne Nr', NULL);
         INSERT INTO einheiten (id, objekt_id, bezeichnung) VALUES (1, 1, 'WE 1'), (2, 1, 'WE 2'), (3, 2, 'WE A');
         INSERT INTO adressen (id, nachname) VALUES (1, 'Muster');
         INSERT INTO dokumente (id, objekt_id, einheit_id, titel, original_name, speicher_name)
           VALUES (1, 1, 2, 'Altes Dokument', 'alt.pdf', 'alt.pdf');`,
      (err) => raw.close(() => (err ? reject(err) : resolve()))
    );
  });

  const db = await openDatabase(file);
  const obj = await db.all('SELECT id, nummer FROM objekte ORDER BY id');
  assert.deepEqual(obj.map((o) => o.nummer), ['4010', '4011']);
  const einh = await db.all('SELECT nummer FROM einheiten ORDER BY id');
  assert.deepEqual(einh.map((e) => e.nummer), ['4010-01', '4010-02', '4011-01']);
  assert.equal((await db.get('SELECT nummer FROM adressen')).nummer, '10001');

  const d = await archiv.holen(db, 1);
  assert.equal(d.titel, 'Altes Dokument');
  assert.deepEqual(d.verknuepfungen.map((v) => `${v.typ}:${v.nummer}`).sort(), ['einheit:4010-02', 'objekt:4010']);
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('sicherung-vor-migration-')), 'Sicherung fehlt');
  assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
  await db.close();

  // Zweiter Start: keine erneute Migration/Sicherung
  const anzahl = fs.readdirSync(dir).length;
  const db2 = await openDatabase(file);
  await db2.close();
  assert.equal(fs.readdirSync(dir).length, anzahl);
});

test('Einheiten: globale Suche über Nummer, Bezeichnung und Objekt', async () => {
  const db = await openDatabase(':memory:');
  const o = await objekte.anlegen(db, { bezeichnung: 'Engelsplatz', nummer: '4010' });
  const o2 = await objekte.anlegen(db, { bezeichnung: 'Blumenstr. 45' });
  await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 1' });
  await einheiten.anlegen(db, o2.id, { bezeichnung: 'WE 1', einheitstyp: 'wohnung' });
  await einheiten.anlegen(db, o2.id, { bezeichnung: 'TG 3', einheitstyp: 'stellplatz' });
  assert.equal((await einheiten.suche(db, {})).length, 3);
  assert.deepEqual((await einheiten.suche(db, { suche: '4010' })).map((e) => e.nummer), ['4010-01']);
  assert.equal((await einheiten.suche(db, { suche: 'Blumen' })).length, 2);
  assert.equal((await einheiten.suche(db, { einheitstyp: 'stellplatz' }))[0].objekt_bezeichnung, 'Blumenstr. 45');
  await db.close();
});
