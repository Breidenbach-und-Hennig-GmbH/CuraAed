'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { portalKennung, personenAenderung, baueHpMobileClient } = require('../services/hausperfektMobile');

const person = { id: 23, hp_id: 'HP-023', firstname: 'Test', lastname: 'Person', address: { id: 51, street: 'Testweg 1', zip: '12345', city: 'Teststadt', country: 'DE' }, emails: [{ id: 7, email: 'alt@example.invalid' }], phonenumbers: [{ id: 8, number: '01234567' }] };

function fixture({ subdomain = 'kunde-a', database = subdomain, canUpdate = true, respond } = {}) {
  const calls = [];
  const client = baueHpMobileClient({ portalUrl: 'https://' + subdomain + '.hausperfekt-mobile.de/', accessToken: 'test-token-' + subdomain,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/whoami')) return Response.json({ clientdatabases: [{ subdomain: database, erp: 'hpXpa' }], is_admin: canUpdate });
      return respond ? respond(url, options) : Response.json({ id: 61, data: [person] }, { status: options.method === 'POST' ? 201 : 200 });
    },
  });
  return { client, calls };
}

test('HP-Mobile: kundenspezifische Portaladresse; keine fremden Hosts, Pfade oder Header-Injektion', () => {
  assert.equal(portalKennung('https://sd-gm.hausperfekt-mobile.de/'), 'sd-gm');
  for (const url of ['http://sd-gm.hausperfekt-mobile.de/', 'https://sd-gm.hausperfekt-mobile.de.evil.invalid/', 'https://user:pass@sd-gm.hausperfekt-mobile.de/', 'https://api.hausperfekt-mobile.de/', 'https://sd-gm.hausperfekt-mobile.de/path', 'https://sd-gm.hausperfekt-mobile.de/?x=1', 'https://a.b.hausperfekt-mobile.de/']) assert.throws(() => portalKennung(url));
});

test('HP-Mobile: Bearer und HPAPI-DOM bleiben bei parallelen Kundenaufrufen getrennt', async () => {
  const a = fixture(), b = fixture({ subdomain: 'kunde-b' });
  await Promise.all([a.client.liste('buildings'), b.client.liste('buildings')]);
  for (const [f, subdomain] of [[a, 'kunde-a'], [b, 'kunde-b']]) for (const call of f.calls) {
    assert.equal(new URL(call.url).origin, 'https://api.hausperfekt-mobile.de');
    assert.equal(call.options.headers['HPAPI-DOM'], subdomain);
    assert.equal(call.options.headers.Authorization, 'Bearer test-token-' + subdomain);
    assert.equal(call.options.redirect, 'error');
  }
  assert.match(a.calls[1].url, /\/api\/v1\/buildings\?pageNum=1&pageSize=50$/);
});

test('HP-Mobile: fremde Kundenzuordnung verhindert Datenabruf und Schreibaufruf', async () => {
  const f = fixture({ database: 'anderer-kunde' });
  await assert.rejects(f.client.liste('persons'), e => e.status === 403);
  await assert.rejects(f.client.personenAenderungAnfordern(person, { firstname: 'Neu', confirm_data: true }), e => e.status === 403);
  assert.ok(f.calls.every(c => c.url.endsWith('/whoami')));
});

test('HP-Mobile: bestehender Änderungsantrag erhält HP-Referenzen, unveränderte Felder und Löschmarkierungen', () => {
  const original = structuredClone(person);
  const payload = personenAenderung(person, { firstname: 'Neu', address: { street: 'Testweg 2' }, emails: [{ email: 'neu@example.invalid' }], confirm_data: true });
  assert.deepEqual(person, original);
  assert.equal(payload.person_id, 23);
  assert.deepEqual(JSON.parse(payload.current_data), original);
  const updated = JSON.parse(payload.updated_data);
  assert.equal(updated.hp_id, 'HP-023');
  assert.equal(updated.address.id, 51);
  assert.equal(updated.address.city, 'Teststadt');
  assert.equal(updated.address.street, 'Testweg 2');
  assert.equal(updated.emails[1].id, 7);
  assert.equal(updated.emails[1].removed, true);
  assert.deepEqual(updated.phonenumbers, original.phonenumbers);
  assert.throws(() => personenAenderung(person, { firstname: 'Neu' }));
  assert.throws(() => personenAenderung(person, { client_database_id: 99, confirm_data: true }));
});

test('HP-Mobile: bestätigte Anfrage wird nicht als abgeschlossener ERP-Abgleich ausgegeben und sendet keine E-Mails', async () => {
  const f = fixture();
  const result = await f.client.personenAenderungAnfordern(person, { firstname: 'Neu', confirm_data: true });
  assert.equal(result.zustand, 'in_hp_angefordert');
  assert.equal(result.anfrage.id, 61);
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls[1].url.endsWith('/api/v1/person_updaterequests'));
  assert.equal(f.calls[1].options.method, 'POST');
  assert.equal(JSON.parse(f.calls[1].options.body).person_id, 23);
  await f.client.personenAenderungsStatus(61);
  assert.ok(f.calls[2].url.endsWith('/person_updaterequests/61/process'));
  assert.equal(f.calls[2].options.method, 'GET');
  assert.ok(f.calls.every(c => !c.url.includes('/notifications/')));
});

test('HP-Mobile: eingeschränkter Zugang kann lesen, aber keine Verwalteränderungen anfordern', async () => {
  const f = fixture({ canUpdate: false });
  await f.client.liste('persons');
  await assert.rejects(f.client.personenAenderungAnfordern(person, { firstname: 'Neu', confirm_data: true }), e => e.status === 403);
  assert.ok(f.calls.every(c => c.options.method === 'GET'));
});

test('HP-Mobile: unsicherer Ausgang einer Schreibanfrage wird nicht automatisch erneut übertragen', async () => {
  const f = fixture({ respond: async () => { throw new Error('network: test-token-secret'); } });
  await assert.rejects(f.client.personenAenderungAnfordern(person, { firstname: 'Neu', confirm_data: true }), e => e.outcomeUnknown && !e.message.includes('secret'));
  assert.equal(f.calls.filter(c => c.options.method === 'POST').length, 1);
});

test('HP-Mobile: fehlende Rechte, abgelaufene Tokens und ungültige IDs erzeugen keine unkontrollierten Folgeaufrufe', async () => {
  const f = fixture({ respond: async () => new Response('private provider details', { status: 401 }) });
  await assert.rejects(f.client.holen('persons', '../whoami'), e => e.status === 400);
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.client.liste('notifications'), e => e.status === 400);
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.client.holen('persons', 23), e => e.status === 401 && !e.message.includes('private'));
});
