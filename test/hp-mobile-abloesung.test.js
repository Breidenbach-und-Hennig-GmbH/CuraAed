'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { openDatabase } = require('../db');
const { baueHpMobileClient } = require('../services/hausperfektMobile');
const { baueHpVerbindungen } = require('../services/hausperfektVerbindungen');
const { bestandsbericht } = require('../services/hpMobileAbloesung');
const { pruefeDatei, pruefeArchiv } = require('../tools/hp-archiv-pruefen');

test('Abschalttest blockiert OAuth, Metadaten und Binärabrufe ohne Netzwerk oder Tokenöffnung', async t => {
  const old = process.env.HP_MOBILE_DEAKTIVIERT;
  t.after(() => { if (old === undefined) delete process.env.HP_MOBILE_DEAKTIVIERT; else process.env.HP_MOBILE_DEAKTIVIERT = old; });
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json({ clientdatabases: [{ subdomain: 'kunde' }] }); };
  const client = baueHpMobileClient({ portalUrl: 'https://kunde.hausperfekt-mobile.de/', accessToken: 'synthetic', fetchImpl });
  delete process.env.HP_MOBILE_DEAKTIVIERT;
  await client.pruefen(); // cached verification must not bypass the switch
  calls = 0;
  process.env.HP_MOBILE_DEAKTIVIERT = '1';
  for (const action of [() => client.liste('persons'), () => client.dmsDatei(1), () => client.dmsStream(1, 100)])
    await assert.rejects(action, e => e.status === 503 && !e.outcomeUnknown);
  const db = { db: { filename: ':memory:' }, get: async () => ({ id: 'x', daten: 'cannot-decrypt', subdomain: 'kunde' }) };
  const service = baueHpVerbindungen(db, { fetchImpl, oauth: { clientId: 'x', clientSecret: 'x' } });
  await assert.rejects(service.verbinden(1, { portalUrl: 'https://kunde.hausperfekt-mobile.de/', benutzername: 'test', passwort: 'test' }), e => e.status === 503);
  await assert.rejects(service.daten(1, 'x', 'persons', 1), e => e.status === 503);
  assert.equal(service.status().mobile_aktiv, false);
  assert.equal(calls, 0);
});

test('Bestandsbericht zählt Quellen ohne Kopien korrekt und behauptet keine Vollständigkeit', async t => {
  const db = await openDatabase(':memory:'); t.after(() => db.close());
  await db.run("INSERT INTO benutzer(benutzername,name,rolle,passwort_hash) VALUES('test','Test','admin','synthetic')");
  const { id } = await db.get("SELECT id FROM benutzer WHERE benutzername='test'");
  await db.run("INSERT INTO hp_dms_quellen(id,benutzer_id,subdomain) VALUES('s',?,'kunde'),('leer',?,'leer')", [id, id]);
  const bytes = Buffer.from('%PDF-test'), sha = crypto.createHash('sha256').update(bytes).digest('hex');
  for (const [n, name, hash] of [[1, 'ok.bin', sha], [2, null, null], [3, 'weg.bin', null]])
    await db.run('INSERT INTO hp_dms_dateien(quelle_id,datei_id,titel,dateiname,groesse,details,gelesen_am,speicher_name,sha256) VALUES(?,?,?,?,?,?,?,?,?)', ['s', n, 'Test', 'test.pdf', bytes.length, '{}', 'now', name, hash]);
  const r = await bestandsbericht(db);
  assert.deepEqual(r.summen, { erfasst: 3, als_gesichert_vermerkt: 2, ohne_dateikopie: 1, mit_fehlermeldung: 0, ohne_pruefsumme: 1 });
  assert.equal(r.quellen.find(q => q.id === 'leer').ohne_dateikopie, 0);
  assert.equal(r.vollstaendigkeit_bestaetigt, false);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'curaaed-abloesung-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'ok.bin'), bytes);
  const disk = await pruefeArchiv(db, dir, { hashPruefen: true });
  assert.deepEqual(disk.ergebnisse, { bestaetigt: 1, ohne_dateikopie: 1, datei_fehlt: 1 });
  assert.equal(disk.gepruefte_datensaetze, 3);
  await fs.writeFile(path.join(dir, 'ok.bin'), Buffer.from('%PDF-evil'));
  assert.equal(await pruefeDatei(dir, { speicher_name: 'ok.bin', sha256: sha, groesse: bytes.length }, true), 'pruefsumme_abweichend');
  assert.equal(await pruefeDatei(dir, { speicher_name: '../outside' }, true), 'ungueltiger_speichername');
});
