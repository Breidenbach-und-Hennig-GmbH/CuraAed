'use strict';

const V = require('../lib/validation');

// Bankverbindungen je Adresse inkl. SEPA-Lastschriftmandat. Die IBAN wird mit
// der ISO-13616-Prüfziffer (Modulo 97) geprüft.

const IBAN = require('../lib/iban');

const ibanNormalisieren = IBAN.normalisieren;
const ibanGueltig = IBAN.gueltig;
const ibanFormat = IBAN.format;

async function adresseVorhanden(db, adresseId) {
  const a = await db.get('SELECT id FROM adressen WHERE id = ?', [adresseId]);
  if (!a) throw new V.ValidationError('Adresse nicht gefunden.', 404);
}

/** IBAN/BIC prüfen; BIC und Bankname aus der Bankleitzahlendatei ergänzen, wenn leer. */
function bankWerte(data) {
  if (!ibanNormalisieren(data.iban)) throw new V.ValidationError('Feld "IBAN" ist erforderlich.');
  if (V.str(data.bic) && V.str(data.bic).length > 11) throw new V.ValidationError(`Ungültige BIC: ${ibanNormalisieren(data.bic)}`);
  const p = IBAN.pruefen(data.iban, data.bic);
  if (p.fehler) throw new V.ValidationError(p.fehler);
  return {
    iban: p.iban,
    bic: ibanNormalisieren(data.bic) || p.bic_vorschlag || null,
    bankname: V.str(data.bankname, 100) || (p.bank ? p.bank.name : null),
    hinweise: p.hinweise,
  };
}

function werte(data) {
  const { iban, bic, bankname, hinweise } = bankWerte(data);
  const ref = V.str(data.mandatsreferenz, 35);
  if (ref && !/^[A-Za-z0-9+?/\-:().,' ]+$/.test(ref)) throw new V.ValidationError('Mandatsreferenz: nur Buchstaben, Ziffern und + ? / - : ( ) . , \' erlaubt (max. 35 Zeichen).');
  const datum = V.isoDate(data.mandat_datum, 'Mandat unterschrieben am');
  const aktiv = V.bool(data.mandat_aktiv);
  if (aktiv && (!ref || !datum)) throw new V.ValidationError('Für ein aktives SEPA-Mandat sind Mandatsreferenz und Unterschriftsdatum erforderlich.');
  if (datum && datum > new Date().toISOString().slice(0, 10)) throw new V.ValidationError('Das Mandat kann nicht in der Zukunft unterschrieben sein.');
  return {
    kontoinhaber: V.requireStr(V.str(data.kontoinhaber, 70), 'Kontoinhaber'),
    iban, bic, bankname, hinweise,
    standard: V.bool(data.standard),
    mandatsreferenz: ref, mandat_datum: datum, mandat_aktiv: aktiv,
    bemerkung: V.str(data.bemerkung, 300),
  };
}

const SPALTEN = ['kontoinhaber', 'iban', 'bic', 'bankname', 'standard', 'mandatsreferenz', 'mandat_datum', 'mandat_aktiv', 'bemerkung'];

/** Prüfungen gegen den Bestand: gleiche IBAN doppelt (Fehler) oder bei anderen Adressen (Hinweis). */
async function bestandPruefen(db, adresseId, w, eigeneId = 0) {
  if (await db.get('SELECT 1 FROM adress_bank WHERE adresse_id = ? AND iban = ? AND id <> ?', [adresseId, w.iban, eigeneId])) {
    throw new V.ValidationError(`Die IBAN ${ibanFormat(w.iban)} ist bei dieser Adresse bereits hinterlegt.`, 409);
  }
  const andere = await db.all(
    `SELECT a.nummer, a.adresstyp, a.vorname, a.nachname, a.firmenname FROM adress_bank b JOIN adressen a ON a.id = b.adresse_id
     WHERE b.iban = ? AND b.adresse_id <> ? LIMIT 3`, [w.iban, adresseId]);
  if (andere.length) {
    w.hinweise.push(`Diese IBAN ist auch hinterlegt bei: ${andere.map((a) => `${a.nummer} ${a.adresstyp === 'firma' ? a.firmenname : [a.vorname, a.nachname].filter(Boolean).join(' ')}`).join(', ')}.`);
  }
  if (w.mandatsreferenz && await db.get('SELECT 1 FROM adress_bank WHERE mandatsreferenz = ? AND id <> ?', [w.mandatsreferenz, eigeneId])) {
    w.hinweise.push(`Die Mandatsreferenz ${w.mandatsreferenz} wird bereits bei einer anderen Bankverbindung verwendet – Mandatsreferenzen müssen je Gläubiger eindeutig sein.`);
  }
}

async function liste(db, adresseId) {
  await adresseVorhanden(db, adresseId);
  return db.all('SELECT * FROM adress_bank WHERE adresse_id = ? ORDER BY standard DESC, id', [adresseId]);
}

async function standardSetzen(db, adresseId, id) {
  await db.run('UPDATE adress_bank SET standard = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE adresse_id = ?', [id, adresseId]);
}

async function anlegen(db, adresseId, data) {
  await adresseVorhanden(db, adresseId);
  const w = werte(data);
  await bestandPruefen(db, adresseId, w);
  const anzahl = (await db.get('SELECT COUNT(*) AS n FROM adress_bank WHERE adresse_id = ?', [adresseId])).n;
  if (anzahl === 0) w.standard = 1; // erste Bankverbindung ist automatisch Standard
  const r = await db.run(
    `INSERT INTO adress_bank (adresse_id, ${SPALTEN.join(', ')}) VALUES (?${',?'.repeat(SPALTEN.length)})`,
    [adresseId, ...SPALTEN.map((s) => w[s])]
  );
  if (w.standard) await standardSetzen(db, adresseId, r.lastID);
  return { ...(await db.get('SELECT * FROM adress_bank WHERE id = ?', [r.lastID])), hinweise: w.hinweise };
}

async function aktualisieren(db, id, data) {
  const b = await db.get('SELECT * FROM adress_bank WHERE id = ?', [id]);
  if (!b) throw new V.ValidationError('Bankverbindung nicht gefunden.', 404);
  const w = werte(data);
  await bestandPruefen(db, b.adresse_id, w, b.id);
  await db.run(`UPDATE adress_bank SET ${SPALTEN.map((s) => s + '=?').join(', ')} WHERE id = ?`, [...SPALTEN.map((s) => w[s]), id]);
  if (w.standard) await standardSetzen(db, b.adresse_id, id);
  return { ...(await db.get('SELECT * FROM adress_bank WHERE id = ?', [id])), hinweise: w.hinweise };
}

async function loeschen(db, id) {
  const b = await db.get('SELECT * FROM adress_bank WHERE id = ?', [id]);
  if (!b) throw new V.ValidationError('Bankverbindung nicht gefunden.', 404);
  await db.run('DELETE FROM adress_bank WHERE id = ?', [id]);
  if (b.standard) {
    const naechste = await db.get('SELECT id FROM adress_bank WHERE adresse_id = ? ORDER BY id LIMIT 1', [b.adresse_id]);
    if (naechste) await standardSetzen(db, b.adresse_id, naechste.id);
  }
  return { geloescht: true };
}

module.exports = { bankWerte, ibanGueltig, ibanNormalisieren, ibanFormat, liste, anlegen, aktualisieren, loeschen };
