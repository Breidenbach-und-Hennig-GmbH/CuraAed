'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../db');
const users = require('../services/benutzer');
const { baueHpVerbindungen } = require('../services/hausperfektVerbindungen');
const { baueApp } = require('../lib/appFactory');
const APP = 'https://curaaed.example';

async function fixture(t, { expires = 3600, filename = ':memory:' } = {}) {
  const db = await openDatabase(filename);
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await db.close(); } };
  t.after(close);
  const a = await users.anlegen(db, { benutzername: 'eins', name: 'Eins', rolle: 'mitarbeiter', passwort: 'test12345' });
  const b = await users.anlegen(db, { benutzername: 'zwei', name: 'Zwei', rolle: 'mitarbeiter', passwort: 'test12345' });
  await users.anlegen(db, { benutzername: 'leser', name: 'Leser', rolle: 'leser', passwort: 'test12345' });
  const calls = [];
  const options = { publicUrl: APP, oauth: { clientId: 'test-app', clientSecret: 'test-client-secret' }, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/oauth/token')) {
      const p = JSON.parse(init.body);
      if (p.username === 'abgelehnt') return Response.json({ private: 'not for logs' }, { status: 401 });
      const owner = p.username || p.refresh_token.replace('refresh-', '');
      return Response.json({ access_token: 'token-' + owner, refresh_token: 'refresh-' + owner, expires_in: p.grant_type === 'password' ? expires : 3600 });
    }
    if (url.endsWith('/whoami')) return Response.json({ clientdatabases: [{ subdomain: 'kunde-a', erp: 'hpXpa' }, { subdomain: 'kunde-b', erp: 'hpXpa' }], is_admin: true });
    return Response.json({ data: [{ id: 12, name: init.headers['HPAPI-DOM'] + ':' + init.headers.Authorization }] });
  } };
  const service = baueHpVerbindungen(db, options);
  const connect = (owner = a.id, subdomain = 'kunde-a', name = 'alice') => service.verbinden(owner, { portalUrl: 'https://' + subdomain + '.hausperfekt-mobile.de/', benutzername: name, passwort: 'private-test-password' });
  return { db, a, b, options, service, calls, connect, close };
}

test('HP-Verbindungen: verschlüsselte Tokens, kein gespeichertes Portalpasswort, getrennte Kunden und Benutzer', async t => {
  const f = await fixture(t);
  const a = await f.connect(), b = await f.connect(f.b.id, 'kunde-b', 'bob');
  assert.notEqual(a.id, b.id);
  const rows = await f.db.all('SELECT * FROM hp_mobile_verbindungen');
  for (const row of rows) assert.doesNotMatch(row.daten, /token-alice|token-bob|private-test-password/);
  assert.deepEqual(Object.keys((await f.service.liste(f.a.id))[0]).sort(), ['aktualisiert_am', 'erp', 'id', 'subdomain']);
  const count = f.calls.length;
  await assert.rejects(f.service.daten(f.a.id, b.id, 'persons', 1), e => e.status === 404);
  assert.equal(f.calls.length, count);
  assert.match((await f.service.daten(f.a.id, a.id, 'persons', 1)).data[0].name, /^kunde-a:/);
  await f.service.entfernen(f.a.id, a.id);
  assert.equal((await f.service.liste(f.b.id)).length, 1);
});

test('HP-Verbindungen: erneutes Verbinden ersetzt nur dieselbe eigene Verbindung; abgelehnte Anmeldung erhält sie', async t => {
  const f = await fixture(t);
  const a = await f.connect();
  assert.equal((await f.connect()).id, a.id);
  await assert.rejects(f.connect(f.a.id, 'kunde-a', 'abgelehnt'), e => e.status === 401 && !e.message.includes('private'));
  assert.equal((await f.service.liste(f.a.id)).length, 1);
  await assert.rejects(f.connect(f.a.id, 'fremder-kunde'), e => e.status === 403);
  assert.equal((await f.service.liste(f.a.id)).length, 1);
});

test('HP-Verbindungen: verschlüsselte Tokens können nicht zwischen Verbindungen desselben Benutzers vertauscht werden', async t => {
  const f = await fixture(t);
  const a = await f.connect(), b = await f.connect(f.a.id, 'kunde-b');
  const first = await f.db.get('SELECT daten FROM hp_mobile_verbindungen WHERE id=?', [a.id]);
  await f.db.run('UPDATE hp_mobile_verbindungen SET daten=? WHERE id=?', [first.daten, b.id]);
  const count = f.calls.length;
  await assert.rejects(f.service.daten(f.a.id, b.id, 'persons', 1), e => e.status === 409);
  assert.equal(f.calls.length, count);
});

test('HP-Verbindungen: parallele Leseanfragen erneuern ein abgelaufenes Token nur einmal', async t => {
  const f = await fixture(t, { expires: 1 });
  const a = await f.connect();
  await Promise.all([f.service.daten(f.a.id, a.id, 'persons', 1), f.service.daten(f.a.id, a.id, 'buildings', 1)]);
  const refreshes = f.calls.filter(c => c.url.endsWith('/oauth/token') && JSON.parse(c.init.body).grant_type === 'refresh_token');
  assert.equal(refreshes.length, 1);
  assert.ok(f.calls.filter(c => !c.url.endsWith('/oauth/token')).every(c => c.init.headers['HPAPI-DOM'] === 'kunde-a'));
});

test('HP-Verbindungen: Kundenschlüssel bleibt nach einem Prozessneustart verfügbar', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curaaed-hp-'));
  const f = await fixture(t, { filename: path.join(dir, 'test.db') });
  let reopened;
  t.after(async () => {
    if (reopened) await reopened.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('curaaed-hp-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const a = await f.connect();
  await f.close();
  reopened = await openDatabase(path.join(dir, 'test.db'));
  const second = baueHpVerbindungen(reopened, f.options);
  assert.equal(fs.statSync(path.join(dir, '.hausperfekt-token-key')).size, 32);
  assert.equal((await second.daten(f.a.id, a.id, 'persons', 1)).data.length, 1);
});

test('HP API: Login, Zustimmung und Origin erforderlich; Leser und fremde Verbindungen sind gesperrt', async t => {
  const f = await fixture(t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curaaed-hp-api-'));
  const app = baueApp(f.db, { uploadDir: dir, hausperfekt: f.options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(async () => { server.closeIdleConnections(); await new Promise(r => server.close(r)); assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('curaaed-hp-api-')); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function login(user) {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benutzername: user, passwort: 'test12345' }) });
    return r.headers.get('set-cookie').split(';')[0];
  }
  const cookie = await login('eins'), reader = await login('leser'), other = await login('zwei');
  assert.equal((await fetch(base + '/api/hausperfekt/status')).status, 401);
  assert.equal((await fetch(base + '/api/hausperfekt/status', { headers: { Cookie: reader } })).status, 403);
  const payload = { portalUrl: 'https://kunde-a.hausperfekt-mobile.de/', benutzername: 'alice', passwort: 'private-test-password', zustimmung: true };
  const post = (body, origin = APP) => fetch(base + '/api/hausperfekt/verbinden', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post(payload, 'https://fremd.invalid')).status, 403);
  assert.equal((await post({ ...payload, zustimmung: false })).status, 400);
  const created = await post(payload); assert.equal(created.status, 200);
  const connection = await created.json();
  const own = await fetch(base + '/api/hausperfekt/verbindungen/' + connection.id + '/daten/persons', { headers: { Cookie: cookie } });
  assert.equal(own.status, 200); assert.equal(own.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(base + '/api/hausperfekt/verbindungen/' + connection.id + '/daten/persons', { headers: { Cookie: other } })).status, 404);
});
