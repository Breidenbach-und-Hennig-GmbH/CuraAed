'use strict';

/* HausPerfekt 2.0 – Rahmen: Titelleiste, Menüband, Symbolleiste, Arbeitsbereich
   mit Masken (Fenster), Seitenfeld „Tastaturbefehle", Statusleiste,
   Befehl-Feld und Tastaturkürzel. */

// ---------------------------------------------------------------------
//  Befehle (Sprünge) – wie in HausPerfekt per Strg + Buchstabe
// ---------------------------------------------------------------------
const STUFE2 = 'Folgt mit Stufe 2 (iPad-Vor-Ort-Formulare).';
const STUFE3 = 'Folgt mit Stufe 3 (Microsoft-365-Anbindung: Kalender & E-Mail).';
const STUFE4 = 'Folgt mit Stufe 4 (Rechnungsauslesung & SEPA-Export).';
const SPAETER = 'Folgt in einer späteren Ausbaustufe.';
const WEB_NICHT = 'Windows-Verknüpfungsfunktion (OLE) – in der Web-Version nicht verfügbar.';

// ---------------------------------------------------------------------
//  Symbole (Linien-Icons, 24×24, statische Pfade)
// ---------------------------------------------------------------------
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  users: 'M17 21a6 6 0 0 0-12 0M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21a5 5 0 0 0-4-4.9M16 3.1a4 4 0 0 1 0 7.8',
  calc: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01',
  bank: 'M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-6 10 6z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  chevron: 'M6 9l6 6 6-6',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  zap: 'M13 2 3 14h9l-1 8 10-12h-9z',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  wrench: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6',
  book: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  house: 'M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  gauge: 'M12 14l4-4M3.3 19a10 10 0 1 1 17.4 0',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.3 1.5 1.3 2.8 2.5 2.8z',
  key: 'M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3M7.5 22a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z',
  plus: 'M12 5v14M5 12h14',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  wallet: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M4 6h16M4 12h16M4 18h16',
  copy: 'M9 9h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  check: 'M20 6 9 17l-5-5',
  einlagern: 'M3 4h18v4H3zM5 8v12h14V8M12 11v6M9 14l3 3 3-3',
  auslagern: 'M3 4h18v4H3zM5 8v12h14V8M12 17v-6M9 14l3-3 3 3',
  hybrid: 'M15 21a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 5a5 5 0 0 1 0 6M20 3a8 8 0 0 1 0 10',
  video: 'M15 10l5-3v10l-5-3M3 6h12v12H3z',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
};
const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(name, cls) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'cu-icon' + (cls ? ' ' + cls : ''));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.file);
  svg.appendChild(p);
  return svg;
}
/** Passendes Symbol zu einer Knopfbeschriftung. */
function iconFuer(text) {
  const t = String(text || '').toLowerCase();
  const regeln = [[/z\.i\.s|zentrale/, 'list'], [/bank/, 'bank'], [/pfkt|personenfunk/, 'users'], [/^info/, 'info'], [/anspr/, 'user'],
    [/tel|wählen|telefon/, 'phone'], [/e-mail|mail/, 'mail'], [/pers\.-kto|personenkonto/, 'wallet'], [/export/, 'download'],
    [/rechn/, 'file'], [/such/, 'search'], [/vschl|verteiler|schlüssel/, 'key'], [/zähler/, 'gauge'], [/heiz/, 'flame'],
    [/verw|vertrag|abrart|text|folgeblatt/, 'file'], [/sev/, 'building'], [/archiv|hochladen/, 'archive'], [/objekt/, 'building'],
    [/wohnung|einheit/, 'house'], [/bild|foto/, 'image'], [/druck/, 'printer'], [/neu|zuordnung/, 'plus'], [/bearbeit/, 'pencil']];
  return (regeln.find(([re]) => re.test(t)) || [null, 'zap'])[1];
}

function kontextRoute(k) {
  if (k.typ === 'objekt') return '#/objekte/' + k.objekt.id;
  if (k.typ === 'einheit') return '#/einheiten/' + k.einheit.id;
  if (k.typ === 'adresse') return '#/adressen/' + k.adresse.id;
  return null;
}

const FIBU = 'Folgt mit der Finanzbuchhaltung (FIBU).';
const MASKEN_NAME = { adresse: 'Adress', objekt: 'Objekt', einheit: 'Wohnungs' };

// Strg + Buchstabe: gezielte Sprünge aus der aktuellen Maske (HausPerfekt-Sprung-Übersicht).
// nur: Maskentypen, in denen der Sprung existiert. browser: Strg+Taste ist im Browser belegt → Befehl-Feld.
const BEFEHLE = [
  { taste: 'a', icon: 'pin', text: 'Adresse', aktion: (k) =>
      (k.typ === 'objekt' ? adresseWahl(k.objekt)
        : geheZu(k.typ === 'pkto' ? '#/adressen/' + k.adresse.id : k.typ === 'einheit' ? kontextRoute(k) + '?tab=allgemein' : k.typ === 'adresse' ? kontextRoute(k) : '#/adressen')) },
  { taste: 'b', icon: 'calendar', text: 'Buchungsjahr', nur: ['objekt', 'einheit'], aktion: (k) => geheZu(`#/objekte/${k.objekt.id}?fibu=1`) },
  { taste: 'e', icon: 'phone', text: 'Eingangstelefonat erfassen', aktion: eingangstelefonat },
  { taste: 'f', icon: 'file', text: 'FiBu Stammdaten', nur: ['objekt', 'einheit'], aktion: (k) => fibuGrundwerteDialog(k.objekt) },
  { taste: 'h', icon: 'wrench', text: 'Handwerkerauftrag', aktion: () => geheZu('#/vorgaenge?art=handwerker') },
  { taste: 'j', icon: 'calendar', text: 'Kalender', aktion: () => geheZu('#/kalender') },
  { taste: 'k', icon: 'mail', text: 'Korrespondenz', aktion: (k) =>
      geheZu(kontextRoute(k) ? kontextRoute(k) + '?tab=archiv&kategorie=korrespondenz' : '#/archiv?kategorie=korrespondenz') },
  { taste: 'l', icon: 'building', text: 'Lieferant', nur: ['adresse'], folgt: FIBU },
  { taste: 'm', icon: 'mail', text: 'E-Mail zur Akte', folgt: STUFE3 },
  { taste: 'o', icon: 'building', text: 'Objekt', aktion: (k) =>
      (k.typ === 'adresse' ? pfktSprung(k, 'objekt') : geheZu(k.typ === 'einheit' || k.typ === 'pkto' ? '#/objekte/' + k.objekt.id : k.typ === 'objekt' ? kontextRoute(k) : '#/objekte')) },
  { taste: 'p', icon: 'user', text: 'Personenkonto', aktion: (k) => pktoSprung(k) },
  { taste: 'r', icon: 'file', text: 'Rechnung', aktion: () => rechnungAktuell() },
  { taste: 's', icon: 'book', text: 'Sachkontenrahmen', nur: ['objekt', 'einheit'], aktion: (k) => geheZu(`#/objekte/${k.objekt.id}?fibu=1`) },
  { taste: 't', icon: 'clock', text: 'Termin/Wiedervorlage', browser: true, aktion: terminWiedervorlage },
  { taste: 'v', icon: 'folder', text: 'Vorgang/Akte', aktion: (k) =>
      (k.typ === 'adresse' || k.typ === 'objekt' ? geheZu(kontextRoute(k) + '?tab=vorgaenge') : toast('Vorgang/Akte: ' + SPAETER)) },
  { taste: 'w', icon: 'house', text: 'Wohnung', browser: true, aktion: (k) =>
      (k.typ === 'adresse' ? pfktSprung(k, 'einheit') : k.typ === 'objekt' ? einheitWahl(k.objekt) : geheZu(k.typ === 'pkto' ? '#/einheiten/' + k.einheit.id : k.typ === 'einheit' ? kontextRoute(k) : '#/einheiten')) },
];

// Alt+S, Buchstabe: Programmteile öffnen (Menü „Sprünge")
const SPRUENGE = [
  { taste: 'a', icon: 'pin', text: 'Adresse', aktion: () => geheZu('#/adressen') },
  { taste: 'b', icon: 'calendar', text: 'Buchung erfassen', folgt: FIBU },
  { taste: 'd', text: 'HP DMS System (Archiv)', aktion: () => geheZu('#/dms') },
  { taste: 'h', icon: 'wrench', text: 'Handwerkerauftrag', aktion: () => geheZu('#/vorgaenge?art=handwerker') },
  { taste: 'j', icon: 'calendar', text: 'Kalender', aktion: () => geheZu('#/kalender') },
  { taste: 'k', icon: 'mail', text: 'Korrespondenz', aktion: () => befehl('k') },
  { taste: 'l', icon: 'building', text: 'Lieferantenkonto', folgt: FIBU },
  { taste: 'm', icon: 'mail', text: 'Mehrauslagen erfassen', folgt: 'Mehrauslagen/Mehraufwand – Platzhalter, wird später gebaut.' },
  { taste: 'o', icon: 'building', text: 'Objekt', aktion: () => geheZu('#/objekte') },
  { taste: 'p', icon: 'user', text: 'Personenkonto', aktion: () => pktoSprung(S.kontext || {}) },
  { taste: 'r', icon: 'file', text: 'Rechnung erfassen', aktion: () => rechnungAktuell() },
  { taste: 't', icon: 'clock', text: 'Termin/Wiedervorlage', aktion: () => terminWiedervorlage(S.kontext || {}) },
  { taste: 'v', icon: 'folder', text: 'Vorgang/Akte', folgt: SPAETER },
  { taste: 'w', icon: 'house', text: 'Wohnung', aktion: () => geheZu('#/einheiten') },
  { taste: 'z', text: 'Zentrale Information (Z.I.S)', aktion: () => zentraleInfo(S.kontext || {}) },
];

function terminWiedervorlage(k) {
  if (k.typ === 'adresse') wiedervorlagenDialog(k.adresse);
  else toast('Wiedervorlagen: bitte zuerst eine Adresse öffnen. Termine folgen mit Microsoft 365 (Stufe 3).');
}
function zentraleInfo(k) {
  if (k.typ === 'adresse') geheZu(kontextRoute(k) + '?zis=1');
  else toast('Z.I.S: bitte zuerst eine Adresse öffnen (Alt+S, A).');
}
/** Strg+E: Maske „Telefoneingang erfassen" – überall; Adresse/Objekt/Wohnung aus der offenen Maske vorbelegt. */
function eingangstelefonat(k = {}) {
  telefonEingang({
    adresse: k.adresse || null,
    objekt: k.typ === 'objekt' || k.typ === 'einheit' ? k.objekt : null,
    einheit: k.typ === 'einheit' ? k.einheit : null,
  });
}

/** Aus der Adresse zu Objekt/Wohnung der Personenfunktion (markierte Zeile, sonst aktive Funktionen). */
function pfktSprung(k, art) {
  const zeile = S.letzteZeile && S.letzteZeile.isConnected && S.letzteZeile.hpDaten && S.letzteZeile.closest('.hp-pfkt') ? S.letzteZeile : null;
  const zielId = (z) => (art === 'einheit' ? z.einheit_id : z.objekt_id);
  const kandidaten = (zeile ? [zeile.hpDaten] : (k.pfkt || []).filter((z) => z.aktiv)).filter(zielId);
  const ziele = [...new Map(kandidaten.map((z) => [zielId(z), z])).values()];
  const route = (z) => (art === 'einheit' ? '#/einheiten/' : '#/objekte/') + zielId(z);
  if (!ziele.length) { toast(art === 'einheit' ? 'Diese Adresse hat keine aktive Personenfunktion in einer Wohnung.' : 'Diese Adresse hat keine aktive Personenfunktion in einem Objekt.'); return; }
  if (ziele.length === 1) { geheZu(route(ziele[0])); return; }
  let m;
  const liste = el('div', { class: 'hp-app-liste', role: 'listbox' }, ziele.map((z) => el('button', {
    type: 'button', class: 'hp-app',
    text: `${art === 'einheit' ? z.einheit_nummer : z.objekt_nummer} · ${L.rolle[z.rolle] || z.rolle} · ${z.objekt_bezeichnung || ''}`,
    onclick: () => { m.close(); geheZu(route(z)); },
  })));
  m = modal({ titel: art === 'einheit' ? 'Welche Wohnung?' : 'Welches Objekt?', inhalt: liste, footer: (close) => [el('button', { text: 'Abbrechen', onclick: close })] });
}

/** Sprung per Strg+Buchstabe; ausBefehlFeld: Eingabe im Feld „Befehl" (dort heißt „s" Suchen, wie die Taste s). */
function befehl(taste, ausBefehlFeld = false) {
  const k = S.kontext || {};
  if (ausBefehlFeld && taste === 's' && k.suchen) { k.suchen(); return; }
  const b = BEFEHLE.find((x) => x.taste === taste);
  if (!b) { toast(`Unbekannter Befehl „${taste}".`, 'error'); return; }
  if (b.nur && !b.nur.includes(k.typ)) { toast(`${b.text}: nur in der ${b.nur.map((t) => MASKEN_NAME[t] + 'maske').join(' / ')}.`); return; }
  if (b.folgt) { toast(`${b.text}: ${b.folgt}`); return; }
  b.aktion(k);
}

function bearbeitenAktuell() {
  // F2 auf einer markierten Listenzeile (z. B. Personenfunktion) bearbeitet diese Zeile
  const zeile = document.activeElement;
  if (zeile && zeile.hpBearbeiten && darfSchreiben()) { zeile.hpBearbeiten(); return; }
  if (S.kontext.bearbeiten && darfSchreiben()) S.kontext.bearbeiten();
  else toast(darfSchreiben() ? 'In dieser Maske gibt es keinen Datensatz zum Bearbeiten.' : 'Keine Schreibberechtigung.');
}
/** Strg+F5 „Datensatz suchen": Suche der aktuellen Maske, sonst Suchen in der Liste. */
function datensatzSuchen() {
  if (S.kontext.suchen) S.kontext.suchen(); else listeSuchen();
}
function erstellenAktuell() {
  if (S.kontext.erstellen && darfSchreiben()) S.kontext.erstellen();
  else toast(darfSchreiben() ? 'In dieser Maske kann kein neuer Datensatz erstellt werden.' : 'Keine Schreibberechtigung.');
}
function loeschenAktuell() {
  if (S.kontext.loeschen && darfSchreiben()) S.kontext.loeschen();
  else toast(darfSchreiben() ? 'In dieser Maske gibt es keinen Datensatz zum Löschen.' : 'Keine Schreibberechtigung.');
}
function hochladenAktuell() {
  if (!darfSchreiben()) { toast('Keine Schreibberechtigung.', 'error'); return; }
  archivUpload(S.kontext.archivKtx || null, neuLaden);
}

// ---------------------------------------------------------------------
//  Edit-Funktionen
// ---------------------------------------------------------------------
document.addEventListener('focusin', (ev) => {
  if (istEingabe(ev.target) && !ev.target.closest('.hp-dropdown')) S.letztesFeld = ev.target;
});
const feldVorhanden = () => !!(S.letztesFeld && S.letztesFeld.isConnected && !S.letztesFeld.disabled && !S.letztesFeld.readOnly);

/** Markierung im zuletzt benutzten Feld als [start, ende] oder null. */
function feldAuswahl() {
  if (!feldVorhanden()) return null;
  try {
    const f = S.letztesFeld;
    if (f.selectionStart == null || f.selectionStart === f.selectionEnd) return null;
    return [f.selectionStart, f.selectionEnd];
  } catch (e) { return null; }
}

function feldGeaendert(f) {
  f.dispatchEvent(new Event('input', { bubbles: true }));
  f.dispatchEvent(new Event('change', { bubbles: true }));
}

function zwischenablage(aktion) {
  if (!feldVorhanden()) { toast('Bitte zuerst ein Eingabefeld anklicken.'); return; }
  const f = S.letztesFeld;
  const sel = feldAuswahl();
  f.focus();
  if (aktion === 'paste') {
    if (!navigator.clipboard || !navigator.clipboard.readText) { toast('Bitte Strg+V zum Einfügen verwenden.'); return; }
    navigator.clipboard.readText().then((text) => {
      const [a, b] = sel || [f.value.length, f.value.length];
      if (typeof f.setRangeText === 'function') { try { f.setRangeText(text, a, b, 'end'); } catch (e) { f.value += text; } }
      else f.value += text;
      feldGeaendert(f);
    }).catch(() => toast('Der Browser erlaubt das Einfügen über das Menü nicht – bitte Strg+V verwenden.'));
    return;
  }
  if (sel) { try { f.setSelectionRange(sel[0], sel[1]); } catch (e) { /* Feldtyp ohne Markierung */ } }
  let ok = false;
  try { ok = document.execCommand(aktion); } catch (e) { ok = false; }
  if (!ok) toast(`Bitte Strg+${aktion === 'copy' ? 'C' : 'X'} verwenden.`);
  else if (aktion === 'cut') feldGeaendert(f);
}

function aufNullSetzen(f) {
  if (!f || !f.isConnected || f.disabled || f.readOnly) { toast('Bitte zuerst ein Eingabefeld anklicken.'); return; }
  if (f.type === 'checkbox') f.checked = false;
  else if (f.tagName === 'SELECT') {
    const leer = [...f.options].find((o) => o.value === '');
    f.value = leer ? '' : (f.options[0] ? f.options[0].value : '');
  } else f.value = '';
  feldGeaendert(f);
  f.focus();
}

function offenerDialog() {
  const alle = document.querySelectorAll('#modal-container .modal');
  return alle.length ? alle[alle.length - 1] : null;
}
function abbrechen() {
  const d = offenerDialog();
  if (d) { d.querySelector('.modal-x').click(); toast('Bearbeitung abgebrochen – nichts gespeichert.'); }
  else toast('Es ist keine Bearbeitung offen.');
}
function undoEditieren() {
  const d = offenerDialog();
  if (!d || !d.hpUndo) { toast('Es ist keine Bearbeitung offen.'); return; }
  const n = d.hpUndo();
  toast(n ? `${n} Änderung(en) zurückgenommen.` : 'Keine Änderungen zum Zurücknehmen.');
}

// Zoom (F5) / Breiter (F6) – bleiben je Browser gespeichert
S.zoom = localStorage.getItem('hp_zoom') === '1';
S.breit = localStorage.getItem('hp_breit') === '1';
function ansichtAnwenden() {
  const root = document.querySelector('.hp');
  if (root) { root.classList.toggle('hp-zoom', S.zoom); root.classList.toggle('hp-breit', S.breit); root.classList.toggle('cu-mit-klassik', !!S.klassik); }
  const z = document.getElementById('hp-ind-zoom'); if (z) z.classList.toggle('an', S.zoom);
  const b = document.getElementById('hp-ind-breit'); if (b) b.classList.toggle('an', S.breit);
}
function zoomUmschalten() { S.zoom = !S.zoom; localStorage.setItem('hp_zoom', S.zoom ? '1' : '0'); ansichtAnwenden(); status(S.zoom ? 'Zoom ein' : 'Zoom aus'); }
function breiterUmschalten() { S.breit = !S.breit; localStorage.setItem('hp_breit', S.breit ? '1' : '0'); ansichtAnwenden(); status(S.breit ? 'Breite Ansicht ein' : 'Breite Ansicht aus'); }

// VCR: Blättern durch die letzte Trefferliste (Erster / Vorheriger / Nächster / Letzter)
const KONTEXT_BASIS = { objekt: '#/objekte/', einheit: '#/einheiten/', adresse: '#/adressen/' };
function vcr(richtung) {
  const k = S.kontext || {};
  const t = S.trefferliste;
  const basis = KONTEXT_BASIS[k.typ];
  if (!t || !t.ids.length) { toast('Keine Trefferliste – bitte zuerst über eine Suche öffnen.'); return; }
  const aktuelleId = basis === t.basis ? k[k.typ].id : null;
  let i = aktuelleId == null ? -1 : t.ids.indexOf(aktuelleId);
  if (richtung === 'erster') i = 0;
  else if (richtung === 'letzter') i = t.ids.length - 1;
  else if (i < 0) i = 0;
  else if (richtung === 'naechster') { if (i >= t.ids.length - 1) { toast('Letzter Datensatz der Liste erreicht.'); return; } i += 1; }
  else { if (i <= 0) { toast('Erster Datensatz der Liste erreicht.'); return; } i -= 1; }
  geheZu(t.basis + t.ids[i]);
}

// ---------------------------------------------------------------------
//  Optionen-Funktionen (Abfragen, Zoomen, Suchen, Sortieren, Ausgabe)
// ---------------------------------------------------------------------
const ABFRAGE_ZIEL = { objekt: '#/objektliste', einheit: '#/einheitenliste' };
function abfragen() {
  const k = S.kontext || {};
  if (k.suchfeld && k.suchfeld.isConnected) { k.suchfeld.focus(); k.suchfeld.select(); return; }
  if (k.suchen) { k.suchen(); return; }
  geheZu(ABFRAGE_ZIEL[k.typ] || '#/objektliste');
}

/** Sichtbare Liste der aktuellen Maske (bevorzugt die zuletzt benutzte). */
function aktuelleTabelle() {
  if (S.letzteZeile && S.letzteZeile.isConnected) return S.letzteZeile.closest('table');
  const t = document.querySelector('#hp-desktop .hp-maske .hp-tabelle');
  return t && t.querySelector('tbody tr.klick') ? t : null;
}
function zoomZeile() {
  if (S.letzteZeile && S.letzteZeile.isConnected) return S.letzteZeile;
  const t = aktuelleTabelle();
  return t ? t.querySelector('tbody tr.klick') : null;
}
document.addEventListener('focusin', (ev) => { const tr = ev.target.closest && ev.target.closest('tr.klick'); if (tr) S.letzteZeile = tr; });

function zeilenVon(t) { return [...t.querySelectorAll('tbody tr')].filter((tr) => !tr.classList.contains('hp-leer') && !tr.classList.contains('hp-fuell')); }

function trefferMarkieren(tr) {
  document.querySelectorAll('.hp-treffer').forEach((x) => x.classList.remove('hp-treffer'));
  tr.classList.add('hp-treffer');
  if (tr.tabIndex >= 0) tr.focus(); else tr.scrollIntoView({ block: 'nearest' });
}

function listeSuchen() {
  if (!aktuelleTabelle()) { toast('Keine Liste geöffnet.'); return; }
  const { form, werte } = formular([[{ name: 'suchbegriff', label: 'Suchen nach', value: S.suchbegriff || '', required: true }]]);
  const m = modal({
    titel: 'Suchen',
    inhalt: form,
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Suchen', onclick: () => { S.suchbegriff = werte().suchbegriff.trim(); close(); weitersuchen(true); } }),
    ],
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); m.box.querySelector('.btn-primary').click(); });
}

function weitersuchen(vonAnfang) {
  const t = aktuelleTabelle();
  const q = (S.suchbegriff || '').toLowerCase();
  if (!t || !q) return;
  const zeilen = zeilenVon(t);
  const start = vonAnfang ? -1 : zeilen.indexOf(t.querySelector('.hp-treffer'));
  for (let i = start + 1; i < zeilen.length; i++) {
    if (zeilen[i].textContent.toLowerCase().includes(q)) { trefferMarkieren(zeilen[i]); status(`„${S.suchbegriff}" gefunden (Zeile ${i + 1})`); return; }
  }
  toast(start < 0 ? `„${S.suchbegriff}" nicht gefunden.` : `Keine weiteren Treffer für „${S.suchbegriff}".`);
}

function spaltenVon(t) {
  return [...t.querySelectorAll('thead th')].map((th, i) => ({ i, name: th.textContent.trim() })).filter((s) => s.name);
}

function sortiereTabelle(t, spalte, absteigend) {
  const tbody = t.querySelector('tbody');
  const zeilen = zeilenVon(t);
  const cmp = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
  zeilen.sort((a, b) => {
    const r = cmp.compare(a.cells[spalte].textContent.trim(), b.cells[spalte].textContent.trim());
    return absteigend ? -r : r;
  });
  const fuell = tbody.querySelector('.hp-fuell'); // Füllzeilen bleiben unten
  zeilen.forEach((z) => tbody.insertBefore(z, fuell));
  t.querySelectorAll('thead th').forEach((th, i) => th.setAttribute('aria-sort', i === spalte ? (absteigend ? 'descending' : 'ascending') : 'none'));
}

function sortierschluessel() {
  const t = aktuelleTabelle();
  if (!t) { toast('Keine Liste geöffnet.'); return; }
  const spalten = spaltenVon(t);
  const vor = S.sortierung && spalten.some((s) => s.name === S.sortierung.name) ? S.sortierung : { name: spalten[0].name, absteigend: false };
  const { form, werte } = formular([{ grid: 2, felder: [
    { name: 'spalte', label: 'Sortieren nach', type: 'select', options: spalten.map((s) => ({ value: s.name, label: s.name })), value: vor.name },
    { name: 'richtung', label: 'Reihenfolge', type: 'select', options: [{ value: 'auf', label: 'aufsteigend (A–Z, 1–9)' }, { value: 'ab', label: 'absteigend (Z–A, 9–1)' }], value: vor.absteigend ? 'ab' : 'auf' },
  ] }]);
  modal({
    titel: 'Sortierschlüssel',
    inhalt: form,
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Sortieren', onclick: () => {
        const v = werte();
        S.sortierung = { name: v.spalte, absteigend: v.richtung === 'ab' };
        close();
        sortieren();
      } }),
    ],
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());
}

function sortieren() {
  const t = aktuelleTabelle();
  if (!t) { toast('Keine Liste geöffnet.'); return; }
  const s = S.sortierung && spaltenVon(t).find((x) => x.name === S.sortierung.name);
  if (!s) { sortierschluessel(); return; }
  sortiereTabelle(t, s.i, S.sortierung.absteigend);
  status(`Sortiert nach „${s.name}" ${S.sortierung.absteigend ? 'absteigend' : 'aufsteigend'}`);
}

/** Liste als CSV (Semikolon, UTF-8 mit BOM – öffnet sauber in Excel). */
function csvZelle(text) {
  let t = String(text).replace(/\s+/g, ' ').trim();
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // Formel-Injektion in Excel verhindern
  return '"' + t.replace(/"/g, '""') + '"';
}
function ausgabeUmlenken() {
  const t = aktuelleTabelle();
  if (!t) { toast('Keine Liste geöffnet.'); return; }
  const spalten = spaltenVon(t);
  const zeilen = [spalten.map((s) => csvZelle(s.name)).join(';')]
    .concat(zeilenVon(t).map((tr) => spalten.map((s) => csvZelle(tr.cells[s.i] ? tr.cells[s.i].textContent : '')).join(';')));
  const blob = new Blob(['\ufeff' + zeilen.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const titel = (document.querySelector('.hp-maske') || { getAttribute: () => null }).getAttribute('aria-label') || 'Liste';
  const a = el('a', { href: URL.createObjectURL(blob), download: titel.replace(/[^\wäöüÄÖÜß.-]+/g, '_').slice(0, 80) + '.csv' });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  status(`${zeilen.length - 1} Zeilen als CSV ausgegeben`);
}

// Statusanzeige „Modifiz.": leuchtet, solange ein Bearbeitungsfenster offen ist
new MutationObserver(() => {
  const m = document.getElementById('hp-ind-modifiz');
  if (m) m.classList.toggle('an', !!document.querySelector('#modal-container .modal .modal-body form'));
}).observe(document.getElementById('modal-container'), { childList: true });

// ---------------------------------------------------------------------
//  Menüband
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
//  FIBU – Gesamtmenü und Menü „FIBU" nach HausPerfekt (Funktionen folgen schrittweise)
// ---------------------------------------------------------------------
const FIBU_FOLGT = 'Wird im Rahmen der Finanzbuchhaltung (FIBU) gebaut.';
const FIBU_GRUPPEN = [
  { titel: 'Stammdaten', icon: 'settings', eintraege: ['Bürokostenstellen FIBU', 'Objekt FIBU', 'Debitoren / Personen', 'Kreditoren / Lieferanten', 'Mitarbeiter Einstellungen', 'Clearing Banken'] },
  { titel: 'Finanzbuchhaltung', icon: 'calc', eintraege: ['Buchung erfassen', 'Erfassungsprotok. drucken', 'Stapel verbuchen', 'Alle offenen Stp. verbuchen', 'Journal drucken', 'Storno buchen', 'Stornoprotokoll drucken'] },
  { titel: 'Haushaltsnahe', icon: 'house', eintraege: ['HNDL Übersicht', 'HNDL Nacherfassung', 'HNDL Kontrolldruck', 'HNDL Nachweis', 'Abgleich Journal <> HNDL'] },
  { titel: 'Be- und Abrechnungen', icon: 'file', eintraege: ['Mietanpassung', 'Verwaltungsabrechnung', 'Statusbericht', 'Verwalterhonorar', 'Sonderumlage', 'Wirtschaftspläne', 'WP Nachberechnung', 'Abrechnungen', 'Neuberechnen Vorauszahlung', 'Bilanz / GuV', 'Umsatzsteuervoranmeldung'] },
  { titel: 'Auswertungen', icon: 'chart', eintraege: ['Salden Bürokostenstelle', 'Salden Objekte', 'Personenkonten - Zeitraum', 'Kontoauszüge', 'Facility - Management', 'Mietmargen Vergleich', 'Budget - Soll / Ist Vergleich', 'KtoAuszug jahresübergr.', 'Ausw. Verwalterhonorar', 'Kontoauszug Abr. Kontrolle', 'Liste Abgrenzung'] },
  { titel: 'Zahlungsverkehr', icon: 'bank', eintraege: ['Clearing', 'e-Banking', 'Einzellastschr/Überw. erfassen', 'Einzellastschr/Überw. ausführ.'] },
  { titel: 'Debitorenbuchhaltung', icon: 'users', eintraege: ['Sollstellungen', 'Nachberechnung Sollstellung', 'Einzüge / Überweisungen', 'Einzugsermächtigung', 'Offene Posten Liste', 'Zahlungsliste Debitoren'] },
  { titel: 'Mahnwesen', icon: 'bell', eintraege: ['Mahnverfahren', 'Übersicht Mahnsperren', 'Übersicht Rechtsfälle', 'OPOS Übersicht'] },
  { titel: 'Schnittstellen', icon: 'download', eintraege: ['NKD Export', 'Datev Export', 'DIAMANT Export', 'Journal Export', 'KHK Export'] },
  { titel: 'Jahreswechsel', icon: 'calendar', eintraege: ['Objekt BJ anlegen', 'Saldovortrag'] },
  { titel: 'Kreditorenbuchhaltung', icon: 'wallet', eintraege: ['Rechnungen', 'Rechnungen erfassen', 'ZUGFeRD', 'Kreditorenstapel', 'Überweisung Rechnungen', 'Daueraufträge'] },
  { titel: 'SEV Mietenweiterleitung', icon: 'key', eintraege: ['Zuordnung ET - Mieter', 'Kontensalden kopieren', 'Zahlungen Sollstell. kopieren'] },
  { titel: 'Kautionsverwaltung', icon: 'archive', eintraege: ['Ein- und Auszahlungsliste', 'Gesamtliste Kautionssumme', 'Vergleich VB- Zahlung'] },
];
// Bereits vorhandene Funktionen, die aus dem FIBU-Menü erreichbar sind
const FIBU_AKTIONEN = {
  'ZUGFeRD': () => geheZu('#/dms'),
  'Objekt FIBU': () => objektFibuOeffnen(),
  'Stammdaten FIBU': () => objektFibuOeffnen(),
  'Objekt BJ anlegen': () => objektFibuOeffnen(),
  'Debitoren / Personen': () => pktoSprung(S.kontext || {}),
  'Personen- /Debitoren': () => pktoSprung(S.kontext || {}),
};
/** Kontenrahmen des zuletzt benutzten Objekts öffnen (sonst Objektsuche). */
function objektFibuOeffnen() {
  const id = gemerkt('objekt');
  if (id) geheZu(`#/objekte/${id}?fibu=1`);
  else { toast('Bitte zuerst ein Objekt wählen – dort öffnet Strg+S den Kontenrahmen.'); geheZu('#/objektliste'); }
}

function fibuEintrag(text) {
  return FIBU_AKTIONEN[text] ? { text, aktion: FIBU_AKTIONEN[text] } : { text, folgt: `${text}: ${FIBU_FOLGT}`, stufe: '' };
}
const fibuGruppe = (titel) => FIBU_GRUPPEN.find((g) => g.titel === titel).eintraege.map(fibuEintrag);

/** Menü „FIBU" wie in HausPerfekt (ohne Trennlinien). Untermenüs = Gruppen des Gesamtmenüs. */
function fibuMenue() {
  const leer = (text) => ({ text, untermenue: [{ text: 'Inhalt folgt', folgt: `${text}: ${FIBU_FOLGT}`, stufe: '' }] });
  return [
    { text: 'Fibu Gesamtmenü', aktion: () => geheZu('#/fibu') },
    fibuEintrag('Zeitsteuerung Buchhaltung'),
    fibuEintrag('Stammdaten Bürokostenstelle'),
    fibuEintrag('Stammdaten FIBU'),
    fibuEintrag('Personen- /Debitoren'),
    fibuEintrag('Lieferanten- /Kreditoren'),
    fibuEintrag('Debitoren ohne Wohnung'),
    { text: 'Buchhaltung', untermenue: fibuGruppe('Finanzbuchhaltung') },
    { text: 'Zahlungsverkehr', untermenue: fibuGruppe('Zahlungsverkehr') },
    { text: 'Mahnwesen / Inkasso', untermenue: fibuGruppe('Mahnwesen') },
    { text: 'Budget - / Wirtschaftspläne', untermenue: ['Wirtschaftspläne', 'WP Nachberechnung', 'Budget - Soll / Ist Vergleich'].map(fibuEintrag) },
    { text: 'Abrechnungen', untermenue: fibuGruppe('Be- und Abrechnungen') },
    { text: 'Jahreswechsel', untermenue: fibuGruppe('Jahreswechsel') },
    { text: 'Auswertungen / SuSa-Listen', untermenue: fibuGruppe('Auswertungen') },
    leer('Auswertung Vorsteuerteilabzug'),
    leer('Allgemeine Datenpflege'),
    { text: 'Daten Export / Import', untermenue: fibuGruppe('Schnittstellen') },
    fibuEintrag('Umsatzsteuerumstellung'),
    fibuEintrag('Rechnungsausgang / Faktura'),
    leer('Umbuchung für Abrechnung lt. BGH'),
    leer('Textbausteine Zahlavis'),
  ];
}

function MENUE() {
  const sprung = (b) => ({ text: b.text, kuerzel: b.taste, folgt: b.folgt, stufe: b.folgt ? 'folgt' : null, aktion: b.aktion });
  return [
    // Wie in HausPerfekt: Alt+D öffnet „Datei"
    { titel: 'Datei', alt: 'd', eintraege: [
      { text: 'Öffnen Applikation', taste: 'Shift+Ctrl+O', aktion: applikationOeffnen },
      { text: 'Schließen Applik.', titel: 'Aktuelle Maske schließen (Esc)', aktion: () => geheZu('#/') },
      { text: 'Events', untermenue: [
        { text: 'Inhalt folgt', folgt: 'Die Einträge des Untermenüs „Events" werden nach Vorlage aus HausPerfekt ergänzt.', stufe: '' },
      ] },
      { text: 'Exit System', titel: 'Abmelden und ' + APP_NAME + ' verlassen', aktion: logout },
    ] },
    // Wie in HausPerfekt: Alt+E öffnet „Eigene Menüs"
    { titel: 'Eigene Menüs', alt: 'e', eintraege: [
      { text: 'Persönliches FIBU - Gesamtmenü', folgt: 'Folgt mit der Finanzbuchhaltung (FIBU).', stufe: '' },
      { text: 'Persönliches Menü', folgt: 'Das persönliche Menü (eigene Schnellzugriffe je Mitarbeiter) folgt in einer späteren Ausbaustufe.', stufe: '' },
    ] },
    // Wie in HausPerfekt (Foto „Edit")
    { titel: 'Edit', eintraege: [
      { text: 'Abbrechen', taste: 'Strg+Esc', titel: 'Bearbeitung abbrechen, ohne zu speichern (Esc speichert)', aktion: abbrechen },
      { text: 'Undo Editieren', taste: 'Alt+Back', titel: 'Änderungen im offenen Bearbeitungsfenster zurücknehmen', aktion: undoEditieren },
      { text: 'Zoom', taste: 'F5', haken: () => S.zoom, aktion: zoomUmschalten },
      { text: 'Breiter', taste: 'F6', haken: () => S.breit, aktion: breiterUmschalten },
      { text: 'Kopieren', taste: 'Ctrl+C', aktiv: () => !!feldAuswahl(), grund: 'Zuerst Text in einem Eingabefeld markieren.', aktion: () => zwischenablage('copy') },
      { text: 'Einfügen', taste: 'Ctrl+V', aktiv: feldVorhanden, grund: 'Zuerst ein Eingabefeld anklicken.', aktion: () => zwischenablage('paste') },
      { text: 'Ausschneiden', taste: 'Ctrl+X', aktiv: () => !!feldAuswahl(), grund: 'Zuerst Text in einem Eingabefeld markieren.', aktion: () => zwischenablage('cut') },
      { text: 'Kopieren Feld (Ditto)', folgt: 'Übernimmt den Feldinhalt aus dem zuletzt bearbeiteten Datensatz – folgt in einer späteren Ausbaustufe.', stufe: 'Ctrl+D' },
      { text: 'Paste Link', folgt: WEB_NICHT, stufe: '' },
      { text: 'Objekt einfügen', folgt: WEB_NICHT, stufe: '' },
      { text: 'Link überarbeiten', folgt: WEB_NICHT, stufe: '' },
      { text: 'Auf NULL setzen', taste: 'Ctrl+U', aktiv: feldVorhanden, grund: 'Zuerst ein Eingabefeld anklicken.', aktion: () => aufNullSetzen(S.letztesFeld) },
      { text: 'VCR', untermenue: [
        { text: 'Erster Datensatz', taste: '⏮', aktion: () => vcr('erster') },
        { text: 'Vorheriger Datensatz', taste: '◀', aktion: () => vcr('vorheriger') },
        { text: 'Nächster Datensatz', taste: '▶', aktion: () => vcr('naechster') },
        { text: 'Letzter Datensatz', taste: '⏭', aktion: () => vcr('letzter') },
      ] },
    ] },
    // Wie in HausPerfekt (Foto „Optionen"): Alt+O
    { titel: 'Optionen', alt: 'o', eintraege: [
      { sym: '🔍', text: 'Abfragen', taste: 'Ctrl+F2', titel: 'Suchmaske für die aktuelle Datenart öffnen', aktion: abfragen },
      { sym: '✎', text: 'Modifiz.', aktiv: () => !!(S.kontext.bearbeiten && darfSchreiben()), grund: 'In dieser Maske gibt es keinen Datensatz zum Ändern.', aktion: bearbeitenAktuell },
      { sym: '🗑', text: 'Delete', aktiv: () => !!(S.kontext.loeschen && darfSchreiben()), grund: 'In dieser Maske gibt es keinen Datensatz zum Löschen.', aktion: () => S.kontext.loeschen() },
      { sym: '▶*', text: 'Erstellen', aktiv: () => !!(S.kontext.erstellen && darfSchreiben()), grund: 'In dieser Maske kann kein neuer Datensatz erstellt werden.', aktion: () => S.kontext.erstellen() },
      { text: 'Erstelle Datensätze', folgt: 'Mehrere Datensätze in einem Zug erstellen – folgt in einer späteren Ausbaustufe.', stufe: 'F4' },
      { sym: '🔎', text: 'Zoomen', aktiv: () => !!zoomZeile(), grund: 'Keine Liste mit Datensätzen geöffnet.', titel: 'Markierten Datensatz der Liste öffnen', aktion: () => zoomZeile().click() },
      { text: 'Suchen', taste: 'Ctrl+F5', aktiv: () => !!aktuelleTabelle(), grund: 'Keine Liste geöffnet.', aktion: listeSuchen },
      { text: 'Weitersuchen', taste: 'F3', aktiv: () => !!(aktuelleTabelle() && S.suchbegriff), grund: 'Zuerst „Suchen" verwenden.', aktion: weitersuchen },
      { text: 'Bereich', folgt: 'Bereichsauswahl (Von–Bis-Eingrenzung der Liste) – folgt in einer späteren Ausbaustufe.', stufe: 'Ctrl+F6' },
      { sym: '⇅', text: 'Sortierschlüssel', taste: 'Ctrl+F7', aktiv: () => !!aktuelleTabelle(), grund: 'Keine Liste geöffnet.', aktion: sortierschluessel },
      { text: 'Sortieren', taste: 'Ctrl+F8', aktiv: () => !!aktuelleTabelle(), grund: 'Keine Liste geöffnet.', aktion: sortieren },
      { text: 'Ausgabe umlenken', taste: 'Ctrl+I', aktiv: () => !!aktuelleTabelle(), grund: 'Keine Liste geöffnet.', titel: 'Aktuelle Liste als CSV-Datei (Excel) ausgeben', aktion: ausgabeUmlenken },
    ] },
    { titel: 'Sprünge', alt: 's', eintraege: SPRUENGE.map(sprung) },
    { titel: 'Verw.Bestand/Stammdaten', eintraege: [
      { text: 'Objekte', taste: 'Alt+S, O', aktion: () => geheZu('#/objekte') },
      { text: 'Wohnungen / Einheiten', taste: 'Alt+S, W', aktion: () => geheZu('#/einheiten') },
      { text: 'Adressen', taste: 'Alt+S, A', aktion: () => geheZu('#/adressen') },
      { text: 'Archiv', aktion: () => geheZu('#/archiv') },
    ] },
    { titel: 'Management', eintraege: [{ text: 'Management-Auswertungen', folgt: SPAETER, stufe: 'folgt' }] },
    { titel: 'Auswertungen / Listen', eintraege: [
      { text: 'Objektliste', aktion: () => geheZu('#/objektliste') },
      { text: 'Einheitenliste', aktion: () => geheZu('#/einheitenliste') },
      { text: 'Adressliste', aktion: () => geheZu('#/adressliste') },
      { text: 'Archiv: nicht zugeordnete Einträge', aktion: () => geheZu('#/archiv?ohne=1') },
    ] },
    { titel: 'FIBU', eintraege: fibuMenue() },
    { titel: 'System', eintraege: [
      { text: 'Benutzerverwaltung', nurAdmin: true, aktion: () => geheZu('#/benutzer') },
      { text: 'Passwort ändern …', aktion: passwortDialog },
      { text: 'Klassische Menüleiste', haken: () => !!S.klassik, aktion: klassikUmschalten },
      { text: 'Personenfunktionen (Codes)', aktion: pfktCodesDialog },
      { text: 'Über ' + APP_NAME, aktion: ueberDialog },
    ] },
    { titel: 'E-Banking', eintraege: [{ text: 'SEPA-Überweisungen (pain.001) für SFirm', folgt: STUFE4, stufe: 'Stufe 4' }] },
    { titel: 'Projekte', eintraege: [{ text: 'Projekte', folgt: SPAETER, stufe: 'folgt' }] },
    { titel: 'HP-Mobile', eintraege: [
      { text: 'Objektbegehung (iPad)', folgt: STUFE2, stufe: 'Stufe 2' },
      { text: 'Wohnungsübergabe (iPad)', folgt: STUFE2, stufe: 'Stufe 2' },
    ] },
    { titel: 'Konverter', eintraege: [{ text: 'CSV-Import aus HausPerfekt', folgt: 'In Planung – dafür werden Beispiel-Exporte aus HausPerfekt benötigt.', stufe: 'in Planung' }] },
    { titel: 'Datendienst', eintraege: [{ text: 'Datendienst', folgt: SPAETER, stufe: 'folgt' }] },
    { titel: 'Telegram', eintraege: [{ text: 'Telegram', folgt: SPAETER, stufe: 'folgt' }] },
    { titel: 'Hilfe', eintraege: [
      { text: 'Sprung-Übersicht', taste: 'F1', aktion: sprungUebersicht },
      { text: 'Über ' + APP_NAME, aktion: ueberDialog },
    ] },
  ];
}

let offenesMenue = null; // { idx, dd, knopf }

function schliesseMenue(fokusZurueck) {
  if (!offenesMenue) return;
  schliesseUntermenue();
  offenesMenue.dd.remove();
  offenesMenue.knopf.classList.remove('offen');
  offenesMenue.knopf.setAttribute('aria-expanded', 'false');
  if (fokusZurueck) offenesMenue.knopf.focus();
  offenesMenue = null;
}

/** Baut die Einträge eines (Unter-)Menüs. onUnter(eintrag, knopf, fokus) öffnet ein Untermenü. */
function menueEintraege(dd, eintraege, onUnter) {
  eintraege.forEach((e) => {
    if (e === '-') return; // Keine Trenn-/Leerzeilen in Menüs (Wunsch des Nutzers)
    if (e.nurAdmin && !istAdmin()) return;
    const ohneRecht = e.schreiben && !darfSchreiben();
    const inaktiv = !!(e.aktiv && !e.aktiv());
    const gesperrt = !!e.folgt || ohneRecht || inaktiv;
    const haken = e.haken ? !!e.haken() : null;
    const item = el('button', {
      type: 'button', role: haken === null ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': haken === null ? null : String(haken),
      class: 'hp-menue-eintrag' + (gesperrt ? ' gesperrt' : '') + (haken ? ' haken' : ''),
      'aria-disabled': gesperrt ? 'true' : null, title: e.folgt || e.titel || null,
      'aria-haspopup': e.untermenue ? 'true' : null,
    }, [
      menueText(e),
      el('span', { class: 'hp-me-taste', text: e.untermenue ? '▸' : e.folgt ? (e.stufe || '') : (e.taste || '') }),
    ]);
    if (e.kuerzel) item.dataset.kuerzel = e.kuerzel.toLowerCase();
    if (e.sym) item.prepend(el('span', { class: 'hp-me-sym', 'aria-hidden': 'true', text: e.sym }));
    if (e.untermenue) {
      item.addEventListener('click', () => onUnter(e, item, true));
      item.addEventListener('mouseenter', () => onUnter(e, item, false));
      item.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); onUnter(e, item, true); } });
    } else {
      item.addEventListener('mouseenter', () => onUnter(null));
      item.addEventListener('click', () => {
        const ausgang=offenesMenue?.ausgang;
        schliesseMenue();
        if(ausgang?.isConnected)ausgang.focus();
        if (e.folgt) toast(`${e.text}: ${e.folgt}`);
        else if (ohneRecht) toast('Keine Schreibberechtigung.', 'error');
        else if (inaktiv) toast(e.grund || 'Im Moment nicht verfügbar.');
        else e.aktion();
      });
    }
    dd.appendChild(item);
  });
}

/** Menütext; der Kürzel-Buchstabe (Windows-Mnemonic) wird unterstrichen. */
function menueText(e) {
  const pos = e.kuerzel ? e.text.toLowerCase().indexOf(e.kuerzel.toLowerCase()) : -1;
  if (pos < 0) return el('span', { text: e.text });
  return el('span', {}, [e.text.slice(0, pos), el('u', { text: e.text[pos] }), e.text.slice(pos + 1)]);
}

/** Buchstabe im offenen Menü (auch bei noch gehaltener Alt-Taste, z. B. Alt+S, A) löst den Eintrag aus. */
function kuerzelTaste(dd, ev) {
  if (ev.ctrlKey || ev.metaKey || !/^Key[A-Z]$/.test(ev.code || '')) return false;
  const item = dd.querySelector(`:scope > .hp-menue-eintrag[data-kuerzel="${ev.code.slice(3).toLowerCase()}"]`);
  if (!item) return false;
  ev.preventDefault(); ev.stopPropagation();
  item.click();
  return true;
}

function pfeilNavigation(dd, ev) {
  const items = [...dd.querySelectorAll(':scope > .hp-menue-eintrag')];
  const i = items.indexOf(document.activeElement);
  if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); return true; }
  if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); return true; }
  return false;
}

function schliesseUntermenue() {
  if (offenesMenue && offenesMenue.sub) { offenesMenue.sub.dd.remove(); offenesMenue.sub.knopf.setAttribute('aria-expanded', 'false'); offenesMenue.sub = null; }
}

function oeffneUntermenue(e, knopf, fokus) {
  if (!offenesMenue) return;
  if (!e) { schliesseUntermenue(); return; }
  if (offenesMenue.sub && offenesMenue.sub.knopf === knopf) { if (fokus) offenesMenue.sub.dd.querySelector('.hp-menue-eintrag')?.focus(); return; }
  schliesseUntermenue();
  const dd = el('div', { class: 'hp-dropdown hp-untermenue', role: 'menu', 'aria-label': e.text });
  menueEintraege(dd, e.untermenue, () => {});
  dd.addEventListener('keydown', (ev) => {
    if (pfeilNavigation(dd, ev) || kuerzelTaste(dd, ev)) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); schliesseUntermenue(); knopf.focus(); }
  });
  document.body.appendChild(dd);
  const r = knopf.getBoundingClientRect();
  const links = r.right + dd.offsetWidth > window.innerWidth - 4 ? Math.max(4, r.left - dd.offsetWidth) : r.right;
  dd.style.top = Math.round(Math.min(r.top - 3, window.innerHeight - dd.offsetHeight - 4)) + 'px';
  dd.style.left = Math.round(links) + 'px';
  knopf.setAttribute('aria-expanded', 'true');
  offenesMenue.sub = { dd, knopf };
  if (fokus) dd.querySelector('.hp-menue-eintrag')?.focus();
}

function oeffneMenue(idx, knopf, fokusErster) {
  const m = MENUE()[idx];
  oeffneListe(knopf, m.titel, m.eintraege, { idx, fokusErster });
}

/**
 * Klappliste unter einem Knopf (Menüs, „Weitere Aktionen", Benutzer-Menü …).
 * Ist der Knopf unsichtbar (klassische Menüleiste ausgeblendet), erscheint die
 * Liste unter der Kopfzeile – Alt+Buchstabe funktioniert so immer.
 */
function oeffneListe(knopf, titel, eintraege, { idx = -1, fokusErster = false, rechts = false, oben = false } = {}) {
  const ausgang=offenesMenue?.ausgang||document.activeElement;
  schliesseMenue();
  const dd = el('div', { class: 'hp-dropdown', role: 'menu', 'aria-label': titel });
  menueEintraege(dd, eintraege, oeffneUntermenue);
  dd.addEventListener('keydown', (ev) => {
    if (pfeilNavigation(dd, ev) || kuerzelTaste(dd, ev)) return;
    if (ev.key === 'Escape') { ev.preventDefault(); schliesseMenue(true); }
    else if (idx >= 0 && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) { ev.preventDefault(); wechsleMenue(idx, ev.key === 'ArrowRight' ? 1 : -1, true); }
    else if (ev.key === 'Tab') schliesseMenue();
  });
  document.body.appendChild(dd);
  let r = knopf.getBoundingClientRect();
  if (!r.width && !r.height) {
    const kopf = document.querySelector('.cu-kopf') || document.body;
    const k = kopf.getBoundingClientRect();
    r = { left: 16, right: 16, bottom: k.bottom + 4 };
  }
  const nachOben = oben || (r.top !== undefined && r.bottom + dd.offsetHeight > window.innerHeight - 8 && r.top > window.innerHeight / 2);
  dd.style.top = Math.round(nachOben ? Math.max(4, r.top - dd.offsetHeight - 6) : r.bottom) + 'px';
  const links = rechts ? r.right - dd.offsetWidth : r.left;
  dd.style.left = Math.round(Math.max(4, Math.min(links, window.innerWidth - dd.offsetWidth - 4))) + 'px';
  knopf.classList.add('offen');
  knopf.setAttribute('aria-expanded', 'true');
  offenesMenue = { idx, dd, knopf, sub: null, ausgang };
  if (fokusErster) dd.querySelector('.hp-menue-eintrag')?.focus();
}

function wechsleMenue(idx, richtung, oeffnen) {
  const knoepfe = [...document.querySelectorAll('.hp-menue-knopf')];
  const n = (idx + richtung + knoepfe.length) % knoepfe.length;
  knoepfe[n].focus();
  if (oeffnen) oeffneMenue(n, knoepfe[n], true);
}

function baueMenueleiste() {
  const bar = el('nav', { class: 'hp-menueleiste', role: 'menubar', 'aria-label': 'Hauptmenü' });
  MENUE().forEach((m, i) => {
    const b = el('button', { type: 'button', class: 'hp-menue-knopf', role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': 'false',
      'aria-keyshortcuts': m.alt ? 'Alt+' + m.alt.toUpperCase() : null, title: m.alt ? `${m.titel} (Alt+${m.alt.toUpperCase()})` : null });
    const pos = m.alt ? m.titel.toLowerCase().indexOf(m.alt) : -1;
    if (pos >= 0) b.append(m.titel.slice(0, pos), el('u', { text: m.titel[pos] }), m.titel.slice(pos + 1));
    else b.textContent = m.titel;
    b.addEventListener('click', () => (offenesMenue && offenesMenue.idx === i ? schliesseMenue() : oeffneMenue(i, b)));
    b.addEventListener('mouseenter', () => { if (offenesMenue && offenesMenue.idx !== i) oeffneMenue(i, b); });
    b.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); oeffneMenue(i, b, true); }
      else if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); wechsleMenue(i, ev.key === 'ArrowRight' ? 1 : -1, !!offenesMenue); }
    });
    bar.appendChild(b);
  });
  bar.addEventListener('scroll', () => schliesseMenue());
  return bar;
}

document.addEventListener('mousedown', (ev) => {
  if (!offenesMenue) return;
  const imUnter = offenesMenue.sub && offenesMenue.sub.dd.contains(ev.target);
  if (!imUnter && !offenesMenue.dd.contains(ev.target) && !offenesMenue.knopf.contains(ev.target)) schliesseMenue();
});
window.addEventListener('resize', () => schliesseMenue());

// ---------------------------------------------------------------------
//  Symbolleiste
// ---------------------------------------------------------------------
function baueWerkzeugleiste() {
  const W = [
    { sym: '⌂', titel: 'Startmaske – alle Masken schließen (Esc)', aktion: () => geheZu('#/') },
    '|',
    { sym: '🏢', titel: 'Objekt (Strg+O)', aktion: () => befehl('o') },
    { sym: '🚪', titel: 'Wohnung / Einheit (Befehl w)', aktion: () => befehl('w') },
    { sym: '👤', titel: 'Adresse (Strg+A)', aktion: () => befehl('a') },
    '|',
    { sym: '🗄', titel: 'Archiv', aktion: () => geheZu('#/archiv') },
    { sym: '✉', titel: 'Korrespondenz (Strg+K)', aktion: () => befehl('k') },
    { sym: '⤒', titel: 'In Archiv hochladen', aktion: hochladenAktuell },
    '|',
    { sym: '✎', titel: 'Datensatz bearbeiten', aktion: bearbeitenAktuell },
    '|',
    { sym: '⏮', titel: 'Erster Datensatz (VCR)', aktion: () => vcr('erster') },
    { sym: '◀', titel: 'Vorheriger Datensatz (VCR)', aktion: () => vcr('vorheriger') },
    { sym: '▶', titel: 'Nächster Datensatz (VCR)', aktion: () => vcr('naechster') },
    { sym: '⏭', titel: 'Letzter Datensatz (VCR)', aktion: () => vcr('letzter') },
    '|',
    { sym: '⌨', titel: 'Sprung-Übersicht (F1)', aktion: sprungUebersicht },
  ];
  return el('div', { class: 'hp-werkzeuge', role: 'toolbar', 'aria-label': 'Symbolleiste' }, W.map((w) =>
    w === '|'
      ? el('span', { class: 'hp-werkzeug-trenner', 'aria-hidden': 'true' })
      : el('button', { type: 'button', class: 'hp-werkzeug', title: w.titel, 'aria-label': w.titel, text: w.sym, onclick: w.aktion })
  ));
}

// ---------------------------------------------------------------------
//  Rahmen & Arbeitsbereich
// ---------------------------------------------------------------------
// Hauptnavigation (violette Leiste). menue = Titel eines Menüs aus MENUE() → Klappliste.
const NAV = [
  { text: 'Übersicht', icon: 'home', hash: '#/', aktiv: (h) => h === '' || h === '#/' },
  { text: 'Objekte', icon: 'building', hash: '#/objekte', aktiv: (h) => /^#\/(objekte|objektliste|einheiten|einheitenliste)\b/.test(h) },
  { text: 'Adressen', icon: 'user', hash: '#/adressen', aktiv: (h) => /^#\/(adressen|adressliste)\b/.test(h) },
  { text: 'Buchhaltung', icon: 'calc', hash: '#/fibu', titel: 'FIBU Gesamtmenü', aktiv: (h) => /^#\/fibu\b/.test(h) },
  { text: 'E-Banking', icon: 'bank', folgt: STUFE4 },
  { text: 'Vorgänge', icon: 'folder', hash: '#/vorgaenge', aktiv: (h) => /^#\/vorgaenge\b/.test(h) },
  { text: 'ETV', icon: 'users', hash: '#/etv', titel: 'Eigentümerversammlungen (ETV)', aktiv: (h) => /^#\/etv\b/.test(h) },
  { text: 'Dokumente', icon: 'file', hash: '#/dms', aktiv: (h) => /^#\/(archiv|dms|dms-uebernahme)\b/.test(h) },
  { text: 'Auswertungen', icon: 'chart', menue: 'Auswertungen / Listen', aktiv: (h) => /liste\b/.test(h) },
  { text: 'Einstellungen', icon: 'settings', menue: 'System', aktiv: (h) => /^#\/benutzer\b/.test(h) },
];

function navAktualisieren() {
  const h = location.hash || '#/';
  const markieren = (b, an) => {
    b.classList.toggle('aktiv', an);
    if (an) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  };
  document.querySelectorAll('.cu-nav-knopf').forEach((b, i) => markieren(b, !!(NAV[i].aktiv && NAV[i].aktiv(h))));
  document.querySelectorAll('.cu-unten-knopf[data-nav]').forEach((b) => {
    const n = NAV.find((x) => x.text === b.dataset.nav);
    markieren(b, !!(n && n.aktiv && n.aktiv(h)));
  });
}

// Smartphone: Navigationsleiste unten (Daumenbereich) mit den wichtigsten Bereichen + „Mehr"
const NAV_UNTEN = ['Übersicht', 'Objekte', 'Adressen', 'ETV', 'Dokumente'];
function baueUntenNavigation() {
  const leiste = el('nav', { class: 'cu-unten', 'aria-label': 'Hauptnavigation (unten)' });
  NAV_UNTEN.forEach((name) => {
    const n = NAV.find((x) => x.text === name);
    leiste.appendChild(el('button', { type: 'button', class: 'cu-unten-knopf', 'data-nav': n.text, onclick: () => geheZu(n.hash) }, [icon(n.icon), el('span', { text: n.text })]));
  });
  const mehr = el('button', { type: 'button', class: 'cu-unten-knopf', 'aria-haspopup': 'true' }, [icon('menu'), el('span', { text: 'Mehr' })]);
  mehr.addEventListener('click', () => {
    if (offenesMenue && offenesMenue.knopf === mehr) { schliesseMenue(); return; }
    const rest = NAV.filter((n) => !NAV_UNTEN.includes(n.text)).map((n) => {
      if (n.menue) return { text: n.text, untermenue: MENUE().find((m) => m.titel === n.menue).eintraege };
      if (n.folgt) return { text: n.text, folgt: n.folgt, stufe: 'folgt' };
      return { text: n.text, aktion: () => geheZu(n.hash) };
    });
    oeffneListe(mehr, 'Mehr', [{ text: 'Telefoneingang erfassen', aktion: () => eingangstelefonat(S.kontext || {}) }, ...rest, { text: 'Sprung-Übersicht', aktion: sprungUebersicht }, { text: 'Passwort ändern …', aktion: passwortDialog }, { text: 'Abmelden', aktion: logout }], { rechts: true, oben: true });
  });
  leiste.appendChild(mehr);
  return leiste;
}
window.addEventListener('hashchange', navAktualisieren);

function baueNavigation() {
  const nav = el('nav', { class: 'cu-nav', 'aria-label': 'Hauptnavigation' }, [
    el('a', { class: 'cu-nav-logo', href: '#/', 'aria-label': APP_NAME + ' – Übersicht', title: APP_NAME }, [icon('building')]),
  ]);
  const leiste = el('div', { class: 'cu-nav-leiste' });
  NAV.forEach((n) => {
    const b = el('button', { type: 'button', class: 'cu-nav-knopf' + (n.folgt ? ' folgt' : ''), title: n.folgt || n.titel || n.text }, [icon(n.icon), el('span', { text: n.text })]);
    if (n.menue) b.setAttribute('aria-haspopup', 'true');
    b.addEventListener('click', () => {
      if (n.hash) geheZu(n.hash);
      else if (n.folgt) toast(n.folgt);
      else if (n.menue) {
        if (offenesMenue && offenesMenue.knopf === b) { schliesseMenue(); return; }
        const idx = MENUE().findIndex((m) => m.titel === n.menue);
        oeffneListe(b, n.menue, MENUE()[idx].eintraege, { idx });
      }
    });
    leiste.appendChild(b);
  });
  leiste.addEventListener('scroll', () => schliesseMenue());
  nav.appendChild(leiste);
  return nav;
}

/** Globale Suche „Objekt, Person oder Vorgang suchen …" mit Trefferliste. */
function baueKopfSuche() {
  const eingabe = el('input', { type: 'search', id: 'cu-suche', class: 'cu-suche-feld', autocomplete: 'off', placeholder: 'Objekt, Adresse oder Vorgang suchen …', 'aria-label': 'Objekt, Adresse oder Wohnung suchen' });
  const liste = el('div', { class: 'cu-suche-liste', role: 'listbox', hidden: 'hidden' });
  let anfrage = 0;
  let treffer = [];
  let aktiv = -1;
  const schliessen = () => { liste.hidden = true; aktiv = -1; };
  const oeffnen = (t) => { schliessen(); eingabe.value = ''; geheZu(t.hash); };
  const markieren = () => liste.querySelectorAll('.cu-treffer').forEach((x, i) => x.classList.toggle('aktiv', i === aktiv));
  const zeichnen = () => {
    liste.replaceChildren();
    if (!treffer.length) { liste.appendChild(el('div', { class: 'cu-suche-leer', text: 'Keine Treffer.' })); liste.hidden = false; return; }
    let gruppe = '';
    treffer.forEach((t, i) => {
      if (t.gruppe !== gruppe) { gruppe = t.gruppe; liste.appendChild(el('div', { class: 'cu-suche-gruppe', text: gruppe })); }
      const b = el('button', { type: 'button', class: 'cu-treffer', role: 'option' }, [icon(t.icon), el('span', { class: 'cu-treffer-nr', text: t.nr || '' }), el('span', { text: t.text })]);
      b.addEventListener('mousedown', (ev) => { ev.preventDefault(); oeffnen(t); });
      b.addEventListener('mouseenter', () => { aktiv = i; markieren(); });
      liste.appendChild(b);
    });
    liste.hidden = false;
    markieren();
  };
  const suchen = debounce(async () => {
    const q = eingabe.value.trim();
    const nr = ++anfrage;
    if (q.length < 2) { schliessen(); return; }
    try {
      const [obj, pers, einh] = await Promise.all([
        API.get('/objekte' + API.qs({ suche: q })),
        API.get('/adressen/gesamtliste' + API.qs({ modus: 'intensiv', q })),
        API.get('/einheiten' + API.qs({ suche: q })),
      ]);
      if (nr !== anfrage) return;
      treffer = [
        ...obj.slice(0, 6).map((o) => ({ gruppe: 'Objekte', icon: 'building', nr: o.nummer, text: [o.bezeichnung, [o.plz, o.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · '), hash: '#/objekte/' + o.id })),
        ...einh.slice(0, 6).map((e) => ({ gruppe: 'Wohnungen', icon: 'house', nr: e.nummer, text: [e.bezeichnung, e.objekt_bezeichnung].filter(Boolean).join(' · '), hash: '#/einheiten/' + e.id })),
        ...pers.slice(0, 8).map((a) => ({ gruppe: 'Adressen', icon: 'user', nr: a.nummer, text: [a.name, a.ort].filter(Boolean).join(' · '), hash: '#/adressen/' + a.id })),
      ];
      aktiv = treffer.length ? 0 : -1;
      zeichnen();
    } catch (e) { fehler(e); }
  }, 250);
  eingabe.addEventListener('input', suchen);
  eingabe.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (!treffer.length) return;
      ev.preventDefault();
      aktiv = (aktiv + (ev.key === 'ArrowDown' ? 1 : -1) + treffer.length) % treffer.length;
      markieren();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (treffer[aktiv] && !liste.hidden) oeffnen(treffer[aktiv]);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      schliessen();
      eingabe.blur();
    }
  });
  eingabe.addEventListener('blur', () => setTimeout(schliessen, 150));
  return el('div', { class: 'cu-suche', role: 'search' }, [icon('search', 'cu-suche-icon'), eingabe, liste]);
}

/** Glocke: fällige Wiedervorlagen (heute oder früher). */
async function glockeAktualisieren() {
  const b = document.getElementById('cu-glocke');
  if (!b) return;
  try {
    const liste = await API.get('/wiedervorlagen/faellig');
    b.hpListe = liste;
    b.classList.toggle('hat', liste.length > 0);
    b.title = liste.length ? `${liste.length} fällige Wiedervorlage(n)` : 'Keine fälligen Wiedervorlagen';
  } catch { /* still */ }
}
function glockeOeffnen(b) {
  if (offenesMenue && offenesMenue.knopf === b) { schliesseMenue(); return; }
  const liste = b.hpListe || [];
  const eintraege = liste.length
    ? liste.map((w) => ({ text: `${datumKurz(w.faellig_am)} · ${w.name || w.adresse_nummer}: ${w.betreff}`, aktion: () => geheZu(w.vorgang_id?'#/vorgaenge/'+w.vorgang_id:'#/adressen/' + w.adresse_id) }))
    : [{ text: 'Keine fälligen Wiedervorlagen', folgt: 'Alles erledigt.', stufe: '' }];
  oeffneListe(b, 'Benachrichtigungen', eintraege, { rechts: true });
}

function initialen(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((t) => t[0].toUpperCase()).join('') || '?';
}

function benutzerMenue(b) {
  if (offenesMenue && offenesMenue.knopf === b) { schliesseMenue(); return; }
  oeffneListe(b, 'Benutzer', [
    { text: 'Passwort ändern …', aktion: passwortDialog },
    { text: 'Klassische Menüleiste', haken: () => S.klassik, titel: 'Menüband Datei, Edit, Optionen, Sprünge … und Symbolleiste einblenden', aktion: klassikUmschalten },
    { text: 'Sprung-Übersicht', taste: 'F1', aktion: sprungUebersicht },
    { text: 'Abmelden', aktion: logout },
  ], { rechts: true });
}

function klassikUmschalten() {
  S.klassik = !S.klassik;
  try { localStorage.setItem('hp_klassik', S.klassik ? '1' : '0'); } catch { /* privater Modus */ }
  ansichtAnwenden();
}

function baueShell() {
  const b = S.benutzer;
  try { S.klassik = localStorage.getItem('hp_klassik') === '1'; } catch { S.klassik = false; }
  const glocke = el('button', { type: 'button', id: 'cu-glocke', class: 'cu-rund', 'aria-label': 'Benachrichtigungen', title: 'Benachrichtigungen' }, [icon('bell')]);
  glocke.addEventListener('click', () => glockeOeffnen(glocke));
  const benutzer = el('button', { type: 'button', class: 'cu-benutzer', 'aria-haspopup': 'true', title: `${b.name} (${L.benutzerRolle[b.rolle] || b.rolle})` }, [
    el('span', { class: 'cu-avatar', 'aria-hidden': 'true', text: initialen(b.name) }),
    el('span', { class: 'cu-benutzer-name', text: b.name }),
    icon('chevron'),
  ]);
  benutzer.addEventListener('click', () => benutzerMenue(benutzer));
  const kopf = el('header', { class: 'hp-kopf' }, [
    baueNavigation(),
    el('div', { class: 'cu-kopf' }, [
      el('a', { class: 'cu-marke', href: '#/', text: APP_NAME }),
      baueKopfSuche(),
      el('div', { class: 'cu-kopf-rechts' }, [
        glocke,
        el('button', { type: 'button', class: 'cu-rund', 'aria-label': 'Hilfe: Sprung-Übersicht (F1)', title: 'Hilfe: Sprung-Übersicht (F1)', onclick: sprungUebersicht }, [icon('help')]),
        benutzer,
      ]),
    ]),
    // Klassisches HausPerfekt-Menüband: ausgeblendet, Alt+Buchstabe funktioniert trotzdem
    el('div', { class: 'cu-klassik' }, [baueMenueleiste(), baueWerkzeugleiste()]),
  ]);
  const desktop = el('main', { class: 'hp-desktop', id: 'hp-desktop' });
  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const status = el('footer', { class: 'hp-status' }, [
    el('span', { id: 'hp-status-text', 'aria-live': 'polite', text: 'Bereit' }),
    el('span', { class: 'hp-spacer' }),
    el('span', { class: 'hp-status-feld hp-anzeige', id: 'hp-ind-modifiz', title: 'Ein Datensatz wird gerade bearbeitet', text: 'Modifiz.' }),
    el('span', { class: 'hp-status-feld hp-anzeige', id: 'hp-ind-zoom', title: 'Zoom (F5)', text: 'ZOOM' }),
    el('span', { class: 'hp-status-feld hp-anzeige', id: 'hp-ind-breit', title: 'Breiter (F6)', text: 'Breiter' }),
    el('span', { class: 'hp-status-feld', text: heute }),
    el('span', { class: 'hp-status-feld', text: 'KW ' + kalenderwoche() }),
  ]);
  const appEl = document.getElementById('app');
  appEl.innerHTML = '';
  appEl.appendChild(el('div', { class: 'hp' }, [kopf, desktop, status, baueUntenNavigation()]));
  ansichtAnwenden();
  navAktualisieren();
  glockeAktualisieren();
}

function status(text) {
  const s = document.getElementById('hp-status-text');
  if (s) s.textContent = text;
}

/** Zeigt eine Maske (oder nur die Startmaske) – ignoriert veraltete Aufrufe. */
function zeigeAufDesktop(lauf, maske) {
  if (lauf !== S.lauf) return false;
  const d = document.getElementById('hp-desktop');
  if (!d) return false;
  d.innerHTML = '';
  if (maske) d.appendChild(maske);
  if (TASTEN_PANEL_ANZEIGEN) d.appendChild(tastenPanel(!maske));
  status('Bereit');
  return true;
}

function tastenPanel(start) {
  const liste = el('div', { class: 'hp-tasten-liste' });
  BEFEHLE.forEach((b) => {
    const kbd = b.browser ? `Strg ${b.taste}*` : `Strg ${b.taste}`;
    const titel = b.folgt ? `${b.text} – ${b.folgt}` : `${b.text} öffnen`;
    const zeile = el('div', { class: 'hp-taste' + (b.folgt ? ' folgt' : '') }, [
      el('button', { type: 'button', class: 'hp-kbd', title: titel, text: kbd, onclick: () => befehl(b.taste) }),
      el('button', { type: 'button', class: 'hp-tx', title: titel, text: b.text, onclick: () => befehl(b.taste) }),
    ]);
    liste.appendChild(zeile);
  });
  return el('aside', { class: 'hp-tasten' + (start ? ' start' : ''), 'aria-label': 'Tastaturbefehle' }, [
    el('div', { class: 'hp-tasten-titel', text: start ? 'Tastaturbefehle' : 'Tastaturbefehle zur Akte' }),
    liste,
    el('div', { class: 'hp-tasten-fuss', text: '* Strg+W/Strg+T sind im Browser belegt: Buchstaben ins Feld „Befehl" tippen und Enter drücken. Grau = folgt in späterer Stufe.' }),
  ]);
}

/** F1 / Hilfe: Sprung-Übersicht wie im HausPerfekt-Handbuch; graue Einträge folgen später. */
function sprungUebersicht() {
  const F = SPAETER;
  const GLOBAL = [
    ['F1', 'Hilfe (diese Übersicht)'], ['F2', 'Ändern (auf markierter Zeile: diese Zeile)'], ['F3', 'Löschen/Deaktivieren · nach „Suchen" in Listen: Weitersuchen'],
    ['F4', 'Neuanlage'], ['F5', 'Zoom'], ['F6', 'Feld verbreitern'], ['F7', 'Bereich eingrenzen ab', F], ['F8', 'Bereich eingrenzen bis', F], ['F10', 'Bereich bestätigen/Aktion ausführen', F],
    ['Strg F1', 'Eigene Infos', F], ['Strg F2', 'Abfragen-Modus'], ['Strg F5', 'Datensatz suchen'], ['Strg F6', 'Bereich eingrenzen', F],
    ['Strg F7', 'Sortierschlüssel'], ['Strg F8', 'Sortieren'],
    ['Alt S, Z', 'Zentrale Information (Z.I.S)'], ['Alt S, M', 'Mehrauslagen erfassen', F],
    ['Alt F1', 'Zweite Menü-Ebene', F], ['Alt F2', 'Aktive Arbeitsplätze', F], ['Alt F8', 'Druckspooler', F], ['Alt F10', 'Archiv'],
    ['Esc', 'Verlassen mit Speichern (Bearbeitungsfenster) · Maske verlassen'], ['Strg Esc', 'Verlassen ohne Speichern'], ['Strg E', 'Telefoneingang erfassen'], ['Strg D', 'Feld duplizieren', F],
    ['Strg U', 'Auf NULL setzen (Feld leeren)'], ['Strg I', 'Ausgabe umlenken (CSV)'], ['s', 'Suchen (in Adress-, Objekt- und Wohnungsmaske)'],
  ];
  const tasteText = (b) => (b.browser ? `Strg ${b.taste} *` : `Strg ${b.taste}`);
  const teil = (typ) => BEFEHLE.filter((b) => !b.nur || b.nur.includes(typ)).filter((b) => !(typ === 'adresse' && b.taste === 'e'))
    .map((b) => [tasteText(b), b.text, b.folgt]);
  const block = (titel, zeilen) => el('section', { class: 'hp-sprung-block' }, [
    el('h3', { text: titel }),
    el('table', { class: 'hp-sprung-tabelle' }, [el('tbody', {}, zeilen.map(([t, x, folgt]) => el('tr', { class: folgt ? 'folgt' : '', title: folgt || null }, [
      el('td', { class: 'nowrap', text: t }), el('td', { text: x + (folgt ? ' (folgt)' : '') }),
    ])))]),
  ]);
  const inhalt = el('div', { class: 'hp-sprung' }, [
    block('Funktionen, die an allen Stellen funktionieren', GLOBAL),
    block('Programmteile öffnen: Alt S + Buchstabe', SPRUENGE.map((b) => [`Alt S, ${b.taste.toUpperCase()}`, b.text, b.folgt])),
    block('Adresse <Alt s> <a>', teil('adresse')),
    block('Objekt <Alt s> <o>', teil('objekt')),
    block('Wohnung <Alt s> <w>', teil('einheit')),
    el('p', { class: 'small muted', text: '* Strg+W und Strg+T sind im Browser belegt: Buchstaben ins Feld „Befehl" tippen und Enter drücken. Grau = folgt in einer späteren Ausbaustufe.' }),
  ]);
  modal({ titel: 'Sprung-Übersicht', wide: true, inhalt, footer: (close) => [el('button', { text: 'Schließen', onclick: close })] });
}

// Datei → Öffnen Applikation (Shift+Ctrl+O): Bereich per Name auswählen und öffnen
function applikationOeffnen() {
  const apps = [
    { text: 'Objekte', info: 'Objektmaske öffnen (Suche darin mit s)', hash: '#/objekte', taste: 'Alt+S, O' },
    { text: 'Wohnungen / Einheiten', info: 'Wohnungsmaske öffnen (Suche darin mit s)', hash: '#/einheiten', taste: 'Alt+S, W' },
    { text: 'Adressen', info: 'Adressmaske öffnen (Suche darin mit s)', hash: '#/adressen', taste: 'Alt+S, A' },
    { text: 'DMS', info: 'Dauerhaftes Archiv', hash: '#/dms' },
    { text: 'Arbeitsbereiche', info: 'Akten, Aufträge, Wiedervorlagen, ZIS und Notizen', hash: '#/vorgaenge' },
    { text: 'Archiv', info: 'zentrale Ablage', hash: '#/archiv' },
    { text: 'Archiv – nicht zugeordnete Einträge', info: 'Eingang ohne Zuordnung', hash: '#/archiv?ohne=1' },
    { text: 'Benutzerverwaltung', info: 'System', hash: '#/benutzer', nurAdmin: true },
    { text: 'Finanzbuchhaltung (FIBU)', folgt: SPAETER },
    { text: 'E-Banking / SEPA-Export', folgt: STUFE4 },
    { text: 'HP-Mobile (iPad-Formulare)', folgt: STUFE2 },
    { text: 'Wiedervorlagen', hash: '#/vorgaenge?art=wiedervorlage' },
    { text: 'Kalender', hash: '#/kalender' },
  ].filter((a) => !a.nurAdmin || istAdmin());
  const suche = el('input', { id: 'app_suche', type: 'search', autocomplete: 'off', placeholder: 'Name der Applikation …' });
  const liste = el('div', { class: 'hp-app-liste', role: 'listbox', 'aria-label': 'Applikationen' });
  let m;
  const starten = (a) => {
    if (a.folgt) { toast(`${a.text}: ${a.folgt}`); return; }
    m.close();
    geheZu(a.hash);
  };
  const zeichnen = () => {
    const q = suche.value.trim().toLowerCase();
    liste.replaceChildren(...apps.filter((a) => !q || a.text.toLowerCase().includes(q)).map((a) =>
      el('button', { type: 'button', role: 'option', class: 'hp-menue-eintrag' + (a.folgt ? ' gesperrt' : ''), title: a.folgt || a.info, onclick: () => starten(a) }, [
        el('span', { text: a.text }),
        el('span', { class: 'hp-me-taste', text: a.folgt ? 'folgt' : (a.taste || '') }),
      ])
    ));
    if (!liste.children.length) liste.appendChild(el('div', { class: 'small muted', style: 'padding:6px 10px', text: 'Keine Applikation gefunden.' }));
  };
  suche.addEventListener('input', zeichnen);
  suche.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const q = suche.value.trim().toLowerCase();
      const treffer = apps.find((a) => !a.folgt && (!q || a.text.toLowerCase().includes(q)));
      if (treffer) starten(treffer);
    } else if (ev.key === 'ArrowDown') { ev.preventDefault(); liste.querySelector('button')?.focus(); }
  });
  liste.addEventListener('keydown', (ev) => {
    const items = [...liste.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); items[Math.min(i + 1, items.length - 1)]?.focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (i <= 0) suche.focus(); else items[i - 1].focus(); }
  });
  zeichnen();
  m = modal({
    titel: 'Öffnen Applikation',
    inhalt: el('div', {}, [el('div', { class: 'field' }, [el('label', { for: 'app_suche', text: 'Applikation' }), suche]), liste]),
    footer: (close) => [el('button', { text: 'Abbrechen', onclick: close })],
  });
}

function ueberDialog() {
  const inhalt = el('div', {}, [
    el('p', {}, [el('strong', { text: APP_NAME }), document.createTextNode(' – webbasierte WEG- und Mietverwaltung.')]),
    el('p', { text: 'Stufe 1: Objekte, Einheiten, zentrale Adressdatenbank, Personenfunktionen mit Gültigkeitszeitraum und zentrales Archiv.' }),
    el('p', { class: 'small muted', text: 'In Planung: Stufe 2 iPad-Vor-Ort-Formulare · Stufe 3 Microsoft-365 (Termine, E-Mail-Zuordnung) · Stufe 4 Rechnungsauslesung & SEPA-Export für SFirm · Kundenzugang.' }),
  ]);
  modal({ titel: 'Über ' + APP_NAME, inhalt, footer: (close) => [el('button', { text: 'Schließen', onclick: close })] });
}

// ---------------------------------------------------------------------
//  Masken-Bausteine
// ---------------------------------------------------------------------
/**
 * Maske als Seite: Pfad (Breadcrumb), große Überschrift mit Badge, Unterzeile,
 * Aktionen (Drucken, Weitere Aktionen, Bearbeiten). kopf: { brot, ueberschrift,
 * badge, badgeKlasse, unterzeile, buchungsjahr, drucken }. aria-label = Maskentitel.
 */
function maskenFenster({ titel, inhalt, zusatz, kopf = {} }) {
  const k = S.kontext || {};
  const weitere = (inhalt && inhalt.hpWeitere) || [];
  const symbole = inhalt && inhalt.hpZusatz;
  const ueberschrift = kopf.ueberschrift || titel;
  const brot = kopf.brot || [{ text: 'Übersicht', href: '#/' }, { text: ueberschrift }];
  const pfad = el('nav', { class: 'cu-brot', 'aria-label': 'Pfad' });
  brot.forEach((b, i) => {
    if (i) pfad.appendChild(el('span', { class: 'cu-brot-trenner', 'aria-hidden': 'true', text: '/' }));
    pfad.appendChild(b.href && i < brot.length - 1 ? el('a', { href: b.href, text: b.text }) : el('span', { 'aria-current': i === brot.length - 1 ? 'page' : null, text: b.text }));
  });
  let weiterKnopf = null;
  if (weitere.length) {
    weiterKnopf = el('button', { type: 'button', class: 'cu-knopf', 'aria-haspopup': 'true' }, [icon('dots'), el('span', { text: 'Weitere Aktionen' }), icon('chevron')]);
    weiterKnopf.addEventListener('click', () => (offenesMenue && offenesMenue.knopf === weiterKnopf ? schliesseMenue() : oeffneListe(weiterKnopf, 'Weitere Aktionen', weitere, { rechts: true })));
  }
  const aktionen = el('div', { class: 'cu-aktionen' }, [
    // zusätzliche, immer sichtbare Knöpfe der Maske (z. B. „Personenkonto" in der Wohnung)
    ...(kopf.knoepfe || []).map((k) => el('button', { type: 'button', class: 'cu-knopf', title: k.titel || k.text, onclick: k.onclick }, [icon(k.icon || iconFuer(k.text)), el('span', { text: k.text })])),
    kopf.drucken === false ? null : el('button', { type: 'button', class: 'cu-knopf', title: 'Maske drucken', onclick: () => window.print() }, [icon('printer'), el('span', { text: 'Drucken' })]),
    weiterKnopf,
    k.bearbeiten && darfSchreiben() ? el('button', { type: 'button', class: 'btn-primary cu-knopf', title: 'Bearbeiten (F2)', onclick: bearbeitenAktuell }, [icon('pencil'), el('span', { text: 'Bearbeiten' })]) : null,
  ]);
  return el('section', { class: 'hp-maske', 'aria-label': titel }, [
    el('div', { class: 'cu-seitenkopf' }, [
      el('div', { class: 'cu-seitenkopf-oben' }, [
        pfad,
        kopf.buchungsjahr ? el('span', { class: 'cu-chip', title: 'Buchungsjahr – wird mit der Finanzbuchhaltung (FIBU) wählbar' }, [
          icon('calendar'), el('span', { text: 'Buchungsjahr' }), el('strong', { text: String(new Date().getFullYear()) }),
        ]) : null,
      ]),
      el('div', { class: 'cu-titelzeile' }, [
        el('div', { class: 'cu-titel' }, [
          el('div', { class: 'cu-h1-zeile' }, [
            el('h1', { text: ueberschrift }),
            kopf.badge ? el('span', { class: 'cu-badge ' + (kopf.badgeKlasse || ''), text: kopf.badge }) : null,
          ]),
          kopf.unterzeile ? el('div', { class: 'cu-unterzeile', text: kopf.unterzeile }) : null,
          zusatz ? el('div', { class: 'cu-unterzeile', text: zusatz }) : null,
          symbole ? el('div', { class: 'cu-symbolzeile' }, [symbole]) : null,
        ]),
        aktionen,
      ]),
    ]),
    el('div', { class: 'hp-maske-inhalt' }, inhalt),
  ]);
}

function maskenRaster({ oben, seite, unten }) {
  const layout = el('div', { class: 'hp-raster-layout' }, [
    el('div', { class: 'hp-oben' }, oben),
    el('div', { class: 'hp-seite' }, [seite]),
    el('div', { class: 'hp-unten' }, unten),
  ]);
  layout.hpWeitere = seite && seite.hpWeitere;
  layout.hpZusatz = seite && seite.hpZusatz;
  return layout;
}

function wertEl(v, cls) {
  const s = el('span', { class: cls });
  if (v instanceof Node) s.appendChild(v);
  else s.textContent = v == null ? '' : String(v);
  return s;
}

/** Panel mit Zeilen [Bezeichnung, Wert1, Wert2?]. Eingabefelder bekommen ein <label>. */
function panel(zeilen, cls) {
  const p = el('div', { class: 'hp-panel ' + (cls || '') });
  zeilen.filter(Boolean).forEach(([bez, w1, w2]) => {
    const istFeld = w1 instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(w1.tagName) && w1.id;
    p.appendChild(el('div', { class: 'hp-zeile' }, [
      istFeld ? el('label', { class: 'hp-label', for: w1.id, text: bez }) : el('span', { class: 'hp-label', text: bez }),
      wertEl(w1, 'hp-w1'),
      w2 !== undefined ? wertEl(w2, 'hp-w2') : null,
    ]));
  });
  return p;
}

let befehlZaehler = 0;
// Texte der Strg-Sprünge je Maske (Sprung-Übersicht); ausgelassen: Sprung auf sich selbst
// sowie Korrespondenz/Vorgang – das sind Reiter der Maske.
const SCHNELL_TEXT = {
  m: { adresse: 'E-Mail zur Adresse', objekt: 'E-Mail zum Objekt', einheit: 'E-Mail zur Wohnung' },
  w: { objekt: 'Wohnungen' },
  e: { adresse: 'Eingangstelefonat' },
};
const SCHNELL_OHNE = { adresse: ['a', 'k', 'v'], objekt: ['o', 'k', 'v', 'e'], einheit: ['w', 'k', 'v', 'e'] };

function schnellKnopf({ icon: ic, text, kbd, gesperrt, titel, onclick, href }) {
  const inhalt = [icon(ic || iconFuer(text)), el('span', { class: 'cu-schnell-text', text }), kbd ? el('kbd', { text: kbd }) : null];
  const cls = 'hp-knopf cu-schnell' + (gesperrt ? ' gesperrt' : '');
  if (href && !gesperrt) return el('a', { class: cls + ' btn', href, title: titel || null }, inhalt);
  const b = el('button', { type: 'button', class: cls, title: titel || null, 'aria-disabled': gesperrt ? 'true' : null }, inhalt);
  b.addEventListener('click', onclick);
  return b;
}

/**
 * Rechte Karte „Schnellaktionen": Strg-Sprünge der Maske + Knöpfe mit schnell:true.
 * Übrige Knöpfe landen im Menü „Weitere Aktionen" (aside.hpWeitere); in Masken
 * ohne Sprünge (Listen, Archiv …) stehen alle Knöpfe in der Karte.
 */
function seitenleiste(knoepfe, { zusatz } = {}) {
  const typ = (S.kontext || {}).typ;
  const mitSpruengen = !!SCHNELL_OHNE[typ];
  const id = 'hp-befehl-' + (++befehlZaehler);
  const eingabe = el('input', { id, class: 'hp-befehl', maxlength: '1', autocomplete: 'off', title: 'Buchstabe eingeben und Enter drücken (z. B. o = Objekt, w = Wohnung)' });
  eingabe.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const k = eingabe.value.trim().toLowerCase();
    eingabe.value = '';
    if (k) befehl(k, true);
  });
  const liste = el('div', { class: 'hp-knoepfe' });
  const weitere = [];
  if (mitSpruengen) {
    BEFEHLE.filter((b) => (!b.nur || b.nur.includes(typ)) && !SCHNELL_OHNE[typ].includes(b.taste)).forEach((b) => {
      liste.appendChild(schnellKnopf({
        icon: b.icon, text: (SCHNELL_TEXT[b.taste] || {})[typ] || b.text,
        kbd: b.browser ? `Befehl ${b.taste.toUpperCase()}` : `Strg + ${b.taste.toUpperCase()}`,
        gesperrt: !!b.folgt, titel: b.folgt || (b.browser ? `Strg+${b.taste.toUpperCase()} ist im Browser belegt – Buchstabe ${b.taste} ins Feld „Befehl" tippen` : null),
        onclick: () => befehl(b.taste),
      }));
    });
  }
  knoepfe.filter(Boolean).forEach((k) => {
    if (k.gruppe || k.abstand) return;
    if (/^(Drucke|Drucken|Bearbeiten)$/.test(k.text)) return; // stehen oben im Seitenkopf
    const klick = () => (k.gesperrt ? toast(k.grund || 'Keine Schreibberechtigung.') : k.onclick());
    if (!mitSpruengen || k.schnell) {
      liste.appendChild(schnellKnopf({ icon: k.icon, text: k.text, gesperrt: k.gesperrt, titel: k.titel, href: k.href, onclick: klick }));
    } else {
      weitere.push(k.gesperrt
        ? { text: k.text, folgt: k.grund || 'Keine Schreibberechtigung.', stufe: '' }
        : { text: k.text, titel: k.titel, aktion: k.href ? () => { window.location.href = k.href; } : k.onclick });
    }
  });
  const schmal = !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
  const kopfKnopf = el('button', { type: 'button', class: 'cu-karten-titel cu-klapp', 'aria-expanded': String(!schmal), 'aria-controls': id + '-liste' },
    [icon('zap', 'cu-akzent'), el('span', { text: 'Schnellaktionen' }), icon('chevron', 'cu-klapp-pfeil')]);
  liste.id = id + '-liste';
  const karte = el('aside', { class: 'hp-seitenleiste cu-karte' + (schmal ? ' zu' : ''), 'aria-label': 'Schnellaktionen' }, [
    el('h2', { class: 'cu-karten-h2' }, [kopfKnopf]),
    liste,
    el('div', { class: 'hp-befehl-zeile' }, [el('label', { for: id, text: 'Befehl' }), eingabe]),
  ]);
  kopfKnopf.addEventListener('click', () => {
    const offen = !karte.classList.toggle('zu');
    kopfKnopf.setAttribute('aria-expanded', String(offen));
  });
  karte.hpWeitere = weitere;
  karte.hpZusatz = zusatz || null;
  return karte;
}

function reiterLeiste(liste, aktiv, basis) {
  return el('div', { class: 'hp-reiter', role: 'tablist' }, liste.map((r) =>
    el('button', {
      type: 'button', role: 'tab', 'aria-selected': String(r.key === aktiv), class: r.key === aktiv ? 'aktiv' : '',
      text: r.label + (r.anzahl != null ? ` (${r.anzahl})` : ''),
      onclick: () => geheZu(`${basis}?tab=${r.key}`),
    })
  ));
}

function abschnitt(titel, inhalt, aktionen = []) {
  return el('div', { class: 'hp-abschnitt' }, [
    el('div', { class: 'hp-abschnitt-kopf' }, [
      el('span', { class: 'hp-blau', text: titel }),
      el('span', { class: 'hp-spacer' }),
      ...aktionen.filter(Boolean).map((a) => el('button', {
        type: 'button', class: 'hp-mini' + (a.text ? '' : ' hp-pfeil'), title: a.titel || a.text, 'aria-label': a.titel || a.text, onclick: a.onclick,
      }, a.text ? [a.pfeil === false ? null : icon(/^neu$/i.test(a.text) ? 'plus' : 'chevron', 'cu-klein'), el('span', { text: a.text })] : [icon('plus')])),
    ]),
    inhalt,
  ]);
}

/** Dichtes Raster. render() liefert Text (wird als Text gesetzt) oder ein Element. */
function raster(spalten, zeilen, { onOpen, leer = 'Keine Einträge.', mindestZeilen = 0, bearbeiten, klasse } = {}) {
  const thead = el('thead', {}, [el('tr', {}, spalten.map((s) => el('th', { class: s.class || '', text: s.label })))]);
  const tbody = el('tbody');
  if (!zeilen.length && !mindestZeilen) tbody.appendChild(el('tr', { class: 'hp-leer' }, [el('td', { colspan: String(spalten.length), text: leer })]));
  zeilen.forEach((z) => {
    const tr = el('tr', onOpen ? { class: 'klick', tabindex: '0' } : {});
    tr.hpDaten = z;
    if (bearbeiten && darfSchreiben()) { tr.hpBearbeiten = () => bearbeiten(z); tr.title = 'Enter/Klick: öffnen · F2: bearbeiten'; }
    if (onOpen) {
      tr.addEventListener('click', (ev) => { if (!ev.target.closest('a, button')) onOpen(z); });
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target === tr) onOpen(z); });
    }
    spalten.forEach((s) => {
      const td = el('td', { class: s.class || '', 'data-label': s.label || null });
      const c = s.render(z);
      if (c instanceof Node) td.appendChild(c);
      else if (c != null) td.textContent = String(c);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  for (let n = zeilen.length; n < mindestZeilen; n++) {
    tbody.appendChild(el('tr', { class: 'hp-fuell', 'aria-hidden': 'true' }, spalten.map(() => el('td'))));
  }
  return el('div', { class: 'hp-tabelle-wrap' + (klasse ? ' ' + klasse : '') }, [el('table', { class: 'hp-tabelle cu-mobil' }, [thead, tbody])]);
}

const link = (text, href) => el('a', { href, text: text == null ? '' : String(text) });
const badge = (text, cls) => el('span', { class: 'badge ' + (cls || 'badge-kat'), text });
const datumKurz = (iso) => (iso ? datum(iso) : '');

// ---------------------------------------------------------------------
//  Tastatur: Strg + Buchstabe, Esc schließt die Maske
// ---------------------------------------------------------------------
document.addEventListener('keydown', (ev) => {
  if (!S.benutzer) return;
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && (ev.code === 'KeyR' || ev.key?.toLowerCase() === 'r')) {
    const dialog=[...document.querySelectorAll('.modal')].at(-1);
    if(dialog?.querySelector('.cu-rechnungsmaske')){ev.preventDefault();return;}
    if(!dialog && !darfSchreiben())return;
    if(!dialog || dialog.hpRechnungsDokument){ev.preventDefault();rechnungAktuell();return;}
  }
  const dialogOffen = !!document.querySelector('.modal-backdrop');
  const ohneMod = !ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.shiftKey;
  // Edit: Zoom (F5) / Breiter (F6) – Strg+F5 bleibt „neu laden"
  if (ohneMod && (ev.key === 'F5' || ev.key === 'F6')) {
    ev.preventDefault();
    if (ev.key === 'F5') zoomUmschalten(); else breiterUmschalten();
    return;
  }
  // Sprung-Übersicht: F1 Hilfe, F2 Ändern, F3 Löschen (nach „Suchen" in Listen: Weitersuchen), F4 Neuanlage,
  // F7/F8/F10 Bereich eingrenzen (folgt)
  if (ohneMod && ev.key === 'F1') { ev.preventDefault(); if (!dialogOffen) sprungUebersicht(); return; }
  if (ohneMod && /^F(2|3|4|7|8|10)$/.test(ev.key) && !dialogOffen && !offenesMenue) {
    ev.preventDefault();
    if (ev.key === 'F2') bearbeitenAktuell();
    else if (ev.key === 'F3') { if (aktuelleTabelle() && S.suchbegriff) weitersuchen(); else loeschenAktuell(); }
    else if (ev.key === 'F4') erstellenAktuell();
    else toast('Bereich eingrenzen (F7/F8/F10): ' + SPAETER);
    return;
  }
  // Optionen: Strg+F2 Abfragen, Strg+F5 Datensatz suchen, Strg+F7 Sortierschlüssel, Strg+F8 Sortieren, Strg+I Ausgabe umlenken
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && !dialogOffen && !offenesMenue) {
    const opt = { F2: abfragen, F5: datensatzSuchen, F7: sortierschluessel, F8: sortieren }[ev.key] || (ev.code === 'KeyI' ? ausgabeUmlenken : null);
    if (opt) { ev.preventDefault(); opt(); return; }
    const folgt = { F1: 'Eigene Infos', F6: 'Bereich eingrenzen' }[ev.key];
    if (folgt) { ev.preventDefault(); toast(`${folgt}: ${SPAETER}`); return; }
  }
  // Alt+F10 Archiv; Alt+F1/F2/F8 folgen
  if (ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey && /^F(1|2|8|10)$/.test(ev.key) && !dialogOffen) {
    ev.preventDefault();
    schliesseMenue();
    if (ev.key === 'F10') geheZu('#/dms');
    else toast(`${{ F1: 'Zweite Menü-Ebene', F2: 'Aktive Arbeitsplätze', F8: 'Druckspooler' }[ev.key]}: ${SPAETER}`);
    return;
  }
  // Edit: Undo Editieren (Alt+Backspace) im offenen Bearbeitungsfenster
  if (ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.key === 'Backspace' && dialogOffen) {
    ev.preventDefault();
    undoEditieren();
    return;
  }
  // Edit: Auf NULL setzen (Strg+U) im aktuellen Feld
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.code === 'KeyU' && istEingabe(ev.target)) {
    ev.preventDefault();
    aufNullSetzen(ev.target);
    return;
  }
  // Alt+S bleibt auch aus einem geöffneten Dokument erreichbar.
  if(dialogOffen && ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.code==='KeyS' && [...document.querySelectorAll('.modal')].at(-1)?.hpRechnungsDokument){
    const idx=MENUE().findIndex(m=>m.alt==='s');ev.preventDefault();oeffneMenue(idx,document.querySelectorAll('.hp-menue-knopf')[idx],true);return;
  }
  if (offenesMenue || dialogOffen) return; // offene Menüs/Dialoge nicht stören
  // Alt+Buchstabe (auch Alt+Shift, falls der Browser Alt+Buchstabe selbst belegt) öffnet das Menü
  if (ev.altKey && !ev.ctrlKey && !ev.metaKey && /^Key[A-Z]$/.test(ev.code || '')) {
    const buchstabe = ev.code.slice(3).toLowerCase();
    const idx = MENUE().findIndex((m) => m.alt === buchstabe);
    if (idx >= 0) {
      ev.preventDefault();
      oeffneMenue(idx, document.querySelectorAll('.hp-menue-knopf')[idx], true);
      return;
    }
  }
  if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && !ev.altKey && ev.code === 'KeyO') {
    ev.preventDefault();
    applikationOeffnen();
    return;
  }
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey) {
    const k = /^Key[A-Z]$/.test(ev.code || '') ? ev.code.slice(3).toLowerCase() : (ev.key || '').toLowerCase();
    const b = BEFEHLE.find((x) => x.taste === k);
    if (!b) return;
    if ((k === 'a' || k === 'v') && istEingabe(ev.target)) return; // Strg+A/V = markieren/einfügen in Feldern
    ev.preventDefault();
    befehl(k);
  } else if (ohneMod && (ev.key === 's' || ev.key === 'S') && S.kontext && S.kontext.suchen && !istEingabe(ev.target)) {
    // In Adress-/Objekt-/Wohnungsmaske: s öffnet die Suche
    ev.preventDefault();
    S.kontext.suchen();
  } else if (ev.key === 'Escape' && !ev.defaultPrevented && !istEingabe(ev.target) && location.hash && location.hash !== '#/') {
    geheZu((S.kontext && S.kontext.zurueck) || '#/');
  }
});
