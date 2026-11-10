'use strict';

// Protocol adapter derived from the public HP-Mobile application, 2026-11-07.
// This is the Mobile API, distinct from api.hausperfekt.de's Datendienst.
// It is not yet mounted as a public CuraAed route. Tenant membership and encrypted
// credential storage must be provided by the integration layer before activation.
const { isDeepStrictEqual } = require('node:util');
const ORIGIN = 'https://api.hausperfekt-mobile.de';
const READ_RESOURCES = new Set(['persons', 'addresses', 'buildings', 'units', 'documents', 'cis', 'syncs', 'records', 'tasks', 'craftsman_tasks', 'notes']);
const PERSON_FIELDS = new Set(['salutation', 'title', 'firstname', 'lastname', 'birthdate', 'address', 'emails', 'phonenumbers', 'comment', 'confirm_data']);
const ADDRESS_FIELDS = new Set(['street', 'zip', 'city', 'country']);

class HpMobileError extends Error {
  constructor(message, status = 502, outcomeUnknown = false) {
    super(message);
    this.name = 'HpMobileError';
    this.status = status;
    this.outcomeUnknown = outcomeUnknown;
  }
}

function portalKennung(value) {
  let url;
  try { url = new URL(value); } catch { throw new HpMobileError('Ungültige HP-Mobile-Portaladresse.', 400); }
  const match = url.hostname.match(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.hausperfekt-mobile\.de$/);
  if (url.protocol !== 'https:' || !match || ['api', 'www'].includes(match[1]) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new HpMobileError('Eine kundenspezifische HTTPS-Adresse von HP-Mobile wird benötigt.', 400);
  }
  return match[1];
}

function positiveId(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new HpMobileError('Ungültige HP-Mobile-Datensatznummer.', 400);
  return String(value);
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }

function withRemovals(previous, next) {
  if (!Array.isArray(previous) || !Array.isArray(next) || next.some(v => !object(v))) throw new HpMobileError('Ungültige HP-Kontaktdaten.', 400);
  return [...structuredClone(next), ...previous.filter(old => !next.some(value => isDeepStrictEqual(old, value))).map(old => ({ ...structuredClone(old), removed: true }))];
}

// HP-Mobile submits original and modified snapshots for its existing approval
// workflow. A created request is not proof of a completed write into the ERP.
function personenAenderung(current, patch) {
  if (!object(current) || !object(patch)) throw new HpMobileError('Ungültige Personenänderung.', 400);
  positiveId(current.id);
  if (Object.keys(patch).some(key => !PERSON_FIELDS.has(key))) throw new HpMobileError('Dieses HP-Personenfeld ist noch nicht für Änderungen freigegeben.', 400);
  if (patch.confirm_data !== true) throw new HpMobileError('Bitte die Personenänderung vor der Übertragung bestätigen.', 400);
  if (patch.address !== undefined && (!object(patch.address) || Object.keys(patch.address).some(key => !ADDRESS_FIELDS.has(key)))) throw new HpMobileError('Ungültige HP-Adressfelder.', 400);
  const updated = { ...structuredClone(current), ...structuredClone(patch) };
  if (patch.address) updated.address = { ...structuredClone(current.address || {}), ...structuredClone(patch.address) };
  for (const key of ['emails', 'phonenumbers']) {
    if (patch[key] !== undefined) updated[key] = withRemovals(current[key] || [], patch[key]);
  }
  // Set the protocol fields last so a provider snapshot cannot override them.
  return { ...structuredClone(current), person_id: current.id, current_data: JSON.stringify(current), updated_data: JSON.stringify(updated) };
}

function baueHpMobileClient({ portalUrl, accessToken, fetchImpl = require('../lib/hpFetch'), timeoutMs = 20000 }) {
  const subdomain = portalKennung(portalUrl);
  if (typeof accessToken !== 'string' || !accessToken || /[\r\n]/.test(accessToken)) throw new HpMobileError('Eine gültige HP-Anmeldung wird benötigt.', 401);
  let verification;
  async function request(method, path, data) {
    let response;
    try {
      response = await fetchImpl(ORIGIN + '/api/v1/' + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: 'Bearer ' + accessToken, 'HPAPI-DOM': subdomain, Accept: 'application/json', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    } catch {
      throw new HpMobileError(method === 'GET' ? 'HP-Mobile ist nicht erreichbar.' : 'HP hat den Auftrag möglicherweise erhalten. Vor einer erneuten Übertragung muss der Status geprüft werden.', 502, method !== 'GET');
    }
    if (!response.ok) {
      const status = [401, 403, 404, 409, 422, 429].includes(response.status) ? response.status : 502;
      throw new HpMobileError(status === 401 ? 'Bitte HP-Mobile erneut verbinden.' : status === 403 ? 'Für diesen HP-Kunden fehlen die erforderlichen Rechte.' : 'HP-Mobile hat die Anfrage abgelehnt (HTTP ' + response.status + ').', status, method !== 'GET' && response.status >= 500);
    }
    try { return { status: response.status, data: await response.json() }; }
    catch { throw new HpMobileError('Die Antwort von HP-Mobile konnte nicht ausgewertet werden.', 502, method !== 'GET'); }
  }
  async function verify() {
    if (!verification) {
      verification = request('GET', 'whoami').then(({ data }) => {
        const matches = Array.isArray(data?.clientdatabases) ? data.clientdatabases.filter(db => db.subdomain === subdomain) : [];
        if (matches.length !== 1) throw new HpMobileError('Diese Anmeldung ist dem ausgewählten HP-Kunden nicht eindeutig zugeordnet.', 403);
        return { subdomain, erp: matches[0].erp, canUpdate: data.is_admin === true || data.team?.can_update === true };
      }).catch(error => { verification = undefined; throw error; });
    }
    return verification;
  }
  return Object.freeze({
    subdomain,
    pruefen: verify,
    async liste(resource, { page = 1, pageSize = 50 } = {}) {
      if (!READ_RESOURCES.has(resource)) throw new HpMobileError('Dieser HP-Datenbereich ist noch nicht freigegeben.', 400);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new HpMobileError('Ungültige HP-Seitenauswahl.', 400);
      await verify();
      return (await request('GET', resource + '?pageNum=' + page + '&pageSize=' + pageSize)).data;
    },
    async holen(resource, id) {
      if (!READ_RESOURCES.has(resource)) throw new HpMobileError('Dieser HP-Datenbereich ist noch nicht freigegeben.', 400);
      const key = positiveId(id);
      await verify();
      return (await request('GET', resource + '/' + key)).data;
    },
    async fachListe(resource,page=1) {
      if(!['records','tasks','craftsman_tasks','cis','notes'].includes(resource)||!Number.isSafeInteger(page)||page<1||page>1000000)throw new HpMobileError('Ungültiger Fachbereich oder Seite.',400);
      await verify();return (await request('GET',resource+'?'+new URLSearchParams({pageNum:String(page),pageSize:'50',of:'id',od:'asc'}))).data;
    },
    async fachDetails(resource,id) {
      if(!['records','tasks','craftsman_tasks','cis','notes'].includes(resource))throw new HpMobileError('Ungültiger Fachbereich.',400);
      const key=positiveId(id);await verify();
      const rel=['cis','tasks'].includes(resource)?'?'+new URLSearchParams({rel:'["units","persons","buildings","records","craftsman_tasks","documents.document_files"]'}):'';
      return (await request('GET',resource+'/'+key+rel)).data;
    },
    async dmsListe({ page = 1, search = '', importieren = false } = {}) {
      if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || typeof search !== 'string' || search.length > 200) throw new HpMobileError('Ungültige DMS-Suche.', 400);
      await verify();
      const q = new URLSearchParams({ pageNum: String(page), pageSize: '25', of: importieren ? 'id' : 'ts', od: importieren ? 'asc' : 'desc', s: search, sm: '0', rel: '["document_container","document_type"]' });
      return (await request('GET', 'documents?' + q)).data;
    },
    async dmsContainer(id) {
      const key = positiveId(id);
      await verify();
      return (await request('GET', 'documentcontainer/' + key)).data;
    },
    async dmsStream(id, maxBytes) {
      const key = positiveId(id); await verify();
      let response;
      try { response = await fetchImpl(ORIGIN + '/api/v1/documents/' + key + '/binary', {
        method:'GET', redirect:'error', signal:AbortSignal.timeout(600000),
        headers:{Authorization:'Bearer '+accessToken,'HPAPI-DOM':subdomain,Accept:'application/octet-stream'},
      }); } catch { throw new HpMobileError('Der Dateiabruf wurde unterbrochen.',502); }
      if(!response.ok) throw new HpMobileError('HP hat den Dateiabruf abgelehnt.',[401,403,404,429].includes(response.status)?response.status:502);
      if(!response.body) throw new HpMobileError('HP hat keine Datei geliefert.',502);
      if(Number(response.headers.get('content-length'))>maxBytes) { await response.body.cancel(); throw new HpMobileError('Für diese Datei reicht der freie Archivspeicher nicht aus.',507); }
      return response.body;
    },
    async dmsDatei(id, maxBytes = 64 * 1024 * 1024) {
      const key = positiveId(id);
      await verify();
      let response;
      try {
        response = await fetchImpl(ORIGIN + '/api/v1/documents/' + key + '/binary', {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(120000),
          headers: { Authorization: 'Bearer ' + accessToken, 'HPAPI-DOM': subdomain, Accept: 'application/octet-stream' },
        });
      } catch { throw new HpMobileError('Die HP-Datei ist gerade nicht erreichbar.', 502); }
      if (!response.ok) {
        const status = [401, 403, 404, 429].includes(response.status) ? response.status : 502;
        throw new HpMobileError(status === 404 ? 'Die Datei ist in HP-Mobile nicht verfügbar.' : status === 401 ? 'Bitte HP-Mobile erneut verbinden.' : 'HP-Mobile hat den Dateizugriff abgelehnt.', status);
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel().catch(() => {});
        throw new HpMobileError('Die Datei überschreitet die aktuelle Übernahmegrenze von 64 MB. Sie wurde noch nicht gesichert.', 413);
      }
      if (!response.body) throw new HpMobileError('HP hat keine Datei geliefert.', 502);
      const reader = response.body.getReader(), chunks = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > maxBytes) {
            await reader.cancel();
            throw new HpMobileError('Die Datei überschreitet die aktuelle Übernahmegrenze von 64 MB. Sie wurde noch nicht gesichert.', 413);
          }
          chunks.push(Buffer.from(value));
        }
      } catch (e) { if (e instanceof HpMobileError) throw e; throw new HpMobileError('Der HP-Dateiabruf wurde unterbrochen. Bitte erneut versuchen.', 502); }
      finally { reader.releaseLock(); }
      if (!length) throw new HpMobileError('HP hat eine leere Datei geliefert.', 502);
      return Buffer.concat(chunks, length);
    },
    async personenAenderungAnfordern(current, patch) {
      const payload = personenAenderung(current, patch);
      const identity = await verify();
      if (!identity.canUpdate) throw new HpMobileError('Für die CuraAed-Anbindung ist ein HP-Verwalterzugang mit Änderungsrechten erforderlich.', 403);
      const result = await request('POST', 'person_updaterequests', payload);
      return { zustand: 'in_hp_angefordert', httpStatus: result.status, anfrage: result.data };
    },
    async personenAenderungsStatus(id) {
      const key = positiveId(id);
      await verify();
      return (await request('GET', 'person_updaterequests/' + key + '/process')).data;
    },
  });
}

module.exports = { HpMobileError, portalKennung, personenAenderung, baueHpMobileClient };
