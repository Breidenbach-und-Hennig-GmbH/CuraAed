'use strict';

const crypto = require('node:crypto');
const V = require('../lib/validation');
const adressen = require('./adressen');
const dubletten = require('./adressDubletten');
const hp = require('./hpAdressNeuanlage');
const historie = require('./historie');
const FELDER = {
  adresstyp: 'Person/Firma', anrede: 'Anrede', vorname: 'Vorname', nachname: 'Nachname',
  firmenname: 'Firmenname', zusatz: 'Zusatz', strasse: 'Straße', plz: 'PLZ', ort: 'Ort',
  land: 'Land', email: 'E-Mail', telefon: 'Telefon', mobil: 'Mobil', ansprechpartner: 'Ansprechpartner',
};
const alias = { name: 'nachname', name1: 'nachname', firma: 'firmenname', unternehmen: 'firmenname',
  postleitzahl: 'plz', emailadresse: 'email', telefonnummer: 'telefon', mobilnummer: 'mobil',
  handynummer: 'mobil', strassehausnummer: 'strasse', typ: 'adresstyp' };
const norm = s => String(s).toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f\W_]/g, '');
const fail = (s, status = 400) => { throw new V.ValidationError(s, status); };

function csv(buf) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { text = new TextDecoder('windows-1252').decode(buf); }
  text = text.replace(/^\uFEFF/, '');
  // Count separators outside quotes in the header, not commas inside a quoted company name.
  const counts = { ';': 0, ',': 0, '\t': 0 }; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && /[\r\n]/.test(c)) break;
    else if (!quoted && Object.hasOwn(counts, c)) counts[c]++;
  }
  const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const rows = []; let row = [], field = '', state = 'start';
  const cell = () => { row.push(field); field = ''; state = 'start'; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (state === 'quoted') {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else state = 'closed'; }
      else field += c;
    } else if (c === delimiter) cell();
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cell(); rows.push(row); row = [];
      if (rows.length > 501) fail('Höchstens 500 Adressen je Datei übernehmen.');
    } else if (c === '"' && state === 'start') state = 'quoted';
    else {
      if (c === '"' || state === 'closed') fail('Ungültige Anführungszeichen in der CSV-Datei.');
      field += c; state = 'plain';
    }
    if (field.length > 10000 || row.length > 50) fail('CSV-Feld oder Spaltenzahl ist zu groß.');
  }
  if (state === 'quoted') fail('Nicht geschlossene Anführungszeichen in der CSV-Datei.');
  if (field || row.length || state === 'closed') { cell(); rows.push(row); }
  return rows;
}

function datei(b) {
  if (typeof b.datei !== 'string' || b.datei.length > 1400000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.datei)) fail('Bitte eine CSV- oder XLSX-Datei bis 1 MB auswählen.');
  const buf = Buffer.from(b.datei, 'base64');
  if (!buf.length || buf.length > 1024 * 1024) fail('Bitte eine CSV- oder XLSX-Datei bis 1 MB auswählen.');
  let rows;
  try { rows = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50 ? require('../lib/tabelle').lesen(buf) : csv(buf); }
  catch { fail('Die Tabelle konnte nicht gelesen werden. Bitte CSV oder XLSX mit Kopfzeile verwenden.'); }
  // Empty trailing rows do not count; interior row numbers remain the file's row numbers.
  while (rows.length && !rows.at(-1).some(x => String(x).trim())) rows.pop();
  if (rows.length < 2 || rows.length > 501 || rows.some(r => r.length > 50)) fail('Erwartet: eine Kopfzeile und höchstens 500 Adressen mit maximal 50 Spalten.');
  const kopf = rows[0].map((x, i) => V.str(x, 160) || 'Spalte ' + (i + 1));
  if (rows.slice(1).some(r => r.length > kopf.length)) fail('Eine Datenzeile hat mehr Spalten als die Kopfzeile. Bitte Trennzeichen und Kopfzeile prüfen.');
  const zuordnung = {};
  kopf.forEach((x, i) => {
    const key = Object.keys(FELDER).find(f => norm(f) === norm(x) || norm(FELDER[f]) === norm(x)) || alias[norm(x)];
    if (key && !Object.hasOwn(zuordnung, key)) zuordnung[key] = i;
  });
  return { kopf, rows: rows.slice(1), zuordnung };
}

function mapping(value, columns) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Bitte Spalten zuordnen.');
  const out = {}, used = new Set();
  for (const [key, i] of Object.entries(value)) {
    if (!Object.hasOwn(FELDER, key) || !Number.isInteger(i) || i < 0 || i >= columns || used.has(i)) fail('Ungültige oder doppelte Spaltenzuordnung.');
    used.add(i); out[key] = i;
  }
  if (!Object.hasOwn(out, 'nachname') && !Object.hasOwn(out, 'firmenname')) fail('Mindestens Nachname oder Firmenname zuordnen.');
  return out;
}

function adresse(row, map) {
  const a = {};
  for (const [key, i] of Object.entries(map)) {
    a[key] = V.str(row[i], key === 'email' ? 254 : 200) || '';
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(a[key])) fail('Unzulässige Steuerzeichen im Feld ' + FELDER[key] + '.');
  }
  const typ = norm(a.adresstyp || '');
  if (typ && !['person', 'firma', 'unternehmen', 'p', 'f'].includes(typ)) fail('Person/Firma muss „Person“ oder „Firma“ enthalten.');
  a.adresstyp = typ ? (['firma', 'unternehmen', 'f'].includes(typ) ? 'firma' : 'person') : (a.firmenname ? 'firma' : 'person');
  if (!(a.adresstyp === 'firma' ? a.firmenname : a.nachname)) fail(a.adresstyp === 'firma' ? 'Firmenname fehlt.' : 'Nachname fehlt.');
  if (a.email && !/^[^\s@<>\"]+@[^\s@<>\"]+\.[^\s@<>\"]+$/.test(a.email)) fail('E-Mail-Adresse ist ungültig.');
  return a;
}

// Read the stock once in bounded pages, retaining only matches for the selected file.
// This avoids hundreds of unindexed fuzzy-name scans on large HP address stocks.
async function bestandsDubletten(db, items) {
  const names = new Map(), emails = new Map(), results = new Map();
  function index(map, key, item) { if (!key) return; if (!map.has(key)) map.set(key, new Set()); map.get(key).add(item); }
  for (const item of items) {
    const a = item.adresse; results.set(item, new Map());
    index(names, dubletten.norm(a.adresstyp === 'firma' ? a.firmenname : [a.vorname, a.nachname].filter(Boolean).join(' ')), item);
    index(emails, (a.email || '').toLowerCase(), item);
  }
  if (!items.length) return results;
  const fields = 'a.id,a.nummer,a.adresstyp,a.vorname,a.nachname,a.firmenname,a.strasse,a.plz,a.ort,a.archiviert';
  function add(items, row) {
    for (const item of items || []) {
      const hits = results.get(item);
      // Keep the first twenty stock records in ID order, even if a later e-mail page finds an earlier ID.
      hits.set(row.id, { id: row.id, nummer: row.nummer, name: adressen.anzeigename(row) });
      if (hits.size > 20) hits.delete(Math.max(...hits.keys()));
    }
  }
  let cursor = 0;
  while (true) {
    const rows = await db.all('SELECT ' + fields + ',a.email FROM adressen a WHERE a.id>? ORDER BY a.id LIMIT 1000', [cursor]);
    if (!rows.length) break;
    for (const row of rows) {
      add(names.get(dubletten.norm(row.firmenname)), row);
      add(names.get(dubletten.norm([row.vorname, row.nachname].filter(Boolean).join(' '))), row);
      add(emails.get((row.email || '').toLowerCase()), row);
    }
    cursor = rows.at(-1).id;
  }
  cursor = 0;
  if (emails.size) while (true) {
    const rows = await db.all('SELECT ' + fields + ',e.id AS email_id,e.adresse AS email FROM adress_emails e JOIN adressen a ON a.id=e.adresse_id WHERE e.id>? ORDER BY e.id LIMIT 1000', [cursor]);
    if (!rows.length) break;
    for (const row of rows) add(emails.get((row.email || '').toLowerCase()), row);
    cursor = rows.at(-1).email_id;
  }
  return results;
}

async function plan(db, owner, b) {
  const file = datei(b), map = mapping(b.zuordnung, file.kopf.length), zeilen = [], seen = new Map();
  for (const [i, row] of file.rows.entries()) {
    if (!row.some(x => String(x).trim())) continue;
    const item = { zeile: i + 2, status: 'neu', meldung: '', adresse: null };
    try { item.adresse = adresse(row, map); }
    catch (e) { if (!(e instanceof V.ValidationError)) throw e; item.status = 'fehler'; item.meldung = e.message; }
    zeilen.push(item);
  }
  const duplicates = await bestandsDubletten(db, zeilen.filter(x => x.status === 'neu'));
  for (const item of zeilen.filter(x => x.status === 'neu')) {
    try {
      const a = item.adresse;
      const name = dubletten.norm(a.adresstyp === 'firma' ? a.firmenname : [a.vorname, a.nachname].filter(Boolean).join(' '));
      const keys = ['name:' + name, ...(a.email ? ['email:' + a.email.toLowerCase()] : [])];
      const vorher = keys.map(k => seen.get(k)).find(Boolean);
      keys.forEach(k => { if (!seen.has(k)) seen.set(k, item.zeile); });
      const existing = { treffer: [...duplicates.get(item).values()].sort((a, b) => a.id - b.id) };
      if (existing.treffer.length) { item.status = 'dublette'; item.meldung = 'Vorhanden: ' + existing.treffer.map(x => x.nummer + ' · ' + x.name).join('; '); }
      else if (vorher) { item.status = 'dublette'; item.meldung = 'Bereits in Dateizeile ' + vorher + '.'; }
      else await hp.vorbereiten(db, owner.id, a, existing);
    } catch (e) {
      if (!(e instanceof V.ValidationError)) throw e;
      item.status = 'fehler'; item.meldung = e.message;
    }
  }
  const pruefsumme = crypto.createHash('sha256').update(JSON.stringify([owner.id, b.datei, map, zeilen])).digest('hex');
  return { zeilen, pruefsumme, neu: zeilen.filter(x => x.status === 'neu').length,
    dubletten: zeilen.filter(x => x.status === 'dublette').length, fehler: zeilen.filter(x => x.status === 'fehler').length };
}

async function uebernehmen(db, owner, b) {
  return db.transaktion(async tx => {
    const p = await plan(tx, owner, b);
    if (b.pruefsumme !== p.pruefsumme) fail('Datei, Zuordnung oder Adressbestand wurden geändert. Bitte Vorschau erneut prüfen.', 409);
    if (!p.neu) fail('Keine neuen, gültigen Adressen vorhanden.', 409);
    const angelegt = [];
    for (const item of p.zeilen.filter(x => x.status === 'neu')) {
      // plan() has just rechecked stock and within-file duplicates inside this exclusive transaction.
      const prepared = await hp.vorbereiten(tx, owner.id, item.adresse, { treffer: [] });
      const a = await adressen.anlegen(tx, item.adresse);
      await hp.einreihen(tx, a.id, prepared);
      await historie.protokollieren(tx, { bereich: 'adresse', alt: null, neu: a, wer: historie.akteur(owner) });
      angelegt.push({ zeile: item.zeile, id: a.id, nummer: a.nummer, name: a.anzeigename });
    }
    return { angelegt, uebersprungen: p.dubletten + p.fehler };
  });
}

module.exports = { FELDER, datei, plan, uebernehmen };
