'use strict';

function eddiLeiste() {
  const root = el('section', { class: 'cu-eddi', 'aria-label': 'Eddi · Arbeitsassistent' });
  const input = el('input', { type: 'text', maxlength: '6000', 'aria-label': 'Auftrag an Eddi', placeholder: 'Deine Frage oder Aufgabe …', autocomplete: 'off' });
  const send = el('button', { type: 'submit', text: 'Los', title: 'Auftrag starten · Enter' });
  const form = el('form', { class: 'cu-eddi-zeile' }, [el('label', {}, [el('strong', { text: 'Eddi' }), el('span', { text: 'Hallo, ich bin Eddi, wie kann ich dir helfen?' })]), input, send]);
  const panel = el('div', { class: 'cu-eddi-panel', hidden: true });
  const transcript = el('div', { class: 'cu-eddi-verlauf', role: 'log', 'aria-label': 'Gespräch mit Eddi' });
  const state = el('p', { class: 'cu-eddi-status', role: 'status', 'aria-live': 'polite' });
  const consent = el('input', { type: 'checkbox', 'aria-label': 'Verarbeitung durch das Sprachmodell erlauben' });
  const consentText = el('span', { text: 'Sprachmodell wird geprüft …' });
  const suggestions = el('div', { class: 'cu-eddi-vorschlaege' });
  let model, busy = false, chat = null;
  const key = 'curaaed-eddi-' + S.benutzer.id;
  try { chat = sessionStorage.getItem(key); } catch {}
  const row = (who, content) => el('div', { class: 'cu-eddi-nachricht' }, [el('strong', { text: who }), el('p', { text: content })]);
  function proposal(p) {
    const d = typeof p.daten === 'string' ? JSON.parse(p.daten) : p.daten;
    const box = el('section', { class: 'cu-eddi-vorschlag' });
    const confirm = el('button', { type: 'button', text: 'Prüfen und ausführen', onclick: () => execute(true) });
    const cancel = el('button', { type: 'button', text: 'Verwerfen', onclick: () => execute(false) });
    box.append(el('strong', { text: d.art === 'wiedervorlage' ? 'Wiedervorlage · Vorschlag' : 'Notiz · Vorschlag' }),
      el('p', { text: d.titel }), el('p', { text: d.text }), el('p', { text: 'Datum: ' + (d.faellig_am || '–') + ' · Zuordnung: ' + (d.kontext ? d.kontext.typ + ' ' + (d.kontext_nummer || d.kontext.id) : 'ohne') }), confirm, cancel);
    async function execute(ausfuehren) {
      if (ausfuehren && !await bestaetigen('Diesen Vorschlag mit den angezeigten Angaben jetzt speichern?')) return;
      confirm.disabled = cancel.disabled = true;
      try {
        const r = await API.post('/eddi/aktionen/' + p.id, { ausfuehren });
        box.replaceChildren(el('p', { text: r.verworfen ? 'Vorschlag verworfen.' : 'Gespeichert.' }));
        if (r.id) box.append(el('a', { href: '#/vorgaenge/' + r.id, text: 'Gespeicherten Vorgang öffnen' }));
      } catch (e) { state.textContent = e.message; confirm.disabled = cancel.disabled = false; }
    }
    return box;
  }
  async function open() {
    panel.hidden = false;
    if (model) return;
    state.textContent = 'Eddi wird vorbereitet …';
    try {
      model = await API.get('/eddi/status');
      if (!root.isConnected) return;
      consentText.textContent = 'Meine Anfrage, die dafür gesuchten CuraAed-Daten und die von mir zur Auswertung gewählten Dokumenttexte dürfen für dieses Gespräch von ' + model.sprachmodell + ' verarbeitet werden.';
      state.textContent = model.bereit ? 'Bereit · ' + model.anleitungen + ' Arbeitsanleitungen hinterlegt. Änderungen werden vor der Ausführung gezeigt.' : 'Eddis Sprachmodell ist noch nicht verbunden. Die Einrichtung muss zuerst abgeschlossen werden.';
      if (chat) {
        const h = await API.get('/eddi/chats/' + chat);
        if (!root.isConnected) return;
        transcript.replaceChildren(...h.nachrichten.map(m => row(m.rolle === 'user' ? 'Du' : 'Eddi', m.text)));
        suggestions.replaceChildren(...h.vorschlaege.map(proposal));
      }
    } catch (e) { model = null; state.textContent = e.message; }
  }
  const close = el('button', { type: 'button', text: 'Zuklappen', onclick: () => { panel.hidden = true; send.focus(); } });
  const fresh = el('button', { type: 'button', text: 'Neues Gespräch', onclick: () => { if (busy) return; chat = null; consent.checked = false; transcript.replaceChildren(); suggestions.replaceChildren(); try { sessionStorage.removeItem(key); } catch {} state.textContent = 'Neues Gespräch.'; input.focus(); } });
  const te = eddiTeilung(root, async () => { await open(); return model; }, consent);
  panel.append(el('div', { class: 'cu-eddi-werkzeuge' }, [fresh, te.button, istAdmin() ? el('button', { type: 'button', text: 'KI einrichten', onclick: () => eddiModellDialog(() => { model=null;consent.checked=false;open(); }).catch(fehler) }) : null, istAdmin() ? el('button', { type: 'button', text: 'Anleitung hinterlegen', onclick: eddiAnleitungDialog }) : null, close]), transcript, suggestions,
    el('label', { class: 'cu-eddi-zustimmung' }, [consent, consentText]), state, te.box);
  root.append(form, panel);
  input.addEventListener('focus', open);
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); panel.hidden = true; send.focus(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (busy || !input.value.trim()) return;
    await open();
    if (!model?.bereit) return;
    if (!consent.checked) { state.textContent = 'Bitte zuerst die Verarbeitung durch das angezeigte Sprachmodell erlauben.'; consent.focus(); return; }
    const question = input.value.trim(); busy = true; send.disabled = input.disabled = fresh.disabled = true;
    transcript.append(row('Du', question)); state.textContent = 'Eddi bearbeitet deine Anfrage …';
    try {
      const r = await API.post('/eddi/fragen', { text: question, chat_id: chat, zustimmung: true });
      if (!root.isConnected) return;
      chat = r.chat_id; try { sessionStorage.setItem(key, chat); } catch {}
      transcript.append(row('Eddi', r.text)); suggestions.append(...r.vorschlaege.map(proposal));
      state.textContent = r.schritte.length ? r.schritte.join(' · ') : 'Antwort fertig.'; input.value = '';
    } catch (err) { if (root.isConnected) state.textContent = err.message; }
    finally { busy = false; send.disabled = input.disabled = fresh.disabled = false; if (root.isConnected) input.focus(); }
  });
  return root;
}

function eddiAnleitungDialog() {
  const f = formular([
    [{ name: 'titel', label: 'Titel', required: true }, { name: 'stand', label: 'Version / Stand', required: true }],
    [{ name: 'quelle_url', label: 'SharePoint-Quelle', required: true }],
    [{ name: 'text', label: 'Inhalt der Anleitung (Arbeitsstand)', type: 'textarea', required: true }],
  ]), error = el('p', { role: 'alert' });
  let save;
  modal({ titel: 'Eddi · Arbeitsanleitung hinterlegen', wide: true,
    inhalt: el('div', { class: 'cu-eddi-anleitung' }, [el('p', { text: 'Die Anleitung wird mit Quelle und Stand in CuraAed hinterlegt. SharePoint bleibt unverändert. Unvollständige oder alte Vorgaben müssen fachlich geprüft werden.' }), f.form, error]),
    footer: close => [el('button', { text: 'Abbrechen', onclick: close }), save = el('button', { text: 'Hinterlegen', onclick: async () => { if (!f.form.reportValidity()) return; save.disabled = true; try { await API.post('/eddi/anleitungen', f.werte()); close(); toast('Anleitung für Eddi hinterlegt.'); } catch (e) { error.textContent = e.message; save.disabled = false; } } })] });
  f.form.addEventListener('submit', e => e.preventDefault());
}
