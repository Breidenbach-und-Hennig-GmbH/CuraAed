'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { openDatabase } = require('../db'), users = require('../services/benutzer'), svc = require('../services/teilungserklaerung');
const anteil = require('../lib/te-anteil');
const pages = [{ seite: 1, text: 'Haus Testweg 1. Einheit 1: 123,45/10.000 MEA. Einheit 2: 9876,55/10.000 MEA. Das Stimmrecht richtet sich nach Miteigentumsanteilen.', konfidenz: 90 }];
const result = () => ({ objekt: { bezeichnung: 'WEG Testweg', strasse: 'Testweg 1', plz: '01234', ort: 'Teststadt', beleg: { seite: 1, zitat: 'Haus Testweg 1.' } }, wohnungen: [
  { nummer: '1', bezeichnung: 'Wohnung 1', art: 'wohnung', lage: 'EG', mea: '123,45/10.000', beleg: { seite: 1, zitat: 'Einheit 1: 123,45/10.000 MEA.' } },
  { nummer: '2', bezeichnung: 'Wohnung 2', art: 'wohnung', lage: 'OG', mea: '9876,55/10.000', beleg: { seite: 1, zitat: 'Einheit 2: 9876,55/10.000 MEA.' } },
], stimmregeln: [{ prinzip: 'mea', mehrheit: 'einfach', basis: 'abgegeben', geltung: 'allgemein', verfahren: 'versammlung', text: 'Stimmrecht nach MEA', beleg: { seite: 1, zitat: 'Das Stimmrecht richtet sich nach Miteigentumsanteilen.' } }], hinweise: ['Nachträge prüfen.'] });
async function setup(t, overrides = {}) {
  const db = await openDatabase(':memory:'), dir = await fs.mkdtemp(path.join(os.tmpdir(), 'curaaed-te-test-'));
  t.after(async () => { await db.close(); if (path.dirname(dir) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith('curaaed-te-test-')) await fs.rm(dir, { recursive: true, force: true }); });
  const a = await users.anlegen(db, { benutzername: 'a', name: 'A', passwort: 'test12345' }), b = await users.anlegen(db, { benutzername: 'b', name: 'B', passwort: 'test12345' });
  return { db, dir, a, b, te: svc.baue(db, dir, { lesen: async () => pages, complete: async () => ({ content: JSON.stringify(result()) }), ...overrides }) };
}
async function warten(te, user, id) { for (let i = 0; i < 200; i++) { const r = await te.stand(user, id); if (!['lesen', 'auswerten'].includes(r.status)) return r; await new Promise(r => setTimeout(r, 5)); } throw Error('Job bleibt hängen'); }
async function lesen(te, user) { const r = await te.starten(user, { buffer: Buffer.from('%PDF-Test'), originalname: 'Test.pdf' }); assert.equal((await warten(te, user, r.id)).status, 'gelesen'); return r.id; }

test('Dezimale MEA-Brüche werden exakt verarbeitet und Fundstellen gegen echte Seiten geprüft', () => {
  assert.equal(anteil('123,45/10.000'), '2469/200000'); assert.equal(anteil('1.602,50/10.000'), '641/4000');
  assert.equal(anteil('123.45/10000'), '2469/200000'); assert.throws(() => anteil('1/0'));
  const d = svc.vorschlag(result(), pages); assert.equal(d.wohnungen[0].mea_original, '123,45/10.000'); assert.equal(d.stimmregeln[0].basis, 'abgegeben');
  const wrong = result(); wrong.wohnungen[0].beleg.seite = 2; assert.throws(() => svc.vorschlag(wrong, pages));
  wrong.wohnungen[0].beleg = { seite: 1, zitat: 'Frei erfundene Zahlen für eine Wohnung' }; assert.throws(() => svc.vorschlag(wrong, pages));
});

test('PDF bleibt persönlich; Auswertung verlangt Zustimmung und legt noch keine Objekte an', async t => {
  let calls = 0; const { db, a, b, te } = await setup(t, { complete: async () => { calls++; return { content: JSON.stringify(result()) }; } });
  const job = await lesen(te, a);
  await assert.rejects(te.stand(b, job), e => e.status === 404);
  await assert.rejects(te.analysieren(a, job, false), e => e.status === 403); assert.equal(calls, 0);
  await te.analysieren(a, job, true); const r = await warten(te, a, job); assert.equal(r.status, 'analysiert'); assert.equal(calls, 1);
  assert.equal((await db.get('SELECT COUNT(*) n FROM objekte')).n, 0);
  await assert.rejects(te.uebernehmen(a, job, { daten: r.ergebnis }), e => e.status === 400);
});

test('Browser-Dateinamen mit Umlauten bleiben lesbar und werden korrekt archiviert', async t => {
  const { a, te } = await setup(t);
  const original = 'Teilungserklärung Südring.pdf';
  for (const name of [original, Buffer.from(original, 'utf8').toString('latin1')]) {
    const job = await te.starten(a, { buffer: Buffer.from('%PDF-Test'), originalname: name });
    assert.equal((await warten(te, a, job.id)).dateiname, original);
  }
});

test('Bestätigte Anlage ist atomar und wiederholbar; Original wird archiviert, ETV-Stimmprinzip bleibt ungeprüft', async t => {
  const { db, a, te } = await setup(t), job = await lesen(te, a);
  await te.analysieren(a, job, true); const r = await warten(te, a, job);
  const req = { daten: r.ergebnis, objektnummer: '90001', geprueft: true };
  const saved = await te.uebernehmen(a, job, req); assert.ok(saved.objekt_id);
  assert.equal((await te.uebernehmen(a, job, req)).objekt_id, saved.objekt_id);
  assert.equal((await db.get('SELECT COUNT(*) n FROM objekte')).n, 1); assert.equal((await db.get('SELECT COUNT(*) n FROM einheiten')).n, 2);
  assert.equal((await db.get('SELECT COUNT(*) n FROM dokumente')).n, 1);
  const conf = await require('../services/abstimmungen').config(db, saved.objekt_id);
  assert.equal(conf.daten.prinzip, 'mea'); assert.equal(conf.daten.geprueft, false); assert.equal(conf.teilungserklaerung.stimmregeln.length, 1);
  const q = require('../lib/stimmbruch'), values = await db.all('SELECT mea FROM einheiten');
  assert.equal(q.str(values.reduce((sum, r) => q.add(sum, q.parse(r.mea)), q.q(0n))), '1');
});

test('Fehlerhafte letzte Einheit rollt Objekt, Wohnungen und Archiv gemeinsam zurück', async t => {
  const { db, a, te } = await setup(t), job = await lesen(te, a); await te.analysieren(a, job, true);
  const r = await warten(te, a, job); r.ergebnis.wohnungen[1].nummer = r.ergebnis.wohnungen[0].nummer;
  await assert.rejects(te.uebernehmen(a, job, { daten: r.ergebnis, geprueft: true }));
  for (const table of ['objekte', 'einheiten', 'dokumente', 'objekt_teilungserklaerung']) assert.equal((await db.get('SELECT COUNT(*) n FROM ' + table)).n, 0);
});

test('Erfundene Fundstelle oder fehlende vollständige Seiten führen zu einem Fehler statt Teilimport', async t => {
  const wrong = result(); wrong.stimmregeln[0].beleg.zitat = 'Nicht im Dokument vorhanden';
  const { db, a, te } = await setup(t, { complete: async () => ({ content: JSON.stringify(wrong) }) });
  const job = await lesen(te, a); await te.analysieren(a, job, true); const r = await warten(te, a, job);
  assert.equal(r.status, 'fehler'); assert.match(r.meldung, /Fundstelle/); assert.equal((await db.get('SELECT COUNT(*) n FROM objekte')).n, 0);
});

test('Sonderregeln werden nicht als allgemeines Stimmprinzip gesetzt; fehlende MEA und Dubletten bleiben gesperrt',async t=>{
  const raw=result();raw.stimmregeln[0].geltung='sonderfall';
  const {db,a,te}=await setup(t,{complete:async()=>({content:JSON.stringify(raw)})}),job=await lesen(te,a);await te.analysieren(a,job,true);const r=await warten(te,a,job);
  const missing=structuredClone(r.ergebnis);missing.wohnungen[0].mea='';await assert.rejects(te.uebernehmen(a,job,{daten:missing,geprueft:true}),/MEA/);
  const sum=structuredClone(r.ergebnis);sum.wohnungen[0].mea='1/10000';await assert.rejects(te.uebernehmen(a,job,{daten:sum,geprueft:true}),/Ganzes/);
  const saved=await te.uebernehmen(a,job,{daten:r.ergebnis,geprueft:true});assert.equal((await db.get('SELECT COUNT(*) n FROM objekt_stimmregeln')).n,0);
  const job2=await lesen(te,a);await te.analysieren(a,job2,true);const next=await warten(te,a,job2);next.ergebnis.objekt.strasse='TESTWEG  1';
  await assert.rejects(te.uebernehmen(a,job2,{daten:next.ergebnis,geprueft:true}),e=>e.status===409);
  assert.equal((await db.get('SELECT COUNT(*) n FROM objekte')).n,1);assert.ok(saved.objekt_id);
});

function vorbereitung(){const r=result();return{format:'curaaed-teilung-vorbereitung-v1',quelle:{sha256:require('node:crypto').createHash('sha256').update('%PDF-Test').digest('hex'),pdf_seiten:1},ergebnis:{...r,objekt_belege:[r.objekt.beleg],wohnungen:r.wohnungen.map(w=>({...w,mea_original:w.mea}))}};}
test('Manuelle Vorbereitung prüft Original, Eigentümer und Fundstellen ohne Modellaufruf',async t=>{
 const {db,a,b,te}=await setup(t,{complete:async()=>{throw Error('Kein Modellaufruf erlaubt');}}),job=await lesen(te,a),data=vorbereitung();
 await assert.rejects(te.vorbereiten(b,job,data),e=>e.status===404);
 const wrong=structuredClone(data);wrong.quelle.sha256='0'.repeat(64);await assert.rejects(te.vorbereiten(a,job,wrong),/Original/);
 wrong.quelle.sha256=data.quelle.sha256;wrong.ergebnis.wohnungen[0].beleg.zitat='Frei erfundene Fundstelle';await assert.rejects(te.vorbereiten(a,job,wrong),/Fundstelle/);
 await te.vorbereiten(a,job,data);const r=await te.stand(a,job);assert.equal(r.status,'analysiert');assert.equal(r.ergebnis.vorlaeufig,true);assert.equal(r.ergebnis.herkunft,'manuelle_vorbereitung');
 assert.equal((await db.get('SELECT COUNT(*) n FROM objekte')).n,0);
});
test('Vorläufige Übernahme bleibt lokal, archiviert das Original und verhindert Wiederholung und Dubletten',async t=>{
 const {db,a,te}=await setup(t),job=await lesen(te,a);await te.vorbereiten(a,job,vorbereitung());const r=await te.stand(a,job);
 await assert.rejects(te.uebernehmen(a,job,{daten:r.ergebnis,geprueft:true,objektnummer:'4236'}),/VORL-/);
 const request={daten:r.ergebnis,geprueft:true,objektnummer:'VORL-TEST'};const saved=await te.uebernehmen(a,job,request);
 assert.equal((await te.uebernehmen(a,job,request)).objekt_id,saved.objekt_id);
 const object=await db.get('SELECT * FROM objekte WHERE id=?',[saved.objekt_id]);assert.match(object.bezeichnung,/^VORLÄUFIG/);assert.match(object.notizen,/nicht mit HausPerfekt gekoppelt/);
 for(const table of ['hp_objekt_zuordnung','hp_einheit_zuordnung'])assert.equal((await db.get('SELECT COUNT(*) n FROM '+table)).n,0);
 const config=await require('../services/abstimmungen').config(db,saved.objekt_id);assert.equal(config.daten.prinzip,'mea');assert.equal(config.daten.geprueft,false);
 assert.equal((await db.get('SELECT COUNT(*) n FROM archiv_verknuepfungen')).n,3);
 await assert.rejects(te.vorbereiten(a,job,vorbereitung()),e=>e.status===409);
 const other=await lesen(te,a);await te.vorbereiten(a,other,vorbereitung());const next=await te.stand(a,other);await assert.rejects(te.uebernehmen(a,other,{daten:next.ergebnis,geprueft:true}),e=>e.status===409);
 assert.equal((await db.get('SELECT COUNT(*) n FROM objekte')).n,1);
});
