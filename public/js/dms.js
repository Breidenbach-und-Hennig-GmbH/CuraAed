'use strict';

function dmsPfad(verbindung, dateiId) {
  return '/hausperfekt/dms/' + encodeURIComponent(verbindung) + '/dokumente' + (dateiId ? '/' + encodeURIComponent(dateiId) : '');
}
function dmsDownloadKnopf(verbindung, datei) {
  const button = el('button', { type: 'button', class: 'hp-mini', text: 'Herunterladen', disabled: false,
    title: 'Datei in CuraAed sichern und herunterladen',
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
      finally { button.disabled = false; }
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
    ]), el('p', {}, [el('button', { type: 'button', text: 'In CuraAed ansehen', onclick: () => dmsVorschau('/api' + dmsPfad(verbindung.id, d.id) + '/download', d) })]),
    el('h3', { text: 'Dateien im Archiveintrag' }),
    raster([
      { label: 'Datei', render: f => f.titel || f.dateiname },
      { label: 'Originalname', render: f => f.dateiname },
      { label: 'Größe', render: f => dateiGroesse(f.groesse) },
      { label: '', render: f => dmsDownloadKnopf(verbindung.id, f) },
    ], result.dateien, { leer: 'HP hat keine Dateiliste geliefert.' }),
    el('p', { class: 'small muted', text: 'Beim Öffnen oder Herunterladen wird die Datei dauerhaft in CuraAed gespeichert.' }),
    el('h3', { text: 'Zuordnungen in HP' }));
    let anzahl = 0;
    for (const gruppe of result.zuordnungen) {
      if (!gruppe.gesamt && !gruppe.eintraege.length) continue;
      anzahl++;
      body.append(el('h4', { text: gruppe.titel + ' (' + gruppe.gesamt + ')' }),
        el('ul', {}, gruppe.eintraege.map(item => el('li', { text: [item.hpNummer ? 'HP ' + item.hpNummer : '',
          item.objektNummer ? 'Objekt ' + item.objektNummer : '', item.name].filter(Boolean).join(' · ') }))));
      if (gruppe.gesamt > gruppe.eintraege.length) body.append(el('p', { text: 'HP liefert hier ' + gruppe.eintraege.length + ' von ' + gruppe.gesamt + ' Zuordnungen. Die Übernahme dieser weiteren Zuordnungen ist noch nicht bestätigt.' }));
    }
    if (!anzahl) body.append(el('p', { text: 'HP-Mobile liefert für diesen Archiveintrag keine Zuordnungen.' }));
  }).catch(e => { if (offen && lauf === S.lauf) body.replaceChildren(el('p', { role: 'alert', text: e.message })); });
}

async function dmsMaske(params = new URLSearchParams()) {
  const lauf = S.lauf, root = el('div', { class: 'cu-karte', style: 'padding:20px;margin:16px auto;max-width:1250px' });
  if (!zeigeAufDesktop(lauf, root)) return;
  S.kontext = { typ: 'dms' };
  const status = el('p', { role: 'status', 'aria-live': 'polite' }), uebernahme = el('div', { class: 'hp-hinweis' });
  root.append(el('h1', { text: 'Dokumente – Übernahme aus HausPerfekt' }),
    el('p', { text: 'Dokumente samt Zuordnungen dauerhaft in CuraAed übernehmen. Gesicherte Dateien bleiben auch ohne HP-Mobile erreichbar.' }),
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
  navigation.append(vorher, weiter); root.append(form, uebernahme, liste, navigation);
  async function laden(neueSeite) {
    const nr = ++version, id = verbindung.value;
    liste.replaceChildren(); vorher.disabled = weiter.disabled = true;
    if (!id) { status.textContent = 'Bitte einen HP-Kundenbestand auswählen.'; return; }
    status.textContent = 'Dokumente werden aus HP-Mobile geladen …';
    dmsUebernahme(uebernahme, id, suche.value.trim(), lauf);
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

function dmsVorschau(url, datei) {
  const content = el('div', { text: 'Datei wird in CuraAed geladen …', style:'min-height:50vh' });
  let open=true, loadingTask, renderTask;
  modal({titel:datei.titel||datei.dateiname,inhalt:content,wide:true,
    onClose:()=>{open=false;renderTask?.cancel();loadingTask?.destroy();},
    footer:close=>[el('a',{href:url,class:'btn',text:'Herunterladen'}),el('button',{text:'Schließen',onclick:close})]});
  fetch(url+'?vorschau=1',{credentials:'same-origin'}).then(async response=>{
    if(!response.ok)throw new Error((await response.json()).fehler||'Datei nicht verfügbar.');
    if(!response.headers.get('content-type')?.includes('application/pdf')){
      if(open)content.textContent='Die Datei ist in CuraAed gesichert. Dieses Dateiformat bitte herunterladen.';return;
    }
    const bytes=new Uint8Array(await response.arrayBuffer()), pdfjs=await import('/pdfjs/build/pdf.mjs');
    if(!open)return;
    pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/build/pdf.worker.mjs';
    loadingTask=pdfjs.getDocument({data:bytes,cMapUrl:'/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',isEvalSupported:false,enableXfa:false});
    const pdf=await loadingTask.promise;if(!open)return;
    let number=1,version=0;
    const canvas=el('canvas',{'aria-label':'PDF-Seite',style:'display:block;max-width:100%;margin:auto;background:white'}),
      pageLabel=el('span',{'aria-live':'polite'}),view=el('div',{style:'max-height:68vh;overflow:auto;background:#eee;padding:8px'},[canvas]),
      previous=el('button',{type:'button',text:'Vorherige Seite',onclick:()=>show(number-1)}),
      next=el('button',{type:'button',text:'Nächste Seite',onclick:()=>show(number+1)});
    content.replaceChildren(el('div',{class:'tel-plaud-knoepfe'},[previous,pageLabel,next]),view);
    async function show(n){
      if(n<1||n>pdf.numPages||!open)return;
      number=n;const current=++version;const oldTask=renderTask;oldTask?.cancel();if(oldTask)await oldTask.promise.catch(()=>{});if(!open||version!==current)return;
      pageLabel.textContent='Seite '+n+' / '+pdf.numPages;previous.disabled=n===1;next.disabled=n===pdf.numPages;
      const page=await pdf.getPage(n);if(!open||version!==current)return;
      const unscaled=page.getViewport({scale:1}),scale=Math.min(1.5,Math.max(280,view.clientWidth-16)/unscaled.width),ratio=Math.min(window.devicePixelRatio||1,2),viewport=page.getViewport({scale:scale*ratio});
      canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.width=(viewport.width/ratio)+'px';canvas.style.height=(viewport.height/ratio)+'px';
      renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});
      try{await renderTask.promise;}catch(e){if(e.name!=='RenderingCancelledException'&&open)content.textContent=e.message;}
    }
    await show(1);
  }).catch(e=>{if(open)content.textContent='Die Vorschau konnte nicht geladen werden: '+e.message;});
}
function dmsArchivOeffnen(d) {
  dmsVorschau('/api/hausperfekt/dms/archiv/' + encodeURIComponent(d.hp.quelle) + '/' + encodeURIComponent(d.hp.datei) + '/download', d);
}
async function dmsUebernahme(root, connection, search, lauf) {
  const token = {}; root.dmsToken = token;
  async function refresh() {
    try {
      const r = await API.get('/hausperfekt/dms/' + encodeURIComponent(connection) + '/uebernahme');
      if(lauf !== S.lauf || root.dmsToken !== token) return;
      const j = r.auftrag;
      const text = el('p', { role: 'status', text: r.dateien + ' Dateien dauerhaft gesichert · ' + dateiGroesse(r.bytes) + ' · ' + r.metadaten + ' Dokumentzuordnungen übernommen' + (r.fehler ? ' · ' + r.fehler + ' Dateien mit Übernahmefehler' : '') + (j ? ' · ' + (j.status === 'laeuft' ? 'Übernahme läuft, Seite ' + j.seite : j.status === 'fertig' ? 'Durchlauf abgeschlossen' : 'Übernahme angehalten') + (j.meldung ? ': ' + j.meldung : '') : '') });
      root.replaceChildren(text);
      if(!r.direktId) {
        const select = el('select', { 'aria-label': 'Zugehörige HP-Datenbank' }, [el('option', { value: '', text: 'HP-Datenbank auswählen' }), ...(r.direktQuellen || []).map(s=>el('option', { value:s.id, text:s.name + ' · ' + s.datenbank }))]);
        root.append(el('p', { text: 'Für Adress-, Objekt- und Einheitenarchive den passenden HP-Kundenbestand verbinden. Nur dieselbe Verwaltung auswählen.' }), select, el('button', { type:'button', text:'Archivzuordnung verbinden', onclick:async()=>{try{if(!select.value) return; await API.post('/hausperfekt/dms/'+encodeURIComponent(connection)+'/zuordnen',{direktId:select.value});refresh();}catch(e){fehler(e);}} }));
      }
      const start = (suche) => async () => { try { await API.post('/hausperfekt/dms/'+encodeURIComponent(connection)+'/uebernahme',{suche}); refresh(); } catch(e){fehler(e);} };
      root.append(el('button', { type:'button', text: j?.status === 'angehalten' ? 'Übernahme fortsetzen' : 'Gesamtes Archiv dauerhaft übernehmen', disabled:j?.status==='laeuft', onclick:start(j?.status==='angehalten' ? j.suche || '' : '') }));
      if(j?.status==='laeuft') root.append(el('button',{type:'button',text:'Übernahme anhalten',onclick:async()=>{try{await API.post('/hausperfekt/dms/'+encodeURIComponent(connection)+'/anhalten',{});refresh();}catch(e){fehler(e);}}}));
      if(search) root.append(el('button', { type:'button', text:'Suchtreffer dauerhaft übernehmen', disabled:j?.status==='laeuft', onclick:start(search) }));
      if(j?.status==='laeuft') setTimeout(()=>{if(lauf===S.lauf && root.dmsToken===token)refresh();},3000);
    } catch(e) { if(lauf===S.lauf && root.dmsToken===token) root.textContent=e.message; }
  }
  await refresh();
}
