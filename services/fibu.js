'use strict';

const V = require('../lib/validation');
const { deZahl } = require('../lib/zahl');

// FIBU je Objekt: Grundwerte (Rechnungsart, Buchungsjahre, USt-Option) und
// Kontenrahmen Objekt (Sachkonten 1000–9999 mit WP-Ansatz je Buchungsjahr).
// WEG wird immer als Einnahmen-Überschuss-Rechnung geführt; Hausgeld als Gesamtbetrag.

const RECHNUNGSARTEN = ['eue', 'bilanz'];
const ARTEN = ['S', 'B', 'A'];
const { STANDARD_WEG } = require('./kontenrahmenVorlage');

async function objekt(db, objektId) {
  const o = await db.get('SELECT id, nummer, bezeichnung, objekttyp FROM objekte WHERE id = ?', [objektId]);
  if (!o) throw new V.ValidationError('Objekt nicht gefunden.', 404);
  return o;
}

const jahrPruefen = (v, feld) => {
  const n = V.num(v);
  if (n === null || !Number.isInteger(n) || n < 1990 || n > 2100) throw new V.ValidationError(`"${feld}" muss ein Jahr zwischen 1990 und 2100 sein.`);
  return n;
};

async function grundwerte(db, objektId) {
  const o = await objekt(db, objektId);
  const g = await db.get('SELECT * FROM fibu_objekt WHERE objekt_id = ?', [objektId]);
  const importierte = await db.all('SELECT DISTINCT jahr FROM fibu_buchungen WHERE objekt_id=? ORDER BY jahr', [objektId]);
  const jahre = [...new Set([...(g ? Array.from({ length: g.aktuelles_bj - g.erstes_bj + 1 }, (_, i) => g.erstes_bj + i) : []), ...importierte.map((r) => r.jahr)])].sort((a,b) => a-b);
  return { objekt: o, grundwerte: g || null, jahre };
}

async function grundwerteSpeichern(db, objektId, data) {
  const o = await objekt(db, objektId);
  const alt = await db.get('SELECT * FROM fibu_objekt WHERE objekt_id = ?', [objektId]);
  // WEG: immer Einnahmen-Überschuss-Rechnung
  const rechnungsart = o.objekttyp === 'WEG' ? 'eue' : V.oneOf(data.rechnungsart, RECHNUNGSARTEN, 'Rechnungsart', 'eue');
  const erstes = jahrPruefen(data.erstes_bj, 'Erstes Buchungsjahr');
  const aktuelles = data.aktuelles_bj === undefined || data.aktuelles_bj === '' ? Math.max(erstes, alt ? alt.aktuelles_bj : erstes) : jahrPruefen(data.aktuelles_bj, 'Aktuelles Buchungsjahr');
  if (aktuelles < erstes) throw new V.ValidationError('Das aktuelle Buchungsjahr darf nicht vor dem ersten liegen.');
  const werte = [rechnungsart, erstes, aktuelles, V.bool(data.ust_option), V.str(data.notiz, 2000)];
  if (alt) await db.run("UPDATE fibu_objekt SET rechnungsart=?, erstes_bj=?, aktuelles_bj=?, ust_option=?, notiz=?, geaendert_am=datetime('now') WHERE objekt_id=?", [...werte, objektId]);
  else await db.run('INSERT INTO fibu_objekt (rechnungsart, erstes_bj, aktuelles_bj, ust_option, notiz, objekt_id) VALUES (?,?,?,?,?,?)', [...werte, objektId]);
  return grundwerte(db, objektId);
}

/** Jahreswechsel: nächstes Buchungsjahr anlegen (WP-Ansätze werden übernommen). */
async function buchungsjahrAnlegen(db, objektId) {
  await objekt(db, objektId);
  const g = await db.get('SELECT * FROM fibu_objekt WHERE objekt_id = ?', [objektId]);
  if (!g) throw new V.ValidationError('Bitte zuerst die FIBU-Grundwerte des Objekts anlegen (Strg+F).');
  const neu = g.aktuelles_bj + 1;
  if (neu > 2100) throw new V.ValidationError('Buchungsjahr außerhalb des zulässigen Bereichs.');
  await db.transaktion(async (tx) => {
    await tx.run("UPDATE fibu_objekt SET aktuelles_bj = ?, geaendert_am = datetime('now') WHERE objekt_id = ?", [neu, objektId]);
    await tx.run(
      `INSERT OR IGNORE INTO sachkonto_werte (sachkonto_id, jahr, wp_ansatz)
       SELECT w.sachkonto_id, ?, w.wp_ansatz FROM sachkonto_werte w JOIN sachkonten k ON k.id = w.sachkonto_id
       WHERE k.objekt_id = ? AND w.jahr = ?`,
      [neu, objektId, g.aktuelles_bj]
    );
  });
  return grundwerte(db, objektId);
}

function kontoWerte(data) {
  const nr = V.num(data.nummer);
  if (nr === null || !Number.isInteger(nr) || nr < 1000 || nr > 9999) throw new V.ValidationError('Konto-Nr. muss eine Zahl von 1000 bis 9999 sein.');
  const ref = V.num(data.referenz_konto);
  if (ref !== null && (!Number.isInteger(ref) || ref < 1000 || ref > 9999)) throw new V.ValidationError('Referenz-Konto muss eine Zahl von 1000 bis 9999 sein.');
  return {
    nummer: nr,
    art: V.oneOf(data.art, ARTEN, 'Kontoart', 'S'),
    bezeichnung: V.requireStr(V.str(data.bezeichnung, 80), 'Bezeichnung'),
    referenz_konto: ref,
    aktiv: data.aktiv === undefined ? 1 : V.bool(data.aktiv),
    notiz: V.str(data.notiz, 1000),
  };
}

function betrag(v) {
  const n = V.num(deZahl(v));
  if (n === null) return null;
  if (Math.abs(n) > 1e11) throw new V.ValidationError('Betrag zu groß.');
  return Math.round(n * 100) / 100;
}

const eindeutig = (e) => {
  if (/UNIQUE/.test(String(e && e.message))) throw new V.ValidationError('Diese Konto-Nr. gibt es in diesem Objekt bereits.', 409);
  throw e;
};

async function konten(db, objektId, jahr) {
  await objekt(db, objektId);
  const j = jahr ? jahrPruefen(jahr, 'Buchungsjahr') : null;
  const rows = await db.all(
    `SELECT k.*, w.wp_ansatz FROM sachkonten k LEFT JOIN sachkonto_werte w ON w.sachkonto_id = k.id AND w.jahr = ?
     WHERE k.objekt_id = ? ORDER BY k.nummer`,
    [j, objektId]
  );
  const summen = await db.all(`SELECT konto,COUNT(*) AS anzahl,SUM(soll_cents-haben_cents) AS cents FROM fibu_buchungen
    WHERE objekt_id=? AND (? IS NULL OR jahr=?) GROUP BY konto`, [objektId, j, j]);
  const jeKonto = new Map(summen.map((r) => [Number(r.konto), r]));
  return rows.map((r) => { const s = jeKonto.get(r.nummer); return { ...r, saldo: s ? s.cents / 100 : null, buchungen: s ? s.anzahl : 0 }; });
}

async function wpSpeichern(tx, kontoId, jahr, wp) {
  if (!jahr) return;
  const j = jahrPruefen(jahr, 'Buchungsjahr');
  if (wp === null) await tx.run('DELETE FROM sachkonto_werte WHERE sachkonto_id = ? AND jahr = ?', [kontoId, j]);
  else await tx.run(`INSERT INTO sachkonto_werte (sachkonto_id, jahr, wp_ansatz) VALUES (?,?,?)
    ON CONFLICT(sachkonto_id, jahr) DO UPDATE SET wp_ansatz = excluded.wp_ansatz`, [kontoId, j, wp]);
}

async function kontoAnlegen(db, objektId, data) {
  await objekt(db, objektId);
  const w = kontoWerte(data);
  const wp = betrag(data.wp_ansatz);
  const id = await db.transaktion(async (tx) => {
    const r = await tx.run(
      'INSERT INTO sachkonten (objekt_id, nummer, art, bezeichnung, referenz_konto, aktiv, notiz) VALUES (?,?,?,?,?,?,?)',
      [objektId, w.nummer, w.art, w.bezeichnung, w.referenz_konto, w.aktiv, w.notiz]
    ).catch(eindeutig);
    await wpSpeichern(tx, r.lastID, data.jahr, wp);
    return r.lastID;
  });
  return db.get('SELECT * FROM sachkonten WHERE id = ?', [id]);
}

async function kontoAendern(db, id, data) {
  const k = await db.get('SELECT * FROM sachkonten WHERE id = ?', [id]);
  if (!k) throw new V.ValidationError('Konto nicht gefunden.', 404);
  const w = kontoWerte(data);
  const wp = betrag(data.wp_ansatz);
  await db.transaktion(async (tx) => {
    if ((w.nummer !== k.nummer || w.art !== k.art) && await require('./festkonten').verwendet(tx,k.objekt_id,k.nummer)) throw new V.ValidationError('Dieses Konto ist als Festkonto zugeordnet. Bitte zuerst die Festkontenzuordnung ändern.',409);
    if ((w.nummer !== k.nummer || w.art !== k.art) && await tx.get('SELECT 1 FROM fibu_buchungen WHERE objekt_id=? AND (konto=? OR gegenkonto=?) LIMIT 1', [k.objekt_id, String(k.nummer), String(k.nummer)])) throw new V.ValidationError('Kontonummer und Kontoart eines bebuchten Kontos dürfen nicht geändert werden.', 409);
    await tx.run('UPDATE sachkonten SET nummer=?, art=?, bezeichnung=?, referenz_konto=?, aktiv=?, notiz=? WHERE id=?',
      [w.nummer, w.art, w.bezeichnung, w.referenz_konto, w.aktiv, w.notiz, id]).catch(eindeutig);
    await wpSpeichern(tx, id, data.jahr, wp);
  });
  return db.get('SELECT * FROM sachkonten WHERE id = ?', [id]);
}

async function kontoLoeschen(db, id) {
  await db.transaktion(async (tx) => {
    const k = await tx.get('SELECT objekt_id,nummer FROM sachkonten WHERE id=?', [id]);
    if (!k) throw new V.ValidationError('Konto nicht gefunden.', 404);
    if (await require('./festkonten').verwendet(tx,k.objekt_id,k.nummer)) throw new V.ValidationError('Dieses Konto ist als Festkonto zugeordnet und kann nicht gelöscht werden.',409);
    if (await tx.get('SELECT 1 FROM fibu_buchungen WHERE objekt_id=? AND (konto=? OR gegenkonto=?) LIMIT 1', [k.objekt_id, String(k.nummer), String(k.nummer)])) throw new V.ValidationError('Konto hat Buchungen und kann nur deaktiviert werden.', 409);
    await tx.run('DELETE FROM sachkonten WHERE id=?', [id]);
  });
}

/** Kontenrahmen eines anderen Objekts übernehmen (nur fehlende Konto-Nr.). */
async function kontenKopieren(db, zielId, vonId) {
  await objekt(db, zielId);
  if (String(zielId) === String(vonId)) throw new V.ValidationError('Quelle und Ziel sind dasselbe Objekt.');
  await objekt(db, vonId);
  const r = await db.run(
    `INSERT OR IGNORE INTO sachkonten (objekt_id, nummer, art, bezeichnung, referenz_konto, aktiv, notiz)
     SELECT ?, nummer, art, bezeichnung, referenz_konto, aktiv, notiz FROM sachkonten WHERE objekt_id = ?`,
    [zielId, vonId]
  );
  return { uebernommen: r.changes };
}

/** Standard-Kontenrahmen (Vorlage) übernehmen – nur fehlende Konto-Nr. */
async function kontenAusVorlage(db, objektId) {
  await objekt(db, objektId);
  let neu = 0;
  await db.transaktion(async (tx) => {
    for (const [nummer, art, bezeichnung] of STANDARD_WEG) {
      const r = await tx.run('INSERT OR IGNORE INTO sachkonten (objekt_id, nummer, art, bezeichnung) VALUES (?,?,?,?)', [objektId, nummer, art, bezeichnung]);
      neu += r.changes;
    }
  });
  return { uebernommen: neu, vorlage: STANDARD_WEG.length };
}

module.exports = { ARTEN, kontenAusVorlage, RECHNUNGSARTEN, grundwerte, grundwerteSpeichern, buchungsjahrAnlegen, konten, kontoAnlegen, kontoAendern, kontoLoeschen, kontenKopieren };
