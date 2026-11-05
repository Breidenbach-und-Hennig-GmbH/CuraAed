'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { openDatabase } = require('../db');
const { baueApp } = require('../lib/appFactory');
const benutzerSvc = require('../services/benutzer');

test('Plaud → Zusammenfassung: Audio/Text, Zustimmung, ohne Schlüssel, Rechte (Mistral simuliert)', async () => {
  const db = await openDatabase(':memory:');
  await benutzerSvc.anlegen(db, { benutzername: 'fdawid', name: 'Franziska Dawid', passwort: 'test12345', rolle: 'mitarbeiter' });
  await benutzerSvc.anlegen(db, { benutzername: 'leser', name: 'Lea Leser', passwort: 'test12345', rolle: 'leser' });
  const app = baueApp(db, { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hv-plaud-')) });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  // Mistral simulieren: nur Anfragen an api.mistral.ai abfangen
  const echt = globalThis.fetch;
  const aufrufe = [];
  globalThis.fetch = async (url, opt) => {
    if (!String(url).startsWith('https://api.mistral.ai/')) return echt(url, opt);
    aufrufe.push({ url: String(url), auth: opt.headers.Authorization, body: opt.body });
    if (String(url).endsWith('/audio/transcriptions')) return new Response(JSON.stringify({ text: 'Guten Tag, hier Meyer, Wohnung 24, die Heizung ist kalt.' }), { status: 200 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '**Heizung Wohnung 24 kalt**\nAnliegen:\n- Heizung kalt' } }] }), { status: 200 });
  };
  const alterSchluessel = process.env.MISTRAL_API_KEY;
  const anmelden = async (benutzername) => (await echt(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benutzername, passwort: 'test12345' }),
  })).headers.get('set-cookie').split(';')[0];
  const cookie = await anmelden('fdawid');
  const hoch = async (name, inhalt, felder = {}, c = cookie) => {
    const fd = new FormData();
    fd.append('datei', new Blob([inhalt]), name);
    for (const [k, v] of Object.entries(felder)) fd.append(k, v);
    const res = await echt(base + '/api/gespraech/zusammenfassen', { method: 'POST', headers: { cookie: c }, body: fd });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  try {
    delete process.env.MISTRAL_API_KEY;
    assert.equal((await (await echt(base + '/api/gespraech/status', { headers: { cookie } })).json()).eingerichtet, false);
    const ohne = await hoch('anruf.mp3', 'ID3audio', { zustimmung: '1' });
    assert.equal(ohne.status, 503, 'ohne Schlüssel: verständlicher Hinweis');
    assert.match(ohne.json.fehler, /nicht an deinen Mitarbeiterrechten/);
    const uebernahme = await hoch('plaud-zusammenfassung.txt', 'Zusammenfassung aus Plaud\n- Heizung kalt', { modus: 'uebernehmen' });
    assert.equal(uebernahme.json.zusammenfassung, 'Zusammenfassung aus Plaud\n- Heizung kalt', 'Text übernehmen geht ohne KI');
    assert.equal(aufrufe.length, 0);

    process.env.MISTRAL_API_KEY = '   ';
    assert.equal((await (await echt(base + '/api/gespraech/status', { headers: { cookie } })).json()).eingerichtet, false);
    assert.equal((await hoch('anruf.mp3', 'x', { zustimmung: '1' })).status, 503);
    assert.equal(aufrufe.length, 0);

    process.env.MISTRAL_API_KEY = 'test-schluessel';
    assert.equal((await hoch('anruf.mp3', 'ID3audio', {})).status, 400, 'Audio ohne Zustimmung abgelehnt');
    assert.equal(aufrufe.length, 0, 'ohne Zustimmung geht nichts an den Anbieter');
    const r = await hoch('anruf.m4a', 'ID3audio', { zustimmung: '1', kontext: 'Martin Meyer, Wohnung 4010-24' });
    assert.equal(r.status, 200);
    assert.equal(r.json.quelle, 'audio');
    assert.equal(r.json.zusammenfassung, 'Heizung Wohnung 24 kalt\nAnliegen:\n- Heizung kalt', 'Markdown-Fett entfernt');
    assert.match(r.json.abschrift, /Heizung ist kalt/);
    assert.deepEqual(aufrufe.map((a) => a.url.replace('https://api.mistral.ai/v1', '')), ['/audio/transcriptions', '/chat/completions']);
    assert.equal(aufrufe[0].auth, 'Bearer test-schluessel');
    assert.equal(aufrufe[0].body.get('model'), 'voxtral-mini-latest');
    assert.equal(aufrufe[0].body.get('language'), 'de');
    assert.match(JSON.parse(aufrufe[1].body).messages[1].content, /Martin Meyer, Wohnung 4010-24/);

    const srt = await hoch('plaud.srt', '1\n00:00:01,000 --> 00:00:03,000\nHallo hier Meyer\n\n2\n00:00:04,000 --> 00:00:05,000\nHeizung kalt\n', {});
    assert.equal(srt.json.abschrift, 'Hallo hier Meyer\nHeizung kalt', 'SRT ohne Zeitstempel');
    assert.equal((await hoch('vertrag.pdf', '%PDF', {})).status, 400, 'falsches Format');
    assert.equal((await hoch('anruf.mp3', 'x', { zustimmung: '1' }, await anmelden('leser'))).status, 403, 'Leser darf nicht');
    // Anbieter-Fehler → verständliche Meldung, Schlüssel nicht in der Antwort
    globalThis.fetch = async (url, opt) => (String(url).startsWith('https://api.mistral.ai/') ? new Response('{"message":"Unauthorized"}', { status: 401 }) : echt(url, opt));
    const f = await hoch('anruf.mp3', 'x', { zustimmung: '1' });
    assert.equal(f.status, 502);
    assert.doesNotMatch(JSON.stringify(f.json), /test-schluessel/);

    // Telefoneingang: Audio-Herkunft nur mit Zustimmung speicherbar
    const a = (await (await echt(base + '/api/adressen', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ nachname: 'Meyer' }) })).json());
    const speichern = (b) => echt(base + '/api/telefoneingaenge', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(b) });
    assert.equal((await speichern({ adresse_id: a.id, bemerkung: 'x', aufnahme: 'audio' })).status, 400);
    const ok = await (await speichern({ adresse_id: a.id, bemerkung: 'x', aufnahme: 'audio', aufnahme_zustimmung: 1 })).json();
    assert.deepEqual([ok.aufnahme, ok.aufnahme_zustimmung], ['audio', 1]);
  } finally {
    globalThis.fetch = echt;
    if (alterSchluessel === undefined) delete process.env.MISTRAL_API_KEY; else process.env.MISTRAL_API_KEY = alterSchluessel;
    server.close();
    await db.close();
  }
});
