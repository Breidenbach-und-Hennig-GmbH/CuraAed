'use strict';

const bcrypt = require('bcryptjs');
const V = require('../lib/validation');

const BCRYPT_KOSTEN = 10;

function oeffentlich(b) {
  if (!b) return b;
  const { passwort_hash, ...rest } = b;
  return rest;
}

async function liste(db) {
  const rows = await db.all('SELECT * FROM benutzer ORDER BY name COLLATE NOCASE ASC');
  return rows.map(oeffentlich);
}

async function holen(db, id) {
  return oeffentlich(await db.get('SELECT * FROM benutzer WHERE id = ?', [id]));
}

async function holenPerName(db, benutzername) {
  return db.get('SELECT * FROM benutzer WHERE benutzername = ?', [benutzername]);
}

async function anlegen(db, data) {
  const benutzername = V.requireStr(data.benutzername, 'Benutzername').toLowerCase();
  const name = V.requireStr(data.name, 'Name');
  const passwort = V.requireStr(data.passwort, 'Passwort');
  if (passwort.length < 8) {
    throw new V.ValidationError('Das Passwort muss mindestens 8 Zeichen lang sein.');
  }
  const rolle = V.oneOf(data.rolle, V.BENUTZER_ROLLEN, 'Rolle', 'mitarbeiter');
  const vorhanden = await holenPerName(db, benutzername);
  if (vorhanden) throw new V.ValidationError('Benutzername bereits vergeben.', 409);
  const hash = await bcrypt.hash(passwort, BCRYPT_KOSTEN);
  const r = await db.run(
    `INSERT INTO benutzer (benutzername, passwort_hash, name, email, rolle) VALUES (?,?,?,?,?)`,
    [benutzername, hash, name, V.str(data.email), rolle]
  );
  return holen(db, r.lastID);
}

async function aktualisieren(db, id, data) {
  const b = await db.get('SELECT * FROM benutzer WHERE id = ?', [id]);
  if (!b) throw new V.ValidationError('Benutzer nicht gefunden.', 404);
  const name = V.requireStr(data.name, 'Name');
  const rolle = V.oneOf(data.rolle, V.BENUTZER_ROLLEN, 'Rolle', b.rolle);
  const aktiv = data.aktiv === undefined ? b.aktiv : V.bool(data.aktiv);
  await db.run(
    "UPDATE benutzer SET name=?, email=?, rolle=?, aktiv=?, geaendert_am=datetime('now') WHERE id=?",
    [name, V.str(data.email), rolle, aktiv, id]
  );
  return holen(db, id);
}

async function passwortSetzen(db, id, passwort) {
  const b = await db.get('SELECT id FROM benutzer WHERE id = ?', [id]);
  if (!b) throw new V.ValidationError('Benutzer nicht gefunden.', 404);
  const pw = V.requireStr(passwort, 'Passwort');
  if (pw.length < 8) throw new V.ValidationError('Das Passwort muss mindestens 8 Zeichen lang sein.');
  const hash = await bcrypt.hash(pw, BCRYPT_KOSTEN);
  await db.run("UPDATE benutzer SET passwort_hash=?, geaendert_am=datetime('now') WHERE id=?", [hash, id]);
  return { ok: true };
}

/** Prüft Anmeldedaten; gibt Benutzer (öffentlich) oder null zurück. */
async function pruefeAnmeldung(db, benutzername, passwort) {
  const b = await holenPerName(db, String(benutzername || '').toLowerCase());
  if (!b || !b.aktiv) return null;
  const ok = await bcrypt.compare(String(passwort || ''), b.passwort_hash);
  return ok ? oeffentlich(b) : null;
}

module.exports = {
  oeffentlich,
  liste,
  holen,
  holenPerName,
  anlegen,
  aktualisieren,
  passwortSetzen,
  pruefeAnmeldung,
  BCRYPT_KOSTEN,
};
