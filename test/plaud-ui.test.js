'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const tick = () => new Promise((resolve) => setImmediate(resolve));
function aufbau(t, { eingerichtet = true, status, upload } = {}) {
  const dom = new JSDOM('<textarea></textarea>', { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  const anfragen = [];
  w.API = {
    get: () => status || Promise.resolve({ eingerichtet }),
    upload: async (url, form) => {
      anfragen.push({ url, form });
      return upload ? upload() : { zusammenfassung: 'Heizung prüfen', quelle: 'audio', abschrift: 'Die Heizung ist kalt.' };
    },
  };
  for (const name of ['ui', 'kern', 'dialoge']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', name + '.js'), 'utf8'), dom.getInternalVMContext());
  }
  const bemerkung = w.document.querySelector('textarea');
  const plaud = w.plaudBlock(bemerkung, () => 'Haus 4010');
  w.document.body.append(plaud.block);
  const datei = plaud.block.querySelector('input[type=file]');
  let files = [];
  Object.defineProperty(datei, 'files', { get: () => files });
  Object.defineProperty(datei, 'value', { get: () => '', set: (v) => { if (v === '') files = []; } });
  return {
    w, plaud, bemerkung, anfragen, datei,
    haupt: plaud.block.querySelector('.tel-plaud-knopf'),
    zust: plaud.block.querySelector('#tel_plaud_zust'),
    status: plaud.block.querySelector('.tel-plaud-status'),
    waehlen(name, size = 20) {
      files = [new w.File(['x'.repeat(size)], name)];
      datei.dispatchEvent(new w.Event('change'));
    },
  };
}

test('Plaud: Hauptaktion öffnet die Dateiauswahl direkt aus dem Klick', (t) => {
  const u = aufbau(t);
  let geoeffnet = 0;
  u.datei.click = () => geoeffnet++;
  u.haupt.click();
  assert.equal(geoeffnet, 1);
  assert.equal(u.anfragen.length, 0);
});

test('Plaud: fehlende KI wird ohne Hover erklärt; Text bleibt direkt nutzbar', async (t) => {
  const u = aufbau(t, { eingerichtet: false, upload: () => ({ zusammenfassung: 'Plaud-Notiz', quelle: 'text' }) });
  await tick();
  assert.equal(u.haupt.disabled, false);
  assert.match(u.plaud.block.querySelector('.tel-plaud-hinweis').textContent, /nicht eingerichtet/);
  u.waehlen('aufnahme.m4a');
  u.haupt.click();
  assert.equal(u.anfragen.length, 0);
  assert.match(u.status.textContent, /Administration/);
  u.waehlen('plaud.md');
  assert.equal(u.haupt.textContent, 'Text übernehmen');
  u.bemerkung.value = 'Vorhandene Notiz';
  u.haupt.click();
  await tick();
  assert.equal(u.anfragen[0].form.get('modus'), 'uebernehmen');
  assert.equal(u.bemerkung.value, 'Vorhandene Notiz\n\nPlaud-Notiz');
  assert.equal(u.haupt.textContent, 'Plaud-Datei auswählen');
});

test('Plaud: Audio benötigt Zustimmung und wird anschließend einmal verarbeitet', async (t) => {
  const u = aufbau(t);
  await tick();
  u.waehlen('aufnahme.M4A');
  assert.equal(u.zust.closest('label').hidden, false);
  u.haupt.click();
  assert.equal(u.anfragen.length, 0);
  assert.match(u.status.textContent, /Zustimmung/);
  u.zust.checked = true;
  u.haupt.click();
  u.haupt.click();
  await tick();
  assert.equal(u.anfragen.length, 1);
  assert.equal(u.anfragen[0].form.get('zustimmung'), '1');
  assert.equal(u.anfragen[0].form.get('modus'), 'zusammenfassen');
  assert.equal(u.bemerkung.value, 'Heizung prüfen');
  assert.equal(u.plaud.werte().aufnahme, 'audio');
  assert.equal(u.plaud.block.querySelector('details').hidden, false);
  assert.equal(u.zust.checked, false);
});

test('Plaud: späte Statusantwort entsperrt keinen laufenden Upload', async (t) => {
  let statusFertig, uploadFertig;
  const u = aufbau(t, {
    status: new Promise((resolve) => { statusFertig = resolve; }),
    upload: () => new Promise((resolve) => { uploadFertig = resolve; }),
  });
  u.waehlen('aufnahme.mp4');
  u.zust.checked = true;
  u.haupt.click();
  statusFertig({ eingerichtet: true });
  await tick();
  assert.equal(u.haupt.disabled, true);
  assert.equal(u.datei.disabled, true);
  assert.equal(u.plaud.block.querySelector('.tel-plaud-wechsel').disabled, true);
  uploadFertig({ zusammenfassung: 'Notiz', quelle: 'audio' });
  await tick();
  assert.equal(u.haupt.disabled, false);
});

test('Plaud: Uploadfehler bleibt sichtbar und dieselbe Datei kann erneut gesendet werden', async (t) => {
  let versuch = 0;
  const u = aufbau(t, { upload: () => {
    if (++versuch === 1) throw new Error('Dienst nicht erreichbar');
    return { zusammenfassung: 'Notiz', quelle: 'audio' };
  } });
  await tick();
  u.waehlen('aufnahme.mp3');
  u.zust.checked = true;
  u.haupt.click();
  await tick();
  assert.match(u.status.textContent, /Dienst nicht erreichbar/);
  assert.equal(u.haupt.disabled, false);
  assert.equal(u.datei.files.length, 1);
  u.haupt.click();
  await tick();
  assert.equal(u.bemerkung.value, 'Notiz');
});

test('Plaud: Dateitausch setzt Zustimmung zurück und unbekannte Dateitypen werden erklärt', async (t) => {
  const u = aufbau(t);
  await tick();
  u.waehlen('eins.mp3');
  u.zust.checked = true;
  u.waehlen('zwei.mp3');
  assert.equal(u.zust.checked, false);
  u.waehlen('export.pdf');
  u.haupt.click();
  assert.match(u.status.textContent, /TXT, MD, SRT, VTT/);
  assert.equal(u.anfragen.length, 0);
});

test('Plaud: Text wird standardmäßig übernommen; KI-Kürzen ist optional', async (t) => {
  const u = aufbau(t);
  await tick();
  u.waehlen('transkript.txt');
  const kuerzen = u.plaud.block.querySelectorAll('input[type=checkbox]')[1];
  assert.equal(kuerzen.closest('label').hidden, false);
  assert.equal(kuerzen.checked, false);
  kuerzen.checked = true;
  kuerzen.dispatchEvent(new u.w.Event('change'));
  assert.equal(u.haupt.textContent, 'Zusammenfassen');
  u.haupt.click();
  await tick();
  assert.equal(u.anfragen[0].form.get('modus'), 'zusammenfassen');
});
