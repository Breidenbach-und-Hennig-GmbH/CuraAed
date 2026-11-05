'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { openDatabase } = require('../db');
const { baueApp } = require('../lib/appFactory');
const benutzerSvc = require('../services/benutzer');

test('Datenschutz: Zustimmung zur Datenweitergabe ja/nein mit Historie und Rechten', async () => {
  const db = await openDatabase(':memory:');
  await benutzerSvc.anlegen(db, { benutzername: 'fdawid', name: 'Franziska Dawid', passwort: 'test12345', rolle: 'mitarbeiter' });
  await benutzerSvc.anlegen(db, { benutzername: 'leser', name: 'Lea Leser', passwort: 'test12345', rolle: 'leser' });
  const app = baueApp(db, { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hv-ds-')) });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const anmelden = async (benutzername) => (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benutzername, passwort: 'test12345' }),
  })).headers.get('set-cookie').split(';')[0];
  const cookie = await anmelden('fdawid');
  const api = async (methode, url, body, c = cookie) => {
    const res = await fetch(base + '/api' + url, { method: methode, headers: { 'Content-Type': 'application/json', cookie: c }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  try {
    const a = (await api('POST', '/adressen', { vorname: 'Gisela', nachname: 'Rottländer' })).json;
    assert.equal(a.datenschutz_zustimmung, null, 'neu: nicht erfasst');

    const ja = (await api('PUT', `/adressen/${a.id}/datenschutz`, { zustimmung: 'ja', datum: '2026-11-04' })).json;
    assert.deepEqual([ja.datenschutz_zustimmung, ja.datenschutz_datum], ['ja', '2026-11-04']);

    const nein = (await api('PUT', `/adressen/${a.id}/datenschutz`, { zustimmung: 'nein', datum: '2026-11-04' })).json;
    assert.deepEqual([nein.datenschutz_zustimmung, nein.datenschutz_datum], ['nein', null], 'Nein löscht das Datum');

    assert.equal((await api('PUT', `/adressen/${a.id}/datenschutz`, { zustimmung: 'vielleicht' })).status, 400);
    assert.equal((await api('PUT', `/adressen/${a.id}/datenschutz`, { zustimmung: 'ja' }, await anmelden('leser'))).status, 403);

    // normales Bearbeiten der Adresse lässt die Zustimmung unverändert
    await api('PUT', `/adressen/${a.id}`, { vorname: 'Gisela', nachname: 'Rottländer', ort: 'Engelskirchen' });
    assert.equal((await api('GET', `/adressen/${a.id}`)).json.datenschutz_zustimmung, 'nein');

    const h = (await api('GET', `/adressen/${a.id}/historie`)).json;
    const z = h.filter((x) => x.feld === 'datenschutz_zustimmung').map((x) => [x.alt, x.neu]);
    assert.deepEqual(z.sort(), [[null, 'ja'], ['ja', 'nein']].sort(), 'Änderungen protokolliert');
  } finally {
    server.close();
    await db.close();
  }
});
