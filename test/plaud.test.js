'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { openDatabase } = require('../db');
const { bauePlaud, toolDaten } = require('../services/plaud');
const { baueApp } = require('../lib/appFactory');
const benutzer = require('../services/benutzer');
const URL_APP = 'https://curaaed.example';

async function fixture(t, opts = {}) {
  const db = await openDatabase(':memory:');
  t.after(() => db.close());
  const ids = [];
  for (const [name, rolle] of [['eins', 'mitarbeiter'], ['zwei', 'mitarbeiter'], ['leser', 'leser']]) {
    ids.push((await benutzer.anlegen(db, { benutzername: name, name, rolle, passwort: 'test12345' })).id);
  }
  const requests = [], calls = [];
  let registriert = 0;
  const options = {
    publicUrl: URL_APP,
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/register')) return Response.json({ client_id: 'client-' + ++registriert });
      const p = new URLSearchParams(init.body);
      return Response.json({ access_token: 'token-' + p.get('client_id'), refresh_token: 'refresh-' + p.get('client_id'), expires_in: 3600 });
    },
    callTool: async (token, name, args) => {
      calls.push({ token, name, args });
      if (name === 'list_files') return { data: [{ id: 'file-' + token, name: '<img src=x onerror=alert(1)>', created_at: '2026-11-05T10:00:00Z', duration: 60000 }] };
      if (args.file_id !== 'file-' + token) throw new Error('Forbidden');
      return [{ data_type: 'summary', data_content: 'Anliegen: Heizung kalt' }];
    },
    ...opts,
  };
  const service = bauePlaud(db, options);
  async function login(id = ids[0], session = 'session-eins') {
    const r = await service.verbinden(id, session);
    const state = new URL(r.url).searchParams.get('state');
    await service.abschliessen(id, session, state, 'test-code', false);
    return { state, url: r.url };
  }
  return { db, ids, service, requests, calls, options, login };
}

test('Plaud: offizieller SDK-Transport sendet Bearer-Token und list_files/get_note im MCP-Format', async (t) => {
  const methods = [];
  const f = await fixture(t, {
    callTool: undefined,
    fetch: async (url, init = {}) => {
      if (String(url).endsWith('/register')) return Response.json({ client_id: 'wire-client' });
      if (String(url).endsWith('/token')) return Response.json({ access_token: 'wire-token', refresh_token: 'wire-refresh', expires_in: 3600 });
      assert.equal(String(url), 'https://mcp.plaud.ai/mcp');
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer wire-token');
      assert.equal(init.method, 'POST');
      const request = JSON.parse(init.body);
      methods.push(request.method);
      if (request.id === undefined) return new Response(null, { status: 202 });
      let result;
      if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'Plaud test fixture', version: '1.0.0' } };
      else {
        const { name, arguments: args } = request.params;
        assert.equal(request.method, 'tools/call');
        if (name === 'list_files') {
          assert.deepEqual(args, { page: 1, page_size: 20 });
          result = { content: [{ type: 'text', text: 'Data follows\n<untrusted-user-data-a1b2 source="plaud-recording">\n{"data":[{"id":"wire-file","name":"Testgespräch"}]}\n</untrusted-user-data-a1b2>' }] };
        } else {
          assert.equal(name, 'get_note');
          assert.equal(args.file_id, 'wire-file');
          result = { content: [{ type: 'text', text: '[{"data_type":"summary","data_content":"Testnotiz"}]' }] };
        }
      }
      return Response.json({ jsonrpc: '2.0', id: request.id, result });
    },
  });
  await f.login();
  assert.equal((await f.service.liste(f.ids[0])).gespraeche[0].id, 'wire-file');
  assert.equal((await f.service.notizen(f.ids[0], 'wire-file')).notizen[0].text, 'Testnotiz');
  assert.equal(methods.filter((m) => m === 'tools/call').length, 2);
});

test('Plaud: verschobene verschlüsselte Zugangsdaten können von einem anderen Mitarbeiter nicht geöffnet werden', async (t) => {
  const f = await fixture(t);
  await f.login();
  const row = await f.db.get('SELECT daten FROM plaud_verbindungen WHERE benutzer_id=?', [f.ids[0]]);
  await f.db.run('INSERT INTO plaud_verbindungen (benutzer_id,daten) VALUES (?,?)', [f.ids[1], row.daten]);
  await assert.rejects(f.service.liste(f.ids[1]), /nicht geöffnet/);
  assert.equal(f.calls.length, 0);
});

test('Plaud OAuth: PKCE, verschlüsselte Tokens und getrennte Mitarbeiterkonten', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.service.status(f.ids[0]), { verfuegbar: true, verbunden: false });
  const login = await f.login();
  const u = new URL(login.url);
  assert.equal(u.origin, 'https://mcp.plaud.ai');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), URL_APP + '/api/plaud/callback');
  const tokenRequest = f.requests.find((r) => r.url.endsWith('/token'));
  const verifier = new URLSearchParams(tokenRequest.init.body).get('code_verifier');
  assert.equal(u.searchParams.get('code_challenge'), crypto.createHash('sha256').update(verifier).digest('base64url'));
  const row = await f.db.get('SELECT daten FROM plaud_verbindungen WHERE benutzer_id=?', [f.ids[0]]);
  assert.doesNotMatch(row.daten, /token-client|refresh-client/);
  assert.equal((await f.service.status(f.ids[1])).verbunden, false);
  await assert.rejects(f.service.liste(f.ids[1]), /persönliches Plaud-Konto verbinden/);
  await f.login(f.ids[1], 'session-zwei');
  const a = await f.service.liste(f.ids[0]);
  const b = await f.service.liste(f.ids[1]);
  assert.notEqual(a.gespraeche[0].id, b.gespraeche[0].id);
  assert.equal((await f.service.notizen(f.ids[0], a.gespraeche[0].id)).notizen[0].text, 'Anliegen: Heizung kalt');
  await assert.rejects(f.service.notizen(f.ids[1], a.gespraeche[0].id), /nicht gelesen/);
  assert.equal(f.calls.at(-1).token, 'token-client-2');
});

test('Plaud OAuth: fremde Nutzer/Sitzungen, abgelaufener State und Wiederverwendung werden blockiert', async (t) => {
  const f = await fixture(t);
  const r = await f.service.verbinden(f.ids[0], 'session');
  const state = new URL(r.url).searchParams.get('state');
  const encryptedPending = await f.db.get('SELECT * FROM plaud_anmeldungen');
  assert.notEqual(encryptedPending.state_hash, state);
  assert.doesNotMatch(encryptedPending.daten, /verifier|client-/);
  await assert.rejects(f.service.abschliessen(f.ids[1], 'session', state, 'code', false), /andere.*Sitzung/);
  await assert.rejects(f.service.abschliessen(f.ids[0], 'fremd', state, 'code', false), /andere.*Sitzung/);
  await f.service.abschliessen(f.ids[0], 'session', state, 'code', false);
  await assert.rejects(f.service.abschliessen(f.ids[0], 'session', state, 'code', false), /abgelaufen/);
  const neu = await f.service.verbinden(f.ids[0], 'session');
  await f.db.run('UPDATE plaud_anmeldungen SET ablauf=0');
  await assert.rejects(f.service.abschliessen(f.ids[0], 'session', new URL(neu.url).searchParams.get('state'), 'code', false), /abgelaufen/);
});

test('Plaud OAuth: Abbruch behält eine bestehende Verbindung, Entfernen betrifft nur den eigenen Benutzer', async (t) => {
  const f = await fixture(t);
  await f.login();
  await f.login(f.ids[1], 'session-zwei');
  const next = await f.service.verbinden(f.ids[0], 'session-eins');
  assert.equal(await f.service.abschliessen(f.ids[0], 'session-eins', new URL(next.url).searchParams.get('state'), undefined, true), false);
  assert.equal((await f.service.status(f.ids[0])).verbunden, true);
  await f.service.trennen(f.ids[0]);
  assert.equal((await f.service.status(f.ids[0])).verbunden, false);
  assert.equal((await f.service.status(f.ids[1])).verbunden, true);
  assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM plaud_anmeldungen')).n, 0);
});

test('Plaud: Token-Erneuerung wird pro Mitarbeiter serialisiert; Netzwerkfehler löschen keine Verbindung', async (t) => {
  let abgelehnt = 0, refresh = 0, netzwerkFehler = false;
  const f = await fixture(t, {
    fetch: async (url, init) => {
      if (url.endsWith('/register')) return Response.json({ client_id: 'client-1' });
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'refresh_token') {
        if (netzwerkFehler) throw new Error('Netzwerk unterbrochen');
        refresh++;
        return Response.json({ access_token: 'erneuert', refresh_token: 'neu', expires_in: 3600 });
      }
      return Response.json({ access_token: 'token-client-1', refresh_token: 'alt', expires_in: 3600 });
    },
    callTool: async (token) => {
      if (token === 'token-client-1' || netzwerkFehler) { abgelehnt++; const e = new Error('Unauthorized'); e.code = 401; throw e; }
      return { data: [] };
    },
  });
  await f.login();
  await Promise.all([f.service.liste(f.ids[0]), f.service.liste(f.ids[0])]);
  assert.equal(refresh, 1);
  assert.equal(abgelehnt, 1);
  netzwerkFehler = true;
  await assert.rejects(f.service.liste(f.ids[0]), /nicht erreichbar/);
  assert.equal((await f.service.status(f.ids[0])).verbunden, true);
});

test('Plaud: verschlüsselte Verbindung überlebt einen Serverneustart mit persistenter Schlüsseldatei', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plaud-db-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'app.db');
  let db = await openDatabase(filename);
  const id = (await benutzer.anlegen(db, { benutzername: 'test', name: 'Test', passwort: 'test12345', rolle: 'mitarbeiter' })).id;
  const f = await fixture(t);
  const service = bauePlaud(db, f.options);
  const url = new URL((await service.verbinden(id, 'session')).url);
  await service.abschliessen(id, 'session', url.searchParams.get('state'), 'code', false);
  await db.close();
  db = await openDatabase(filename);
  try {
    const neu = bauePlaud(db, f.options);
    assert.equal((await neu.liste(id)).gespraeche.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, '.plaud-token-key')).length, 32);
  } finally { await db.close(); }
});

test('Plaud: standardmäßige MCP-Datenmarker und Fehler werden als Daten verarbeitet', () => {
  const content = JSON.stringify({ data: [{ id: 'eins', name: '<script>evil()</script>' }] });
  const r = toolDaten({ content: [{ type: 'text', text: 'Untrusted data\n<untrusted-user-data-aabbcc source="plaud-recording">\n' + content + '\n</untrusted-user-data-aabbcc>' }] });
  assert.equal(r.data[0].name, '<script>evil()</script>');
  assert.throws(() => toolDaten({ isError: true, content: [{ type: 'text', text: 'secret-provider-detail' }] }), (e) => !e.message.includes('secret-provider-detail'));
  assert.throws(() => toolDaten({ content: [{ type: 'text', text: 'not JSON' }] }), /Datenformat/);
});

test('Plaud API: Mitarbeiter dürfen verbinden und lesen; Leser und fremde Origins nicht', async (t) => {
  const f = await fixture(t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plaud-api-'));
  const app = baueApp(f.db, { uploadDir: dir, plaud: f.options });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise((r) => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function anmelden(name) {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benutzername: name, passwort: 'test12345' }) });
    return r.headers.get('set-cookie').split(';')[0];
  }
  const cookie = await anmelden('eins');
  const post = (p, b, origin = URL_APP, c = cookie) => fetch(base + p, { method: 'POST', headers: { cookie: c, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  assert.equal((await fetch(base + '/api/plaud/status')).status, 401);
  assert.equal((await fetch(base + '/api/plaud/status', { headers: { cookie: await anmelden('leser') } })).status, 403);
  assert.equal((await post('/api/plaud/verbinden', { zustimmung: true }, 'https://fremd.example')).status, 403);
  assert.equal((await post('/api/plaud/verbinden', {})).status, 400);
  const start = await post('/api/plaud/verbinden', { zustimmung: true });
  assert.equal(start.status, 200);
  const state = new URL((await start.json()).url).searchParams.get('state');
  const cb = await fetch(base + '/api/plaud/callback?state=' + state + '&code=test', { headers: { cookie }, redirect: 'manual' });
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('location'), '/#/plaud?status=verbunden');
  const r = await fetch(base + '/api/plaud/gespraeche', { headers: { cookie } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).gespraeche.length, 1);
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.equal((await fetch(base + '/api/plaud/gespraeche?seite=-1', { headers: { cookie } })).status, 400);
  assert.equal((await post('/api/plaud/trennen', {})).status, 200);
});
