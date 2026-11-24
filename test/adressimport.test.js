'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { openDatabase } = require('../db'), svc = require('../services/adressImport'), users = require('../services/benutzer');
const b = s => ({ datei: Buffer.from(s).toString('base64') });
async function setup(t) {
  const db = await openDatabase(':memory:'); t.after(() => db.close());
  const owner = await users.anlegen(db, { benutzername: 'import', name: 'Import Admin', rolle: 'admin', passwort: 'test12345' });
  return { db, owner };
}
function input(s) { const v = b(s); return { ...v, zuordnung: svc.datei(v).zuordnung }; }

test('CSV liest Umlaute, führende Nullen, eingebettete Trennzeichen/Zeilen und Windows-1252; kaputte Dateien werden abgewiesen', () => {
  const x = svc.datei(b('Firmenname;PLZ;Straße\r\n"Müller; Partner";01234;"Weg 1\nHinterhaus"'));
  assert.equal(x.rows[0][0], 'Müller; Partner'); assert.equal(x.rows[0][1], '01234'); assert.equal(x.rows[0][2], 'Weg 1\nHinterhaus');
  const ansi = require('iconv-lite').encode('Firmenname;Ort\r\n„Müller“;Köln', 'win1252');
  assert.equal(svc.datei({ datei: ansi.toString('base64') }).rows[0][0], '„Müller“');
  assert.deepEqual(svc.datei(b('Vorname\tNachname\nJana\tConrad')).zuordnung, { vorname: 0, nachname: 1 });
  for (const s of ['Name;Ort\n"Offen;Köln', 'Name;Ort\n"A"x;Köln', 'Name;Ort\nA;B;C']) assert.throws(() => svc.datei(b(s)));
  assert.throws(() => svc.datei(b('Name\n' + 'Müller\n'.repeat(501))));
});

test('Vorschau schreibt nichts; Übernahme überspringt Bestands- und Dateidubletten, bewahrt Nummern und ist gegen Wiederholung geschützt', async t => {
  const { db, owner } = await setup(t);
  await require('../services/adressen').anlegen(db, { nummer: '1234', vorname: 'Jana', nachname: 'Conrad', ort: 'Altort' });
  const data = input('Vorname;Nachname;PLZ;Ort;E-Mail\nJana;Conrad;01234;Neuort;\nEthem;Tekin;01234;Köln;ethem@example.test\nEthem;Tekin;01234;Köln;\nMax;Mustermann;10000;Berlin;kaputt');
  const p = await svc.plan(db, owner, data);
  assert.deepEqual([p.neu, p.dubletten, p.fehler], [1, 2, 1]);
  assert.equal((await db.get('SELECT COUNT(*) n FROM adressen')).n, 1);
  const r = await svc.uebernehmen(db, owner, { ...data, pruefsumme: p.pruefsumme });
  assert.equal(r.angelegt.length, 1); assert.equal(r.uebersprungen, 3);
  assert.equal((await db.get("SELECT ort FROM adressen WHERE nummer='1234'")).ort, 'Altort');
  assert.equal((await db.get('SELECT plz FROM adressen WHERE id=?', [r.angelegt[0].id])).plz, '01234');
  assert.equal((await db.get('SELECT COUNT(*) n FROM adress_emails')).n, 1);
  assert.ok((await db.get('SELECT COUNT(*) n FROM aenderungen WHERE benutzer_id=?', [owner.id])).n > 0);
  await assert.rejects(svc.uebernehmen(db, owner, { ...data, pruefsumme: p.pruefsumme }), e => e.status === 409);
  assert.equal((await db.get('SELECT COUNT(*) n FROM adressen')).n, 2);
});

test('Geänderter Bestand und geänderte Spalten machen die Vorschau ungültig; Schreibfehler rollen den ganzen Import zurück', async t => {
  const { db, owner } = await setup(t), data = input('Vorname;Nachname\nJana;Conrad\nEthem;Tekin');
  const p = await svc.plan(db, owner, data);
  await require('../services/adressen').anlegen(db, { vorname: 'Jana', nachname: 'Conrad' });
  await assert.rejects(svc.uebernehmen(db, owner, { ...data, pruefsumme: p.pruefsumme }), e => e.status === 409);
  await assert.rejects(svc.uebernehmen(db, owner, { ...data, zuordnung: { vorname: 1, nachname: 0 }, pruefsumme: p.pruefsumme }), e => e.status === 409);
  const fresh = await svc.plan(db, owner, data);
  await db.run("CREATE TRIGGER reject_import BEFORE INSERT ON adressen WHEN NEW.nachname='Tekin' BEGIN SELECT RAISE(ABORT,'test'); END");
  await assert.rejects(svc.uebernehmen(db, owner, { ...data, pruefsumme: fresh.pruefsumme }));
  assert.equal((await db.get('SELECT COUNT(*) n FROM adressen')).n, 1);
});

test('Import-API verlangt Administrator, passende Herkunft und ausdrückliche Vorschau vor dem Schreiben', async t => {
  const { db, owner } = await setup(t);
  await users.anlegen(db, { benutzername: 'leser', name: 'Leser', rolle: 'leser', passwort: 'test12345' });
  const server = require('../lib/appFactory').baueApp(db, { hausperfekt: { publicUrl: 'https://curaaed.test' } }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  async function login(benutzername) {
    const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ benutzername, passwort: 'test12345' }) });
    return r.headers.get('set-cookie').split(';')[0];
  }
  const cookie = await login(owner.benutzername), reader = await login('leser'), data = input('Vorname;Nachname\nJana;Conrad');
  const post = (path, body, extra = {}) => fetch(base + '/adressimport/' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://curaaed.test', ...extra }, body: JSON.stringify(body) });
  assert.equal((await post('datei', data)).status, 401);
  assert.equal((await post('datei', data, { cookie: reader })).status, 403);
  assert.equal((await post('datei', data, { cookie, origin: 'https://fremd.test' })).status, 403);
  assert.equal((await post('uebernehmen', data, { cookie })).status, 409);
  const p = await (await post('vorschau', data, { cookie })).json();
  assert.equal((await post('uebernehmen', { ...data, pruefsumme: p.pruefsumme }, { cookie })).status, 200);
});
