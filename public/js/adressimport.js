'use strict';

function adressImportMaske() {
  const lauf = S.lauf, root = el('section', { class: 'cu-adressimport' });
  if (!istAdmin()) { fehler(new Error('Adressimport ist nur für Administratoren verfügbar.')); return; }
  const file = el('input', { type: 'file', accept: '.csv,.xlsx', 'aria-label': 'Adressliste auswählen' });
  const status = el('p', { role: 'status', 'aria-live': 'polite', text: 'CSV oder Excel (XLSX), erste Zeile = Spaltenüberschriften. Höchstens 500 Adressen / 1 MB.' });
  const zuordnung = el('div', { class: 'cu-import-zuordnung' }), preview = el('div', { class: 'cu-import-vorschau' });
  let datei, proof, version = 0, busy = false;
  const inputs = {};
  const check = el('button', { type: 'button', text: 'Vorschau prüfen · F2', disabled: true, onclick: pruefen });
  const take = el('button', { type: 'button', text: 'Übernehmen', disabled: true, onclick: uebernehmen });
  if (!arbeitsMaske(lauf, root, { titel: 'Adresslisten übernehmen', aktionen: [
    { text: 'Datei wählen', onclick: () => file.click() },
    { text: 'Prüfen · F2', onclick: () => check.click() },
    { text: 'Übernehmen', onclick: () => take.click() },
    { text: 'Adressen', onclick: () => geheZu('#/adressliste') },
  ] })) return;
  root.append(el('div', { class: 'cu-import-datei' }, [file, check, take]), status,
    el('p', { text: 'Nur neue Adressen werden angelegt. Mögliche Dubletten und fehlerhafte Zeilen bleiben unverändert und werden übersprungen. Adressnummern vergibt CuraAed; bei aktivierter HP-Neuanlage wird anschließend die HP-Nummer gespiegelt.' }), zuordnung, preview);
  const aktuell = v => version === v && lauf === S.lauf && root.isConnected;
  const body = () => ({ datei, zuordnung: Object.fromEntries(Object.entries(inputs).filter(([, x]) => x.value !== '').map(([f, x]) => [f, Number(x.value)])) });
  function sperren(value) {
    busy = value; file.disabled = value;
    for (const x of Object.values(inputs)) x.disabled = value;
    check.disabled = value || !datei;
    take.disabled = value || !proof?.neu;
  }
  function invalidate() { version++; proof = null; preview.replaceChildren(); take.disabled = true; }
  file.addEventListener('change', async () => {
    invalidate(); datei = null; zuordnung.replaceChildren();
    for (const key of Object.keys(inputs)) delete inputs[key];
    check.disabled = true;
    const f = file.files?.[0], v = version;
    if (!f) return;
    if (f.size > 1024 * 1024 || !/\.(csv|xlsx)$/i.test(f.name)) { status.textContent = 'Bitte CSV oder XLSX bis 1 MB auswählen.'; return; }
    sperren(true); status.textContent = 'Spalten werden gelesen …';
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.')); reader.readAsDataURL(f);
      });
      const r = await API.post('/adressimport/datei', { datei: data });
      if (!aktuell(v)) return;
      datei = data;
      for (const [field, label] of Object.entries(r.felder)) {
        const select = el('select', { id: 'import_' + field }, [el('option', { value: '', text: 'Nicht übernehmen' }), ...r.kopf.map((text, i) => el('option', { value: String(i), text: (i + 1) + ' · ' + text }))]);
        select.value = r.zuordnung[field] == null ? '' : String(r.zuordnung[field]);
        select.addEventListener('change', () => { invalidate(); status.textContent = 'Spaltenzuordnung geändert. Vorschau erneut prüfen.'; });
        inputs[field] = select;
        zuordnung.append(el('label', { for: select.id }, [el('span', { text: label }), select]));
      }
      status.textContent = r.anzahl + ' Tabellenzeilen gelesen. Spalten zuordnen und Vorschau prüfen. Nicht zugeordnete Spalten werden ignoriert.';
    } catch (e) { if (aktuell(v)) status.textContent = e.message; }
    finally { if (aktuell(v)) sperren(false); }
  });
  async function pruefen() {
    if (busy || !datei) return;
    invalidate(); const v = version; sperren(true); status.textContent = 'Adressen und Dubletten werden geprüft …';
    try {
      const r = await API.post('/adressimport/vorschau', body());
      if (!aktuell(v)) return;
      proof = r;
      status.textContent = r.neu + ' neue Adressen · ' + r.dubletten + ' mögliche Dubletten · ' + r.fehler + ' fehlerhafte Zeilen. Nur die neuen, gültigen Adressen werden übernommen.';
      preview.replaceChildren(raster([
        { label: 'Zeile', render: x => x.zeile },
        { label: 'Name', render: x => x.adresse?.firmenname || [x.adresse?.vorname, x.adresse?.nachname].filter(Boolean).join(' ') },
        { label: 'Anschrift', render: x => [x.adresse?.strasse, x.adresse?.plz, x.adresse?.ort].filter(Boolean).join(' ') },
        { label: 'E-Mail', render: x => x.adresse?.email || '' },
        { label: 'Prüfung', render: x => x.status === 'neu' ? 'Neu' : x.status === 'dublette' ? 'Dublette · ' + x.meldung : 'Fehler · ' + x.meldung },
      ], r.zeilen, { leer: 'Keine Adresszeilen gefunden.' }));
    } catch (e) { if (aktuell(v)) status.textContent = e.message; }
    finally { if (aktuell(v)) sperren(false); }
  }
  async function uebernehmen() {
    if (busy || !proof?.neu) return;
    if (!await bestaetigen(proof.neu + ' neue Adressen jetzt anlegen? Dubletten und fehlerhafte Zeilen werden übersprungen.')) return;
    const v = version; sperren(true);
    try {
      const r = await API.post('/adressimport/uebernehmen', { ...body(), pruefsumme: proof.pruefsumme });
      if (!aktuell(v)) return;
      proof = null; status.textContent = r.angelegt.length + ' Adressen angelegt · ' + r.uebersprungen + ' Zeilen übersprungen.';
      preview.replaceChildren(raster([{ label: 'Dateizeile', render: x => x.zeile }, { label: 'Adress-Nr.', render: x => el('a', { href: '#/adressen/' + x.id, text: x.nummer }) }, { label: 'Name', render: x => x.name }], r.angelegt));
    } catch (e) { if (aktuell(v)) { proof = null; status.textContent = e.message + ' Bitte erneut prüfen.'; } }
    finally { if (aktuell(v)) sperren(false); }
  }
  root.addEventListener('keydown', e => { if (e.key === 'F2') { e.preventDefault(); e.stopPropagation(); check.click(); } });
  file.focus();
}
