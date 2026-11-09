'use strict';

/** Fehler mit HTTP-Statuscode für einheitliche API-Antworten. */
class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

const MAX_TEXT = 10000;

function str(v, max = MAX_TEXT) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s.length > max) throw new ValidationError(`Eingabe zu lang (max. ${max} Zeichen).`);
  return s === '' ? null : s;
}

function requireStr(v, feld) {
  const s = str(v);
  if (!s) throw new ValidationError(`Feld "${feld}" ist erforderlich.`);
  return s;
}

function oneOf(v, erlaubt, feld, fallback) {
  const s = str(v) || fallback;
  if (!erlaubt.includes(s)) {
    throw new ValidationError(
      `Ungültiger Wert für "${feld}": ${v}. Erlaubt: ${erlaubt.join(', ')}.`
    );
  }
  return s;
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (Number.isNaN(n)) throw new ValidationError(`Ungültige Zahl: ${v}.`);
  return n;
}

function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
}

/** Prüft ISO-Datum (YYYY-MM-DD) oder null. */
function isoDate(v, feld) {
  const s = str(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError(`Ungültiges Datum für "${feld}" (erwartet JJJJ-MM-TT).`);
  }
  return s;
}

const OBJEKTTYPEN = ['WEG', 'MIETE', 'HP'];
const EINHEITSTYPEN = ['wohnung', 'stellplatz', 'gewerbe', 'keller', 'sonstiges'];
const ADRESSTYPEN = ['person', 'firma'];
const ROLLEN = [
  'eigentuemer',
  'mieter',
  'handwerker',
  'beirat',
  'verwalter_kontakt',
  'hausmeister',
  'sonstiges',
];
const DOK_KATEGORIEN = [
  'protokoll',
  'vertrag',
  'abrechnung',
  'rechnung',
  'korrespondenz',
  'begehung',
  'uebergabe',
  'plan',
  'foto',
  'sonstiges',
];
const KONTOARTEN = ['hausgeld', 'ruecklage', 'miete', 'kaution', 'sonstiges'];
const BENUTZER_ROLLEN = ['admin', 'mitarbeiter', 'leser'];

module.exports = {
  ValidationError,
  str,
  requireStr,
  oneOf,
  num,
  bool,
  isoDate,
  OBJEKTTYPEN,
  EINHEITSTYPEN,
  ADRESSTYPEN,
  ROLLEN,
  DOK_KATEGORIEN,
  KONTOARTEN,
  BENUTZER_ROLLEN,
};
