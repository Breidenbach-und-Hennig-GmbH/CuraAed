'use strict';
const crypto = require('node:crypto'), { ValidationError } = require('../lib/validation');
const MODELS = ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6-luna'];
const fail = (m, s = 400) => { throw new ValidationError(m, s); };
function replay(item) {
  if (item.type === 'reasoning') return { type: 'reasoning', ...(item.id ? { id: item.id } : {}), summary: item.summary || [], ...(item.encrypted_content ? { encrypted_content: item.encrypted_content } : {}) };
  if (item.type === 'function_call') return { type: 'function_call', call_id: item.call_id, name: item.name, arguments: item.arguments };
  if (item.type === 'message' && Array.isArray(item.content)) return { role: 'assistant', ...(item.phase ? { phase: item.phase } : {}), content: item.content.filter(c => c.type === 'output_text').map(c => ({ type: 'output_text', text: c.text, annotations: [] })) };
  fail('Nicht unterstützte Modellantwort.', 502);
}
function request(messages, tools, model, maxTokens) {
  const input = [], system = [];
  for (const m of messages) {
    if (m.role === 'system') system.push(m.content);
    else if (m.role === 'tool') input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content });
    else if (m.provider_output) input.push(...m.provider_output.map(replay));
    else if (m.role === 'assistant' && m.tool_calls) {
      if (m.content) input.push({ role: 'assistant', content: m.content });
      input.push(...m.tool_calls.map(c => ({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments })));
    } else input.push({ role: m.role, content: m.content });
  }
  return { model, store: false, instructions: system.join('\n'), input, max_output_tokens: maxTokens,
    reasoning: { effort: 'low' }, include: ['reasoning.encrypted_content'],
    ...(tools.length ? { parallel_tool_calls: false, tools: tools.map(({ function: f }) => ({ type: 'function', name: f.name, description: f.description, strict: true, parameters: { ...f.parameters, required: Object.keys(f.parameters.properties) } })) } : {}) };
}
function baue(db, options = {}) {
  const aad = Buffer.from('curaaed-eddi-openai-v1');
  const seal = value => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', require('../lib/m365-schluessel')(db, options), iv); c.setAAD(aad); return Buffer.concat([iv, c.update(JSON.stringify(value)), c.final(), c.getAuthTag()]).toString('base64'); };
  const open = data => { try { const v = Buffer.from(data, 'base64'), c = crypto.createDecipheriv('aes-256-gcm', require('../lib/m365-schluessel')(db, options), v.subarray(0, 12)); c.setAAD(aad); c.setAuthTag(v.subarray(-16)); return JSON.parse(Buffer.concat([c.update(v.subarray(12, -16)), c.final()]).toString()); } catch { fail('Eddis gespeicherte KI-Einrichtung kann nicht entschlüsselt werden. Bitte Datensicherung und Einrichtung prüfen.', 503); } };
  async function load() { const r = await db.get('SELECT * FROM eddi_modell WHERE id=1'); return r ? { ...open(r.daten), revision: r.revision } : { api_key: '', modell: 'gpt-6.2-sol', tageslimit: 10, revision: 0 }; }
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  async function settings() { const c = await load(), usage = await db.get('SELECT aufrufe FROM eddi_ki_tage WHERE tag=?', [today()]); return { bereit: !!c.api_key, secret_vorhanden: !!c.api_key, modell: c.modell, tageslimit: c.tageslimit, verbraucht: usage?.aufrufe || 0, revision: c.revision, modelle: MODELS, sprachmodell: 'OpenAI' }; }
  async function save(user, b) {
    if(user.rolle !== 'admin') fail('Nur Administratoren dürfen Eddis KI-Verbindung einrichten.',403);
    if (!MODELS.includes(b.modell) || !Number.isSafeInteger(b.tageslimit) || b.tageslimit < 1 || b.tageslimit > 1000 || !Number.isSafeInteger(b.revision)) fail('Modell und Tageslimit prüfen.');
    if (typeof b.api_key !== 'string' || b.api_key.length > 500 || /[\s\x00-\x1f]/.test(b.api_key)) fail('OpenAI-Schlüssel prüfen.');
    return db.transaktion(async tx => {
      const r = await tx.get('SELECT * FROM eddi_modell WHERE id=1');
      if ((r?.revision || 0) !== b.revision) fail('KI-Einrichtung inzwischen geändert. Bitte neu öffnen.', 409);
      const old = r ? open(r.daten) : { api_key: '' }, key = b.api_key || old.api_key;
      if (!key || key.length < 20) fail('Bitte einen gültigen OpenAI-API-Schlüssel eingeben.');
      await tx.run('INSERT INTO eddi_modell(id,daten,revision,geaendert_von) VALUES(1,?,1,?) ON CONFLICT(id) DO UPDATE SET daten=excluded.daten,revision=revision+1,geaendert_von=excluded.geaendert_von,geaendert_am=CURRENT_TIMESTAMP', [seal({ api_key: key, modell: b.modell, tageslimit: b.tageslimit }), user.id]);
      return { ok: true };
    });
  }
  async function complete(messages, tools, timeout, extra = {}) {
    const c = await load();
    if (!c.api_key) fail('Bitte Eddis OpenAI-Verbindung in CuraAed einrichten. Der Schlüssel wird dort verschlüsselt gespeichert.', 503);
    await db.transaktion(async tx => {
      const tag = today(), old = await tx.get('SELECT aufrufe FROM eddi_ki_tage WHERE tag=?', [tag]);
      if ((old?.aufrufe || 0) >= c.tageslimit) fail('Eddis Tageslimit ist erreicht. Ein Administrator kann es in der KI-Einrichtung ändern.', 429);
      await tx.run('INSERT INTO eddi_ki_tage(tag,aufrufe) VALUES(?,1) ON CONFLICT(tag) DO UPDATE SET aufrufe=aufrufe+1', [tag]);
    });
    const body = request(messages, tools, c.modell, extra.maxTokens ? 16000 : 6000);
    let response;
    try { response = await (options.fetch || fetch)('https://api.openai.com/v1/responses', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeout), headers: { Authorization: 'Bearer ' + c.api_key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch { fail('Die OpenAI-Verbindung ist gerade nicht erreichbar. Bitte erneut versuchen.', 502); }
    if (!response.ok) fail(response.status === 429 ? 'OpenAI meldet ein ausgeschöpftes Kontingent oder eine Anfragegrenze. Bitte API-Guthaben und Limits prüfen.' : response.status === 401 || response.status === 403 ? 'Der OpenAI-Zugang wurde abgelehnt. Bitte Schlüssel und Projektberechtigung prüfen.' : 'OpenAI konnte die Anfrage nicht abschließen.', 502);
    const raw = await response.text(); if (raw.length > 500000) fail('Die Modellantwort ist zu groß.', 502);
    let data; try { data = JSON.parse(raw); } catch { fail('Ungültige OpenAI-Antwort.', 502); }
    if (data.status !== 'completed' || !Array.isArray(data.output)) fail('Die Modellantwort ist unvollständig. Bitte den Auftrag eingrenzen und erneut versuchen.', 502);
    const content = data.output.filter(x => x.type === 'message').flatMap(x => x.content || []);
    const refusal = content.find(x => x.type === 'refusal'); if (refusal) return { content: refusal.refusal || 'Diese Anfrage kann nicht bearbeitet werden.' };
    const calls = data.output.filter(x => x.type === 'function_call');
    if(!calls.length&&!content.some(x=>x.type==='output_text'&&x.text))fail('OpenAI hat keine verwertbare Antwort geliefert. Bitte erneut versuchen.',502);
    data.output.forEach(replay);
    return { content: content.filter(x => x.type === 'output_text').map(x => x.text).join('\n'), tool_calls: calls.map(x => ({ id: x.call_id, type: 'function', function: { name: x.name, arguments: x.arguments } })), provider_output: data.output };
  }
  return { settings, save, complete };
}
module.exports = { baue, request };
