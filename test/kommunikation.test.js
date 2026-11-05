'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { openDatabase } = require('../db');
const adressen = require('../services/adressen');
const komm = require('../services/kommunikation');

test('Kommunikation: Telefon/E-Mail-Listen, Standardwerte, Validierung', async () => {
  const db = await openDatabase(':memory:');
  const a = await adressen.anlegen(db, {
    anrede: 'Herr', vorname: 'Luka', nachname: 'Vujica', mobil: '015254024077', email: 'vujica.luka@gmail.com',
    geburtstag: '2002-07-29', lkto_nr: '903953', datenschutz_datum: '2024-06-01',
  });
  assert.equal(a.geburtstag, '2002-07-29');
  // Werte aus dem Anlageformular landen in den Listen
  let k = await komm.liste(db, a.id);
  assert.deepEqual(k.telefone.map((t) => `${t.art}:${t.nummer}`), ['Funktelefon:015254024077']);
  assert.equal(k.emails[0].standard, 1);

  await komm.telefonAnlegen(db, a.id, { art: 'Telefon', nummer: '0214/68900', bemerkung: 'Büro', kurzwahl: '000' });
  const zweite = await komm.emailAnlegen(db, a.id, { adresse: 'luka@firma.de', standard: 1, hpmobile: 1 });
  await komm.emailAnlegen(db, a.id, { adresse: 'www.vujica.de', ist_email: 0 });
  k = await komm.liste(db, a.id);
  assert.deepEqual(k.emails.filter((m) => m.standard).map((m) => m.adresse), ['luka@firma.de'], 'nur ein Standard');

  let stamm = await adressen.holen(db, a.id);
  assert.equal(stamm.telefon, '0214/68900');
  assert.equal(stamm.mobil, '015254024077');
  assert.equal(stamm.email, 'luka@firma.de');

  await komm.emailLoeschen(db, zweite.id);
  assert.equal((await adressen.holen(db, a.id)).email, 'vujica.luka@gmail.com');

  // Bearbeiten der Adresse ohne Kontaktfelder überschreibt diese nicht
  await adressen.aktualisieren(db, a.id, { adresstyp: 'person', vorname: 'Luka', nachname: 'Vujica', strasse: 'Alte Landstr. 42' });
  stamm = await adressen.holen(db, a.id);
  assert.equal(stamm.mobil, '015254024077');
  assert.equal(stamm.geburtstag, '2002-07-29');

  await assert.rejects(() => komm.emailAnlegen(db, a.id, { adresse: 'kein-mail' }), /Ungültige E-Mail/);
  await assert.rejects(() => komm.emailAnlegen(db, a.id, { adresse: 'javascript:alert(1)', ist_email: 0 }), /Ungültige Webseite/);
  await assert.rejects(() => komm.telefonAnlegen(db, a.id, { nummer: '' }), /erforderlich/);
  await assert.rejects(() => komm.telefonAnlegen(db, a.id, { nummer: '1', art: 'Brieftaube' }), /Ungültiger Wert/);

  const ap = await komm.apAnlegen(db, a.id, { name: 'Frau Muster', funktion: 'Buchhaltung', telefon: '123' });
  await komm.apAktualisieren(db, ap.id, { name: 'Frau Muster-Neu', funktion: 'Buchhaltung' });
  assert.equal((await komm.liste(db, a.id)).ansprechpartner[0].name, 'Frau Muster-Neu');
  await db.close();
});

test('Kommunikation: vCard-Export mit korrekter Maskierung', async () => {
  const db = await openDatabase(':memory:');
  const a = await adressen.anlegen(db, { adresstyp: 'firma', firmenname: 'Süße GmbH; & Co, KG', strasse: 'Alte Landstraße 209', plz: '51373', ort: 'Leverkusen', telefon: '0214/68900' });
  const v = await komm.vcard(db, a.id);
  assert.match(v.text, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  assert.ok(v.text.includes('ORG:Süße GmbH\\; & Co\\, KG'));
  assert.ok(v.text.includes('TEL;TYPE=VOICE:0214/68900'));
  assert.ok(v.text.includes('ADR;TYPE=WORK:;;Alte Landstraße 209;Leverkusen;;51373;Deutschland'));
  assert.equal(v.dateiname, `Adresse_${a.nummer}.vcf`);
  await db.close();
});

test('Migration: bestehende Telefon/E-Mail-Werte werden einmalig in die Listen übernommen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-komm-'));
  const file = path.join(dir, 'alt.db');
  const v1 = fs.readFileSync(path.join(__dirname, 'fixtures', 'schema_v1.sql'), 'utf8');
  await new Promise((resolve, reject) => {
    const raw = new sqlite3.Database(file);
    raw.exec(v1 + "INSERT INTO adressen (id, nachname, telefon, mobil, email) VALUES (1, 'Meyer', '0221/1', '0170/2', 'm@x.de');",
      (err) => raw.close(() => (err ? reject(err) : resolve())));
  });
  let db = await openDatabase(file);
  let k = await komm.liste(db, 1);
  assert.equal(k.telefone.length, 2);
  assert.equal(k.emails.length, 1);
  // Nutzer löscht alle Nummern – nach Neustart dürfen sie nicht wieder auftauchen
  for (const t of k.telefone) await komm.telefonLoeschen(db, t.id);
  await db.close();
  db = await openDatabase(file);
  k = await komm.liste(db, 1);
  assert.equal(k.telefone.length, 0);
  await db.close();
});
