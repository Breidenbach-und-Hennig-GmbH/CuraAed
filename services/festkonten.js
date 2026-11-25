'use strict';
const { ValidationError } = require('../lib/validation');
const gruppen = require('../lib/festkontenFelder.json');
const felder = gruppen.flatMap(g => g.felder);
const definition = new Map(felder.map(f => [f.key, f]));
function jahr(v) {
  if (!/^\d{4}$/.test(String(v)) || Number(v) < 1990 || Number(v) > 2100) throw new ValidationError('Bitte ein gültiges Buchungsjahr wählen.');
  return Number(v);
}
async function objekt(db, id) {
  const o = await db.get('SELECT id,nummer,bezeichnung FROM objekte WHERE id=?', [id]);
  if (!o) throw new ValidationError('Objekt nicht gefunden.', 404);
  const hp = await db.all('SELECT hp_objnr FROM hp_objekt_zuordnung WHERE objekt_id=?', [id]);
  const nummern = [...new Set(hp.map(x => Number(x.hp_objnr)).filter(n => Number.isSafeInteger(n) && n > 0))];
  if (!nummern.length && /^\d+$/.test(o.nummer)) nummern.push(Number(o.nummer));
  return { ...o, quellen_nummern: nummern };
}
async function holen(db, id, bj) {
  const o = await objekt(db, id), j = jahr(bj);
  const r = await db.get('SELECT * FROM fibu_festkonten WHERE objekt_id=? AND jahr=?', [id,j]);
  const konten = await db.all('SELECT nummer,art,bezeichnung FROM sachkonten WHERE objekt_id=? ORDER BY nummer', [id]);
  return { objekt:o, jahr:j, gruppen, werte:r ? JSON.parse(r.werte) : {}, version:r?.version || 0, geaendert_am:r?.geaendert_am || null, konten };
}
function wertePruefen(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError('Festkontenzuordnungen fehlen.');
  const result = {};
  for (const [key,v] of Object.entries(input)) {
    const f = definition.get(key);
    if (!f) throw new ValidationError('Unbekanntes Festkontenfeld: '+key);
    if (v === null || v === '') { result[key] = null; continue; }
    if (typeof v !== 'string' && typeof v !== 'number') throw new ValidationError(f.label+': ungültiger Wert.');
    const s = String(v).trim();
    if (f.typ === 'betrag') {
      if (!/^-?\d{1,11}(?:[.,]\d{1,2})?$/.test(s)) throw new ValidationError(f.label+': Betrag mit höchstens zwei Nachkommastellen eingeben.');
      result[key] = Math.round(Number(s.replace(',','.'))*100)/100;
    } else {
      if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s))) throw new ValidationError(f.label+': bitte eine Nummer eingeben.');
      const n=Number(s);
      if ((f.typ==='konto' && n!==0 && (n<1000 || n>9999)) || (f.typ==='aa' && n>999) || (f.typ==='objekt' && n>2147483647)) throw new ValidationError(f.label+': Nummer außerhalb des gültigen Bereichs.');
      result[key] = n;
    }
  }
  return result;
}
async function speichern(db,id,bj,data,benutzerId) {
  const j=jahr(bj), o=await objekt(db,id), neu=wertePruefen(data.werte);
  if (!Number.isSafeInteger(data.version) || data.version<0) throw new ValidationError('Bitte die Festkonten neu öffnen.',409);
  await db.transaktion(async tx => {
    const alt=await tx.get('SELECT * FROM fibu_festkonten WHERE objekt_id=? AND jahr=?',[id,j]);
    if ((alt?.version||0)!==data.version) throw new ValidationError('Die Festkonten wurden zwischenzeitlich geändert. Bitte neu öffnen.',409);
    const g=await tx.get('SELECT erstes_bj,aktuelles_bj FROM fibu_objekt WHERE objekt_id=?',[id]);
    if (!g || j<g.erstes_bj || j>g.aktuelles_bj) throw new ValidationError('Dieses Buchungsjahr ist für das Objekt nicht eingerichtet.');
    const werte={...(alt?JSON.parse(alt.werte):{}),...neu};
    for (const f of felder) {
      const n=werte[f.key];
      if (n==null || n===0) continue;
      // Fremde Objektzuordnungen brauchen zuerst eine eindeutige Kopplung; nie aus Präfixen ableiten.
      if (f.typ==='objekt' && !o.quellen_nummern.includes(n)) throw new ValidationError(f.label+': objektübergreifende Zuordnung noch nicht unterstützt. Bitte nicht durch das aktuelle Objekt ersetzen.');
      if (f.typ==='konto') {
        const k=await tx.get('SELECT art FROM sachkonten WHERE objekt_id=? AND nummer=?',[id,n]);
        if (!k) throw new ValidationError(f.label+': Konto '+n+' fehlt im Kontenrahmen.');
        if (f.bank && k.art!=='B') throw new ValidationError(f.label+': Konto '+n+' ist kein Bankkonto.');
      }
    }
    const version=(alt?.version||0)+1, json=JSON.stringify(werte);
    await tx.run(`INSERT INTO fibu_festkonten(objekt_id,jahr,werte,version) VALUES(?,?,?,?)
      ON CONFLICT(objekt_id,jahr) DO UPDATE SET werte=excluded.werte,version=excluded.version,geaendert_am=datetime('now')`,[id,j,json,version]);
    await tx.run('INSERT INTO fibu_festkonten_historie(objekt_id,jahr,werte,version,benutzer_id) VALUES(?,?,?,?,?)',[id,j,json,version,benutzerId||null]);
  });
  return holen(db,id,j);
}
async function verwendet(db,id,nummer) {
  const rows=await db.all('SELECT werte FROM fibu_festkonten WHERE objekt_id=?',[id]);
  return rows.some(r=>{const w=JSON.parse(r.werte);return felder.some(f=>f.typ==='konto' && w[f.key]===nummer);});
}
module.exports={holen,speichern,verwendet,wertePruefen};
