'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { openDatabase } = require('../db'), users = require('../services/benutzer'), { baue } = require('../services/eddiModell');
test('OpenAI-Schlüssel bleibt verschlüsselt; Responses bewahrt Werkzeug- und Reasoning-Zusammenhang; Tageslimit ist atomar', async t => {
  const db = await openDatabase(':memory:'); t.after(() => db.close());
  const admin = await users.anlegen(db, { benutzername: 'admin', name: 'Admin', rolle: 'admin', passwort: 'test12345' });
  const employee = await users.anlegen(db, { benutzername: 'sb', name: 'Mitarbeiter', rolle: 'mitarbeiter', passwort: 'test12345' });
  const key = 'sk-fixture-not-a-real-secret-123456789', sent = [];
  const model = baue(db, { fetch: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, 'Bearer ' + key);
    const body = JSON.parse(options.body); sent.push(body); assert.equal(body.store, false); assert.equal(body.model, 'gpt-6.2-sol'); assert.equal(options.body.includes(key), false);
    if (sent.length === 1) return new Response(JSON.stringify({ status: 'completed', output: [
      { type: 'reasoning', id: 'rs_test', encrypted_content: 'opaque-fixture', summary: [] },
      { type: 'function_call', id: 'fc_test', call_id: 'call_test', name: 'suchen', arguments: '{"bereich":"objekte","suche":"Testweg"}', status: 'completed' },
    ] }));
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', id: 'msg_test', phase: 'final_answer', role: 'assistant', content: [{ type: 'output_text', text: 'Objekt gefunden.', annotations: [] }] }] }));
  } });
  await assert.rejects(model.save(employee, { modell: 'gpt-6.2-sol', api_key: key, tageslimit: 2, revision: 0 }), e => e.status === 403);
  await model.save(admin, { modell: 'gpt-6.2-sol', api_key: key, tageslimit: 2, revision: 0 });
  assert.equal((await db.get('SELECT daten FROM eddi_modell')).daten.includes(key), false);
  const settings = await model.settings(); assert.equal(settings.secret_vorhanden, true); assert.equal(JSON.stringify(settings).includes(key), false);
  const tools = require('../services/eddi').TOOLS, messages = [{ role: 'system', content: 'Du bist Eddi.' }, { role: 'user', content: 'Suche Testweg' }];
  const first = await model.complete(messages, tools, 1000);
  assert.equal(first.tool_calls[0].id, 'call_test'); assert.equal(sent[0].tools[0].strict, true);
  for (const f of sent[0].tools) assert.deepEqual(f.parameters.required, Object.keys(f.parameters.properties));
  const second = await model.complete([...messages, { role: 'assistant', content: first.content, tool_calls: first.tool_calls, provider_output: first.provider_output }, { role: 'tool', tool_call_id: 'call_test', content: '{"id":1}' }], tools, 1000);
  assert.equal(second.content, 'Objekt gefunden.'); assert.ok(sent[1].input.some(x => x.type === 'reasoning' && x.encrypted_content === 'opaque-fixture'));
  assert.ok(sent[1].input.some(x => x.type === 'function_call' && x.call_id === 'call_test'));
  assert.ok(sent[1].input.some(x => x.type === 'function_call_output' && x.call_id === 'call_test'));
  await assert.rejects(model.complete(messages, tools, 1000), e => e.status === 429); assert.equal(sent.length, 2);
  await assert.rejects(model.save(admin, { modell: 'gpt-6.2-sol', api_key: '', tageslimit: 2, revision: 0 }), e => e.status === 409);
  await model.save(admin, { modell: 'gpt-6.2-sol', api_key: '', tageslimit: 3, revision: 1 }); assert.equal((await model.settings()).secret_vorhanden, true);
});
