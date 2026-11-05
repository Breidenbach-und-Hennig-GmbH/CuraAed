'use strict';

// IBAN-Prüfung und Bankermittlung – ohne externe Dienste.
// Deutsche IBAN: DE + 2 Prüfziffern + 8 Bankleitzahl + 10 Kontonummer.
// Bank/BIC kommen aus der Bankleitzahlendatei der Bundesbank (lib/blz-daten.json,
// aktualisieren mit tools/blz-aktualisieren.js).
const BLZ = require('./blz-daten.json');

const LAENGEN = {
  DE: 22, AT: 20, CH: 21, NL: 18, BE: 16, LU: 20, FR: 27, IT: 27, ES: 24, PL: 28, DK: 18, CZ: 24,
  LI: 21, GB: 22, IE: 22, PT: 25, SE: 24, FI: 18, NO: 15, GR: 27, HU: 28, SK: 24, SI: 19, HR: 21, MC: 27,
};
const LAND = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', NL: 'Niederlande', BE: 'Belgien', LU: 'Luxemburg', FR: 'Frankreich', IT: 'Italien', ES: 'Spanien', PL: 'Polen', DK: 'Dänemark', CZ: 'Tschechien' };

const normalisieren = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
const format = (iban) => String(iban || '').replace(/(.{4})/g, '$1 ').trim();

function pruefziffernOk(iban) {
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const z of umgestellt) {
    const n = /[A-Z]/.test(z) ? String(z.charCodeAt(0) - 55) : z;
    for (const ziffer of n) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1;
}

function gueltig(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const soll = LAENGEN[iban.slice(0, 2)];
  if (soll && iban.length !== soll) return false;
  if (iban.startsWith('DE') && !/^DE\d{20}$/.test(iban)) return false;
  return pruefziffernOk(iban);
}

function blzInfo(blz) {
  const b = BLZ.banken[blz];
  if (!b) return null;
  return { blz, name: b[0], ort: b[1], bic: b[2] || null, pruefmethode: b[3], geloescht: !!b[4], nachfolge_blz: b[5] || null };
}

const bicFormatOk = (bic) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);
const bicGleich = (a, b) => a && b && (a.length === 8 ? a + 'XXX' : a) === (b.length === 8 ? b + 'XXX' : b);

/**
 * Plausibilitätsprüfung. Liefert { iban, land, blz, bank, bic_vorschlag, fehler, hinweise }.
 * fehler = Text, wenn die IBAN nicht verwendet werden darf; hinweise = Warnungen (Speichern möglich).
 */
function pruefen(ibanRoh, bicRoh) {
  const iban = normalisieren(ibanRoh);
  const bic = normalisieren(bicRoh);
  const ergebnis = { iban, iban_format: format(iban), land: iban.slice(0, 2), blz: null, bank: null, bic_vorschlag: null, fehler: null, hinweise: [] };
  if (!iban) { ergebnis.fehler = 'Bitte eine IBAN eingeben.'; return ergebnis; }
  if (!/^[A-Z]{2}/.test(iban)) { ergebnis.fehler = 'Die IBAN ist ungültig: Sie muss mit dem Ländercode beginnen (z. B. DE).'; return ergebnis; }
  const soll = LAENGEN[ergebnis.land];
  if (soll && iban.length !== soll) {
    ergebnis.fehler = `Die IBAN ist ungültig: Eine IBAN aus ${LAND[ergebnis.land] || ergebnis.land} hat ${soll} Stellen – eingegeben sind ${iban.length}.`;
    return ergebnis;
  }
  if (!gueltig(iban)) { ergebnis.fehler = `Die IBAN ${format(iban)} ist ungültig (Prüfziffer stimmt nicht – bitte auf Zahlendreher prüfen).`; return ergebnis; }
  if (!soll) ergebnis.hinweise.push(`Für das Land ${ergebnis.land} ist keine Längenprüfung hinterlegt – Prüfziffer ist korrekt.`);
  if (ergebnis.land === 'DE') {
    ergebnis.blz = iban.slice(4, 12);
    const b = blzInfo(ergebnis.blz);
    if (!b) {
      ergebnis.fehler = `Die IBAN ist ungültig: Die Bankleitzahl ${ergebnis.blz} gibt es laut Bundesbank nicht.`;
      return ergebnis;
    }
    ergebnis.bank = b;
    ergebnis.bic_vorschlag = b.bic;
    if (b.geloescht) {
      const n = b.nachfolge_blz ? blzInfo(b.nachfolge_blz) : null;
      ergebnis.hinweise.push(`Die Bankleitzahl ${b.blz} (${b.name}) ist zur Löschung vorgesehen${n ? ` – Nachfolger: ${n.blz} ${n.name}` : ''}. Bitte beim Kunden eine aktuelle IBAN erfragen.`);
    }
  }
  if (bic) {
    if (!bicFormatOk(bic)) ergebnis.fehler = `Ungültige BIC: ${bic}`;
    else {
      if (bic.slice(4, 6) !== ergebnis.land) ergebnis.hinweise.push(`BIC ${bic} gehört zu einem anderen Land (${bic.slice(4, 6)}) als die IBAN (${ergebnis.land}).`);
      if (ergebnis.bic_vorschlag && !bicGleich(bic, ergebnis.bic_vorschlag)) {
        ergebnis.hinweise.push(`Die BIC ${bic} passt nicht zur Bankleitzahl ${ergebnis.blz} – laut Bundesbank: ${ergebnis.bic_vorschlag} (${ergebnis.bank.name}).`);
      }
    }
  }
  return ergebnis;
}

module.exports = { LAENGEN, normalisieren, format, gueltig, blzInfo, pruefen, bicFormatOk, stand: BLZ.stand };
