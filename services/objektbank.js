'use strict';

const V = require('../lib/validation');
const { bankWerte, ibanFormat } = require('./bank');

// Bankkonten eines Objekts (HausPerfekt „Bank" in der Objektmaske):
// Hausgeldkonto, Rücklagenkonto, Mietkonto, Kautionskonto …

const SPALTEN = ['kontoart', 'kontoinhaber', 'iban', 'bic', 'bankname', 'standard', 'bemerkung'];

async function objektVorhanden(db, objektId) {
  if (!(await db.get('SELECT id FROM objekte WHERE id = ?', [objektId]))) throw new V.ValidationError('Objekt nicht gefunden.', 404);
}

function werte(data) {
  const { iban, bic, bankname, hinweise } = bankWerte(data);
  return {
    kontoart: V.oneOf(data.kontoart, V.KONTOARTEN, 'Kontoart', 'hausgeld'),
    kontoinhaber: V.requireStr(V.str(data.kontoinhaber, 70), 'Kontoinhaber'),
    iban, bic, bankname, hinweise,
    standard: V.bool(data.standard),
    bemerkung: V.str(data.bemerkung, 300),
  };
}

async function liste(db, objektId) {
  await objektVorhanden(db, objektId);
  return db.all('SELECT * FROM objekt_bank WHERE objekt_id = ? ORDER BY standard DESC, kontoart, id', [objektId]);
}

async function standardSetzen(db, objektId, id) {
  await db.run('UPDATE objekt_bank SET standard = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE objekt_id = ?', [id, objektId]);
}

async function anlegen(db, objektId, data) {
  await objektVorhanden(db, objektId);
  const w = werte(data);
  if ((await db.get('SELECT COUNT(*) AS n FROM objekt_bank WHERE objekt_id = ?', [objektId])).n === 0) w.standard = 1;
  const r = await db.run(
    `INSERT INTO objekt_bank (objekt_id, ${SPALTEN.join(', ')}) VALUES (?${',?'.repeat(SPALTEN.length)})`,
    [objektId, ...SPALTEN.map((s) => w[s])]
  );
  if (w.standard) await standardSetzen(db, objektId, r.lastID);
  return { ...(await db.get('SELECT * FROM objekt_bank WHERE id = ?', [r.lastID])), hinweise: w.hinweise };
}

async function aktualisieren(db, id, data) {
  const b = await db.get('SELECT * FROM objekt_bank WHERE id = ?', [id]);
  if (!b) throw new V.ValidationError('Bankkonto nicht gefunden.', 404);
  const w = werte(data);
  await db.run(`UPDATE objekt_bank SET ${SPALTEN.map((s) => `${s}=?`).join(', ')} WHERE id = ?`, [...SPALTEN.map((s) => w[s]), id]);
  if (w.standard) await standardSetzen(db, b.objekt_id, id);
  return { ...(await db.get('SELECT * FROM objekt_bank WHERE id = ?', [id])), hinweise: w.hinweise };
}

async function loeschen(db, id) {
  const b = await db.get('SELECT * FROM objekt_bank WHERE id = ?', [id]);
  if (!b) throw new V.ValidationError('Bankkonto nicht gefunden.', 404);
  await db.run('DELETE FROM objekt_bank WHERE id = ?', [id]);
  if (b.standard) {
    const naechste = await db.get('SELECT id FROM objekt_bank WHERE objekt_id = ? ORDER BY id LIMIT 1', [b.objekt_id]);
    if (naechste) await standardSetzen(db, b.objekt_id, naechste.id);
  }
}

module.exports = { liste, anlegen, aktualisieren, loeschen };
