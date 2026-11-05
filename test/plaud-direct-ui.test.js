'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const tick = () => new Promise((r) => setImmediate(r));

function aufbau(t, { verbunden = true, notizen, get } = {}) {
  const dom = new JSDOM('<textarea id="bemerkung"></textarea><div id="modal-container"></div><div id="toast-container"></div>', { runScripts: 'outside-only', url: 'https://curaaed.example/' });
  t.after(() => dom.window.close());
  const w = dom.window, anfragen = [];
  w.API = {
    get: async (url) => {
      anfragen.push({ methode: 'GET', url });
      if (get) return get(url);
      if (url === '/plaud/status') return { verfuegbar: true, verbunden };
      if (url === '/gespraech/status') return { eingerichtet: false };
      if (url.includes('/notizen')) return { notizen: notizen || [{ titel: 'Kurz', text: 'Heizung prüfen' }, { titel: 'Lang', text: 'Heizung ist kalt.' }] };
      return { gespraeche: [{ id: 'gespraech-1', name: '<img src=x onerror=alert(1)>', datum: '2026-11-05T10:00:00Z' }], weitere: false };
    },
    post: async (url, body) => { anfragen.push({ methode: 'POST', url, body }); return { url: 'https://mcp.plaud.ai/authorize?state=test' }; },
  };
  for (const name of ['ui', 'kern', 'dialoge', 'plaud']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', name + '.js'), 'utf8'), dom.getInternalVMContext());
  const bemerkung = w.document.getElementById('bemerkung');
  const block = w.plaudBlock(bemerkung, () => '', null);
  w.document.body.append(block.block);
  const klicken = (text) => {
    const button = [...w.document.querySelectorAll('button')].find((b) => b.textContent === text);
    assert.ok(button, text);
    button.click();
    return button;
  };
  return { w, bemerkung, block, anfragen, klicken, async oeffnen() { klicken('Gespräch aus Plaud auswählen'); await tick(); await tick(); } };
}

test('Plaud direkt: Gespräch auswählen, Variante bearbeiten und vorhandene Bemerkung erhalten, ohne den Telefoneingang zu speichern', async (t) => {
  const u = aufbau(t);
  u.bemerkung.value = 'Vorhandene Notiz';
  await u.oeffnen();
  assert.equal(u.w.document.querySelectorAll('img').length, 0);
  u.w.document.querySelector('.plaud-gespraech').click();
  await tick();
  assert.equal(u.bemerkung.value, 'Vorhandene Notiz');
  const variante = u.w.document.getElementById('plaud-notiz');
  variante.value = '1';
  variante.dispatchEvent(new u.w.Event('change'));
  const vorschau = u.w.document.getElementById('plaud-vorschau');
  assert.equal(vorschau.value, 'Heizung ist kalt.');
  vorschau.value = 'Heizung ist kalt. Handwerker anrufen.';
  u.klicken('In Telefoneingang übernehmen');
  assert.equal(u.bemerkung.value, 'Vorhandene Notiz\n\nHeizung ist kalt. Handwerker anrufen.');
  assert.equal(u.w.document.querySelectorAll('[role=dialog]').length, 0);
  assert.equal(u.anfragen.filter((a) => a.methode !== 'GET').length, 0);
});

test('Plaud direkt: fehlende Zusammenfassung und zu langer Text verändern keine vorhandene Bemerkung', async (t) => {
  const u = aufbau(t, { notizen: [] });
  u.bemerkung.value = 'Vorhandene Notiz';
  await u.oeffnen();
  u.w.document.querySelector('.plaud-gespraech').click();
  await tick();
  assert.match(u.w.document.querySelector('.plaud-auswahl').textContent, /noch keine Zusammenfassung/);
  assert.equal(u.klicken('In Telefoneingang übernehmen').disabled, true);
  assert.equal(u.bemerkung.value, 'Vorhandene Notiz');
  const v = aufbau(t, { notizen: [{ titel: 'Lang', text: 'x'.repeat(4001) }] });
  v.bemerkung.value = 'Bestehend';
  await v.oeffnen();
  v.w.document.querySelector('.plaud-gespraech').click();
  await tick();
  v.klicken('In Telefoneingang übernehmen');
  assert.equal(v.bemerkung.value, 'Bestehend');
  assert.equal(v.w.document.getElementById('plaud-vorschau').value.length, 4001);
  assert.match(v.w.document.querySelector('.plaud-auswahl').textContent, /zu lang/);
});

test('Plaud direkt: Anmeldung erst nach bewusster Bestätigung; US-Hinweis und ursprünglicher Entwurf bleiben sichtbar', async (t) => {
  const u = aufbau(t, { verbunden: false });
  u.bemerkung.value = 'Nicht gespeicherter Entwurf';
  await u.oeffnen();
  assert.match(u.w.document.querySelector('[role=dialog]').textContent, /USA/);
  assert.equal(u.anfragen.filter((a) => a.methode === 'POST').length, 0);
  u.klicken('Weiter zur Plaud-Anmeldung');
  await tick();
  const p = u.anfragen.find((a) => a.methode === 'POST');
  assert.equal(p.url, '/plaud/verbinden');
  assert.equal(p.body.zustimmung, true);
  const link = u.w.document.querySelector('.plaud-anmelden');
  assert.equal(link.hidden, false);
  assert.equal(link.target, '_blank');
  assert.equal(link.origin, 'https://mcp.plaud.ai');
  assert.equal(u.bemerkung.value, 'Nicht gespeicherter Entwurf');
});

test('Plaud direkt: eine verspätete Notiz eines früher ausgewählten Gesprächs überschreibt keine neuere Auswahl', async (t) => {
  let altFertig;
  const u = aufbau(t, { get: async (url) => {
    if (url === '/plaud/status') return { verfuegbar: true, verbunden: true };
    if (url.includes('/notizen')) return url.includes('/alt/') ? new Promise((r) => { altFertig = r; }) : { notizen: [{ titel: 'Neu', text: 'Neue Notiz' }] };
    return { gespraeche: [{ id: 'alt', name: 'Alt' }, { id: 'neu', name: 'Neu' }], weitere: false };
  } });
  await u.oeffnen();
  const buttons = u.w.document.querySelectorAll('.plaud-gespraech');
  buttons[0].click();
  buttons[1].click();
  await tick();
  altFertig({ notizen: [{ titel: 'Alt', text: 'Alte Notiz' }] });
  await tick();
  assert.equal(u.w.document.getElementById('plaud-vorschau').value, 'Neue Notiz');
});
