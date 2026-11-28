'use strict';
async function kundenMaske() {
  if (!istAdmin()) { toast('Nur für Administratoren.', 'error'); return geheZu('#/'); }
  const lauf = S.lauf, content = el('div'), result = el('div'), message = el('p', { role: 'status', 'aria-live': 'polite' });
  let exportData = null, pruefwert = null, seite = 1, request = 0, busy = false, quellen = [];
  const source = el('select', { 'aria-label': 'HP-Kundenquelle' });
  const firma = el('select', { 'aria-label': 'Firma des Kundenbestands' });
  function firmaAnzeigen() { const q = quellen.find(q => q.id === source.value); firma.value = q?.firma_id || ''; firma.disabled = !!q?.firma_id; }
  const suche = el('input', { type: 'search', 'aria-label': 'Kunden suchen', placeholder: 'HP-Nummer, Name oder E-Mail' });
  const file = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'HP-Kundenexport auswählen', style: 'display:none' });
  const next = el('button', { text: 'Weiter', type: 'button', disabled: 'disabled', onclick: () => laden(seite + 1) });
  const prev = el('button', { text: 'Zurück', type: 'button', disabled: 'disabled', onclick: () => laden(seite - 1) });
  const statusText = { vorbereitet: 'Vorbereitet', pruefen: 'Prüfen', gesperrt: 'Gesperrt' };
  function table(rows) {
    const body = el('tbody');
    for (const k of rows) body.append(el('tr', {}, [...[k.externe_id, k.name, k.email || '—', k.adressnummern || (k.adressen || []).map(a => a.hp_nummer).join(', '), statusText[k.status]+(k.aktiviert_ms?' · Zugang aktiviert':''), k.hinweise.join('; ')].map(text => el('td', { text: String(text || '') })),el('td',{},k.id?[el('button',{type:'button',class:'hp-mini',text:'Zugang',onclick:()=>zugang(k)})]:[])]));
    result.replaceChildren(el('table', {}, [el('thead', {}, [el('tr', {}, ['HP-Konto', 'Name', 'E-Mail', 'HP-Adressen', 'Status', 'Prüfhinweise', ''].map(text => el('th', { text })))]), body]));
  }
  async function zugang(k){
    try{
      const p=await API.get('/kunden/'+k.id+'/zuordnung');if(lauf!==S.lauf)return;
      const link=el('input',{type:'text',readonly:'readonly','aria-label':'Einmaliger Aktivierungslink',style:'width:100%'});
      const info=el('p',{role:'status'}), body=el('div',{},[
        el('p',{text:p.firma.name+' · '+p.name+' · '+p.email}),
        el('p',{text:p.testkonto?'Testzugang ohne echte Objekt- und Wohnungsfreigaben. Mitarbeiterrechte werden separat durch einen Administrator vergeben.':'Das Kundenportal zeigt derzeit die eigenen Objekt- und Wohnungszuordnungen. Der Einmal-Link ist sieben Tage gültig. Die Zuordnung wird bei jeder Anmeldung erneut geprüft.'}),
        ...p.objekte.map(o=>el('p',{text:'Objekt '+o.nummer+' · '+o.bezeichnung})),
        ...p.wohnungen.map(w=>el('p',{text:'Objekt '+w.objekt_nummer+' / Wohnung '+w.nummer+' · '+w.bezeichnung+' · '+(w.rolle==='eigentuemer'?'Eigentümer':'Mieter')})),link,info]);
      let busy=false;
      modal({titel:'Kundenzugang prüfen',inhalt:body,onClose:()=>{link.value='';},footer:close=>[
        el('button',{type:'button',text:'Einmal-Link erstellen',onclick:async()=>{if(busy)return;busy=true;try{const r=await API.post('/kunden/'+k.id+'/aktivierung',{pruefwert:p.pruefwert});link.value=r.link;info.textContent='Gültig bis '+new Date(r.gueltig_bis).toLocaleString('de-DE')+'. Der Link wurde nicht per E-Mail versandt.';}catch(e){info.textContent=e.message;}finally{busy=false;}}}),
        el('button',{type:'button',text:'Schließen',onclick:close})]});
    }catch(e){message.textContent=e.message;}
  }
  function ausAdressen(test=false){
    if(!source.value)return;
    const quelle=source.value, f=formular([
      [test?{name:'name',label:'Name des Testkunden',required:true}:{name:'nummern',label:'HP-Adressnummern',required:true,placeholder:'z. B. 52033; weitere Nummern mit Komma trennen'}],
      [{name:'email',label:test?'E-Mail-Adresse':'Gespeicherte E-Mail-Adresse',type:'email',required:true}]
    ]),info=el('p',{role:'status'});let busy=false;
    f.form.addEventListener('submit',e=>e.preventDefault());
    modal({titel:test?'Testkunde ohne Objektfreigabe':'Kundenzugang aus Adressen vorbereiten',inhalt:el('div',{},[
      el('p',{text:test?'Dieser Zugang dient zum Testen der Kundenanmeldung. Er erhält weder echte Objekt-/Wohnungsdaten noch Mitarbeiterrechte.':'Nur die ausdrücklich ausgewählten Adressen dieser Firma werden geprüft. Die E-Mail muss dort gespeichert sein. Mitarbeiterrechte werden nicht übernommen; eine Einladung wird noch nicht versandt.'}),f.form,info]),footer:close=>[
      el('button',{text:'Zuordnung prüfen',type:'button',onclick:async()=>{
        if(busy||!f.form.reportValidity())return;busy=true;
        try{const v=f.werte(),r=await API.post(test?'/kunden/testkonto':'/kunden/aus-adressen',test?{quelle,name:v.name,email:v.email}:{quelle,adressnummern:v.nummern.split(/[,;\s]+/).filter(Boolean).map(Number),email:v.email});close();await laden(1);await zugang(r);}
        catch(e){info.textContent=e.message;}finally{busy=false;}
      }}),el('button',{text:'Abbrechen',onclick:close})]});
  }
  async function laden(page = 1) {
    if (!source.value) return;
    const n = ++request;
    try {
      const r = await API.get('/kunden?quelle=' + encodeURIComponent(source.value) + '&seite=' + page + '&suche=' + encodeURIComponent(suche.value));
      if (lauf !== S.lauf || n !== request) return;
      seite = page; table(r.konten); prev.disabled = page <= 1; next.disabled = page * 100 >= r.gesamt;
      message.textContent = r.gesamt + ' Konten. Seite ' + page + '. ' + (r.aktivierte_konten||0) + ' Konten aktiviert; aktuelle Zugriffe werden bei jeder Anmeldung geprüft.';
    } catch (e) { if (lauf === S.lauf && n === request) message.textContent = e.message; }
  }
  file.onchange = async () => {
    const n = ++request;
    const selected = file.files[0]; pruefwert = null; exportData = null;
    if (!selected) return;
    try {
      if (selected.size > 2 * 1024 * 1024) throw new Error('Der Kundenexport darf höchstens 2 MB groß sein.');
      const parsed = JSON.parse(await selected.text());
      if (n !== request || lauf !== S.lauf) return;
      exportData = parsed;
      message.textContent = selected.name + ' geladen. Bitte Vorschau prüfen.';
    } catch (e) { message.textContent = e.message; }
  };
  source.onchange = () => { pruefwert = null; firmaAnzeigen(); laden(1); };
  suche.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); laden(1); } };
  async function vorschau() {
    if (busy) return;
    if (!exportData || !source.value) { message.textContent = 'Bitte Quelle und Exportdatei auswählen.'; return; }
    busy = true; const n = ++request;
    try {
      const r = await API.post('/kunden/vorschau', { quelle: source.value, export: exportData });
      if (lauf !== S.lauf || n !== request) return;
      pruefwert = r.pruefwert; table(r.konten); prev.disabled = next.disabled = true;
      message.textContent = r.summen.kunden + ' Kundenkonten, davon ' + r.summen.pruefen + ' zu prüfen. ' + r.summen.intern_ausgeschlossen + ' interne/technische Konten ausgeschlossen. Vorschau zeigt höchstens 100 Einträge.';
    } catch (e) { if (lauf === S.lauf) { pruefwert = null; message.textContent = e.message; } }
    finally { busy = false; }
  }
  async function uebernehmen() {
    if (busy) return;
    if (!pruefwert) { message.textContent = 'Bitte zuerst die aktuelle Vorschau prüfen.'; return; }
    busy = true;
    try {
      const r = await API.post('/kunden/uebernehmen', { quelle: source.value, export: exportData, pruefwert });
      pruefwert = null;
      if (lauf !== S.lauf) return;
      await laden(1);
      message.textContent = r.neu + ' neu vorbereitet, ' + r.aktualisiert + ' aktualisiert, ' + r.unveraendert + ' unverändert, ' + r.nicht_mehr_in_quelle + ' nicht mehr in der Quelle. Keine Anmeldung freigeschaltet und keine Einladung versandt.';
    } catch (e) { if (lauf === S.lauf) message.textContent = e.message; }
    finally { busy = false; }
  }
  if (!arbeitsMaske(lauf, content, { titel: 'Kundenverwaltung – Übernahme', brot: [{ text: 'Einstellungen' }, { text: 'Kundenverwaltung' }],
    info: [['Zugriff', 'Administrator'], ['Kundenanmeldung', 'Getrennte Aktivierung je geprüftem Konto']],
    aktionen: [{ text: 'Firma zuordnen', onclick: async () => {
      if (!source.value || !firma.value) { message.textContent = 'Bitte Firma und Quelle auswählen.'; return; }
      try {
        await API.post('/kunden/firma', { quelle: source.value, firma_id: Number(firma.value) });
        const q = quellen.find(q => q.id === source.value); q.firma_id = Number(firma.value); firma.disabled = true; pruefwert = null; await laden(1);
      } catch (e) { message.textContent = e.message; }
    } }, {text:'Aus Adresse',onclick:()=>ausAdressen()}, {text:'Testkunde',onclick:()=>ausAdressen(true)}, { text: 'Exportdatei', onclick: () => file.click() }, { text: 'Vorschau', onclick: vorschau }, { text: 'Übernehmen', onclick: uebernehmen }, { text: 'Suche', onclick: () => laden(1) }, { text: 'HP-Verbindungen', onclick: () => geheZu('#/hausperfekt') }] })) return;
  content.append(el('section', { class: 'cu-karte', style: 'padding:8px;margin:8px' }, [
    el('label', {}, ['Firma ', firma]), ' ', el('label', {}, ['HP-Quelle ', source]), ' ', suche, file,
    el('p', { class: 'hint', text: 'Eigene Kundenkonten ohne Mitarbeiterrechte. Die Übernahme bereitet Zugänge vor. Prüfen Sie die Zuordnung über „Zugang“, bevor Sie einen Einmal-Link erstellen. Gleiche E-Mail-Adressen werden nicht automatisch zusammengeführt.' }),
    message, el('div', { style: 'overflow:auto' }, [result]), el('div', {}, [prev, next]),
  ]));
  try {
    const r = await API.get('/kunden/quellen'); if (lauf !== S.lauf) return;
    quellen = r.quellen;
    firma.replaceChildren(el('option', { value: '', text: 'Firma auswählen' }), ...(r.firmen || []).map(f => el('option', { value: f.id, text: f.name })));
    source.replaceChildren(...r.quellen.map(q => el('option', { value: q.id, text: (q.firma_name ? q.firma_name + ' · ' : '') + q.subdomain + (q.direkt_id ? '' : ' – Adresszuordnung fehlt') })));
    firmaAnzeigen();
    if (!r.quellen.length) message.textContent = 'Bitte zuerst eine eigene HP-Archivquelle in den HP-Verbindungen einrichten.';
    else await laden(1);
  } catch (e) { if (lauf === S.lauf) message.textContent = e.message; }
}
