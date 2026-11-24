'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../db');
const objekte = require('../services/objekte');
const fibu = require('../services/fibu');
const imp = require('../services/buchungsImport');
// Ausschließlich synthetische Daten; keine Kundenexporte im Repository.
const kopf = 'ObjNr;BJ;PN;KtoNr;JournalNr;RefKtoNr;KtoName;KtoArtKto;ObjNrGgKto;GgKtoNr;RefGgKtoNr;GgKtoName;KtoArtGgKto;BuchDat;BelegNr;BuchText;Soll;Haben;Waehrung;UStKto;RefUStKto;UStKtoName;UStKtoArt;UStArt;UStSatz;UStStS;UStSoll;';
function zeile({ pn = '1', journal = '1', konto = '8200', gegen = '9400', soll = '12,34', haben = '', storno = '', text = 'Test', datum = '01012025', ust = '', objekt = '7001' } = {}) {
  return [objekt, '2025', pn, konto, journal, '0', 'Testkonto', 'Sachkonto', objekt, gegen, '0', 'Gegenkonto', 'Sachkonto', datum, 'B-1', text, soll, haben, 'EUR', '0', '0', '', '', '', '0,00', '0', ust, '', storno].join(';');
}
function paar(pn = '1', { betrag = '12,34', storno = '', text = 'Test' } = {}) {
  return [zeile({ pn, storno, text, soll: betrag }), zeile({ pn, storno, text, journal: '2', konto: '9400', gegen: '8200', soll: '', haben: betrag })];
}
const csv = (rows = paar()) => Buffer.from([kopf, ...rows].join('\r\n'), 'utf8');
async function fixture(t) {
  const db = await openDatabase(':memory:'); t.after(() => db.close());
  const o = await objekte.anlegen(db, { nummer: '7001', bezeichnung: 'Importtest' });
  return { db, id: o.id };
}
async function uebernehmen(db, id, buf, options = {}) {
  const p = await imp.importieren(db, id, buf, { konten_anlegen: true, ...options });
  return imp.importieren(db, id, buf, { konten_anlegen: true, ...options, ausfuehren: true, pruefhash: p.pruefhash });
}
test('Vorschau schreibt keine Buchungen oder Konten; ausdrückliche Anlage und erneuter Import', async (t) => {
  const { db, id } = await fixture(t), b = csv();
  const p = await imp.importieren(db, id, b);
  assert.equal(p.neu, 2); assert.equal(p.importierbar, false); assert.equal(p.fehlende_konten.length, 2);
  assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_buchungen')).n, 0);
  assert.equal((await fibu.konten(db, id)).length, 0);
  await assert.rejects(imp.importieren(db, id, b, { ausfuehren: true }), /Vorschau/);
  const r = await uebernehmen(db, id, b); assert.equal(r.importiert, 2);
  const n = await uebernehmen(db, id, b); assert.equal(n.importiert, 0); assert.equal(n.doppelt, 2);
  assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_buchungsimporte')).n, 1);
  assert.equal((await fibu.konten(db, id, 2025)).find((x) => x.nummer === 8200).saldo, 12.34);
  assert.equal((await fibu.konten(db, id, 2026)).find((x) => x.nummer === 8200).saldo, null);
  assert.deepEqual((await fibu.grundwerte(db, id)).jahre, [2025]);
  const konto = (await fibu.konten(db, id))[0];
  await assert.rejects(fibu.kontoLoeschen(db, konto.id), /nur deaktiviert/);
  await assert.rejects(fibu.kontoAendern(db, konto.id, { nummer: 8300, art: konto.art, bezeichnung: konto.bezeichnung }), /dürfen nicht geändert/);
  await assert.rejects(db.run('UPDATE sachkonten SET art=? WHERE id=?', ['B', konto.id]), /geschuetzt/);
});
test('STORNO, negative Beträge und wiederverwendete Journalnummern bleiben unverändert', async (t) => {
  const { db, id } = await fixture(t);
  const b = csv([...paar('1', { storno: 'STORNO' }), ...paar('2', { storno: 'STORNO', betrag: '-12,34' }), ...paar('3')]);
  const r = await uebernehmen(db, id, b); assert.equal(r.importiert, 6); assert.equal(r.storno, 4);
  const rows = await imp.journal(db, id, 2025);
  assert.equal(rows.length, 6); assert.equal(rows.filter((x) => x.storno).length, 4);
  assert.equal(rows.find((x) => x.pn === '2' && x.journal === '1').soll_cents, -1234);
  assert.equal(JSON.parse(rows[0].original).zellen.at(-1), 'STORNO');
  assert.equal(rows.reduce((s, x) => s + x.soll_cents - x.haben_cents, 0), 0);
  assert.equal((await fibu.konten(db, id, 2025)).find((x) => x.nummer === 8200).saldo, 12.34);
});
test('Geänderte, unvollständige oder unbalancierte Gruppen werden gesperrt', async (t) => {
  const { db, id } = await fixture(t); await uebernehmen(db, id, csv());
  const geaendert = await imp.importieren(db, id, csv(paar('1', { text: 'Abweichung' })));
  assert.equal(geaendert.importierbar, false); assert.match(geaendert.fehler.join(), /weicht ab/);
  const einzeln = await imp.importieren(db, id, csv([zeile()])); assert.match(einzeln.fehler.join(), /nicht ausgeglichen/);
  const extra = await imp.importieren(db, id, csv([...paar(), zeile({ journal: '3', soll: '0,00' })]));
  assert.match(extra.fehler.join(), /teilweise vorhanden/);
  await assert.rejects(uebernehmen(db, id, csv([...paar('2'), zeile({ pn: '3' })])), /gesperrt/);
  assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_buchungen')).n, 2);
});
test('Vorschau bindet Datei, Optionen, Benutzer und Datenstand; parallele Übernahme atomar', async (t) => {
  const { db, id } = await fixture(t), b = csv(), options = { konten_anlegen: true };
  const p = await imp.importieren(db, id, b, options);
  for (const abweichung of [{ konten_anlegen: false }, { benutzer_id: 99 }]) {
    await assert.rejects(imp.importieren(db, id, b, { ...options, ...abweichung, ausfuehren: true, pruefhash: p.pruefhash }), /Vorschau/);
  }
  await assert.rejects(imp.importieren(db, id, csv(paar('2')), { ...options, ausfuehren: true, pruefhash: p.pruefhash }), /Vorschau/);
  const jobs = await Promise.allSettled([1, 2].map(() => imp.importieren(db, id, b, { ...options, ausfuehren: true, pruefhash: p.pruefhash })));
  assert.equal(jobs.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_buchungen')).n, 2);
});
test('Falsches Objekt, unbekannte Zusatzspalten, Umsatzsteuer und ungültige Werte sperren', async (t) => {
  const { db, id } = await fixture(t);
  for (const [rows, erwartung] of [
    [[zeile({ objekt: '7002' })], /passt nicht/],
    [[zeile({ storno: 'UNBEKANNT' })], /Zusatzangabe/],
    [[zeile({ ust: '2,34' })], /Umsatzsteuer/],
    [[zeile({ soll: '12.34' })], /Betrag/],
    [[zeile({ datum: '31022025' })], /Buchungsdatum/],
    [[zeile({ datum: '01012024' })], /außerhalb/],
    [[zeile(), zeile()], /mehrfach/],
  ]) { const p = await imp.importieren(db, id, csv(rows), { konten_anlegen: true }); assert.equal(p.importierbar, false); assert.match(p.fehler.join(), erwartung); }
  assert.throws(() => imp.auswerten(Buffer.from(kopf + '\n"offen')), /Anführungszeichen/);
});
test('ANSI, zitierte Semikolons und Ablehnung technischer Objektnummer ohne HP-Zuordnung', async (t) => {
  const { db, id } = await fixture(t);
  // Direkte Nummer bleibt verwendbar; ein technisches Präfix ohne Kopplung reicht ausdrücklich nicht.
  await db.run('UPDATE objekte SET nummer=? WHERE id=?', ['HP-test-7001', id]);
  const p = await imp.importieren(db, id, csv()); assert.equal(p.importierbar, false);
  const rs = imp.auswerten(Buffer.from([kopf, ...paar('1', { text: '"Prüfung; Gebühren"' })].join('\r\n'), 'latin1'));
  assert.equal(rs.fehler.length, 0); assert.equal(rs.zeilen[0].text, 'Prüfung; Gebühren');
});

test('HTTP: nur Schreibberechtigte dürfen importieren; Standard ist Vorschau, Übernahme braucht Prüfhash', async (t) => {
  const { db, id } = await fixture(t);
  const benutzer = require('../services/benutzer');
  await benutzer.anlegen(db, { benutzername: 'importtest', name: 'Test', passwort: 'Test-2026-Import', rolle: 'admin' });
  await benutzer.anlegen(db, { benutzername: 'leser', name: 'Leser', passwort: 'Test-2026-Leser', rolle: 'leser' });
  const app = require('../lib/appFactory').baueApp(db, { uploadDir: require('os').tmpdir() });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (name, pw) => { const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ benutzername: name, passwort: pw }) }); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; };
  const senden = (cookie, query = '', pruefhash) => {
    const fd = new FormData(); fd.append('datei', new Blob([csv()]), 'Test.csv'); fd.append('konten_anlegen', '1'); if (pruefhash) fd.append('pruefhash', pruefhash);
    return fetch(`${base}/api/objekte/${id}/buchungen/import${query}`, { method: 'POST', headers: cookie ? { cookie } : {}, body: fd });
  };
  assert.equal((await senden('')).status, 401);
  const leser = await login('leser', 'Test-2026-Leser'); assert.equal((await senden(leser)).status, 403);
  const cookie = await login('importtest', 'Test-2026-Import');
  const p = await (await senden(cookie)).json(); assert.equal(p.ausgefuehrt, false); assert.equal(p.neu, 2);
  assert.equal((await senden(cookie, '?pruefen=0')).status, 409);
  const r = await senden(cookie, '?pruefen=0', p.pruefhash); assert.equal(r.status, 200); assert.equal((await r.json()).importiert, 2);
  const journal = await fetch(`${base}/api/objekte/${id}/buchungen?jahr=2025`, { headers: { cookie } });
  assert.equal((await journal.json()).length, 2);
});
