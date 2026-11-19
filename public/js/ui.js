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
  function modal({ titel, inhalt, footer, wide, onClose, fenster }) {
    const container = document.getElementById('modal-container');
    const box = el('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': titel });
    const backdrop = el('div', { class: 'modal-backdrop' }, [box]);
    let zu = false;
    let entfernung;
    let fensterAufraeumen = () => {};
    const schliessen = () => {
      if (zu) return;
      zu = true;
      entfernung?.disconnect();
      fensterAufraeumen();
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
    backdrop.addEventListener('mousedown', (ev) => { if (!fenster && ev.target === backdrop) schliessen(); });

    box.appendChild(el('header', {}, [
      el('h2', { text: titel }),
      el('button', { type: 'button', class: 'modal-x', 'aria-label': 'Schließen', title: 'Schließen ohne Speichern (Strg+Esc)', text: '✕', onclick: schliessen }),
    ]));
    const body = el('div', { class: 'modal-body' });
    if (typeof inhalt === 'string') body.innerHTML = inhalt; else body.appendChild(inhalt);
    box.appendChild(body);
    if (footer) box.appendChild(el('footer', {}, footer(schliessen)));
    container.appendChild(backdrop);
    entfernung = new MutationObserver(() => { if (!backdrop.isConnected) schliessen(); });
    entfernung.observe(container, { childList: true });
    if (fenster) fensterAufraeumen = listenFenster(box, fenster);
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

  // Optionales Arbeitsfenster: Position/Größe bleiben auf diesem Gerät erhalten.
  function listenFenster(box, key) {
    box.classList.add('cu-listenfenster');
    const header = box.querySelector('header'), vorher = document.activeElement;
    const storageKey = 'curaaed.fenster.' + key;
    let rect, normal, maximiert = false, ziehen = null;
    const grenzen = r => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const width = Math.min(vw - 16, Math.max(Math.min(640, vw - 16), r.width));
      const height = Math.min(vh - 16, Math.max(Math.min(360, vh - 16), r.height));
      return { width, height, left: Math.max(8, Math.min(vw - width - 8, r.left)), top: Math.max(8, Math.min(vh - height - 8, r.top)) };
    };
    const setzen = r => {
      rect = grenzen(r);
      for (const k of ['width', 'height', 'left', 'top']) box.style[k] = rect[k] + 'px';
    };
    const speichern = () => { try { localStorage.setItem(storageKey, JSON.stringify(maximiert ? normal : rect)); } catch {} };
    let saved;
    try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch {}
    const valid = saved && ['width', 'height', 'left', 'top'].every(k => Number.isFinite(saved[k]));
    setzen(valid ? saved : { width: Math.min(1180, window.innerWidth - 48), height: Math.min(740, window.innerHeight - 64), left: 24, top: 32 });
    const max = el('button', { type: 'button', class: 'modal-x', 'aria-label': 'Maximieren', title: 'Maximieren / Wiederherstellen', text: '□' });
    header.insertBefore(max, header.querySelector('.modal-x'));
    const umschalten = () => {
      if (!maximiert) { normal = { ...rect }; maximiert = true; setzen({ width: window.innerWidth - 16, height: window.innerHeight - 16, left: 8, top: 8 }); }
      else { maximiert = false; setzen(normal); }
      max.setAttribute('aria-label', maximiert ? 'Wiederherstellen' : 'Maximieren');
      max.textContent = maximiert ? '❐' : '□';
      speichern();
    };
    max.addEventListener('click', umschalten);
    header.addEventListener('dblclick', ev => { if (!ev.target.closest('button')) umschalten(); });
    const griff = el('button', { type: 'button', class: 'cu-fenster-groesse', 'aria-label': 'Fenstergröße ändern', title: 'Ziehen oder mit den Pfeiltasten vergrößern/verkleinern', text: '◢' });
    box.appendChild(griff);
    const start = (ev, art) => {
      if (ev.button !== 0 || maximiert || (art === 'bewegen' && ev.target.closest('button'))) return;
      ev.preventDefault();
      ziehen = { art, x: ev.clientX, y: ev.clientY, ...rect };
    };
    const bewegen = ev => {
      if (!ziehen) return;
      const dx = ev.clientX - ziehen.x, dy = ev.clientY - ziehen.y;
      setzen(ziehen.art === 'bewegen' ? { ...ziehen, left: ziehen.left + dx, top: ziehen.top + dy } : { ...ziehen, width: ziehen.width + dx, height: ziehen.height + dy });
    };
    const ende = () => { if (ziehen) { ziehen = null; speichern(); } };
    header.addEventListener('pointerdown', ev => start(ev, 'bewegen'));
    griff.addEventListener('pointerdown', ev => start(ev, 'groesse'));
    griff.addEventListener('keydown', ev => {
      const delta = { ArrowRight: [24, 0], ArrowLeft: [-24, 0], ArrowDown: [0, 24], ArrowUp: [0, -24] }[ev.key];
      if (!delta || maximiert) return;
      ev.preventDefault(); setzen({ ...rect, width: rect.width + delta[0], height: rect.height + delta[1] }); speichern();
    });
    const resize = () => setzen(maximiert ? { width: window.innerWidth - 16, height: window.innerHeight - 16, left: 8, top: 8 } : rect);
    document.addEventListener('pointermove', bewegen);
    document.addEventListener('pointerup', ende);
    document.addEventListener('pointercancel', ende);
    window.addEventListener('resize', resize);
    window.addEventListener('blur', ende);
    return () => {
      speichern();
      document.removeEventListener('pointermove', bewegen);
      document.removeEventListener('pointerup', ende);
      document.removeEventListener('pointercancel', ende);
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', ende);
      if (vorher?.isConnected) vorher.focus();
    };
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

  // Suchbare Auswahl: der sichtbare Name und die gespeicherte ID bleiben getrennt.
  function suchFeld(spec) {
    const id='f_'+spec.name,field=el('input',{type:'hidden',name:spec.name,id,value:spec.value||''});
    const text=el('input',{id:id+'_suche',type:'text',role:'combobox','aria-autocomplete':'list','aria-expanded':'false','aria-controls':id+'_treffer',autocomplete:'off',placeholder:spec.placeholder||'Name oder Nummer tippen …',value:spec.auswahlText||''});
    const list=el('div',{id:id+'_treffer',role:'listbox',class:'cu-such-treffer',hidden:true});
    const feedback=el('div',{class:'small muted cu-such-status',role:'status','aria-live':'polite'});
    const wrap=el('div',{class:'field cu-suchfeld'},[el('label',{for:text.id,text:spec.label+(spec.required?' *':'')}),text,field,list,feedback]);
    let rows=[],active=-1,version=0,timer,chosen=spec.auswahlText||'';
    if(spec.required)text.required=true;
    const valid=()=>text.setCustomValidity(spec.required&&!field.value?'Bitte einen Treffer aus der Liste auswählen.':'');
    const close=()=>{list.hidden=true;text.setAttribute('aria-expanded','false');text.removeAttribute('aria-activedescendant');active=-1;};
    const select=row=>{field.value=String(row.value);chosen=row.label;text.value=chosen;version++;clearTimeout(timer);close();feedback.textContent='Ausgewählt: '+chosen;valid();field.dispatchEvent(new Event('change',{bubbles:true}));};
    const highlight=i=>{active=i;[...list.children].forEach((item,n)=>item.setAttribute('aria-selected',String(n===i)));if(i>=0){text.setAttribute('aria-activedescendant',list.children[i].id);list.children[i].scrollIntoView?.({block:'nearest'});}};
    const search=async()=>{
      const query=text.value.trim(),v=++version;field.value='';valid();close();rows=[];
      if(!query){feedback.textContent='Name oder Adressnummer eingeben.';return;}
      feedback.textContent='Suche läuft …';
      try{
        const found=await spec.suchen(query);
        if(v!==version||!wrap.isConnected)return;
        rows=found.slice(0,25);active=-1;
        list.replaceChildren(...rows.map((r,i)=>el('button',{type:'button',role:'option',tabindex:'-1',id:id+'_treffer_'+i,'aria-selected':'false',text:r.label,onclick:()=>select(r)})));
        list.hidden=!rows.length;text.setAttribute('aria-expanded',String(!!rows.length));
        feedback.textContent=found.length>25?'Mehr als 25 Treffer – bitte den Namen genauer eingeben.':rows.length?rows.length+' Treffer. Mit Pfeiltasten und Enter auswählen.':'Keine passenden Personen oder Firmen gefunden.';
      }catch(e){if(v!==version||!wrap.isConnected)return;close();feedback.textContent='Suche fehlgeschlagen. Bitte erneut tippen.';}
    };
    text.addEventListener('input',ev=>{if(ev.isComposing)return;field.value='';chosen='';valid();version++;clearTimeout(timer);close();rows=[];timer=setTimeout(search,180);});
    text.addEventListener('keydown',ev=>{
      if(ev.key==='Escape'&&!list.hidden){ev.preventDefault();ev.stopPropagation();version++;close();return;}
      if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){
        if(!rows.length)return;ev.preventDefault();list.hidden=false;text.setAttribute('aria-expanded','true');highlight(ev.key==='ArrowDown'?Math.min(rows.length-1,active+1):active<0?rows.length-1:Math.max(0,active-1));return;
      }
      if(ev.key==='Enter'&&!field.value){ev.preventDefault();ev.stopPropagation();if(active>=0)select(rows[active]);else if(rows.length===1)select(rows[0]);return;}
      if(ev.key==='Tab'&&!field.value){if(active>=0)select(rows[active]);else if(rows.length===1)select(rows[0]);close();}
    });
    list.addEventListener('mousedown',ev=>ev.preventDefault());
    text.addEventListener('blur',()=>{version++;clearTimeout(timer);close();});
    text.addEventListener('focus',()=>{if(!field.value&&text.value.trim())search();});
    valid();return{wrap,input:field};
  }

  // Formularfeld-Baustein. spec: {name,label,type,options,value,required,span}
  function feld(spec) {
    if(spec.type==='suche')return suchFeld(spec);
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
    if(spec.type==='select'&&/^(objekt_id|von_objekt_id|einheit_id|handwerker_id)$/.test(spec.name)&&typeof tippSelect==='function')tippSelect(input,{label:spec.label,typ:/objekt/.test(spec.name)?'objekt':undefined});
    if (spec.vorschlaege) wrap.appendChild(el('datalist', { id: id + '_liste' }, spec.vorschlaege.map((v) => el('option', { value: v }))));
    if (spec.hint) wrap.appendChild(el('div', { class: 'small muted', text: spec.hint, style: 'margin-top:4px' }));
    return { wrap, input };
  }

  // Baut ein Formular aus Feld-Specs, in Gruppen (grid). Gibt {form, werte()} zurück.
  function formular(gruppen) {
    const form = el('form', { autocomplete: 'off', class: 'cu-formular' });
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
      const ungueltig=form.querySelector('.cu-tippfeld input:invalid');
      if(ungueltig){ungueltig.reportValidity();throw new Error('Bitte einen passenden Treffer auswählen oder das optionale Suchfeld leeren.');}
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
