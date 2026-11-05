'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const adressen = require('../services/adressen');
const objekte = require('../services/objekte');
const einheiten = require('../services/einheiten');
const benutzer = require('../services/benutzer');
const kontakte = require('../services/kontakte');
const archiv = require('../services/archiv');
const zis = require('../services/zis');

test('ZIS: Chronik aus Kontakten, Dokumenten und Wiedervorlagen, neueste zuerst, Volltextsuche', async () => {
  const db = await openDatabase(':memory:');
  const sb = await benutzer.anlegen(db, { benutzername: 'ddu', name: 'D. Dudek', passwort: 'test12345', rolle: 'mitarbeiter' });
  const o = await objekte.anlegen(db, { bezeichnung: 'Lortzingstraße 8', nummer: '18505' });
  const e = await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 01-EG li', nummer: '18505-0001' });
  const a = await adressen.anlegen(db, { vorname: 'Luka', nachname: 'Vujica' });

  const k = await kontakte.kontaktAnlegen(db, a.id, {
    art: 'notiz', zeitpunkt: '2026-08-04T15:14', betreff: 'Einladung zur Eigentümerversammlung', notiz: 'Serie B',
    einheit_nr: '18505-0001', intern: 1, minuten: 5,
  }, sb.id);
  assert.equal(k.objekt_nummer, '18505', 'Objekt wird aus der Wohnung abgeleitet');
  assert.equal(k.einheit_bezeichnung, 'WE 01-EG li');
  assert.equal(k.intern, 1);
  assert.equal(k.minuten, 5);
  await kontakte.kontaktAnlegen(db, a.id, { art: 'anruf', richtung: 'eingehend', zeitpunkt: '2026-08-04T15:22', betreff: 'Rückfrage zur Einladung' }, sb.id);
  await archiv.anlegen(db, { titel: 'Einladung ETV 2026', kategorie: 'korrespondenz', dokument_datum: '2026-08-01', original_name: 'e.pdf', speicher_name: 'e.pdf', hochgeladen_von: sb.id }, { adresse: a.nummer });
  await kontakte.wiedervorlageAnlegen(db, a.id, { faellig_am: '2026-09-01', betreff: 'Teilnahme nachfassen' }, sb.id);

  const r = await zis.eintraege(db, a.id);
  assert.equal(r.gesamt, 4);
  assert.deepEqual(r.eintraege.slice(0, 3).map((x) => x.art), ['WV', 'TEL', 'NOT'], 'neueste zuerst (WV heute angelegt)');
  const dok = r.eintraege.find((x) => x.art === 'DOK');
  assert.ok(dok.text.startsWith('Dokumenten-Name Einladung ETV 2026'));
  assert.equal(dok.sb, 'ddu');
  const not = r.eintraege.find((x) => x.art === 'NOT');
  assert.equal(not.intern, true);
  assert.equal(not.einheit_nummer, '18505-0001');

  assert.equal((await zis.eintraege(db, a.id, { suche: 'lortzing' })).gesamt, 1, 'Suche findet auch über Objekt');
  assert.equal((await zis.eintraege(db, a.id, { suche: 'Einladung' })).gesamt, 3);

  await assert.rejects(() => kontakte.kontaktAnlegen(db, a.id, { betreff: 'x', einheit_nr: '9999' }, sb.id), /nicht gefunden/);
  const o2 = await objekte.anlegen(db, { bezeichnung: 'Anderes Haus' });
  await assert.rejects(() => kontakte.kontaktAnlegen(db, a.id, { betreff: 'x', einheit_nr: '18505-0001', objekt_nr: o2.nummer }, sb.id), /gehört nicht/);
  await assert.rejects(() => kontakte.kontaktAnlegen(db, a.id, { betreff: 'x', minuten: -3 }, sb.id), /Minuten/);
  await db.close();
});
