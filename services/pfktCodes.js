'use strict';

const V = require('../lib/validation');

// Liste der Personenfunktions-Codes (HausPerfekt): 001 Eigentümer eigengenutzt, 002 Eigentümer fremdvermietet, …
async function liste(db) {
  return db.all(`SELECT c.*, (SELECT COUNT(*) FROM rollen_zuordnungen z WHERE z.pfkt_code = c.code) AS verwendet
                 FROM pfkt_codes c ORDER BY c.code`);
}

function werte(data) {
  const code = V.requireStr(V.str(data.code, 3), 'Code').toUpperCase();
  if (!/^[0-9A-Z$]{1,3}$/.test(code)) throw new V.ValidationError('Code: bis zu 3 Zeichen (Ziffern, Großbuchstaben, $), z. B. 002.');
  const kennz = V.str(data.kennz, 1) ? V.oneOf(V.str(data.kennz, 1).toUpperCase(), ['E', 'M', 'L', 'A'], 'Kennzeichen') : null;
  return { code, bezeichnung: V.requireStr(V.str(data.bezeichnung, 60), 'Bezeichnung'), rolle: V.oneOf(data.rolle, V.ROLLEN, 'Funktion'), kennz };
}

async function speichern(db, data) {
  const w = werte(data);
  const alt = await db.get('SELECT * FROM pfkt_codes WHERE code = ?', [w.code]);
  if (alt && alt.rolle !== w.rolle && (await db.get('SELECT 1 FROM rollen_zuordnungen WHERE pfkt_code = ?', [w.code]))) {
    throw new V.ValidationError(`Code ${w.code} wird bereits verwendet – die Funktion kann nicht mehr geändert werden.`, 409);
  }
  await db.run(`INSERT INTO pfkt_codes (code, bezeichnung, rolle, kennz) VALUES (?,?,?,?)
    ON CONFLICT(code) DO UPDATE SET bezeichnung = excluded.bezeichnung, rolle = excluded.rolle, kennz = excluded.kennz`, [w.code, w.bezeichnung, w.rolle, w.kennz]);
  return db.get('SELECT * FROM pfkt_codes WHERE code = ?', [w.code]);
}

async function loeschen(db, code) {
  if (await db.get('SELECT 1 FROM rollen_zuordnungen WHERE pfkt_code = ?', [code])) throw new V.ValidationError(`Code ${code} wird verwendet und kann nicht gelöscht werden.`, 409);
  const r = await db.run('DELETE FROM pfkt_codes WHERE code = ?', [code]);
  if (!r.changes) throw new V.ValidationError('Code nicht gefunden.', 404);
}

module.exports = { liste, speichern, loeschen };
