'use strict';

// Dünner API-Client. Alle Anfragen laufen same-origin mit HttpOnly-Cookie.
const API = (() => {
  async function req(method, pfad, body) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch('/api' + pfad, opt);
    let daten = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      daten = await res.json().catch(() => null);
    }
    if (!res.ok) {
      const msg = (daten && daten.fehler) || `Fehler ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return daten;
  }

  async function upload(pfad, formData) {
    const res = await fetch('/api' + pfad, {
      method: 'POST',
      body: formData,
      credentials: 'same-origin',
    });
    let daten = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) daten = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (daten && daten.fehler) || `Fehler ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return daten;
  }

  const qs = (obj) => {
    const p = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') p.append(k, v);
    });
    const s = p.toString();
    return s ? '?' + s : '';
  };

  return {
    get: (p) => req('GET', p),
    post: (p, b) => req('POST', p, b),
    put: (p, b) => req('PUT', p, b),
    del: (p) => req('DELETE', p),
    upload,
    qs,
  };
})();
