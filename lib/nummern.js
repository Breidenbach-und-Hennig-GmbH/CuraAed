'use strict';

const V = require('./validation');

// Nummern für Objekte, Einheiten und Adressen. Sie sind eindeutig
// (Groß-/Kleinschreibung egal) und dienen u. a. der Archiv-Zuordnung.
const NUMMER_RE = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,29}$/;
const START_OBJEKT = 1001;
const START_ADRESSE = 10001;

function pruefeNummer(v, feld) {
  const s = V.str(v);
  if (!s) return null;
  if (!NUMMER_RE.test(s)) {
    throw new V.ValidationError(
      `Ungültige ${feld} „${s}": erlaubt sind Buchstaben, Ziffern und . _ / - (max. 30 Zeichen).`
    );
  }
  return s;
}

/** Zerlegt eine Eingabe wie "1001, 1002 1003" in eindeutige, geprüfte Nummern. */
function nummernListe(v, feld) {
  const s = V.str(v);
  if (!s) return [];
  const teile = [...new Set(s.split(/[\s,;]+/).filter(Boolean))];
  if (teile.length > 50) throw new V.ValidationError(`Zu viele ${feld}n (max. 50).`);
  return teile.map((t) => pruefeNummer(t, feld));
}

function istNummerKonflikt(e) {
  return !!(e && e.code === 'SQLITE_CONSTRAINT' && /UNIQUE/i.test(e.message) && /nummer/i.test(e.message));
}

// Höchste rein numerische Nummer der Tabelle + 1 (mindestens start).
async function naechsteGanzzahl(db, tabelle, start) {
  const r = await db.get(
    `SELECT MAX(CAST(nummer AS INTEGER)) AS m FROM ${tabelle}
     WHERE nummer <> '' AND nummer NOT GLOB '*[^0-9]*'`
  );
  return String(Math.max(start, (r && r.m ? r.m : 0) + 1));
}

const naechsteObjektNr = (db) => naechsteGanzzahl(db, 'objekte', START_OBJEKT);
const naechsteAdressNr = (db) => naechsteGanzzahl(db, 'adressen', START_ADRESSE);

/** Einheit-Nr. = "<Objekt-Nr.>-<laufende Nr.>", z. B. 1001-03. */
async function naechsteEinheitNr(db, objektId) {
  const o = await db.get('SELECT nummer FROM objekte WHERE id = ?', [objektId]);
  const praefix = (o && o.nummer) || String(objektId);
  const rows = await db.all('SELECT nummer FROM einheiten WHERE objekt_id = ?', [objektId]);
  let max = 0;
  for (const r of rows) {
    if (r.nummer && r.nummer.startsWith(praefix + '-')) {
      const rest = r.nummer.slice(praefix.length + 1);
      if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
    }
  }
  // Global eindeutig: bei manuell vergebenen Kollisionen weiterzählen.
  for (let n = max + 1; ; n++) {
    const kandidat = `${praefix}-${String(n).padStart(2, '0')}`;
    const belegt = await db.get('SELECT 1 FROM einheiten WHERE nummer = ? COLLATE NOCASE', [kandidat]);
    if (!belegt) return kandidat;
  }
}

/**
 * Fügt einen Datensatz mit Nummer ein. Manuelle Nummer: Konflikt → 409.
 * Automatische Nummer: bei gleichzeitiger Vergabe erneut versuchen.
 */
async function einfuegenMitNummer({ manuell, naechste, einfuegen, feld }) {
  for (let versuch = 0; versuch < 5; versuch++) {
    const nr = manuell || (await naechste());
    try {
      return await einfuegen(nr);
    } catch (e) {
      if (!istNummerKonflikt(e)) throw e;
      if (manuell) throw new V.ValidationError(`${feld} „${manuell}" ist bereits vergeben.`, 409);
    }
  }
  throw new V.ValidationError(`${feld} konnte nicht automatisch vergeben werden.`, 500);
}

/** Update mit Nummer: Konflikt → 409. */
async function aktualisierenMitNummer(fn, nummer, feld) {
  try {
    return await fn();
  } catch (e) {
    if (istNummerKonflikt(e)) throw new V.ValidationError(`${feld} „${nummer}" ist bereits vergeben.`, 409);
    throw e;
  }
}

module.exports = {
  pruefeNummer,
  nummernListe,
  istNummerKonflikt,
  naechsteObjektNr,
  naechsteAdressNr,
  naechsteEinheitNr,
  einfuegenMitNummer,
  aktualisierenMitNummer,
};
