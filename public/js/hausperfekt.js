'use strict';

async function hausperfektMaske() {
  const lauf = S.lauf;
  if (!zeigeAufDesktop(lauf, null)) return;
  const desktop = document.getElementById('hp-desktop');
  const meldung = el('p', { role: 'status', 'aria-live': 'polite' });
  const verbindungen = el('div');
  const ergebnis = el('div');
  const datenbereich = el('select', { 'aria-label': 'HP-Datenbereich' }, [
    ['persons', 'Personen'], ['buildings', 'Liegenschaften'], ['units', 'Einheiten'], ['addresses', 'Adressen'], ['syncs', 'HP-Aktualisierungen'],
  ].map(([value, text]) => el('option', { value, text })));
  let ausgewaehlt, seite = 1, ladung = 0;
  const vorher = el('button', { type: 'button', text: 'Vorherige Seite', disabled: 'disabled', onclick: () => laden(seite - 1) });
  const weiter = el('button', { type: 'button', text: 'Nächste Seite', disabled: 'disabled', onclick: () => laden(seite + 1) });
  async function laden(n = 1) {
    if (!ausgewaehlt) return;
    const nr = ++ladung;
    vorher.disabled = weiter.disabled = true;
    ergebnis.replaceChildren();
    meldung.textContent = 'Daten werden direkt aus dem ausgewählten HP-Kundenkonto geladen …';
    try {
      const r = await API.get('/hausperfekt/verbindungen/' + encodeURIComponent(ausgewaehlt) + '/daten/' + datenbereich.value + '?seite=' + n);
      if (nr !== ladung || lauf !== S.lauf) return;
      const rows = Array.isArray(r) ? r : r.data;
      if (!Array.isArray(rows)) throw new Error('HP hat eine unbekannte Listenform geliefert. Bitte diese Verbindung prüfen lassen.');
      const body = el('tbody');
      for (const item of rows) {
        const name = item.fullname || item.name || item.description || item.heading || [item.firstname, item.lastname].filter(Boolean).join(' ') || item.street || (item.started_at ? 'Aktualisierung ' + item.started_at : 'Datensatz ' + item.id);
        body.append(el('tr', {}, [el('td', { text: item.id }), el('td', { text: item.hp_id || item.number || '' }), el('td', { text: name })]));
      }
      ergebnis.append(el('div', { style: 'overflow-x:auto' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['HP-Mobile-ID', 'HP-Nummer', 'Bezeichnung'].map(text => el('th', { text })))]), body])]));
      seite = n; vorher.disabled = n === 1; weiter.disabled = rows.length < 50;
      meldung.textContent = rows.length + (rows.length === 1 ? ' Eintrag' : ' Einträge') + ' auf Seite ' + n + '. Die Daten werden hier nur angezeigt.';
    } catch (e) { if (nr === ladung && lauf === S.lauf) meldung.textContent = e.message; }
  }
  datenbereich.addEventListener('change', () => laden(1));
  async function verbindungenLaden() {
    const r = await API.get('/hausperfekt/verbindungen');
    if (lauf !== S.lauf) return;
    verbindungen.replaceChildren(...r.verbindungen.map(v => el('div', { class: 'tel-plaud-knoepfe' }, [
      el('button', { type: 'button', text: v.subdomain + '.hausperfekt-mobile.de', onclick: () => { ausgewaehlt = v.id; laden(1); } }),
      el('button', { type: 'button', text: 'Verbindung entfernen', onclick: async () => {
        if (!await bestaetigen('Nur diese gespeicherte Verbindung aus CuraAed entfernen? In HP bleiben alle Daten erhalten.')) return;
        try { await API.post('/hausperfekt/verbindungen/' + encodeURIComponent(v.id) + '/entfernen', {}); ++ladung; ausgewaehlt = undefined; ergebnis.replaceChildren(); await verbindungenLaden(); }
        catch (e) { fehler(e); }
      } }),
    ])));
    if (!r.verbindungen.length) verbindungen.append(el('p', { text: 'Noch kein HP-Kundenkonto verbunden.' }));
  }
  const neu = el('button', { type: 'button', class: 'btn-primary', text: 'HP-Kundenkonto verbinden', onclick: () => {
    const f = formular([[
      { name: 'hp_portal', label: 'HP-Mobile-Portaladresse', required: true, placeholder: 'https://ihre-verwaltung.hausperfekt-mobile.de/' },
      { name: 'hp_username', label: 'HP-Mobile-Benutzername / E-Mail', required: true },
      { name: 'hp_password', label: 'Bestehendes HP-Mobile-Passwort', type: 'password', required: true },
    ]]);
    const pw = f.inputs.hp_password;
    f.form.autocomplete = 'off';
    f.inputs.hp_username.autocomplete = 'off';
    // Prevent the browser from filling the current CuraAed password into HP.
    pw.autocomplete = 'new-password';
    const zustimmung = el('input', { type: 'checkbox', required: 'required' });
    f.form.append(el('p', { text: 'CuraAed überträgt diese Anmeldung verschlüsselt an die HP-Mobile-API. Das Passwort wird nicht gespeichert. Die erhaltene Verbindung wird verschlüsselt auf dem CuraAed-Server gespeichert und ist nur für deinen CuraAed-Benutzer verfügbar.' }),
      el('label', {}, [zustimmung, ' HP-Mobile über CuraAed verbinden']));
    const info = el('p', { role: 'status', 'aria-live': 'polite' });
    let senden;
    const fenster = modal({ titel: 'HP-Kundenkonto verbinden', inhalt: el('div', {}, [f.form, info]), onClose: () => { pw.value = ''; }, footer: close => [
      senden = el('button', { type: 'button', class: 'btn-primary', text: 'Verbindung prüfen und speichern', onclick: () => f.form.requestSubmit() }),
      el('button', { type: 'button', text: 'Abbrechen', onclick: close }),
    ] });
    f.form.addEventListener('submit', async ev => {
      ev.preventDefault(); if (senden.disabled || !zustimmung.checked) return;
      senden.disabled = true; info.textContent = 'HP-Anmeldung und Kundenzuordnung werden geprüft …';
      try {
        await API.post('/hausperfekt/verbinden', { portalUrl: f.inputs.hp_portal.value.trim(), benutzername: f.inputs.hp_username.value.trim(), passwort: pw.value, zustimmung: true });
        fenster.close(); await verbindungenLaden(); meldung.textContent = 'Die persönliche HP-Verbindung wurde gespeichert. Wähle sie aus, um den Datenzugriff zu prüfen.';
      } catch (e) { info.textContent = e.message; }
      finally { pw.value = ''; senden.disabled = false; }
    });
  } });
  desktop.append(el('section', { class: 'cu-karte', style: 'padding:20px;max-width:1100px;margin:16px auto' }, [
    el('h1', { text: 'HP-Verbindung einrichten' }),
    el('p', { text: 'Verbinde dein HP-Mobile-Kundenkonto und prüfe den direkten Zugriff auf dessen Daten.' }),
    el('p', { class: 'hint', text: 'Einrichtungsschritt: Die bisherigen CuraAed-Masken sind noch nicht mit HP gekoppelt. Hier werden HP-Daten nur gelesen. Änderungen werden in diesem Schritt nicht an HP übertragen.' }),
    neu, verbindungen, el('label', {}, ['Datenbereich ', datenbereich]), meldung, ergebnis,
    el('div', { class: 'tel-plaud-knoepfe' }, [vorher, weiter]),
  ]));
  try { const s = await API.get('/hausperfekt/status'); if (lauf !== S.lauf) return; neu.disabled = !s.eingerichtet; if (!s.eingerichtet) meldung.textContent = 'Die HP-Anmeldung ist auf dem CuraAed-Server noch nicht eingerichtet.'; await verbindungenLaden(); }
  catch (e) { if (lauf === S.lauf) meldung.textContent = e.message; }
}
