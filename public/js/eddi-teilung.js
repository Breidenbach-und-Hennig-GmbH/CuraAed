'use strict';

function eddiTeilung(root, modelStatus, consent) {
  const box = el('section', { class: 'cu-eddi-teilung', hidden: true, 'aria-label': 'Teilungserklärung prüfen' });
  const file = el('input', { type: 'file', accept: '.pdf,application/pdf', hidden: true, 'aria-label': 'Teilungserklärung auswählen' });
  const state = el('p', { role: 'status', 'aria-live': 'polite' }), details = el('div');
  const choose = el('button', { type: 'button', text: 'Teilungserklärung lesen', onclick: () => file.click() });
  let job, timer, revision = 0, busy = false;
  const key = 'curaaed-teilung-' + S.benutzer.id;
  try { job = sessionStorage.getItem(key); } catch {}
  root.append(file);
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; if (!f || busy) return;
    box.hidden = false; details.replaceChildren(); clearTimeout(timer); revision++;
    if (f.size > 25 * 1024 * 1024 || !/\.pdf$/i.test(f.name)) { state.textContent = 'Bitte eine PDF bis 25 MB auswählen.'; return; }
    busy = true; choose.disabled = true; state.textContent = 'PDF wird in CuraAed gespeichert und lokal gelesen …';
    try {
      const form = new FormData(); form.append('datei', f);
      const r = await API.upload('/eddi/teilungen', form); job = r.id;
      try { sessionStorage.setItem(key, job); } catch {}
      await poll();
    } catch (e) { state.textContent = e.message; }
    finally { busy = false; choose.disabled = false; file.value = ''; }
  });
  async function poll() {
    const version = revision;
    try {
      const r = await API.get('/eddi/teilungen/' + job);
      if (!root.isConnected || version !== revision) return;
      state.textContent = r.dateiname + ' · ' + ({ lesen: 'Seite ' + r.fortschritt + ' von ' + (r.gesamt || '?') + ' wird gelesen', gelesen: 'Alle ' + r.gesamt + ' Seiten lokal gelesen', auswerten: 'Objekt, Einheiten und Stimmregeln werden ausgewertet', analysiert: 'Vorschlag fertig · bitte mit dem Original vergleichen', uebernommen: 'Objekt und Einheiten angelegt', fehler: r.meldung || 'Bearbeitung unterbrochen' }[r.status] || r.status);
      details.replaceChildren();
      details.append(el('button', { type: 'button', text: 'Original-PDF anzeigen', onclick: () => dmsVorschau('/api/eddi/teilungen/' + job + '/datei', { titel: r.dateiname, original_name: r.dateiname }) }));
      if (r.objekt_id) { details.append(el('a', { href: '#/objekte/' + r.objekt_id, text: 'Angelegtes Objekt öffnen' })); return; }
      if (['lesen', 'auswerten'].includes(r.status)) { timer = setTimeout(poll, 3000); return; }
      if(r.status==='fehler'&&!r.gelesen)details.append(el('button',{type:'button',text:'PDF erneut lesen',onclick:async e=>{e.currentTarget.disabled=true;try{await API.post('/eddi/teilungen/'+job+'/lesen',{});await poll();}catch(err){state.textContent=err.message;e.currentTarget.disabled=false;}}}));
      if (r.status === 'gelesen' || (r.status === 'fehler'&&r.gelesen)) details.append(el('button', { type: 'button', text: 'Mit Eddi auswerten', onclick: async e => {
        const status = await modelStatus();
        if (!status?.bereit) { state.textContent = 'Bitte zuerst Eddis Sprachmodell verbinden.'; return; }
        if (!consent.checked) { state.textContent = 'Bitte zuerst die Verarbeitung des ausgewählten Dokumenttexts durch das angezeigte Sprachmodell erlauben.'; consent.focus(); return; }
        e.currentTarget.disabled = true;
        try { await API.post('/eddi/teilungen/' + job + '/auswerten', { zustimmung: true }); await poll(); } catch (err) { state.textContent = err.message; e.currentTarget.disabled = false; }
      } }));
      if (r.status === 'analysiert') entwurf(r.ergebnis);
    } catch (e) { if (root.isConnected && version === revision) state.textContent = e.message; }
  }
  function entwurf(d) {
    const f = formular([
      {grid:2,felder:[{ name: 'objektnummer', label: 'Neue Objekt-Nr. (leer = automatisch)' }, { name: 'bezeichnung', label: 'Objektbezeichnung', value: d.objekt.bezeichnung, required: true }]},
      {grid:3,felder:[{ name: 'strasse', label: 'Straße', value: d.objekt.strasse, required:true }, { name: 'plz', label: 'PLZ', value: d.objekt.plz, required:true }, { name: 'ort', label: 'Ort', value: d.objekt.ort, required:true }]},
    ]), units = el('tbody'), fields = [];
    const table = el('table', { class: 'hp-tabelle', 'aria-label': 'Erkannte Einheiten' }, [el('thead', {}, [el('tr', {}, ['Nr.', 'Bezeichnung', 'Art', 'Lage', 'MEA', 'Fundstelle', ''].map(text => el('th', { text })))]), units]);
    function add(w = {}) {
      const item = {}, tr = el('tr');
      for (const key of ['nummer', 'bezeichnung', 'art', 'lage', 'mea']) {
        const field = key === 'art' ? el('select', { 'aria-label': 'Einheitenart' }, Object.entries(L.einheitstyp).map(([value, text]) => el('option', { value, text }))) : el('input', { 'aria-label': ({ nummer: 'Einheitennummer', bezeichnung: 'Einheitenbezeichnung', lage: 'Lage', mea: 'Miteigentumsanteil' })[key], value: key === 'mea' ? (w.mea_original || w.mea || '') : (w[key] || '') });
        if (key === 'art') field.value = w.art || 'wohnung';
        item[key] = field; tr.append(el('td', {}, [field]));
      }
      item.row = tr; fields.push(item);
      tr.append(el('td', {}, [w.beleg ? el('details', {}, [el('summary', {text:'PDF-Seite '+w.beleg.seite}), el('p',{text:w.beleg.zitat})]) : el('span',{text:'Manuell ergänzt'})]), el('td', {}, [el('button', { type: 'button', text: 'Entfernen', onclick: () => { tr.remove(); fields.splice(fields.indexOf(item), 1); } })]));
      units.append(tr);
    }
    d.wohnungen.forEach(add);
    const checked = el('input', { type: 'checkbox', 'aria-label': 'Alle Einheiten und Nachträge geprüft' });
    const take = el('button', { type: 'button', text: 'Objekt und Wohnungen anlegen', onclick: async () => {
      if (!f.form.reportValidity()) return;
      if (!checked.checked) { state.textContent = 'Bitte alle Einheiten, MEA, Fundstellen und Nachträge prüfen und bestätigen.'; checked.focus(); return; }
      const v = f.werte(), data = { objekt: { bezeichnung: v.bezeichnung, strasse: v.strasse, plz: v.plz, ort: v.ort }, wohnungen: fields.map(item => Object.fromEntries(['nummer', 'bezeichnung', 'art', 'lage', 'mea'].map(key => [key, item[key].value]))) };
      if (!await bestaetigen('Neues Objekt mit ' + data.wohnungen.length + ' Einheiten jetzt anlegen? Das Stimmprinzip bleibt bis zur Prüfung im ETV-Tool unbestätigt.')) return;
      take.disabled = true;
      try { await API.post('/eddi/teilungen/' + job + '/uebernehmen', { daten: data, objektnummer: v.objektnummer, geprueft: true }); await poll(); }
      catch (e) { state.textContent = e.message; take.disabled = false; }
    } });
    details.append(f.form, ...(d.objekt_belege || []).map(x => el('p', { text: 'Objekt-Fundstelle · PDF-Seite ' + x.seite + ': ' + x.zitat })), el('h3', { text: 'Einheiten · Vorschlag' }), el('div', { class: 'cu-eddi-einheiten' }, [table]), el('button', { type: 'button', text: 'Einheit ergänzen', onclick: () => add() }),
      el('h3', { text: 'Stimmregeln · vor ETV fachlich prüfen' }), ...d.stimmregeln.map(r => el('p', { text: (STIMM_PRINZIP[r.prinzip] || 'Unklar') + ' · ' + r.text + '\nPDF-Seite ' + r.beleg.seite + ': ' + r.beleg.zitat })),
      ...d.hinweise.map(text => el('p', { class: 'cu-eddi-warnung', text })), el('label', { class: 'cu-eddi-zustimmung' }, [checked, el('span', { text: 'Objekt, sämtliche Einheiten, MEA und Fundstellen mit dem vollständigen Original und vorhandenen Nachträgen geprüft.' })]), take);
    f.form.addEventListener('submit', e => e.preventDefault());
  }
  box.append(state, details);
  if (job) { box.hidden = false; setTimeout(() => { if (root.isConnected) poll(); }, 0); }
  return { button: choose, box };
}
