'use strict';

/** Deutsche Zahlenschreibweise: „14.600,5" / „518,7" / „14.600" → Zahl-String; „1.5" bleibt 1,5. */
function deZahl(v) {
  if (typeof v !== 'string') return v;
  const t = v.trim().replace(/\s+/g, '');
  if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.');
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return t.replace(/\./g, '');
  return t;
}

module.exports = { deZahl };
