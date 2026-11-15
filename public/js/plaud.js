'use strict';

/** Personal account connection and explicit selection; never auto-save a call. */
async function plaudDirektAuswaehlen(uebernehmen) {
  let zustand;
  try { zustand = await API.get('/plaud/status'); }
  catch (e) { fehler(e); return; }
  if (!zustand.verfuegbar) {
    modal({ titel: 'Plaud verbinden', inhalt: el('p', { text: 'Die direkte Plaud-Verbindung muss auf dem App-Server noch eingerichtet werden.' }),
      footer: (close) => [el('button', { type: 'button', text: 'Schließen', onclick: close })] });
    return;
  }
  if (!zustand.verbunden) {
    const info = el('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
    const link = el('a', { text: 'Bei Plaud anmelden', class: 'btn-primary plaud-anmelden', target: '_blank', rel: 'noopener noreferrer', hidden: 'hidden' });
    const inhalt = el('div', {}, [
      el('p', { text: 'Verbinde dein persönliches Plaud-Konto einmalig. Danach wählst du Gespräche hier direkt aus. Andere Mitarbeiter verwenden jeweils ihre eigene Verbindung.' }),
      el('p', { text: 'Die App liest synchronisierte Gespräche und bereits erstellte Zusammenfassungen über Plauds MCP-Dienst in den USA. Sie nimmt keine Gespräche auf und verändert nichts in Plaud.' }),
      el('p', { text: 'Die Anmeldung öffnet sich in einem neuen Tab. Dein Telefoneingang bleibt in diesem Tab erhalten. Kehre danach hierher zurück und tippe auf „Verbindung prüfen“.' }),
      link, info,
    ]);
    modal({ titel: 'Persönliches Plaud-Konto verbinden', inhalt, footer: (close) => {
      const starten = el('button', { type: 'button', class: 'btn-primary', text: 'Weiter zur Plaud-Anmeldung', onclick: async () => {
        starten.disabled = true;
        info.textContent = 'Anmeldung wird vorbereitet …';
        try {
          const r = await API.post('/plaud/verbinden', { zustimmung: true });
          const url = new URL(r.url);
          if (url.origin !== 'https://mcp.plaud.ai' || url.pathname !== '/authorize') throw new Error('Unbekannte Plaud-Anmeldeadresse.');
          link.href = url.href;
          link.hidden = false;
          info.textContent = 'Tippe auf „Bei Plaud anmelden“. Nach der Anmeldung hier die Verbindung prüfen.';
          pruefen.hidden = false;
        } catch (e) { info.textContent = e.message; starten.disabled = false; }
      } });
      const pruefen = el('button', { type: 'button', text: 'Verbindung prüfen', hidden: 'hidden', onclick: async () => {
        pruefen.disabled = true;
        try {
          const s = await API.get('/plaud/status');
          if (s.verbunden) { close(); await plaudDirektAuswaehlen(uebernehmen); }
          else info.textContent = 'Noch nicht verbunden. Bitte die Anmeldung im anderen Tab abschließen.';
        } catch (e) { info.textContent = e.message; }
        finally { pruefen.disabled = false; }
      } });
      return [starten, pruefen, el('button', { type: 'button', text: 'Abbrechen', onclick: close })];
    } });
    return;
  }

  const liste = el('div', { class: 'plaud-gespraeche' });
  const status = el('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  const notizen = el('select', { id: 'plaud-notiz', 'aria-label': 'Zusammenfassung auswählen', hidden: 'hidden' });
  const text = el('textarea', { id: 'plaud-vorschau', rows: '9', 'aria-label': 'Plaud-Zusammenfassung prüfen und bearbeiten', hidden: 'hidden' });
  const nutzen = el('button', { type: 'button', class: 'btn-primary', text: 'In Telefoneingang übernehmen', disabled: 'disabled', onclick: () => {
    if (uebernehmen(text.value)) fenster.close();
    else status.textContent = 'Die Bemerkung ist leer oder zusammen mit dem vorhandenen Text zu lang. Bitte den Text hier kürzen oder zuerst die vorhandene Bemerkung bearbeiten.';
  } });
  let seite = 1, ladung = 0, ausgewaehlteNotizen = [];
  const vorher = el('button', { type: 'button', text: 'Neuere Gespräche', disabled: 'disabled', onclick: () => laden(seite - 1) });
  const weiter = el('button', { type: 'button', text: 'Ältere Gespräche', disabled: 'disabled', onclick: () => laden(seite + 1) });
  const auswahlLeeren = () => { nutzen.disabled = true; notizen.hidden = text.hidden = true; text.value = ''; ausgewaehlteNotizen = []; };
  async function waehlen(gespraech) {
    const lauf = ++ladung;
    auswahlLeeren();
    status.textContent = 'Zusammenfassung wird aus Plaud geladen …';
    try {
      const r = await API.get('/plaud/gespraeche/' + encodeURIComponent(gespraech.id) + '/notizen');
      if (lauf !== ladung || !liste.isConnected) return;
      ausgewaehlteNotizen = r.notizen;
      if (!r.notizen.length) { status.textContent = 'Für dieses Gespräch ist noch keine Zusammenfassung verfügbar. Bitte in Plaud erstellen und synchronisieren lassen.'; return; }
      notizen.replaceChildren(...r.notizen.map((n, i) => el('option', { value: i, text: n.titel })));
      notizen.value = '0';
      text.value = r.notizen[0].text;
      notizen.hidden = r.notizen.length === 1;
      text.hidden = false;
      nutzen.disabled = false;
      status.textContent = gespraech.name + ' – Zusammenfassung prüfen; gespeichert wird erst mit „Ok“ im Telefoneingang.';
    } catch (e) { if (lauf === ladung) status.textContent = e.message; }
  }
  notizen.addEventListener('change', () => { text.value = ausgewaehlteNotizen[Number(notizen.value)].text; });
  async function laden(neueSeite) {
    const lauf = ++ladung;
    auswahlLeeren();
    vorher.disabled = weiter.disabled = true;
    liste.replaceChildren();
    status.textContent = 'Gespräche werden aus deinem Plaud-Konto geladen …';
    try {
      const r = await API.get('/plaud/gespraeche?seite=' + neueSeite);
      if (lauf !== ladung || !liste.isConnected) return;
      seite = neueSeite;
      liste.replaceChildren(...r.gespraeche.map((g) => {
        const d = new Date(g.datum);
        return el('button', { type: 'button', class: 'plaud-gespraech', onclick: () => waehlen(g) }, [
          el('strong', { text: g.name }), el('span', { class: 'small', text: Number.isNaN(d.getTime()) ? 'Datum nicht verfügbar' : d.toLocaleString('de-DE') }),
        ]);
      }));
      status.textContent = r.gespraeche.length ? 'Gespräch auswählen. Angezeigt werden deine persönlichen, synchronisierten Plaud-Dateien.' : 'Keine Gespräche gefunden. Bitte Plaud Cloud Sync einschalten und die Verarbeitung in Plaud abschließen.';
      vorher.disabled = seite === 1;
      weiter.disabled = !r.weitere;
    } catch (e) { if (lauf === ladung) status.textContent = e.message; }
  }
  const fenster = modal({ titel: 'Gespräch aus Plaud auswählen', wide: true,
    inhalt: el('div', { class: 'plaud-auswahl' }, [el('p', { class: 'small', text: 'Persönliches Plaud-Konto verbunden. Es wird nur das ausgewählte Gespräch in die Notiz übernommen.' }),
      liste, el('div', { class: 'tel-plaud-knoepfe' }, [vorher, weiter]), status, notizen, text]),
    footer: (close) => [nutzen,
      el('button', { type: 'button', text: 'Erneut laden', onclick: () => laden(seite) }),
      el('button', { type: 'button', text: 'Verbindung entfernen', onclick: () => {
        modal({ titel: 'Persönliche Plaud-Verbindung entfernen?', inhalt: el('p', { text: 'Die gespeicherte Verbindung dieser App wird entfernt. Deine Plaud-Gespräche und bereits gespeicherten Telefoneingänge bleiben erhalten. Die Freigabe kannst du zusätzlich in deinem Plaud-Konto widerrufen.' }),
          footer: (closeFrage) => [el('button', { type: 'button', text: 'Verbindung entfernen', onclick: async (ev) => {
            ev.target.disabled = true;
            try { await API.post('/plaud/trennen', {}); closeFrage(); close(); }
            catch (e) { fehler(e); ev.target.disabled = false; }
          } }), el('button', { type: 'button', text: 'Abbrechen', onclick: closeFrage })] });
      } }), el('button', { type: 'button', text: 'Schließen', onclick: close })],
  });
  await laden(1);
}

async function plaudRueckkehr(params) {
  const lauf=S.lauf;
  let ok = false;
  try { ok = params.get('status') === 'verbunden' && (await API.get('/plaud/status')).verbunden; }
  catch (e) { fehler(e); }
  const root=el('section', { class: 'plaud-rueckkehr' }, [
    el('p', { text: 'Wechsle zurück zum ursprünglichen App-Tab. Dein Telefoneingang ist dort weiterhin geöffnet. Tippe dort auf „Verbindung prüfen“.' }),
    el('a', { href: '#/', text: 'Zur App-Übersicht' }),
  ]);
  arbeitsMaske(lauf,root,{titel:ok?'Plaud ist verbunden':'Plaud-Anmeldung abgebrochen',aktionen:[{text:'Übersicht',onclick:()=>geheZu('#/')}]});
}
