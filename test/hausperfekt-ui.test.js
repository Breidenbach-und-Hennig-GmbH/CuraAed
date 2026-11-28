'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const tick = () => new Promise(r => setImmediate(r));
function fixture(t, { configured = true, failLogin = false } = {}) {
  const dom = new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>', { runScripts: 'outside-only', url: 'https://curaaed.example/' });
  t.after(() => dom.window.close());
  const w = dom.window, calls = [];

  w.API = {
    get: async url => { calls.push({ method: 'GET', url }); if (url.endsWith('/abloesung')) return { mobile_aktiv:false, summen:{erfasst:3,ohne_dateikopie:1},quellen:[{subdomain:'<img src=x onerror=alert(1)>',erfasst:3,als_gesichert_vermerkt:2,ohne_dateikopie:1,mit_fehlermeldung:0}],offene_auftraege:[],hinweis:'Dateiprüfung steht aus.' }; if (url.endsWith('/status')) return { eingerichtet: configured }; if (url.endsWith('/verbindungen')) return { verbindungen: [{ id: 'own-connection', subdomain: 'kunde-a' }] }; return { data: [{ id: 17, hp_id: 100, name: '<img src=x onerror=alert(1)>' }] }; },
    post: async (url, body) => { calls.push({ method: 'POST', url, body: { ...body } }); if (failLogin) throw new Error('Anmeldung abgelehnt'); return { id: 'own-connection' }; },
  };
  for (const file of ['ui', 'kern', 'shell', 'hp-direkt', 'hp-adressen', 'hp-objekte', 'hausperfekt']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', file + '.js'), 'utf8'), dom.getInternalVMContext());
  vm.runInContext('S.lauf=1;S.benutzer={id:1,rolle:"admin"};', dom.getInternalVMContext());
  return { w, calls, async open() { await w.hausperfektMaske(); await tick(); }, button: text => [...w.document.querySelectorAll('button')].find(b => b.textContent === text) };
}
test('HP UI: Datenzugriff mit Kundenkennung, keine Speicherung oder automatische Rückübertragung', async t => {
  const f = fixture(t); await f.open();
  assert.match(f.w.document.body.textContent, /Mobile-Ansicht liest HP-Mobile-Daten/);
  f.button('kunde-a.hausperfekt-mobile.de').click(); await tick();
  assert.ok(f.calls.some(c => c.url === '/hausperfekt/verbindungen/own-connection/daten/persons?seite=1'));
  assert.equal(f.w.document.querySelectorAll('img').length, 0);
  assert.match(f.w.document.querySelector('table').textContent, /<img/);
  assert.equal(f.button('Nächste Seite').disabled, true);
  assert.equal(f.button('Vorherige Seite').disabled, true);
  assert.equal(f.calls.filter(c => c.method !== 'GET').length, 0);
});
test('HP UI: Passwort wird nach fehlgeschlagener Anmeldung geleert; Übertragung nur nach Zustimmung', async t => {
  const f = fixture(t, { failLogin: true }); await f.open();
  f.button('HP-Kundenkonto verbinden').click();
  const d = f.w.document;
  d.getElementById('f_hp_portal').value = 'https://kunde-a.hausperfekt-mobile.de/';
  d.getElementById('f_hp_username').value = 'test@example.invalid';
  const pw = d.getElementById('f_hp_password'); pw.value = 'synthetic-password';
  const form = d.querySelector('form');
  form.dispatchEvent(new f.w.Event('submit', { cancelable: true })); await tick();
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  form.querySelector('input[type=checkbox]').checked = true;
  form.dispatchEvent(new f.w.Event('submit', { cancelable: true })); await tick();
  assert.equal(pw.value, '');
  assert.match(d.querySelector('[role=dialog]').textContent, /Anmeldung abgelehnt/);
  assert.equal(f.calls.find(c => c.method === 'POST').body.zustimmung, true);
});
test('HP UI: fehlende serverseitige Anmeldung deaktiviert das Verbindungsformular', async t => {
  const f = fixture(t, { configured: false }); await f.open();
  assert.equal(f.button('HP-Kundenkonto verbinden').disabled, true);
});

test('HP UI: Bestandsprüfung liest nur CuraAed und stellt Quellnamen als Text dar', async t => {
  const f=fixture(t); await f.open(); const before=f.calls.length;
  f.button('Bestand ohne HP-Zugriff prüfen').click(); await tick();
  assert.deepEqual(f.calls.slice(before),[{method:'GET',url:'/hausperfekt/abloesung'}]);
  assert.match(f.w.document.body.textContent,/ohne Dateikopie: 1/);
  assert.match(f.w.document.body.textContent,/Vollständigkeit ist noch nicht bestätigt/);
  assert.equal(f.w.document.querySelectorAll('img').length,0);
});
