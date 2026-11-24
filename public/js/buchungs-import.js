'use strict';

function buchungsZeilenTabelle(zeilen) {
  const suche = el('input', { type: 'search', placeholder: 'PN, Konto, Beleg oder Text …', 'aria-label': 'Buchungen durchsuchen', style: 'max-width:250px' });
  const storno = el('input', { type: 'checkbox' });
  const box = el('div', { style: 'overflow:auto;max-height:48vh' });
  const stand = el('span', { class: 'small', 'aria-live': 'polite' });
  let seite = 0, aktuell = [];
  const zurueck = el('button', { type: 'button', text: 'Zurück', onclick: () => { seite--; zeichnen(); } });
  const weiter = el('button', { type: 'button', text: 'Weiter', onclick: () => { seite++; zeichnen(); } });
  const zeichnen = () => {
    const q = suche.value.toLowerCase().trim();
    aktuell = zeilen.filter((r) => (!storno.checked || r.storno) && (!q || `${r.pn} ${r.journal} ${r.konto} ${r.gegenkonto} ${r.beleg} ${r.text ?? r.buchtext}`.toLowerCase().includes(q)));
    seite = Math.max(0, Math.min(seite, Math.ceil(aktuell.length / 100) - 1));
    zurueck.disabled = seite === 0; weiter.disabled = (seite + 1) * 100 >= aktuell.length;
    stand.textContent = `${aktuell.length} Zeilen · Seite ${seite + 1} von ${Math.max(1, Math.ceil(aktuell.length / 100))}`;
    const tabelle = raster([
      { label: 'Status', render: (r) => r.status || 'übernommen' },
      { label: 'Datum', render: (r) => r.datum },
      { label: 'PN / Journal', render: (r) => `${r.pn} / ${r.journal}` },
      { label: 'Konto', render: (r) => r.konto },
      { label: 'Gegenkonto', render: (r) => r.gegenkonto },
      { label: 'Beleg', render: (r) => r.beleg },
      { label: 'Buchungstext', render: (r) => r.text ?? r.buchtext },
      { label: 'Soll €', class: 'zahl nowrap', render: (r) => zahlDe(r.soll_cents / 100, 2) },
      { label: 'Haben €', class: 'zahl nowrap', render: (r) => zahlDe(r.haben_cents / 100, 2) },
      { label: 'Storno', render: (r) => r.storno ? 'STORNO' : '' },
    ], aktuell.slice(seite * 100, (seite + 1) * 100), { leer: 'Keine Buchungen gefunden.' });
    // Kompakte Journalzeilen: breite Texte horizontal lesen, nicht jede Zelle umbrechen.
    tabelle.style.overflow = 'visible';
    tabelle.querySelector('table').style.minWidth = '1100px';
    tabelle.querySelector('table').style.tableLayout = 'auto';
    tabelle.querySelectorAll('th,td').forEach((zelle) => { zelle.style.whiteSpace = 'nowrap'; });
    box.replaceChildren(tabelle);
  };
  suche.addEventListener('input', () => { seite = 0; zeichnen(); });
  storno.addEventListener('change', () => { seite = 0; zeichnen(); });
  zeichnen();
  return el('div', {}, [el('div', { class: 'cu-fibu-knoepfe' }, [suche, el('label', {}, [storno, document.createTextNode(' Nur Storno')]), zurueck, weiter, stand]), box]);
}

function buchungsImportDialog(o, danach) {
  const datei = el('input', { type: 'file', accept: '.csv', 'aria-label': 'HP-Buchungsdatei' });
  const konten = el('input', { type: 'checkbox' });
  const ergebnis = el('div', { 'aria-live': 'polite' });
  let probe = null, version = 0, beschaeftigt = false, m;
  const senden = (ausfuehren, file, anlegen, pruefhash) => {
    const fd = new FormData(); fd.append('datei', file); fd.append('konten_anlegen', anlegen ? '1' : '0');
    if (pruefhash) fd.append('pruefhash', pruefhash);
    return API.upload(`/objekte/${o.id}/buchungen/import?pruefen=${ausfuehren ? '0' : '1'}`, fd);
  };
  const pruefen = async () => {
    const v = ++version; probe = null;
    m.box.querySelector('.btn-primary').disabled = true;
    if (!datei.files[0]) { ergebnis.replaceChildren(); return; }
    ergebnis.replaceChildren(el('p', { text: 'Buchungen werden geprüft …' }));
    try {
      const r = await senden(false, datei.files[0], konten.checked);
      if (v !== version) return;
      probe = r;
      ergebnis.replaceChildren(
        el('p', { text: `Objekt ${r.objektnummer} · ${r.gesamt} Zeilen · ${r.gruppen} Gruppen · ${r.neu} neu · ${r.doppelt} bereits vorhanden · ${r.storno} mit STORNO-Vermerk` }),
        el('p', { text: `Soll ${zahlDe(r.soll_cents / 100, 2)} € · Haben ${zahlDe(r.haben_cents / 100, 2)} €` }),
        r.fehlende_konten.length ? el('details', {}, [el('summary', { text: `${r.fehlende_konten.length} fehlende Konten – anzeigen` }),
          el('div', { style: 'max-height:120px;overflow:auto' }, r.fehlende_konten.map((k) => el('div', { text: `${k.nummer} ${k.art} · ${k.bezeichnung}` })))]) : null,
        ...r.fehler.map((f) => el('p', { class: 'error', text: f })),
        buchungsZeilenTabelle(r.zeilen),
        el('p', { class: 'small muted', text: 'Vorschau – noch keine Buchungen gespeichert. Vorhandene Buchungen werden nicht überschrieben. Gegenkonten werden als Originalbezug erhalten; es werden keine zusätzlichen Gegenbuchungen erzeugt. Personen- und Wohnungszuordnungen werden nicht aus Namen geraten.' }),
      );
      m.box.querySelector('.btn-primary').disabled = !r.importierbar || !r.neu;
    } catch (e) { if (v === version) ergebnis.replaceChildren(el('p', { class: 'error', text: e.message })); }
  };
  datei.addEventListener('change', pruefen); konten.addEventListener('change', pruefen);
  m = modal({ titel: `Buchungsimport · Objekt ${UI.objektNummer(o)}`, wide: true,
    inhalt: el('div', {}, [el('p', { class: 'small', text: 'HausPerfekt-Buchungsexport (CSV). Beträge und Stornovermerke werden unverändert übernommen. Fehlerhafte oder abweichende Gruppen sperren den gesamten Import.' }), datei,
      el('label', {}, [konten, document.createTextNode(' Fehlende Sach-, Bank- und Anlagekonten aus der Datei anlegen')]), ergebnis]),
    footer: (close) => [el('button', { text: 'Abbrechen', onclick: () => { version++; close(); } }),
      el('button', { text: 'Übernehmen', class: 'btn-primary', disabled: 'disabled', onclick: async (event) => {
        if (!probe?.importierbar || !probe.neu || beschaeftigt) return;
        beschaeftigt = true; event.currentTarget.disabled = true; datei.disabled = konten.disabled = true;
        try {
          const r = await senden(true, datei.files[0], konten.checked, probe.pruefhash);
          version++; close(); toast(`${r.importiert} Buchungszeilen übernommen; ${r.doppelt} bereits vorhanden.`, 'success'); danach();
        } catch (e) { fehler(e); probe = null; }
        finally { beschaeftigt = false; datei.disabled = konten.disabled = false; }
      } })],
  });
  m.box.style.width = 'min(1200px, 96vw)'; m.box.style.maxWidth = '96vw';
}

function buchungsJournalDialog(o, startjahr = new Date().getFullYear()) {
  const jahr = el('input', { type: 'number', min: '1990', max: '2100', value: String(startjahr), 'aria-label': 'Journal-Buchungsjahr', style: 'width:7em' });
  const box = el('div', {}); let version = 0;
  const laden = async () => {
    const v = ++version;
    try { const rows = await API.get(`/objekte/${o.id}/buchungen` + API.qs({ jahr: jahr.value }));
      if (v === version) box.replaceChildren(buchungsZeilenTabelle(rows));
    } catch (e) { if (v === version) box.replaceChildren(el('p', { class: 'error', text: e.message })); }
  };
  jahr.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); laden(); } });
  const m = modal({ titel: `Buchungsjournal · Objekt ${UI.objektNummer(o)}`, wide: true,
    inhalt: el('div', {}, [el('div', { class: 'cu-fibu-knoepfe' }, [jahr, el('button', { text: 'Anzeigen', onclick: laden })]), box]),
    footer: (close) => [el('button', { text: 'Schließen', onclick: close })],
  });
  m.box.style.width = 'min(1200px, 96vw)'; m.box.style.maxWidth = '96vw';
  laden();
}
