'use strict';

function dmsPfad(verbindung, dateiId) {
  return '/hausperfekt/dms/' + encodeURIComponent(verbindung) + '/dokumente' + (dateiId ? '/' + encodeURIComponent(dateiId) : '');
}
function dmsDownloadKnopf(verbindung, datei) {
  const button = el('button', { type: 'button', class: 'hp-mini', text: 'Herunterladen', disabled: datei.groesse > 64 * 1024 * 1024,
    title: datei.groesse > 64 * 1024 * 1024 ? 'Dateien über 64 MB bitte in HP-Mobile herunterladen.' : 'Datei aus HP-Mobile herunterladen',
    onclick: async () => {
      button.disabled = true;
      try {
        const response = await fetch('/api' + dmsPfad(verbindung, datei.id) + '/download', { credentials: 'same-origin' });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.fehler || 'Die Datei konnte nicht heruntergeladen werden.');
        }
        const blob = await response.blob(), url = URL.createObjectURL(blob);
        const name = (datei.dateiname || 'HP-Dokument-' + datei.id).replace(/[\\/\x00-\x1f\x7f]/g, '_');
        const link = el('a', { href: url, download: name });
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } catch (e) { fehler(e); }
      finally { button.disabled = datei.groesse > 64 * 1024 * 1024; }
    } });
  return button;
}
function dmsDetails(verbindung, datei) {
  const lauf = S.lauf, body = el('div', { text: 'Dokument und Zuordnungen werden geladen …', 'aria-live': 'polite' });
  let offen = true;
  modal({ titel: datei.titel || 'HP-Dokument', inhalt: body, wide: true, onClose: () => { offen = false; },
    footer: close => [el('button', { text: 'Schließen', onclick: close })] });
  API.get(dmsPfad(verbindung.id, datei.id)).then(result => {
    if (!offen || lauf !== S.lauf) return;
    const d = result.dokument;
    body.replaceChildren(panel([
      ['Archivnummer', d.archivnummer ?? '–'], ['Dokumentart', d.dokumentart || '–'],
      ['Datum', datum(d.datum)], ['Sachbearbeiter', d.sachbearbeiter || '–'],
      ['Buchungsjahr', d.buchungsjahr || '–'], ['HP-Kundenbestand', verbindung.subdomain],
    ]), el('p', {}, [el('a', { href: 'https://' + verbindung.subdomain + '.hausperfekt-mobile.de/documents/' + d.id,
      target: '_blank', rel: 'noopener noreferrer', text: 'In HP-Mobile öffnen' })]),
    el('h3', { text: 'Dateien im Archiveintrag' }),
    raster([
      { label: 'Datei', render: f => f.titel || f.dateiname },
      { label: 'Originalname', render: f => f.dateiname },
      { label: 'Größe', render: f => dateiGroesse(f.groesse) },
      { label: '', render: f => dmsDownloadKnopf(verbindung.id, f) },
    ], result.dateien, { leer: 'HP hat keine Dateiliste geliefert.' }),
    el('p', { class: 'small muted', text: 'Dateien über 64 MB können direkt in HP-Mobile heruntergeladen werden.' }),
    el('h3', { text: 'Zuordnungen in HP' }));
    let anzahl = 0;
    for (const gruppe of result.zuordnungen) {
      if (!gruppe.gesamt && !gruppe.eintraege.length) continue;
      anzahl++;
      body.append(el('h4', { text: gruppe.titel + ' (' + gruppe.gesamt + ')' }),
        el('ul', {}, gruppe.eintraege.map(item => el('li', { text: [item.hpNummer ? 'HP ' + item.hpNummer : '',
          item.objektNummer ? 'Objekt ' + item.objektNummer : '', item.name].filter(Boolean).join(' · ') }))));
      if (gruppe.gesamt > gruppe.eintraege.length) body.append(el('p', { text: 'HP liefert hier ' + gruppe.eintraege.length + ' von ' + gruppe.gesamt + ' Zuordnungen. Weitere Zuordnungen in HP-Mobile öffnen.' }));
    }
    if (!anzahl) body.append(el('p', { text: 'HP-Mobile liefert für diesen Archiveintrag keine Zuordnungen.' }));
  }).catch(e => { if (offen && lauf === S.lauf) body.replaceChildren(el('p', { role: 'alert', text: e.message })); });
}

async function dmsMaske(params = new URLSearchParams()) {
  const lauf = S.lauf, root = el('div', { class: 'cu-karte', style: 'padding:20px;margin:16px auto;max-width:1250px' });
  if (!zeigeAufDesktop(lauf, root)) return;
  S.kontext = { typ: 'dms' };
  const status = el('p', { role: 'status', 'aria-live': 'polite' });
  root.append(el('h1', { text: 'DMS – HP-Mobile' }),
    el('p', { text: 'Dokumente mit ihren Zuordnungen aus HausPerfekt. Dateien bleiben bei HP-Mobile und werden bei Bedarf heruntergeladen.' }),
    el('p', {}, [el('a', { href: '#/archiv', text: 'CuraAed-Archiv öffnen' }), document.createTextNode(' · '), el('a', { href: '#/hausperfekt', text: 'HP-Verbindung verwalten' })]), status);
  if (!darfSchreiben()) { status.textContent = 'Die persönliche HP-Verbindung ist für Administratoren und Mitarbeiter verfügbar.'; return; }
  const verbindung = el('select', { id: 'dms-verbindung', 'aria-label': 'HP-Kundenbestand' }),
    suche = el('input', { type: 'search', id: 'dms-suche', maxlength: '200', placeholder: 'Dokumenttitel oder Dateiname', 'aria-label': 'Dokumente suchen' }),
    suchen = el('button', { type: 'submit', text: 'Suchen' }), form = el('form', { class: 'tel-plaud-knoepfe', role: 'search' }),
    liste = el('div', { style: 'overflow-x:auto' }), navigation = el('div', { class: 'tel-plaud-knoepfe' });
  form.append(el('label', { for: 'dms-verbindung', text: 'HP-Kundenbestand' }), verbindung,
    el('label', { for: 'dms-suche', text: 'Suche' }), suche, suchen);
  let verbindungen = [], seite = 1, version = 0;
  const vorher = el('button', { type: 'button', text: 'Vorherige Seite', disabled: true, onclick: () => laden(seite - 1) });
  const weiter = el('button', { type: 'button', text: 'Nächste Seite', disabled: true, onclick: () => laden(seite + 1) });
  navigation.append(vorher, weiter); root.append(form, liste, navigation);
  async function laden(neueSeite) {
    const nr = ++version, id = verbindung.value;
    liste.replaceChildren(); vorher.disabled = weiter.disabled = true;
    if (!id) { status.textContent = 'Bitte einen HP-Kundenbestand auswählen.'; return; }
    status.textContent = 'Dokumente werden aus HP-Mobile geladen …';
    try {
      const result = await API.get(dmsPfad(id) + API.qs({ seite: neueSeite, suche: suche.value.trim() }));
      if (nr !== version || lauf !== S.lauf || id !== verbindung.value) return;
      const kunde = verbindungen.find(v => v.id === id);
      liste.append(raster([
        { label: 'Datum', render: d => datum(d.datum) },
        { label: 'Dokument', render: d => el('button', { class: 'hp-mini', type: 'button', text: d.titel || d.dateiname || 'HP-Dokument', onclick: () => dmsDetails(kunde, d) }) },
        { label: 'Art', render: d => d.dokumentart },
        { label: 'HP-Archiv', render: d => d.archivnummer ?? '–' },
        { label: 'SB', render: d => d.sachbearbeiter },
        { label: 'Größe', render: d => dateiGroesse(d.groesse) },
        { label: '', render: d => dmsDownloadKnopf(id, d) },
      ], result.dokumente, { leer: 'Keine Dokumente gefunden.' }));
      seite = result.seite; vorher.disabled = seite <= 1; weiter.disabled = !result.weitere;
      status.textContent = 'Seite ' + seite + ' · ' + result.dokumente.length + ' Dateien' + (result.gesamt === null ? '' : ' · ' + Number(result.gesamt).toLocaleString('de-DE') + ' Treffer insgesamt');
    } catch (e) { if (nr === version && lauf === S.lauf) status.textContent = e.message; }
  }
  form.addEventListener('submit', ev => { ev.preventDefault(); laden(1); });
  verbindung.addEventListener('change', () => { suche.value = ''; laden(1); });
  try {
    const result = await API.get('/hausperfekt/dms/verbindungen');
    if (lauf !== S.lauf) return;
    verbindungen = result.verbindungen;
    verbindung.replaceChildren(el('option', { value: '', text: 'Bitte auswählen' }), ...verbindungen.map(v => el('option', { value: v.id, text: v.subdomain + '.hausperfekt-mobile.de' })));
    if (!verbindungen.length) { status.textContent = 'Noch keine persönliche HP-Verbindung vorhanden. Bitte unter „HP-Verbindung verwalten“ verbinden.'; suchen.disabled = true; return; }
    const ausgew = verbindungen.find(v => v.id === params.get('verbindung')) || (verbindungen.length === 1 ? verbindungen[0] : null);
    if (ausgew) verbindung.value = ausgew.id;
    await laden(1);
  } catch (e) { if (lauf === S.lauf) status.textContent = e.message; }
}
