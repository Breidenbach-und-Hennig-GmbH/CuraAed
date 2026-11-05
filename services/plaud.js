'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ValidationError } = require('../lib/validation');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

// Public Plaud MCP OAuth metadata checked against the live discovery endpoints.
const ORIGIN = 'https://mcp.plaud.ai';
const RESOURCE = ORIGIN + '/mcp';
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const zufall = () => crypto.randomBytes(32).toString('base64url');
const nichtVerbunden = () => new ValidationError('Bitte dein persönliches Plaud-Konto verbinden.', 409);

function publicUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return url;
  } catch { return null; }
}

function schluessel(db) {
  if (process.env.PLAUD_TOKEN_KEY) {
    const key = Buffer.from(process.env.PLAUD_TOKEN_KEY, 'base64');
    if (key.length !== 32) throw new ValidationError('Die Plaud-Verbindung ist auf dem Server noch nicht korrekt eingerichtet.', 503);
    return key;
  }
  // Key lives beside the persistent DB, separately from encrypted DB contents.
  const filename = db.db.filename;
  if (filename === ':memory:') return crypto.randomBytes(32);
  const keyPath = path.join(path.dirname(path.resolve(filename)), '.plaud-token-key');
  try { fs.writeFileSync(keyPath, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
  const key = fs.readFileSync(keyPath);
  if (key.length !== 32) throw new Error('Ungültige Plaud-Schlüsseldatei');
  return key;
}

function verschluesseln(key, value, benutzerId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(benutzerId)));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
function entschluesseln(key, value, benutzerId) {
  const b = Buffer.from(value, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  decipher.setAAD(Buffer.from(String(benutzerId)));
  decipher.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString('utf8'));
}

// Plaud wraps JSON in a randomized untrusted-data marker. Parse data only;
// never render provider HTML, execute instructions, or follow data_link URLs.
function toolDaten(result) {
  if (result.isError) throw new ValidationError('Plaud konnte die Daten nicht abrufen. Bitte erneut versuchen; gegebenenfalls Plaud neu verbinden.', 502);
  if (result.structuredContent) return result.structuredContent;
  const text = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  const wrapped = text.match(/<(untrusted-user-data-[a-f0-9]+) source="plaud-recording">\s*([\s\S]*?)\s*<\/\1>/);
  try { return JSON.parse(wrapped ? wrapped[2] : text); }
  catch { throw new ValidationError('Plaud hat ein unbekanntes Datenformat geliefert.', 502); }
}

async function mcpAufruf(token, name, args, fetchImpl) {
  const client = new Client({ name: 'CuraAedificii', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(RESOURCE), {
    requestInit: { headers: { Authorization: 'Bearer ' + token } },
    fetch: (url, init = {}) => fetchImpl(url, { ...init, signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(20000)]) }),
    reconnectionOptions: { maxReconnectionDelay: 1000, initialReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1, maxRetries: 0 },
  });
  try {
    await client.connect(transport, { timeout: 20000 });
    return toolDaten(await client.callTool({ name, arguments: args }, undefined, { timeout: 20000 }));
  } finally { await client.close().catch(() => {}); }
}

function bauePlaud(db, options = {}) {
  const appUrl = publicUrl(options.publicUrl || process.env.APP_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL);
  const callback = appUrl ? new URL('/api/plaud/callback', appUrl).href : null;
  const fetchImpl = options.fetch || ((...args) => fetch(...args));
  const aufruf = options.callTool || ((token, name, args) => mcpAufruf(token, name, args, fetchImpl));
  const queues = new Map();
  let key;
  const keyHolen = () => (key ||= schluessel(db));
  function exklusiv(id, fn) {
    const p = (queues.get(id) || Promise.resolve()).then(fn, fn);
    queues.set(id, p);
    return p.finally(() => { if (queues.get(id) === p) queues.delete(id); });
  }
  async function lesen(id) {
    const row = await db.get('SELECT daten FROM plaud_verbindungen WHERE benutzer_id=?', [id]);
    if (!row) throw nichtVerbunden();
    try { return entschluesseln(keyHolen(), row.daten, id); }
    catch { throw new ValidationError('Die gespeicherte Plaud-Verbindung konnte nicht geöffnet werden. Bitte die Verbindung entfernen und erneut anmelden.', 409); }
  }
  async function speichern(id, data) {
    await db.run('INSERT INTO plaud_verbindungen (benutzer_id,daten) VALUES (?,?) ON CONFLICT(benutzer_id) DO UPDATE SET daten=excluded.daten', [id, verschluesseln(keyHolen(), data, id)]);
  }
  async function jsonAnfrage(endpoint, body, form = false) {
    let res;
    try {
      res = await fetchImpl(ORIGIN + endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', Accept: 'application/json' },
        body: form ? new URLSearchParams(body) : JSON.stringify(body),
      });
    } catch { throw new ValidationError('Plaud ist gerade nicht erreichbar. Bitte später erneut versuchen.', 502); }
    if (!res.ok) {
      const e = new ValidationError('Die Plaud-Anmeldung wurde abgelehnt. Bitte Plaud erneut verbinden.', res.status >= 500 || res.status === 429 ? 502 : 409);
      e.anmeldungAbgelehnt = res.status === 400 || res.status === 401;
      throw e;
    }
    try { return await res.json(); } catch { throw new ValidationError('Plaud hat eine ungültige Antwort geliefert.', 502); }
  }
  function tokenDaten(tokens, previous = {}) {
    if (typeof tokens.access_token !== 'string' || !tokens.access_token) throw new ValidationError('Plaud hat keine gültige Anmeldung geliefert.', 502);
    return { ...previous, access_token: tokens.access_token, refresh_token: tokens.refresh_token || previous.refresh_token,
      expires_at: Date.now() + (Number(tokens.expires_in) > 0 ? Number(tokens.expires_in) : 3600) * 1000 };
  }
  async function erneuern(id, data) {
    if (!data.refresh_token) throw nichtVerbunden();
    try {
      const tokens = await jsonAnfrage('/token', { grant_type: 'refresh_token', refresh_token: data.refresh_token, client_id: data.client_id, resource: RESOURCE }, true);
      const neu = tokenDaten(tokens, data);
      await speichern(id, neu);
      return neu;
    } catch (e) {
      if (e.anmeldungAbgelehnt) await db.run('DELETE FROM plaud_verbindungen WHERE benutzer_id=?', [id]);
      throw e;
    }
  }
  async function mitPlaud(id, name, args) {
    return exklusiv(id, async () => {
      let data = await lesen(id);
      if (data.expires_at < Date.now() + 60000) data = await erneuern(id, data);
      try { return await aufruf(data.access_token, name, args); }
      catch (e) {
        if (e.code === 401 || e.status === 401 || e.name === 'UnauthorizedError') {
          data = await erneuern(id, data);
          try { return await aufruf(data.access_token, name, args); }
          catch { throw new ValidationError('Plaud konnte nicht gelesen werden. Bitte erneut versuchen oder Plaud neu verbinden.', 502); }
        }
        if (e instanceof ValidationError) throw e;
        throw new ValidationError('Plaud konnte nicht gelesen werden. Bitte erneut versuchen.', 502);
      }
    });
  }
  return {
    origin: appUrl && appUrl.origin,
    async status(id) {
      const row = await db.get('SELECT benutzer_id FROM plaud_verbindungen WHERE benutzer_id=?', [id]);
      return { verfuegbar: !!callback, verbunden: !!row };
    },
    verbinden(id, sessionToken) {
      return exklusiv(id, async () => {
        if (!callback) throw new ValidationError('Die direkte Plaud-Verbindung ist auf dem Server noch nicht eingerichtet.', 503);
        keyHolen();
        const client = await jsonAnfrage('/register', { client_name: 'CuraAedificii', redirect_uris: [callback],
          token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
        if (typeof client.client_id !== 'string' || !client.client_id) throw new ValidationError('Plaud konnte die App nicht registrieren.', 502);
        const state = zufall(), verifier = zufall();
        await db.run('DELETE FROM plaud_anmeldungen WHERE benutzer_id=? OR ablauf < ?', [id, Date.now()]);
        await db.run('INSERT INTO plaud_anmeldungen (state_hash,benutzer_id,session_hash,ablauf,daten) VALUES (?,?,?,?,?)',
          [hash(state), id, hash(sessionToken), Date.now() + 600000, verschluesseln(keyHolen(), { verifier, client_id: client.client_id }, id)]);
        const url = new URL(ORIGIN + '/authorize');
        url.search = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: callback,
          state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', resource: RESOURCE }).toString();
        return { url: url.href };
      });
    },
    abschliessen(id, sessionToken, state, code, denied) {
      return exklusiv(id, async () => {
        if (typeof state !== 'string' || state.length > 200 || (!denied && (typeof code !== 'string' || !code || code.length > 20000))) throw new ValidationError('Ungültige Plaud-Anmeldung. Bitte erneut verbinden.');
        const row = await db.transaktion(async (tx) => {
          const r = await tx.get('SELECT * FROM plaud_anmeldungen WHERE state_hash=? AND benutzer_id=? AND session_hash=? AND ablauf>?', [hash(state), id, hash(sessionToken), Date.now()]);
          if (r) await tx.run('DELETE FROM plaud_anmeldungen WHERE state_hash=?', [hash(state)]);
          return r;
        });
        if (!row) throw new ValidationError('Die Plaud-Anmeldung ist abgelaufen oder gehört zu einer anderen Sitzung. Bitte erneut verbinden.');
        if (denied) return false;
        const pending = entschluesseln(keyHolen(), row.daten, id);
        const tokens = await jsonAnfrage('/token', { grant_type: 'authorization_code', code, client_id: pending.client_id,
          redirect_uri: callback, code_verifier: pending.verifier, resource: RESOURCE }, true);
        await speichern(id, tokenDaten(tokens, { client_id: pending.client_id }));
        return true;
      });
    },
    trennen(id) {
      return exklusiv(id, () => db.transaktion(async (tx) => {
        await tx.run('DELETE FROM plaud_verbindungen WHERE benutzer_id=?', [id]);
        await tx.run('DELETE FROM plaud_anmeldungen WHERE benutzer_id=?', [id]);
        return { ok: true };
      }));
    },
    async liste(id, page = 1) {
      if (!Number.isInteger(page) || page < 1 || page > 1000) throw new ValidationError('Ungültige Plaud-Seite.');
      const result = await mitPlaud(id, 'list_files', { page, page_size: 20 });
      if (!result || !Array.isArray(result.data)) throw new ValidationError('Plaud hat keine gültige Gesprächsliste geliefert.', 502);
      return { gespraeche: result.data.map((r) => ({ id: String(r.id), name: String(r.name || 'Gespräch'),
        datum: String(r.start_at || r.created_at || ''), dauer: Number(r.duration) || 0 })), weitere: result.data.length === 20 };
    },
    async notizen(id, fileId) {
      if (typeof fileId !== 'string' || !fileId || fileId.length > 200) throw new ValidationError('Ungültiges Plaud-Gespräch.');
      const result = await mitPlaud(id, 'get_note', { file_id: fileId });
      if (!Array.isArray(result)) throw new ValidationError('Plaud hat keine gültige Zusammenfassung geliefert.', 502);
      return { notizen: result.filter((n) => typeof n.data_content === 'string' && n.data_content.trim()).map((n, index) => ({
        titel: String(n.name || n.title || n.data_type || 'Zusammenfassung ' + (index + 1)), text: n.data_content.trim(),
      })) };
    },
  };
}

module.exports = { bauePlaud, toolDaten };
