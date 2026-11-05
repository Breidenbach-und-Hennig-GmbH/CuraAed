'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const adressen = require('../services/adressen');
const benutzer = require('../services/benutzer');
const kontakte = require('../services/kontakte');

async function basis() {
  const db = await openDatabase(':memory:');
  const sb = await benutzer.anlegen(db, { benutzername: 'fd', name: 'F. Dawid', passwort: 'test12345', rolle: 'mitarbeiter' });
  const a = await adressen.anlegen(db, { vorname: 'Luka', nachname: 'Vujica' });
  return { db, sb, a };
}

test('Ampel: setzen, begründen, zurücksetzen – Bearbeiten der Adresse lässt sie unverändert', async () => {
  const { db, sb, a } = await basis();
  const r = await kontakte.ampelSetzen(db, a.id, { ampel: 'gelb', notiz: 'Auf Wortwahl achten' }, sb.id);
  assert.equal(r.ampel, 'gelb');
  assert.equal(r.ampel_von_name, 'F. Dawid');
  assert.match(r.ampel_datum, /^\d{4}-\d{2}-\d{2}$/);
  await adressen.aktualisieren(db, a.id, { vorname: 'Luka', nachname: 'Vujica', ort: 'Leverkusen' });
  const geholt = await adressen.holen(db, a.id);
  assert.equal(geholt.ampel, 'gelb');
  assert.equal(geholt.ampel_von_name, 'F. Dawid');
  await assert.rejects(() => kontakte.ampelSetzen(db, a.id, { ampel: 'lila' }, sb.id), /Ungültiger Wert/);
  const leer = await kontakte.ampelSetzen(db, a.id, { ampel: '' }, sb.id);
  assert.equal(leer.ampel, null);
  assert.equal(leer.ampel_notiz, null);
  await db.close();
});

test('Kontaktprotokoll: Anruf/E-Mail/Gespräch erfassen, neueste zuerst', async () => {
  const { db, sb, a } = await basis();
  await kontakte.kontaktAnlegen(db, a.id, { art: 'anruf', richtung: 'eingehend', zeitpunkt: '2026-10-15T09:30', betreff: 'Frage zur Abrechnung' }, sb.id);
  const g = await kontakte.kontaktAnlegen(db, a.id, { art: 'gespraech', richtung: 'eingehend', zeitpunkt: '2026-10-16T14:00', betreff: 'Besuch im Büro' }, sb.id);
  assert.equal(g.richtung, null, 'persönliches Gespräch hat keine Richtung');
  assert.equal(g.erfasst_von_name, 'F. Dawid');
  const liste = await kontakte.kontakteListe(db, a.id);
  assert.deepEqual(liste.map((k) => k.betreff), ['Besuch im Büro', 'Frage zur Abrechnung']);
  const ohneZeit = await kontakte.kontaktAnlegen(db, a.id, { art: 'email', betreff: 'Kurz' }, sb.id);
  assert.match(ohneZeit.zeitpunkt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Zeitpunkt wird automatisch gesetzt');
  await assert.rejects(() => kontakte.kontaktAnlegen(db, a.id, { art: 'fax', betreff: 'x' }, sb.id), /Ungültiger Wert/);
  await assert.rejects(() => kontakte.kontaktAnlegen(db, a.id, { betreff: '' }, sb.id), /Betreff/);
  await assert.rejects(() => kontakte.kontaktAnlegen(db, a.id, { betreff: 'x', zeitpunkt: 'gestern' }, sb.id), /Zeitpunkt/);
  await db.close();
});

test('Wiedervorlagen: offen/überfällig zählen, erledigen, zuständig prüfen', async () => {
  const { db, sb, a } = await basis();
  await kontakte.wiedervorlageAnlegen(db, a.id, { faellig_am: '2026-10-01', betreff: 'Rückruf', zustaendig_id: sb.id }, sb.id);
  const w2 = await kontakte.wiedervorlageAnlegen(db, a.id, { faellig_am: '2026-10-16', betreff: 'Angebot prüfen' }, sb.id);
  await kontakte.wiedervorlageAnlegen(db, a.id, { faellig_am: '2026-11-01', betreff: 'Nachfassen' }, sb.id);
  let u = await kontakte.uebersicht(db, a.id, '2026-10-16');
  assert.deepEqual(u.wiedervorlagen, { offen: 3, ueberfaellig: 1, heute: 1 });
  await kontakte.wiedervorlageErledigt(db, w2.id, true);
  u = await kontakte.uebersicht(db, a.id, '2026-10-16');
  assert.equal(u.wiedervorlagen.offen, 2);
  assert.equal((await kontakte.wiedervorlagenListe(db, a.id)).length, 2);
  assert.equal((await kontakte.wiedervorlagenListe(db, a.id, { mitErledigten: true })).length, 3);
  await assert.rejects(() => kontakte.wiedervorlageAnlegen(db, a.id, { faellig_am: '', betreff: 'x' }, sb.id), /Fällig am/);
  await assert.rejects(() => kontakte.wiedervorlageAnlegen(db, a.id, { faellig_am: '2026-10-20', betreff: 'x', zustaendig_id: 999 }, sb.id), /Zuständiger/);
  await db.close();
});
