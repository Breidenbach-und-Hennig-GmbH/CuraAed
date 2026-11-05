'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { openDatabase } = require('../db');
const { baueApp } = require('../lib/appFactory');
const benutzerSvc = require('../services/benutzer');

/** Startet die App auf einem zufälligen Port und liefert Basis-URL + Cookie-Helfer. */
async function starteTestApp() {
  const db = await openDatabase(':memory:');
  await benutzerSvc.anlegen(db, {
    benutzername: 'admin',
    name: 'Admin',
    passwort: 'test12345',
    rolle: 'admin',
  });
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hv-uploads-'));
  const app = baueApp(db, { uploadDir });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, db, uploadDir };
}

async function login(base) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ benutzername: 'admin', passwort: 'test12345' }),
  });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

test('API: geschützte Route ohne Anmeldung -> 401', async () => {
  const { server, base } = await starteTestApp();
  try {
    const res = await fetch(`${base}/api/objekte`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('API: Login und CRUD-Grundfluss Objekt -> Einheit -> Adresse -> Zuordnung', async () => {
  const { server, base } = await starteTestApp();
  try {
    const cookie = await login(base);
    const j = (extra = {}) => ({ 'Content-Type': 'application/json', cookie, ...extra });

    // Objekt anlegen
    let res = await fetch(`${base}/api/objekte`, {
      method: 'POST',
      headers: j(),
      body: JSON.stringify({ bezeichnung: 'API Haus', objekttyp: 'WEG', ort: 'Bonn' }),
    });
    assert.equal(res.status, 201);
    const objekt = await res.json();

    // Einheit anlegen
    res = await fetch(`${base}/api/objekte/${objekt.id}/einheiten`, {
      method: 'POST',
      headers: j(),
      body: JSON.stringify({ bezeichnung: 'WE 1', einheitstyp: 'wohnung' }),
    });
    assert.equal(res.status, 201);
    const einheit = await res.json();

    // Adresse anlegen
    res = await fetch(`${base}/api/adressen`, {
      method: 'POST',
      headers: j(),
      body: JSON.stringify({ vorname: 'Erika', nachname: 'Beispiel' }),
    });
    assert.equal(res.status, 201);
    const adresse = await res.json();

    // Zuordnung Mieter an Einheit
    res = await fetch(`${base}/api/zuordnungen`, {
      method: 'POST',
      headers: j(),
      body: JSON.stringify({ adresse_id: adresse.id, einheit_id: einheit.id, rolle: 'mieter', gueltig_von: '2024-01-01' }),
    });
    assert.equal(res.status, 201);

    // Objekt-Zuordnungen enthalten die Einheiten-Zuordnung (Objektbezug abgeleitet)
    res = await fetch(`${base}/api/objekte/${objekt.id}/zuordnungen`, { headers: { cookie } });
    const zuord = await res.json();
    assert.equal(zuord.length, 1);
    assert.equal(zuord[0].rolle, 'mieter');

    // Validierungsfehler liefert 400 mit deutschem Feld
    res = await fetch(`${base}/api/objekte`, {
      method: 'POST',
      headers: j(),
      body: JSON.stringify({ bezeichnung: '' }),
    });
    assert.equal(res.status, 400);
    const fehler = await res.json();
    assert.match(fehler.fehler, /erforderlich/);
  } finally {
    server.close();
  }
});

test('API: Rechtekonzept – Leser darf lesen, aber nicht schreiben', async () => {
  const { server, base, db } = await starteTestApp();
  try {
    await benutzerSvc.anlegen(db, { benutzername: 'leser', name: 'Nur Lesen', passwort: 'leser12345', rolle: 'leser' });
    const res0 = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ benutzername: 'leser', passwort: 'leser12345' }),
    });
    const cookie = res0.headers.get('set-cookie').split(';')[0];

    // lesen erlaubt
    let res = await fetch(`${base}/api/objekte`, { headers: { cookie } });
    assert.equal(res.status, 200);

    // schreiben verboten
    res = await fetch(`${base}/api/objekte`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ bezeichnung: 'X' }),
    });
    assert.equal(res.status, 403);

    // Benutzerverwaltung nur Admin
    res = await fetch(`${base}/api/benutzer`, { headers: { cookie } });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('API: Archiv-Upload mit Nummern, Auflösen, Download, Rechte', async () => {
  const { server, base, db, uploadDir } = await starteTestApp();
  try {
    const cookie = await login(base);
    const json = { 'Content-Type': 'application/json', cookie };
    let res = await fetch(`${base}/api/objekte`, { method: 'POST', headers: json, body: JSON.stringify({ bezeichnung: 'Engelsplatz', nummer: '4010' }) });
    const objekt = await res.json();
    await fetch(`${base}/api/adressen`, { method: 'POST', headers: json, body: JSON.stringify({ nachname: 'Muster' }) }); // 10001

    res = await fetch(`${base}/api/nummern?objekt=4010,9999&adresse=10001`, { headers: { cookie } });
    const aufl = await res.json();
    assert.deepEqual(aufl.objekt.map((r) => r.gefunden), [true, false]);
    assert.equal(aufl.adresse[0].label, 'Muster');

    const fd = new FormData();
    fd.append('titel', '<b>Protokoll</b>');
    fd.append('kategorie', 'protokoll');
    fd.append('objekt_nr', '4010');
    fd.append('adresse_nr', '10001');
    fd.append('datei', new Blob(['%PDF-Test'], { type: 'application/pdf' }), 'etv.pdf');
    res = await fetch(`${base}/api/archiv`, { method: 'POST', headers: { cookie }, body: fd });
    assert.equal(res.status, 201);
    const eintrag = await res.json();
    assert.equal(eintrag.titel, '<b>Protokoll</b>', 'Text wird unverändert gespeichert (Ausgabe escaped das UI)');
    assert.equal(eintrag.verknuepfungen.length, 2);

    res = await fetch(`${base}/api/archiv?objekt=${objekt.id}`, { headers: { cookie } });
    assert.equal((await res.json()).eintraege.length, 1);

    res = await fetch(`${base}/api/archiv/${eintrag.id}/download`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '%PDF-Test');

    // Unbekannte Nummer → 400, keine Datei bleibt liegen
    const fd2 = new FormData();
    fd2.append('titel', 'X');
    fd2.append('objekt_nr', '7777');
    fd2.append('datei', new Blob(['x'], { type: 'application/pdf' }), 'x.pdf');
    res = await fetch(`${base}/api/archiv`, { method: 'POST', headers: { cookie }, body: fd2 });
    assert.equal(res.status, 400);
    assert.match((await res.json()).fehler, /7777/);
    await new Promise((r) => setTimeout(r, 50)); // unlink ist asynchron
    assert.equal(fs.readdirSync(uploadDir).length, 1, 'abgelehnte Datei muss entfernt werden');

    // Leser: lesen ja, hochladen/zuordnen nein
    await benutzerSvc.anlegen(db, { benutzername: 'leser2', name: 'L', passwort: 'leser12345', rolle: 'leser' });
    const r0 = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benutzername: 'leser2', passwort: 'leser12345' }) });
    const lc = r0.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/api/archiv`, { headers: { cookie: lc } })).status, 200);
    res = await fetch(`${base}/api/archiv/${eintrag.id}/verknuepfungen`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: lc }, body: JSON.stringify({ typ: 'objekt', nummer: '4010' }) });
    assert.equal(res.status, 403);

    // Ohne Anmeldung kein Download
    assert.equal((await fetch(`${base}/api/archiv/${eintrag.id}/download`)).status, 401);
  } finally {
    server.close();
  }
});

test('Vorschau-Helfer: Revision als JSON und Bootstrap als JavaScript (nicht die HTML-Seite)', async () => {
  const { server, base } = await starteTestApp();
  try {
    let res = await fetch(`${base}/.ai4-preview-bootstrap.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
    const js = await res.text();
    assert.ok(js.includes('ai4-preview-ready') && !js.includes('<html'));
    res = await fetch(`${base}/.ai4-preview-revision.json`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(typeof (await res.json()).revision, 'string');
  } finally {
    server.close();
  }
});

test('API: Kommunikation einer Adresse – Rechte und vCard', async () => {
  const { server, base, db } = await starteTestApp();
  try {
    const cookie = await login(base);
    const json = { 'Content-Type': 'application/json', cookie };
    let res = await fetch(`${base}/api/adressen`, { method: 'POST', headers: json, body: JSON.stringify({ vorname: 'Luka', nachname: 'Vujica' }) });
    const a = await res.json();
    res = await fetch(`${base}/api/adressen/${a.id}/telefone`, { method: 'POST', headers: json, body: JSON.stringify({ art: 'Funktelefon', nummer: '015254024077' }) });
    assert.equal(res.status, 201);
    res = await fetch(`${base}/api/adressen/${a.id}/kommunikation`, { headers: { cookie } });
    assert.equal((await res.json()).telefone[0].nummer, '015254024077');
    res = await fetch(`${base}/api/adressen/${a.id}/vcard`, { headers: { cookie } });
    assert.match(res.headers.get('content-type'), /text\/vcard/);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="Adresse_\d+\.vcf"/);
    assert.ok((await res.text()).includes('TEL;TYPE=CELL:015254024077'));
    // Leser darf nicht schreiben, ohne Login gar nichts
    await benutzerSvc.anlegen(db, { benutzername: 'leser3', name: 'L', passwort: 'leser12345', rolle: 'leser' });
    const r0 = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benutzername: 'leser3', passwort: 'leser12345' }) });
    const lc = r0.headers.get('set-cookie').split(';')[0];
    res = await fetch(`${base}/api/adressen/${a.id}/emails`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: lc }, body: JSON.stringify({ adresse: 'a@b.de' }) });
    assert.equal(res.status, 403);
    assert.equal((await fetch(`${base}/api/adressen/${a.id}/vcard`)).status, 401);
  } finally {
    server.close();
  }
});

test('API: Adress-Akte (Ampel, Kontakte, Wiedervorlagen) – Rechte', async () => {
  const { server, base, db } = await starteTestApp();
  try {
    const cookie = await login(base);
    const json = { 'Content-Type': 'application/json', cookie };
    const a = await (await fetch(`${base}/api/adressen`, { method: 'POST', headers: json, body: JSON.stringify({ nachname: 'Meyer' }) })).json();
    let res = await fetch(`${base}/api/adressen/${a.id}/ampel`, { method: 'PUT', headers: json, body: JSON.stringify({ ampel: 'rot', notiz: 'droht häufig mit Anwalt' }) });
    assert.equal((await res.json()).ampel, 'rot');
    res = await fetch(`${base}/api/adressen/${a.id}/kontakte`, { method: 'POST', headers: json, body: JSON.stringify({ art: 'anruf', richtung: 'eingehend', betreff: 'Beschwerde Heizung' }) });
    assert.equal(res.status, 201);
    res = await fetch(`${base}/api/adressen/${a.id}/wiedervorlagen`, { method: 'POST', headers: json, body: JSON.stringify({ faellig_am: '2026-10-20', betreff: 'Rückruf' }) });
    assert.equal(res.status, 201);
    const akte = await (await fetch(`${base}/api/adressen/${a.id}/akte`, { headers: { cookie } })).json();
    assert.equal(akte.kontakte.anzahl, 1);
    assert.equal(akte.wiedervorlagen.offen, 1);
    const ma = await (await fetch(`${base}/api/mitarbeiter`, { headers: { cookie } })).json();
    assert.deepEqual(Object.keys(ma[0]).sort(), ['id', 'kuerzel', 'name'], 'Mitarbeiterliste ohne sensible Felder');

    await benutzerSvc.anlegen(db, { benutzername: 'leser4', name: 'L', passwort: 'leser12345', rolle: 'leser' });
    const r0 = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benutzername: 'leser4', passwort: 'leser12345' }) });
    const lc = r0.headers.get('set-cookie').split(';')[0];
    res = await fetch(`${base}/api/adressen/${a.id}/ampel`, { method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: lc }, body: JSON.stringify({ ampel: 'gruen' }) });
    assert.equal(res.status, 403);
    assert.equal((await fetch(`${base}/api/adressen/${a.id}/kontakte`, { headers: { cookie: lc } })).status, 200);
    assert.equal((await fetch(`${base}/api/adressen/${a.id}/kontakte`)).status, 401);
  } finally {
    server.close();
  }
});
