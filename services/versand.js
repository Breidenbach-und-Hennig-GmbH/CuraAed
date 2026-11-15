'use strict';

const V = require('../lib/validation');

// Portooptimierung: Wie bekommt eine Adresse ihre Unterlagen – per Post,
// per E-Mail oder beides? Es gibt einen Standard je Adresse und optional
// Abweichungen je Dokumentart (Liste wie in HausPerfekt).

const KANAELE = ['post', 'email', 'beides'];
const DOKUMENTARTEN = [
  ['etv_einladung', 'Einladung zur Eigentümerversammlung'],
  ['serienbrief', 'Serienbrief'],
  ['abrechnung', 'Abrechnung'],
  ['externe_heizkosten', 'Externe Heizkosten'],
  ['interne_heizkosten', 'Interne Heizkostenabrechnung'],
  ['haushaltsnahe_dl', 'Haushaltsnahe Dienstleistung'],
  ['handwerkerauftrag', 'Handwerkerauftrag'],
  ['kautionsabrechnung', 'Kautionsabrechnung'],
  ['mahnung', 'Mahnung'],
  ['mietanpassung', 'Mietanpassung'],
  ['rechnungsausgang', 'Rechnungsausgang'],
  ['umlage', 'Umlage'],
  ['uvi', 'UVI'],
  ['verwaltungsabrechnung', 'Verwaltungsabrechnung'],
];
const ART_KEYS = DOKUMENTARTEN.map(([k]) => k);

async function standardEmail(db, adresseId) {
  const m = await db.get(
    'SELECT adresse FROM adress_emails WHERE adresse_id = ? AND ist_email = 1 ORDER BY standard DESC, id LIMIT 1',
    [adresseId]
  );
  if(m?.adresse)return m.adresse.trim();
  const a=await db.get('SELECT email FROM adressen WHERE id=?',[adresseId]);
  return a?.email?.trim()||null;
}

async function holen(db, adresseId) {
  const a = await db.get('SELECT id, versand_standard FROM adressen WHERE id = ?', [adresseId]);
  if (!a) throw new V.ValidationError('Adresse nicht gefunden.', 404);
  const rows = await db.all('SELECT dokumentart, kanal FROM adress_versand WHERE adresse_id = ?', [adresseId]);
  const abw = Object.fromEntries(rows.map((r) => [r.dokumentart, r.kanal]));
  const standard = a.versand_standard || 'post';
  return {
    standard,
    email: await standardEmail(db, adresseId),
    arten: DOKUMENTARTEN.map(([key, label]) => ({
      key, label, kanal: abw[key] || null, effektiv: abw[key] || standard,
    })),
  };
}

/** data: { standard, abweichungen: { dokumentart: 'post'|'email'|'beides'|'' } } */
async function speichern(db, adresseId, data) {
  const a = await db.get('SELECT id FROM adressen WHERE id = ?', [adresseId]);
  if (!a) throw new V.ValidationError('Adresse nicht gefunden.', 404);
  const standard = V.oneOf(data.standard, KANAELE, 'Standardversand', 'post');
  const abw = data.abweichungen && typeof data.abweichungen === 'object' ? data.abweichungen : {};
  const eintraege = [];
  for (const [key, kanal] of Object.entries(abw)) {
    if (!ART_KEYS.includes(key)) throw new V.ValidationError(`Unbekannte Dokumentart: ${key}`);
    const k = V.str(kanal);
    if (!k || k === standard) continue; // „wie Standard" wird nicht gespeichert
    eintraege.push([key, V.oneOf(k, KANAELE, 'Versand')]);
  }
  await db.transaktion(async (tx) => {
    await tx.run("UPDATE adressen SET versand_standard = ?, geaendert_am = datetime('now') WHERE id = ?", [standard, adresseId]);
    await tx.run('DELETE FROM adress_versand WHERE adresse_id = ?', [adresseId]);
    for (const [key, k] of eintraege) {
      await tx.run('INSERT INTO adress_versand (adresse_id, dokumentart, kanal) VALUES (?,?,?)', [adresseId, key, k]);
    }
  });
  return holen(db, adresseId);
}

/**
 * Versandweg für ein konkretes Dokument (für spätere Serienbriefe/Abrechnungen):
 * → { post: bool, email: 'adresse'|null, hinweis }
 * Ohne hinterlegte E-Mail-Adresse wird automatisch auf Post ausgewichen.
 */
async function versandFuer(db, adresseId, dokumentart) {
  if (!ART_KEYS.includes(dokumentart)) throw new V.ValidationError(`Unbekannte Dokumentart: ${dokumentart}`);
  const v = await holen(db, adresseId);
  const kanal = v.arten.find((x) => x.key === dokumentart).effektiv;
  const willEmail = kanal === 'email' || kanal === 'beides';
  if (willEmail && !v.email) return { post: true, email: null, hinweis: 'Keine E-Mail-Adresse hinterlegt – Versand per Post.' };
  return { post: kanal !== 'email', email: willEmail ? v.email : null, hinweis: null };
}

module.exports = { KANAELE, DOKUMENTARTEN, holen, speichern, versandFuer };
