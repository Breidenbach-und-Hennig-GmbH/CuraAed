'use strict';

/* HausPerfekt 2.0 – Masken: Startmaske, Suchmasken, Objekt-, Wohnungs- und
   Adressmaske (mit Reitern), zentrales Archiv, Benutzerverwaltung. */

const schreibSperre = () => !darfSchreiben();
const telHref = (nr) => 'tel:' + String(nr || '').replace(/[^0-9+]/g, '');

// ---------------------------------------------------------------------
//  Startmaske – leerer Arbeitsbereich wie beim Start von HausPerfekt
// ---------------------------------------------------------------------
function startMaske(){return cockpitMaske();}

// ---------------------------------------------------------------------
//  Generische Suchmaske
// ---------------------------------------------------------------------
function suchMaske({ titel, symbol, felder, abrufen, abschnittTitel, spalten, onOpen, leer, knoepfe, listenBasis, erstellen }) {
  const lauf = S.lauf;
  const eingaben = {};
  const zeilen = felder.map((f) => {
    const id = 'such_' + f.name;
    let e;
    if (f.optionen) {
      e = el('select', { id }, f.optionen.map(([v, t]) => el('option', { value: v, text: t })));
      e.value = f.wert || '';
      e.addEventListener('change', () => laden());
    } else {
      e = el('input', { id, type: 'search', value: f.wert || '', placeholder: f.platzhalter || '', autocomplete: 'off' });
      e.addEventListener('input', debounce(() => laden(), 250));
    }
    eingaben[f.name] = e;
    return [f.label, e];
  });
  const ergebnis = el('div');

  async function laden() {
    status('Suche …');
    const werte = {};
    Object.entries(eingaben).forEach(([k, e]) => { werte[k] = e.value; });
    try {
      const daten = await abrufen(werte);
      if (lauf !== S.lauf) return;
      if (listenBasis) S.trefferliste = { basis: listenBasis, ids: daten.map((d) => d.id) };
      ergebnis.replaceChildren(abschnitt(`${abschnittTitel} (${daten.length})`, raster(spalten, daten, { onOpen, leer })));
      status(daten.length>=500?'500 Treffer angezeigt – bitte die Suche eingrenzen.':`${daten.length} Treffer`);
    } catch (e) { fehler(e); status('Fehler bei der Suche'); }
  }

  const fenster = maskenFenster({
    titel, symbol,
    inhalt: maskenRaster({
      oben: [panel(zeilen, 'hp-such-panel')],
      seite: seitenleiste([
        ...knoepfe,
        { text: 'Suche', titel: 'Suchfeld markieren', onclick: () => Object.values(eingaben)[0].focus() },
      ]),
      unten: [ergebnis],
    }),
  });
  if (!zeigeAufDesktop(lauf, fenster)) return;
  S.kontext = { typ: 'suche', suchfeld: Object.values(eingaben)[0], erstellen };
  Object.values(eingaben)[0].focus();
  laden();
}

function objektSuche() {
  suchMaske({
    titel: 'Objekte – Suche', listenBasis: '#/objekte/', symbol: '🏢', abschnittTitel: 'Objekte',
    felder: [
      { name: 'suche', label: 'Suchbegriff', platzhalter: 'Objekt-Nr., Bezeichnung, Straße, Ort …' },
      { name: 'objekttyp', label: 'Typ', optionen: [['', 'alle'], ['WEG', 'WEG'], ['MIETE', 'Miete'], ['HP', 'HP-Typ']] },
      { name: 'archiviert', label: 'Bestand', optionen: [['', 'aktive Objekte'], ['1', 'deaktivierte Objekte']] },
    ],
    abrufen: (w) => API.get('/objekte' + API.qs(w)),
    spalten: [
      { label: 'Nr.', class: 'nowrap', render: (o) => UI.objektNummer(o) },
      { label: 'Bezeichnung', render: (o) => el('strong', { text: o.bezeichnung }) },
      { label: 'Typ', render: (o) => (o.objekttyp === 'HP' ? 'HP-Typ' : o.objekttyp === 'WEG' ? 'WEG' : 'Miete') },
      { label: 'Strasse', render: (o) => o.strasse },
      { label: 'PLZ', render: (o) => o.plz },
      { label: 'Ort', render: (o) => o.ort },
      { label: 'Einh.', class: 'zahl', render: (o) => o.einheiten_anzahl },
      { label: 'Archiv', class: 'zahl', render: (o) => o.dokumente_anzahl },
    ],
    onOpen: (o) => geheZu('#/objekte/' + o.id),
    leer: 'Keine Objekte gefunden.',
    erstellen: () => objektFormular(),
    knoepfe: [{ text: 'Neu', titel: 'Neues Objekt anlegen', onclick: () => objektFormular(), gesperrt: schreibSperre() }],
  });
}

function einheitSuche() {
  suchMaske({
    titel: 'Wohnungen / Einheiten – Suche', listenBasis: '#/einheiten/', symbol: '🚪', abschnittTitel: 'Einheiten',
    felder: [
      { name: 'suche', label: 'Suchbegriff', platzhalter: 'Einheit-Nr., Bezeichnung, Lage, Objekt …' },
      { name: 'einheitstyp', label: 'Typ', optionen: [['', 'alle']].concat(Object.entries(L.einheitstyp)) },
    ],
    abrufen: (w) => API.get('/einheiten' + API.qs(w)),
    spalten: [
      { label: 'Nr.', class: 'nowrap', render: (e) => e.nummer },
      { label: 'Bezeichnung', render: (e) => el('strong', { text: e.bezeichnung }) },
      { label: 'Typ', render: (e) => L.einheitstyp[e.einheitstyp] || e.einheitstyp },
      { label: 'VE / Lage', render: (e) => e.lage },
      { label: 'Objekt', render: (e) => `${UI.objektNummer(e.objekt_nummer)} ${e.objekt_bezeichnung}` },
      { label: 'Ort', render: (e) => e.objekt_ort },
      { label: 'Fläche', class: 'zahl nowrap', render: (e) => (e.flaeche_qm != null ? `${String(e.flaeche_qm).replace('.', ',')} m²` : '') },
    ],
    onOpen: (e) => geheZu('#/einheiten/' + e.id),
    leer: 'Keine Einheiten gefunden.',
    knoepfe: [],
  });
}

// ---------------------------------------------------------------------
//  Direkteinstieg (Alt+S, A/O/W): zuletzt benutzter Datensatz, sonst der erste nach Nummer.
//  Die Suche gibt es nur aus der Maske heraus (Taste s / Knopf Suchen).
// ---------------------------------------------------------------------
const MERK = { adresse: 'hp.letzteAdresse', objekt: 'hp.letztesObjekt', einheit: 'hp.letzteEinheit' };
const EINSTIEG = {
  adresse: { api: '/adressen', route: '#/adressen/', maske: (id, p) => adresseMaske(id, p), leer: 'Noch keine Adressen vorhanden – neue Adresse mit F4 anlegen.', erstellen: () => adresseFormular() },
  objekt: { api: '/objekte', route: '#/objekte/', maske: (id, p) => objektMaske(id, p), leer: 'Noch keine Objekte vorhanden – neues Objekt mit F4 anlegen.', erstellen: () => objektFormular() },
  einheit: { api: '/einheiten', route: '#/einheiten/', maske: (id, p) => einheitMaske(id, p), leer: 'Noch keine Wohnungen vorhanden – zuerst ein Objekt öffnen und dort „Neue Einheit" wählen.' },
};
function merke(typ, id) { try { localStorage.setItem(MERK[typ], String(id)); } catch { /* privater Modus */ } }
function gemerkt(typ) {
  try { const v = localStorage.getItem(MERK[typ]); return v && /^\d+$/.test(v) ? v : null; } catch { return null; }
}
/** Datensatz nicht ladbar: war er gemerkt, vergessen und den nächsten Einstieg versuchen. */
function maskeFehlt(typ, id) {
  const war = gemerkt(typ) === String(id);
  if (war) { try { localStorage.removeItem(MERK[typ]); } catch { /* privater Modus */ } }
  geheZu(war ? EINSTIEG[typ].route.slice(0, -1) : '#/');
}
async function maskeDirekt(typ) {
  const cfg = EINSTIEG[typ];
  const lauf = S.lauf;
  let id = gemerkt(typ);
  if (!id) {
    try {
      const alle = await API.get(cfg.api);
      if (lauf !== S.lauf) return;
      const nr = (x) => String(x.nummer || '￿');
      const erste = alle.slice().sort((x, y) => nr(x).localeCompare(nr(y), 'de', { numeric: true }) || x.id - y.id)[0];
      id = erste ? String(erste.id) : null;
    } catch (e) { fehler(e); return startMaske(); }
  }
  if (!id) {
    startMaske();
    toast(cfg.leer);
    if (cfg.erstellen) S.kontext = { typ: 'start', erstellen: cfg.erstellen };
    return;
  }
  history.replaceState(null, '', cfg.route + id);
  return cfg.maske(id, new URLSearchParams());
}

/** Auswertungen/Listen → Adressliste (Liste mit Suchfeld, Sortieren, CSV-Ausgabe). */
function adressListe() {
  suchMaske({
    titel: 'Adressliste', listenBasis: '#/adressen/', symbol: '👤', abschnittTitel: 'Adressen',
    felder: [
      { name: 'suche', label: 'Suchbegriff', platzhalter: 'Adress-Nr., Name, Firma, Ort, Telefon, E-Mail …' },
      { name: 'adresstyp', label: 'Typ', optionen: [['', 'alle'], ['person', 'Personen'], ['firma', 'Firmen']] },
    ],
    abrufen: (w) => API.get('/adressen' + API.qs(w)),
    spalten: [
      { label: 'Nr.', class: 'nowrap', render: (a) => a.nummer },
      { label: '', render: (a) => (a.ampel ? el('span', { class: 'hp-ampel-punkt ' + a.ampel, title: AMPEL_INFO[a.ampel].text, 'aria-label': AMPEL_INFO[a.ampel].text, role: 'img' }) : '') },
      { label: 'Suchbegriff', render: (a) => el('strong', { text: a.anzeigename }) },
      { label: 'PLZ', render: (a) => a.plz },
      { label: 'Ort', render: (a) => a.ort },
      { label: 'Strasse', render: (a) => a.strasse },
      { label: 'Telefon', class: 'nowrap', render: (a) => a.telefon || a.mobil },
      { label: 'E-Mail', render: (a) => a.email },
    ],
    onOpen: (a) => geheZu('#/adressen/' + a.id),
    leer: 'Keine Adressen gefunden.',
    erstellen: () => adresseFormular(),
    knoepfe: [{ text: 'Neu', titel: 'Neue Adresse anlegen', onclick: () => adresseFormular(), gesperrt: schreibSperre() }],
  });
}

// ---------------------------------------------------------------------
//  „Gesamtliste Adresse" – Suche aus der Adressmaske (Taste s / Knopf Suchen)
// ---------------------------------------------------------------------
const GL_MODI = {
  suche: { knopf: 'Suche', label: 'Name / Adr.-Nr. beginnt mit:' },
  intensiv: { knopf: 'Intensiv Adr.', label: 'Intensivsuche (alle Felder):' },
  feld: { knopf: 'Feldsuche', label: 'Feldsuche:' },
  telefon: { knopf: 'Telefon Nr.', label: 'Telefon-Nr. enthält:' },
  pfkt: { knopf: 'Personenfunkt.', label: 'Personenfunktion, Objekt-/Einheit-Nr.:' },
  ansprechp: { knopf: 'Ansprechp.', label: 'Ansprechpartner enthält:' },
};
const GL_FELDER = { name: 'Name', nummer: 'Adr.-Nr.', plz: 'PLZ', ort: 'Ort', strasse: 'Strasse', email: 'E-Mail', lkto_nr: 'LKto-Nr.', notizen: 'Notizen' };
const GL_FILTER = [['aktiv', 'Aktive Personenfunktionen'], ['nicht_aktiv', 'Nicht aktive Personenfunktionen'], ['ohne', 'Adressen ohne Personenfunktion'], ['alle', 'Alle']];
const GL_ROLLE_KURZ = { eigentuemer: 'ET', mieter: 'MI', handwerker: 'HW', beirat: 'BR', verwalter_kontakt: 'VK', hausmeister: 'HM', sonstiges: 'SO' };

function gesamtlisteAdresse(aktuelleId) {
  const z = { modus: 'suche', filter: 'alle', sort: 'name', richtung: 'asc', daten: [], auswahl: -1, anfrage: 0, laden: false, geschlossen: false, tippen: '', tippenZeit: 0 };
  const opts = (map) => Object.entries(map).map(([value, label]) => el('option', { value, text: label }));
  const feldSel = el('select', { id: 'gl_feld', 'aria-label': 'Suchfeld' }, opts(GL_FELDER));
  const rolleSel = el('select', { id: 'gl_rolle', 'aria-label': 'Personenfunktion' }, [el('option', { value: '', text: 'alle Funktionen' }), ...opts(L.rolle)]);
  const modusLabel = el('label', { class: 'hp-gl-modus', for: 'gl_q' });
  const q = el('input', { id: 'gl_q', type: 'search', autocomplete: 'off', spellcheck: 'false' });
  const tbody = el('tbody');
  const spalten = [null, 'nummer', 'name', 'plz', 'ort', 'strasse', null, null, null];
  const filterFelder = {};
  const sortKopf = [];
  const kopf = el('tr', {}, ['Status', 'Adr.-Nr.', 'Name / Firma', 'PLZ', 'Ort', 'Straße', 'Mobile', 'PFKt', 'ObjNr'].map((text, i) => {
    const th = el('th', { class: ['hp-gl-warn', 'r', '', '', '', '', 'c', '', 'r'][i] });
    const key = spalten[i];
    if (!key) th.textContent = text;
    else {
      const button = el('button', { type: 'button', text, title: 'Nach ' + text + ' sortieren', onclick: () => {
        z.richtung = z.sort === key && z.richtung === 'asc' ? 'desc' : 'asc'; z.sort = key; laden();
      } });
      sortKopf.push({ th, button, key, text }); th.appendChild(button);
    }
    return th;
  }));
  const filterZeile = el('tr', { class: 'hp-gl-spaltenfilter' }, ['Status', 'nummer', 'name', 'plz', 'ort', 'strasse', '', 'rolle', 'objekt'].map(key => {
    const td = el('th');
    if (['nummer', 'name', 'plz', 'ort', 'strasse', 'objekt'].includes(key)) {
      const label = { nummer: 'Adressnummer', name: 'Name / Firma', plz: 'PLZ', ort: 'Ort', strasse: 'Straße', objekt: 'Objektnummer' }[key];
      const f = el('input', { type: 'search', 'aria-label': label + ' filtern', placeholder: label, autocomplete: 'off' });
      f.addEventListener('input', () => spaeter());
      f.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(timer); timer = null; laden(); } });
      filterFelder[key] = f; td.appendChild(f);
    } else if (key === 'rolle') { td.appendChild(rolleSel); rolleSel.setAttribute('aria-label', 'Personenfunktion filtern'); }
    return td;
  }));
  const liste = el('div', { class: 'hp-gl-liste', tabindex: '0', role: 'listbox', 'aria-label': 'Adressen' }, [
    el('table', { class: 'hp-tabelle hp-gl-tabelle' }, [
      el('thead', {}, [kopf, filterZeile]),
      tbody,
    ]),
  ]);
  const anzahl = el('span', { class: 'hp-gl-anzahl', 'aria-live': 'polite' });

  const zeilen = () => [...tbody.querySelectorAll('tr[data-id]')];
  function waehle(i, scrollen = true) {
    const tr = zeilen();
    if (!tr.length) { z.auswahl = -1; return; }
    z.auswahl = Math.max(0, Math.min(i, tr.length - 1));
    tr.forEach((r, n) => { r.classList.toggle('gewaehlt', n === z.auswahl); r.setAttribute('aria-selected', String(n === z.auswahl)); });
    if (scrollen) tr[z.auswahl].scrollIntoView?.({ block: 'nearest' });
  }
  function oeffnen(i = z.auswahl) {
    if (z.laden || z.geschlossen) return;
    const d = z.daten[i];
    if (!d) return;
    S.trefferliste={basis:'#/adressen/',ids:z.daten.map(x=>x.id)};
    m.close();
    geheZu('#/adressen/' + d.id);
  }
  function zeichnen() {
    tbody.replaceChildren();
    if (!z.daten.length) tbody.appendChild(el('tr', { class: 'hp-leer' }, [el('td', { colspan: '9', text: 'Keine Adressen gefunden.' })]));
    z.daten.forEach((d, i) => {
      const pfText = d.pf_rolle ? `${L.rolle[d.pf_rolle] || d.pf_rolle}${d.pf_einheit ? ' – Einheit ' + d.pf_einheit : ''}${d.pf_anzahl > 1 ? ` (+${d.pf_anzahl - 1} weitere)` : ''}` : '';
      const pfkt = d.pf_einheit ? String(d.pf_einheit).split('-').pop() : d.pf_rolle ? GL_ROLLE_KURZ[d.pf_rolle] || '' : '';
      const warn = d.pf_status === 'aktiv' ? null
        : el('span', { class: 'hp-gl-ausruf', role: 'img', text: '!', title: d.pf_status === 'ohne' ? 'Adresse ohne Personenfunktion' : 'Keine aktive Personenfunktion', 'aria-label': d.pf_status === 'ohne' ? 'ohne Personenfunktion' : 'keine aktive Personenfunktion' });
      const tr = el('tr', { 'data-id': String(d.id), role: 'option', 'aria-selected': 'false' }, [
        el('td', { class: 'hp-gl-warn' }, warn ? [warn] : []),
        el('td', { class: 'r', text: d.nummer || '' }),
        el('td', { class: 'hp-gl-name', text: String(d.name || '').toUpperCase() }),
        el('td', { text: d.plz || '' }),
        el('td', { text: d.ort || '' }),
        el('td', { text: d.strasse || '' }),
        el('td', { class: 'c' }, [el('input', { type: 'checkbox', disabled: 'disabled', tabindex: '-1', title: 'HP-Mobile – folgt mit Stufe 2', 'aria-label': 'HP-Mobile' })]),
        el('td', { text: pfkt, title: pfText || null }),
        el('td', { class: 'r', text: d.pf_objekt || '0' }),
      ]);
      tr.addEventListener('click', () => (z.auswahl === i ? oeffnen(i) : waehle(i, false)));
      tr.addEventListener('dblclick', () => oeffnen(i));
      tbody.appendChild(tr);
    });
    anzahl.textContent = z.daten.length>=500?'500 Adressen angezeigt – Suche eingrenzen.':`${z.daten.length} Adresse${z.daten.length === 1 ? '' : 'n'}`;
  }
  async function laden() {
    const nr = ++z.anfrage;
    if (z.geschlossen) return;
    const p = { filter: z.filter, modus: z.modus, q: q.value, sort: z.sort, richtung: z.richtung, rolle: rolleSel.value };
    Object.entries(filterFelder).forEach(([key, field]) => { if (field.value.trim()) p[key] = field.value.trim(); });
    if (z.modus === 'feld') p.feld = feldSel.value;
    z.laden = true; liste.setAttribute('aria-busy', 'true'); anzahl.textContent = 'Adressen werden geladen …';
    sortKopf.forEach(({th, button, key, text}) => { th.setAttribute('aria-sort', z.sort === key ? (z.richtung === 'asc' ? 'ascending' : 'descending') : 'none'); button.textContent = text + (z.sort === key ? (z.richtung === 'asc' ? ' ▲' : ' ▼') : ''); });
    try {
      const daten = await API.get('/adressen/gesamtliste' + API.qs(p));
      if (nr !== z.anfrage || z.geschlossen) return;
      const vorher = z.daten[z.auswahl] ? z.daten[z.auswahl].id : aktuelleId;
      z.daten = daten;
      zeichnen();
      const i = daten.findIndex((d) => String(d.id) === String(vorher));
      waehle(i >= 0 ? i : 0);
    } catch (e) { if (nr === z.anfrage && !z.geschlossen) { anzahl.textContent = 'Adressen konnten nicht geladen werden.'; fehler(e); } }
    finally { if (nr === z.anfrage) { z.laden = false; liste.setAttribute('aria-busy', 'false'); } }
  }
  let timer = null;
  const spaeter = () => { clearTimeout(timer); timer = setTimeout(() => { timer = null; laden(); }, 200); };

  const knoepfe = {};
  function setzeModus(modus) {
    z.modus = modus;
    modusLabel.textContent = GL_MODI[modus].label;
    feldSel.hidden = modus !== 'feld';
    q.placeholder = modus === 'pfkt' ? 'z. B. 4010 oder 4010-01' : modus === 'telefon' ? 'z. B. 0152 540' : '';
    Object.entries(knoepfe).forEach(([k, b]) => b.classList.toggle('aktiv', k === modus));
    q.value = '';
    q.focus();
    laden();
  }
  const seite = el('div', { class: 'hp-gl-knoepfe' }, [
    ...['intensiv', 'feld', 'telefon', 'pfkt', 'ansprechp'].map((k) => (knoepfe[k] = el('button', { type: 'button', class: 'hp-knopf', text: GL_MODI[k].knopf, onclick: () => setzeModus(k) }))),
    el('button', { type: 'button', class: 'hp-knopf gesperrt', 'aria-disabled': 'true', text: 'Sonderfunkt.', onclick: () => toast('Sonderfunktionen: ' + SPAETER) }),
    el('button', { type: 'button', class: 'hp-knopf', text: 'Filter zurücksetzen', onclick: () => {
      clearTimeout(timer); timer = null; Object.values(filterFelder).forEach(f => { f.value = ''; }); rolleSel.value = ''; z.filter = 'alle';
      filter.querySelector('input[value="alle"]').checked = true; setzeModus('suche');
    } }),
    (knoepfe.suche = el('button', { type: 'button', class: 'hp-knopf', text: 'Suche', onclick: () => setzeModus('suche') })),
    el('button', { type: 'button', class: 'hp-knopf', text: 'Abbrechen', onclick: () => m.close() }),
  ]);
  const filter = el('div', { class: 'hp-gl-filter', role: 'radiogroup', 'aria-label': 'Personenfunktionen' }, GL_FILTER.map(([wert, text]) => {
    const r = el('input', { type: 'radio', name: 'gl_filter', value: wert });
    r.checked = wert === z.filter;
    r.addEventListener('change', () => { z.filter = wert; laden(); });
    return el('label', {}, [r, document.createTextNode(text)]);
  }));

  // Tastatur in der Liste: Pfeile/Bild/Pos1/Ende, Enter öffnet, Buchstaben springen zum Namen
  function listenTaste(ev) {
    const seiten = Math.max(1, Math.floor(liste.clientHeight / 24) - 1);
    const sprung = { ArrowDown: 1, ArrowUp: -1, PageDown: seiten, PageUp: -seiten }[ev.key];
    if (sprung) { ev.preventDefault(); waehle(z.auswahl + sprung); return; }
    if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); waehle(ev.key === 'Home' ? 0 : z.daten.length - 1); return; }
    if (ev.key === 'Enter') { ev.preventDefault(); oeffnen(); return; }
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const jetzt = Date.now();
      z.tippen = (jetzt - z.tippenZeit > 900 ? '' : z.tippen) + ev.key.toLocaleLowerCase('de-DE');
      z.tippenZeit = jetzt;
      const i = z.daten.findIndex((d) => String(d.name || '').toLocaleLowerCase('de-DE').startsWith(z.tippen));
      if (i >= 0) waehle(i);
      ev.preventDefault();
    }
  }
  liste.addEventListener('keydown', listenTaste);
  q.addEventListener('input', spaeter);
  q.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      clearTimeout(timer); timer = null;
      laden().then(() => oeffnen());
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(ev.key)) { listenTaste(ev); liste.focus(); }
  });
  feldSel.addEventListener('change', () => { q.focus(); laden(); });
  rolleSel.addEventListener('change', () => laden());

  const inhalt = el('div', { class: 'hp-gesamtliste' }, [
    el('div', { class: 'hp-gl-haupt' }, [
      el('div', { class: 'hp-gl-suche' }, [modusLabel, feldSel, q, anzahl]),
      liste,
    ]),
    seite,
    filter,
  ]);
  inhalt.addEventListener('keydown',ev=>{
    if((ev.ctrlKey||ev.metaKey)&&!ev.altKey&&!ev.shiftKey&&ev.key==='F7'){
      ev.preventDefault();ev.stopPropagation();
      adressSortierDialog({sort:z.sort,richtung:z.richtung,anwenden:v=>{z.sort=v.sort;z.richtung=v.richtung;laden();}});
    }
  });
  const m = modal({ titel: 'Gesamtliste Adresse', wide: true, fenster: 'gesamtliste-adressen', inhalt,
    onClose: () => { z.geschlossen = true; ++z.anfrage; clearTimeout(timer); } });
  m.box.classList.add('hp-gl-fenster');
  setzeModus('suche');
}

// ---------------------------------------------------------------------
//  Personenfunktionen (Rollen-Zuordnungen) – gemeinsam für alle Masken
// ---------------------------------------------------------------------
const zeitraum = (z) => `${z.gueltig_von ? datumKurz(z.gueltig_von) : '…'} – ${z.gueltig_bis ? datumKurz(z.gueltig_bis) : ''}`;

/** Personen an Objekt/Einheit: aktuelle und frühere Funktionen. */
function personenAbschnitte(zuord, { mitBezug, neu }) {
  const spalten = [
    { label: 'Zeitraum', class: 'nowrap', render: zeitraum },
    { label: 'Funktion', render: (z) => L.rolle[z.rolle] || z.rolle },
    { label: 'Nr.', class: 'nowrap', render: (z) => z.adresse_nummer },
    { label: 'Suchbegriff', render: (z) => link(z.anzeigename || nameAusZuord(z), '#/adressen/' + z.adresse_id) },
    mitBezug ? { label: 'Bezug', render: (z) => (z.einheit_id ? `Einheit ${z.einheit_nummer} ${z.einheit_bezeichnung || ''}` : 'Objekt') } : null,
    { label: 'Telefon', class: 'nowrap', render: (z) => z.telefon || z.mobil },
  ].filter(Boolean);
  const offen = { onOpen: (z) => geheZu('#/adressen/' + z.adresse_id), bearbeiten: (z) => zuordnungFormular(z, neuLaden) };
  return [
    abschnitt('Aktuelle Personenfunktion', raster(spalten, zuord.filter((z) => z.aktiv), { ...offen, leer: 'Keine aktuellen Personenfunktionen.' }),
      [darfSchreiben() ? { text: 'Neu', titel: 'Person/Firma zuordnen', onclick: neu } : null]),
    abschnitt('Frühere / künftige Personenfunktionen', raster(spalten, zuord.filter((z) => !z.aktiv), { ...offen, leer: 'Keine Historie.' })),
  ];
}

// ---------------------------------------------------------------------
//  Objekt-Maske
// ---------------------------------------------------------------------
async function aktivUmschalten(art, pfad, datensatz) {
  const deaktivieren = !datensatz.archiviert;
  if (deaktivieren && !(await bestaetigen(`${art} deaktivieren? Es wird aus den Suchlisten ausgeblendet, bleibt aber mit allen Daten erhalten und kann jederzeit reaktiviert werden.`, { text: 'Deaktivieren' }))) return;
  try {
    await API.post(pfad + '/archiv', { archiviert: deaktivieren });
    toast(deaktivieren ? `${art} deaktiviert` : `${art} reaktiviert`, 'success');
    neuLaden();
  } catch (e) { fehler(e); }
}

async function objektMaske(id, params) {
  const lauf = S.lauf;
  status('Lädt Objekt …');
  let o, verteiler, bild;
  try {
    o = await API.get('/objekte/' + encodeURIComponent(id));
    [verteiler, bild] = await Promise.all([API.get(`/objekte/${o.id}/verteiler`), API.get(`/objekte/${o.id}/bild`)]);
  } catch (e) { fehler(e); return maskeFehlt('objekt', id); }
  if (lauf !== S.lauf) return;
  merke('objekt', o.id);

  const basis = '#/objekte/' + o.id;
  // ältere Links (?tab=einheiten/adressen/notizen) auf die neuen Reiter abbilden
  const tab = { einheiten: 'kennzahlen', adressen: 'allgemein', notizen: 'allgemein' }[params.get('tab')] || params.get('tab') || 'allgemein';
  const schreiben = darfSchreiben();
  S.kontext = { typ: 'objekt', objekt: o, archivKtx: { typ: 'objekt', id: o.id, nummer: UI.objektNummer(o) }, bearbeiten: () => objektFormular(o),
    erstellen: () => objektFormular(), loeschen: () => aktivUmschalten('Objekt', '/objekte/' + o.id, o), suchen: () => geheZu('#/objektliste') };
  const SPAETER_KNOPF = 'Folgt in einer späteren Ausbaustufe.';

  // ---- Objektstammdaten (Karte, zwei Spalten)
  const fotoKtx = { typ: 'objekt', id: o.id, nummer: UI.objektNummer(o), kategorie: 'foto' };
  const zeile = (l, w) => el('div', { class: 'cu-kv' }, [el('span', { class: 'cu-kv-l', text: l }), el('span', { class: 'cu-kv-w', text: w == null || w === '' ? '—' : String(w) })]);
  const oben = el('div', { class:'cu-objekt-stamm hp-objekt-kopf', 'aria-label':'Objektstammdaten', role:'region' }, [
    el('section',{class:'cu-objekt-ident'},[
      el('div',{class:'cu-objekt-identzeile'},[
        el('span',{class:'cu-objekt-label',text:'Objekt-Nr.'}),
        el('strong',{text:UI.objektNummer(o)}),
        el('strong',{class:'cu-objekt-name',text:o.bezeichnung}),
        schreiben?el('button',{type:'button',class:'hp-mini',title:'Objekt bearbeiten (F2)','aria-label':'Objekt bearbeiten',onclick:()=>objektFormular(o)},[icon('pencil')]):null,
      ]),
      zeile('Straße',o.strasse),
      el('div',{class:'cu-objekt-orttyp'},[
        zeile('PLZ / Ort',[o.plz,o.ort].filter(Boolean).join(' ')),
        zeile('Objekt-Typ',objektTypText(o)),
      ]),
      o.archiviert?el('span',{class:'badge badge-inaktiv',text:'deaktiviert'}):null,
    ]),
    bild?el('button',{type:'button',class:'cu-objekt-foto',title:bild.titel||'Bild zum Objekt','aria-label':'Bild zum Objekt öffnen',onclick:()=>archivBearbeiten(bild.id,neuLaden)},[
      el('img',{src:'/api/archiv/'+bild.id+'/bild',alt:bild.titel||'Bild zum Objekt'}),
    ]):el('div',{class:'cu-objekt-foto cu-objekt-foto-leer','aria-label':'Kein Objektbild'},[
      schreiben?el('button',{type:'button',class:'hp-mini',text:'Bild hinzufügen',onclick:()=>archivUpload(fotoKtx,neuLaden)}):el('span',{text:'Kein Objektbild'}),
    ]),
    el('section',{class:'cu-objekt-gruppen','aria-label':'Gruppenzuordnung'},[1,2,3,4,5].map(n=>zeile('Gruppe '+n,o['gruppe'+n]))),
    el('section',{class:'cu-objekt-technik','aria-label':'Technik'},[
      zeile('Heizungsart',o.heizungsart),zeile('Warmwasser',o.warmwasser),zeile('Garagenart',o.garagenart),zeile('Müllgefäße',o.muellgefaesse),
    ]),
    el('section',{class:'cu-objekt-gebaeude','aria-label':'Gebäudedaten'},[
      zeile('Baujahr',o.baujahr),zeile('Gebäude',o.anzahl_gebaeude??0),zeile('Eingänge',o.anzahl_eingaenge??0),
      el('div',{class:'cu-objekt-verkauf'},[el('span',{text:'Verkauf '+(o.verkauf?'Ja':'Nein')}),el('span',{text:'Vermietung '+(o.vermietung?'Ja':'Nein')})]),
    ]),
  ]);
  const symbole = el('div', { class: 'hp-symbole hp-objekt-symbole' }, [
    el('button', { type: 'button', class: 'hp-symbol', title: 'Kontakte und Dokumente zum Objekt (Z.I.S)', 'aria-label': 'Z.I.S zum Objekt', onclick: () => geheZu(basis + '?zis=1') },
      [el('span', { 'aria-hidden': 'true', text: '☎' })]),
    el('button', { type: 'button', class: 'hp-symbol gesperrt', 'aria-disabled': 'true', title: 'Termine – folgt mit der Microsoft-365-Anbindung (Stufe 3)', 'aria-label': 'Termine (folgt mit Microsoft 365)',
      onclick: () => toast('Termine: folgt mit der Microsoft-365-Anbindung (Stufe 3).') }, [el('span', { class: 'hp-sieben', 'aria-hidden': 'true', text: '7' })]),
  ]);

  // ---- Rechte Knopfleiste (Reihenfolge wie im Original)
  const seite = seitenleiste([
    { text: 'Suche', titel: 'Anderes Objekt suchen (Taste s)', onclick: () => geheZu('#/objektliste') },
    { text: 'Z.I.S.', titel: 'Zentrales Informationssystem: Kontakte und Dokumente zum Objekt', onclick: () => geheZu(basis + '?zis=1') },
    { text: 'Drucke', titel: 'Objekt drucken', onclick: () => window.print() },
    { text: 'Bank', schnell: true, titel: 'Bankkonten des Objekts (Hausgeld-, Rücklagenkonto …)', onclick: () => objektBankDialog(o) },
    { text: 'PFkt.', titel: 'Allgemeine Personenfunktionen (Beirat, Hausmeister, Handwerker …)', onclick: () => objektPfktDialog(o) },
    { text: 'AbrArt', gesperrt: true, grund: 'Abrechnungsarten – folgen mit der Finanzbuchhaltung (FIBU).' },
    { text: 'Text', gesperrt: true, grund: 'Texte zum Objekt – ' + SPAETER_KNOPF },
    { text: 'Vschl.', titel: 'Verteilerschlüssel mit Anteilen je Einheit', onclick: () => verteilerDialog(o) },
    { text: 'Info', titel: 'Info / wichtige Hinweise zum Objekt', onclick: () => (schreiben ? objektInfoDialog(o) : toast(o.notizen || 'Keine Info hinterlegt.')) },
    { text: 'SEV', gesperrt: true, grund: 'Sondereigentumsverwaltung – ' + SPAETER_KNOPF },
    { text: 'Heizkosten', gesperrt: true, grund: 'Heizkosten – ' + SPAETER_KNOPF },
    { text: 'Verw. Verg.', gesperrt: true, grund: 'Verwaltervertrag/Verwaltervergütung – folgt mit der Finanzbuchhaltung (FIBU).' },
    { text: 'Folgeblatt', gesperrt: true, grund: 'Folgeblatt – ' + SPAETER_KNOPF },
    { abstand: true },
    { text: 'E-Mail-Gr', gesperrt: true, grund: 'E-Mail an Gruppen (z. B. alle Eigentümer) – folgt mit Microsoft 365 (Stufe 3).' },
    { text: 'Bild zum Objekt', titel: 'Foto ins Archiv laden (Kategorie „Foto/Bild")', onclick: () => archivUpload(fotoKtx, neuLaden), gesperrt: !schreiben },
    { text: 'Neues Objekt', titel: 'Neues Objekt anlegen (F4)', onclick: () => objektFormular(), gesperrt: !schreiben },
    { text: o.archiviert ? 'Reaktivieren' : 'Deaktivieren', titel: 'Objekt deaktivieren/reaktivieren (F3)', onclick: () => aktivUmschalten('Objekt', '/objekte/' + o.id, o), gesperrt: !schreiben },
    { text: 'Zähler', schnell: true, titel: 'Zählpunkte, Marktlokationsnummer, Geräte und Messwerte', onclick: () => geheZu('#/zaehler/' + o.id) },
  ], { zusatz: symbole });

  // ---- Reiter-Inhalte
  const inhalt = el('div');
  if (tab === 'allgemein' && params.get('zis') === '1') {
    zisAnsicht(null, inhalt, lauf, o);
  } else if (tab === 'allgemein' && params.get('fibu') === '1') {
    kontenrahmenAnsicht(o, inhalt, lauf, params.get('bj'));
  } else if (tab === 'allgemein') {
    // Verteilerschlüssel mit Suche und „+ Schlüssel"
    const vSuche = el('input', { type: 'search', class: 'cu-karten-suche', placeholder: 'Schlüssel oder Bezeichnung suchen …', 'aria-label': 'Verteilerschlüssel suchen' });
    const vBox = el('div', { class: 'hp-objekt-vschl' });
    const vZeichnen = () => {
      const q = vSuche.value.trim().toLowerCase();
      const liste = q ? verteiler.filter((v) => `${v.kuerzel} ${v.bezeichnung}`.toLowerCase().includes(q)) : verteiler;
      vBox.replaceChildren(raster([
        { label: 'Schlüssel', class: 'nowrap', render: (v) => v.kuerzel },
        ...verteilerSpalten.slice(1).filter(spalte=>spalte.label!=='Jahr'),
      ], liste, { onOpen: schreiben ? (v) => verteilerForm(o, v, neuLaden) : null, leer: q ? 'Kein Schlüssel gefunden.' : 'Noch keine Verteilerschlüssel.' }));
    };
    vSuche.addEventListener('input', vZeichnen);
    vZeichnen();
    inhalt.appendChild(el('section',{class:'cu-objekt-allgemein','aria-label':'Objekt Allgemein'},[
      el('div',{class:'cu-objekt-sachbearbeiter'},[
        zeile('Sachbearbeiter',o.sachbearbeiter_name),
        o.buero_kst?zeile('Büro-Kostenstelle',o.buero_kst):null,
      ]),
      el('div',{class:'cu-objekt-allgemein-spalten'},[
        el('section',{class:'cu-objekt-info','aria-label':'Info'},[
          el('div',{class:'cu-objekt-abschnitt-kopf'},[
            el('h2',{text:'Info'}),
            schreiben?el('button',{type:'button',class:'hp-mini',text:'Bearbeiten',title:'Info bearbeiten',onclick:()=>objektInfoDialog(o)}):null,
          ]),
          el('div',{class:'hp-notizen',text:o.notizen||''}),
        ]),
        el('section',{class:'cu-objekt-verteiler','aria-label':'Verteilerschlüssel'},[
          el('div',{class:'cu-objekt-abschnitt-kopf'},[
            el('h2',{text:'Verteilerschlüssel'+(verteiler[0]?.jahr?' · '+verteiler[0].jahr:'')}),
            el('div',{class:'cu-objekt-verteilersuche'},[vSuche]),
            schreiben?el('button',{type:'button',class:'hp-mini',text:'Neu',title:'Verteilerschlüssel anlegen',onclick:()=>verteilerForm(o,null,neuLaden)}):null,
          ]),
          vBox,
        ]),
      ]),
    ]));
  } else if (tab === 'korrespondenz') {
    archivListe(inhalt, { ktx: { typ: 'objekt', id: o.id }, kategorie: 'korrespondenz', lauf });
  } else if (tab === 'archiv') {
    archivListe(inhalt, { ktx: { typ: 'objekt', id: o.id }, kategorie: params.get('kategorie'), lauf });
  } else if (tab === 'kennzahlen') {
    try {
      const [kz, einheiten] = await Promise.all([API.get(`/objekte/${o.id}/kennzahlen`), API.get(`/objekte/${o.id}/einheiten?mitArchiv=1`)]);
      if (lauf !== S.lauf) return;
      const typen = Object.entries(kz.einheiten_je_typ).map(([t, n]) => `${n} ${L.einheitstyp[t] || t}`).join(', ');
      const rollen = Object.entries(kz.personen_je_rolle).map(([r, n]) => `${n} ${L.rolle[r] || r}`).join(', ');
      inhalt.appendChild(panel([
        ['Einheiten', String(kz.einheiten), typen],
        ['Fläche gesamt', `${zahlDe(kz.flaeche_qm, 2)} m²`],
        ['MEA-Summe', kz.mea_summe_anzeige || zahlDe(kz.mea_summe)],
        ['Personen aktuell', rollen || '–'],
        ['ohne Mieter', `${kz.ohne_mieter} Wohnung/Gewerbe`],
        ['Archiv-Einträge', String(kz.dokumente)],
      ], 'hp-kennzahlen'));
      inhalt.appendChild(abschnitt('Wohnungen / Einheiten (Strg+W)', raster([
        { label: 'Nr.', class: 'nowrap', render: (e) => e.nummer },
        { label: 'Bezeichnung', render: (e) => el('strong', { text: e.bezeichnung }) },
        { label: 'Typ', render: (e) => L.einheitstyp[e.einheitstyp] || e.einheitstyp },
        { label: 'Lage', render: (e) => e.lage },
        { label: 'Fläche', class: 'zahl nowrap', render: (e) => (e.flaeche_qm != null ? `${zahlDe(e.flaeche_qm, 2)} m²` : '') },
        { label: 'MEA', render: (e) => e.mea_anzeige || e.mea },
        { label: 'Status', render: (e) => (e.archiviert ? badge('deaktiviert', 'badge-inaktiv') : '') },
      ], einheiten, { onOpen: (e) => geheZu('#/einheiten/' + e.id), leer: 'Noch keine Einheiten angelegt.' }),
      [schreiben ? { text: 'Neu', titel: 'Neue Einheit anlegen', onclick: () => einheitFormular(o.id) } : null]));
    } catch (e) { fehler(e); }
  } else if (tab === 'vorgaenge' || tab === 'hwa') {
    vorgaengeListe(inhalt,{art:tab==='hwa'?'handwerker':'akte',kontext:{typ:'objekt',id:o.id},lauf});
  } else {
    const titel = { vorgaenge: 'Vorgänge/ Akten', hwa: 'HWA - Aufträge', energie: 'Energie' }[tab] || tab;
    inhalt.appendChild(abschnitt(titel, el('div', { class: 'hp-notizen', text: `${titel} folgen in einer späteren Ausbaustufe.` })));
  }

  const titel='Objekt anzeigen  Nr.: '+UI.objektNummer(o)+' '+String(o.bezeichnung||'').toUpperCase();
  seite.querySelector('.cu-hp-leisteninfo')?.appendChild(el('div',{text:'BJ: '+(verteiler[0]?.jahr||new Date().getFullYear())}));
  seite.querySelector('.cu-hp-leisteninfo')?.appendChild(symbole);
  zeigeAufDesktop(lauf,el('section',{class:'hp-maske cu-objekt-original','aria-label':titel},[
    el('header',{class:'cu-objekt-titelbar'},[
      el('h1',{text:titel}),
      el('a',{href:'#/objektliste',title:'Zur Objektliste','aria-label':'Objektmaske schließen',text:'×'}),
    ]),
    el('div',{class:'cu-objekt-arbeitsbereich'},[
      el('div',{class:'cu-objekt-haupt'},[
        oben,
        reiterLeiste([
          {key:'allgemein',label:'Allgemein'},
          {key:'korrespondenz',label:'Korrespondenz'},
          {key:'archiv',label:'Archiv'},
          {key:'vorgaenge',label:'Vorgänge/ Akten'},
          {key:'hwa',label:'HWA - Aufträge'},
          {key:'energie',label:'Energie'},
          {key:'kennzahlen',label:'Kennzahlen'},
        ],tab,basis),
        inhalt,
      ]),
      seite,
    ]),
  ]));
}

// ---------------------------------------------------------------------
//  Wohnungs-/Einheit-Maske
// ---------------------------------------------------------------------
async function einheitMaske(id, params) {
  const lauf = S.lauf;
  status('Lädt Einheit …');
  let e, o, zuord, pktos;
  try {
    e = await API.get('/einheiten/' + encodeURIComponent(id));
    [o, zuord, pktos] = await Promise.all([API.get('/objekte/' + e.objekt_id), API.get(`/einheiten/${e.id}/zuordnungen`), API.get(`/einheiten/${e.id}/personenkonten`)]);
  } catch (err) { fehler(err); return maskeFehlt('einheit', id); }
  if (lauf !== S.lauf) return;
  merke('einheit', e.id);

  const basis = '#/einheiten/' + e.id;
  // ältere Links (?tab=adressen/notizen) → Allgemein
  const tab = { adressen: 'allgemein', notizen: 'allgemein' }[params.get('tab')] || params.get('tab') || 'allgemein';
  const art = L.einheitstyp[e.einheitstyp] || 'Einheit';
  S.kontext = { typ: 'einheit', einheit: e, objekt: o, pktos, archivKtx: { typ: 'einheit', id: e.id, nummer: e.nummer }, bearbeiten: () => einheitFormular(e.objekt_id, e),
    erstellen: () => einheitFormular(e.objekt_id), loeschen: () => aktivUmschalten('Einheit', '/einheiten/' + e.id, e), suchen: () => geheZu('#/einheitenliste') };

  const oben = [
    panel([
      [art, e.nummer, el('strong', { text: e.bezeichnung })],
      ['Objekt', link(UI.objektNummer(o), '#/objekte/' + o.id), el('span', { class: 'hp-gross', text: o.bezeichnung })],
      ['Ort', o.plz, o.ort],
      ['VE / Lage', e.lage],
      ['Fläche', e.flaeche_qm != null ? `${String(e.flaeche_qm).replace('.', ',')} m²` : '', e.zimmer != null ? `${String(e.zimmer).replace('.', ',')} Zimmer` : ''],
      ['MEA', e.mea_anzeige || e.mea],
    ], 'hp-kopf-panel'),
    panel([
      ['angelegt', datumKurz(e.erstellt_am)],
      ['geändert', datumKurz(e.geaendert_am)],
      ['Objekttyp', o.objekttyp === 'HP' ? 'HP-Typ' : o.objekttyp === 'WEG' ? 'WEG' : 'Miete'],
      ['Status', e.archiviert ? badge('deaktiviert', 'badge-inaktiv') : badge('aktiv', 'badge-aktiv')],
    ], 'hp-info'),
  ];
  const seite = seitenleiste([
    { text: 'Bearbeiten', onclick: () => einheitFormular(e.objekt_id, e), gesperrt: schreibSperre() },
    { text: 'Zähler', schnell: true, titel: 'Zählerverwaltung dieser Wohnung', onclick: () => geheZu('#/zaehler/' + o.id + '?einheit=' + e.id) },
    { text: 'W.Soll', schnell: true, titel: 'Sollwerte (Hausgeld/Miete) des Personenkontos', onclick: () => wSollWohnung(pktos) },
    { text: 'Vschl.', titel: 'Verteilerschlüssel des Objekts', onclick: () => verteilerDialog(o) },
    { text: 'Zuordnung', schnell: true, titel: 'Eigentümer/Mieter zuordnen', onclick: () => zuordnungFormular({ einheit_id: e.id }, neuLaden), gesperrt: schreibSperre() },
    { text: 'Hochladen', schnell: true, titel: 'Dokument ins Archiv dieser Einheit', onclick: hochladenAktuell, gesperrt: schreibSperre() },
    { text: 'Archiv', onclick: () => geheZu(basis + '?tab=archiv') },
    { text: 'Objekt', titel: 'Zum Objekt (Strg+O)', onclick: () => geheZu('#/objekte/' + o.id) },
    { text: 'Suche', titel: 'Andere Wohnung suchen (Taste s)', onclick: () => geheZu('#/einheitenliste') },
    { gruppe: 'Bestand' },
    { text: e.archiviert ? 'Reaktivieren' : 'Deaktivieren', onclick: () => aktivUmschalten('Einheit', '/einheiten/' + e.id, e), gesperrt: schreibSperre() },
  ]);

  const inhalt = el('div');
  if (tab === 'allgemein') {
    // Wie HausPerfekt „Wohnung anzeigen": Eigentümer links, Mieter rechts – mit PKto und Sollwerten
    // Die Personenfunktion bestimmt Eigentümer/Mieter, unabhängig von einem Personenkonto.
    const aktuelle = zuord.filter(z=>z.aktiv&&!z.inaktiv&&['eigentuemer','mieter'].includes(z.rolle)).map(z=>{
      const konto=pktos.find(p=>String(p.zuordnung_id)===String(z.id));
      return {...konto,...z,zuordnung_id:z.id,pkto_id:konto?.pkto_id,pkto_nummer:konto?.pkto_nummer,soll:konto?.soll};
    });
    const kasten = (rolle, titel) => {
      const liste = aktuelle.filter((p) => p.rolle === rolle);
      return el('section', { class: 'cu-karte cu-pfkt-kasten', 'aria-label': titel }, [
        el('h2', { class: 'cu-karten-titel' }, [icon(rolle === 'eigentuemer' ? 'key' : 'house', 'cu-akzent'), el('span', { text: titel })]),
        ...(liste.length ? liste.map((p) => el('div', { class: 'cu-pfkt-person' }, [
          el('div', { class: 'cu-pfkt-kopf' }, [
            el('span', { class: 'nowrap', text: `${datumKurz(p.gueltig_von) || '…'} –${p.gueltig_bis ? ' ' + datumKurz(p.gueltig_bis) : ''}` }),
            link(suchname(p), '#/adressen/' + p.adresse_id),
            el('span', { class: 'hp-spacer' }),
            p.pkto_id ? el('a', { class: 'cu-pkto-link', href: '#/pkto/' + p.pkto_id, title: 'Personenkonto öffnen (Strg+P)', text: 'PKTO: ' + p.pkto_nummer })
              : el('span', { class: 'cu-kein-pkto' }, [document.createTextNode('*Kein PKto angelegt!'),
                darfSchreiben() ? el('button', { type: 'button', class: 'hp-mini', onclick: () => pktoAnlegen(p) }, [icon('plus', 'cu-klein'), el('span', { text: 'anlegen' })]) : null]),
          ]),
          p.pkto_id ? raster([
            { label: 'Gilt ab', class: 'nowrap', render: (x) => datumKurz(x.gilt_ab) },
            { label: 'Bezeichnung', render: (x) => x.bezeichnung },
            { label: 'Netto', class: 'zahl nowrap', render: (x) => zahlDe(x.netto, 2) },
            { label: 'Brutto', class: 'zahl nowrap', render: (x) => zahlDe(x.betrag, 2) },
          ], p.soll.aktuell, { leer: 'Keine Sollwerte – W.Soll', onOpen: darfSchreiben() ? () => wSollDialog(p.pkto_id) : null }) : null,
          p.pkto_id ? el('div', { class: 'cu-summe', text: `Gesamtsumme monatlich: ${zahlDe(p.soll.netto, 2)} netto · ${zahlDe(p.soll.betrag, 2)} brutto` }) : null,
        ])) : [el('div', { class: 'cu-leer' }, [el('span', { text: rolle === 'eigentuemer' ? 'Kein aktueller Eigentümer.' : 'Kein aktueller Mieter.' })])]),
      ]);
    };
    inhalt.appendChild(el('div', { class: 'cu-zweispaltig cu-pfkt-raster' }, [kasten('eigentuemer', 'Eigentümer'), kasten('mieter', 'Mieter')]));
    personenAbschnitte(zuord, { mitBezug: false, neu: () => zuordnungFormular({ einheit_id: e.id }, neuLaden) }).forEach((a) => inhalt.appendChild(a));
    if (e.notizen) inhalt.appendChild(abschnitt('Bemerkung / Wichtige Information', el('div', { class: 'hp-notizen', text: e.notizen })));
  } else if (tab === 'archiv' || tab === 'korrespondenz') {
    archivListe(inhalt, { ktx: { typ: 'einheit', id: e.id }, kategorie: tab === 'korrespondenz' ? 'korrespondenz' : params.get('kategorie'), lauf });
  } else {
    const titel = tab === 'vorgaenge' ? 'Vorgänge/ Akten' : 'Handwerkeraufträge';
    vorgaengeListe(inhalt,{art:tab==='handwerker'?'handwerker':'akte',kontext:{typ:'einheit',id:e.id},lauf});
  }

  zeigeAufDesktop(lauf, maskenFenster({
    titel: `${art} – ${e.nummer} ${e.bezeichnung} · ${o.bezeichnung}`,
    kopf: {
      brot: [{ text: 'Objekte', href: '#/objektliste' }, { text: `${UI.objektNummer(o)} ${o.bezeichnung}`, href: '#/objekte/' + o.id }, { text: e.nummer }],
      ueberschrift: e.bezeichnung || `${art} ${e.nummer}`,
      badge: art, badgeKlasse: 'cu-badge-neutral',
      unterzeile: [`${art} ${e.nummer}`, `Objekt ${UI.objektNummer(o)} ${o.bezeichnung}`, e.lage].filter(Boolean).join('  •  ') + (e.archiviert ? '  •  deaktiviert' : ''),
      knoepfe: [{ text: 'Personenkonto', icon: 'wallet', titel: 'Personenkonto der Wohnung (Strg+P)', onclick: () => pktoWahl(pktos, { einheit: e }) }],
    },
    inhalt: maskenRaster({
      oben, seite,
      unten: [reiterLeiste([
        { key: 'allgemein', label: 'Allgemein' },
        { key: 'korrespondenz', label: 'Korrespondenz' },
        { key: 'archiv', label: 'Archiv' },
        { key: 'vorgaenge', label: 'Vorgänge/ Akten' },
        { key: 'handwerker', label: 'Handwerkeraufträge' },
      ], tab, basis), inhalt],
    }),
  }));
}

// ---------------------------------------------------------------------
//  Personenkonto zur Wohnung (Strg+P in der Wohnung) – nach HausPerfekt
// ---------------------------------------------------------------------
const pktoRolle = (p) => (p.pfkt_bezeichnung ? `${p.pfkt_code} ${p.pfkt_bezeichnung}` : L.rolle[p.rolle] || p.rolle || 'HP-Konto ohne Funktionszuordnung');

/** Strg+P: Personenkonto passend zur aktuellen Maske öffnen. */
async function pktoSprung(k) {
  try {
    if (k.typ === 'pkto') { toast('Personenkonto ist bereits geöffnet.'); return; }
    if (k.typ === 'einheit') return pktoWahl(k.pktos || await API.get(`/einheiten/${k.einheit.id}/personenkonten`), { einheit: k.einheit });
    if (k.typ === 'adresse') return pktoWahl(await API.get(`/adressen/${k.adresse.id}/personenkonten`), {});
    if (k.typ === 'objekt') return pktoWahl(await API.get(`/objekte/${k.objekt.id}/personenkonten`), {});
    toast('Personenkonto: bitte zuerst eine Wohnung öffnen (Strg+W), dort Strg+P.');
  } catch (e) { fehler(e); }
}

/** Auswahl: ein Konto → direkt öffnen; mehrere → Liste; keins → Anlegen anbieten (nur aktuelle Eigentümer/Mieter). */
function pktoWahl(liste, { einheit } = {}) {
  const mitKonto = liste.filter((p) => p.pkto_id);
  const aktuellMit = mitKonto.filter((p) => p.aktiv);
  if (aktuellMit.length === 1 && (!einheit || !liste.some((p) => p.aktiv && p.mit_pkto && !p.pkto_id))) { geheZu('#/pkto/' + aktuellMit[0].pkto_id); return; }
  const kandidaten = liste.filter((p) => p.mit_pkto && (p.pkto_id || p.aktiv));
  if (!kandidaten.length) { toast(einheit ? 'In dieser Wohnung gibt es keinen Eigentümer oder Mieter – zuerst eine Personenfunktion anlegen.' : 'Keine Personenkonten vorhanden.'); return; }
  let m;
  const r = raster([
    { label: 'PKto-Nr', class: 'nowrap', render: (p) => (p.pkto_id ? el('strong', { text: p.pkto_nummer }) : el('span', { class: 'cu-kein-pkto', text: 'kein PKto' })) },
    { label: 'Funktion', render: (p) => pktoRolle(p) + (p.aktiv ? '' : ' (beendet)') },
    { label: 'Name', render: (p) => p.name },
    { label: 'Wohnung', class: 'nowrap', render: (p) => p.einheit_nummer },
    { label: 'Soll mtl.', class: 'zahl nowrap', render: (p) => (p.soll ? zahlDe(p.soll.betrag, 2) : '') },
  ], kandidaten, { onOpen: (p) => { m.close(); if (p.pkto_id) geheZu('#/pkto/' + p.pkto_id); else pktoAnlegen(p); } });
  m = modal({ titel: einheit ? `Personenkonto – Wohnung ${einheit.nummer}` : 'Personenkonto wählen', wide: true, inhalt: r,
    footer: (close) => [el('button', { text: 'Abbrechen', onclick: close })] });
  r.querySelector('tr.klick')?.focus();
}

async function pktoAnlegen(p) {
  if (!darfSchreiben()) { toast('Keine Schreibberechtigung.', 'error'); return; }
  let codes = [];
  try { codes = (await API.get('/pfkt-codes')).filter((c) => c.rolle === p.rolle); } catch (e) { fehler(e); return; }
  if (!p.pfkt_code && !codes.length) {
    toast(`Für „${L.rolle[p.rolle] || p.rolle}" ist noch kein Personenfunktions-Code angelegt (Einstellungen › Personenfunktionen).`, 'error');
    return;
  }
  let codeInput;
  formFenster({
    titel: `Personenkonto anlegen – ${pktoRolle(p)} ${p.name}`,
    felder: [
      { grid: 2, felder: [
        { name: 'pfkt_code', label: 'Personenfunktion', type: 'text', placeholder:'z. B. 002', value: p.pfkt_code || (codes.length === 1 ? codes[0].code : '') },
        { name: 'nummer', label: 'PKto-Nr. (leer = automatisch)', type: 'text', placeholder: 'Funktion + Wechsler + Einheit' },
      ] },
      { felder: [{ name: 'ref_nr', label: 'Ref.-Nr.' }] },
    ],
    nachAufbau:inputs=>{codeInput=inputs.pfkt_code;pfktCodeEingabe(codeInput,codes);},
    speichern: async (v) => { if(!codeInput.pfktPruefen()){codeInput.reportValidity();throw new Error('Bitte einen gültigen Personenfunktionscode eingeben.');}v.pfkt_code=codeInput.value;const k = await API.post('/personenkonten', { ...v, zuordnung_id: p.zuordnung_id }); setTimeout(() => geheZu('#/pkto/' + k.pkto_id), 0); return k; },
    danach: () => {},
  });
}

function wSollWohnung(pktos) {
  const et = pktos.filter((p) => p.aktiv && p.pkto_id);
  if (!et.length) { toast('Für die Sollwerte zuerst ein Personenkonto anlegen (Pers.-Kto).'); return; }
  if (et.length === 1) { wSollDialog(et[0].pkto_id); return; }
  pktoWahl(et, {});
}

function wSollForm(pktoId, s, danach) {
  formFenster({
    titel: s ? 'Sollwert ändern' : 'Neuer Sollwert',
    felder: [
      { grid: 2, felder: [
        { name: 'gilt_ab', label: 'Gilt ab', type: 'date', required: true, value: s?.gilt_ab || new Date().toISOString().slice(0, 8) + '01' },
        { name: 'bezeichnung', label: 'Bezeichnung', value: s?.bezeichnung || 'Hausgeld', vorschlaege: ['Hausgeld', 'Betriebsk.', 'Miete', 'Nebenkosten', 'Stellplatz'] },
      ] },
      { grid: 2, felder: [
        { name: 'netto', label: 'Netto (€)', value: s ? zahlDe(s.netto, 2) : '', placeholder: 'z. B. 440,00' },
        { name: 'betrag', label: 'Sollstellungsbetrag (€, leer = Netto)', value: s ? zahlDe(s.betrag, 2) : '' },
      ] },
    ],
    speichern: (v) => (s ? API.put('/pkto-sollwerte/' + s.id, v) : API.post(`/personenkonten/${pktoId}/sollwerte`, v)),
    loeschen: s ? () => API.del('/pkto-sollwerte/' + s.id) : null,
    loeschFrage: 'Diesen Sollwert löschen?',
    danach,
  });
}

/** W.Soll: Sollwerte des Personenkontos (Hausgeld als Gesamtbetrag), Verlauf mit „gilt ab". */
function wSollDialog(pktoId) {
  listenFenster({
    titel: 'W.Soll – Sollwerte des Personenkontos',
    neuText: 'Neuer Sollwert',
    neu: (zeichnen) => wSollForm(pktoId, null, zeichnen),
    laden: async (zeichnen) => {
      const p = await API.get('/personenkonten/' + pktoId);
      return el('div', {}, [
        el('p', { class: 'small muted', text: `PKto ${p.pkto_nummer} · ${p.name} · Wohnung ${p.einheit_nummer}. Hausgeld als Gesamtbetrag; aktuell gültig ist je Bezeichnung der jüngste Wert mit „gilt ab" bis heute.` }),
        raster([
          { label: 'Gilt ab', class: 'nowrap', render: (x) => datumKurz(x.gilt_ab) },
          { label: 'Bezeichnung', render: (x) => x.bezeichnung },
          { label: 'Netto', class: 'zahl nowrap', render: (x) => zahlDe(x.netto, 2) },
          { label: 'Sollstellungsbetrag', class: 'zahl nowrap', render: (x) => zahlDe(x.betrag, 2) },
          { label: 'Status', render: (x) => (p.soll.aktuell.some((a) => a.id === x.id) ? badge('aktuell', 'badge-aktiv') : x.gilt_ab > new Date().toISOString().slice(0, 10) ? badge('künftig', 'badge-kat') : badge('früher', 'badge-inaktiv')) },
        ], p.sollwerte, { onOpen: darfSchreiben() ? (x) => wSollForm(pktoId, x, zeichnen) : null, leer: 'Noch keine Sollwerte.' }),
        el('div', { class: 'cu-summe', text: `Gesamtsumme monatlich: ${zahlDe(p.soll.betrag, 2)} €` }),
      ]);
    },
  });
}

async function personenkontoMaske(id, params) {
  const lauf = S.lauf;
  status('Lädt Personenkonto …');
  let p;
  try { p = await API.get('/personenkonten/' + encodeURIComponent(id)); } catch (e) { fehler(e); return geheZu('#/'); }
  if (lauf !== S.lauf) return;
  const basis = '#/pkto/' + p.pkto_id;
  const tab = params.get('tab') || 'stammdaten';
  const schreiben = darfSchreiben();
  const a = p.adresse || {adresstyp:'person',nachname:p.kontoname||'Keine HP-Adresse zugeordnet',nummer:''};
  const whgNr = String(p.einheit_nummer || '').split('-').pop();
  const pktoFormular = () => formFenster({
    titel: `Personenkonto ${p.pkto_nummer} ändern`,
    felder: [
      { grid: 2, felder: [{ name: 'nummer', label: 'PKto-Nr.', value: p.pkto_nummer }, { name: 'ref_nr', label: 'Ref.-Nr.', value: p.ref_nr }] },
      { felder: [{ name: 'bemerkung', label: 'Bemerkung / Wichtige Informationen', type: 'textarea', value: p.bemerkung }] },
    ],
    speichern: (v) => API.put('/personenkonten/' + p.pkto_id, { ...v, sachbearbeiter_id: p.sachbearbeiter_id }),
    danach: neuLaden,
  });
  S.kontext = {
    typ: 'pkto', pkto: p, adresse: a.id?a:null, objekt: { id: p.objekt_id }, einheit: { id: p.einheit_id }, zurueck: p.einheit_id?'#/einheiten/'+p.einheit_id:'#/objekte/'+p.objekt_id,
    archivKtx: a.id?{ typ: 'adresse', id: a.id, nummer: a.nummer }:{typ:'objekt',id:p.objekt_id}, bearbeiten: pktoFormular,
    suchen: async () => { try { pktoWahl(await API.get(`/objekte/${p.objekt_id}/personenkonten`), {}); } catch (e) { fehler(e); } },
    erstellen: async () => { try { pktoWahl(await API.get(`/einheiten/${p.einheit_id}/personenkonten`), { einheit: { id: p.einheit_id, nummer: p.einheit_nummer } }); } catch (e) { fehler(e); } },
  };
  const FOLGT = 'Folgt mit der Buchhaltung (Buchungen).';
  const zeile = (l, w) => el('div', { class: 'cu-kv' }, [el('span', { class: 'cu-kv-l', text: l }), el('span', { class: 'cu-kv-w', text: w == null || w === '' ? '—' : String(w) })]);
  const oben = [el('section', { class: 'cu-karte', 'aria-label': 'Personenkonto' }, [
    el('h2', { class: 'cu-karten-titel' }, [icon('wallet', 'cu-akzent'), el('span', { text: 'Personenkonto' })]),
    el('div', { class: 'cu-spalten' }, [
      el('div', { class: 'cu-spalte' }, [zeile('PKto-Nr', `${p.pkto_nummer}  ${suchname(a)}`), zeile('Ref.-Nr', p.ref_nr || '0'),
        zeile('PFkt.', `${whgNr} ${pktoRolle(p)}  ·  ${datumKurz(p.gueltig_von) || '…'} –${p.gueltig_bis ? ' ' + datumKurz(p.gueltig_bis) : ''}`)]),
      el('div', { class: 'cu-spalte' }, [zeile('Objekt', `${p.einheit_nummer}, ${String(p.objekt_bezeichnung || '').toUpperCase()}`), zeile('SB', p.sb_kuerzel ? String(p.sb_kuerzel).toUpperCase() : ''),
        el('div', { class: 'cu-kv' }, [el('span', { class: 'cu-kv-l', text: 'Offene Posten' }), el('strong', { class: 'cu-kv-w', text: p.offene_posten===null?'Nicht importiert':`${zahlDe(p.offene_posten, 2)} EUR` })])]),
    ]),
  ])];
  const seite = seitenleiste([
    { text: 'Suche', titel: 'Anderes Personenkonto im Objekt (Taste s)', onclick: () => S.kontext.suchen() },
    { text: 'Bank', schnell: true, titel: 'Bankverbindung / SEPA-Mandat der Adresse', onclick: () => bankDialog(a), gesperrt:!a.id },
    { text: 'W.Soll', schnell: true, titel: 'Sollwerte (Hausgeld/Miete)', onclick: () => wSollDialog(p.pkto_id) },
    { text: 'Telefon', schnell: true, titel: 'Telefonnummer ergänzen', onclick: () => telefonDialog(a.id), gesperrt: !schreiben||!a.id },
    { text: 'Vschl.', schnell: true, titel: 'Verteilerschlüssel des Objekts', onclick: () => verteilerDialog({ id: p.objekt_id, nummer: p.objekt_nummer, bezeichnung: p.objekt_bezeichnung }) },
    { text: 'KAusz.', schnell: true, gesperrt: true, grund: 'Kontoauszug – ' + FOLGT },
    { text: 'Kaution', gesperrt: true, grund: 'Kautionsverwaltung – ' + FOLGT },
    { text: 'Mahnsperre', gesperrt: true, grund: 'Mahnsperre – folgt mit dem Mahnwesen.' },
    { text: 'Rechtsfall', gesperrt: true, grund: 'Rechtsfall – folgt mit dem Mahnwesen.' },
    { text: 'AbrKto', gesperrt: true, grund: 'Abrechnungskonto – ' + FOLGT },
    { text: 'Index', gesperrt: true, grund: 'Indexmiete – folgt mit der Mietanpassung.' },
    { text: 'Info', titel: 'Bemerkung / Wichtige Informationen', onclick: pktoFormular, gesperrt: !schreiben },
    { text: 'Adresse', titel: 'Adresse öffnen (Strg+A)', onclick: () => geheZu('#/adressen/' + a.id),gesperrt:!a.id },
    { text: 'Wohnung', titel: 'Zurück zur Wohnung (Esc)', onclick: () => geheZu('#/einheiten/' + p.einheit_id),gesperrt:!p.einheit_id },
  ]);
  const inhalt = el('div');
  if (tab === 'stammdaten') {
    const tel = raster([{ label: 'Telefon', render: (t) => t.art }, { label: 'Telefon-Nummer', class: 'nowrap', render: (t) => link(t.nummer, telHref(t.nummer)) }], p.telefone, { leer: 'Keine Telefonnummer.' });
    const b = p.bank;
    inhalt.appendChild(el('div', { class: 'cu-zweispaltig' }, [
      el('div', {}, [
        el('section', { class: 'cu-karte', 'aria-label': 'Person' }, [
          el('h2', { class: 'cu-karten-titel' }, [icon('user', 'cu-akzent'), el('span', { text: 'Stammdaten' })]),
          zeile('Objekt-Nr.', `${p.objekt_nummer}  ${String(p.objekt_bezeichnung || '').toUpperCase()}`), zeile('Wohnungs-Nr.', `${whgNr}  ${p.einheit_bezeichnung || ''}`),
          a.adresstyp === 'firma' ? zeile('Firma', a.firmenname) : null,
          a.adresstyp === 'firma' ? null : zeile('Anrede', a.anrede), a.adresstyp === 'firma' ? null : zeile('Vorname', a.vorname), a.adresstyp === 'firma' ? null : zeile('Name', a.nachname),
          zeile('Straße', a.strasse), zeile('PLZ Ort', [a.plz, a.ort].filter(Boolean).join(' ')),
        ]),
        el('section', { class: 'cu-karte cu-abstand', 'aria-label': 'Bankverbindung' }, [
          el('h2', { class: 'cu-karten-titel' }, [icon('bank', 'cu-akzent'), el('span', { text: 'Bankverbindung / SEPA' })]),
          ...(b ? [zeile('IBAN', ibanFormat(b.iban)), zeile('BIC', b.bic), zeile('Bank', b.bankname), zeile('Ermächtigung ab', datumKurz(b.mandat_datum)), zeile('Inhaber', b.kontoinhaber), zeile('Mandat', b.mandatsreferenz + (b.mandat_aktiv ? '' : ' (Lastschrift nicht erlaubt)'))]
            : [el('div', { class: 'cu-leer' }, [el('span', { text: 'Keine Bankverbindung – Knopf „Bank".' })])]),
        ]),
        el('section', { class: 'cu-karte cu-abstand', 'aria-label': 'Telefon' }, [el('h2', { class: 'cu-karten-titel' }, [icon('phone', 'cu-akzent'), el('span', { text: 'Telefon' })]), tel]),
      ]),
      el('div', {}, [
        el('section', { class: 'cu-karte', 'aria-label': 'Wohnung' }, [
          el('h2', { class: 'cu-karten-titel' }, [icon('house', 'cu-akzent'), el('span', { text: 'Wohnung' })]),
          zeile('Whg.', `${whgNr}  ${p.lage || ''}`), zeile('WG m² Fläche', p.flaeche_qm != null ? zahlDe(p.flaeche_qm, 2) : ''),
          raster([
            { label: 'VSchl.', class: 'nowrap', render: (v) => v.kuerzel },
            { label: 'Jahr',render:v=>v.jahr||'—' },
            { label: 'Kontoanteil', class: 'zahl nowrap', render: (v) => v.jahr?(v.anteil??'—'):zahlDe(v.anteil) },
            { label:'Einheitenanteil',render:v=>v.einheitsanteil??'—' },
            { label: 'Schlüsseltext', render: (v) => v.bezeichnung },
          ], p.verteiler, { leer: 'Keine Verteilerschlüssel-Anteile für diese Wohnung.' }),
        ]),
        el('section', { class: 'cu-karte cu-abstand', 'aria-label': 'Sollstellung' }, [
          el('div', { class: 'cu-karten-kopf' }, [el('h2', { class: 'cu-karten-titel' }, [icon('calendar', 'cu-akzent'), el('span', { text: 'Sollstellung' })]), el('span', { class: 'hp-spacer' }),
            el('button', { type: 'button', class: 'hp-mini', onclick: () => wSollDialog(p.pkto_id) }, [el('span', { text: 'W.Soll' })])]),
          p.hp_importiert?el('p',{text:'Sollwerte und offene Posten werden in diesem Stammdatenimport nicht übernommen.'}):null,
          raster([
            { label: 'Gilt ab', class: 'nowrap', render: (x) => datumKurz(x.gilt_ab) },
            { label: 'Netto', class: 'zahl nowrap', render: (x) => zahlDe(x.netto, 2) },
            { label: 'Sollstellungsbetrag', class: 'zahl nowrap', render: (x) => zahlDe(x.betrag, 2) },
            { label: 'Bezeichnung', render: (x) => x.bezeichnung },
          ], p.soll.aktuell, { leer: 'Keine aktuellen Sollwerte.', onOpen: schreiben ? () => wSollDialog(p.pkto_id) : null }),
          p.hp_importiert&&!p.soll.aktuell.length?el('p',{text:'Keine Sollwerte importiert.'}):el('div', { class: 'cu-summe' }, [el('div', { text: `Summe Sollstellungsbeträge monatlich: ${zahlDe(p.soll.betrag, 2)}` }), el('div', { text: `Summe Netto-Beträge monatlich: ${zahlDe(p.soll.netto, 2)}` })]),
        ]),
      ]),
    ]));
    inhalt.appendChild(abschnitt('Bemerkung / Wichtige Informationen', el('div', { class: 'hp-notizen', text: p.bemerkung || '' }), [schreiben ? { text: 'Bearbeiten', pfeil: false, onclick: pktoFormular } : null]));
  } else if (!a.id&&['korrespondenz','archiv','zis','wiedervorlage'].includes(tab)) {
    inhalt.append(el('p',{text:'Diesem HP-Konto ist keine Adresse zugeordnet.'}));
  } else if (tab === 'korrespondenz' || tab === 'archiv') {
    archivListe(inhalt, { ktx: { typ: 'adresse', id: a.id }, kategorie: tab === 'korrespondenz' ? 'korrespondenz' : params.get('kategorie'), lauf });
  } else if (tab === 'zis') {
    zisAnsicht(a, inhalt, lauf);
  } else if (tab === 'wiedervorlage') {
    inhalt.appendChild(abschnitt('Wiedervorlage', el('div', { class: 'hp-notizen' }, [document.createTextNode('Wiedervorlagen werden zur Adresse geführt. '),
      el('button', { type: 'button', class: 'hp-mini', onclick: () => wiedervorlagenDialog(a) }, [el('span', { text: 'Wiedervorlagen öffnen' })])])));
  } else {
    const titel = { auszug: 'PKto.-Auszug', vorgaenge: 'Vorgänge', kaution: 'Kaution', opos: 'OPOS / RF' }[tab] || tab;
    inhalt.appendChild(abschnitt(titel, el('div', { class: 'hp-notizen', text: `${titel}: ${FOLGT}` })));
  }
  zeigeAufDesktop(lauf, maskenFenster({
    titel: `Personenkonto zur Wohnung  Nr.: ${p.pkto_nummer} ${suchname(a)}`,
    kopf: {
      brot: [{ text: 'Objekte', href: '#/objektliste' }, { text: p.objekt_nummer, href: '#/objekte/' + p.objekt_id }, { text: p.einheit_nummer?'Whg '+p.einheit_nummer:'Ohne Einheit', href: p.einheit_id?'#/einheiten/'+p.einheit_id:undefined }, { text: 'PKto ' + p.pkto_nummer }],
      ueberschrift: a.anzeigename || suchname(a), badge: `PKto ${p.pkto_nummer}`, badgeKlasse: 'cu-badge-neutral',
      unterzeile: `${pktoRolle(p)} · ${p.einheit_nummer?'Einheit '+p.einheit_nummer:'Ohne Einheit'} · ${p.objekt_bezeichnung}  •  Offene Posten ${p.offene_posten===null?'nicht importiert':zahlDe(p.offene_posten, 2)+' EUR'}`,
    },
    inhalt: maskenRaster({
      oben, seite,
      unten: [reiterLeiste([
        { key: 'stammdaten', label: 'Stammdaten' }, { key: 'auszug', label: 'PKto.-Auszug' }, { key: 'wiedervorlage', label: 'Wiedervorlage' },
        { key: 'korrespondenz', label: 'Korrespondenz' }, { key: 'archiv', label: 'Archiv' }, { key: 'vorgaenge', label: 'Vorgänge' },
        { key: 'kaution', label: 'Kaution' }, { key: 'opos', label: 'OPOS / RF' }, { key: 'zis', label: 'Z.I.S' },
      ], tab, basis), inhalt],
    }),
  }));
}

// ---------------------------------------------------------------------
//  Adress-Maske („Adresse zeigen") – nach Vorbild HausPerfekt
// ---------------------------------------------------------------------
const LAENDER_KZ = {
  deutschland: 'DE', 'österreich': 'AT', oesterreich: 'AT', schweiz: 'CH', niederlande: 'NL', belgien: 'BE',
  frankreich: 'FR', italien: 'IT', spanien: 'ES', polen: 'PL', luxemburg: 'LU', 'dänemark': 'DK', tschechien: 'CZ',
};

/** Briefanschrift wie in HausPerfekt: „Herrn / Luka Vujica / Alte Landstr. 42 / DE-51373 Leverkusen". */
function anschriftZeilen(a) {
  const z = [];
  if (a.adresstyp === 'firma') {
    z.push('Firma', a.firmenname);
    if (a.ansprechpartner) z.push('z. Hd. ' + a.ansprechpartner);
  } else {
    z.push({ Herr: 'Herrn', Frau: 'Frau' }[a.anrede] || '');
    z.push([a.vorname, a.nachname].filter(Boolean).join(' '));
  }
  if (a.zusatz) z.splice(a.adresstyp === 'firma' ? 2 : z.length, 0, a.zusatz);
  z.push(a.strasse);
  const kz = LAENDER_KZ[String(a.land || '').trim().toLowerCase()];
  const ort = [a.plz, a.ort].filter(Boolean).join(' ');
  if (ort) z.push(kz ? `${kz}-${ort}` : ort);
  if (!kz && a.land) z.push(String(a.land).toUpperCase());
  return z.filter(Boolean).filter((text,i,alle)=>!i||String(text).trim().toLocaleLowerCase('de')!==String(alle[i-1]).trim().toLocaleLowerCase('de'));
}

function suchname(a) {
  if (a.adresstyp === 'firma') return String(a.firmenname || '').toUpperCase();
  return [a.nachname, a.vorname].filter(Boolean).join(', ').toUpperCase();
}

const haken = (wert, label) => el('input', { type: 'checkbox', disabled: '', checked: wert ? '' : null, 'aria-label': label });
const webHref = (x) => (/^https?:\/\//i.test(x) ? x : 'https://' + x);

/** Symbole wie in HausPerfekt: Kalender = Wiedervorlagen, Telefon = Kontakte, 7 = Termine, Ampel. */
function adressSymbole(a, akte) {
  const wv = akte.wiedervorlagen;
  const kz = akte.kontakte;
  const zahl = (n) => (n ? el('span', { class: 'hp-symbol-zahl', text: String(n) }) : null);
  const ampelText = a.ampel ? `${AMPEL_INFO[a.ampel].text}${a.ampel_notiz ? ' – ' + a.ampel_notiz : ''}` : 'Ampel: keine Einschätzung';
  return [
    el('button', {
      type: 'button', class: 'hp-symbol' + (wv.ueberfaellig ? ' warn' : ''),
      title: `Wiedervorlagen: ${wv.offen} offen${wv.ueberfaellig ? `, ${wv.ueberfaellig} überfällig` : ''}`,
      'aria-label': `Wiedervorlagen, ${wv.offen} offen`, onclick: () => wiedervorlagenDialog(a),
    }, [el('span', { 'aria-hidden': 'true', text: '📅' }), zahl(wv.offen)]),
    el('button', {
      type: 'button', class: 'hp-symbol',
      title: `Telefoneingänge / Kontakte: ${kz.anzahl} erfasst${kz.letzter ? `, zuletzt ${zeitAnzeige(kz.letzter)}` : ''}`,
      'aria-label': `Telefoneingänge und Kontakte, ${kz.anzahl} erfasst`, onclick: () => kontakteDialog(a),
    }, [el('span', { 'aria-hidden': 'true', text: '☎' }), zahl(kz.anzahl)]),
    el('button', {
      type: 'button', class: 'hp-symbol gesperrt', 'aria-disabled': 'true',
      title: 'Termine – folgt mit der Microsoft-365-Anbindung (Stufe 3)', 'aria-label': 'Termine (folgt mit Microsoft 365)',
      onclick: () => toast('Termine: folgt mit der Microsoft-365-Anbindung (Stufe 3).'),
    }, [el('span', { class: 'hp-sieben', 'aria-hidden': 'true', text: '7' })]),
    el('button', {
      type: 'button', class: 'hp-symbol', title: ampelText, 'aria-label': ampelText, onclick: () => ampelDialog(a),
    }, [el('span', { class: 'hp-ampel ' + (a.ampel || 'keine'), 'aria-hidden': 'true' }, [el('i', { class: 'r' }), el('i', { class: 'g' }), el('i', { class: 'n' })])]),
  ];
}

// ---------------------------------------------------------------------
//  Z.I.S – Zentrales Informationssystem (im Reiter „Allgemein" der Adresse)
// ---------------------------------------------------------------------
const ZIS_ART = { TEL: 'Anruf', MAIL: 'E-Mail', GSP: 'Persönliches Gespräch', BRF: 'Brief', NOT: 'Notiz', SON: 'Sonstiges', DOK: 'Dokument (Archiv)', WV: 'Wiedervorlage' };
const zisDatum = (z) => (z ? `${z.slice(8, 10)}.${z.slice(5, 7)}.${z.slice(2, 4)}` : '');
const zisZeit = (z) => (z ? z.slice(11, 16) : '');

/** Z.I.S zur Adresse (a) oder – mit objekt – zum Objekt (Kontakte/Dokumente des Objekts und seiner Einheiten). */
function zisAnsicht(a, ziel, lauf, objekt = null) {
  const basis = objekt ? '#/objekte/' + objekt.id : '#/adressen/' + a.id;
  const url = objekt ? `/objekte/${objekt.id}/zis` : `/adressen/${a.id}/zis`;
  const nr = objekt ? objekt.nummer : a.nummer;
  const name = objekt ? objekt.bezeichnung : a.anzeigename;
  const zuWas = objekt ? 'zum Objekt' : 'zur Adresse';
  let daten = [];
  let gewaehlt = null;
  const sucheEl = el('input', { type: 'search', class: 'hp-zis-suche', placeholder: 'Volltextsuche …', 'aria-label': 'Volltextsuche im ZIS' });
  const listeBox = el('div');
  const detailBox = el('div');

  const feld = (wert, cls) => el('span', { class: 'hp-zis-feld ' + (cls || ''), text: wert == null ? '' : String(wert) });
  const zeichneDetail = () => {
    const e = gewaehlt || {};
    detailBox.replaceChildren(el('fieldset', { class: 'hp-zis-zusatz' }, [
      el('legend', { text: 'Zusatzinformationen' }),
      el('div', { class: 'hp-zis-raster' }, [
        el('span', { class: 'hp-blau', text: 'Objekt:' }), el('span', {}, [feld(e.objekt_nummer, 'kurz'), document.createTextNode(' ' + (e.objekt_bezeichnung || ''))]),
        el('span', { class: 'hp-blau', text: 'HWA:' }), feld('', 'kurz'),
        el('span', { class: 'hp-blau', text: 'Wohnung:' }), el('span', {}, [feld(e.einheit_nummer, 'kurz'), document.createTextNode(' ' + (e.einheit_bezeichnung || ''))]),
        el('span', { class: 'hp-blau', text: 'Fa/SB:' }), feld(e.sb ? String(e.sb).toUpperCase() : '', 'kurz'),
        el('span', { class: 'hp-blau', text: e.kategorie ? 'Kategorie:' : 'Akte:' }), el('span', {}, [
          feld(e.kategorie ? (L.kategorie[e.kategorie] || e.kategorie) : ''),
          el('label', { class: 'check-inline hp-zis-intern' }, [el('input', { type: 'checkbox', disabled: '', checked: e.intern ? '' : null }), document.createTextNode(' interner Eintrag')]),
        ]),
        el('span', { class: 'hp-blau', text: 'Min:' }), feld(e.minuten, 'kurz'),
      ]),
      el('div', { class: 'hp-zis-text', 'aria-label': 'Eintrag', text: gewaehlt ? [e.text, e.notiz && !String(e.text).includes(e.notiz) ? e.notiz : ''].filter(Boolean).join('\n\n') : 'Kein Eintrag ausgewählt.' }),
      gewaehlt ? el('button', { type: 'button', class: 'hp-mini', text: 'Eintrag öffnen ➠', onclick: () => zisOeffnen(gewaehlt) }) : null,
    ]));
  };

  const markieren = () => {
    listeBox.querySelectorAll('tr.klick').forEach((tr) => tr.classList.toggle('hp-zis-aktiv', daten[Number(tr.dataset.i)] === gewaehlt));
  };
  const zeichneListe = () => {
    const r = raster([
      { label: 'Datum', class: 'nowrap', render: (e) => zisDatum(e.zeitpunkt) },
      { label: 'Zeit', class: 'nowrap', render: (e) => zisZeit(e.zeitpunkt) },
      { label: 'Art', class: 'nowrap', render: (e) => el('span', { title: ZIS_ART[e.art] || e.art, text: e.art }) },
      { label: '', render: (e) => el('span', { class: 'hp-zis-eintrag', text: (e.intern ? '🔒 ' : '') + e.text }) },
    ], daten, { onOpen: (e) => { gewaehlt = e; markieren(); zeichneDetail(); }, leer: 'Keine Eintragungen vorhanden.', mindestZeilen: 4 });
    r.querySelectorAll('tbody tr.klick').forEach((tr, i) => { tr.dataset.i = String(i); });
    listeBox.replaceChildren(r);
    markieren();
  };
  const laden = async () => {
    try {
      const r = await API.get(url + API.qs({ suche: sucheEl.value }));
      if (lauf !== S.lauf) return;
      daten = r.eintraege;
      gewaehlt = daten.includes(gewaehlt) ? gewaehlt : (daten.find((x) => gewaehlt && x.quelle === gewaehlt.quelle && x.id === gewaehlt.id) || daten[0] || null);
      zeichneListe();
      zeichneDetail();
      status(`ZIS: ${r.gesamt} Eintragung(en)`);
    } catch (e) { fehler(e); }
  };
  sucheEl.addEventListener('input', debounce(laden, 300));

  const zisOeffnen = async (e) => {
    if(e.quelle==='vorgang')return geheZu('#/vorgaenge/'+e.id);
    if(e.quelle==='hp_dokument')return dmsArchivOeffnen({titel:e.text,hp:e.hp});
    if (e.quelle === 'dokument') return archivBearbeiten(e.id, laden);
    if (e.quelle === 'wiedervorlage') return wiedervorlagenDialog(a);
    const adr = objekt ? await API.get('/adressen/' + e.adresse_id) : a;
    const k = (await API.get(`/adressen/${adr.id}/kontakte`)).find((x) => x.id === e.id);
    if (k && darfSchreiben()) kontaktForm(adr, k, laden);
  };
  const eintragDrucken = () => {
    if (!gewaehlt) { toast('Bitte zuerst einen Eintrag auswählen.'); return; }
    const e = gewaehlt;
    druckeBereich(el('div', {}, [
      el('h2', { text: `ZIS – ${nr} ${name}` }),
      el('p', { text: `${zisDatum(e.zeitpunkt)} ${zisZeit(e.zeitpunkt)} · ${ZIS_ART[e.art] || e.art}${e.sb ? ' · SB ' + String(e.sb).toUpperCase() : ''}${e.minuten != null ? ' · ' + e.minuten + ' Min.' : ''}${e.intern ? ' · intern' : ''}` }),
      e.objekt_nummer ? el('p', { text: `Objekt ${UI.objektNummer(e.objekt_nummer)} ${e.objekt_bezeichnung || ''}${e.einheit_nummer ? ` · Wohnung ${e.einheit_nummer} ${e.einheit_bezeichnung || ''}` : ''}` }) : null,
      el('p', { class: 'hp-umbruch', text: [e.text, e.notiz].filter(Boolean).join('\n\n') }),
    ]));
  };
  const listeDrucken = () => {
    druckeBereich(el('div', {}, [
      el('h2', { text: `ZIS – alle Eintragungen ${zuWas} Nr. ${nr} ${name}` }),
      el('table', { class: 'hp-tabelle' }, [
        el('thead', {}, [el('tr', {}, ['Datum', 'Zeit', 'Art', 'Eintrag', 'SB'].map((t) => el('th', { text: t })))]),
        el('tbody', {}, daten.map((e) => el('tr', {}, [zisDatum(e.zeitpunkt), zisZeit(e.zeitpunkt), e.art, (e.intern ? '[intern] ' : '') + e.text, e.sb ? String(e.sb).toUpperCase() : ''].map((t) => el('td', { text: t }))))),
      ]),
    ]));
  };

  ziel.append(
    el('div', { class: 'hp-blau small', text: objekt ? 'ZIS Objekt' : 'ZIS Adresse' }),
    el('div', { class: 'hp-zis-kopf' }, [
      el('span', { class: 'hp-blau', text: `Angezeigt werden alle Eintragungen ${zuWas} Nr.:` }),
      el('strong', { text: `${nr}  ${objekt ? String(objekt.bezeichnung || '').toUpperCase() : suchname(a)}` }),
      sucheEl,
      darfSchreiben() && !objekt ? el('button', { type: 'button', class: 'hp-mini hp-pfeil', title: 'Neuer Eintrag (Anruf, E-Mail, Gespräch, Notiz …)', 'aria-label': 'Neuer Eintrag', text: '➠', onclick: () => kontaktForm(a, null, laden) }) : null,
    ]),
    el('div', { class: 'hp-abschnitt' }, [listeBox]),
    detailBox,
    el('div', { class: 'hp-zis-knoepfe' }, [
      el('button', { type: 'button', text: 'Volltextsuche', onclick: () => { sucheEl.focus(); sucheEl.select(); } }),
      el('button', { type: 'button', text: 'DirektDruck', title: 'Markierten Eintrag drucken', onclick: eintragDrucken }),
      el('button', { type: 'button', class: 'gesperrt', 'aria-disabled': 'true', text: 'M.aufwand', title: 'Mehraufwand erfassen – folgt', onclick: () => toast('M.aufwand: folgt in einer späteren Ausbaustufe.') }),
      el('button', { type: 'button', text: 'Drucken', title: 'Alle angezeigten Eintragungen drucken', onclick: listeDrucken }),
      el('button', { type: 'button', class: 'btn-primary', text: 'Ok', onclick: () => geheZu(basis) }),
      el('button', { type: 'button', text: 'Abbrechen', onclick: () => geheZu(basis) }),
    ]),
  );
  laden();
}

/** Gelbes Post-Symbol: Portooptimierung (Post / E-Mail / beides). */
function versandSymbol(a, v) {
  const abw = v.arten.filter((x) => x.kanal).length;
  const titel = `Versand: ${VERSAND[v.standard]}${abw ? `, ${abw} Abweichung(en)` : ''}${(v.standard !== 'post' && !v.email) ? ' – keine E-Mail-Adresse hinterlegt!' : ''}`;
  return el('button', { type: 'button', class: 'hp-symbol hp-post' + (v.standard !== 'post' && !v.email ? ' warn' : ''), title: titel, 'aria-label': 'Versandoptionen (Portooptimierung). ' + titel, onclick: () => versandDialog(a, v) },
    [el('span', { class: 'hp-post-icon', 'aria-hidden': 'true', text: v.standard === 'post' ? '✉' : v.standard === 'email' ? '@' : '✉@' })]);
}

const ADRESS_SORTIERUNG={nummer:'Adressnummer',name:'Name / Firma',plz:'PLZ',ort:'Ort',strasse:'Straße'};
function adressSortierung() {
  try{const s=JSON.parse(localStorage.getItem('hp.adressSortierung.'+S.benutzer?.id));if(s&&Object.hasOwn(ADRESS_SORTIERUNG,s.sort)&&['asc','desc'].includes(s.richtung))return s;}catch{}
  return {sort:'nummer',richtung:'asc'};
}
async function adressBlaettern(richtung) {
  const k=S.kontext,lauf=S.lauf;if(k.typ!=='adresse'||k.blaettert)return;
  const t=S.trefferliste;
  if(t?.basis==='#/adressen/'&&t.ids?.some(id=>String(id)===String(k.adresse.id))){
    const i=t.ids.findIndex(id=>String(id)===String(k.adresse.id));
    const n={erster:0,letzter:t.ids.length-1,vorheriger:i-1,naechster:i+1}[richtung];
    if(n<0||n>=t.ids.length){toast('Rand der Adressauswahl erreicht.');return;}
    geheZu(t.basis+t.ids[n]);return;
  }
  k.blaettert=true;
  try{const n=await API.get('/adressen/navigation'+API.qs({id:k.adresse.id,...adressSortierung()}));
    if(S.kontext!==k||S.lauf!==lauf)return;
    if(n?.[richtung]&&String(n[richtung])!==String(k.adresse.id))geheZu('#/adressen/'+n[richtung]);
    else toast('Rand des Adressbestands erreicht.');
  }catch(e){if(S.kontext===k)fehler(e);}finally{k.blaettert=false;}
}
function adressSortierDialog(auswahl) {
  const lokal=typeof auswahl?.anwenden==='function';
  const s=lokal?auswahl:adressSortierung(),{form,werte}=formular([{grid:2,felder:[
    {name:'sort',label:'Sortierschlüssel',type:'select',value:s.sort,options:Object.entries(ADRESS_SORTIERUNG).map(([value,label])=>({value,label}))},
    {name:'richtung',label:'Reihenfolge',type:'select',value:s.richtung,options:[{value:'asc',label:'Aufsteigend'},{value:'desc',label:'Absteigend'}]},
  ]}]);
  form.append(el('p',{class:'small muted',text:lokal?'Sortiert die gefilterte Adressauswahl.':'Gilt für das Blättern durch den gesamten Adressbestand. Eine bisherige Suchauswahl wird aufgehoben.'}));
  modal({titel:'Sortierschlüssel – Adressen',inhalt:form,footer:close=>[
    el('button',{text:'Abbrechen',onclick:close}),el('button',{class:'btn-primary',text:'Übernehmen',onclick:()=>{
      const v=werte();if(lokal){close();auswahl.anwenden(v);return;}
      try{localStorage.setItem('hp.adressSortierung.'+S.benutzer?.id,JSON.stringify(v));}catch{}
      S.trefferliste=null;close();status('Adressen sortiert nach '+ADRESS_SORTIERUNG[v.sort]);
    }}),
  ]});form.addEventListener('submit',ev=>ev.preventDefault());
}

async function adresseMaske(id, params) {
  const lauf = S.lauf;
  status('Lädt Adresse …');
  let a, zuord, kom, akte, versand;
  try {
    a = await API.get('/adressen/' + encodeURIComponent(id));
    [zuord, kom, akte, versand] = await Promise.all([
      API.get(`/adressen/${a.id}/zuordnungen`), API.get(`/adressen/${a.id}/kommunikation`), API.get(`/adressen/${a.id}/akte`),
      API.get(`/adressen/${a.id}/versand`),
    ]);
  } catch (e) { fehler(e); return maskeFehlt('adresse', id); }
  if (lauf !== S.lauf) return;

  const basis = '#/adressen/' + a.id;
  const tab = params.get('tab') || 'allgemein';
  const schreiben = darfSchreiben();
  S.kontext = {
    typ: 'adresse', adresse: a, archivKtx: { typ: 'adresse', id: a.id, nummer: a.nummer },
    bearbeiten: () => adresseFormular(a), erstellen: () => adresseFormular(), suchen: () => gesamtlisteAdresse(a.id), pfkt: zuord,
    blaettern: adressBlaettern, sortieren: adressSortierDialog,
    loeschen: () => aktivUmschalten('Adresse', '/adressen/' + a.id, a),
  };
  merke('adresse', a.id);
  const ersteNummer = kom.telefone[0];

  // ---- Kopf: Anschrift, Geburtstage, LKto-Nr.
  const oben = [
    hpAdressInfo(a),
    el('div', { class: 'hp-panel hp-anschrift' }, [
      schreiben ? el('button', { type: 'button', class: 'hp-stift', title: 'Adresse bearbeiten', 'aria-label': 'Adresse bearbeiten', text: '✎', onclick: () => adresseFormular(a) }) : null,
      ...anschriftZeilen(a).map((t) => el('div', { text: t })),
    ]),
    el('div', { class: 'hp-panel hp-geburtstag' }, [
      el('div', { class: 'hp-blau', text: 'Geburtstage' }),
      ...(a.geburtstage||(a.geburtstag?[{datum:a.geburtstag,label:'Geburtstag'}]:[])).map(g=>el('div',{text:(g.label==='Geburtstag 2'?'2: ':'')+datum(g.datum)})),
    ]),
    el('div', { class: 'hp-lkto' }, [el('span', { class: 'hp-blau', text: 'LKto-Nr....:' }), el('span', { text: a.lkto_nr || '' })]),
  ];

  // ---- Rechte Knopfleiste (Reihenfolge wie im Original)
  const SPAETER_KNOPF = 'Folgt in einer späteren Ausbaustufe.';
  const dsJa = a.datenschutz_zustimmung === 'ja';
  const datenschutz = el('button', {
    type: 'button', class: 'hp-datenschutz' + (dsJa ? ' ok' : ' nein'),
    title: dsJa ? 'Weitergabe der Daten zugestimmt' + (a.datenschutz_datum ? ` am ${datumKurz(a.datenschutz_datum)}` : '')
      : a.datenschutz_zustimmung === 'nein' ? 'Weitergabe der Daten nicht zugestimmt' : 'Zustimmung zur Datenweitergabe nicht erfasst',
    onclick: () => datenschutzDialog(a),
  }, [el('span', { class: 'hp-ds-icon', 'aria-hidden': 'true', text: dsJa ? '✔' : '✖' }), document.createTextNode('Datenschutz')]);
  const seite = seitenleiste([
    { text: 'Suchen', titel: 'Gesamtliste Adresse (Taste s)', onclick: () => gesamtlisteAdresse(a.id) },
    { text: 'Sortierschlüssel', titel: 'Adressbestand sortieren (Strg+F7)', onclick: adressSortierDialog },
    { text: 'Z.I.S', schnell: true, titel: 'Zentrales Informationssystem: alle Eintragungen zu dieser Adresse', onclick: () => geheZu(basis + '?zis=1') },
    { text: 'Drucken', titel: 'Adressmaske drucken', onclick: () => window.print() },
    { text: 'Bank', schnell: true, titel: 'Bankverbindungen und SEPA-Lastschriftmandat', onclick: () => bankDialog(a) },
    { text: 'Pfkt.', schnell: true, titel: 'Personenfunktionen anlegen, ändern, beenden', onclick: () => pfktDialog(a) },
    { text: 'Info', titel: 'Info und Notizen', onclick: () => adressInfoDialog(a) },
    { text: 'AnsprP', schnell: true, titel: 'Neuer Ansprechpartner', onclick: () => ansprechpartnerDialog(a.id), gesperrt: !schreiben },
    { text: 'Tel-Nr', schnell: true, titel: 'Neue Telefonnummer', onclick: () => telefonDialog(a.id), gesperrt: !schreiben },
    { text: 'E-Mail', schnell: true, titel: 'E-Mail-Adressen (Versand laut Portooptimierung, Info für den Sachbearbeiter)', onclick: () => emailListeDialog(a) },
    { text: 'Wählen', schnell: true, titel: ersteNummer ? `${ersteNummer.nummer} anrufen` : 'Keine Telefonnummer hinterlegt', href: ersteNummer ? telHref(ersteNummer.nummer) : null, gesperrt: !ersteNummer, grund: 'Keine Telefonnummer hinterlegt.' },
    { text: 'Pers.-Kto', titel: 'Personenkonto(en) dieser Adresse (Strg+P)', onclick: () => pktoSprung(S.kontext) },
    { text: 'Zähler', schnell: true, titel: 'Zählerverwaltung der zugeordneten Objekte und Wohnungen', onclick: () => zaehlerAdresse(a,zuord) },
    { abstand: true },
    { text: 'Änderungshistorie', titel: 'Wer hat wann was an dieser Adresse geändert?', onclick: () => geheZu(basis + '?tab=historie') },
    { text: 'Export', titel: 'Adresse als vCard (Outlook/Handy) exportieren', href: `/api/adressen/${a.id}/vcard` },
    { text: 'E-Mail-Gr.', gesperrt: true, grund: SPAETER_KNOPF },
    { text: 'Neue Adresse', titel: 'Neue Adresse anlegen (F4)', onclick: () => adresseFormular(), gesperrt: !schreiben },
    { text: a.archiviert ? 'Reaktivieren' : 'Deaktivieren', titel: 'Adresse deaktivieren/reaktivieren (F3)', onclick: () => aktivUmschalten('Adresse', '/adressen/' + a.id, a), gesperrt: !schreiben },
    { text: 'Rechn.Ausg.', gesperrt: true, grund: 'Rechnung zur Adresse schreiben – folgt in einer späteren Ausbaustufe.' },
  ], { zusatz: el('div', { class: 'hp-symbole' }, [...adressSymbole(a, akte), versandSymbol(a, versand), datenschutz]) });
  seite.prepend(el('nav',{class:'cu-adress-blaettern','aria-label':'Adressen durchblättern'},[
    ['erster','⏮','Erste Adresse (Strg+Pos1)'],['vorheriger','◀','Vorherige Adresse (Strg+Bild auf)'],
    ['naechster','▶','Nächste Adresse (Strg+Bild ab)'],['letzter','⏭','Letzte Adresse (Strg+Ende)'],
  ].map(([richtung,text,titel])=>el('button',{type:'button',text,title:titel,'aria-label':titel,onclick:()=>adressBlaettern(richtung)}))));

  // ---- Reiter-Inhalte
  const inhalt = el('div');
  if (tab === 'allgemein' && params.get('zis') === '1') {
    zisAnsicht(a, inhalt, lauf);
  } else if (tab === 'allgemein') {
    const ort = [a.strasse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    if (ort) {
      inhalt.appendChild(el('div', { class: 'hp-adresse-anzeigen' }, [
        el('a', { href: 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(ort), target: '_blank', rel: 'noopener noreferrer', text: 'Adresse anzeigen' }),
      ]));
    }
    // aktuelle Personenfunktion (Historie per Knopf zuschaltbar)
    const pfSpalten = [
      { label: 'Zeitraum', class: 'nowrap', render: zeitraum },
      { label: 'Funktion', render: (z) => L.rolle[z.rolle] || z.rolle },
      { label: 'Nr.', class: 'nowrap', render: (z) => (z.einheit_id ? z.einheit_nummer : z.objekt_nummer) },
      { label: 'Objekt', render: (z) => String(z.objekt_bezeichnung || '').toUpperCase() },
      { label: 'Anschrift', render: (z) => [z.objekt_strasse, [z.objekt_plz, z.objekt_ort].filter(Boolean).join(' ')].filter(Boolean).join(', ').toUpperCase() },
    ];
    const pfOeffnen = (z) => geheZu(z.einheit_id ? '#/einheiten/' + z.einheit_id : '#/objekte/' + z.objekt_id);
    let mitHistorie = false;
    const pfBox = el('div');
    const pfZeichnen = () => {
      const zeilen = mitHistorie ? zuord : zuord.filter((z) => z.aktiv);
      pfBox.replaceChildren(abschnitt(mitHistorie ? 'Personenfunktionen (mit Historie)' : 'aktuelle Personenfunktion',
        raster(pfSpalten, zeilen, { onOpen: pfOeffnen, mindestZeilen: 2, klasse: 'hp-pfkt', bearbeiten: (z) => zuordnungFormular(z, neuLaden) }), [
          zuord.some((z) => !z.aktiv) ? { text: mitHistorie ? 'nur aktuelle' : 'Historie', pfeil: false, titel: 'Frühere/künftige Funktionen ein- oder ausblenden', onclick: () => { mitHistorie = !mitHistorie; pfZeichnen(); } } : null,
          schreiben ? { text: '', titel: 'Neue Personenfunktion', onclick: () => zuordnungFormular({ adresse_id: a.id }, neuLaden) } : null,
        ]));
    };
    pfZeichnen();
    inhalt.appendChild(pfBox);

    inhalt.appendChild(abschnitt('Telefon', raster([
      { label: 'Telefon', render: (t) => `${t.pos}   ${t.art}` },
      { label: 'Telefon- Nummer', class: 'nowrap', render: (t) => link(t.nummer, telHref(t.nummer)) },
      { label: 'Bemerkung', render: (t) => t.bemerkung },
      { label: 'Kurzwahl', render: (t) => t.kurzwahl },
    ], kom.telefone.map((t, i) => ({ ...t, pos: i + 1 })), { onOpen: schreiben ? (t) => telefonDialog(a.id, t) : null, mindestZeilen: 3 }),
    [schreiben ? { text: '', titel: 'Neue Telefonnummer', onclick: () => telefonDialog(a.id) } : null]));

    inhalt.appendChild(abschnitt('eMail Adresse / Webseite', raster([
      { label: 'eMail Adresse / Webseite', render: (m) => el('span', {}, [
        document.createTextNode(`${m.pos}   `),
        m.ist_email ? link(m.adresse, 'mailto:' + encodeURI(m.adresse)) : el('a', { href: webHref(m.adresse), target: '_blank', rel: 'noopener noreferrer', text: m.adresse }),
      ]) },
      { label: 'Bemerkung', render: (m) => m.bemerkung },
      { label: 'eMail', class: 'zentriert', render: (m) => haken(m.ist_email, 'E-Mail') },
      { label: 'Standard', class: 'zentriert', render: (m) => haken(m.standard, 'Standard') },
      { label: 'HPMobile', class: 'zentriert', render: (m) => haken(m.hpmobile, 'HPMobile') },
    ], kom.emails.map((m, i) => ({ ...m, pos: i + 1 })), { onOpen: schreiben ? (m) => emailDialog(a.id, m) : null, mindestZeilen: 2 }),
    [schreiben ? { text: '', titel: 'Neue E-Mail-Adresse / Webseite', onclick: () => emailDialog(a.id) } : null]));

    inhalt.appendChild(abschnitt('Ansprechpartner', raster([
      { label: 'Ansprechpartner', render: (p) => p.name },
      { label: 'Funktion', render: (p) => p.funktion },
      { label: 'Telefon', class: 'nowrap', render: (p) => (p.telefon ? link(p.telefon, telHref(p.telefon)) : '') },
    ], kom.ansprechpartner, { onOpen: schreiben ? (p) => ansprechpartnerDialog(a.id, p) : null, mindestZeilen: 3 }),
    [schreiben ? { text: '', titel: 'Neuer Ansprechpartner', onclick: () => ansprechpartnerDialog(a.id) } : null]));
  } else if (tab === 'korrespondenz') {
    archivListe(inhalt, { ktx: { typ: 'adresse', id: a.id }, kategorie: 'korrespondenz', lauf });
  } else if (tab === 'archiv') {
    archivListe(inhalt, { ktx: { typ: 'adresse', id: a.id }, kategorie: params.get('kategorie'), lauf });
  } else if (tab === 'historie') {
    historieAnsicht(a, inhalt, lauf);
  } else {
    const titel = tab === 'vorgaenge' ? 'Vorgänge/ Akten' : 'Handwerkeraufträge';
    vorgaengeListe(inhalt,{art:tab==='handwerker'?'handwerker':'akte',kontext:{typ:'adresse',id:a.id},lauf});
  }

  zeigeAufDesktop(lauf, maskenFenster({
    titel: `Adresse zeigen  Nr.: ${a.nummer} ${suchname(a)}`,
    kopf: {
      brot: [{ text: 'Adressen', href: '#/adressliste' }, { text: a.nummer, href: basis }, { text: a.anzeigename }],
      ueberschrift: a.anzeigename,
      badge: a.adresstyp === 'firma' ? 'Firma' : 'Person', badgeKlasse: 'cu-badge-neutral',
      unterzeile: [`Adresse ${a.nummer}`, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join('  •  ') + (a.archiviert ? '  •  deaktiviert' : ''),
    },
    inhalt: maskenRaster({
      oben, seite,
      unten: [reiterLeiste([
        { key: 'allgemein', label: 'Allgemein' },
        { key: 'korrespondenz', label: 'Korrespondenz' },
        { key: 'archiv', label: 'Archiv' },
        { key: 'vorgaenge', label: 'Vorgänge/ Akten' },
        { key: 'handwerker', label: 'Handwerkeraufträge' },
        { key: 'historie', label: 'Änderungshistorie' },
      ], tab, basis), inhalt],
    }),
  }));
}

// ---------------------------------------------------------------------
//  Änderungshistorie der Adresse (wer hat wann was geändert)
// ---------------------------------------------------------------------
const HIST_BEREICH = {
  adresse: 'Adresse', telefon: 'Telefon', email: 'E-Mail/Webseite', ansprechpartner: 'Ansprechpartner', bank: 'Bankverbindung',
  personenfunktion: 'Personenfunktion', versand: 'Portooptimierung', ampel: 'Ampel',
};
const HIST_AKTION = { angelegt: 'angelegt', geaendert: 'geändert', geloescht: 'gelöscht' };
const HIST_FELD = {
  nummer: 'Nummer', adresstyp: 'Typ', anrede: 'Anrede', vorname: 'Vorname', nachname: 'Nachname', firmenname: 'Firmenname', zusatz: '2. Zeile / Zusatz',
  ansprechpartner: 'Ansprechpartner', strasse: 'Straße', plz: 'PLZ', ort: 'Ort', land: 'Land', notizen: 'Notizen', geburtstag: 'Geburtstag',
  lkto_nr: 'LKto-Nr.', datenschutz_datum: 'Datenschutz-Zustimmung am', datenschutz_zustimmung: 'Zustimmung Datenweitergabe', versand_standard: 'Standardversand', archiviert: 'Deaktiviert',
  ampel: 'Ampel', ampel_notiz: 'Ampel-Begründung', art: 'Art', bemerkung: 'Bemerkung', kurzwahl: 'Kurzwahl', adresse: 'Adresse',
  ist_email: 'E-Mail (statt Webseite)', standard: 'Standard', name: 'Name', funktion: 'Funktion', telefon: 'Telefon', email: 'E-Mail',
  kontoinhaber: 'Kontoinhaber', iban: 'IBAN', bic: 'BIC', bankname: 'Bank', mandatsreferenz: 'Mandatsreferenz', mandat_datum: 'Mandat vom',
  mandat_aktiv: 'Lastschrift erlaubt', rolle: 'Funktion', objekt_id: 'Objekt', einheit_id: 'Wohnung/Einheit', gueltig_von: 'gültig von',
  gueltig_bis: 'gültig bis', anteil: 'Anteil', adresse_id: 'Adresse',
};
const HIST_JA_NEIN = ['archiviert', 'standard', 'ist_email', 'mandat_aktiv'];

function histWert(e, v) {
  if (v == null || v === '') return '–';
  if (HIST_JA_NEIN.includes(e.feld)) return v === '1' ? 'ja' : 'nein';
  if (e.feld === 'rolle') return L.rolle[v] || v;
  if (e.feld === 'adresstyp') return L.adresstyp[v] || v;
  if (e.feld === 'iban') return ibanFormat(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return datumKurz(v);
  return v;
}
const histZeit = (z) => {
  const d = new Date(String(z).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? z : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function historieAnsicht(a, ziel, lauf) {
  const bereichEl = el('select', { 'aria-label': 'Bereich' }, [el('option', { value: '', text: 'alle Bereiche' }), ...Object.entries(HIST_BEREICH).map(([v, t]) => el('option', { value: v, text: t }))]);
  const quelleEl = el('select', { 'aria-label': 'Quelle' }, [el('option', { value: '', text: 'Mitarbeiter und Kundenportal' }), el('option', { value: 'intern', text: 'nur Mitarbeiter' }), el('option', { value: 'portal', text: 'nur Kundenportal' })]);
  const sucheEl = el('input', { type: 'search', placeholder: 'Wert oder Name suchen …', 'aria-label': 'In der Historie suchen' });
  const box = el('div');
  const laden = async () => {
    try {
      const daten = await API.get(`/adressen/${a.id}/historie` + API.qs({ bereich: bereichEl.value, quelle: quelleEl.value, suche: sucheEl.value }));
      if (lauf !== S.lauf) return;
      box.replaceChildren(raster([
        { label: 'Wann', class: 'nowrap', render: (e) => histZeit(e.zeitpunkt) },
        { label: 'Wer', render: (e) => el('span', {}, [document.createTextNode(e.benutzer_name || 'unbekannt'), e.quelle === 'portal' ? el('span', { class: 'badge badge-rot hp-hist-portal', text: 'Kundenportal' }) : null]) },
        { label: 'Bereich', render: (e) => HIST_BEREICH[e.bereich] || e.bereich },
        { label: 'Aktion', render: (e) => HIST_AKTION[e.aktion] || e.aktion },
        { label: 'Feld', render: (e) => HIST_FELD[e.feld] || e.feld || '' },
        { label: 'vorher', render: (e) => el('span', { class: 'hp-hist-alt', text: histWert(e, e.alt) }) },
        { label: 'nachher', render: (e) => el('span', { class: 'hp-hist-neu', text: histWert(e, e.neu) }) },
      ], daten, { leer: 'Noch keine Änderungen protokolliert.' }));
      status(`${daten.length} Änderung(en)`);
    } catch (e) { fehler(e); }
  };
  [bereichEl, quelleEl].forEach((x) => x.addEventListener('change', laden));
  sucheEl.addEventListener('input', debounce(laden, 300));
  ziel.appendChild(el('div', { class: 'hp-abschnitt' }, [
    el('div', { class: 'hp-abschnitt-kopf' }, [el('span', { class: 'hp-blau', text: 'Änderungshistorie' }), el('span', { class: 'hp-spacer' }),
      el('span', { class: 'small muted', text: 'Protokoll aller Änderungen an Adresse, Kommunikation, Bank, Personenfunktionen, Versand und Ampel – unveränderlich.' })]),
    el('div', { class: 'hp-filter' }, [bereichEl, quelleEl, sucheEl]),
    box,
  ]));
  laden();
}

// ---------------------------------------------------------------------
//  Archiv – Liste (als Reiter in Masken und als eigene Maske)
// ---------------------------------------------------------------------
function archivListe(ziel, { ktx, kategorie, ohne, lauf }) {
  const sucheEl = el('input', { type: 'search', placeholder: 'Titel, Beschreibung, Dateiname, Nummer oder Name …', 'aria-label': 'Archiv durchsuchen' });
  const katEl = el('select', { 'aria-label': 'Kategorie' }, [el('option', { value: '', text: 'alle Kategorien' })]
    .concat(Object.entries(L.kategorie).map(([v, t]) => el('option', { value: v, text: t }))));
  katEl.value = kategorie && L.kategorie[kategorie] ? kategorie : '';
  const ohneEl = el('input', { type: 'checkbox', id: 'archiv_ohne' });
  ohneEl.checked = !!ohne;
  const ergebnis = el('div');

  async function laden() {
    status('Archiv wird geladen …');
    try {
      const q = { suche: sucheEl.value, kategorie: katEl.value, ohneZuordnung: !ktx && ohneEl.checked ? '1' : '' };
      if (ktx) q[ktx.typ] = ktx.id;
      const res = await API.get('/archiv' + API.qs(q));
      if (lauf !== S.lauf) return;
      const tab = raster([
        { label: 'Datum', class: 'nowrap', render: (d) => datumKurz(d.dokument_datum || d.erstellt_am) },
        { label: 'Titel', render: (d) => el('div', {}, [el('strong', { text: d.titel }), d.beschreibung ? el('div', { class: 'small muted', text: d.beschreibung }) : null]) },
        { label: 'Kategorie', render: (d) => L.kategorie[d.kategorie] || d.kategorie },
        { label: 'Zugeordnet zu', render: (d) => zuordnungChips(d.verknuepfungen) },
        { label: 'Datei', render: (d) => el('span', { class: 'dateiname', text: `${d.original_name} (${dateiGroesse(d.groesse)})` }) },
        { label: '', class: 'aktionen', render: (d) => el('span', { class: 'aktionen' }, [
          el('a', { class: 'btn hp-mini', href: d.hp ? '#' : `/api/archiv/${d.id}/download`, title: 'Datei öffnen/herunterladen', text: 'Öffnen', onclick: d.hp ? (event) => { event.preventDefault(); dmsArchivOeffnen(d); } : undefined }),
          darfSchreiben() ? el('button',{type:'button',class:'hp-mini',text:'Rechnung',title:'Eingangsrechnung erfassen (Strg + R)',onclick:()=>rechnungMaske(d).catch(fehler)}) : null,
          istAdmin()?el('button',{type:'button',class:'hp-mini',text:'Kundenportal',onclick:()=>kundenDokumentFreigabe(d)}):null,
          darfSchreiben() && !d.hp ? el('button', { type: 'button', class: 'hp-mini', text: 'Löschen', onclick: async () => {
            if (await bestaetigen(`Archiv-Eintrag „${d.titel}" endgültig löschen? Die Datei wird ebenfalls entfernt.`, { danger: true, text: 'Löschen' })) {
              try { await API.del('/archiv/' + d.id); toast('Gelöscht', 'success'); laden(); } catch (e) { fehler(e); }
            }
          } }) : null,
        ]) },
      ], res.eintraege, { onOpen: (d) => d.hp ? dmsArchivOeffnen(d) : archivBearbeiten(d.id, laden), leer: 'Keine Archiv-Einträge gefunden. HP-Dokumente müssen zuerst dauerhaft übernommen werden.' });
      const teile = [];
      if (res.mehr) teile.push(el('div', { class: 'hp-hinweis', text: 'Es werden die neuesten 500 Einträge angezeigt – bitte Suche oder Filter verfeinern.' }));
      if (ktx && ktx.typ === 'objekt') teile.push(el('div', { class: 'hp-hinweis', text: 'Enthält auch Einträge, die einzelnen Einheiten dieses Objekts zugeordnet sind.' }));
      teile.push(tab);
      ergebnis.replaceChildren(abschnitt(`Archiv (${res.eintraege.length}${res.mehr ? '+' : ''})`, el('div', {}, teile),
        [darfSchreiben() ? { text: 'Hochladen', titel: 'Neuen Eintrag hochladen', onclick: () => archivUpload(S.kontext.archivKtx || null, laden) } : null]));
      status(`${res.eintraege.length} Archiv-Einträge`);
    } catch (e) { fehler(e); status('Fehler beim Laden des Archivs'); }
  }
  sucheEl.addEventListener('input', debounce(laden));
  katEl.addEventListener('change', laden);
  ohneEl.addEventListener('change', laden);

  ziel.appendChild(el('div', { class: 'hp-abschnitt' }, [el('div', { class: 'hp-filter' }, [
    sucheEl, katEl,
    ktx ? null : el('label', { class: 'check-inline', for: 'archiv_ohne' }, [ohneEl, document.createTextNode('nur nicht zugeordnete')]),
  ])]));
  ziel.appendChild(ergebnis);
  laden();
}

async function archivMaske(params) {
  const lauf = S.lauf;
  let ktx = null;
  try {
    if (params.get('objekt')) {
      const o = await API.get('/objekte/' + encodeURIComponent(params.get('objekt')));
      ktx = { typ: 'objekt', id: o.id, nummer: UI.objektNummer(o), titel: `Objekt ${UI.objektNummer(o)} ${o.bezeichnung}`, href: '#/objekte/' + o.id };
    } else if (params.get('einheit')) {
      const e = await API.get('/einheiten/' + encodeURIComponent(params.get('einheit')));
      ktx = { typ: 'einheit', id: e.id, nummer: e.nummer, titel: `Einheit ${e.nummer} ${e.bezeichnung}`, href: '#/einheiten/' + e.id };
    } else if (params.get('adresse')) {
      const a = await API.get('/adressen/' + encodeURIComponent(params.get('adresse')));
      ktx = { typ: 'adresse', id: a.id, nummer: a.nummer, titel: `Adresse ${a.nummer} ${a.anzeigename}`, href: '#/adressen/' + a.id };
    }
  } catch (e) { fehler(e); return geheZu('#/archiv'); }
  if (lauf !== S.lauf) return;
  S.kontext = { typ: 'archiv', archivKtx: ktx, erstellen: hochladenAktuell };

  const unten = el('div');
  const fenster = maskenFenster({
    titel: ktx ? `Archiv – ${ktx.titel}` : 'Archiv – zentrale Ablage', symbol: '🗄',
    inhalt: maskenRaster({
      oben: [panel([
        ['Archiv', ktx ? ktx.titel : 'Alle Einträge'],
        ['Zuordnung', 'über Objekt-, Einheit- und Adress-Nummern'],
      ], 'hp-such-panel')],
      seite: seitenleiste([
        { text: 'HP-Archiv übernehmen', onclick: () => geheZu('#/dms-uebernahme') },
        { text: 'Hochladen', onclick: hochladenAktuell, gesperrt: schreibSperre() },
        ktx ? { text: 'Zurück', titel: 'Zurück zu ' + ktx.titel, onclick: () => geheZu(ktx.href) } : null,
        ktx ? { text: 'Alle Einträge', onclick: () => geheZu('#/archiv') } : null,
        ktx ? null : { text: 'Nicht zugeordnet', titel: 'Nur Einträge ohne Zuordnung', onclick: () => geheZu('#/archiv?ohne=1') },
      ]),
      unten: [unten],
    }),
  });
  if (!zeigeAufDesktop(lauf, fenster)) return;
  archivListe(unten, { ktx, kategorie: params.get('kategorie'), ohne: params.get('ohne') === '1', lauf });
}

// ---------------------------------------------------------------------
//  Objekt FIBU: Kontenrahmen Objekt (Strg+S im Objekt) nach HausPerfekt
// ---------------------------------------------------------------------
const RECHNUNGSART = { eue: 'Einnahmen-Überschuss-Rechnung', bilanz: 'Bilanz' };
const KONTOARTEN = { S: 'S – Sachkonto', B: 'B – Bankkonto', A: 'A – (lt. HausPerfekt, z. B. Offene Forderungen Rücklage)' };

async function kontenrahmenVorlage(o, danach) {
  if (!(await bestaetigen(`Standard-Kontenrahmen (43 Konten von 1200 Heizkosten bis 9995 IBK: MCV) in Objekt ${UI.objektNummer(o)} übernehmen? Vorhandene Konto-Nummern bleiben unverändert.`, { text: 'Übernehmen' }))) return;
  try { const r = await API.post(`/objekte/${o.id}/sachkonten/vorlage`, {}); toast(`${r.uebernommen} Konten übernommen`, 'success'); danach(); } catch (e) { fehler(e); }
}

async function kontenrahmenAnsicht(o, ziel, lauf, bjParam) {
  const basis = '#/objekte/' + o.id;
  const schreiben = darfSchreiben();
  let fibu;
  try { fibu = await API.get(`/objekte/${o.id}/fibu`); } catch (e) { fehler(e); return; }
  if (lauf !== S.lauf) return;
  if (!fibu.grundwerte) {
    // Noch keine Grundwerte: Hinweis – vorhandene (z. B. importierte) Konten trotzdem zeigen
    let vorhanden = [];
    try { vorhanden = await API.get(`/objekte/${o.id}/sachkonten`); } catch (e) { fehler(e); }
    if (lauf !== S.lauf) return;
    ziel.appendChild(el('section', { class: 'cu-karte', 'aria-label': vorhanden.length ? 'FIBU einrichten' : 'Kontenrahmen Objekt' }, [
      el('h2', { class: 'cu-karten-titel' }, [icon('book', 'cu-akzent'), el('span', { text: vorhanden.length ? 'FIBU einrichten' : 'Kontenrahmen Objekt' })]),
      el('div', { class: 'cu-leer' }, [icon('calc'), el('span', { text: vorhanden.length
        ? `Der Kontenrahmen (${vorhanden.length} Konten) ist da – für Buchungsjahre und WP-Ansätze bitte noch die FIBU-Grundwerte festlegen.`
        : 'Für dieses Objekt ist die FIBU noch nicht eingerichtet.' }),
        schreiben ? el('button', { type: 'button', class: 'btn-primary cu-knopf', onclick: () => fibuGrundwerteDialog(o) }, [icon('plus'), el('span', { text: 'FIBU einrichten (Strg+F)' })]) : null,
        schreiben && !vorhanden.length ? el('button', { type: 'button', class: 'hp-mini', text: 'Buchungsimport', onclick: () => buchungsImportDialog(o, () => { ziel.replaceChildren(); kontenrahmenAnsicht(o, ziel, lauf, bjParam); }) }) : null,
        !vorhanden.length ? el('button', { type: 'button', class: 'hp-mini', text: 'Buchungsjournal', onclick: () => buchungsJournalDialog(o) }) : null,
      ]),
    ]));
    if (!vorhanden.length) return;
    const j = fibu.jahre.length ? fibu.jahre[fibu.jahre.length - 1] : new Date().getFullYear();
    fibu = { ...fibu, grundwerte: { rechnungsart: 'eue', erstes_bj: j, aktuelles_bj: j, ust_option: 0, vorlaeufig: true }, jahre: fibu.jahre.length ? fibu.jahre : [j] };
  }
  const jahr = fibu.jahre.includes(Number(bjParam)) ? Number(bjParam) : fibu.grundwerte.aktuelles_bj;
  const bjSel = el('select', { class: 'cu-bj-wahl', 'aria-label': 'Buchungsjahr' }, [
    ...fibu.jahre.slice().reverse().map((j) => el('option', { value: String(j), text: `BJ ${j}` })),
    schreiben && !fibu.grundwerte.vorlaeufig ? el('option', { value: 'neu', text: `+ BJ ${fibu.grundwerte.aktuelles_bj + 1} anlegen` }) : null,
  ]);
  bjSel.value = String(jahr);
  bjSel.addEventListener('change', async () => {
    if (bjSel.value !== 'neu') { geheZu(`${basis}?fibu=1&bj=${bjSel.value}`); return; }
    if (!(await bestaetigen(`Buchungsjahr ${fibu.grundwerte.aktuelles_bj + 1} anlegen? Die WP-Ansätze aus ${fibu.grundwerte.aktuelles_bj} werden übernommen.`, { text: 'Anlegen' }))) { bjSel.value = String(jahr); return; }
    try { const g = await API.post(`/objekte/${o.id}/fibu/buchungsjahr`, {}); toast(`Buchungsjahr ${g.grundwerte.aktuelles_bj} angelegt`, 'success'); geheZu(`${basis}?fibu=1&bj=${g.grundwerte.aktuelles_bj}`); } catch (e) { fehler(e); bjSel.value = String(jahr); }
  });
  const suche = el('input', { type: 'search', class: 'cu-karten-suche', placeholder: 'Konto-Nr. oder Bezeichnung …', 'aria-label': 'Konto suchen' });
  const nurBebucht = el('input', { type: 'checkbox', checked: 'checked', 'aria-label': 'Nur bebuchte Konten' });
  S.kontext.suchfeld = suche;
  const box = el('div', { class: 'cu-kontenrahmen' });
  let konten = [];
  const zeichnen = () => {
    const q = suche.value.trim().toLowerCase();
    const sichtbar = nurBebucht.checked ? konten.filter(k => Number(k.buchungen) > 0) : konten;
    const liste = q ? sichtbar.filter((k) => `${k.nummer} ${k.bezeichnung}`.toLowerCase().includes(q)) : sichtbar;
    box.replaceChildren(raster([
      { label: 'Konto-Nr', class: 'nowrap', render: (k) => el('span', { class: 'cu-konto-nr' }, [el('strong', { text: String(k.nummer) }), el('span', { class: 'cu-konto-art cu-art-' + k.art, title: KONTOARTEN[k.art] || k.art, text: k.art })]) },
      { label: 'Bezeichnung', render: (k) => el('span', { class: k.aktiv ? '' : 'muted', text: k.bezeichnung + (k.aktiv ? '' : ' (inaktiv)') }) },
      { label: 'Referenz-Konto', class: 'nowrap', render: (k) => (k.referenz_konto ? String(k.referenz_konto) : '') },
      { label: 'VS EG', class: 'nowrap', render: (k) => k.vs_eg || '' },
      { label: 'VS MI', class: 'nowrap', render: (k) => k.vs_mi || '' },
      { label: 'WP-Ansatz', class: 'zahl nowrap', render: (k) => (k.wp_ansatz == null ? '' : zahlDe(k.wp_ansatz, 2)) },
      { label: 'Saldo', class: 'zahl nowrap', render: (k) => (k.saldo == null ? el('span', { class: 'cu-kb', title: 'keine Buchungen', text: 'kB' }) : zahlDe(k.saldo, 2)) },
    ], liste, { onOpen: schreiben ? (k) => sachkontoForm(o, k, jahr, laden) : null, leer: q ? 'Kein Konto gefunden.' : nurBebucht.checked && konten.length ? 'Keine bebuchten Konten in diesem Buchungsjahr. Für alle Konten den Filter ausschalten.' : 'Noch keine Konten – „Standard-Kontenrahmen", „Kontenrahmen kopieren" oder „+ Konto".', klasse: 'cu-kontenrahmen-tabelle' }));
    const wp = konten.reduce((sum, k) => sum + (k.wp_ansatz || 0), 0);
    box.appendChild(el('div', { class: 'cu-summe', text: `${liste.length} von ${konten.length} Konten · WP-Ansätze ${jahr} Gesamtbestand: ${zahlDe(wp, 2)} €` }));
  };
  async function laden() {
    try { konten = await API.get(`/objekte/${o.id}/sachkonten` + API.qs({ jahr })); if (lauf === S.lauf) zeichnen(); } catch (e) { fehler(e); }
  }
  suche.addEventListener('input', zeichnen);
  nurBebucht.addEventListener('change', zeichnen);
  const knopf = (text, onclick, titel) => el('button', { type: 'button', class: 'hp-mini', title: titel || text, onclick }, [el('span', { text })]);
  const folgt = (text, was) => el('button', { type: 'button', class: 'hp-mini gesperrt', 'aria-disabled': 'true', title: `${was} – folgt mit der FIBU`, onclick: () => toast(`${text}: ${was} – folgt mit der FIBU.`) }, [el('span', { text })]);
  const g = fibu.grundwerte;
  ziel.appendChild(el('section', { class: 'cu-karte', 'aria-label': 'Kontenrahmen Objekt' }, [
    el('div', { class: 'cu-karten-kopf' }, [
      el('h2', { class: 'cu-karten-titel' }, [icon('book', 'cu-akzent'), el('span', { text: 'Kontenrahmen Objekt' })]),
      bjSel,
      el('label', { class: 'small nowrap' }, [nurBebucht, ' Nur bebuchte Konten']),
      el('span', { class: 'hp-spacer' }),
      el('div', { class: 'cu-suche-klein' }, [icon('search'), suche]),
      schreiben ? el('button', { type: 'button', class: 'btn-primary cu-knopf', onclick: () => sachkontoForm(o, null, jahr, laden) }, [icon('plus'), el('span', { text: 'Konto' })]) : null,
    ]),
    el('div', { class: 'cu-unterzeile small' }, [document.createTextNode(g.vorlaeufig ? 'FIBU-Grundwerte noch nicht festgelegt (Strg+F)' : `${RECHNUNGSART[g.rechnungsart]} · Buchungsjahre ${g.erstes_bj}–${g.aktuelles_bj}${g.ust_option ? ' · mit Umsatzsteuer-Option' : ''} · Hausgeld als Gesamtbetrag`)]),
    el('div', { class: 'cu-fibu-knoepfe' }, [
      knopf('Grundwerte', () => fibuGrundwerteDialog(o), 'FIBU-Grundwerte (Strg+F)'),
      knopf('Jahresdaten', () => fibuJahresdatenDialog(o,jahr), 'Jahresgrundwerte und E-Banking-Zuordnungen'),
      knopf('Vermögensstatus', () => vermoegensstatusDialog(o,jahr), 'HP-Abrechnungsstand übernehmen und Excel-Ausgabe erstellen'),
      schreiben ? knopf('Excel-Import', () => kontenImportDialog(o, laden), 'Kontenrahmen aus HausPerfekt-Export (Excel/CSV) übernehmen') : null,
      schreiben ? knopf('Buchungsimport', () => buchungsImportDialog(o, laden), 'HP-Buchungen: Vorschau und Dublettenprüfung') : null,
      knopf('Buchungsjournal', () => buchungsJournalDialog(o, jahr)),
      schreiben ? knopf('Standard-Kontenrahmen', () => kontenrahmenVorlage(o, laden), 'Standard-Kontenrahmen einer WEG übernehmen (43 Konten)') : null,
      schreiben ? knopf('Kontenrahmen kopieren', () => kontenKopierenDialog(o, laden), 'Konten aus einem anderen Objekt übernehmen') : null,
      knopf('Drucken', () => window.print()),
      knopf('Festkonten', () => festkontenDialog(o,jahr), 'Festkonten und Rücklastschriftarten je Buchungsjahr'), folgt('KAusz', 'Kontoauszug des Kontos'), folgt('V-/USt', 'Vor-/Umsatzsteuer'), folgt('Pläne', 'Wirtschaftspläne'),
      folgt('EB-W', 'Eröffnungswerte'), folgt('HNDL', 'Haushaltsnahe Dienstleistungen'), folgt('Anz Abz Vst', 'Anzeige abziehbare Vorsteuer'),
      knopf('Zurück (Strg+O)', () => geheZu(basis)),
    ]),
    box,
  ]));
  laden();
}

async function fibuGrundwerteDialog(o) {
  let fibu;
  try { fibu = await API.get(`/objekte/${o.id}/fibu`); } catch (e) { fehler(e); return; }
  const g = fibu.grundwerte || {};
  const jahrJetzt = new Date().getFullYear();
  const weg = fibu.objekt.objekttyp === 'WEG';
  formFenster({
    titel: `FIBU-Grundwerte – Objekt ${fibu.objekt.nummer} ${fibu.objekt.bezeichnung}`,
    felder: [
      { grid: 2, felder: [
        weg ? { name: 'rechnungsart', label: 'Rechnungsart (WEG: immer E/Ü)', type: 'select', options: [{ value: 'eue', label: RECHNUNGSART.eue }], value: 'eue' }
          : { name: 'rechnungsart', label: 'Rechnungsart', type: 'select', options: opt(RECHNUNGSART), value: g.rechnungsart || 'eue' },
        { name: 'ust_option', label: 'Umsatzsteuer-Option (§ 9 UStG)', type: 'select', options: JA_NEIN, value: String(g.ust_option || 0) },
      ] },
      { grid: 2, felder: [
        { name: 'erstes_bj', label: 'Erstes Buchungsjahr', type: 'number', required: true, value: g.erstes_bj || jahrJetzt },
        { name: 'aktuelles_bj', label: 'Aktuelles Buchungsjahr', type: 'number', value: g.aktuelles_bj || '' },
      ] },
      { felder: [{ name: 'notiz', label: 'Steuerinformationen / Notiz', type: 'textarea', value: g.notiz }] },
    ],
    speichern: (v) => API.put(`/objekte/${o.id}/fibu`, v),
    danach: () => geheZu(`#/objekte/${o.id}?fibu=1`),
  });
}

function sachkontoForm(o, k, jahr, danach) {
  formFenster({
    titel: k ? `Konto ${k.nummer} – ${k.bezeichnung}` : `Neues Konto – Objekt ${UI.objektNummer(o)}`,
    felder: [
      { grid: 3, felder: [
        { name: 'nummer', label: 'Konto-Nr. (1000–9999)', type: 'number', required: true, value: k ? k.nummer : '' },
        { name: 'bezeichnung', label: 'Bezeichnung', required: true, value: k?.bezeichnung },
        { name: 'referenz_konto', label: 'Referenz-Konto', type: 'number', value: k?.referenz_konto ?? '' },
      ] },
      { grid: 3, felder: [
        { name: 'wp_ansatz', label: `WP-Ansatz ${jahr} (€)`, value: k && k.wp_ansatz != null ? zahlDe(k.wp_ansatz, 2) : '', placeholder: 'z. B. 8.000,00' },
        { name: 'art', label: 'Kontoart', type: 'select', options: opt(KONTOARTEN), value: k?.art || 'S' },
        { name: 'aktiv', label: 'Aktiv', type: 'select', options: JA_NEIN, value: k ? String(k.aktiv) : '1' },
      ] },
      { felder: [{ name: 'notiz', label: 'Notiz', value: k?.notiz }] },
    ],
    nachAufbau: (inputs, form) => {
      if (!k || !(k.vs_eg || k.vs_mi || k.hp_attribute)) return;
      let attr = {};
      try { attr = JSON.parse(k.hp_attribute || '{}'); } catch { attr = {}; }
      form.appendChild(el('fieldset', { class: 'nr-box' }, [
        el('legend', { text: 'Abrechnungsangaben aus HausPerfekt' }),
        el('div', { class: 'cu-hp-attribute' }, [['VS EG', k.vs_eg], ['VS MI', k.vs_mi], ...Object.entries(attr)].filter(([, w]) => w)
          .map(([n, w]) => el('span', { class: 'badge badge-kat', text: `${n}: ${w}` }))),
      ]));
    },
    speichern: (v) => { const daten = { ...v, jahr }; return k ? API.put('/sachkonten/' + k.id, daten) : API.post(`/objekte/${o.id}/sachkonten`, daten); },
    loeschen: k ? () => API.del('/sachkonten/' + k.id) : null,
    loeschFrage: k ? `Konto ${k.nummer} „${k.bezeichnung}" löschen?` : '',
    danach,
  });
}

/** Kontenrahmen aus HausPerfekt-Export: Datei wählen → Prüfung (Vorschau) → Importieren. */
function kontenImportDialog(o, danach) {
  const datei = el('input', { type: 'file', id: 'f_kontendatei', accept: '.xlsx,.csv,.txt' });
  const ergebnis = el('div', { class: 'cu-import-ergebnis', 'aria-live': 'polite' });
  let geprueft = null;
  let m;
  const senden = async (pruefen) => {
    const fd = new FormData();
    fd.append('datei', datei.files[0]);
    return API.upload(`/objekte/${o.id}/sachkonten/import${pruefen ? '?pruefen=1' : ''}`, fd);
  };
  const zeigen = (r) => {
    const zeile = (l, w) => el('div', { class: 'cu-kv' }, [el('span', { class: 'cu-kv-l', text: l }), el('span', { class: 'cu-kv-w', text: w })]);
    ergebnis.replaceChildren(
      zeile('Sachkonten in der Datei', `${r.gesamt}  (${Object.entries(r.je_art).map(([a, n]) => `${n} × ${a}`).join(', ')})`),
      zeile('davon neu', String(r.neu)), zeile('werden aktualisiert', String(r.aktualisiert)), zeile('unverändert', String(r.unveraendert)),
      ...r.uebersprungen.map((u) => zeile('nicht übernommen', `${u.anzahl} ${u.text} (Kontoart ${u.art})`)),
      r.fehler.length ? el('div', { class: 'cu-iban-status hinweis' }, r.fehler.map((f) => el('div', { text: '⚠ ' + f }))) : null,
      raster([
        { label: 'Konto', class: 'nowrap', render: (k) => `${k.nummer} ${k.art}` },
        { label: 'Bezeichnung', render: (k) => k.bezeichnung },
        { label: 'VS EG', render: (k) => k.vs_eg || '' },
        { label: 'VS MI', render: (k) => k.vs_mi || '' },
      ], r.beispiele),
      el('p', { class: 'small muted', text: r.ausgefuehrt ? 'Import abgeschlossen.' : 'Vorschau – noch nichts gespeichert. Vorhandene Konto-Nummern werden mit den Angaben aus der Datei aktualisiert.' }),
    );
  };
  datei.addEventListener('change', async () => {
    geprueft = null;
    if (!datei.files[0]) return;
    ergebnis.replaceChildren(el('div', { class: 'muted', text: 'Datei wird geprüft …' }));
    try { geprueft = await senden(true); zeigen(geprueft); } catch (e) { ergebnis.replaceChildren(el('div', { class: 'cu-iban-status fehler', text: '✖ ' + e.message })); }
    m.box.querySelector('.btn-primary').disabled = !geprueft;
  });
  m = modal({
    titel: `Kontenrahmen importieren – Objekt ${UI.objektNummer(o)} ${o.bezeichnung}`, wide: true,
    inhalt: el('div', {}, [
      el('p', { class: 'small muted', text: 'Export aus HausPerfekt (Kontenrahmen als Excel oder CSV). Übernommen werden Sach-, Bank- und Sonderkonten (1000–9999) samt Verteilerschlüsseln und Abrechnungsangaben. Personenkonten (K) und Lieferanten (L) werden nicht als Sachkonten angelegt.' }),
      el('div', { class: 'field' }, [el('label', { for: 'f_kontendatei', text: 'Datei (.xlsx oder .csv)' }), datei]),
      ergebnis,
    ]),
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Importieren', disabled: 'disabled', onclick: async () => {
        if (!geprueft) return;
        try { const r = await senden(false); toast(`Kontenrahmen importiert: ${r.neu} neu, ${r.aktualisiert} aktualisiert`, 'success'); close(); danach(); } catch (e) { fehler(e); }
      } }),
    ],
  });
}

async function kontenKopierenDialog(o, danach) {
  let objekte;
  try { objekte = (await API.get('/objekte')).filter((x) => x.id !== o.id); } catch (e) { fehler(e); return; }
  if (!objekte.length) { toast('Es gibt kein weiteres Objekt, aus dem kopiert werden könnte.'); return; }
  const { form, werte } = formular([{ felder: [
    { name: 'von_objekt_id', label: 'Kontenrahmen übernehmen aus Objekt', type: 'select', options: objekte.map((x) => ({ value: x.id, label: `${x.nummer} · ${x.bezeichnung}` })) },
  ] }]);
  form.appendChild(el('p', { class: 'small muted', text: 'Übernommen werden nur Konto-Nummern, die es in diesem Objekt noch nicht gibt. WP-Ansätze und Salden werden nicht kopiert.' }));
  modal({
    titel: `Kontenrahmen kopieren – Objekt ${UI.objektNummer(o)}`, inhalt: form,
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Kopieren', onclick: async () => {
        try { const r = await API.post(`/objekte/${o.id}/sachkonten/kopieren`, werte()); toast(`${r.uebernommen} Konten übernommen`, 'success'); close(); danach(); } catch (e) { fehler(e); }
      } }),
    ],
  });
}

// ---------------------------------------------------------------------
//  FIBU Gesamtmenü (Startseite der Buchhaltung, Aufbau nach HausPerfekt)
// ---------------------------------------------------------------------
function fibuMaske() {
  const lauf = S.lauf;
  S.kontext = { typ: 'fibu' };
  const filter = el('input', { type: 'search', class: 'cu-karten-suche', placeholder: 'Funktion suchen, z. B. Sollstellungen …', 'aria-label': 'FIBU-Funktion suchen' });
  S.kontext.suchfeld = filter;
  const gruppen = el('div', { class: 'cu-fibu-raster' }, FIBU_GRUPPEN.map((g) => el('section', { class: 'cu-karte cu-fibu-gruppe', 'aria-label': g.titel }, [
    el('h2', { class: 'cu-karten-titel' }, [icon(g.icon, 'cu-akzent'), el('span', { text: g.titel })]),
    el('div', { class: 'hp-knoepfe' }, g.eintraege.map((t) => {
      const e = fibuEintrag(t);
      return schnellKnopf({ icon: 'chevron', text: t, gesperrt: !e.aktion, titel: e.aktion ? null : FIBU_FOLGT, onclick: () => (e.aktion ? e.aktion() : toast(e.folgt)) });
    })),
  ])));
  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    gruppen.querySelectorAll('.cu-fibu-gruppe').forEach((karte) => {
      let treffer = 0;
      karte.querySelectorAll('.cu-schnell').forEach((k) => {
        const an = !q || k.textContent.toLowerCase().includes(q) || karte.getAttribute('aria-label').toLowerCase().includes(q);
        k.hidden = !an;
        if (an) treffer++;
      });
      karte.hidden = treffer === 0;
    });
  });
  zeigeAufDesktop(lauf, maskenFenster({
    titel: 'FIBU Gesamtmenü',
    kopf: { brot: [{ text: 'Übersicht', href: '#/' }, { text: 'Buchhaltung' }], ueberschrift: 'FIBU Gesamtmenü', unterzeile: 'Finanzbuchhaltung – die Funktionen werden Schritt für Schritt freigeschaltet (ausgegraut = folgt).', drucken: false },
    inhalt: el('div', {}, [el('div', { class: 'cu-etv-werkzeug' }, [el('div', { class: 'cu-suche-klein' }, [icon('search'), filter])]), gruppen]),
  }));
}

// ---------------------------------------------------------------------
//  ETV – Eigentümerversammlungen (Aufbau nach Vorbild Vulcavo „Versammlungen")
// ---------------------------------------------------------------------
const ETV_ART = {
  praesenz: { text: 'Präsenzversammlung', icon: 'user' },
  hybrid: { text: 'Hybride Versammlung (Präsenz + online)', icon: 'hybrid' },
  online: { text: 'Online-Versammlung', icon: 'video' },
};
const ETV_STATUS = {
  vorbereitung: { text: 'In Vorbereitung', icon: 'clock', cls: 'cu-st-vorb' },
  eingeladen: { text: 'Eingeladen', icon: 'mail', cls: 'cu-st-einl' },
  durchgefuehrt: { text: 'Durchgeführt', icon: 'check', cls: 'cu-st-ok' },
};
const etvDatum = (v) => `${datumKurz(v.datum)}${v.uhrzeit ? ' - ' + v.uhrzeit : ''}`;

async function versammlungForm(v, { kopie = false, container = null } = {}) {
  let objekte=[],mitarbeiter=[];
  try { [objekte,mitarbeiter]=await Promise.all([API.get('/objekte'),API.get('/mitarbeiter')]); } catch (e) { fehler(e); return; }
  const bearb = !!(v && v.id) && !kopie;
  const x = v || {};let gespeichertId=x.id;
  let teamsFirmen=[];try{const f=await API.get('/m365/firmen');teamsFirmen=Array.isArray(f)?f.filter(r=>r.firma_id):[];}catch{}
  const personen=mitarbeiter.map(p=>({value:p.id,label:p.name+(p.kuerzel?' · '+p.kuerzel:'')}));
  if(bearb&&x.leitung_id&&!mitarbeiter.some(p=>p.id===x.leitung_id))personen.push({value:x.leitung_id,label:(x.leitung_name||'Bisherige Versammlungsleitung')+' · bisher zugeordnet (nicht mehr aktiv)'});
  const leitung=kopie&&!mitarbeiter.some(p=>p.id===x.leitung_id)?'':x.leitung_id||'';
  const internOptionen=key=>{
    const list=mitarbeiter.map(p=>({value:p.id,label:p.name+(p.kuerzel?' · '+p.kuerzel:'')}));
    if(bearb&&x[key]&&!list.some(p=>p.value===x[key]))list.push({value:x[key],label:(x[key.replace('_id','_name')]||'Bisherige Person')+' · bisher zugeordnet'});
    return[{value:'',label:'– Optional –'},...list];
  };
  let objektPersonen={beirat:[],eigentuemer:[]};
  if(x.objekt_id)try{objektPersonen=await API.get('/objekte/'+x.objekt_id+'/etv-personen'+(x.datum?'?datum='+encodeURIComponent(x.datum):''));}catch(e){fehler(e);return;}
  const externOptionen=(key,gruppe)=>{
    const list=(objektPersonen[gruppe]||[]).map(p=>({value:p.id,label:p.name+(p.nummer?' · '+p.nummer:'')}));
    if(bearb&&x[key]&&!list.some(p=>p.value===x[key]))list.push({value:x[key],label:(x[key.replace('_id','_name')]||'Bisherige Person')+' · bisher zugeordnet'});
    return[{value:'',label:'– Optional –'},...list];
  };
  const kopierPerson=(key,gruppe)=>kopie&&!(gruppe?(objektPersonen[gruppe]||[]):mitarbeiter).some(p=>p.id===x[key])?'':x[key]||'';
  let gespeicherteOrte=[];
  if(x.objekt_id)try{gespeicherteOrte=await API.get('/objekte/'+x.objekt_id+'/versammlungsorte');}catch(e){fehler(e);return;}
  formFenster({
    container,
    titel: bearb ? `Versammlung bearbeiten – ${x.name}` : kopie ? 'Versammlung kopieren' : 'Versammlung anlegen',
    felder: [
      { grid: 2, felder: [
        { name: 'objekt_id', label: 'Objekt', type: 'select', required: true, value: x.objekt_id || '',
          options: [{ value: '', label: '– Objekt wählen –' }].concat(objekte.map((o) => ({ value: o.id, label: `${UI.objektNummer(o)} · ${o.bezeichnung}` }))) },
        { name: 'name', label: 'Name', required: true, value: x.name || `ETV ${new Date().getFullYear()}` },
      ] },
      { grid: 3, felder: [
        { name: 'datum', label: 'Datum', type: 'date', required: true, value: kopie ? '' : x.datum },
        { name: 'uhrzeit', label: 'Uhrzeit', type: 'time', value: x.uhrzeit },
        { name: 'nummer', label: 'Nr. (lfd. Versammlung)', type: 'number', value: kopie && x.nummer ? x.nummer + 1 : x.nummer ?? '' },
      ] },
      { grid: 3, felder: [
        { name: 'art', label: 'Art', type: 'select', value: x.art || 'praesenz', options: Object.entries(ETV_ART).map(([value, a]) => ({ value, label: a.text })) },
        { name: 'status', label: 'Status', type: 'select', value: kopie ? 'vorbereitung' : x.status || 'vorbereitung', options: Object.entries(ETV_STATUS).map(([value, a]) => ({ value, label: a.text })) },

      ] },
      { felder: [{name:'ort',label:'Bezeichnung / Raum',value:x.ort,placeholder:'z. B. Gemeindesaal, Raum 2'}] },
      { grid:3,felder:[
        {name:'ort_strasse',label:'Straße und Hausnummer',value:x.ort_strasse},
        {name:'ort_plz',label:'Postleitzahl',value:x.ort_plz},
        {name:'ort_stadt',label:'Ort',value:x.ort_stadt},
      ] },
      {felder:[{name:'ort_beschreibung',label:'Beschreibung des Versammlungsorts',type:'textarea',value:x.ort_beschreibung,hint:'z. B. Eingang, Etage oder Hinweise zur Anfahrt'}]},
      {grid:2,felder:[
        {name:'leitung_funktion',label:'Funktion',type:'select',value:'versammlungsleitung',options:[{value:'versammlungsleitung',label:'Versammlungsleitung'}]},
        {name:'leitung_id',label:'Person',required:true,type:'select',value:leitung,options:[{value:'',label:'– Person wählen –'},...personen]},
      ]},
      {grid:2,felder:[
        {name:'beisitzer_id',label:'Beisitzer (optional)',type:'select',value:kopierPerson('beisitzer_id'),options:internOptionen('beisitzer_id')},
        {name:'protokollfuehrer_id',label:'Protokollführer (optional)',type:'select',value:kopierPerson('protokollfuehrer_id'),options:internOptionen('protokollfuehrer_id')},
      ]},
      {grid:2,felder:[
        {name:'beirat_id',label:'Beirat (optional)',type:'select',value:kopierPerson('beirat_id','beirat'),options:externOptionen('beirat_id','beirat')},
        {name:'unterzeichner_id',label:'Eigentümer zur Protokollunterzeichnung (optional)',type:'select',value:kopierPerson('unterzeichner_id','eigentuemer'),options:externOptionen('unterzeichner_id','eigentuemer')},
      ]},
      {grid:2,felder:[{name:'m365_firma_id',label:'Verwaltung / Microsoft-Konto',type:'select',value:x.m365_firma_id||(teamsFirmen.length===1?teamsFirmen[0].firma_id:''),options:[{value:'',label:'– Verwaltung wählen –'},...teamsFirmen.map(f=>({value:f.firma_id,label:f.name+(f.kalender_bereit?' · Kalender freigegeben':' · Kalender-Freigabe fehlt')}))]},{name:'teams_dauer',label:'Geplante Dauer (Minuten)',type:'number',value:x.teams_dauer||180}]},
      { felder: [{ name: 'notizen', label: 'Notizen', type: 'textarea', value: kopie ? '' : x.notizen }] },
    ],
    nachAufbau:(inputs,form)=>{
      const teamFields=inputs.m365_firma_id.closest('.field').parentElement,teamInfo=el('p',{class:'small muted',role:'status'}),teamBox=el('section',{class:'cu-karte','aria-label':'Microsoft Teams'},[el('h3',{text:'Microsoft 365 · Kalender und Teams'})]);form.insertBefore(teamBox,teamFields);teamBox.append(teamFields,teamInfo,el('div',{class:'cu-aktionen'},[el('a',{class:'btn cu-knopf',href:'#/m365',text:'Microsoft-Verbindung verwalten'})]));
      inputs.teams_dauer.min='15';inputs.teams_dauer.max='1440';
      const teamStatus=r=>{teamInfo.replaceChildren(document.createTextNode(r.teams_status==='bereit'?'Teams-Besprechung erstellt. ':r.teams_meldung||'Der Teams-Link wird beim Speichern automatisch erstellt. Geplante Dauer: standardmäßig 180 Minuten.'));if(r.teams_url&&r.teams_status==='bereit')teamInfo.append(el('a',{href:r.teams_url,target:'_blank',rel:'noopener noreferrer',text:'Teams-Besprechung öffnen'}));};teamStatus(kopie?{}:x);
      if(bearb){const retry=el('button',{type:'button',class:'cu-knopf',text:'Teams-Link aus gespeicherten Basisdaten erstellen / aktualisieren',onclick:async()=>{retry.disabled=true;try{const r=await API.post('/versammlungen/'+x.id+'/teams',{m365_firma_id:inputs.m365_firma_id.value,teams_dauer:inputs.teams_dauer.value});teamStatus(r);}catch(e){teamInfo.textContent=e.message;}finally{retry.disabled=false;}}});teamBox.lastElementChild.append(retry);}
      const kalenderInfo=el('p',{class:'small muted',role:'status'});teamBox.append(kalenderInfo);const kalenderStatus=r=>{kalenderInfo.textContent=r.kalender_status==='bereit'?'ETV-Termin im Firmenkalender und im persönlichen Kalender der Versammlungsleitung gespeichert.':r.kalender_meldung||'Beim Speichern wird der Termin automatisch in den Firmenkalender und in den persönlichen Kalender der Versammlungsleitung eingetragen. Die Leitung muss ihren eigenen Microsoft-Kalender in CuraAed verbunden haben.';};kalenderStatus(kopie?{}:x);if(bearb){const retryKalender=el('button',{type:'button',text:'Kalender aus gespeicherten Basisdaten erneut abgleichen',onclick:async()=>{retryKalender.disabled=true;try{kalenderStatus(await API.post('/versammlungen/'+x.id+'/kalender',{}));}catch(e){kalenderInfo.textContent=e.message;}finally{retryKalender.disabled=false;}}});teamBox.append(retryKalender);}const showTeams=()=>{teamInfo.hidden=inputs.art.value==='praesenz';};inputs.art.addEventListener('change',showTeams);showTeams();
      const teilnahme=inputs.leitung_id.closest('.field').parentElement;
      const intern=el('section',{'aria-label':'Versammlungsteilnahme (intern)',class:'cu-karte',style:'padding:16px;margin:12px 0'},[el('h3',{text:'Versammlungsteilnahme (intern)'})]);form.insertBefore(intern,teilnahme);intern.append(teilnahme,inputs.beisitzer_id.closest('.field').parentElement,inputs.beirat_id.closest('.field').parentElement);
      let personenVersion=0;
      const neueOptionen=(key,rows)=>{
        inputs[key].replaceChildren(el('option',{value:'',text:'– Optional –'}),...rows.map(p=>el('option',{value:String(p.id),text:p.name+(p.nummer?' · '+p.nummer:'')})));
        inputs[key].disabled=!inputs.objekt_id.value;
      };
      async function ladePersonen(){
        const nr=++personenVersion,objekt=inputs.objekt_id.value;
        for(const key of ['beirat_id','unterzeichner_id']){neueOptionen(key,[]);inputs[key].disabled=true;}
        if(!objekt)return;
        try{const r=await API.get('/objekte/'+objekt+'/etv-personen'+(inputs.datum.value?'?datum='+encodeURIComponent(inputs.datum.value):''));if(!form.isConnected||nr!==personenVersion)return;
          neueOptionen('beirat_id',r.beirat||[]);neueOptionen('unterzeichner_id',r.eigentuemer||[]);
        }catch(e){if(form.isConnected&&nr===personenVersion)fehler(e);}
      }
      inputs.objekt_id.addEventListener('change',ladePersonen);inputs.datum.addEventListener('change',ladePersonen);
      for(const key of ['beirat_id','unterzeichner_id'])inputs[key].disabled=!inputs.objekt_id.value;
      const start=inputs.ort.closest('.field').parentElement,street=inputs.ort_strasse.closest('.field').parentElement,description=inputs.ort_beschreibung.closest('.field').parentElement;
      const section=el('section',{'aria-label':'Versammlungsort',class:'cu-karte',style:'padding:16px;margin:12px 0'},[el('h3',{text:'Versammlungsort'})]);form.insertBefore(section,start);section.append(start,street,description);
      for(const [key,max] of Object.entries({ort:200,ort_strasse:200,ort_plz:20,ort_stadt:100,ort_beschreibung:2000}))inputs[key].maxLength=max;

      const ortFelder=['ort','ort_strasse','ort_plz','ort_stadt','ort_beschreibung'];
      const auswahl=el('select',{id:'etv-ort-auswahl','aria-label':'Versammlungsort / Raum'});
      const info=el('p',{class:'small muted',role:'status'});let ortVersion=0,orte=gespeicherteOrte;
      inputs.ort.type='hidden';const wrap=inputs.ort.closest('.field');
      wrap.querySelector('label').textContent='Versammlungsort / Raum';wrap.querySelector('label').htmlFor=auswahl.id;wrap.append(auswahl);
      function uebernehmen(o){for(const key of ortFelder)inputs[key].value=o?.[key]||'';}
      function optionen(current){
        auswahl.replaceChildren(el('option',{value:'',text:inputs.objekt_id.value?'– Versammlungsort auswählen –':'– Zuerst Objekt wählen –'}));
        for(const o of orte)auswahl.append(el('option',{value:String(o.id),text:[o.ort,o.ort_strasse,[o.ort_plz,o.ort_stadt].filter(Boolean).join(' '),o.ort_beschreibung].filter(Boolean).join(' · ')}));
        if(current?.ort){
          const found=orte.find(o=>ortFelder.every(k=>(o[k]||'')===(current[k]||'')));
          if(found)auswahl.value=String(found.id);else{auswahl.append(el('option',{value:'aktuell',text:current.ort+' · Aktuelle Versammlung'}));auswahl.value='aktuell';}
        }
        auswahl.disabled=!inputs.objekt_id.value;
        neuerOrt.disabled=!inputs.objekt_id.value;
        info.textContent=inputs.objekt_id.value?'Orte werden ausschließlich für dieses Objekt gespeichert.':'Bitte zuerst ein Objekt wählen.';
      }
      auswahl.addEventListener('change',()=>uebernehmen(orte.find(o=>String(o.id)===auswahl.value)));
      const neuerOrt=el('button',{type:'button',text:'Neuen Ort hinzufügen',onclick:()=>{
        const objekt=inputs.objekt_id.value;if(!objekt)return;
        const fields=[{name:'ort',label:'Bezeichnung / Raum',required:true},{name:'ort_strasse',label:'Straße und Hausnummer'},{name:'ort_plz',label:'Postleitzahl'},{name:'ort_stadt',label:'Ort'},{name:'ort_beschreibung',label:'Beschreibung',type:'textarea'}];
        const neu=formular([{felder:fields}]);let busy=false;
        for(const [key,input] of Object.entries(neu.inputs)){const label=neu.form.querySelector('label[for="'+input.id+'"]');input.id='etv-neu-'+key;if(label)label.htmlFor=input.id;}
        for(const [key,max] of Object.entries({ort:200,ort_strasse:200,ort_plz:20,ort_stadt:100,ort_beschreibung:2000}))neu.inputs[key].maxLength=max;
        const error=el('p',{role:'alert',class:'cu-rechnung-fehler'});neu.form.append(error);
        let submit;
        async function speichern(close){
          if(busy||!neu.form.reportValidity())return;busy=true;submit.disabled=true;
          try{
            const o=await API.post('/objekte/'+objekt+'/versammlungsorte',neu.werte());
            if(form.isConnected&&inputs.objekt_id.value===objekt){
              ortVersion++;orte=orte.filter(r=>r.id!==o.id).concat(o);optionen(o);uebernehmen(o);
            }
            toast('Versammlungsort für dieses Objekt gespeichert','success');close();
          }catch(e){error.textContent=e.message;}finally{busy=false;submit.disabled=false;}
        }
        const m=modal({titel:'Neuer Versammlungsort · Objekt '+(objekte.find(o=>String(o.id)===objekt)?.nummer||objekt),inhalt:neu.form,footer:close=>[el('button',{text:'Abbrechen',onclick:close}),submit=el('button',{text:'Ort speichern',class:'btn-primary',onclick:()=>speichern(close)})]});
        neu.form.addEventListener('submit',e=>{e.preventDefault();speichern(m.close);});
      }});
      wrap.append(neuerOrt,info);
      optionen(x);
      inputs.objekt_id.addEventListener('change',async()=>{
        const nr=++ortVersion,objekt=inputs.objekt_id.value;orte=[];uebernehmen(null);optionen(null);
        if(!objekt)return;auswahl.disabled=true;neuerOrt.disabled=true;info.textContent='Versammlungsorte werden geladen …';
        try{const rows=await API.get('/objekte/'+objekt+'/versammlungsorte');if(!form.isConnected||nr!==ortVersion)return;orte=rows;optionen(null);}
        catch(e){if(nr===ortVersion&&form.isConnected){auswahl.disabled=true;neuerOrt.disabled=false;info.textContent='Orte konnten nicht geladen werden: '+e.message;}}
      });

    },
    speichern: async(w)=>{if(!w.leitung_id)throw new Error('Bitte eine Versammlungsleitung auswählen.');const r=await (bearb?API.put('/versammlungen/'+x.id,w):API.post('/versammlungen',w));gespeichertId=r?.id||gespeichertId;if(r?.kalender_status==='fehler')toast('Versammlung gespeichert. '+r.kalender_meldung,'error');if(r?.teams_status==='fehler')toast('Versammlung gespeichert. '+r.teams_meldung,'error');return r;},
    loeschen: bearb&&!container ? async()=>{await API.del('/versammlungen/'+x.id);gespeichertId=null;} : null,
    loeschFrage: `Versammlung „${x.name}" endgültig löschen?`,
    danach: ()=>gespeichertId?geheZu('#/etv/'+gespeichertId):neuLaden(),
  });
}

function etvMaske(params = new URLSearchParams()) {
  const lauf = S.lauf;
  const tab = params.get('tab') === 'archiv' ? 'archiv' : 'uebersicht';
  const schreiben = darfSchreiben();
  let sort = 'desc';
  S.kontext = { typ: 'etv', erstellen: () => versammlungForm(null) };
  const suche = el('input', { type: 'search', class: 'cu-karten-suche', placeholder: 'Versammlung, Objekt oder Objekt-ID suchen …', 'aria-label': 'Versammlungen suchen' });
  S.kontext.suchfeld = suche;
  const box = el('div', { class: 'cu-etv-liste' });

  const aktionKnopf = (ic, titel, onclick) => el('button', { type: 'button', class: 'cu-icon-knopf', title: titel, 'aria-label': titel, onclick }, [icon(ic)]);
  async function laden() {
    try {
      const daten = await API.get('/versammlungen' + API.qs({ archiv: tab === 'archiv' ? '1' : '', suche: suche.value, sort }));
      if (lauf !== S.lauf) return;
      const r = raster([
        { label: 'Nr.', class: 'nowrap', render: (v) => (v.nummer == null ? '' : String(v.nummer)) },
        { label: 'Status', render: (v) => { const st = ETV_STATUS[v.status] || ETV_STATUS.vorbereitung; return el('span', { class: 'cu-etv-status ' + st.cls, title: st.text, role: 'img', 'aria-label': st.text }, [icon(st.icon)]); } },
        { label: 'Name', render: (v) => el('strong', { text: v.name }) },
        { label: 'Objekt-ID', class: 'nowrap', render: (v) => v.objekt_nummer },
        { label: 'Objekt', render: (v) => `${String(v.objekt_bezeichnung || '').toUpperCase()}${v.objekttyp === 'WEG' ? ' - WEG' : ''}` },
        { label: 'Datum', class: 'nowrap', render: etvDatum },
        {label:'Versammlungsort',render:v=>el('span',{title:v.ort_beschreibung||'',text:[v.ort,v.ort_strasse,[v.ort_plz,v.ort_stadt].filter(Boolean).join(' ')].filter(Boolean).join(' · ')||'–'})},
        { label: 'Art', render: (v) => { const a = ETV_ART[v.art] || ETV_ART.praesenz; return el('span', { class: 'cu-etv-art', title: a.text, role: 'img', 'aria-label': a.text }, [icon(a.icon)]); } },
        {label:'Versammlungsleitung',render:v=>v.leitung_name?(v.leitung_name+(v.leitung_kuerzel?' · '+v.leitung_kuerzel:'')):'–'},
        { label: '', class: 'aktionen', render: (v) => (schreiben ? el('span', { class: 'cu-etv-aktionen' }, [
          aktionKnopf(tab === 'archiv' ? 'auslagern' : 'einlagern', tab === 'archiv' ? 'Aus dem Archiv holen' : 'Archivieren', async () => {
            try { await API.post(`/versammlungen/${v.id}/archiv`, { archiviert: tab !== 'archiv' }); toast(tab === 'archiv' ? 'Wieder in der Übersicht' : 'Archiviert', 'success'); laden(); } catch (e) { fehler(e); }
          }),
          el('a',{href:'#/etv/'+v.id,text:'Tagesordnung',onclick:e=>e.stopPropagation()}),
          el('button',{type:'button',text:'Teilnehmer',onclick:e=>{e.stopPropagation();teilnehmerDialog(v.id).catch(fehler);}}),
          aktionKnopf('copy', 'Kopieren (z. B. für das nächste Jahr)', () => versammlungForm(v, { kopie: true })),
          aktionKnopf('trash', 'Löschen', async () => {
            if (!(await bestaetigen(`Versammlung „${v.name}" (${v.objekt_nummer}, ${etvDatum(v)}) endgültig löschen?`, { danger: true, text: 'Löschen' }))) return;
            try { await API.del('/versammlungen/' + v.id); toast('Gelöscht', 'success'); laden(); } catch (e) { fehler(e); }
          }),
        ]) : '') },
      ], daten, { onOpen: (v) => (schreiben ? versammlungForm(v) : null), leer: tab === 'archiv' ? 'Keine archivierten Versammlungen.' : suche.value ? 'Keine Versammlung gefunden.' : 'Noch keine Versammlungen – „Versammlung anlegen" klicken.', klasse: 'cu-etv-tabelle' });
      // Datum-Spalte sortierbar (wie im Vorbild: Pfeil am Spaltenkopf)
      const th = r.querySelectorAll('th')[5];
      th.replaceChildren(el('button', { type: 'button', class: 'cu-sortierknopf', title: sort === 'desc' ? 'Neueste zuerst – klicken für älteste zuerst' : 'Älteste zuerst – klicken für neueste zuerst',
        onclick: () => { sort = sort === 'desc' ? 'asc' : 'desc'; laden(); } }, [el('span', { text: 'Datum' }), icon(sort === 'desc' ? 'arrowDown' : 'arrowUp', 'cu-klein')]));
      box.replaceChildren(r);
      status(`${daten.length} Versammlung(en)`);
    } catch (e) { fehler(e); }
  }
  suche.addEventListener('input', debounce(laden, 250));

  zeigeAufDesktop(lauf, maskenFenster({
    titel: 'ETV – Versammlungen',
    kopf: { brot: [{ text: 'Übersicht', href: '#/' }, { text: 'ETV' }, { text: tab === 'archiv' ? 'Archiv' : 'Versammlungen' }], ueberschrift: 'Versammlungen', drucken: false },
    inhalt: el('div', {}, [
      reiterLeiste([{ key: 'uebersicht', label: 'Übersicht' }, { key: 'archiv', label: 'Archiv' }], tab, '#/etv'),
      el('div', { class: 'cu-etv-werkzeug' }, [
        el('div', { class: 'cu-suche-klein' }, [icon('search'), suche]),
        el('span', { class: 'hp-spacer' }),
        schreiben ? el('button', { type: 'button', class: 'btn-primary cu-knopf', onclick: () => versammlungForm(null) }, [icon('plus'), el('span', { text: 'Versammlung anlegen' })]) : null,
      ]),
      box,
    ]),
  }));
  laden();
}

// ---------------------------------------------------------------------
//  Benutzerverwaltung (System)
// ---------------------------------------------------------------------
async function benutzerMaske() {
  const lauf = S.lauf;
  if (!istAdmin()) { toast('Nur für Administratoren.', 'error'); return geheZu('#/'); }
  let daten;
  try { daten = await API.get('/benutzer'); } catch (e) { fehler(e); return geheZu('#/'); }
  if (lauf !== S.lauf) return;
  let microsoft;
  try { microsoft = await m365KonfigurationsPanel(); }
  catch (e) { microsoft = abschnitt('Microsoft 365', el('p', { role: 'alert', text: e.message })); }
  if (lauf !== S.lauf) return;
  S.kontext = { typ: 'benutzer', erstellen: () => benutzerFormular() };
  zeigeAufDesktop(lauf, maskenFenster({
    titel: 'System – Benutzerverwaltung',
    kopf: { brot: [{ text: 'Einstellungen' }, { text: 'Benutzerverwaltung' }], ueberschrift: 'Benutzerverwaltung', drucken: false },
    inhalt: maskenRaster({
      oben: [panel([
        ['Rollen', 'Administrator: alles inkl. Benutzer · Mitarbeiter: lesen & schreiben · Leser: nur ansehen'],
        ['Kunden', 'Getrennte Kundenverwaltung: Übernahme vorbereiten; noch keine Anmeldung freigeschaltet'],
      ], 'hp-such-panel')],
      seite: seitenleiste([{ text: 'Neu', titel: 'Neuen Benutzer anlegen', onclick: () => benutzerFormular() }, {text:'Kunden',onclick:()=>geheZu('#/kunden')}, {text:'KI · Eddi',onclick:()=>eddiModellDialog().catch(fehler)}]),
      unten: [abschnitt(`Mitarbeiter-Konten (${daten.length})`, raster([
        { label: 'Name', render: (b) => el('strong', { text: b.name }) },
        { label: 'Benutzername', render: (b) => b.benutzername },
        { label: 'HP-Kürzel', render: (b) => b.kuerzel || '–' },
        { label: 'Rolle', render: (b) => L.benutzerRolle[b.rolle] || b.rolle },
        { label: 'E-Mail', render: (b) => b.email },
        { label: 'Status', render: (b) => (b.aktiv ? badge('aktiv', 'badge-aktiv') : badge('gesperrt', 'badge-inaktiv')) },
        { label: '', class: 'aktionen', render: (b) => el('button', { type: 'button', class: 'hp-mini', text: 'Passwort', onclick: () => benutzerPasswort(b) }) },
      ], daten, { onOpen: (b) => benutzerFormular(b) })), microsoft],
    }),
  }));
}
