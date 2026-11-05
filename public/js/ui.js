'use strict';

// DOM-Helfer, Modale, Toasts, Formatierung – alles auf Deutsch.
const UI = (() => {
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Element-Erzeugung: el('div', {class:'x', onclick:fn}, [kinder|text])
  function el(tag, attrs, kinder) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'value') e.value = v;
        else e.setAttribute(k, v);
      }
    }
    if (kinder != null) {
      (Array.isArray(kinder) ? kinder : [kinder]).forEach((k) => {
        if (k == null || k === false) return;
        e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
      });
    }
    return e;
  }

  function toast(nachricht, art = '') {
    const c = document.getElementById('toast-container');
    const t = el('div', { class: 'toast ' + art, role: 'status', text: nachricht });
    c.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.3s';
      setTimeout(() => t.remove(), 320);
    }, art === 'error' ? 5000 : 3000);
  }

  function fehler(e) {
    toast(e && e.message ? e.message : 'Unbekannter Fehler', 'error');
  }

  // Modal mit beliebigem Inhalt. Gibt {close} zurück.
  function modal({ titel, inhalt, footer, wide, onClose }) {
    const container = document.getElementById('modal-container');
    const box = el('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': titel });
    const backdrop = el('div', { class: 'modal-backdrop' }, [box]);
    let zu = false;
    const schliessen = () => {
      if (zu) return;
      zu = true;
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    };
    // Wie HausPerfekt: Esc = Verlassen MIT Speichern (nur bei Änderungen, sonst einfach schließen),
    // Strg+Esc = Verlassen OHNE Speichern. Wirkt nur auf das oberste Fenster.
    let escGesperrt = false;
    const onKey = (ev) => {
      if (ev.key !== 'Escape' || backdrop !== container.lastElementChild) return;
      ev.preventDefault();
      if (ev.ctrlKey || ev.metaKey) { schliessen(); return; }
      if (escGesperrt) return; // Speichern läuft bereits
      const speichern = speicherKnopf();
      if (speichern && geaendert()) {
        escGesperrt = true;
        setTimeout(() => { escGesperrt = false; }, 1500);
        speichern.click(); // schließt bei Erfolg selbst; bei Fehlern bleibt das Fenster offen
      } else schliessen();
    };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('mousedown', (ev) => { if (ev.target === backdrop) schliessen(); });

    box.appendChild(el('header', {}, [
      el('h2', { text: titel }),
      el('button', { type: 'button', class: 'modal-x', 'aria-label': 'Schließen', title: 'Schließen ohne Speichern (Strg+Esc)', text: '✕', onclick: schliessen }),
    ]));
    const body = el('div', { class: 'modal-body' });
    if (typeof inhalt === 'string') body.innerHTML = inhalt; else body.appendChild(inhalt);
    box.appendChild(body);
    if (footer) box.appendChild(el('footer', {}, footer(schliessen)));
    container.appendChild(backdrop);
    // Für Edit → „Undo Editieren": Ausgangswerte aller Felder merken
    const feldWert = (f) => (f.type === 'checkbox' || f.type === 'radio' ? f.checked : f.value);
    const startWerte = new Map(
      [...box.querySelectorAll('.modal-body input, .modal-body select, .modal-body textarea')]
        .filter((i) => i.type !== 'file')
        .map((i) => [i, feldWert(i)])
    );
    /** Wurde im Fenster etwas geändert? (auch nachträglich hinzugekommene Felder mit Inhalt) */
    const geaendert = () => [...box.querySelectorAll('.modal-body input, .modal-body select, .modal-body textarea')]
      .some((f) => f.type === 'file' ? f.files && f.files.length > 0
        : startWerte.has(f) ? feldWert(f) !== startWerte.get(f) : (f.type === 'checkbox' || f.type === 'radio' ? false : f.value !== ''));
    const speicherKnopf = () => [...box.querySelectorAll('footer .btn-primary')].find((b) => (b.textContent === 'Speichern' || b.dataset.speichern) && !b.disabled) || null;
    if (speicherKnopf()) {
      speicherKnopf().title = 'Speichern (Esc)';
      const abbr = [...box.querySelectorAll('footer button')].find((b) => b.textContent === 'Abbrechen');
      if (abbr) abbr.title = 'Ohne Speichern schließen (Strg+Esc)';
    }
    box.hpGeaendert = geaendert;
    box.hpUndo = () => {
      let n = 0;
      startWerte.forEach((wert, f) => {
        if (!f.isConnected) return;
        if (feldWert(f) === wert) return;
        if (f.type === 'checkbox' || f.type === 'radio') f.checked = wert; else f.value = wert;
        f.dispatchEvent(new Event('input', { bubbles: true }));
        f.dispatchEvent(new Event('change', { bubbles: true }));
        n++;
      });
      return n;
    };
    const erst = box.querySelector('.modal-body input, .modal-body select, .modal-body textarea') || box.querySelector('footer button');
    if (erst) erst.focus();
    return { close: schliessen, box };
  }

  function bestaetigen(frage, { text = 'Bestätigen', danger = false } = {}) {
    return new Promise((resolve) => {
      const m = modal({
        titel: 'Bestätigung',
        inhalt: el('p', { text: frage }),
        footer: (close) => [
          el('button', { text: 'Abbrechen', onclick: () => { close(); resolve(false); } }),
          el('button', { class: danger ? 'btn-danger' : 'btn-primary', text, onclick: () => { close(); resolve(true); } }),
        ],
      });
    });
  }

  // Formularfeld-Baustein. spec: {name,label,type,options,value,required,span}
  function feld(spec) {
    const id = 'f_' + spec.name;
    let input;
    if (spec.type === 'select') {
      input = el('select', { id, name: spec.name });
      (spec.options || []).forEach((o) => {
        const opt = el('option', { value: o.value, text: o.label });
        if (String(o.value) === String(spec.value ?? '')) opt.selected = true;
        input.appendChild(opt);
      });
    } else if (spec.type === 'textarea') {
      input = el('textarea', { id, name: spec.name, text: spec.value ?? '' });
    } else {
      input = el('input', { id, name: spec.name, type: spec.type || 'text', value: spec.value ?? '' });
      if (spec.step) input.step = spec.step;
      if (spec.placeholder) input.placeholder = spec.placeholder;
      if (spec.vorschlaege) input.setAttribute('list', id + '_liste');
    }
    if (spec.required) input.required = true;
    const wrap = el('div', { class: 'field' + (spec.span ? ' span-2' : '') }, [
      el('label', { for: id, text: spec.label + (spec.required ? ' *' : '') }),
      input,
    ]);
    if (spec.vorschlaege) wrap.appendChild(el('datalist', { id: id + '_liste' }, spec.vorschlaege.map((v) => el('option', { value: v }))));
    if (spec.hint) wrap.appendChild(el('div', { class: 'small muted', text: spec.hint, style: 'margin-top:4px' }));
    return { wrap, input };
  }

  // Baut ein Formular aus Feld-Specs, in Gruppen (grid). Gibt {form, werte()} zurück.
  function formular(gruppen) {
    const form = el('form', { autocomplete: 'off' });
    const inputs = {};
    gruppen.forEach((g) => {
      const container = g.grid ? el('div', { class: 'grid-' + g.grid }) : el('div');
      (g.felder || g).forEach((spec) => {
        const { wrap, input } = feld(spec);
        inputs[spec.name] = input;
        container.appendChild(wrap);
      });
      form.appendChild(container);
    });
    const werte = () => {
      const o = {};
      Object.entries(inputs).forEach(([k, i]) => { o[k] = i.value; });
      return o;
    };
    return { form, werte, inputs };
  }

  function badgeObjekttyp(typ) {
    return `<span class="badge badge-${typ === 'WEG' ? 'weg' : 'miete'}">${typ === 'WEG' ? 'WEG' : 'Miete'}</span>`;
  }

  function datum(iso) {
    if (!iso) return '–';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
  }

  function dateiGroesse(b) {
    if (b == null) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  return { esc, el, toast, fehler, modal, bestaetigen, feld, formular, badgeObjekttyp, datum, dateiGroesse };
})();
