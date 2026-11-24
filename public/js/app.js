'use strict';

/* HausPerfekt 2.0 – Start, Anmeldung und Navigation (Hash-Routen).
   #/                    Startmaske (leerer Arbeitsbereich)
   #/objekte[/ID]        Objekt-Maske (ohne ID: zuletzt benutztes/erstes Objekt); #/objektliste = Suche   (?tab=einheiten|adressen|archiv|notizen)
   #/einheiten[/ID]      Wohnungs-Maske (ohne ID: zuletzt benutzte/erste); #/einheitenliste = Suche
   #/adressen[/ID]       Adress-Maske (ohne ID: zuletzt benutzte/erste Adresse); #/adressliste = Liste
   #/archiv              Zentrales Archiv (?objekt=|einheit=|adresse=|kategorie=|ohne=1)
   #/benutzer            Benutzerverwaltung (Admin) */

S.lauf = 0;

async function start() {
  try {
    S.benutzer = (await API.get('/auth/me')).benutzer;
  } catch (e) { S.benutzer = null; }
  if (!S.benutzer) { renderLogin(); return; }
  await nachAnmeldung();
}

async function nachAnmeldung() {
  if (!S.meta) S.meta = await API.get('/meta');
  baueShell();
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  if (!S.benutzer) return;
  schliesseMenue();
  document.getElementById('modal-container').innerHTML = '';
  S.lauf += 1;
  S.kontext = {};
  const h = location.hash.replace(/^#/, '') || '/';
  const [pfad, query] = h.split('?');
  const params = new URLSearchParams(query || '');
  const [bereich, id] = pfad.split('/').filter(Boolean);
  if (bereich === 'objekte') return id ? objektMaske(id, params) : maskeDirekt('objekt');
  if (bereich === 'einheiten') return id ? einheitMaske(id, params) : maskeDirekt('einheit');
  if (bereich === 'adressen') return id ? adresseMaske(id, params) : maskeDirekt('adresse');
  if (bereich === 'objektliste') return objektSuche();
  if (bereich === 'einheitenliste') return einheitSuche();
  if (bereich === 'adressliste') return adressListe();
  if (bereich === 'tickets') return ticketsMaske(id,params);
  if (bereich === 'zaehler') return zaehlerMaske(id,params);
  if (bereich === 'kalender') return vorgangKalender(params);
  if (bereich === 'hwa') return handwerkerStart();
  if (bereich === 'vorgaenge') return id ? vorgangDetail(id, params) : vorgaengeMaske(params);
  if (bereich === 'dms-uebernahme') return dmsUebernahmeMaske(params);
  if (bereich === 'hp-akten') return hpAktenMaske();
  if (bereich === 'dms') return dmsMaske(params);
  if (bereich === 'archiv') return archivMaske(params);
  if (bereich === 'etv') return id ? (['basisdaten','teilnehmer','durchfuehrung'].includes(params.get('schritt'))?versammlungSchrittMaske(id,params.get('schritt'),params):tagesordnungMaske(id)) : etvMaske(params);
  if (bereich === 'fibu') return fibuMaske();
  if (bereich === 'pkto') return personenkontoMaske(id, params);
  if (bereich === 'verwaltungen') return verwaltungenMaske();
  if (bereich === 'microsoft-konto') return microsoftKontoMaske();
  if (bereich === 'posteingang') return posteingangMaske(params);
  if (bereich === 'm365') return m365Maske();
  if (bereich === 'benutzer') return benutzerMaske();
  if (bereich === 'plaud') return plaudRueckkehr(params);
  if (bereich === 'hausperfekt') return hausperfektMaske();
  return startMaske();
}

function renderLogin() {
  document.getElementById('modal-container').innerHTML = '';
  const { form, werte } = formular([[
    { name: 'benutzername', label: 'Benutzername', required: true },
    { name: 'passwort', label: 'Passwort', type: 'password', required: true },
  ]]);
  form.querySelector('#f_benutzername').setAttribute('autocomplete', 'username');
  form.querySelector('#f_passwort').setAttribute('autocomplete', 'current-password');
  const btn = el('button', { class: 'btn-primary', type: 'submit', text: 'Anmelden', style: 'width:100%' });
  form.appendChild(btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    btn.disabled = true;
    try {
      const v = werte();
      S.benutzer = (await API.post('/auth/login', { benutzername: v.benutzername, passwort: v.passwort })).benutzer;
      if (location.hash && location.hash !== '#/') location.hash = '#/';
      await nachAnmeldung();
    } catch (e) { fehler(e); btn.disabled = false; }
  });
  const fenster = el('section', { class: 'login-card cu-karte', 'aria-label': 'Anmeldung' }, [
    el('div', { class: 'login-logo' }, [icon('building')]),
    el('h1', { class: 'cu-marke', text: APP_NAME }),
    el('p', { class: 'sub', text: 'WEG- und Mietverwaltung – Anmeldung für Mitarbeiter' }),
    form,
  ]);
  const appEl = document.getElementById('app');
  appEl.innerHTML = '';
  appEl.appendChild(el('div', { class: 'login-wrap' }, [fenster]));
  const microsoft=el('button',{type:'button',class:'btn-primary',text:'Mit Microsoft anmelden',style:'width:100%;margin:10px 0',onclick:()=>microsoftAnmelden(false)});
  API.get('/auth/microsoft/status').then(r=>{if(r.bereit&&fenster.isConnected)fenster.insertBefore(microsoft,form);}).catch(()=>{});
  const error=new URLSearchParams(location.search).get('microsoft_fehler');if(error){fenster.append(el('p',{role:'alert',text:error}));history.replaceState(null,'',location.pathname+location.hash);}

  form.querySelector('#f_benutzername').focus();
}

async function logout() {
  try { await API.post('/auth/logout', {}); } catch (e) { /* trotzdem abmelden */ }
  S.benutzer = null;
  S.kontext = {};
  schliesseMenue();
  history.replaceState(null, '', location.pathname);
  renderLogin();
}

start();
