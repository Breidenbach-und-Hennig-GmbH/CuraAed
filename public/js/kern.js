'use strict';

/* HausPerfekt 2.0 – gemeinsame Grundlagen (Beschriftungen, Zustand, Helfer). */

const APP_NAME = 'CuraAedificii';
// Seitenfeld „Tastaturbefehle" (Strg a Adresse … Strg w Wohnung) vorerst ausgeblendet –
// Liste bleibt in BEFEHLE (shell.js) erhalten und ist über Hilfe → Tastaturbefehle
// erreichbar. Zum Wiedereinblenden auf true setzen.
const TASTEN_PANEL_ANZEIGEN = false;
const { el, esc, toast, fehler, modal, bestaetigen, formular, badgeObjekttyp, datum, dateiGroesse } = UI;

// ---- Beschriftungen (Enums -> Deutsch) ----
const L = {
  einheitstyp: { wohnung: 'Wohnung', stellplatz: 'Stellplatz', gewerbe: 'Gewerbe', keller: 'Keller', sonstiges: 'Sonstiges' },
  adresstyp: { person: 'Person', firma: 'Firma' },
  rolle: {
    eigentuemer: 'Eigentümer', mieter: 'Mieter', handwerker: 'Handwerker/Dienstleister',
    beirat: 'Beirat', verwalter_kontakt: 'Verwalter-Kontakt', hausmeister: 'Hausmeister', sonstiges: 'Sonstiges',
  },
  kategorie: {
    protokoll: 'Protokoll', vertrag: 'Vertrag', abrechnung: 'Abrechnung', rechnung: 'Rechnung',
    korrespondenz: 'Korrespondenz', begehung: 'Begehung', uebergabe: 'Übergabe', plan: 'Plan/Grundriss', foto: 'Foto/Bild', sonstiges: 'Sonstiges',
  },
  quelle: { upload: 'Upload', formular: 'Vor-Ort-Formular', email: 'E-Mail', rechnung: 'Rechnung' },
  benutzerRolle: { admin: 'Administrator', mitarbeiter: 'Mitarbeiter', leser: 'Leser (nur Ansicht)' },
};
const opt = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));

// ---- Globaler Zustand ----
// kontext: was die aktuelle Maske zeigt (für Sprünge/Tastaturbefehle)
const S = { benutzer: null, meta: null, kontext: {} };
const darfSchreiben = () => S.benutzer && S.benutzer.rolle !== 'leser';
const istAdmin = () => S.benutzer && S.benutzer.rolle === 'admin';

function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** ISO-Kalenderwoche. */
function kalenderwoche(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const tag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - tag);
  const jahrStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - jahrStart) / 86400000 + 1) / 7);
}

function heuteLang() {
  return new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Navigation: gleiche Adresse → neu zeichnen, sonst Hash setzen. */
function geheZu(hash) {
  if (location.hash === hash) neuLaden();
  else location.hash = hash;
}
function neuLaden() { route(); }

const istEingabe = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
