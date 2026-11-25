'use strict';

const V = require('../lib/validation');
const tabelle = require('../lib/tabelle');

// Import des Kontenrahmens aus einem HausPerfekt-Export (Excel/CSV).
// Übernommen werden Sach-, Bank- und Sonderkonten (S/B/A, Nr. 1000–9999) samt Abrechnungsangaben;
// Personenkonten (K) und Lieferanten (L) werden gezählt, aber nicht als Sachkonten angelegt.

// Feldfolge des HausPerfekt-Exports „Kontenrahmen" (Spalte „StS" und „Eg" stehen dort in einer Zelle)
const HP_FELDER = ['Konto', 'Bezeichnung', 'E', 'StS', 'Eg', 'Mi', 'DE', 'JA', 'WP', 'S', 'F', 'Abr', 'GuV', 'Bil', 'Hn.DL',
  'AA EG', 'AA MI', 'VS EG', 'Typ EG', 'Art EG', 'VS MI', 'Typ MI', 'Art MI', 'BS', 'Referenz-Konto', 'virt.Kto'];
const ARTEN_SACH = ['S', 'B', 'A'];
const ART_NAME = { K: 'Personenkonten (Debitoren)', L: 'Lieferanten (Kreditoren)' };
const MAX_ZEILEN = 5000;

const sauber = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function kopfzeileFinden(zeilen) {
  for (let i = 0; i < Math.min(zeilen.length, 15); i++) {
    const z = zeilen[i].map((x) => sauber(x).toLowerCase());
    const konto = z.findIndex((x) => /konto/.test(x) && /(nr|nummer)/.test(x));
    const bez = z.findIndex((x) => x.startsWith('bezeichnung'));
    if (konto >= 0 && bez >= 0) return { index: i, kopf: zeilen[i].map(sauber), konto, bez };
  }
  throw new V.ValidationError('In der Datei wurde keine Kopfzeile mit „Konto Nr" und „Bezeichnung" gefunden.');
}

/** Datenzeile in Felder zerlegen: HausPerfekt-Format (StS+Eg in einer Zelle) oder generisch über die Kopfzeile. */
function felder(zeile, k) {
  const hp = k.kopf.some((x) => /^sts$/i.test(x)) && /^\d{3}\s+[JN]$/i.test(sauber(zeile[3]));
  if (hp) {
    const [sts, eg] = sauber(zeile[3]).split(/\s+/);
    const werte = [zeile[0], zeile[1], zeile[2], sts, eg, ...zeile.slice(4)].map(sauber);
    return Object.fromEntries(HP_FELDER.map((f, i) => [f, werte[i] ?? '']));
  }
  const f = {};
  k.kopf.forEach((name, i) => { if (name) f[i === k.konto ? 'Konto' : i === k.bez ? 'Bezeichnung' : name] = sauber(zeile[i]); });
  return f;
}

function auswerten(buf) {
  let zeilen;
  try { zeilen = tabelle.lesen(buf); } catch (e) { throw new V.ValidationError('Die Datei konnte nicht gelesen werden: ' + e.message); }
  if (zeilen.length > MAX_ZEILEN) throw new V.ValidationError(`Zu viele Zeilen (max. ${MAX_ZEILEN}).`);
  const k = kopfzeileFinden(zeilen);
  const konten = []; const uebersprungen = {}; const fehler = [];
  for (const zeile of zeilen.slice(k.index + 1)) {
    if (!zeile.some((x) => sauber(x))) continue;
    const f = felder(zeile, k);
    const m = sauber(f.Konto).match(/^(\d+)\s*([A-Z])?$/i);
    if (!m) { fehler.push(`Zeile „${sauber(f.Konto)} ${sauber(f.Bezeichnung)}" – Konto-Nr. nicht erkannt.`); continue; }
    const nummer = Number(m[1]);
    const art = (m[2] || f.Art || f.Kontoart || 'S').toUpperCase().slice(0, 1);
    if (!ARTEN_SACH.includes(art)) { uebersprungen[art] = (uebersprungen[art] || 0) + 1; continue; }
    if (nummer < 1000 || nummer > 9999) { fehler.push(`Konto ${nummer} liegt außerhalb 1000–9999 – übersprungen.`); continue; }
    const bezeichnung = sauber(f.Bezeichnung).slice(0, 80);
    if (!bezeichnung) { fehler.push(`Konto ${nummer} ohne Bezeichnung – übersprungen.`); continue; }
    const ref = Number(sauber(f['Referenz-Konto'] || f['Referenz-Konto '] || ''));
    const attribute = {};
    for (const [name, wert] of Object.entries(f)) {
      if (['Konto', 'Bezeichnung', 'Referenz-Konto', 'VS EG', 'VS MI'].includes(name) || wert === '') continue;
      attribute[name.slice(0, 30)] = wert.slice(0, 40);
    }
    konten.push({
      nummer, art, bezeichnung,
      referenz_konto: ref >= 1000 && ref <= 9999 ? ref : null,
      vs_eg: sauber(f['VS EG']) || null,
      vs_mi: sauber(f['VS MI']) || null,
      hp_attribute: Object.keys(attribute).length ? JSON.stringify(attribute) : null,
    });
  }
  return { konten, uebersprungen, fehler };
}

/** Prüfen (ausfuehren = false) oder importieren. Vorhandene Konto-Nr. werden aktualisiert. */
async function importieren(db, objektId, buf, { ausfuehren = false } = {}) {
  const o = await db.get('SELECT id, nummer, bezeichnung FROM objekte WHERE id = ?', [objektId]);
  if (!o) throw new V.ValidationError('Objekt nicht gefunden.', 404);
  const { konten, uebersprungen, fehler } = auswerten(buf);
  if (!konten.length) throw new V.ValidationError('Die Datei enthält keine Sachkonten (1000–9999, Art S/B/A).');
  const vorhanden = new Map((await db.all('SELECT * FROM sachkonten WHERE objekt_id = ?', [objektId])).map((k) => [k.nummer, k]));
  const neu = konten.filter((k) => !vorhanden.has(k.nummer));
  const geaendert = konten.filter((k) => {
    const a = vorhanden.get(k.nummer);
    return a && (a.bezeichnung !== k.bezeichnung || a.art !== k.art || (a.vs_eg || null) !== k.vs_eg || (a.vs_mi || null) !== k.vs_mi
      || (a.referenz_konto || null) !== k.referenz_konto || (a.hp_attribute || null) !== k.hp_attribute);
  });
  if (ausfuehren) {
    await db.transaktion(async (tx) => {
      for (const k of neu) {
        await tx.run('INSERT INTO sachkonten (objekt_id, nummer, art, bezeichnung, referenz_konto, vs_eg, vs_mi, hp_attribute) VALUES (?,?,?,?,?,?,?,?)',
          [objektId, k.nummer, k.art, k.bezeichnung, k.referenz_konto, k.vs_eg, k.vs_mi, k.hp_attribute]);
      }
      for (const k of geaendert) {
        if (vorhanden.get(k.nummer).art !== k.art && await require('./festkonten').verwendet(tx,objektId,k.nummer)) {
          throw new V.ValidationError(`Konto ${k.nummer} ist als Festkonto zugeordnet. Die abweichende Kontoart aus der Datei kann nicht übernommen werden.`,409);
        }
        await tx.run('UPDATE sachkonten SET art=?, bezeichnung=?, referenz_konto=?, vs_eg=?, vs_mi=?, hp_attribute=? WHERE objekt_id=? AND nummer=?',
          [k.art, k.bezeichnung, k.referenz_konto, k.vs_eg, k.vs_mi, k.hp_attribute, objektId, k.nummer]);
      }
    });
  }
  return {
    objekt: o,
    ausgefuehrt: ausfuehren,
    gesamt: konten.length,
    neu: neu.length,
    aktualisiert: geaendert.length,
    unveraendert: konten.length - neu.length - geaendert.length,
    je_art: konten.reduce((m, k) => ({ ...m, [k.art]: (m[k.art] || 0) + 1 }), {}),
    uebersprungen: Object.entries(uebersprungen).map(([art, anzahl]) => ({ art, anzahl, text: ART_NAME[art] || `Kontoart ${art}` })),
    fehler: fehler.slice(0, 50),
    beispiele: konten.slice(0, 8).map((k) => ({ nummer: k.nummer, art: k.art, bezeichnung: k.bezeichnung, vs_eg: k.vs_eg, vs_mi: k.vs_mi })),
  };
}

module.exports = { auswerten, importieren };
