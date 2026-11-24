'use strict';
async function eddiModellDialog(danach) {
  const c = await API.get('/eddi/modell'), f = formular([
    [{ name: 'modell', label: 'OpenAI-Modell', type: 'select', value: c.modell, options: c.modelle.map(value => ({ value, label: value })) }, { name: 'tageslimit', label: 'KI-Arbeitsschritte pro Tag · gesamter Betrieb', type: 'number', value: c.tageslimit, required: true }],
    [{ name: 'api_key', label: c.secret_vorhanden ? 'OpenAI-Schlüssel ersetzen (leer = behalten)' : 'OpenAI-API-Schlüssel', type: 'password', required: !c.secret_vorhanden }],
  ]), error = el('p', { role: 'status' });
  f.inputs.api_key.autocomplete = 'new-password'; f.inputs.api_key.maxLength = 500; f.inputs.tageslimit.min = '1'; f.inputs.tageslimit.max = '1000';
  let save, test;
  const m = modal({ titel: 'Eddi · OpenAI-Verbindung', wide: true,
    inhalt: el('div', { class: 'cu-eddi-anleitung' }, [el('p', { text: 'Der Schlüssel wird verschlüsselt in CuraAed gespeichert. Die OpenAI-API wird getrennt von ChatGPT abgerechnet. Ein Auftrag kann mehrere KI-Arbeitsschritte benötigen; das Tageslimit begrenzt deren Zahl und ist kein Euro-Budget.' }), f.form,
      el('p', { text: 'Heute verwendet: ' + c.verbraucht + ' KI-Arbeitsschritte.' }), el('a', { href: 'https://platform.openai.com/api-keys', target: '_blank', rel: 'noopener noreferrer', text: 'OpenAI-Schlüsselverwaltung öffnen' }),
      el('p', { text: 'Nur Administratoren können die Verbindung ändern. Vor der Verarbeitung werden Anbieter und Zustimmung im Eddi-Gespräch angezeigt.' }), error]),
    footer: close => [el('button', { text: 'Schließen', onclick: () => { f.inputs.api_key.value = ''; close(); } }),
      test = el('button', { text: 'Verbindung testen', disabled: !c.bereit, onclick: async () => { test.disabled = true; try { const r = await API.post('/eddi/modell/test', {}); error.textContent = r.verbunden ? 'OpenAI-Verbindung erfolgreich geprüft.' : 'Keine Antwort erhalten.'; } catch (e) { error.textContent = e.message; } finally { test.disabled = false; } } }),
      save = el('button', { text: 'Speichern', onclick: async () => {
        if (!f.form.reportValidity()) return; save.disabled = true;
        try { const b = f.werte(); b.api_key = String(b.api_key || '').trim(); b.tageslimit = Number(b.tageslimit); b.revision = c.revision; await API.put('/eddi/modell', b); f.inputs.api_key.value = ''; close(); toast('Eddis OpenAI-Verbindung gespeichert.'); if (danach) danach(); }
        catch (e) { error.textContent = e.message; save.disabled = false; }
      } })] });
  f.form.addEventListener('submit', e => { e.preventDefault(); save.click(); });
  return m;
}
