'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), { JSDOM } = require('jsdom');
const tick = () => new Promise(r => setImmediate(r));
function setup(t, role = 'mitarbeiter') {
  const dom = new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>', { runScripts: 'outside-only', url: 'https://curaaed.test/#/' });
  t.after(() => dom.window.close()); const w = dom.window;
  for (const f of ['ui', 'kern', 'shell', 'eddi', 'eddi-teilung', 'eddi-modell']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/' + f + '.js'), 'utf8'), dom.getInternalVMContext());
  w.eval('S.benutzer={id:1,rolle:' + JSON.stringify(role) + ',name:"Test"}'); return w;
}
test('Eddi zeigt die gewünschte Zeile, startet ohne Einwilligung keine KI-Anfrage und lässt sich per Esc zuklappen', async t => {
  const w = setup(t); let requests = 0;
  w.API = { get: async () => ({ bereit: true, sprachmodell: 'OpenAI', anleitungen: 0 }), post: async () => { requests++; return { chat_id: 'test', text: '<img src=x onerror=alert(1)>', schritte: [], vorschlaege: [] }; } };
  const root = w.eddiLeiste(); w.document.getElementById('hp-desktop').append(root);
  assert.match(root.textContent, /Hallo, ich bin Eddi, wie kann ich dir helfen\?/); assert.equal(requests, 0);
  const input = root.querySelector('input[type=text]'); input.value = 'Hallo'; input.focus(); await tick();
  root.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); assert.equal(requests, 0);
  root.querySelector('input[type=checkbox]').checked = true;
  root.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
  assert.equal(requests, 1); assert.match(root.textContent, /<img src=x/); assert.equal(root.querySelectorAll('img').length, 0);
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(root.querySelector('.cu-eddi-panel').hidden, true);
  assert.equal([...root.querySelectorAll('button')].some(b => b.textContent === 'KI einrichten'), false);
});
test('Administratoren erhalten KI-Einrichtung, Mitarbeiter nicht; ohne Schlüssel wird keine Verarbeitung vorgetäuscht', async t => {
  const w = setup(t, 'admin'); let writes = 0;
  w.API = { get: async () => ({ bereit: false, sprachmodell: 'OpenAI', anleitungen: 0 }), post: async () => { writes++; } };
  const root = w.eddiLeiste(); w.document.getElementById('hp-desktop').append(root);
  root.querySelector('input[type=text]').focus(); await tick();
  assert.match(root.textContent, /noch nicht verbunden/); assert.ok([...root.querySelectorAll('button')].some(b => b.textContent === 'KI einrichten'));
  root.querySelector('input[type=text]').value = 'Erstelle ein Objekt';
  root.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); assert.equal(writes, 0);
});
