'use strict';

const V = require('../lib/validation');

// Kommunikation je Adresse: Telefonnummern, E-Mail-Adressen/Webseiten und
// Ansprechpartner (wie in der HausPerfekt-Adressmaske). Die Spalten
// adressen.telefon/mobil/email bleiben als „Standardwerte" für Suche und
// Listen erhalten und werden nach jeder Änderung neu abgeleitet.

const TELEFON_ARTEN = ['Telefon', 'Funktelefon', 'Fax', 'Geschäftlich', 'Privat', 'Sonstiges'];
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const WEB_RE = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#][^\s<>"]*)?$/i;

async function adresseVorhanden(db, adresseId) {
  const a = await db.get('SELECT id FROM adressen WHERE id = ?', [adresseId]);
  if (!a) throw new V.ValidationError('Adresse nicht gefunden.', 404);
}

async function liste(db, adresseId) {
  await adresseVorhanden(db, adresseId);
  const [telefone, emails, ansprechpartner] = await Promise.all([
    db.all('SELECT * FROM adress_telefone WHERE adresse_id = ? ORDER BY id', [adresseId]),
    db.all('SELECT * FROM adress_emails WHERE adresse_id = ? ORDER BY standard DESC, id', [adresseId]),
    db.all('SELECT * FROM adress_ansprechpartner WHERE adresse_id = ? ORDER BY id', [adresseId]),
  ]);
  return { telefone, emails, ansprechpartner };
}

/** Leitet adressen.telefon/mobil/email aus den Listen ab. */
async function syncStammfelder(db, adresseId) {
  const tel = await db.get(
    "SELECT nummer FROM adress_telefone WHERE adresse_id = ? AND art NOT IN ('Funktelefon','Fax') ORDER BY id LIMIT 1",
    [adresseId]
  );
  const mobil = await db.get(
    "SELECT nummer FROM adress_telefone WHERE adresse_id = ? AND art = 'Funktelefon' ORDER BY id LIMIT 1",
    [adresseId]
  );
  const mail = await db.get(
    'SELECT adresse FROM adress_emails WHERE adresse_id = ? AND ist_email = 1 ORDER BY standard DESC, id LIMIT 1',
    [adresseId]
  );
  await db.run('UPDATE adressen SET telefon = ?, mobil = ?, email = ? WHERE id = ?', [
    tel ? tel.nummer : null,
    mobil ? mobil.nummer : null,
    mail ? mail.adresse : null,
    adresseId,
  ]);
}

/** Übernimmt telefon/mobil/email einer Adresse in die Listen (falls dort noch leer). */
async function uebernehmenAusStamm(db, adresseId) {
  const a = await db.get('SELECT telefon, mobil, email FROM adressen WHERE id = ?', [adresseId]);
  if (!a) return;
  const n = await db.get(
    `SELECT (SELECT COUNT(*) FROM adress_telefone WHERE adresse_id = ?) +
            (SELECT COUNT(*) FROM adress_emails WHERE adresse_id = ?) AS n`,
    [adresseId, adresseId]
  );
  if (n.n > 0) return;
  if (a.telefon) await db.run("INSERT INTO adress_telefone (adresse_id, art, nummer) VALUES (?, 'Telefon', ?)", [adresseId, a.telefon]);
  if (a.mobil) await db.run("INSERT INTO adress_telefone (adresse_id, art, nummer) VALUES (?, 'Funktelefon', ?)", [adresseId, a.mobil]);
  if (a.email) await db.run('INSERT INTO adress_emails (adresse_id, adresse, ist_email, standard) VALUES (?, ?, 1, 1)', [adresseId, a.email]);
}

// ---- Telefon -----------------------------------------------------------
function telefonWerte(data) {
  return {
    art: V.oneOf(data.art, TELEFON_ARTEN, 'Art', 'Telefon'),
    nummer: V.requireStr(V.str(data.nummer, 50), 'Telefon-Nummer'),
    bemerkung: V.str(data.bemerkung, 200),
    kurzwahl: V.str(data.kurzwahl, 10),
  };
}

async function telefonAnlegen(db, adresseId, data) {
  await adresseVorhanden(db, adresseId);
  const w = telefonWerte(data);
  const r = await db.run(
    'INSERT INTO adress_telefone (adresse_id, art, nummer, bemerkung, kurzwahl) VALUES (?,?,?,?,?)',
    [adresseId, w.art, w.nummer, w.bemerkung, w.kurzwahl]
  );
  await syncStammfelder(db, adresseId);
  return db.get('SELECT * FROM adress_telefone WHERE id = ?', [r.lastID]);
}

async function telefonAktualisieren(db, id, data) {
  const t = await db.get('SELECT * FROM adress_telefone WHERE id = ?', [id]);
  if (!t) throw new V.ValidationError('Telefonnummer nicht gefunden.', 404);
  const w = telefonWerte(data);
  await db.run('UPDATE adress_telefone SET art=?, nummer=?, bemerkung=?, kurzwahl=? WHERE id=?', [w.art, w.nummer, w.bemerkung, w.kurzwahl, id]);
  await syncStammfelder(db, t.adresse_id);
  return db.get('SELECT * FROM adress_telefone WHERE id = ?', [id]);
}

async function telefonLoeschen(db, id) {
  const t = await db.get('SELECT * FROM adress_telefone WHERE id = ?', [id]);
  if (!t) throw new V.ValidationError('Telefonnummer nicht gefunden.', 404);
  await db.run('DELETE FROM adress_telefone WHERE id = ?', [id]);
  await syncStammfelder(db, t.adresse_id);
  return { geloescht: true };
}

// ---- E-Mail / Webseite -------------------------------------------------
function emailWerte(data) {
  const istEmail = V.bool(data.ist_email === undefined ? 1 : data.ist_email);
  const adresse = V.requireStr(V.str(data.adresse, 254), istEmail ? 'E-Mail-Adresse' : 'Webseite');
  if (istEmail && !EMAIL_RE.test(adresse)) throw new V.ValidationError(`Ungültige E-Mail-Adresse: ${adresse}`);
  if (!istEmail && !WEB_RE.test(adresse)) throw new V.ValidationError(`Ungültige Webseite: ${adresse} (z. B. www.beispiel.de)`);
  return {
    adresse,
    bemerkung: V.str(data.bemerkung, 200),
    ist_email: istEmail,
    standard: istEmail ? V.bool(data.standard) : 0,
    hpmobile: V.bool(data.hpmobile),
  };
}

async function standardExklusiv(db, adresseId, id) {
  await db.run('UPDATE adress_emails SET standard = 0 WHERE adresse_id = ? AND id <> ?', [adresseId, id]);
}

async function emailAnlegen(db, adresseId, data) {
  await adresseVorhanden(db, adresseId);
  const w = emailWerte(data);
  const r = await db.run(
    'INSERT INTO adress_emails (adresse_id, adresse, bemerkung, ist_email, standard, hpmobile) VALUES (?,?,?,?,?,?)',
    [adresseId, w.adresse, w.bemerkung, w.ist_email, w.standard, w.hpmobile]
  );
  if (w.standard) await standardExklusiv(db, adresseId, r.lastID);
  await syncStammfelder(db, adresseId);
  return db.get('SELECT * FROM adress_emails WHERE id = ?', [r.lastID]);
}

async function emailAktualisieren(db, id, data) {
  const m = await db.get('SELECT * FROM adress_emails WHERE id = ?', [id]);
  if (!m) throw new V.ValidationError('E-Mail-Eintrag nicht gefunden.', 404);
  const w = emailWerte(data);
  await db.run('UPDATE adress_emails SET adresse=?, bemerkung=?, ist_email=?, standard=?, hpmobile=? WHERE id=?',
    [w.adresse, w.bemerkung, w.ist_email, w.standard, w.hpmobile, id]);
  if (w.standard) await standardExklusiv(db, m.adresse_id, id);
  await syncStammfelder(db, m.adresse_id);
  return db.get('SELECT * FROM adress_emails WHERE id = ?', [id]);
}

async function emailLoeschen(db, id) {
  const m = await db.get('SELECT * FROM adress_emails WHERE id = ?', [id]);
  if (!m) throw new V.ValidationError('E-Mail-Eintrag nicht gefunden.', 404);
  await db.run('DELETE FROM adress_emails WHERE id = ?', [id]);
  await syncStammfelder(db, m.adresse_id);
  return { geloescht: true };
}

// ---- Ansprechpartner ---------------------------------------------------
function apWerte(data) {
  const email = V.str(data.email, 254);
  if (email && !EMAIL_RE.test(email)) throw new V.ValidationError(`Ungültige E-Mail-Adresse: ${email}`);
  return {
    name: V.requireStr(V.str(data.name, 120), 'Ansprechpartner'),
    funktion: V.str(data.funktion, 80),
    telefon: V.str(data.telefon, 50),
    email,
  };
}

async function apAnlegen(db, adresseId, data) {
  await adresseVorhanden(db, adresseId);
  const w = apWerte(data);
  const r = await db.run('INSERT INTO adress_ansprechpartner (adresse_id, name, funktion, telefon, email) VALUES (?,?,?,?,?)',
    [adresseId, w.name, w.funktion, w.telefon, w.email]);
  return db.get('SELECT * FROM adress_ansprechpartner WHERE id = ?', [r.lastID]);
}

async function apAktualisieren(db, id, data) {
  const ap = await db.get('SELECT * FROM adress_ansprechpartner WHERE id = ?', [id]);
  if (!ap) throw new V.ValidationError('Ansprechpartner nicht gefunden.', 404);
  const w = apWerte(data);
  await db.run('UPDATE adress_ansprechpartner SET name=?, funktion=?, telefon=?, email=? WHERE id=?', [w.name, w.funktion, w.telefon, w.email, id]);
  return db.get('SELECT * FROM adress_ansprechpartner WHERE id = ?', [id]);
}

async function apLoeschen(db, id) {
  const ap = await db.get('SELECT * FROM adress_ansprechpartner WHERE id = ?', [id]);
  if (!ap) throw new V.ValidationError('Ansprechpartner nicht gefunden.', 404);
  await db.run('DELETE FROM adress_ansprechpartner WHERE id = ?', [id]);
  return { geloescht: true };
}

// ---- Export als vCard (für Outlook / Microsoft 365 / Handy) ------------
function vEsc(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

async function vcard(db, adresseId) {
  const a = await db.get('SELECT * FROM adressen WHERE id = ?', [adresseId]);
  if (!a) throw new V.ValidationError('Adresse nicht gefunden.', 404);
  const k = await liste(db, adresseId);
  const firma = a.adresstyp === 'firma';
  const fn = firma ? a.firmenname : [a.vorname, a.nachname].filter(Boolean).join(' ');
  const z = ['BEGIN:VCARD', 'VERSION:3.0'];
  z.push(firma ? `N:${vEsc(a.firmenname)};;;;` : `N:${vEsc(a.nachname)};${vEsc(a.vorname)};;${vEsc(a.anrede)};`);
  z.push(`FN:${vEsc(fn)}`);
  if (firma) z.push(`ORG:${vEsc(a.firmenname)}`);
  if (a.strasse || a.ort || a.plz) z.push(`ADR;TYPE=${firma ? 'WORK' : 'HOME'}:;;${vEsc(a.strasse)};${vEsc(a.ort)};;${vEsc(a.plz)};${vEsc(a.land)}`);
  for (const t of k.telefone) z.push(`TEL;TYPE=${t.art === 'Funktelefon' ? 'CELL' : t.art === 'Fax' ? 'FAX' : 'VOICE'}:${vEsc(t.nummer)}`);
  for (const m of k.emails) z.push(m.ist_email ? `EMAIL;TYPE=INTERNET${m.standard ? ',PREF' : ''}:${vEsc(m.adresse)}` : `URL:${vEsc(m.adresse)}`);
  if (a.geburtstag) z.push(`BDAY:${a.geburtstag}`);
  z.push(`NOTE:${vEsc('Adress-Nr. ' + a.nummer)}`);
  z.push('END:VCARD');
  return { text: z.join('\r\n') + '\r\n', dateiname: `Adresse_${String(a.nummer).replace(/[^A-Za-z0-9._-]/g, '_')}.vcf` };
}

module.exports = {
  TELEFON_ARTEN,
  liste,
  syncStammfelder,
  uebernehmenAusStamm,
  telefonAnlegen,
  telefonAktualisieren,
  telefonLoeschen,
  emailAnlegen,
  emailAktualisieren,
  emailLoeschen,
  apAnlegen,
  apAktualisieren,
  apLoeschen,
  vcard,
};
