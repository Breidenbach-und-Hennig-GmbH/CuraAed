'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { JSDOM } = require('jsdom');
const tick = () => new Promise(r => setImmediate(r));
test('Import lässt sich mit Datei, Tab und F2 bedienen; neue Zuordnung entwertet die Vorschau und HTML bleibt Text', async t => {
  const dom = new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>', { runScripts: 'outside-only', url: 'https://curaaed.test/#/adressimport' });
  t.after(() => dom.window.close()); const w = dom.window;
  for (const f of ['ui', 'kern', 'dialoge', 'shell', 'masken', 'adressimport']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/' + f + '.js'), 'utf8'), dom.getInternalVMContext());
  w.eval('S.lauf=1;S.benutzer={id:1,rolle:"admin",name:"Test"}');
  w.FileReader = class { readAsDataURL() { this.result = 'data:text/csv;base64,TmFtZQpMaQ=='; this.onload(); } };
  let plans = 0, writes = 0;
  w.API = { post: async url => {
    if (url.endsWith('/datei')) return { kopf: ['Name', 'Vorname'], felder: { nachname: 'Nachname', vorname: 'Vorname' }, zuordnung: { nachname: 0, vorname: 1 }, anzahl: 1 };
    if (url.endsWith('/vorschau')) { plans++; return { neu: 1, dubletten: 0, fehler: 0, pruefsumme: 'proof', zeilen: [{ zeile: 2, status: 'neu', adresse: { nachname: '<img src=x onerror=alert(1)>' } }] }; }
    writes++; throw new Error('unbeauftragter Schreibversuch');
  } };
  w.adressImportMaske();
  const file = w.document.querySelector('input[type=file]'); assert.equal(w.document.activeElement, file);
  Object.defineProperty(file, 'files', { value: [new w.File(['Name\nLi'], 'adressen.csv')] });
  file.dispatchEvent(new w.Event('change')); await tick(); await tick();
  const take = [...w.document.querySelectorAll('button')].find(x => x.textContent === 'Übernehmen' && x.parentElement.className === 'cu-import-datei');
  assert.equal(take.disabled, true);
  const name = w.document.getElementById('import_nachname'); assert.equal(name.tabIndex, 0); name.focus();
  name.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true })); await tick();
  assert.equal(plans, 1); assert.equal(writes, 0); assert.equal(take.disabled, false);
  assert.match(w.document.body.textContent, /<img src=x/); assert.equal(w.document.querySelectorAll('img').length, 0);
  name.dispatchEvent(new w.Event('change')); assert.equal(take.disabled, true);
  assert.equal(w.document.querySelectorAll('.cu-import-vorschau tr').length, 0);
});
