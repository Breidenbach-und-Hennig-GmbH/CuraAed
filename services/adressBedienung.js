'use strict';
const {ValidationError}=require('../lib/validation');

// Nur eindeutige Firmenkennzeichnungen auswerten, keine Vermutung anhand fehlender Vornamen.
function normalisieren(a) {
  if (!a || a.adresstyp==='firma' || !/^firma\.?$/i.test(String(a.anrede||'').trim())) return a;
  return {...a,adresstyp:'firma',firmenname:a.firmenname||a.nachname||''};
}

const sortierung={
  nummer:"CAST(CASE WHEN nummer LIKE 'HP-%' THEN SUBSTR(nummer,4) ELSE nummer END AS INTEGER)",
  name:"COALESCE(NULLIF(firmenname,''),NULLIF(nachname,''),vorname,'') COLLATE NOCASE",
  plz:"COALESCE(plz,'') COLLATE NOCASE",ort:"COALESCE(ort,'') COLLATE NOCASE",strasse:"COALESCE(strasse,'') COLLATE NOCASE",
};
async function navigation(db,opts={}) {
  const sort=opts.sort||'nummer',richtung=opts.richtung||'asc';
  if (!Object.hasOwn(sortierung,sort)||!['asc','desc'].includes(richtung)) throw new ValidationError('Unbekannte Adresssortierung.');
  const id=Number(opts.id);
  if (!Number.isSafeInteger(id)||id<1) throw new ValidationError('Ungültige Adressnummer.');
  const a=await db.get('SELECT archiviert FROM adressen WHERE id=?',[id]);
  if(!a)throw new ValidationError('Adresse nicht gefunden.',404);
  // Die Fensterfunktionen gelten vor der Auswahl der aktuellen Zeile: keine 500er-Begrenzung.
  return db.get(`WITH liste AS (SELECT id,
    ROW_NUMBER() OVER (ORDER BY ${sortierung[sort]} ${richtung.toUpperCase()},id ASC) AS position,
    COUNT(*) OVER () AS anzahl,
    FIRST_VALUE(id) OVER (ORDER BY ${sortierung[sort]} ${richtung.toUpperCase()},id ASC) AS erster,
    LAST_VALUE(id) OVER (ORDER BY ${sortierung[sort]} ${richtung.toUpperCase()},id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS letzter,
    LAG(id) OVER (ORDER BY ${sortierung[sort]} ${richtung.toUpperCase()},id ASC) AS vorheriger,
    LEAD(id) OVER (ORDER BY ${sortierung[sort]} ${richtung.toUpperCase()},id ASC) AS naechster
    FROM adressen WHERE archiviert=?) SELECT * FROM liste WHERE id=?`,[a.archiviert,id]);
}
async function anreden(db) {
  const rows=await db.all("SELECT DISTINCT TRIM(anrede) AS text FROM adressen WHERE TRIM(COALESCE(anrede,''))!='' ORDER BY text COLLATE NOCASE");
  return [...new Set(['Herr','Frau','Firma','Eheleute',...rows.map(r=>r.text)])];
}
async function letzte(db) {
  const a=await db.get('SELECT * FROM adressen WHERE archiviert=0 ORDER BY erstellt_am DESC,id DESC LIMIT 1');
  return a?{...normalisieren(a),anzeigename:require('./adressen').anzeigename(a)}:null;
}
async function geburtstage(db,a) {
  const result=a.geburtstag?[{datum:a.geburtstag,label:'Geburtstag'}]:[];
  const bereich=await db.get("SELECT b.rohdaten FROM hp_adress_bereiche b JOIN hp_adress_zuordnung m ON m.verbindung_id=b.verbindung_id AND m.hp_nummer=b.hp_nummer WHERE m.adresse_id=? AND b.bereich='stamm'",[a.id]);
  if(!bereich)return result;
  let rows;try{rows=JSON.parse(bereich.rohdaten);}catch{return result;}
  const r=Array.isArray(rows)?rows[0]:null;
  for(const [feld,label]of [['GebDat1','Geburtstag'],['GebDat2','Geburtstag 2']]){
    if(feld==='GebDat1'&&a.geburtstag)continue;
    const n=Number(r?.[feld]);if(!Number.isInteger(n)||n<1)continue;
    try{const datum=require('../lib/hpObjektstatus').ordinalDatum(n);if(!result.some(x=>x.datum===datum))result.push({datum,label});}catch{}
  }
  return result;
}
module.exports={normalisieren,navigation,anreden,letzte,geburtstage};
