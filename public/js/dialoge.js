'use strict';

/* HausPerfekt 2.0 – Dialoge (Formulare in Fenstern).
   Nach dem Speichern wird die aktuelle Maske per neuLaden() aktualisiert. */

const OBJEKT_ARTEN = ['Wohnungseigentümergemeinschaft (WEG)', 'Mehrfamilienhaus eines Eigentümers', 'Wohn- und Geschäftshaus',
  'Gewerbeobjekt', 'Einfamilienhaus', 'Sondereigentumsverwaltung (SEV)', 'Garagenanlage'];
const HEIZUNGSARTEN = ['Gas-Zentralheizung', 'Öl-Zentralheizung', 'Fernwärme', 'Wärmepumpe', 'Pellets', 'Gas-Etagenheizung', 'Nachtspeicher', 'Elektro'];
const WARMWASSER = ['zentral über Heizung', 'dezentral (Durchlauferhitzer)', 'Boiler', 'Solarthermie'];
const GARAGENARTEN = ['keine', 'Tiefgarage', 'Einzelgaragen', 'Carports', 'Außenstellplätze', 'Duplexparker'];

/** Objekt-Typ im Klartext (HausPerfekt: „Mehrfamilienhaus eines Eigentümers"). */
const objektTypText = (o) => o.objekt_art || (o.objekttyp === 'HP' ? 'HP-Typ noch nicht zugeordnet' : o.objekttyp === 'WEG' ? 'Wohnungseigentümergemeinschaft (WEG)' : 'Mehrfamilienhaus eines Eigentümers');

async function objektFormular(objekt) {
  const bearb = !!objekt;
  let mitarbeiter = [];
  try { mitarbeiter = await API.get('/mitarbeiter'); } catch (e) { fehler(e); }
  const o = objekt || {};
  const { form, werte } = formular([
    { grid: 3, felder: [
      { name: 'nummer', label: bearb ? 'Objekt-Nr.' : 'Objekt-Nr. (leer = automatisch)', value: o.nummer, placeholder: 'z. B. 21350' },
      { name: 'bezeichnung', label: 'Bezeichnung', required: true, value: o.bezeichnung, placeholder: 'z. B. ACKERSTRAßE 77' },
      { name: 'objekttyp', label: 'Verwaltungsart', type: 'select', options: [{ value: 'WEG', label: 'WEG-Verwaltung' }, { value: 'MIETE', label: 'Mietverwaltung' }, {value:'HP',label:'HP-Typ noch nicht zugeordnet'}], value: o.objekttyp || 'WEG' },
    ] },
    { grid: 3, felder: [
      { name: 'strasse', label: 'Straße', value: o.strasse },
      { name: 'plz', label: 'PLZ', value: o.plz },
      { name: 'ort', label: 'Ort', value: o.ort },
    ] },
    { grid: 3, felder: [
      { name: 'objekt_art', label: 'Objekt-Typ', value: o.objekt_art, vorschlaege: OBJEKT_ARTEN, placeholder: 'z. B. Mehrfamilienhaus eines Eigentümers' },
      { name: 'buero_kst', label: 'gehört zu Büro-KST', value: o.buero_kst, placeholder: 'z. B. 20020' },
      { name: 'sachbearbeiter_id', label: 'Sachbearbeiter', type: 'select', value: o.sachbearbeiter_id || '',
        options: [{ value: '', label: '–' }].concat(mitarbeiter.map((m) => ({ value: m.id, label: m.name }))) },
    ] },
    { grid: 3, felder: [1, 2, 3].map((n) => ({ name: 'gruppe' + n, label: 'Gruppe ' + n, value: o['gruppe' + n] })) },
    { grid: 3, felder: [4, 5].map((n) => ({ name: 'gruppe' + n, label: 'Gruppe ' + n, value: o['gruppe' + n] })) },
    { grid: 2, felder: [
      { name: 'heizungsart', label: 'Heizungsart', value: o.heizungsart, vorschlaege: HEIZUNGSARTEN },
      { name: 'warmwasser', label: 'Warmwasser', value: o.warmwasser, vorschlaege: WARMWASSER },
      { name: 'garagenart', label: 'Garagenart', value: o.garagenart, vorschlaege: GARAGENARTEN },
      { name: 'muellgefaesse', label: 'Müllgefäße', value: o.muellgefaesse, placeholder: 'z. B. 2× Rest 240 l, 1× Papier' },
    ] },
    { grid: 3, felder: [
      { name: 'baujahr', label: 'Baujahr', value: o.baujahr },
      { name: 'anzahl_gebaeude', label: 'Gebäude', type: 'number', value: o.anzahl_gebaeude ?? '' },
      { name: 'anzahl_eingaenge', label: 'Eingänge', type: 'number', value: o.anzahl_eingaenge ?? '' },
    ] },
    { grid: 2, felder: [
      { name: 'verkauf', label: 'Verkauf', type: 'select', options: JA_NEIN_TEXT, value: String(o.verkauf ?? 1) },
      { name: 'vermietung', label: 'Vermietung', type: 'select', options: JA_NEIN_TEXT, value: String(o.vermietung ?? 1) },
    ] },
    { felder: [{ name: 'notizen', label: 'Info', type: 'textarea', value: o.notizen }] },
  ]);
  modal({
    titel: bearb ? `Objekt ändern – ${UI.objektNummer(o)} ${o.bezeichnung}` : 'Neues Objekt',
    wide: true,
    inhalt: form,
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try {
          const v = werte();
          if (!form.reportValidity()) return;
          if (bearb) { await API.put('/objekte/' + o.id, v); toast('Objekt gespeichert', 'success'); close(); neuLaden(); }
          else { const neu = await API.post('/objekte', v); toast('Objekt angelegt', 'success'); close(); geheZu('#/objekte/' + neu.id); }
        } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());
}

function einheitFormular(objektId, einheit) {
  const bearb = !!einheit;
  const { form, werte } = formular([
    { grid: 2, felder: [
      { name: 'bezeichnung', label: 'Bezeichnung (z. B. WE 1)', required: true, value: einheit?.bezeichnung },
      { name: 'einheitstyp', label: 'Einheitstyp', type: 'select', options: opt(L.einheitstyp), value: einheit?.einheitstyp || 'wohnung' },
    ] },
    { grid: 2, felder: [
      { name: 'nummer', label: bearb ? 'Einheit-Nr.' : 'Einheit-Nr. (leer = automatisch)', value: einheit?.nummer, placeholder: 'z. B. 4010-01' },
    ] },
    { grid: 2, felder: [
      { name: 'lage', label: 'Lage (z. B. 2. OG links)', value: einheit?.lage },
      { name: 'mea', label: 'Miteigentumsanteil (WEG)', value: einheit?.mea, placeholder: 'z. B. 125/1000' },
    ] },
    { grid: 2, felder: [
      { name: 'flaeche_qm', label: 'Fläche (m²)', type: 'number', step: '0.01', value: einheit?.flaeche_qm },
      { name: 'zimmer', label: 'Zimmer', type: 'number', step: '0.5', value: einheit?.zimmer },
    ] },
    { felder: [{ name: 'notizen', label: 'Notizen', type: 'textarea', value: einheit?.notizen }] },
  ]);
  modal({
    titel: bearb ? 'Einheit bearbeiten' : 'Neue Einheit',
    inhalt: form,
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try {
          const v = werte();
          if (!form.reportValidity()) return;
          if (bearb) { await API.put('/einheiten/' + einheit.id, v); toast('Gespeichert', 'success'); close(); neuLaden(); }
          else { await API.post('/objekte/' + objektId + '/einheiten', v); toast('Einheit angelegt', 'success'); close(); geheZu(`#/objekte/${objektId}?tab=einheiten`); }
        } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());
}

/** Vorhandene Anschrift wählen; F5 startet beim zuletzt angelegten Datensatz. */
async function anschriftKopierenDialog(uebernehmen,aktiv=()=>true) {
  let letzte;
  try { letzte=await API.get('/adressen/letzte'); } catch(e) { fehler(e); return; }
  if(!aktiv())return;
  const {form,werte}=formular([{felder:[{name:'quelle_id',label:'Adresse suchen',type:'suche',required:true,
    value:letzte?.id,auswahlText:letzte?`${letzte.nummer} · ${letzte.anzeigename}`:'',
    suchen:async q=>(await API.get('/adressen'+API.qs({suche:q}))).map(x=>({value:x.id,label:`${x.nummer} · ${x.anzeigename} · ${x.strasse||''} ${x.ort||''}`}))}]}]);
  form.append(el('p',{class:'small muted',text:'Übernommen werden nur Straße, PLZ, Ort, Land und Anschriftzusatz. Name, Kontakte und Zuordnungen bleiben unverändert.'}));
  let laeuft=false;
  const m=modal({titel:'Anschrift kopieren',inhalt:form,footer:close=>[
    el('button',{text:'Abbrechen',onclick:close}),el('button',{class:'btn-primary',text:'Übernehmen',onclick:async()=>{
      if(laeuft||!form.reportValidity())return;laeuft=true;
      try {const quelle=await API.get('/adressen/'+encodeURIComponent(werte().quelle_id));if(!m.box.isConnected)return;close();uebernehmen(quelle);}
      catch(e){fehler(e);}finally{laeuft=false;}
    }})]});
  form.addEventListener('submit',ev=>{ev.preventDefault();m.box.querySelector('footer .btn-primary').click();});
}

async function anredeAuswahl(input) {
  let daten;
  try{daten=await API.get('/adressen/anreden');}catch(e){fehler(e);return;}
  if(!input.isConnected)return;
  const suche=el('input',{type:'search','aria-label':'Anrede filtern',placeholder:'Anrede tippen …'}),liste=el('div');let m;
  const zeichnen=()=>liste.replaceChildren(raster([{label:'Anrede',render:x=>x}],daten.filter(x=>x.toLocaleLowerCase('de').includes(suche.value.toLocaleLowerCase('de'))),{
    onOpen:x=>{input.value=x;input.dispatchEvent(new Event('change',{bubbles:true}));m.close();input.focus();},leer:'Keine passende Anrede. Sie können eine eigene Anrede direkt eingeben.'}));
  suche.addEventListener('input',zeichnen);suche.addEventListener('keydown',ev=>{if(ev.key==='ArrowDown'){ev.preventDefault();liste.querySelector('tr.klick')?.focus();}});
  m=modal({titel:'Anrede auswählen',inhalt:el('div',{},[suche,liste]),footer:close=>[el('button',{text:'Abbrechen',onclick:close})]});zeichnen();suche.focus();
}

function adresseFormular(a) {
  const bearb = !!a;
  const initial=Adressdaten.vorbereiten(a||{});
  const typInit = a?.adresstyp || 'person';
  const { form, werte, inputs } = formular([
    { grid: 2, felder: [
      { name: 'nummer', label:'Adress-Nr.', value: a?.nummer, placeholder:bearb?'':'leer = automatisch' },
      { name: 'suchbegriff', label:'Suchbegriff',value:initial.suchbegriff,placeholder:'Nachname, Vorname' },
    ] },
    { grid: 3, felder: [
      { name: 'adresstyp', label: 'Typ', type: 'select', options: opt(L.adresstyp), value: typInit },
      { name: 'anrede', label: 'Anrede', type: 'text', value: initial.anrede, vorschlaege: ['Herr','Frau','Firma','Eheleute'] },
      { name: 'titel', label:'Titel',value:initial.titel },
    ] },
    { grid: 2, felder: [
      { name: 'vorname', label: 'Vorname', value: a?.vorname },
      { name: 'nachname', label: 'Nachname', value: a?.nachname },
    ] },
    { grid: 2, felder: [
      { name: 'firmenname', label: 'Firmenname', value: a?.firmenname },
      { name: 'ansprechpartner', label: 'Ansprechpartner (Firma)', value: a?.ansprechpartner },
    ] },
    { felder: [{ name: 'zusatz', label: '2. Zeile / Zusatz (erscheint in der Anschrift)', value: a?.zusatz, placeholder: 'z. B. Gerd Rottländer, Außenstelle …, c/o …' }] },
    { felder: [{name:'name3',label:'Name 3',value:initial.name3}] },
    { felder: [{ name: 'strasse', label: 'Straße & Hausnr.', value: a?.strasse }] },
    { grid: 2, felder: [
      { name: 'plz', label: 'PLZ', value: a?.plz },
      { name: 'ort', label: 'Ort', value: a?.ort },
      { name: 'land', label: 'Land (HP-Ländercode)', value: a?.land || 'DE' },
    ] },
    { felder:[{name:'beruf',label:'Berufsbezeichnung',value:initial.beruf}] },
    { felder:[{name:'briefanrede1',label:'Briefanrede 1',value:initial.briefanrede1},{name:'briefanrede2',label:'Briefanrede 2',value:initial.briefanrede2}] },
    // Telefon/E-Mail nur beim Anlegen – danach über die Listen in der Adressmaske
    ...(bearb ? [] : [{ grid: 3, felder: [
      { name: 'email', label: 'E-Mail', type: 'email', value: a?.email },
      { name: 'telefon', label: 'Telefon', value: a?.telefon },
      { name: 'mobil', label: 'Mobil (Funktelefon)', value: a?.mobil },
    ] }]),
    { grid: 3, felder: [
      { name: 'geburtstag', label: 'Geburtstag', type: 'date', value: a?.geburtstag },
      { name: 'geburtstag2', label:'Geburtstag 2',type:'date',value:initial.geburtstag2 },
      { name: 'lkto_nr', label: 'LKto-Nr. (Personenkonto)', value: a?.lkto_nr },
    ] },
    {grid:3,felder:[{name:'sterbedatum1',label:'Sterbedatum 1',type:'date',value:initial.sterbedatum1},{name:'sterbedatum2',label:'Sterbedatum 2',type:'date',value:initial.sterbedatum2},{name:'geburtsname',label:'Geburtsname',value:initial.geburtsname}]},
    {grid:5,felder:Adressdaten.felder.filter(f=>f.name.startsWith('sonderfunktion')).map(f=>({name:f.name,label:'SF '+f.name.replace('sonderfunktion',''),value:initial[f.name]}))},
    { felder: [{ name: 'notizen', label: 'Notizen / Info', type: 'textarea', value: a?.notizen }] },
  ]);
  if (bearb) form.appendChild(el('p', { class: 'small muted', text: 'Telefonnummern, E-Mail-Adressen und Ansprechpartner pflegen Sie in der Adressmaske über die Pfeile ➠ bzw. die Knöpfe rechts.' }));
  if(a?.hp_sync){inputs.nummer.readOnly=true;if(istAdmin())form.append(el('p',{role:'status',text:hpAdressStatus(a)}));}
  form.classList.add('cu-adressformular');
  for(const f of Adressdaten.felder)inputs[f.name].maxLength=f.max;
  if(a?.hp_sync){for(const f of Adressdaten.felder)inputs[f.name].readOnly=true;form.append(el('p',{class:'small muted',text:'Die zusätzlichen Felder dieser bestehenden HP-Adresse werden aus HausPerfekt angezeigt. Für Änderungen an diesen Feldern verwenden Sie derzeit HausPerfekt.'}));}
  Adressdaten.binden(inputs,initial);
  const anschrift=el('div',{class:'cu-adress-vorschau',role:'status','aria-label':'Vorschau für Anschrift und Briefanrede'});
  const vorschau=()=>{const d=Adressdaten.vorbereiten(werte());anschrift.replaceChildren(el('strong',{text:'Anschrift · Vorschau'}),...[[d.anrede,d.titel].filter(Boolean).join(' '),d.adresstyp==='firma'?d.firmenname:[d.vorname,d.nachname].filter(Boolean).join(' '),d.zusatz,d.name3,d.strasse,[d.plz,d.ort].filter(Boolean).join(' '),d.briefanrede1,d.briefanrede2].filter(Boolean).map(text=>el('div',{text})));};
  form.addEventListener('input',vorschau);form.addEventListener('change',vorschau);form.append(anschrift);vorschau();
  form.append(el('p',{class:'small muted',text:'Suchbegriff und Briefanrede werden aus den Namensangaben ergänzt und können angepasst werden. Unbekannte Daten bleiben offen.'}));
  inputs.anrede.closest('.field').append(el('button',{type:'button',class:'hp-mini',text:'…',title:'Anrede auswählen (F5 im Feld Anrede)','aria-label':'Anrede auswählen',onclick:()=>anredeAuswahl(inputs.anrede)}));
  const kopieren=()=>anschriftKopierenDialog(quelle=>{
    if(!form.isConnected)return;
    for(const key of ['strasse','plz','ort','land','zusatz'])inputs[key].value=quelle[key]||'';
    inputs.strasse.dispatchEvent(new Event('input',{bubbles:true}));
    inputs.strasse.focus();
  },()=>form.isConnected);
  form.addEventListener('keydown',ev=>{if(ev.key==='F5'&&!ev.ctrlKey&&!ev.altKey&&!ev.shiftKey&&!ev.metaKey){
    if(ev.target===inputs.anrede||!bearb){ev.preventDefault();ev.stopPropagation();ev.target===inputs.anrede?anredeAuswahl(inputs.anrede):kopieren();}
  }});

  // Sichtbarkeit Person/Firma umschalten
  const anpassen = () => {
    const firma = inputs.adresstyp.value === 'firma';
    [inputs.vorname, inputs.nachname].forEach((i) => i.closest('.field').style.display = firma ? 'none' : '');
    [inputs.firmenname, inputs.ansprechpartner].forEach((i) => i.closest('.field').style.display = firma ? '' : 'none');
    inputs.firmenname.required=firma;inputs.nachname.required=!firma;
  };
  inputs.adresstyp.addEventListener('change', anpassen);
  anpassen();

  const dialog=modal({
    titel: bearb ? 'Adresse bearbeiten' : 'Neue Adresse',
    wide: true,
    inhalt: form,
    footer: (close) => [
      ...(!bearb?[el('button',{type:'button',text:'Anschrift kopieren',title:'Vorhandene Anschrift übernehmen (F5)',onclick:kopieren})]:[]),
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try {
          const v = werte();
          if (!form.reportValidity()) return;
          if (bearb) { await API.put('/adressen/' + a.id, {...v,hp_version:a.hp_sync?.version}); toast(a.hp_sync?'Gespeichert; HP-Übertragung folgt automatisch.':'Gespeichert', 'success'); close(); neuLaden(); }
          else { const dub=await API.post('/adressen/dubletten',v);if(dub.treffer?.length){const text='Diese Adresse könnte bereits vorhanden sein:\n\n'+dub.treffer.map(d=>d.nummer+' · '+d.name+' · '+d.anschrift+(d.archiviert?' (archiviert)':'')).join('\n')+'\n\nTrotzdem eine zusätzliche Adresse anlegen?';if(!await bestaetigen(text,{text:'Zusätzlich anlegen'}))return;v.dubletten_bestaetigung=dub.bestaetigung;}const neu = await API.post('/adressen', v); toast('Adresse angelegt', 'success'); close(); geheZu('#/adressen/' + neu.id); }
        } catch (e) { fehler(e); }
      } }),
    ],
  });
  dialog.box.classList.add('cu-adress-dialog');
  form.addEventListener('submit', (e) => e.preventDefault());
}

function nameAusZuord(z) {
  if (z.adresstyp === 'firma') return z.firmenname;
  return [z.vorname, z.nachname].filter(Boolean).join(' ');
}

/** Adressmaske → Pfkt.: alle Personenfunktionen der Adresse; Klick = bearbeiten (Beenden/Löschen im Formular). */
function pfktDialog(a) {
  listenFenster({
    titel: `Personenfunktionen – ${a.anzeigename}`,
    neuText: 'Neue Personenfunktion',
    neu: (zeichnen) => zuordnungFormular({ adresse_id: a.id }, zeichnen),
    laden: async (zeichnen) => {
      const zuord = await API.get(`/adressen/${a.id}/zuordnungen`);
      return raster([
        { label: 'Zeitraum', class: 'nowrap', render: zeitraum },
        { label: 'Funktion', render: (z) => L.rolle[z.rolle] || z.rolle },
        { label: 'Nr.', class: 'nowrap', render: (z) => (z.einheit_id ? z.einheit_nummer : z.objekt_nummer) },
        { label: 'Objekt', render: (z) => z.objekt_bezeichnung },
        { label: 'Status', render: (z) => (z.aktiv ? badge('aktiv', 'badge-aktiv') : badge('beendet/künftig', 'badge-inaktiv')) },
      ], zuord, {
        onOpen: darfSchreiben() ? (z) => zuordnungFormular(z, zeichnen) : null,
        leer: 'Noch keine Personenfunktion.',
      });
    },
  });
}

async function zuordnungBeenden(z, reload) {
  const heute = new Date().toISOString().slice(0, 10);
  const { form, werte } = formular([[{ name: 'datum', label: 'Gültig bis (Enddatum)', type: 'date', value: z.gueltig_bis || heute, required: true }]]);
  modal({
    titel: 'Zuordnung beenden',
    inhalt: el('div', {}, [el('p', { class: 'small muted', text: 'Setzt ein Enddatum. Die Zuordnung bleibt als Historie erhalten. Für einen Nachfolger legen Sie danach eine neue Zuordnung mit Beginn ab dem Folgetag an.' }), form]),
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Beenden', onclick: async () => {
        try { await API.post('/zuordnungen/' + z.id + '/beenden', { datum: werte().datum }); toast('Zuordnung beendet', 'success'); close(); reload(); } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

/** Direkte Eingabe von HP-Personenfunktionscodes, inklusive Buchstaben und $. */
function pfktCodeEingabe(input,codes,{rolle,rollenErlaubt}={}){
 input.maxLength=3;input.autocomplete='off';input.setAttribute('autocapitalize','characters');input.classList.add('cu-pfkt-code');
 const hint=el('span',{id:input.id+'_bezeichnung',class:'small muted cu-pfkt-bezeichnung',role:'status','aria-live':'polite'});
 input.after(hint);input.setAttribute('aria-describedby',hint.id);
 const find=value=>codes.find(c=>c.code===value);
 const pruefen=(fertig=false)=>{
  let value=input.value.trim().toUpperCase();let code=find(value);
  if(fertig&&!code&&/^\d{1,2}$/.test(value)){const padded=value.padStart(3,'0');if(find(padded)){value=padded;code=find(value);}}
  if(fertig)input.value=value;
  let error='';
  if(value&&!code)error='Unbekannter Personenfunktionscode: '+value;
  else if(code&&rollenErlaubt&&!rollenErlaubt.includes(code.rolle))error='Diese Personenfunktion kann hier nicht angelegt werden. Eigentümer und Mieter gehören zur Wohnung.';
  hint.textContent=error||code?.bezeichnung||'Code eingeben, z. B. 002';
  hint.classList.toggle('cu-code-fehler',!!error);input.setCustomValidity(error);
  if(code&&!error&&rolle&&rolle.value!==code.rolle){rolle.value=code.rolle;rolle.dispatchEvent(new Event('change',{bubbles:true}));}
  return !error;
 };
 input.addEventListener('input',()=>pruefen());input.addEventListener('blur',()=>pruefen(true));
 input.addEventListener('keydown',e=>{if(e.key==='Tab')pruefen(true);});
 input.pfktPruefen=()=>pruefen(true);pruefen();return{pruefen};
}

async function zuordnungFormular(kontext, reload) {
  const bearb = !!kontext.id;
  // Bezug: wenn adresse_id vorgegeben, Objekt/Einheit wählbar; sonst fix
  let objektOptionen = [];
  if (kontext.adresse_id && !bearb) {
    const objekte = await API.get('/objekte' + API.qs({}));
    objektOptionen = [{ value: '', label: '– Objekt wählen –' }].concat(objekte.map((o) => ({ value: o.id, label: `${UI.objektNummer(o)} · ${o.bezeichnung}` })));
  }

  const felder1 = [];
  if (!kontext.adresse_id) {
    felder1.push({ name: 'adresse_id', label: 'Person / Firma', type: 'suche', required: true, placeholder:'Name oder Adressnummer tippen …', suchen:async suche=>(await API.get('/adressen'+API.qs({suche}))).map(a=>({value:a.id,label:[a.nummer,a.anzeigename].filter(Boolean).join(' · ')+(a.ort?' – '+a.ort:'')})) });
  }
  // Handbuch: Mieter, Eigentümer, Leerstände nur in der Wohnung/Einheit – am Objekt nur allgemeine Funktionen
  const nurAllgemein = !bearb && kontext.objekt_id && !kontext.einheit_id;
  const rollen = opt(L.rolle).filter((r) => !nurAllgemein || !['eigentuemer', 'mieter'].includes(r.value));
  felder1.push({ name: 'rolle', label: 'Funktionsrolle', type: 'select', required: true, options: rollen, value: kontext.rolle || rollen[0].value });
  // HausPerfekt-Code der Personenfunktion (001 Eigentümer eigengenutzt, 002 Eigentümer fremdvermietet …)
  let codes = [];
  try { codes = await API.get('/pfkt-codes'); } catch (e) { fehler(e); }
  felder1.push({ name: 'pfkt_code', label: 'Personenfunktion (Code)', type: 'text', placeholder:'z. B. 002', value: kontext.pfkt_code || '' });

  const gruppen = [{ grid: 2, felder: felder1 }];

  // Bezugswahl bei Anlage aus Adresskontext
  if (kontext.adresse_id && !bearb) {
    const objektSelect = { name: 'objekt_id', label: 'Objekt', type: 'select', options: objektOptionen, value: '' };
    gruppen.push({ grid: 2, felder: [objektSelect, { name: 'einheit_id', label: 'Einheit (optional)', type: 'select', options: [{ value: '', label: '– ganzes Objekt –' }], value: '' }] });
  }

  gruppen.push({ grid: 2, felder: [
    { name: 'gueltig_von', label: 'Gültig von', type: 'date', value: kontext.gueltig_von },
    { name: 'gueltig_bis', label: 'Gültig bis (leer = offen)', type: 'date', value: kontext.gueltig_bis },
  ] });
  gruppen.push({ grid: 2, felder: [
    { name: 'anteil', label: 'Anteil (optional)', value: kontext.anteil },
  ] });
  gruppen.push({ felder: [{ name: 'notizen', label: 'Notizen', type: 'textarea', value: kontext.notizen }] });

  const { form, werte, inputs } = formular(gruppen);
  const codeFeld=pfktCodeEingabe(inputs.pfkt_code,codes,{rolle:inputs.rolle,rollenErlaubt:rollen.map(r=>r.value)});
  inputs.rolle.addEventListener('change',()=>{
    const code=codes.find(c=>c.code===inputs.pfkt_code.value.trim().toUpperCase());
    if(code&&code.rolle!==inputs.rolle.value)inputs.pfkt_code.value='';
    codeFeld.pruefen();
  });

  // Dynamik: Einheiten laden, wenn Objekt gewählt
  let einheitenVersion=0;
  if (inputs.objekt_id) {
    inputs.objekt_id.addEventListener('change', async () => {
      const version=++einheitenVersion;
      const oid = inputs.objekt_id.value;
      const sel = inputs.einheit_id;
      sel.innerHTML = '<option value="">– ganzes Objekt –</option>';
      sel.disabled=true;
      if (oid) {
        let einh;try{einh=await API.get('/objekte/' + oid + '/einheiten');}catch(e){if(version===einheitenVersion)fehler(e);return;}
        if(version!==einheitenVersion||inputs.objekt_id.value!==oid)return;
        sel.disabled=false;
        einh.forEach((e) => sel.appendChild(el('option', { value: e.id, text: `${e.nummer} · ${e.bezeichnung} (${L.einheitstyp[e.einheitstyp] || e.einheitstyp})` })));
      }
    });
  }

  modal({
    titel: bearb ? 'Personenfunktion bearbeiten' : 'Neue Personenfunktion',
    wide: true,
    inhalt: form,
    footer: (close) => [
      bearb ? el('button', { class: 'btn-danger', text: 'Löschen', onclick: async () => {
        if (!(await bestaetigen('Diese Personenfunktion endgültig löschen? Für einen Eigentümer- oder Mieterwechsel besser „Beenden" verwenden – dann bleibt die Historie erhalten.', { danger: true, text: 'Löschen' }))) return;
        try { await API.del('/zuordnungen/' + kontext.id); toast('Gelöscht', 'success'); close(); reload(); } catch (e) { fehler(e); }
      } }) : null,
      bearb && !kontext.gueltig_bis ? el('button', { text: 'Beenden …', title: 'Enddatum setzen (Wechsel ohne Historienverlust)', onclick: () => { close(); zuordnungBeenden(kontext, reload); } }) : null,
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try {
          codeFeld.pruefen(true);
          if(!form.reportValidity())return;
          const v = werte();
          const payload = {
            adresse_id: kontext.adresse_id || v.adresse_id,
            rolle: v.rolle,
            pfkt_code: v.pfkt_code || null,
            gueltig_von: v.gueltig_von || null,
            gueltig_bis: v.gueltig_bis || null,
            anteil: v.anteil || null,
            notizen: v.notizen || null,
          };
          if (bearb) {
            await API.put('/zuordnungen/' + kontext.id, payload);
          } else {
            payload.objekt_id = kontext.objekt_id || v.objekt_id || null;
            payload.einheit_id = kontext.einheit_id || v.einheit_id || null;
            await API.post('/zuordnungen', payload);
          }
          toast('Zuordnung gespeichert', 'success'); close(); reload();
        } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

const NR_LABEL = { objekt: 'Objekt-Nr.', einheit: 'Einheit-Nr.', adresse: 'Adress-Nr.' };
const NR_BEISPIEL = { objekt: 'z. B. 4010', einheit: 'z. B. 4010-01', adresse: 'z. B. 10001' };
const TYP_KURZ = { objekt: 'Obj.', einheit: 'Einh.', adresse: 'Adr.' };
const TYP_ROUTE = { objekt: '#/objekte/', einheit: '#/einheiten/', adresse: '#/adressen/' };
const TYP_NAME = { objekt: 'Objekt', einheit: 'Einheit', adresse: 'Adresse' };

function zuordnungChips(liste, onEntfernen) {
  if (!liste.length) return el('span', { class: 'badge badge-inaktiv', text: 'nicht zugeordnet' });
  return el('div', { class: 'chips' }, liste.map((v) => el('span', { class: 'chip chip-' + v.typ }, [
    el('a', { href: TYP_ROUTE[v.typ] + v.ziel_id, title: `${TYP_NAME[v.typ]} ${v.nummer} – ${v.label}` }, [
      el('strong', { text: `${TYP_KURZ[v.typ]} ${v.nummer}` }),
      el('span', { class: 'chip-label', text: v.label }),
    ]),
    onEntfernen ? el('button', {
      type: 'button', class: 'chip-x', text: '×',
      'aria-label': `Zuordnung ${TYP_NAME[v.typ]} ${v.nummer} entfernen`,
      onclick: () => onEntfernen(v),
    }) : null,
  ])));
}

function nummernPruefer(getTyp, input, status) {
  const pruefen = debounce(async () => {
    const wert = input.value.trim();
    status.textContent = '';
    if (!wert) return;
    try {
      const typ = getTyp();
      const res = await API.get('/nummern' + API.qs({ [typ]: wert }));
      res[typ].forEach((x) => status.appendChild(el('div', {
        class: x.gefunden ? 'nr-ok' : 'nr-fehlt',
        text: x.gefunden ? `✓ ${x.nummer}: ${x.label}` : `✗ ${x.nummer}: nicht gefunden`,
      })));
    } catch (e) {
      status.appendChild(el('div', { class: 'nr-fehlt', text: e.message }));
    }
  }, 300);
  input.addEventListener('input', pruefen);
  return pruefen;
}

function nummernFeld(typ, wert) {
  const id = 'nr_' + typ;
  const input = el('input', { id, value: wert || '', placeholder: NR_BEISPIEL[typ], autocomplete: 'off' });
  const status = el('div', { class: 'nr-status small', 'aria-live': 'polite' });
  const pruefen = nummernPruefer(() => typ, input, status);
  if (wert) pruefen();
  return { input, wrap: el('div', { class: 'field' }, [el('label', { for: id, text: NR_LABEL[typ] }), input, status]) };
}

function archivUpload(ktx, reload) {
  const dateiInput = el('input', { type: 'file', id: 'f_datei', accept: '.pdf,.xml,.jpg,.jpeg,.png,.webp,.tif,.tiff,.doc,.docx,.xls,.xlsx,.txt,.csv' });
  const { form, werte } = formular([
    { felder: [{ name: 'titel', label: 'Titel (leer = Dateiname)', placeholder: 'z. B. Protokoll Eigentümerversammlung 2026' }] },
    { grid: 2, felder: [
      { name: 'kategorie', label: 'Kategorie', type: 'select', options: opt(L.kategorie), value: (ktx && ktx.kategorie) || 'korrespondenz' },
      { name: 'dokument_datum', label: 'Dokumentdatum', type: 'date' },
    ] },
    { felder: [{ name: 'beschreibung', label: 'Beschreibung', type: 'textarea' }] },
  ]);
  form.insertBefore(el('div', { class: 'field' }, [el('label', { for: 'f_datei', text: 'Datei * (max. 50 MB)' }), dateiInput]), form.firstChild);

  const felder = {};
  ['objekt', 'einheit', 'adresse'].forEach((t) => { felder[t] = nummernFeld(t, ktx && ktx.typ === t ? ktx.nummer : ''); });
  form.appendChild(el('fieldset', { class: 'nr-box' }, [
    el('legend', { text: 'Zuordnung über Nummern' }),
    el('p', { class: 'small muted', text: 'Mehrere Nummern mit Komma trennen. Ohne Angabe landet der Eintrag unter „nicht zugeordnet".' }),
    el('div', { class: 'grid-3' }, Object.values(felder).map((f) => f.wrap)),
  ]));

  modal({
    titel: 'Archiv-Eintrag hochladen',
    wide: true,
    inhalt: form,
    footer: (close) => {
      const btn = el('button', { class: 'btn-primary', text: 'Hochladen', onclick: async () => {
        if (!dateiInput.files.length) { toast('Bitte eine Datei wählen.', 'error'); return; }
        const v = werte();
        const fd = new FormData();
        fd.append('titel', v.titel || dateiInput.files[0].name);
        fd.append('kategorie', v.kategorie);
        if (v.dokument_datum) fd.append('dokument_datum', v.dokument_datum);
        if (v.beschreibung) fd.append('beschreibung', v.beschreibung);
        Object.entries(felder).forEach(([t, f]) => { if (f.input.value.trim()) fd.append(t + '_nr', f.input.value.trim()); });
        fd.append('datei', dateiInput.files[0]); // Datei zuletzt, Textfelder zuerst
        btn.disabled = true;
        try { const saved=await API.upload('/archiv', fd); toast('Eintrag gespeichert', 'success'); close(); reload(saved); }
        catch (e) { fehler(e); btn.disabled = false; }
      } });
      return [el('button', { text: 'Abbrechen', onclick: close }), btn];
    },
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

async function archivBearbeiten(id, reload) {
  let d;
  try { d = await API.get('/archiv/' + id); } catch (e) { fehler(e); return; }
  const schreiben = darfSchreiben();
  const { form, werte, inputs } = formular([
    { felder: [{ name: 'titel', label: 'Titel', required: true, value: d.titel }] },
    { grid: 2, felder: [
      { name: 'kategorie', label: 'Kategorie', type: 'select', options: opt(L.kategorie), value: d.kategorie },
      { name: 'dokument_datum', label: 'Dokumentdatum', type: 'date', value: d.dokument_datum },
    ] },
    { felder: [{ name: 'beschreibung', label: 'Beschreibung', type: 'textarea', value: d.beschreibung }] },
  ]);
  if (!schreiben) Object.values(inputs).forEach((i) => { i.disabled = true; });

  // Zuordnungen verwalten
  const chipsBox = el('div', { class: 'chips-box' });
  const zeichne = () => {
    chipsBox.innerHTML = '';
    chipsBox.appendChild(zuordnungChips(d.verknuepfungen, schreiben ? async (v) => {
      try { d = await API.del('/archiv/verknuepfungen/' + v.id); zeichne(); reload(); toast('Zuordnung entfernt', 'success'); } catch (e) { fehler(e); }
    } : null));
  };
  zeichne();

  const box = el('fieldset', { class: 'nr-box' }, [el('legend', { text: 'Zugeordnet zu' }), chipsBox]);
  if (schreiben) {
    const typSel = el('select', { 'aria-label': 'Zuordnen zu' }, Object.entries(NR_LABEL).map(([v, l]) => el('option', { value: v, text: l })));
    const nrInput = el('input', { 'aria-label': 'Nummer', placeholder: NR_BEISPIEL.objekt, autocomplete: 'off' });
    const status = el('div', { class: 'nr-status small', 'aria-live': 'polite' });
    const pruefen = nummernPruefer(() => typSel.value, nrInput, status);
    typSel.addEventListener('change', () => { nrInput.placeholder = NR_BEISPIEL[typSel.value]; pruefen(); });
    const addBtn = el('button', { type: 'button', class: 'btn-primary', text: 'Zuordnen', onclick: async () => {
      try {
        d = await API.post(`/archiv/${d.id}/verknuepfungen`, { typ: typSel.value, nummer: nrInput.value.trim() });
        nrInput.value = ''; status.textContent = '';
        zeichne(); reload(); toast('Zugeordnet', 'success');
      } catch (e) { fehler(e); }
    } });
    nrInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addBtn.click(); } });
    box.appendChild(el('div', { class: 'zuordnen-zeile' }, [typSel, nrInput, addBtn]));
    box.appendChild(status);
  }
  form.appendChild(box);
  form.appendChild(el('p', { class: 'small muted' }, [
    document.createTextNode(`Datei: ${d.original_name} (${dateiGroesse(d.groesse)}) · erfasst am ${datum(d.erstellt_am)} · Quelle: ${L.quelle[d.quelle] || d.quelle}`),
  ]));

  const archivDialog=modal({
    titel: schreiben ? 'Archiv-Eintrag bearbeiten' : 'Archiv-Eintrag',
    wide: true,
    inhalt: form,
    footer: (close) => [
      el('a', { class: 'btn', href: `/api/archiv/${d.id}/download`, text: '⭳ Öffnen' }),
      istAdmin()?el('button',{type:'button',text:'Kundenportal',onclick:()=>kundenDokumentFreigabe(d)}):null,
      el('button', { text: schreiben ? 'Abbrechen' : 'Schließen', onclick: close }),
      schreiben ? el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try {
          const v = werte();
          await API.put('/archiv/' + d.id, { titel: v.titel, kategorie: v.kategorie, dokument_datum: v.dokument_datum || null, beschreibung: v.beschreibung });
          toast('Gespeichert', 'success'); close(); reload();
        } catch (e) { fehler(e); }
      } }) : null,
    ],
  });
  archivDialog.box.hpRechnungsDokument=d;
  form.addEventListener('submit', (e) => e.preventDefault());
}

function benutzerFormular(b) {
  const bearb = !!b;
  const felder = [
    { grid: 2, felder: [
      { name: 'name', label: 'Name', required: true, value: b?.name },
      { name: 'email', label: 'E-Mail', type: 'email', value: b?.email },
      { name: 'kuerzel', label: 'HP-Sachbearbeiterkürzel', value: b?.kuerzel, hint: 'Wie in HausPerfekt, z. B. FD. Maximal 3 Großbuchstaben (A–Z), eindeutig. Optional.' },
    ] },
  ];
  if (!bearb) felder.push({ grid: 2, felder: [
    { name: 'benutzername', label: 'Benutzername', required: true },
    { name: 'passwort', label: 'Passwort (min. 8 Zeichen)', type: 'password', required: true },
  ] });
  felder.push({ grid: 2, felder: [
    { name: 'rolle', label: 'Rolle', type: 'select', options: opt(L.benutzerRolle), value: b?.rolle || 'mitarbeiter' },
    bearb ? { name: 'aktiv', label: 'Status', type: 'select', options: [{ value: '1', label: 'aktiv' }, { value: '0', label: 'gesperrt' }], value: String(b?.aktiv ?? 1) } : { name: '_', label: '', value: '' },
  ] });
  const { form, werte, inputs } = formular(felder);
  inputs.kuerzel.maxLength = 3;
  inputs.kuerzel.pattern = '[A-Z]{1,3}';
  inputs.kuerzel.setAttribute('autocapitalize', 'characters');
  inputs.kuerzel.addEventListener('input', () => {
    inputs.kuerzel.value = inputs.kuerzel.value.replace(/[a-z]/g, (c) => c.toUpperCase());
  });
  modal({
    titel: bearb ? 'Benutzer bearbeiten' : 'Neuer Benutzer',
    inhalt: form,
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try {
          if (!form.reportValidity()) return;
          const v = werte();
          if (bearb) await API.put('/benutzer/' + b.id, { name: v.name, email: v.email, kuerzel: v.kuerzel, rolle: v.rolle, aktiv: v.aktiv });
          else await API.post('/benutzer', { benutzername: v.benutzername, passwort: v.passwort, name: v.name, email: v.email, kuerzel: v.kuerzel, rolle: v.rolle });
          toast('Gespeichert', 'success'); close(); neuLaden();
        } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

function benutzerPasswort(b) {
  const { form, werte } = formular([[{ name: 'passwort', label: 'Neues Passwort (min. 8 Zeichen)', type: 'password', required: true }]]);
  modal({
    titel: 'Passwort setzen – ' + b.name,
    inhalt: form,
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Setzen', onclick: async () => {
        try { await API.post('/benutzer/' + b.id + '/passwort', { passwort: werte().passwort }); toast('Passwort gesetzt', 'success'); close(); } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

function passwortDialog() {
  const { form, werte } = formular([[
    { name: 'aktuell', label: 'Aktuelles Passwort', type: 'password', required: true },
    { name: 'neu', label: 'Neues Passwort (min. 8 Zeichen)', type: 'password', required: true },
  ]]);
  modal({
    titel: 'Eigenes Passwort ändern',
    inhalt: form,
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Ändern', onclick: async () => {
        try { await API.post('/auth/passwort', { aktuell: werte().aktuell, neu: werte().neu }); toast('Passwort geändert', 'success'); close(); } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}


// ---------------------------------------------------------------------
//  Adressmaske: Telefon, E-Mail/Webseite, Ansprechpartner, Info
// ---------------------------------------------------------------------
const TELEFON_ARTEN = ['Telefon', 'Funktelefon', 'Fax', 'Geschäftlich', 'Privat', 'Sonstiges'];
const JA_NEIN = [{ value: '0', label: 'nein' }, { value: '1', label: 'ja' }];
const JA_NEIN_TEXT = [{ value: '1', label: 'Ja' }, { value: '0', label: 'Nein' }];

function kommDialog({ titel, felder, speichern, loeschen, loeschFrage }) {
  const { form, werte } = formular(felder);
  modal({
    titel,
    inhalt: form,
    footer: (close) => [
      loeschen ? el('button', { class: 'btn-danger', text: 'Löschen', onclick: async () => {
        if (!(await bestaetigen(loeschFrage, { danger: true, text: 'Löschen' }))) return;
        try { await loeschen(); toast('Gelöscht', 'success'); close(); neuLaden(); } catch (e) { fehler(e); }
      } }) : null,
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try { await speichern(werte()); toast('Gespeichert', 'success'); close(); neuLaden(); } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

function telefonDialog(adresseId, t) {
  kommDialog({
    titel: t ? 'Telefonnummer bearbeiten' : 'Neue Telefonnummer',
    felder: [
      { grid: 2, felder: [
        { name: 'art', label: 'Telefon', type: 'select', options: TELEFON_ARTEN.map((x) => ({ value: x, label: x })), value: t?.art || 'Telefon' },
        { name: 'nummer', label: 'Telefon-Nummer', type: 'tel', required: true, value: t?.nummer },
      ] },
      { grid: 2, felder: [
        { name: 'bemerkung', label: 'Bemerkung', value: t?.bemerkung },
        { name: 'kurzwahl', label: 'Kurzwahl', value: t?.kurzwahl },
      ] },
    ],
    speichern: (v) => (t ? API.put('/telefone/' + t.id, v) : API.post(`/adressen/${adresseId}/telefone`, v)),
    loeschen: t ? () => API.del('/telefone/' + t.id) : null,
    loeschFrage: `Telefonnummer ${t?.nummer || ''} löschen?`,
  });
}

function emailDialog(adresseId, m) {
  kommDialog({
    titel: m ? 'E-Mail-Adresse / Webseite bearbeiten' : 'Neue E-Mail-Adresse / Webseite',
    felder: [
      { grid: 2, felder: [
        { name: 'ist_email', label: 'Art', type: 'select', options: [{ value: '1', label: 'E-Mail-Adresse' }, { value: '0', label: 'Webseite' }], value: m ? String(m.ist_email) : '1' },
        { name: 'adresse', label: 'eMail Adresse / Webseite', required: true, value: m?.adresse, placeholder: 'name@beispiel.de oder www.beispiel.de' },
      ] },
      { felder: [{ name: 'bemerkung', label: 'Bemerkung', value: m?.bemerkung }] },
      { grid: 2, felder: [
        { name: 'standard', label: 'Standard', type: 'select', options: JA_NEIN, value: m ? String(m.standard) : '0' },
        { name: 'hpmobile', label: 'HPMobile', type: 'select', options: JA_NEIN, value: m ? String(m.hpmobile) : '0' },
      ] },
    ],
    speichern: (v) => (m ? API.put('/emails/' + m.id, v) : API.post(`/adressen/${adresseId}/emails`, v)),
    loeschen: m ? () => API.del('/emails/' + m.id) : null,
    loeschFrage: `${m?.adresse || ''} löschen?`,
  });
}

function ansprechpartnerDialog(adresseId, ap) {
  kommDialog({
    titel: ap ? 'Ansprechpartner bearbeiten' : 'Neuer Ansprechpartner',
    felder: [
      { grid: 2, felder: [
        { name: 'name', label: 'Ansprechpartner', required: true, value: ap?.name },
        { name: 'funktion', label: 'Funktion', value: ap?.funktion },
      ] },
      { grid: 2, felder: [
        { name: 'telefon', label: 'Telefon', type: 'tel', value: ap?.telefon },
        { name: 'email', label: 'E-Mail', type: 'email', value: ap?.email },
      ] },
    ],
    speichern: (v) => (ap ? API.put('/ansprechpartner/' + ap.id, v) : API.post(`/adressen/${adresseId}/ansprechpartner`, v)),
    loeschen: ap ? () => API.del('/ansprechpartner/' + ap.id) : null,
    loeschFrage: `Ansprechpartner ${ap?.name || ''} löschen?`,
  });
}

function adressInfoDialog(a) {
  const dl = el('dl', { class: 'hp-info-liste' });
  const zeile = (k, v) => { dl.appendChild(el('dt', { text: k })); dl.appendChild(el('dd', { text: v || '–' })); };
  zeile('Adress-Nr.', a.nummer);
  zeile('angelegt', datumKurz(a.erstellt_am));
  zeile('geändert', datumKurz(a.geaendert_am));
  zeile('Zustimmung Datenweitergabe', a.datenschutz_zustimmung === 'ja' ? 'Ja' + (a.datenschutz_datum ? ' (' + datumKurz(a.datenschutz_datum) + ')' : '') : a.datenschutz_zustimmung === 'nein' ? 'Nein' : 'nicht erfasst');
  const notiz = el('div', { class: 'hp-notizen', text: a.notizen || 'Keine Notizen hinterlegt.' });
  modal({
    titel: 'Info – ' + a.anzeigename,
    inhalt: el('div', {}, [dl, el('div', { class: 'hp-blau small', text: 'Notizen' }), notiz]),
    footer: (close) => [
      darfSchreiben() ? el('button', { text: 'Bearbeiten', onclick: () => { close(); adresseFormular(a); } }) : null,
      el('button', { class: 'btn-primary', text: 'Schließen', onclick: close }),
    ],
  });
}

// ---------------------------------------------------------------------
//  Adress-Akte: Wiedervorlagen (Kalender), Kontaktprotokoll (Telefon), Ampel
// ---------------------------------------------------------------------
const KONTAKT_ART = { anruf: 'Anruf', email: 'E-Mail', gespraech: 'Persönliches Gespräch', brief: 'Brief', notiz: 'Notiz', sonstiges: 'Sonstiges' };
const RICHTUNG = { eingehend: 'eingehend', ausgehend: 'ausgehend' };
const AMPEL_INFO = {
  gruen: { text: 'Grün – alles in Ordnung', farbe: 'gruen' },
  gelb: { text: 'Gelb – auf die Wortwahl achten', farbe: 'gelb' },
  rot: { text: 'Rot – schwierig, konfliktbereit / klagefreudig', farbe: 'rot' },
};
const isoHeute = (plusTage = 0) => { const d = new Date(); d.setDate(d.getDate() + plusTage); return d.toISOString().slice(0, 10); };
const lokalJetzt = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const zeitAnzeige = (z) => (z ? `${datumKurz(z.slice(0, 10))} ${z.slice(11, 16)}` : '');

/** Listenfenster mit Neuladen nach Änderungen; beim Schließen wird die Maske aktualisiert. */
function listenFenster({ titel, laden, neuText, neu }) {
  const box = el('div');
  const zeichnen = async () => {
    try { box.replaceChildren(await laden(zeichnen)); } catch (e) { fehler(e); }
  };
  modal({
    titel, wide: true, inhalt: box, onClose: neuLaden,
    footer: (close) => [
      darfSchreiben() && neu ? el('button', { class: 'btn-primary', text: neuText, onclick: () => neu(zeichnen) }) : null,
      el('button', { text: 'Schließen', onclick: close }),
    ],
  });
  zeichnen();
}

function formFenster({ titel, felder, speichern, loeschen, loeschFrage, danach, nachAufbau, container }) {
  const { form, werte, inputs } = formular(felder);
  if (nachAufbau) nachAufbau(inputs, form);
  (container?options=>etvInlineFenster(container,options):modal)({
    titel, inhalt: form,
    footer: (close) => [
      loeschen ? el('button', { class: 'btn-danger', text: 'Löschen', onclick: async () => {
        if (!(await bestaetigen(loeschFrage, { danger: true, text: 'Löschen' }))) return;
        try { await loeschen(); toast('Gelöscht', 'success'); close(); danach(); } catch (e) { fehler(e); }
      } }) : null,
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try { await speichern(werte()); toast('Gespeichert', 'success'); close(); danach(); } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}

// ---- Wiedervorlagen ----------------------------------------------------
async function wiedervorlageForm(a, w, danach) {
  const ma = await API.get('/mitarbeiter');
  formFenster({
    titel: w ? 'Wiedervorlage bearbeiten' : 'Neue Wiedervorlage – ' + a.anzeigename,
    felder: [
      { grid: 2, felder: [
        { name: 'faellig_am', label: 'Fällig am', type: 'date', required: true, value: w ? w.faellig_am : isoHeute(7) },
        { name: 'zustaendig_id', label: 'Zuständig', type: 'select', value: w ? (w.zustaendig_id || '') : S.benutzer.id,
          options: [{ value: '', label: '– niemand –' }].concat(ma.map((m) => ({ value: m.id, label: m.name }))) },
      ] },
      { felder: [{ name: 'betreff', label: 'Betreff', required: true, value: w?.betreff }] },
      { felder: [{ name: 'notiz', label: 'Notiz', type: 'textarea', value: w?.notiz }] },
    ],
    speichern: (v) => (w ? API.put('/wiedervorlagen/' + w.id, v) : API.post(`/adressen/${a.id}/wiedervorlagen`, v)),
    loeschen: w ? () => API.del('/wiedervorlagen/' + w.id) : null,
    loeschFrage: `Wiedervorlage „${w?.betreff || ''}" löschen?`,
    danach,
  });
}

function wiedervorlagenDialog(a) {
  let alle = false;
  const heute = isoHeute();
  listenFenster({
    titel: 'Wiedervorlagen – ' + a.anzeigename,
    neuText: 'Neue Wiedervorlage',
    neu: (zeichnen) => wiedervorlageForm(a, null, zeichnen),
    laden: async (zeichnen) => {
      const liste = await API.get(`/adressen/${a.id}/wiedervorlagen` + (alle ? '?alle=1' : ''));
      const schalter = el('label', { class: 'check-inline' }, [
        el('input', { type: 'checkbox', checked: alle ? '' : null, onchange: (ev) => { alle = ev.target.checked; zeichnen(); } }),
        document.createTextNode(' erledigte anzeigen'),
      ]);
      return el('div', {}, [schalter, darfSchreiben()?el('p',{},[el('a',{href:'#/vorgaenge?art=wiedervorlage&typ=adresse&ziel='+a.id,text:'Übernommene und neue CuraAed-Wiedervorlagen öffnen'})]):null, raster([
        { label: 'Fällig', class: 'nowrap', render: (w) => el('span', { class: !w.erledigt && w.faellig_am < heute ? 'hp-ueberfaellig' : '', text: datumKurz(w.faellig_am) }) },
        { label: 'Betreff', render: (w) => el('div', {}, [el('strong', { text: w.betreff }), w.notiz ? el('div', { class: 'small muted', text: w.notiz }) : null]) },
        { label: 'Zuständig', render: (w) => w.zustaendig_name || '' },
        { label: 'Status', render: (w) => (w.erledigt ? badge('erledigt', 'badge-inaktiv') : w.faellig_am < heute ? badge('überfällig', 'badge-rot') : badge('offen', 'badge-aktiv')) },
        { label: '', class: 'aktionen', render: (w) => (darfSchreiben() ? el('button', {
          type: 'button', class: 'hp-mini', text: w.erledigt ? 'wieder öffnen' : 'erledigt',
          onclick: async () => { try { await API.post(`/wiedervorlagen/${w.id}/erledigt`, { erledigt: !w.erledigt }); zeichnen(); } catch (e) { fehler(e); } },
        }) : null) },
      ], liste, { onOpen: darfSchreiben() ? (w) => wiedervorlageForm(a, w, zeichnen) : null, leer: alle ? 'Keine Wiedervorlagen.' : 'Keine offenen Wiedervorlagen.' })]);
    },
  });
}

// ---- Kontaktprotokoll („Telefoneingänge") -------------------------------
function kontaktForm(a, k, danach) {
  formFenster({
    titel: k ? 'Kontakt bearbeiten' : 'Kontakt erfassen – ' + a.anzeigename,
    felder: [
      { grid: 3, felder: [
        { name: 'art', label: 'Art', type: 'select', options: opt(KONTAKT_ART), value: k?.art || 'anruf' },
        { name: 'richtung', label: 'Richtung', type: 'select', options: [{ value: '', label: '–' }].concat(opt(RICHTUNG)), value: k ? (k.richtung || '') : 'eingehend' },
        { name: 'zeitpunkt', label: 'Zeitpunkt', type: 'datetime-local', required: true, value: k?.zeitpunkt || lokalJetzt() },
      ] },
      { felder: [{ name: 'betreff', label: 'Betreff', required: true, value: k?.betreff, placeholder: 'z. B. Frage zur Nebenkostenabrechnung' }] },
      { felder: [{ name: 'notiz', label: 'Gesprächsnotiz', type: 'textarea', value: k?.notiz }] },
      { grid: 2, felder: [
        { name: 'objekt_nr', label: 'Objekt-Nr. (optional)', value: k?.objekt_nummer, placeholder: 'z. B. 18505' },
        { name: 'einheit_nr', label: 'Wohnung/Einheit-Nr. (optional)', value: k?.einheit_nummer, placeholder: 'z. B. 18505-0001' },
      ] },
      { grid: 2, felder: [
        { name: 'intern', label: 'interner Eintrag', type: 'select', options: [{ value: '0', label: 'nein' }, { value: '1', label: 'ja' }], value: k ? String(k.intern || 0) : '0' },
        { name: 'minuten', label: 'Min (Zeitaufwand)', type: 'number', step: '1', value: k?.minuten },
      ] },
    ],
    speichern: (v) => (k ? API.put('/kontakte/' + k.id, v) : API.post(`/adressen/${a.id}/kontakte`, v)),
    loeschen: k ? () => API.del('/kontakte/' + k.id) : null,
    loeschFrage: `Kontakt „${k?.betreff || ''}" löschen?`,
    danach,
  });
}

function kontakteDialog(a) {
  listenFenster({
    titel: 'Telefoneingänge / Kontakte – ' + a.anzeigename,
    neuText: 'Kontakt erfassen',
    neu: (zeichnen) => kontaktForm(a, null, zeichnen),
    laden: async (zeichnen) => {
      const liste = await API.get(`/adressen/${a.id}/kontakte`);
      return raster([
        { label: 'Zeitpunkt', class: 'nowrap', render: (k) => zeitAnzeige(k.zeitpunkt) },
        { label: 'Art', class: 'nowrap', render: (k) => KONTAKT_ART[k.art] + (k.richtung ? ` (${k.richtung})` : '') },
        { label: 'Betreff', render: (k) => el('div', {}, [el('strong', { text: k.betreff }), k.notiz ? el('div', { class: 'small muted hp-umbruch', text: k.notiz }) : null]) },
        { label: 'Erledigt', class: 'nowrap', render: (k) => (k.eingang ? el('span', { class: 'tel-erl ' + (k.erledigt ? 'ja' : 'nein'), text: k.erledigt ? '✔ erledigt' : '✖ offen' + (k.rueckruf_sb_name ? ' · Rückruf ' + kuerzelVon(k.rueckruf_sb_name) : '') }) : '') },
        { label: 'Erfasst von', render: (k) => k.erfasst_von_name || '' },
      ], liste, { onOpen: darfSchreiben() ? (k) => (k.eingang ? telefonEingang({}, k, zeichnen) : kontaktForm(a, k, zeichnen)) : null, leer: 'Noch keine Kontakte erfasst.' });
    },
  });
}

// ---- Ampel (Mitarbeiter-Einschätzung) ------------------------------------
// ---- Datenschutz: Zustimmung zur Weitergabe der Daten -----------------------
function datenschutzDialog(a) {
  const text = { ja: 'Ja – hat zugestimmt', nein: 'Nein – hat nicht zugestimmt' };
  if (!darfSchreiben()) {
    toast('Zustimmung zur Datenweitergabe: ' + (text[a.datenschutz_zustimmung] || 'nicht erfasst'));
    return;
  }
  let wahl = a.datenschutz_zustimmung || '';
  const datum = el('input', { id: 'f_ds_datum', type: 'date', value: a.datenschutz_datum || new Date().toISOString().slice(0, 10) });
  const datumFeld = el('div', { class: 'field' }, [el('label', { for: 'f_ds_datum', text: 'Zugestimmt am' }), datum]);
  const knoepfe = el('div', { class: 'hp-ds-wahl', role: 'radiogroup', 'aria-label': 'Zustimmung' });
  const zeichnen = () => {
    knoepfe.replaceChildren(...[['ja', '✔'], ['nein', '✖']].map(([w, z]) =>
      el('button', { type: 'button', role: 'radio', 'aria-checked': String(wahl === w), class: 'hp-ds-knopf ' + w + (wahl === w ? ' aktiv' : ''), onclick: () => { wahl = w; zeichnen(); } }, [
        el('span', { class: 'hp-ds-icon', 'aria-hidden': 'true', text: z }), el('strong', { text: text[w] }),
      ])));
    datumFeld.style.display = wahl === 'ja' ? '' : 'none';
  };
  zeichnen();
  modal({
    titel: 'Datenschutz – ' + a.anzeigename,
    inhalt: el('div', {}, [
      el('p', { text: 'Hat der Adressat der Weitergabe seiner Daten zugestimmt?' }),
      knoepfe, datumFeld,
    ]),
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        if (!wahl) { toast('Bitte Ja oder Nein wählen.', 'error'); return; }
        try { await API.put(`/adressen/${a.id}/datenschutz`, { zustimmung: wahl, datum: datum.value }); toast('Datenschutz gespeichert', 'success'); close(); neuLaden(); } catch (e) { fehler(e); }
      } }),
    ],
  });
}

function ampelDialog(a) {
  if (!darfSchreiben()) {
    toast(a.ampel ? `${AMPEL_INFO[a.ampel].text}${a.ampel_notiz ? ' – ' + a.ampel_notiz : ''}` : 'Keine Einschätzung erfasst.');
    return;
  }
  let wahl = a.ampel || '';
  const knoepfe = el('div', { class: 'hp-ampel-wahl', role: 'radiogroup', 'aria-label': 'Einschätzung' });
  const zeichnen = () => {
    knoepfe.replaceChildren(...[['gruen', 'Grün', 'alles in Ordnung'], ['gelb', 'Gelb', 'auf die Wortwahl achten'], ['rot', 'Rot', 'schwierig, konfliktbereit / klagefreudig'], ['', 'Keine', 'keine Einschätzung']].map(([w, t, info]) =>
      el('button', { type: 'button', role: 'radio', 'aria-checked': String(wahl === w), class: 'hp-ampel-knopf ' + (w || 'keine') + (wahl === w ? ' aktiv' : ''), onclick: () => { wahl = w; zeichnen(); } }, [
        el('span', { class: 'hp-ampel-punkt ' + (w || 'keine'), 'aria-hidden': 'true' }),
        el('strong', { text: t }), el('span', { class: 'small', text: info }),
      ])));
  };
  zeichnen();
  const notiz = el('textarea', { id: 'f_ampel_notiz', maxlength: '500', text: a.ampel_notiz || '' });
  const inhalt = el('div', {}, [
    knoepfe,
    el('div', { class: 'field' }, [el('label', { for: 'f_ampel_notiz', text: 'Begründung (sachlich, intern)' }), notiz]),
    el('p', { class: 'small muted', text: 'Hinweis: Diese Einschätzung ist personenbezogen. Betroffene können nach DSGVO Auskunft verlangen – bitte nur sachliche Beobachtungen festhalten.' }),
    a.ampel ? el('p', { class: 'small muted', text: `Zuletzt gesetzt am ${datumKurz(a.ampel_datum)}${a.ampel_von_name ? ' von ' + a.ampel_von_name : ''}.` }) : null,
  ]);
  modal({
    titel: 'Ampel – ' + a.anzeigename, inhalt,
    footer: (close) => [
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try { await API.put(`/adressen/${a.id}/ampel`, { ampel: wahl, notiz: notiz.value }); toast('Ampel gespeichert', 'success'); close(); neuLaden(); } catch (e) { fehler(e); }
      } }),
    ],
  });
}

// ---- Portooptimierung (gelbes Post-Symbol) -------------------------------
const VERSAND = { post: 'Post', email: 'E-Mail', beides: 'Post + E-Mail' };

function versandDialog(a, v) {
  const schreiben = darfSchreiben();
  let standard = v.standard;
  const selects = {};
  const standardBox = el('div', { class: 'hp-versand-standard', role: 'radiogroup', 'aria-label': 'Standardversand' });
  const zeichneStandard = () => {
    standardBox.replaceChildren(...Object.entries(VERSAND).map(([k, t]) => el('button', {
      type: 'button', role: 'radio', 'aria-checked': String(standard === k), class: 'hp-versand-knopf' + (standard === k ? ' aktiv' : ''),
      disabled: schreiben ? null : '', text: (k === 'post' ? '✉ ' : k === 'email' ? '@ ' : '✉@ ') + t,
      onclick: () => { standard = k; zeichneStandard(); Object.values(selects).forEach(stdText); },
    })));
  };
  const stdText = (sel) => { sel.options[0].textContent = `wie Standard (${VERSAND[standard]})`; };
  const tbody = el('tbody', {}, v.arten.map((art) => {
    const sel = el('select', { 'aria-label': 'Versand ' + art.label, disabled: schreiben ? null : '' },
      [el('option', { value: '', text: '' })].concat(Object.entries(VERSAND).map(([k, t]) => el('option', { value: k, text: t }))));
    sel.value = art.kanal || '';
    stdText(sel);
    selects[art.key] = sel;
    return el('tr', {}, [el('td', { text: art.label }), el('td', {}, [sel])]);
  }));
  zeichneStandard();
  const inhalt = el('div', {}, [
    el('div', { class: 'hp-blau small', text: 'Standardversand für alle Unterlagen' }),
    standardBox,
    v.email
      ? el('p', { class: 'small', text: `E-Mail-Versand an: ${v.email}` })
      : el('p', { class: 'hint', text: 'Keine E-Mail-Adresse hinterlegt – Unterlagen gehen trotz Einstellung per Post, bis eine E-Mail-Adresse erfasst ist.' }),
    el('div', { class: 'hp-blau small', text: 'Abweichungen je Dokument (nur bei Bedarf)' }),
    el('div', { class: 'hp-tabelle-wrap' }, [el('table', { class: 'hp-tabelle' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Dokument' }), el('th', { text: 'Versand' })])]), tbody,
    ])]),
  ]);
  modal({
    titel: 'Versandoptionen (Portooptimierung) – ' + a.anzeigename, wide: true, inhalt,
    footer: (close) => (schreiben ? [
      el('button', { text: 'Abweichungen zurücksetzen', onclick: () => Object.values(selects).forEach((s) => { s.value = ''; }) }),
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        const abweichungen = Object.fromEntries(Object.entries(selects).map(([k, s]) => [k, s.value]));
        try { await API.put(`/adressen/${a.id}/versand`, { standard, abweichungen }); toast('Versandoptionen gespeichert', 'success'); close(); neuLaden(); } catch (e) { fehler(e); }
      } }),
    ] : [el('button', { text: 'Schließen', onclick: close })]),
  });
}

// ---- Drucken eines Ausschnitts (DirektDruck / ZIS-Liste) ------------------
function druckeBereich(inhalt) {
  document.getElementById('hp-druckbereich')?.remove();
  const box = el('div', { id: 'hp-druckbereich' }, [inhalt]);
  document.body.appendChild(box);
  document.body.classList.add('hp-druck-einzel');
  const aufraeumen = () => { document.body.classList.remove('hp-druck-einzel'); box.remove(); window.removeEventListener('afterprint', aufraeumen); };
  window.addEventListener('afterprint', aufraeumen);
  window.print();
  setTimeout(aufraeumen, 1500);
}

// ---- Bank (Bankverbindungen inkl. SEPA-Lastschriftmandat) -----------------
const ibanFormat = (iban) => String(iban || '').replace(/(.{4})/g, '$1 ').trim();

/**
 * Live-Prüfung im Bankformular: Bank, Ort und BIC aus der Bankleitzahlendatei der Bundesbank
 * (lokal auf unserem Server – keine Weitergabe der IBAN), Fehler/Hinweise unter dem Feld.
 * BIC und Bank werden nur ergänzt, wenn die Felder leer sind oder zuvor automatisch gefüllt wurden.
 */
function ibanLivePruefung(inputs) {
  const status = el('div', { class: 'cu-iban-status', 'aria-live': 'polite' });
  inputs.iban.parentElement.appendChild(status);
  const auto = { bic: !inputs.bic.value, bankname: !inputs.bankname.value };
  inputs.bic.addEventListener('input', () => { auto.bic = false; pruefen(); });
  inputs.bankname.addEventListener('input', () => { auto.bankname = false; });
  let nr = 0;
  async function pruefen() {
    const roh = inputs.iban.value.replace(/\s+/g, '');
    const n = ++nr;
    if (roh.length < 5) { status.replaceChildren(); status.className = 'cu-iban-status'; return; }
    try {
      const p = await API.get('/iban/pruefen' + API.qs({ iban: roh, bic: auto.bic ? '' : inputs.bic.value }));
      if (n !== nr) return;
      if (p.fehler) {
        status.className = 'cu-iban-status fehler';
        status.replaceChildren(el('span', { text: '✖ ' + p.fehler }));
        return;
      }
      if (p.bank && auto.bic) inputs.bic.value = p.bic_vorschlag || '';
      if (p.bank && auto.bankname) inputs.bankname.value = p.bank.name;
      status.className = 'cu-iban-status ' + (p.hinweise.length ? 'hinweis' : 'ok');
      status.replaceChildren(
        el('div', { text: p.bank ? `✓ ${p.bank.name}, ${p.bank.ort} · BIC ${p.bic_vorschlag || '–'} · BLZ ${p.blz}` : '✓ IBAN gültig (Prüfziffer korrekt)' }),
        ...p.hinweise.map((h) => el('div', { text: '⚠ ' + h })),
      );
    } catch { /* Netzwerk – Prüfung erfolgt spätestens beim Speichern */ }
  }
  inputs.iban.addEventListener('input', debounce(pruefen, 250));
  inputs.iban.addEventListener('blur', () => {
    const roh = inputs.iban.value.replace(/\s+/g, '').toUpperCase();
    if (roh) inputs.iban.value = ibanFormat(roh);
  });
  if (inputs.iban.value) pruefen();
}
/** Nach dem Speichern: Hinweise der Plausibilitätsprüfung anzeigen. */
const hinweiseZeigen = (r) => { (r && r.hinweise || []).forEach((h) => toast(h)); return r; };

function bankForm(a, b, danach) {
  formFenster({
    titel: b ? 'Bankverbindung bearbeiten' : 'Neue Bankverbindung – ' + a.anzeigename,
    felder: [
      { grid: 2, felder: [
        { name: 'kontoinhaber', label: 'Kontoinhaber', required: true, value: b ? b.kontoinhaber : a.anzeigename },
        { name: 'iban', label: 'IBAN', required: true, value: b ? ibanFormat(b.iban) : '', placeholder: 'DE89 3704 0044 0532 0130 00' },
      ] },
      { grid: 3, felder: [
        { name: 'bic', label: 'BIC (wird ermittelt)', value: b?.bic },
        { name: 'bankname', label: 'Bank', value: b?.bankname },
        { name: 'standard', label: 'Standard-Bankverbindung', type: 'select', options: JA_NEIN, value: b ? String(b.standard) : '0' },
      ] },
      { grid: 3, felder: [
        { name: 'mandatsreferenz', label: 'SEPA-Mandatsreferenz', value: b?.mandatsreferenz },
        { name: 'mandat_datum', label: 'Mandat unterschrieben am', type: 'date', value: b?.mandat_datum },
        { name: 'mandat_aktiv', label: 'Lastschrift erlaubt', type: 'select', options: JA_NEIN, value: b ? String(b.mandat_aktiv) : '0' },
      ] },
      { felder: [{ name: 'bemerkung', label: 'Bemerkung', value: b?.bemerkung }] },
    ],
    speichern: async (v) => hinweiseZeigen(await (b ? API.put('/bank/' + b.id, v) : API.post(`/adressen/${a.id}/bank`, v))),
    nachAufbau: ibanLivePruefung,
    loeschen: b ? () => API.del('/bank/' + b.id) : null,
    loeschFrage: `Bankverbindung ${b ? ibanFormat(b.iban) : ''} löschen?`,
    danach,
  });
}

function bankDialog(a) {
  listenFenster({
    titel: 'Bankverbindungen – ' + a.anzeigename,
    neuText: 'Neue Bankverbindung',
    neu: (zeichnen) => bankForm(a, null, zeichnen),
    laden: async (zeichnen) => {
      const liste = await API.get(`/adressen/${a.id}/bank`);
      return raster([
        { label: 'Kontoinhaber', render: (b) => b.kontoinhaber },
        { label: 'IBAN', class: 'nowrap', render: (b) => el('span', { class: 'hp-iban', text: ibanFormat(b.iban) }) },
        { label: 'BIC', class: 'nowrap', render: (b) => b.bic || '' },
        { label: 'Bank', render: (b) => b.bankname || '' },
        { label: 'Standard', class: 'zentriert', render: (b) => haken(b.standard, 'Standard') },
        { label: 'SEPA-Mandat', render: (b) => (b.mandatsreferenz
          ? el('span', {}, [document.createTextNode(`${b.mandatsreferenz} vom ${datumKurz(b.mandat_datum)} `), b.mandat_aktiv ? badge('Lastschrift', 'badge-aktiv') : badge('inaktiv', 'badge-inaktiv')])
          : '') },
      ], liste, { onOpen: darfSchreiben() ? (b) => bankForm(a, b, zeichnen) : null, leer: 'Keine Bankverbindung hinterlegt.' });
    },
  });
}

// ---- E-Mail (Adressen: Versand laut Portooptimierung + Info für den SB) ----
function emailForm(a, m, danach) {
  formFenster({
    titel: m ? 'E-Mail-Adresse / Webseite bearbeiten' : 'Neue E-Mail-Adresse / Webseite',
    felder: [
      { grid: 2, felder: [
        { name: 'ist_email', label: 'Art', type: 'select', options: [{ value: '1', label: 'E-Mail-Adresse' }, { value: '0', label: 'Webseite' }], value: m ? String(m.ist_email) : '1' },
        { name: 'adresse', label: 'eMail Adresse / Webseite', required: true, value: m?.adresse, placeholder: 'name@beispiel.de' },
      ] },
      { felder: [{ name: 'bemerkung', label: 'Bemerkung (Info für den Sachbearbeiter)', value: m?.bemerkung }] },
      { grid: 2, felder: [
        { name: 'standard', label: 'Standard (Versand von Unterlagen)', type: 'select', options: JA_NEIN, value: m ? String(m.standard) : '0' },
        { name: 'hpmobile', label: 'HPMobile', type: 'select', options: JA_NEIN, value: m ? String(m.hpmobile) : '0' },
      ] },
    ],
    speichern: (v) => (m ? API.put('/emails/' + m.id, v) : API.post(`/adressen/${a.id}/emails`, v)),
    loeschen: m ? () => API.del('/emails/' + m.id) : null,
    loeschFrage: `${m?.adresse || ''} löschen?`,
    danach,
  });
}

function emailListeDialog(a) {
  listenFenster({
    titel: 'E-Mail-Adressen – ' + a.anzeigename,
    neuText: 'Neue E-Mail-Adresse',
    neu: (zeichnen) => emailForm(a, null, zeichnen),
    laden: async (zeichnen) => {
      const [kom, versand] = await Promise.all([API.get(`/adressen/${a.id}/kommunikation`), API.get(`/adressen/${a.id}/versand`)]);
      const portoText = `Portooptimierung: Unterlagen gehen standardmäßig per ${VERSAND[versand.standard]}` +
        (versand.standard !== 'post' ? (versand.email ? ` an ${versand.email}.` : ' – aber es ist keine E-Mail-Adresse als Standard hinterlegt!') : '.');
      return el('div', {}, [
        el('div', { class: 'hint hp-porto-hinweis' }, [
          document.createTextNode(portoText + ' '),
          el('button', { type: 'button', class: 'hp-mini', text: 'Versandoptionen ändern', onclick: () => versandDialog(a, versand) }),
        ]),
        raster([
          { label: 'eMail Adresse / Webseite', render: (m) => (m.ist_email ? link(m.adresse, 'mailto:' + encodeURI(m.adresse)) : el('a', { href: webHref(m.adresse), target: '_blank', rel: 'noopener noreferrer', text: m.adresse })) },
          { label: 'Bemerkung', render: (m) => m.bemerkung || '' },
          { label: 'eMail', class: 'zentriert', render: (m) => haken(m.ist_email, 'E-Mail') },
          { label: 'Standard', class: 'zentriert', render: (m) => haken(m.standard, 'Standard') },
          { label: 'HPMobile', class: 'zentriert', render: (m) => haken(m.hpmobile, 'HPMobile') },
          { label: '', class: 'aktionen', render: (m) => (m.ist_email ? el('a', { class: 'btn hp-mini', href: 'mailto:' + encodeURI(m.adresse), text: 'schreiben' }) : null) },
        ], kom.emails, { onOpen: darfSchreiben() ? (m) => emailForm(a, m, zeichnen) : null, leer: 'Keine E-Mail-Adresse hinterlegt.' }),
      ]);
    },
  });
}

// ---------------------------------------------------------------------
//  Objektmaske: Bank, Verteilerschlüssel (Vschl.), Pfkt., Info, Auswahl Wohnung/Adresse
// ---------------------------------------------------------------------
const KONTOART = { hausgeld: 'Hausgeldkonto', ruecklage: 'Rücklagenkonto', miete: 'Mietkonto', kaution: 'Kautionskonto', sonstiges: 'Sonstiges' };

/** Zahl deutsch mit festen Nachkommastellen (Anteile wie in HausPerfekt: 14.600,000). */
const zahlDe = (n, stellen = 3) => (n == null || n === '' ? '' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }));
/** „14.600,5" / „518,7" / „14.600" → Zahl; leer → null. */
function zahlAusDe(t) {
  const s = String(t ?? '').trim().replace(/\s+/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s);
  return Number.isFinite(n) ? n : NaN;
}

function objektBankForm(o, b, danach) {
  formFenster({
    titel: b ? 'Bankkonto des Objekts bearbeiten' : `Neues Bankkonto – ${UI.objektNummer(o)} ${o.bezeichnung}`,
    felder: [
      { grid: 2, felder: [
        { name: 'kontoart', label: 'Kontoart', type: 'select', options: opt(KONTOART), value: b ? b.kontoart : 'hausgeld' },
        { name: 'kontoinhaber', label: 'Kontoinhaber', required: true, value: b ? b.kontoinhaber : (o.objekttyp === 'WEG' ? `WEG ${o.bezeichnung}` : '') },
      ] },
      { grid: 2, felder: [
        { name: 'iban', label: 'IBAN', required: true, value: b ? ibanFormat(b.iban) : '', placeholder: 'DE89 3704 0044 0532 0130 00' },
        { name: 'bic', label: 'BIC (wird ermittelt)', value: b?.bic },
      ] },
      { grid: 2, felder: [
        { name: 'bankname', label: 'Bank', value: b?.bankname },
        { name: 'standard', label: 'Standardkonto', type: 'select', options: JA_NEIN, value: b ? String(b.standard) : '0' },
      ] },
      { felder: [{ name: 'bemerkung', label: 'Bemerkung', value: b?.bemerkung }] },
    ],
    speichern: async (v) => hinweiseZeigen(await (b ? API.put('/objektbank/' + b.id, v) : API.post(`/objekte/${o.id}/bank`, v))),
    nachAufbau: ibanLivePruefung,
    loeschen: b ? () => API.del('/objektbank/' + b.id) : null,
    loeschFrage: `Bankkonto ${b ? ibanFormat(b.iban) : ''} löschen?`,
    danach,
  });
}

function objektBankDialog(o) {
  listenFenster({
    titel: `Bankkonten – Objekt ${UI.objektNummer(o)} ${o.bezeichnung}`,
    neuText: 'Neues Bankkonto',
    neu: (zeichnen) => objektBankForm(o, null, zeichnen),
    laden: async (zeichnen) => raster([
      { label: 'Kontoart', render: (b) => KONTOART[b.kontoart] || b.kontoart },
      { label: 'Kontoinhaber', render: (b) => b.kontoinhaber },
      { label: 'IBAN', class: 'nowrap', render: (b) => el('span', { class: 'hp-iban', text: ibanFormat(b.iban) }) },
      { label: 'BIC', class: 'nowrap', render: (b) => b.bic || '' },
      { label: 'Bank', render: (b) => b.bankname || '' },
      { label: 'Standard', class: 'zentriert', render: (b) => haken(b.standard, 'Standard') },
    ], await API.get(`/objekte/${o.id}/bank`), { onOpen: darfSchreiben() ? (b) => objektBankForm(o, b, zeichnen) : null, leer: 'Kein Bankkonto hinterlegt.' }),
  });
}

/** Verteilerschlüssel mit Anteilen je Einheit; Summe wird live gegen den Gesamtanteil geprüft. */
async function verteilerForm(o, s, danach) {
  let daten;
  try {
    daten = s ? await API.get('/verteiler/' + s.id+(s.jahr?'?jahr='+s.jahr:''))
      : { anteile: (await API.get(`/objekte/${o.id}/einheiten`)).map((e) => ({ einheit_id: e.id, nummer: e.nummer, bezeichnung: e.bezeichnung, lage: e.lage, anteil: null })) };
  } catch (e) { fehler(e); return; }
  if(daten.hp_jahresstand){await hpJahresanteile(o,daten);return;}
  const { form, werte, inputs } = formular([
    { grid: 3, felder: [
      { name: 'kuerzel', label: 'VerteilerSchl.', required: true, value: daten.kuerzel, placeholder: 'z. B. 200 oder SWA' },
      { name: 'bezeichnung', label: 'Bezeichnung', required: true, value: daten.bezeichnung, placeholder: 'z. B. Einheiten Gesamtobjekt' },
      { name: 'gesamt', label: 'Gesamtanteil (leer = Summe der Einheiten)', value: zahlDe(daten.gesamt), placeholder: 'z. B. 1.000,000' },
    ] },
    { felder: [{ name: 'bemerkung', label: 'Bemerkung', value: daten.bemerkung }] },
  ]);
  const summeEl = el('div', { class: 'hp-vschl-summe', 'aria-live': 'polite' });
  const felder = daten.anteile.map((a) => el('input', {
    type: 'text', inputmode: 'decimal', class: 'hp-anteil', autocomplete: 'off', 'aria-label': `Anteil Einheit ${a.nummer}`, value: zahlDe(a.anteil),
  }));
  const summe = () => {
    const werteListe = felder.map((f) => zahlAusDe(f.value));
    const ungueltig = werteListe.some((n) => Number.isNaN(n));
    const n = werteListe.reduce((x, y) => x + (y || 0), 0);
    const g = zahlAusDe(inputs.gesamt.value);
    const abw = !ungueltig && g != null && !Number.isNaN(g) && felder.some((f) => f.value.trim()) && Math.abs(n - g) > 0.0005;
    summeEl.textContent = ungueltig ? 'Bitte nur Zahlen eintragen (z. B. 125,500).' : `Summe der Einheiten: ${zahlDe(n)}${abw ? ` – weicht vom Gesamtanteil ${zahlDe(g)} ab` : ''}`;
    summeEl.classList.toggle('warn', ungueltig || abw);
  };
  felder.forEach((f) => f.addEventListener('input', summe));
  inputs.gesamt.addEventListener('input', summe);
  summe();
  form.appendChild(el('div', { class: 'hp-abschnitt' }, [
    el('div', { class: 'hp-abschnitt-kopf' }, [el('span', { class: 'hp-blau', text: 'Anteile je Einheit' })]),
    daten.anteile.length
      ? el('div', { class: 'hp-tabelle-wrap' }, [el('table', { class: 'hp-tabelle' }, [
        el('thead', {}, [el('tr', {}, ['Nr.', 'Bezeichnung', 'Lage', 'Anteil'].map((t, i) => el('th', { class: i === 3 ? 'zahl' : '', text: t })))]),
        el('tbody', {}, daten.anteile.map((a, i) => el('tr', {}, [
          el('td', { class: 'nowrap', text: a.nummer }), el('td', { text: a.bezeichnung || '' }), el('td', { text: a.lage || '' }), el('td', { class: 'zahl' }, [felder[i]]),
        ]))),
      ])])
      : el('p', { class: 'small muted', text: 'Dieses Objekt hat noch keine Einheiten – der Gesamtanteil kann trotzdem erfasst werden.' }),
    summeEl,
  ]));
  modal({
    titel: s ? `Verteilerschlüssel ${daten.kuerzel} – ${UI.objektNummer(o)} ${o.bezeichnung}` : `Neuer Verteilerschlüssel – ${UI.objektNummer(o)} ${o.bezeichnung}`,
    wide: true,
    inhalt: form,
    footer: (close) => [
      s ? el('button', { class: 'btn-danger', text: 'Löschen', onclick: async () => {
        if (!(await bestaetigen(`Verteilerschlüssel ${daten.kuerzel} mit allen Einheitenanteilen löschen?`, { danger: true, text: 'Löschen' }))) return;
        try { await API.del('/verteiler/' + s.id); toast('Gelöscht', 'success'); close(); danach(); } catch (e) { fehler(e); }
      } }) : null,
      el('button', { text: 'Abbrechen', onclick: close }),
      el('button', { class: 'btn-primary', text: 'Speichern', onclick: async () => {
        try {
          const v = { ...werte(), anteile: daten.anteile.map((a, i) => ({ einheit_id: a.einheit_id, anteil: felder[i].value })) };
          if (s) await API.put('/verteiler/' + s.id, v); else await API.post(`/objekte/${o.id}/verteiler`, v);
          toast('Verteilerschlüssel gespeichert', 'success'); close(); danach();
        } catch (e) { fehler(e); }
      } }),
    ],
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());
}

const verteilerSpalten = [
  { label: 'VerteilerSchl.', class: 'nowrap', render: (s) => s.kuerzel },
  { label:'Jahr',render:s=>s.jahr||'—' },
  { label: 'Bezeichnung', render: (s) => s.bezeichnung },
  { label: 'Anteil', class: 'zahl nowrap', render: (s) => s.jahr?(s.anteil==null?'—':zahlDe(s.anteil,3)):(s.abweichung
    ? el('span', { class: 'hp-warn', title: `Summe der Einheiten ${zahlDe(s.summe_einheiten)} weicht vom Gesamtanteil ab`, text: `⚠ ${zahlDe(s.anteil)}` })
    : zahlDe(s.anteil)) },
];

async function verteilerDialog(o) {
  try{const years=await API.get(`/objekte/${o.id}/verteiler-jahre`);if(years.length){
    const choice=el('select',{'aria-label':'Buchungsjahr'},[...years.map(y=>el('option',{value:String(y),text:String(y)})),el('option',{value:'undatiert',text:'Undatierte lokale Werte'})]),list=el('div'),info=el('p',{role:'status'});
    const draw=async()=>{try{const rows=await API.get(`/objekte/${o.id}/verteiler?jahr=`+choice.value);list.replaceChildren(raster([...verteilerSpalten,{label:'Einheiten',render:s=>s.einheiten_anzahl}],rows,{onOpen:s=>verteilerForm(o,s,draw),leer:'Keine Schlüssel für dieses Jahr.'}));}catch(e){info.textContent=e.message;}};
    choice.addEventListener('change',draw);modal({titel:`Verteilerschlüssel – ${UI.objektNummer(o)}`,wide:true,inhalt:el('div',{},[el('label',{},['Buchungsjahr ',choice]),list,info]),footer:close=>[el('button',{text:'Schließen',onclick:close})]});await draw();return;
  }}catch(e){fehler(e);return;}
  listenFenster({
    titel: `Verteilerschlüssel – Objekt ${UI.objektNummer(o)} ${o.bezeichnung}`,
    neuText: 'Neuer Verteilerschlüssel',
    neu: (zeichnen) => verteilerForm(o, null, zeichnen),
    laden: async (zeichnen) => raster([...verteilerSpalten, { label: 'Einheiten', class: 'zahl', render: (s) => s.einheiten_anzahl }],
      await API.get(`/objekte/${o.id}/verteiler`), { onOpen: darfSchreiben() ? (s) => verteilerForm(o, s, zeichnen) : null, leer: 'Noch keine Verteilerschlüssel.' }),
  });
}

/** Objekt → PFkt.: allgemeine Personenfunktionen (Beirat, Hausmeister, Handwerker …) – Eigentümer/Mieter nur in der Wohnung. */
/** Einstellungen › Personenfunktionen: Code-Liste wie in HausPerfekt pflegen (nur Administratoren). */
function pfktCodesDialog() {
  const form = (c, danach) => formFenster({
    titel: c ? `Personenfunktion ${c.code}` : 'Neue Personenfunktion',
    felder: [{ grid: 3, felder: [
      { name: 'code', label: 'Code (bis 3 Zeichen)', value: c?.code || '', placeholder: 'z. B. 003' },
      { name: 'bezeichnung', label: 'Bezeichnung', value: c?.bezeichnung || '', placeholder: 'z. B. Mieter -fremd- (WEG)' },
      { name: 'rolle', label: 'Funktion', type: 'select', options: opt(L.rolle), value: c?.rolle || 'eigentuemer' },
    ] }, { grid: 3, felder: [
      { name: 'kennz', label: 'Mieter/Eigentümer', type: 'select', value: c?.kennz || '',
        options: [{ value: '', label: '–' }, { value: 'E', label: 'E – Eigentümer' }, { value: 'M', label: 'M – Mieter' }, { value: 'L', label: 'L – Leerstand' }, { value: 'A', label: 'A – Ableser' }] },
    ] }],
    speichern: (v) => API.put('/pfkt-codes', v),
    loeschen: c && !c.verwendet ? () => API.del('/pfkt-codes/' + c.code) : null,
    loeschFrage: c ? `Code ${c.code} löschen?` : '',
    danach,
  });
  listenFenster({
    titel: 'Personenfunktionen (Codes)',
    neuText: istAdmin() ? 'Neuer Code' : null,
    neu: istAdmin() ? (zeichnen) => form(null, zeichnen) : null,
    laden: async (zeichnen) => el('div', {}, [
      el('p', { class: 'small muted', text: 'Schlüsseltabelle PFkt aus HausPerfekt. Bei Eigentümern (E) und Mietern (M/L) bildet der Code die 1. Stelle der PKto-Nr. (Personenfunktion + Wechsler + Einheitsnummer), z. B. 20001 = 002, erster, Einheit 001.' }),
      raster([
        { label: 'Code', class: 'nowrap', render: (c) => el('strong', { text: c.code }) },
        { label: 'Bezeichnung', render: (c) => c.bezeichnung },
        { label: 'M/E', class: 'nowrap', render: (c) => c.kennz || '' },
        { label: 'Funktion', render: (c) => L.rolle[c.rolle] || c.rolle },
        { label: 'verwendet', class: 'zahl', render: (c) => (c.verwendet ? String(c.verwendet) : '') },
      ], await API.get('/pfkt-codes'), { onOpen: istAdmin() ? (c) => form(c, zeichnen) : null, leer: 'Noch keine Codes.' }),
    ]),
  });
}

function objektPfktDialog(o) {
  listenFenster({
    titel: `Allgemeine Personenfunktionen – Objekt ${UI.objektNummer(o)} ${o.bezeichnung}`,
    neuText: 'Neue Personenfunktion',
    neu: (zeichnen) => zuordnungFormular({ objekt_id: o.id }, zeichnen),
    laden: async (zeichnen) => {
      const zuord = (await API.get(`/objekte/${o.id}/zuordnungen`)).filter((z) => !z.einheit_id);
      return el('div', {}, [
        raster([
          { label: 'Zeitraum', class: 'nowrap', render: zeitraum },
          { label: 'Funktion', render: (z) => L.rolle[z.rolle] || z.rolle },
          { label: 'Nr.', class: 'nowrap', render: (z) => z.adresse_nummer },
          { label: 'Name', render: (z) => z.anzeigename || nameAusZuord(z) },
          { label: 'Status', render: (z) => (z.aktiv ? badge('aktiv', 'badge-aktiv') : badge('beendet/künftig', 'badge-inaktiv')) },
        ], zuord, { onOpen: darfSchreiben() ? (z) => zuordnungFormular(z, zeichnen) : null, leer: 'Noch keine allgemeinen Personenfunktionen.' }),
        el('p', { class: 'small muted', text: 'Mieter, Eigentümer und Leerstände werden in der Wohnung/Einheit angelegt (Strg+W).' }),
      ]);
    },
  });
}

function objektInfoDialog(o) {
  formFenster({
    titel: `Info – Objekt ${UI.objektNummer(o)} ${o.bezeichnung}`,
    felder: [{ felder: [{ name: 'notizen', label: 'Info / wichtige Hinweise zum Objekt', type: 'textarea', value: o.notizen }] }],
    speichern: (v) => API.put('/objekte/' + o.id, { ...o, nummer: '', notizen: v.notizen }),
    danach: neuLaden,
  });
}

/** Strg+W im Objekt: Wohnung wählen (keine vorhanden → erste Einheit anlegen). */
async function einheitWahl(o) {
  let liste;
  try { liste = await API.get(`/objekte/${o.id}/einheiten`); } catch (e) { fehler(e); return; }
  if (!liste.length) {
    if (darfSchreiben()) { toast('Noch keine Wohnung im Objekt – erste Einheit anlegen.'); einheitFormular(o.id); } else toast('Dieses Objekt hat noch keine Wohnungen.');
    return;
  }
  if (liste.length === 1) { geheZu('#/einheiten/' + liste[0].id); return; }
  let m;
  const r = raster([
    { label: 'Nr.', class: 'nowrap', render: (e) => e.nummer },
    { label: 'Bezeichnung', render: (e) => e.bezeichnung },
    { label: 'Typ', render: (e) => L.einheitstyp[e.einheitstyp] || e.einheitstyp },
    { label: 'Lage', render: (e) => e.lage },
  ], liste, { onOpen: (e) => { m.close(); geheZu('#/einheiten/' + e.id); } });
  m = modal({
    titel: `Wohnung wählen – Objekt ${UI.objektNummer(o)} ${o.bezeichnung}`, wide: true, inhalt: r,
    footer: (close) => [
      darfSchreiben() ? el('button', { text: 'Neue Einheit (F4)', onclick: () => { close(); einheitFormular(o.id); } }) : null,
      el('button', { text: 'Abbrechen', onclick: close }),
    ],
  });
  m.box.addEventListener('keydown', ev => {
    if (ev.key === 'F4' && darfSchreiben()) { ev.preventDefault(); ev.stopPropagation(); m.close(); einheitFormular(o.id); }
  });
  r.querySelector('tr.klick')?.focus();
}

/** Strg+A im Objekt: Adresse wählen (aktuelle Personenfunktionen im Objekt und seinen Wohnungen). */
async function adresseWahl(o, einheitId = null) {
  let zuord;
  try { zuord = (await API.get(`/objekte/${o.id}/zuordnungen`)).filter((z) => z.aktiv && (einheitId == null || String(z.einheit_id) === String(einheitId))); } catch (e) { fehler(e); return; }
  if (!zuord.length) { toast('Im Objekt ist aktuell keine Personenfunktion hinterlegt.'); return; }
  let m;
  const r = raster([
    { label: 'Funktion', render: (z) => L.rolle[z.rolle] || z.rolle },
    { label: 'Wohnung', class: 'nowrap', render: (z) => (z.einheit_id ? z.einheit_nummer : 'Objekt') },
    { label: 'Nr.', class: 'nowrap', render: (z) => z.adresse_nummer },
    { label: 'Name', render: (z) => z.anzeigename || nameAusZuord(z) },
  ], zuord, { onOpen: (z) => { m.close(); geheZu('#/adressen/' + z.adresse_id); } });
  m = modal({ titel: `Adresse wählen – Objekt ${UI.objektNummer(o)} ${o.bezeichnung}`, wide: true, inhalt: r, footer: (close) => [el('button', { text: 'Abbrechen', onclick: close })] });
  r.querySelector('tr.klick')?.focus();
}

// ---- Telefoneingang erfassen (Strg+E) – Aufbau wie HausPerfekt ----------------
/** Adress-Eingabe aus Nr.-Feld + Namensfeld (Vorschläge); ruft onWahl(adresse|null). */
function adressFelder(nrInput, nameInput, onWahl) {
  const liste = el('datalist', { id: nameInput.id + '_liste' });
  nameInput.setAttribute('list', liste.id);
  let treffer = [];
  let timer = null;
  const wahl = (a) => {
    nrInput.value = a ? a.nummer || '' : nrInput.value;
    if (a) nameInput.value = a.anzeigename;
    onWahl(a);
  };
  nrInput.addEventListener('change', async () => {
    const nr = nrInput.value.trim();
    if (!nr) { onWahl(null); return; }
    try {
      const a = (await API.get('/adressen?suche=' + encodeURIComponent(nr))).find((x) => String(x.nummer) === nr);
      if (a) wahl(a); else { toast(`Adress-Nr. ${nr} nicht gefunden.`, 'error'); onWahl(null); }
    } catch (e) { fehler(e); }
  });
  nameInput.addEventListener('input', () => {
    clearTimeout(timer);
    const q = nameInput.value.trim();
    const genau = treffer.find((a) => `${a.anzeigename} (${a.nummer})` === q);
    if (genau) { wahl(genau); return; }
    if (q.length < 2) return;
    timer = setTimeout(async () => {
      try {
        treffer = (await API.get('/adressen?suche=' + encodeURIComponent(q))).slice(0, 30);
        liste.replaceChildren(...treffer.map((a) => el('option', { value: `${a.anzeigename} (${a.nummer})`, text: a.ort || '' })));
      } catch (e) { fehler(e); }
    }, 250);
  });
  return { liste, wahl };
}

/** Plaud-Gerät: Aufnahme oder Text-Export hochladen → Zusammenfassung in die Bemerkung. */
function plaudBlock(bemerkung, kontext, k) {
  let herkunft = k ? { aufnahme: k.aufnahme || null, aufnahme_zustimmung: k.aufnahme_zustimmung ? 1 : 0 } : { aufnahme: null, aufnahme_zustimmung: 0 };
  const datei = el('input', { id: 'tel_plaud_datei', type: 'file', hidden: 'hidden',
    accept: 'audio/*,.mp3,.m4a,.wav,.ogg,.opus,.webm,.aac,.flac,.mp4,.amr,.txt,.md,.srt,.vtt', 'aria-label': 'Plaud-Aufnahme oder Text auswählen' });
  const zustimmung = el('input', { id: 'tel_plaud_zust', type: 'checkbox' });
  const kuerzen = el('input', { type: 'checkbox' });
  const dateiname = el('div', { class: 'tel-plaud-dateiname', hidden: 'hidden' });
  const hinweis = el('div', { class: 'tel-plaud-hinweis small', 'aria-live': 'polite' });
  const status = el('div', { class: 'tel-plaud-status small', 'aria-live': 'polite' });
  const eingefuegt = el('textarea', { id: 'tel_plaud_text', rows: '4', maxlength: '200000',
    placeholder: 'Zusammenfassung aus Plaud hier einfügen …', 'aria-describedby': 'tel_plaud_anleitung' });
  const uebernehmen = el('button', { type: 'button', class: 'tel-plaud-uebernehmen btn-primary', text: 'In Bemerkung übernehmen' });
  const textKi = el('button', { type: 'button', class: 'tel-plaud-text-ki', text: 'Eingefügten Text mit KI kürzen', hidden: 'hidden' });
  const abschrift = el('details', { class: 'tel-plaud-abschrift', hidden: 'hidden' }, [el('summary', { text: 'Abschrift anzeigen (wird nicht gespeichert)' }), el('div', { class: 'hp-umbruch' })]);
  const hauptknopf = el('button', { type: 'button', class: 'tel-plaud-knopf btn-primary', text: 'Plaud-Datei auswählen' });
  const wechseln = el('button', { type: 'button', class: 'tel-plaud-wechsel', text: 'Andere Datei', hidden: 'hidden' });
  const zustZeile = el('label', { class: 'tel-haken tel-plaud-zust', hidden: 'hidden' }, [zustimmung, ' Alle Gesprächspartner haben der Aufzeichnung zugestimmt.']);
  const textZeile = el('label', { class: 'tel-haken', hidden: 'hidden' }, [kuerzen, ' Text zusätzlich mit KI kürzen']);
  let kiBereit = null;
  let laeuft = false;
  const istAudio = () => datei.files[0] && !/\.(txt|md|srt|vtt)$/i.test(datei.files[0].name);
  function notizEinfuegen(text, quelle) {
    const neu = String(text || '').trim();
    if (!neu) { status.textContent = 'Bitte zuerst die Zusammenfassung aus Plaud einfügen.'; eingefuegt.focus(); return false; }
    const alt = bemerkung.value.trim();
    const gesamt = alt ? alt + '\n\n' + neu : neu;
    const limit = bemerkung.maxLength > 0 ? bemerkung.maxLength : 4000;
    if (gesamt.length > limit) {
      status.textContent = `Die Bemerkung wäre ${gesamt.length} Zeichen lang (maximal ${limit}). Bitte den eingefügten Text oder die vorhandene Bemerkung kürzen. Es wurde nichts verändert.`;
      return false;
    }
    bemerkung.value = gesamt;
    bemerkung.dispatchEvent(new Event('input', { bubbles: true }));
    // Beim Ergänzen einer bestehenden Audionotiz deren Zustimmungsnachweis erhalten.
    if (quelle === 'audio' || herkunft.aufnahme !== 'audio') herkunft = { aufnahme: quelle, aufnahme_zustimmung: quelle === 'audio' ? 1 : 0 };
    bemerkung.focus();
    return true;
  }
  function anzeigen() {
    const d = datei.files[0];
    hauptknopf.disabled = wechseln.disabled = datei.disabled = zustimmung.disabled = kuerzen.disabled = laeuft;
    uebernehmen.disabled = textKi.disabled = eingefuegt.disabled = laeuft;
    textKi.hidden = kiBereit !== true;
    hauptknopf.textContent = laeuft ? 'Wird verarbeitet …' : !d ? 'Plaud-Datei auswählen' : istAudio() || kuerzen.checked ? 'Zusammenfassen' : 'Text übernehmen';
    wechseln.hidden = dateiname.hidden = !d;
    dateiname.textContent = d ? d.name : '';
    zustZeile.hidden = !istAudio();
    textZeile.hidden = !d || istAudio() || kiBereit !== true;
    hinweis.textContent = kiBereit === false
      ? 'Die KI-Verarbeitung ist für diese App noch nicht eingerichtet. Alle Mitarbeiter können fertige Plaud-Zusammenfassungen trotzdem direkt einfügen und übernehmen.'
      : kiBereit === null ? 'Plaud-Text lässt sich sofort übernehmen. Die KI-Verfügbarkeit für Audio wird geprüft.'
        : 'Plaud-Text direkt übernehmen oder bei Bedarf mit KI kürzen. Audiodateien können ebenfalls verarbeitet werden.';
  }
  const senden = async (ausText = false) => {
    if (laeuft) return;
    if (ausText && !eingefuegt.value.trim()) { status.textContent = 'Bitte zuerst Plaud-Text einfügen.'; eingefuegt.focus(); return; }
    const d = ausText ? new File([eingefuegt.value], 'plaud-text.txt', { type: 'text/plain' }) : datei.files[0];
    const audio = !ausText && istAudio();
    if (!d) { datei.click(); return; }
    if (!/\.(mp3|m4a|wav|ogg|opus|webm|aac|flac|mp4|amr|txt|md|srt|vtt)$/i.test(d.name)) { status.textContent = 'Bitte eine Audiodatei oder einen Plaud-Text (TXT, MD, SRT, VTT) auswählen.'; return; }
    if (d.size > 95 * 1024 * 1024) { status.textContent = 'Die Datei ist größer als 95 MB. Bitte eine kleinere Aufnahme oder einen Text-Export auswählen.'; return; }
    const modus = ausText || audio || kuerzen.checked ? 'zusammenfassen' : 'uebernehmen';
    if (modus === 'zusammenfassen' && kiBereit === false) { status.textContent = 'Die KI-Verarbeitung ist für diese App noch nicht eingerichtet. Deine Mitarbeiterrechte reichen aus. Kopiere die fertige Zusammenfassung in Plaud und füge sie oben ein.'; return; }
    if (audio && !zustimmung.checked) { status.textContent = 'Bitte zuerst die Zustimmung aller Gesprächspartner zur Aufzeichnung bestätigen.'; zustimmung.focus(); return; }
    const fd = new FormData();
    fd.append('datei', d); fd.append('modus', modus); fd.append('zustimmung', zustimmung.checked ? '1' : '0'); fd.append('kontext', kontext());
    laeuft = true;
    anzeigen();
    status.textContent = modus === 'uebernehmen' ? 'Text wird übernommen …' : audio
      ? 'Aufnahme wird abgeschrieben und zusammengefasst … Bei langen Gesprächen kann das einige Minuten dauern.' : 'Text wird zusammengefasst …';
    try {
      const r = await API.upload('/gespraech/zusammenfassen', fd);
      if (!notizEinfuegen(r.zusammenfassung, r.quelle)) {
        // Ergebnis zum manuellen Kürzen erhalten; nichts still abschneiden.
        if (eingefuegt.value.trim() && eingefuegt.value.trim() !== String(r.zusammenfassung).trim()) {
          eingefuegt.value += '\n\n' + r.zusammenfassung;
        } else eingefuegt.value = r.zusammenfassung;
        return;
      }
      abschrift.hidden = !r.abschrift;
      abschrift.lastChild.textContent = r.abschrift || '';
      status.textContent = 'Fertig. Bemerkung prüfen und den Telefoneingang mit „Ok“ speichern.' + (r.quelle === 'audio' ? ' Die Audiodatei wurde nicht gespeichert.' : '');
      if (ausText) eingefuegt.value = '';
      else { datei.value = ''; zustimmung.checked = kuerzen.checked = false; }
    } catch (e) { status.textContent = (e && e.message ? e.message : 'Die Verarbeitung ist fehlgeschlagen.') + ' Bitte erneut versuchen oder eine andere Datei auswählen.'; }
    finally { laeuft = false; anzeigen(); }
  };
  API.get('/gespraech/status').then((s) => {
    kiBereit = !!s.eingerichtet;
    anzeigen();
  }).catch(() => { hinweis.textContent = 'Die KI-Verfügbarkeit konnte nicht geprüft werden. Du kannst die Verarbeitung erneut versuchen oder Plaud-Text direkt übernehmen.'; });
  hauptknopf.addEventListener('click', () => senden());
  textKi.addEventListener('click', () => senden(true));
  uebernehmen.addEventListener('click', () => {
    if (laeuft) return;
    if (notizEinfuegen(eingefuegt.value, 'text')) {
      eingefuegt.value = '';
      status.textContent = 'Plaud-Zusammenfassung übernommen. Bemerkung prüfen und mit „Ok“ speichern.';
    }
  });
  wechseln.addEventListener('click', () => datei.click());
  kuerzen.addEventListener('change', anzeigen);
  datei.addEventListener('change', () => {
    zustimmung.checked = kuerzen.checked = false;
    abschrift.hidden = true;
    abschrift.lastChild.textContent = '';
    status.textContent = datei.files[0] ? istAudio() ? 'Zustimmung bestätigen und auf „Zusammenfassen“ tippen.' : '„Text übernehmen“ fügt den Plaud-Text direkt in die Bemerkung ein.' : '';
    anzeigen();
  });
  const block = el('div', { class: 'tel-plaud' }, [
    el('div', { class: 'tel-plaud-titel', text: 'Notiz aus Plaud' }),
    el('button', { type: 'button', class: 'tel-plaud-direkt btn-primary', text: 'Gespräch aus Plaud auswählen', onclick: () => plaudDirektAuswaehlen((text) => {
      if (!notizEinfuegen(text, 'text')) return false;
      status.textContent = 'Plaud-Zusammenfassung übernommen. Bemerkung prüfen und mit „Ok“ speichern.';
      return true;
    }) }),
    el('p', { class: 'small', text: 'Einmal dein Plaud-Konto verbinden. Danach Gespräche direkt auswählen – ohne Kopieren oder Datei-Upload.' }),
    el('details', { class: 'tel-plaud-datei-option' }, [el('summary', { text: 'Text manuell einfügen oder Datei verwenden' }),
    el('p', { id: 'tel_plaud_anleitung', class: 'small', text: 'In Plaud die Zusammenfassung kopieren. Hier ins Textfeld einfügen und übernehmen – ohne Datei-Download.' }),
    el('label', { for: 'tel_plaud_text', text: 'Zusammenfassung oder Abschrift aus Plaud' }), eingefuegt,
    el('div', { class: 'tel-plaud-knoepfe' }, [uebernehmen, textKi]),
    hinweis,
    el('details', { class: 'tel-plaud-datei-option' }, [
      el('summary', { text: 'Stattdessen eine Audio- oder Textdatei verwenden' }),
      datei, dateiname, zustZeile, textZeile,
      el('div', { class: 'tel-plaud-knoepfe' }, [hauptknopf, wechseln]),
    ]),
    ]),
    status, abschrift,
  ]);
  anzeigen();
  return { block, werte: () => herkunft };
}

const kuerzelVon = (name) => { const w = String(name || '').trim().split(/\s+/).filter(Boolean); return w.length ? (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() : ''; };

async function telefonEingang(vorgabe = {}, k = null, danach = null) {
  if (!darfSchreiben()) { toast('Keine Schreibberechtigung.', 'error'); return; }
  let ma = [];
  try { ma = await API.get('/mitarbeiter'); } catch (e) { fehler(e); return; }
  const start = Date.now();
  const inp = (id, attrs = {}) => el('input', { id: 'tel_' + id, type: 'text', autocomplete: 'off', ...attrs });
  const f = {
    adrNr: inp('adr_nr', { class: 'tel-nr', 'aria-label': 'Adress-Nr.' }), adrName: inp('adr_name', { placeholder: 'Name oder Firma eingeben …' }),
    anrNr: inp('anr_nr', { class: 'tel-nr', 'aria-label': 'Adress-Nr. des Anrufers' }), anrName: inp('anr_name', { maxlength: '120' }),
    tel: inp('tel', { type: 'tel', maxlength: '60' }),
    bemerkung: el('textarea', { id: 'tel_bemerkung', rows: '5', maxlength: '4000' }),
    hwa: inp('hwa', { class: 'tel-kurz', disabled: 'disabled', title: 'Handwerkeraufträge folgen später' }),
    pfkt: inp('pfkt', { class: 'tel-kurz', maxlength: '3' }),
    akte: inp('akte', { class: 'tel-kurz', disabled: 'disabled', title: 'Vorgänge/Akten folgen später', value: '0' }),
    objekt: inp('objekt', { class: 'tel-kurz' }), wohnung: inp('wohnung', { class: 'tel-kurz' }),
    erledigt: el('input', { id: 'tel_erledigt', type: 'checkbox' }),
    sb: el('select', { id: 'tel_rsb' }, [el('option', { value: '', text: '' }), ...ma.map((m) => el('option', { value: m.id, text: m.kuerzel, title: m.name }))]),
    team: inp('team', { maxlength: '60' }),
    datum: el('input', { id: 'tel_datum', type: 'date' }), zeit: el('input', { id: 'tel_zeit', type: 'time' }),
    zeiterf: el('input', { id: 'tel_zeiterf', type: 'checkbox' }),
    ticket: el('input', { id: 'tel_ticket', type: 'checkbox', disabled: 'disabled' }),
    mailSb: el('input', { id: 'tel_mailsb', type: 'checkbox', disabled: 'disabled' }),
    ccSb: el('input', { id: 'tel_ccsb', type: 'checkbox', disabled: 'disabled' }),
    zis: el('input', { id: 'tel_zis', type: 'checkbox' }),
    wv: el('input', { id: 'tel_wv', type: 'checkbox' }),
  };
  const ticketInfo=el('p',{class:'small',role:'status','aria-live':'polite'});
  const ticketPruefen=()=>{f.ticket.checked=!!(f.objekt.value.trim()||f.wohnung.value.trim()||k?.ticket);ticketInfo.replaceChildren(...(k?.ticket?[document.createTextNode('Verknüpft mit '+k.ticket.nummer+' · '),el('a',{href:'#/tickets/'+k.ticket.id,target:'_blank',rel:'noopener',text:'Ticket öffnen'})]:[document.createTextNode(f.ticket.checked?'Ticketentwurf zum ausgewählten Objekt: wird beim Speichern automatisch angelegt.':'Objekt auswählen: das Ticket wird automatisch vorbereitet.')]));};
  f.objekt.addEventListener('input',ticketPruefen);f.objekt.addEventListener('change',ticketPruefen);f.wohnung.addEventListener('input',ticketPruefen);
  const wohnungText = el('span', { class: 'tel-wtext' });
  const plaud = plaudBlock(f.bemerkung, () => [adresse && adresse.anzeigename, f.anrName.value && 'Anrufer: ' + f.anrName.value,
    f.wohnung.value && 'Wohnung ' + f.wohnung.value].filter(Boolean).join(', '), k);
  const info = el('div', { class: 'tel-info', 'aria-live': 'polite' });
  const dauer = el('span', { class: 'tel-dauer', text: '00:00:00' });
  let adresse = null;
  let anrufer = null;

  const zeile = (label, id, ...kinder) => el('div', { class: 'tel-zeile' }, [el('label', { for: id, text: label }), ...kinder]);
  const haken = (input, text, titel) => el('label', { class: 'tel-haken' + (input.disabled ? ' aus' : ''), title: titel || null }, [input, ' ' + text]);

  const pfktSetzen = (z) => {
    f.pfkt.value = z.pfkt_code || '';
    f.objekt.value = z.objekt_nummer || '';
    f.wohnung.value = z.einheit_nummer || '';ticketPruefen();
    wohnungText.textContent = z.einheit_bezeichnung ? '/ ' + z.einheit_bezeichnung : '/';
  };
  const infoZeigen = async (a) => {
    info.replaceChildren();
    if (!a) return;
    let zuord = [];
    try { zuord = (await API.get(`/adressen/${a.id}/zuordnungen`)).filter((z) => z.aktiv); } catch (e) { fehler(e); }
    if (adresse !== a) return;
    info.append(
      el('strong', { text: a.anzeigename }),
      ...[a.zusatz, a.strasse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).map((t) => el('div', { text: t })),
      a.ampel ? el('div', { class: 'tel-ampel ' + a.ampel, text: { gruen: 'Ampel: grün', gelb: 'Ampel: gelb – auf die Wortwahl achten', rot: 'Ampel: rot – schwierig' }[a.ampel] }) : null,
    );
    if (zuord.length) {
      info.append(el('div', { class: 'hp-blau tel-info-kopf', text: zuord.length > 1 ? 'Personenfunktionen – bitte wählen:' : 'Personenfunktion' }));
      zuord.forEach((z) => info.append(el('button', {
        type: 'button', class: 'tel-pfkt',
        text: `${z.pfkt_code || ''} ${z.pfkt_bezeichnung || L.rolle[z.rolle] || z.rolle} · ${z.einheit_nummer || z.objekt_nummer || ''}`,
        onclick: () => pfktSetzen(z),
      })));
      if (zuord.length === 1 && !f.pfkt.value && !f.objekt.value) pfktSetzen(zuord[0]);
    }
  };
  const adr = adressFelder(f.adrNr, f.adrName, (a) => {
    adresse = a;
    if (a && !f.anrName.value) { anrufer = a; f.anrNr.value = a.nummer || ''; f.anrName.value = a.anzeigename; }
    if (a && !f.tel.value) f.tel.value = a.telefon || a.mobil || '';
    infoZeigen(a);
  });
  const anr = adressFelder(f.anrNr, f.anrName, (a) => { anrufer = a; if (a && a.telefon && !f.tel.value) f.tel.value = a.telefon; });
  f.anrName.addEventListener('input', () => { if (anrufer && f.anrName.value !== anrufer.anzeigename && !f.anrName.value.endsWith(`(${anrufer.nummer})`)) { anrufer = null; f.anrNr.value = ''; } });
  f.wohnung.addEventListener('change', () => { wohnungText.textContent = '/'; });

  const wvPruefen = () => {
    f.wv.disabled = f.erledigt.checked || !f.sb.value;
    if (f.wv.disabled) f.wv.checked = false;
    f.wv.closest('.tel-haken')?.classList.toggle('aus', f.wv.disabled);
  };
  f.erledigt.addEventListener('change', wvPruefen);
  f.sb.addEventListener('change', wvPruefen);

  // Vorbelegung: bestehender Eintrag oder Kontext (Adresse/Wohnung/Objekt/PKto)
  const jetzt = lokalJetzt();
  if (k) {
    f.adrNr.value = k.adresse_nummer || ''; f.anrNr.value = k.anrufer_nummer || ''; f.anrName.value = k.anrufer_name || '';
    f.tel.value = k.rueckruf_tel || ''; f.bemerkung.value = k.notiz || ''; f.pfkt.value = k.pfkt_code || '';
    f.objekt.value = k.objekt_nummer || ''; f.wohnung.value = k.einheit_nummer || ''; wohnungText.textContent = '/ ' + (k.einheit_bezeichnung || '');
    f.erledigt.checked = !!k.erledigt; f.sb.value = k.rueckruf_sb_id || ''; f.team.value = k.team || '';
    f.datum.value = k.zeitpunkt.slice(0, 10); f.zeit.value = k.zeitpunkt.slice(11, 16); f.zis.checked = !!k.zis;
    f.zeiterf.checked = k.minuten != null; f.zeiterf.disabled = true;
    dauer.textContent = k.minuten != null ? `${k.minuten} Min.` : '–';
  } else {
    f.datum.value = jetzt.slice(0, 10); f.zeit.value = jetzt.slice(11, 16); f.zeiterf.checked = true;
    if (vorgabe.objekt) f.objekt.value = vorgabe.objekt.nummer || '';
    if (vorgabe.einheit) { f.wohnung.value = vorgabe.einheit.nummer || ''; wohnungText.textContent = '/ ' + (vorgabe.einheit.bezeichnung || ''); }
  }
  wvPruefen();ticketPruefen();
  const ladeAdresse = async (id) => { try { const a = await API.get('/adressen/' + id); adr.wahl(a); return a; } catch (e) { fehler(e); return null; } };
  if (k) {
    adresse = await ladeAdresse(k.adresse_id);
    if (k.anrufer_adresse_id) { try { anrufer = await API.get('/adressen/' + k.anrufer_adresse_id); } catch { /* gelöscht */ } }
    f.anrName.value = k.anrufer_name || ''; f.pfkt.value = k.pfkt_code || '';
    f.objekt.value = k.objekt_nummer || ''; f.wohnung.value = k.einheit_nummer || ''; f.tel.value = k.rueckruf_tel || '';
  } else if (vorgabe.adresse) ladeAdresse(vorgabe.adresse.id);

  ticketPruefen();
  const links = el('div', { class: 'tel-links' }, [
    el('fieldset', { class: 'tel-block' }, [
      zeile('Adresse / Firma:', 'tel_adr_nr', f.adrNr, f.adrName, adr.liste),
      zeile('Anrufer:', 'tel_anr_nr', f.anrNr, f.anrName, anr.liste),
      zeile('Telefon-Nr. für Rückrufe', 'tel_tel', f.tel),
    ]),
    el('fieldset', { class: 'tel-block' }, [el('legend', {}, [el('label', { for: 'tel_bemerkung', text: 'Bemerkung' })]), f.bemerkung, plaud.block]),
    el('fieldset', { class: 'tel-block tel-bezug' }, [
      zeile('HWA:', 'tel_hwa', f.hwa), zeile('PFkt.:', 'tel_pfkt', f.pfkt), zeile('Akte:', 'tel_akte', f.akte),
      zeile('Objekt:', 'tel_objekt', f.objekt), zeile('Wohnung:', 'tel_wohnung', f.wohnung, wohnungText),
    ]),
    el('fieldset', { class: 'tel-block tel-status' }, [
      el('div', { class: 'tel-reihe' }, [
        el('label', { class: 'tel-haken', for: 'tel_erledigt' }, ['Erledigt: ', f.erledigt]),
        el('label', { for: 'tel_rsb', text: 'Rückruf durch SB:' }), f.sb,
        el('label', { for: 'tel_team', text: 'Team' }), f.team,
      ]),
      el('div', { class: 'tel-reihe' }, [
        el('label', { for: 'tel_datum', text: 'Datum/Zeit:' }), f.datum, f.zeit,
        el('span', { class: 'tel-sb' }, [el('span', { text: 'SB:' }), el('strong', { text: kuerzelVon(k ? k.erfasst_von_name : S.benutzer.name), title: k ? k.erfasst_von_name || '' : S.benutzer.name })]),
      ]),
    ]),
    haken(f.ticket, 'Ticket automatisch zum Objekt', 'Das Ticket wird zusammen mit dem Telefoneingang gespeichert.'),ticketInfo,
  ]);
  if(typeof tippAuswahl==='function'){
    let objektWahl=null;
    const units=tippAuswahl(f.wohnung,{label:'Wohnung',scope:()=>f.objekt.value,format:r=>r.nummer,suchen:async query=>{
      let oid=objektWahl?.nummer===f.objekt.value?objektWahl.id:null;
      if(f.objekt.value&&!oid){const found=await tippSuche('objekt',f.objekt.value);oid=found.find(r=>r.nummer===f.objekt.value)?.id;if(!oid)throw new Error('Objekt bitte zuerst eindeutig auswählen.');}
      return tippSuche('einheit',query,{objektId:oid});
    },auswaehlen:r=>{f.wohnung.setCustomValidity('');if(r.objekt_nummer)f.objekt.value=r.objekt_nummer;wohnungText.textContent='/ '+(r.bezeichnung||'');ticketPruefen();}});
    tippAuswahl(f.objekt,{label:'Objekt',format:r=>r.nummer,suchen:q=>tippSuche('objekt',q),bearbeitet:()=>{objektWahl=null;f.wohnung.value='';wohnungText.textContent='';units.reset();},auswaehlen:r=>{objektWahl=r;f.wohnung.value='';wohnungText.textContent='';units.reset();ticketPruefen();}});
  }
  const rechts = el('div', { class: 'tel-rechts' }, [
    info,
    el('div', { class: 'tel-optionen' }, [
      haken(f.zeiterf, 'In auto. Zeiterfassung übertragen', 'Die Gesprächsdauer wird als Zeitaufwand (Minuten) gespeichert.'),
      haken(f.mailSb, 'E-Mail an SB', 'Folgt mit Microsoft 365'),
      haken(f.ccSb, 'CC an SB', 'Folgt mit Microsoft 365'),
      haken(f.zis, 'Eintrag ins Z.I.S.'),
      haken(f.wv, 'Eintrag in die Wiedervorlage', 'Legt für den Rückruf-SB eine heute fällige Wiedervorlage an (nur wenn nicht erledigt).'),
    ]),
  ]);
  const inhalt = el('div', { class: 'tel-maske' }, [links, rechts]);

  const uhr = setInterval(() => {
    if (k) return;
    const s = Math.floor((Date.now() - start) / 1000);
    dauer.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  }, 1000);

  const m = modal({
    titel: k ? 'Telefoneingang bearbeiten' : 'Telefoneingang erfassen',
    wide: true, inhalt,
    onClose: () => clearInterval(uhr),
    footer: (close) => [
      el('span', { class: 'tel-dauer-text' }, ['Dauer des letzten Telefonates: ', dauer]),
      el('button', { type: 'button', text: 'Mehraufwand', disabled: 'disabled', title: 'Mehraufwand/Mehrauslagen folgen später' }),
      el('button', { type: 'button', class: 'btn-primary', text: 'Ok', 'data-speichern': '1', onclick: async (ev) => {
        if (!adresse) { toast('Bitte „Adresse / Firma" auswählen (Nr. oder Name).', 'error'); f.adrName.focus(); return; }
        if (!f.datum.value || !f.zeit.value) { toast('Bitte Datum und Uhrzeit angeben.', 'error'); return; }
        const sek = (Date.now() - start) / 1000;
        const daten = {
          adresse_id: adresse.id, anrufer_adresse_id: anrufer ? anrufer.id : null, anrufer_name: f.anrName.value.replace(/\s*\([^)]*\)$/, ''),
          rueckruf_tel: f.tel.value, bemerkung: f.bemerkung.value, pfkt_code: f.pfkt.value, objekt_nr: f.objekt.value, einheit_nr: f.wohnung.value,
          erledigt: f.erledigt.checked, rueckruf_sb_id: f.sb.value || null, team: f.team.value,
          zeitpunkt: `${f.datum.value}T${f.zeit.value}`, zis: f.zis.checked, wiedervorlage: f.wv.checked, ...plaud.werte(),
          minuten: k ? k.minuten : f.zeiterf.checked ? Math.max(1, Math.ceil(sek / 60)) : null,
        };
        ev.target.disabled = true;
        try {
          const gespeichert=await (k ? API.put('/telefoneingaenge/' + k.id, daten) : API.post('/telefoneingaenge', daten));
          toast((k ? 'Telefoneingang gespeichert' : 'Telefoneingang erfasst')+(gespeichert.ticket?' · '+gespeichert.ticket.nummer+' verknüpft':'')+(daten.wiedervorlage?' · Wiedervorlage angelegt':''), 'success');
          close();
          if(typeof glockeAktualisieren==='function')glockeAktualisieren();
          if (danach) danach();
          else if(S.kontext?.typ==='cockpit')cockpitMaske();
          else if (S.kontext && (S.kontext.typ === 'adresse' || S.kontext.typ === 'objekt' || S.kontext.typ === 'einheit')) neuLaden();
        } catch (e) { fehler(e); ev.target.disabled = false; }
      } }),
      el('button', { type: 'button', text: 'Abbrechen', onclick: close }),
    ],
  });
  m.box.classList.add('tel-fenster');
  (vorgabe.adresse || k ? f.bemerkung : f.adrName).focus();
}
