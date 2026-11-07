'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { baueHpMobileClient, portalKennung, HpMobileError } = require('./hausperfektMobile');
const ORIGIN = 'https://api.hausperfekt-mobile.de';

function baueHpVerbindungen(db, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const oauth = options.oauth || { clientId: process.env.HP_MOBILE_CLIENT_ID, clientSecret: process.env.HP_MOBILE_CLIENT_SECRET };
  const queues = new Map();
  let key;
  function secretKey() {
    if (key) return key;
    if (db.db.filename === ':memory:') return (key = crypto.randomBytes(32));
    const p = path.join(path.dirname(path.resolve(db.db.filename)), '.hausperfekt-token-key');
    try { fs.writeFileSync(p, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    key = fs.readFileSync(p);
    if (key.length !== 32) throw new HpMobileError('Der HP-Verbindungsschlüssel ist ungültig.', 503);
    return key;
  }
  function encrypt(data, owner) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
    c.setAAD(Buffer.from(String(owner)));
    const body = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
  }
  function decrypt(data, owner) {
    try {
      const b = Buffer.from(data, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', secretKey(), b.subarray(0, 12));
      d.setAAD(Buffer.from(String(owner))); d.setAuthTag(b.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
    } catch { throw new HpMobileError('Die gespeicherte HP-Verbindung konnte nicht geöffnet werden. Bitte erneut verbinden.', 409); }
  }
  function lock(id, fn) {
    const p = (queues.get(id) || Promise.resolve()).then(fn, fn); queues.set(id, p);
    return p.finally(() => { if (queues.get(id) === p) queues.delete(id); });
  }
  function configured() { return !!(oauth.clientId && oauth.clientSecret); }
  async function tokenRequest(subdomain, data) {
    if (!configured()) throw new HpMobileError('Die HP-Mobile-Anmeldung muss auf dem CuraAed-Server noch eingerichtet werden.', 503);
    let r;
    try {
      r = await fetchImpl(ORIGIN + '/oauth/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'HPAPI-DOM': subdomain },
        body: JSON.stringify({ ...data, client_id: oauth.clientId, client_secret: oauth.clientSecret }) });
    } catch { throw new HpMobileError('Die HP-Anmeldung ist gerade nicht erreichbar.', 502); }
    if (!r.ok) throw new HpMobileError([400, 401, 403].includes(r.status) ? 'HP hat die Anmeldung abgelehnt. Bitte Portaladresse und Zugangsdaten prüfen.' : 'Die HP-Anmeldung ist gerade nicht verfügbar.', [400, 401, 403].includes(r.status) ? 401 : 502);
    let t;
    try { t = await r.json(); } catch { throw new HpMobileError('HP hat eine ungültige Anmeldung zurückgegeben.', 502); }
    if (typeof t.access_token !== 'string' || !t.access_token) throw new HpMobileError('HP hat keine gültige Anmeldung zurückgegeben.', 502);
    return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (Number(t.expires_in) > 0 ? Number(t.expires_in) : 3600) * 1000 };
  }
  async function owned(owner, id) {
    const row = await db.get('SELECT * FROM hp_mobile_verbindungen WHERE id=? AND benutzer_id=?', [id, owner]);
    if (!row) throw new HpMobileError('HP-Verbindung nicht gefunden.', 404);
    return row;
  }
  async function save(row, tokens) {
    const next = encrypt(tokens, [row.benutzer_id, row.id, row.subdomain].join(':'));
    const result = await db.run('UPDATE hp_mobile_verbindungen SET daten=?, aktualisiert_am=? WHERE id=? AND benutzer_id=? AND daten=?', [next, new Date().toISOString(), row.id, row.benutzer_id, row.daten]);
    if (!result.changes) throw new HpMobileError('Die HP-Verbindung wurde inzwischen geändert. Bitte erneut laden.', 409);
    row.daten = next;
  }
  async function withClient(owner, id, fn) {
    return lock(id, async () => {
      const row = await owned(owner, id);
      let tokens = decrypt(row.daten, [owner, row.id, row.subdomain].join(':'));
      async function refresh() {
        if (!tokens.refresh_token) throw new HpMobileError('Bitte HP-Mobile erneut verbinden.', 401);
        const next = await tokenRequest(row.subdomain, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
        tokens = { ...next, refresh_token: next.refresh_token || tokens.refresh_token };
        await save(row, tokens);
      }
      const client = () => baueHpMobileClient({ portalUrl: 'https://' + row.subdomain + '.hausperfekt-mobile.de/', accessToken: tokens.access_token, fetchImpl });
      if (tokens.expires_at < Date.now() + 60000) await refresh();
      try { return await fn(client()); }
      catch (e) { if (e.status !== 401) throw e; await refresh(); return fn(client()); }
    });
  }
  return {
    status: () => ({ eingerichtet: configured() }),
    async liste(owner) { return db.all('SELECT id, subdomain, erp, aktualisiert_am FROM hp_mobile_verbindungen WHERE benutzer_id=? ORDER BY subdomain', [owner]); },
    async verbinden(owner, { portalUrl, benutzername, passwort }) {
      const subdomain = portalKennung(portalUrl);
      if (typeof benutzername !== 'string' || !benutzername.trim() || benutzername.length > 320 || typeof passwort !== 'string' || !passwort || passwort.length > 4000) throw new HpMobileError('Bitte die HP-Mobile-Zugangsdaten eingeben.', 400);
      return lock(owner + ':' + subdomain, async () => {
        const tokens = await tokenRequest(subdomain, { grant_type: 'password', username: benutzername.trim(), password: passwort });
        const identity = await baueHpMobileClient({ portalUrl, accessToken: tokens.access_token, fetchImpl }).pruefen();
        const old = await db.get('SELECT id FROM hp_mobile_verbindungen WHERE benutzer_id=? AND subdomain=?', [owner, subdomain]);
        const id = old?.id || crypto.randomUUID();
        await db.run('INSERT INTO hp_mobile_verbindungen (id,benutzer_id,subdomain,erp,daten,aktualisiert_am) VALUES (?,?,?,?,?,?) ON CONFLICT(benutzer_id,subdomain) DO UPDATE SET erp=excluded.erp,daten=excluded.daten,aktualisiert_am=excluded.aktualisiert_am',
          [id, owner, subdomain, identity.erp || null, encrypt(tokens, [owner, id, subdomain].join(':')), new Date().toISOString()]);
        return { id, subdomain, erp: identity.erp, canUpdate: identity.canUpdate };
      });
    },
    daten(owner, id, resource, page) { return withClient(owner, id, c => c.liste(resource, { page })); },
    async entfernen(owner, id) { return lock(id, async () => { await owned(owner, id); await db.run('DELETE FROM hp_mobile_verbindungen WHERE id=? AND benutzer_id=?', [id, owner]); return { ok: true }; }); },
  };
}
module.exports = { baueHpVerbindungen };
