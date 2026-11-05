'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { openDatabase } = require('../db');
const { baueApp } = require('../lib/appFactory');
const benutzerSvc = require('../services/benutzer');
const objekte = require('../services/objekte');
const einheiten = require('../services/einheiten');

test('Telefoneingang (Strg+E): erfassen, Wiedervorlage, Z.I.S., offene Rückrufe, Rechte', async () => {
  const db = await openDatabase(':memory:');
  const fd = await benutzerSvc.anlegen(db, { benutzername: 'fdawid', name: 'Franziska Dawid', passwort: 'test12345', rolle: 'mitarbeiter' });
  const mm = await benutzerSvc.anlegen(db, { benutzername: 'mmuster', name: 'Max Muster', passwort: 'test12345', rolle: 'mitarbeiter' });
  await benutzerSvc.anlegen(db, { benutzername: 'leser', name: 'Lea Leser', passwort: 'test12345', rolle: 'leser' });
  const o = await objekte.anlegen(db, { bezeichnung: 'Engelsplatz', nummer: '4010' });
  const e = await einheiten.anlegen(db, o.id, { nummer: '4010-24', bezeichnung: '24' });
  const app = baueApp(db, { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hv-tel-')) });
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
    const a = (await api('POST', '/adressen', { vorname: 'Martin', nachname: 'Meyer', telefon: '02263 123' })).json;
    const ma = (await api('GET', '/mitarbeiter')).json;
    assert.equal(ma.find((m) => m.id === fd.id).kuerzel, 'FD', 'SB-Kürzel aus Initialen');

    const neu = (await api('POST', '/telefoneingaenge', {
      adresse_id: a.id, anrufer_name: 'Frau Meyer', rueckruf_tel: '0171 555', bemerkung: 'Wasserfleck an der Decke\nbitte Rückruf',
      pfkt_code: '001', objekt_nr: '4010', einheit_nr: '4010-24', erledigt: false, rueckruf_sb_id: mm.id, team: 'Technik',
      zeitpunkt: '2026-11-04T17:52', minuten: 3, zis: false, wiedervorlage: true,
    })).json;
    assert.equal(neu.betreff, 'Wasserfleck an der Decke', 'Betreff = erste Zeile der Bemerkung');
    assert.deepEqual([neu.art, neu.richtung, neu.eingang, neu.erledigt, neu.minuten, neu.einheit_id, neu.objekt_id, neu.pfkt_code],
      ['anruf', 'eingehend', 1, 0, 3, e.id, o.id, '001']);
    assert.equal(neu.erfasst_von, fd.id);

    const wv = (await api('GET', `/adressen/${a.id}/wiedervorlagen`)).json;
    assert.equal(wv.length, 1, 'Wiedervorlage angelegt');
    assert.deepEqual([wv[0].betreff, wv[0].zustaendig_id, wv[0].quelle], ['Rückruf: Frau Meyer', mm.id, 'telefon']);
    assert.match(wv[0].notiz, /Tel\. 0171 555/);

    assert.equal((await api('GET', `/adressen/${a.id}/zis`)).json.eintraege.filter((x) => x.quelle === 'kontakt').length, 0, 'ohne Haken nicht im Z.I.S.');
    assert.equal((await api('GET', `/adressen/${a.id}/kontakte`)).json.length, 1, 'aber in den Telefoneingängen');

    // offene Rückrufe: für Max sichtbar, für Franziska (nicht zuständig) nicht – außer mit alle=1
    assert.equal((await api('GET', '/telefoneingaenge/offen', null, await anmelden('mmuster'))).json.length, 1);
    assert.equal((await api('GET', '/telefoneingaenge/offen')).json.length, 0);
    assert.equal((await api('GET', '/telefoneingaenge/offen?alle=1')).json.length, 1);

    // erledigen + ins Z.I.S.
    const upd = (await api('PUT', `/telefoneingaenge/${neu.id}`, { ...neu, adresse_id: a.id, bemerkung: neu.notiz, objekt_nr: '4010', einheit_nr: '4010-24', erledigt: true, zis: true })).json;
    assert.deepEqual([upd.erledigt, upd.zis, upd.zeitpunkt], [1, 1, '2026-11-04T17:52']);
    assert.equal((await api('GET', `/adressen/${a.id}/zis`)).json.eintraege.filter((x) => x.quelle === 'kontakt').length, 1, 'mit Haken im Z.I.S.');
    assert.equal((await api('GET', '/telefoneingaenge/offen?alle=1')).json.length, 0);

    // Prüfungen
    assert.equal((await api('POST', '/telefoneingaenge', { bemerkung: 'x' })).status, 400, 'Adresse Pflicht');
    assert.equal((await api('POST', '/telefoneingaenge', { adresse_id: a.id, pfkt_code: 'XYZ' })).status, 400, 'PFkt muss existieren');
    assert.equal((await api('POST', '/telefoneingaenge', { adresse_id: a.id, einheit_nr: '9999-99' })).status, 400, 'Wohnung muss existieren');
    assert.equal((await api('POST', '/telefoneingaenge', { adresse_id: a.id }, await anmelden('leser'))).status, 403, 'Leser darf nicht');
    const leer = (await api('POST', '/telefoneingaenge', { adresse_id: a.id, erledigt: true, wiedervorlage: true })).json;
    assert.equal(leer.betreff, 'Telefoneingang');
    assert.equal((await api('GET', `/adressen/${a.id}/wiedervorlagen`)).json.length, 1, 'erledigt → keine Wiedervorlage');

    // Markup wird als Text gespeichert
    const xss = (await api('POST', '/telefoneingaenge', { adresse_id: a.id, anrufer_name: '<img src=x onerror=alert(1)>', erledigt: true })).json;
    assert.equal(xss.anrufer_name, '<img src=x onerror=alert(1)>');
  } finally {
    server.close();
    await db.close();
  }
});
