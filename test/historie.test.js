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

test('Änderungshistorie: wer hat wann was an der Adresse geändert', async () => {
  const db = await openDatabase(':memory:');
  await benutzerSvc.anlegen(db, { benutzername: 'fdawid', name: 'Franziska Dawid', passwort: 'test12345', rolle: 'mitarbeiter' });
  await benutzerSvc.anlegen(db, { benutzername: 'leser', name: 'Lea Leser', passwort: 'test12345', rolle: 'leser' });
  const o = await objekte.anlegen(db, { bezeichnung: 'Engelsplatz', nummer: '4010' });
  const e = await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 1' });
  const app = baueApp(db, { uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hv-hist-')) });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const anmelden = async (benutzername) => (await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benutzername, passwort: 'test12345' }),
  })).headers.get('set-cookie').split(';')[0];
  const cookie = await anmelden('fdawid');
  const api = async (methode, url, body, c = cookie) => {
    const res = await fetch(base + '/api' + url, { method: methode, headers: { 'Content-Type': 'application/json', cookie: c }, body: body ? JSON.stringify(body) : undefined });
    const t = await res.text();
    let json = null;
    try { json = JSON.parse(t); } catch { /* HTML-Fallback */ }
    return { status: res.status, json };
  };
  try {
    const a = (await api('POST', '/adressen', { vorname: 'Hans', nachname: 'Meyer', ort: 'Köln' })).json;
    await api('PUT', `/adressen/${a.id}`, { ...a, ort: 'Leverkusen', strasse: 'Engelsplatz 1' });
    const t = (await api('POST', `/adressen/${a.id}/telefone`, { art: 'Funktelefon', nummer: '0152 123' })).json;
    await api('PUT', `/telefone/${t.id}`, { art: 'Funktelefon', nummer: '0152 999' });
    await api('DELETE', `/telefone/${t.id}`);
    const b = (await api('POST', `/adressen/${a.id}/bank`, { kontoinhaber: 'Hans Meyer', iban: 'DE89370400440532013000' })).json;
    await api('PUT', `/bank/${b.id}`, { kontoinhaber: 'Hans Meyer', iban: 'AT611904300234573201' });
    const z = (await api('POST', '/zuordnungen', { adresse_id: a.id, einheit_id: e.id, rolle: 'eigentuemer', gueltig_von: '2026-01-01' })).json;
    await api('POST', `/zuordnungen/${z.id}/beenden`, { datum: '2026-06-30' });
    await api('PUT', `/adressen/${a.id}/versand`, { standard: 'email', abweichungen: {} });
    await api('PUT', `/adressen/${a.id}/ampel`, { ampel: 'rot', notiz: 'schwierig' });
    await api('PUT', `/adressen/${a.id}`, { ...a, ort: 'Leverkusen', strasse: 'Engelsplatz 1' }); // keine Änderung → kein Eintrag

    const h = (await api('GET', `/adressen/${a.id}/historie`)).json;
    const finde = (bereich, feld, aktion) => h.find((x) => x.bereich === bereich && x.feld === feld && (!aktion || x.aktion === aktion));
    assert.ok(h.every((x) => x.benutzer_name === 'Franziska Dawid' && x.quelle === 'intern'), 'wer + Quelle');
    assert.ok(h.every((x) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(x.zeitpunkt)), 'wann');
    assert.deepEqual([finde('adresse', 'ort', 'geaendert').alt, finde('adresse', 'ort', 'geaendert').neu], ['Köln', 'Leverkusen']);
    assert.equal(finde('adresse', 'nachname', 'angelegt').neu, 'Meyer');
    assert.equal(h.filter((x) => x.bereich === 'adresse' && x.aktion === 'geaendert').length, 2, 'zweites identisches Speichern erzeugt nichts');
    assert.deepEqual([finde('telefon', 'nummer', 'geaendert').alt, finde('telefon', 'nummer', 'geaendert').neu], ['0152 123', '0152 999']);
    assert.equal(finde('telefon', 'nummer', 'geloescht').alt, '0152 999');
    assert.equal(finde('bank', 'iban', 'geaendert').neu, 'AT611904300234573201');
    assert.equal(finde('personenfunktion', 'einheit_id', 'angelegt').neu, e.nummer, 'Einheit als Nummer angezeigt');
    assert.equal(finde('personenfunktion', 'gueltig_bis', 'geaendert').neu, '2026-06-30');
    assert.deepEqual([finde('versand', 'standard').alt, finde('versand', 'standard').neu], ['post', 'email']);
    assert.equal(finde('ampel', 'ampel').neu, 'rot');
    assert.equal(h[0].bereich, 'ampel', 'neueste zuerst');
    assert.ok((await api('GET', `/adressen/${a.id}/historie?bereich=telefon`)).json.every((x) => x.bereich === 'telefon'));

    // Leser darf lesen, aber nichts ändern → keine Historie, kein Eintrag
    const leser = await anmelden('leser');
    assert.equal((await api('PUT', `/adressen/${a.id}`, { ...a, ort: 'Hack' }, leser)).status, 403);
    assert.equal((await api('GET', `/adressen/${a.id}/historie`, null, leser)).json.length, h.length);
    // Portal-Konten (Rolle „kunde", künftig) werden als Quelle „portal" vermerkt
    const historie = require('../services/historie');
    assert.equal(historie.akteur({ id: 9, name: 'Kunde K', rolle: 'kunde' }).quelle, 'portal');
    // Keine Schnittstelle zum Ändern/Löschen der Historie
    const del = await api('DELETE', `/adressen/${a.id}/historie`);
    assert.equal(del.status, 404, 'kein Löschen möglich');
    assert.equal((await api('GET', `/adressen/${a.id}/historie`)).json.length, h.length);
  } finally {
    server.close();
    await db.close();
  }
});
