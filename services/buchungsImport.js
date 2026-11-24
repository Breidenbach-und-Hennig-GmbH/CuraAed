'use strict';

const crypto = require('crypto');
const { ValidationError } = require('../lib/validation');
const tabelle = require('../lib/tabelle');
const schluessel = crypto.randomBytes(32); // Neustart entwertet offene Vorschauen.
const FELDER = 'ObjNr BJ PN KtoNr JournalNr RefKtoNr KtoName KtoArtKto ObjNrGgKto GgKtoNr RefGgKtoNr GgKtoName KtoArtGgKto BuchDat BelegNr BuchText Soll Haben Waehrung UStKto RefUStKto UStKtoName UStKtoArt UStArt UStSatz UStStS UStSoll'.split(' ');
const ARTEN = { Sachkonto: 'S', Bankkonto: 'B', Anlagekont: 'A', Anlagekonto: 'A' };
const hash = (x) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const nummer = (x) => /^\d+$/.test(String(x)) && Number.isSafeInteger(Number(x)) && Number(x) > 0;
function cents(s) {
  if (s === '') return 0;
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(s)) throw new Error(`Ungültiger Betrag „${s}“.`);
  const n = Number(s.replace(/\./g, '').replace(',', ''));
  if (!Number.isSafeInteger(n) || Math.abs(n) > 1000000000000) throw new Error('Betrag außerhalb des zulässigen Bereichs.');
  return n;
}
function datum(s) {
  if (!/^\d{8}$/.test(s)) throw new Error('Buchungsdatum muss TTMMJJJJ enthalten.');
  const d = `${s.slice(4)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
  if (!Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) throw new Error('Ungültiges Buchungsdatum.');
  return d;
}

function auswerten(buf) {
  if (!Buffer.isBuffer(buf) || buf.length > 10 * 1024 * 1024) throw new ValidationError('Datei fehlt oder ist größer als 10 MB.');
  // Anders als ein generischer Tabellenimport: vollständiger HP-Journalkopf in fester Reihenfolge.
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { text = new TextDecoder('windows-1252').decode(buf); }
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    if (quoted && text[i + 1] === '"') i++; else quoted = !quoted;
  }
  if (quoted) throw new ValidationError('Nicht geschlossenes Anführungszeichen in der CSV-Datei.');
  const rows = tabelle.lesen(Buffer.from(text, 'utf8'));
  const kopf = (rows.shift() || []).map((v) => v.trim());
  if (FELDER.some((f, i) => kopf[i] !== f) || kopf.slice(FELDER.length).some(Boolean)) throw new ValidationError('Bitte den HausPerfekt-Buchungsexport mit ObjNr, BJ, PN und JournalNr wählen.');
  if (rows.length > 20000) throw new ValidationError('Maximal 20.000 Buchungszeilen je Datei.');
  const fehler = [], zeilen = [], gesehen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const original = rows[i];
    if (!original.some((v) => v.trim())) continue;
    const f = Object.fromEntries(FELDER.map((k, j) => [k, String(original[j] ?? '').trim()]));
    try {
      if (original.length < FELDER.length) throw new Error('Unvollständige Zeile.');
      for (const k of ['ObjNr', 'PN', 'JournalNr', 'KtoNr', 'GgKtoNr', 'ObjNrGgKto']) if (!nummer(f[k])) throw new Error(`Ungültige ${k}.`);
      if (!/^\d{4}$/.test(f.BJ) || Number(f.BJ) < 1990 || Number(f.BJ) > 2100) throw new Error('Ungültiges Buchungsjahr.');
      if (f.ObjNr !== f.ObjNrGgKto) throw new Error('Objektübergreifende Buchung muss gesondert geprüft werden.');
      if (f.Waehrung !== 'EUR') throw new Error('Der Import unterstützt derzeit EUR.');
      if (!ARTEN[f.KtoArtKto] || Number(f.KtoNr) < 1000 || Number(f.KtoNr) > 9999) throw new Error('Buchungskonto ist kein Sach-, Bank- oder Anlagekonto 1000–9999.');
      if (!ARTEN[f.KtoArtGgKto] && !['Debitor', 'Kreditor'].includes(f.KtoArtGgKto)) throw new Error('Unbekannte Gegenkontoart.');
      if ((f.Soll === '') === (f.Haben === '')) throw new Error('Genau eine Seite (Soll oder Haben) muss gefüllt sein.');
      const soll = cents(f.Soll), haben = cents(f.Haben), d = datum(f.BuchDat);
      if (d.slice(0, 4) !== f.BJ) throw new Error('Datum liegt außerhalb des Buchungsjahrs.');
      if (['UStKto', 'RefUStKto', 'UStSatz', 'UStStS', 'UStSoll'].some((k) => f[k] && !/^0(?:,0+)?$/.test(f[k])) || f.UStArt) throw new Error('Buchung mit Umsatzsteuerangaben benötigt eine gesonderte Prüfung.');
      const zusatz = original.slice(FELDER.length).map((x) => x.trim());
      if (zusatz.some((x) => x && x !== 'STORNO') || zusatz.filter(Boolean).length > 1) throw new Error('Unbekannte Zusatzangabe hinter den benannten Spalten.');
      const key = `${Number(f.BJ)}/${Number(f.PN)}/${Number(f.JournalNr)}`;
      if (gesehen.has(key)) throw new Error('PN und Journalnummer kommen innerhalb desselben Buchungsjahrs mehrfach vor.');
      gesehen.add(key);
      const storno = zusatz.includes('STORNO');
      const fingerprint = hash([FELDER.map((k) => f[k]), storno]);
      zeilen.push({ zeile: i + 2, key, jahr: Number(f.BJ), pn: String(Number(f.PN)), journal: String(Number(f.JournalNr)), konto: String(Number(f.KtoNr)), gegenkonto: String(Number(f.GgKtoNr)),
        kontoart: ARTEN[f.KtoArtKto], kontoname: f.KtoName, datum: d, beleg: f.BelegNr, text: f.BuchText,
        soll_cents: soll, haben_cents: haben, storno, fingerprint, original: { felder: f, zusatz, zellen: original } });
    } catch (e) { fehler.push(`Zeile ${i + 2}: ${e.message}`); }
  }
  if (!zeilen.length && !fehler.length) fehler.push('Die Datei enthält keine Buchungen.');
  const objekte = [...new Set(zeilen.map((r) => r.original.felder.ObjNr))];
  if (objekte.length !== 1) fehler.push('Eine Datei muss genau ein Objekt enthalten.');
  const gruppen = new Map();
  let sollGesamt = 0, habenGesamt = 0;
  for (const r of zeilen) {
    sollGesamt += r.soll_cents; habenGesamt += r.haben_cents;
    if (!Number.isSafeInteger(sollGesamt) || !Number.isSafeInteger(habenGesamt) || !Number.isSafeInteger(sollGesamt - habenGesamt)) throw new ValidationError('Gesamtsumme überschreitet den exakt darstellbaren Betragsbereich.');
  }
  for (const r of zeilen) { const k = `${r.jahr}/${r.pn}`; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(r); }
  for (const [k, rs] of gruppen) if (rs.reduce((s, r) => s + r.soll_cents - r.haben_cents, 0) !== 0) fehler.push(`Buchungsgruppe ${k}: Soll und Haben sind nicht ausgeglichen.`);
  return { zeilen, gruppen, fehler, objektnummer: objekte[0] };
}

async function vorbereiten(db, objektId, buf, optionen = {}) {
  const o = await db.get('SELECT id,nummer,bezeichnung FROM objekte WHERE id=?', [objektId]);
  if (!o) throw new ValidationError('Objekt nicht gefunden.', 404);
  const daten = auswerten(buf), fehler = [...daten.fehler];
  const mappings = await db.all('SELECT hp_objnr FROM hp_objekt_zuordnung WHERE objekt_id=?', [o.id]);
  // Bestehende Kopplung ist maßgebend, keine Ableitung aus technischen Präfixen.
  const nummern = mappings.length ? [...new Set(mappings.map((x) => String(x.hp_objnr)))] : [o.nummer];
  if (nummern.length !== 1 || nummern[0] !== daten.objektnummer) fehler.push(`Datei-Objekt ${daten.objektnummer || '?'} passt nicht eindeutig zum gewählten Objekt.`);
  const konten = await db.all('SELECT id,nummer,art,bezeichnung FROM sachkonten WHERE objekt_id=? ORDER BY nummer', [o.id]);
  const bekannte = new Map(konten.map((k) => [String(k.nummer), k])), fehlende = new Map();
  for (const r of daten.zeilen) {
    const alt = bekannte.get(r.konto) || fehlende.get(r.konto);
    if (alt && alt.art !== r.kontoart) fehler.push(`Konto ${r.konto}: abweichende Kontoart.`);
    if (!alt) {
      if (!r.kontoname) fehler.push(`Konto ${r.konto}: Bezeichnung fehlt.`);
      fehlende.set(r.konto, { nummer: Number(r.konto), art: r.kontoart, bezeichnung: r.kontoname });
    }
  }
  const alt = await db.all('SELECT jahr,pn,journal,fingerprint FROM fibu_buchungen WHERE objekt_id=? ORDER BY jahr,pn,journal', [o.id]);
  const bestehend = new Map(alt.map((r) => [`${r.jahr}/${r.pn}/${r.journal}`, r]));
  let neu = 0, doppelt = 0;
  for (const rs of daten.gruppen.values()) {
    let treffer = 0;
    for (const r of rs) {
      const a = bestehend.get(r.key);
      r.status = !a ? 'neu' : a.fingerprint === r.fingerprint ? 'vorhanden' : 'Konflikt';
      if (a) treffer++;
      if (r.status === 'Konflikt') fehler.push(`Zeile ${r.zeile}: bestehende Buchung ${r.key} weicht ab; wird nicht überschrieben.`);
      if (!a) neu++; else if (r.status === 'vorhanden') doppelt++;
    }
    if (treffer && treffer !== rs.length) fehler.push(`Buchungsgruppe ${rs[0].jahr}/${rs[0].pn} ist bereits teilweise vorhanden; bitte prüfen.`);
  }
  const anlegen = optionen.konten_anlegen === true;
  const pruefhash = crypto.createHmac('sha256', schluessel).update(JSON.stringify([hash(buf.toString('base64')), o, mappings, konten, alt, anlegen, optionen.benutzer_id || null])).digest('hex');
  return { daten, antwort: { objekt: o, objektnummer: daten.objektnummer, gesamt: daten.zeilen.length, gruppen: daten.gruppen.size,
    neu, doppelt, storno: daten.zeilen.filter((r) => r.storno).length,
    soll_cents: daten.zeilen.reduce((s, r) => s + r.soll_cents, 0), haben_cents: daten.zeilen.reduce((s, r) => s + r.haben_cents, 0),
    fehlende_konten: [...fehlende.values()], fehler: [...new Set(fehler)],
    importierbar: !fehler.length && (!fehlende.size || anlegen), pruefhash,
    zeilen: daten.zeilen.map(({ original, fingerprint, key, ...r }) => r), ausgefuehrt: false } };
}

async function importieren(db, objektId, buf, optionen = {}) {
  if (!optionen.ausfuehren) return (await vorbereiten(db, objektId, buf, optionen)).antwort;
  return db.transaktion(async (tx) => {
    const { daten, antwort: r } = await vorbereiten(tx, objektId, buf, optionen);
    if (!optionen.pruefhash || optionen.pruefhash !== r.pruefhash) throw new ValidationError('Datei, Auswahl oder Datenbestand hat sich geändert. Bitte Vorschau erneut prüfen.', 409);
    if (!r.importierbar) throw new ValidationError('Import gesperrt: Fehler klären oder fehlende Konten ausdrücklich zur Anlage freigeben.', 409);
    if (!r.neu) return { ...r, ausgefuehrt: true, importiert: 0 };
    const batch = await tx.run('INSERT INTO fibu_buchungsimporte(objekt_id,dateiname,datei_hash,benutzer_id) VALUES(?,?,?,?)',
      [objektId, String(optionen.dateiname || 'Buchungen.csv').slice(0, 255), hash(buf.toString('base64')), optionen.benutzer_id || null]);
    for (const k of r.fehlende_konten) await tx.run('INSERT INTO sachkonten(objekt_id,nummer,art,bezeichnung) VALUES(?,?,?,?)', [objektId, k.nummer, k.art, k.bezeichnung]);
    for (const b of daten.zeilen.filter((x) => x.status === 'neu')) {
      await tx.run(`INSERT INTO fibu_buchungen(objekt_id,import_id,jahr,pn,journal,konto,gegenkonto,datum,beleg,buchtext,soll_cents,haben_cents,storno,fingerprint,original,quellzeile)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [objektId, batch.lastID, b.jahr, b.pn, b.journal, b.konto, b.gegenkonto, b.datum, b.beleg, b.text, b.soll_cents, b.haben_cents, Number(b.storno), b.fingerprint, JSON.stringify(b.original), b.zeile]);
    }
    return { ...r, ausgefuehrt: true, importiert: r.neu };
  });
}

async function journal(db, objektId, jahr) {
  if (!/^\d{4}$/.test(String(jahr))) throw new ValidationError('Bitte ein Buchungsjahr wählen.');
  return db.all(`SELECT b.*, i.dateiname, i.erstellt_am FROM fibu_buchungen b JOIN fibu_buchungsimporte i ON i.id=b.import_id
    WHERE b.objekt_id=? AND b.jahr=? ORDER BY b.datum,CAST(b.pn AS INTEGER),CAST(b.journal AS INTEGER)`, [objektId, Number(jahr)]);
}
module.exports = { auswerten, importieren, journal };
