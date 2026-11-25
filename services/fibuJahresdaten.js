'use strict';
const {ValidationError}=require('../lib/validation');
const felder=require('../lib/fibuJahresfelder.json');
function fail(text,status=400){throw new ValidationError(text,status);}
function jahr(v){if(!/^\d{4}$/.test(String(v))||v<1990||v>2100)fail('Bitte ein gültiges Buchungsjahr wählen.');return Number(v);}
async function holen(db,id,bj){
  const o=await db.get('SELECT id,nummer,bezeichnung FROM objekte WHERE id=?',[id]);if(!o)fail('Objekt nicht gefunden.',404);
  const j=jahr(bj),r=await db.get('SELECT * FROM fibu_jahresdaten WHERE objekt_id=? AND jahr=?',[id,j]);
  return {objekt:o,jahr:j,felder,werte:r?JSON.parse(r.werte):{},banken:r?JSON.parse(r.banken):[],version:r?.version||0,
    konten:await db.all('SELECT nummer,art,bezeichnung FROM sachkonten WHERE objekt_id=? ORDER BY nummer',[id])};
}
function pruefen(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Jahresgrundwerte fehlen.');
  const w={},defs=new Map(felder.map(f=>[f.key,f]));
  for(const [key,v]of Object.entries(input)){
    const f=defs.get(key);if(!f)fail('Unbekanntes Jahresfeld: '+key);
    if(v===null||v===''){w[key]=null;continue;}
    if(f.typ==='bool'){
      if(![true,false,0,1,'0','1'].includes(v))fail(f.label+': bitte Ja oder Nein wählen.');
      w[key]=v===true||v===1||v==='1';continue;
    }
    if(typeof v!=='string'&&typeof v!=='number')fail(f.label+': ungültiger Wert.');
    const s=String(v).trim();
    if(f.typ==='datum'){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail(f.label+': ungültiges Datum.');
      w[key]=s;
    }else if(f.typ==='nummer'){
      if(!/^\d+$/.test(s)||!Number.isSafeInteger(Number(s))||Number(s)>2147483647)fail(f.label+': ungültige Nummer.');w[key]=Number(s);
    }else if(f.typ==='quote'){
      if(!/^\d{1,3}(?:[.,]\d{1,4})?$/.test(s)||Number(s.replace(',','.'))>100)fail(f.label+': Wert von 0 bis 100 eingeben.');w[key]=Number(s.replace(',','.'));
    }else if(f.typ==='waehrung'){
      if(!/^[A-Z]{3}$/.test(s))fail('Währung als dreistelligen Code eingeben.');w[key]=s;
    }else{if(s.length>80)fail(f.label+': höchstens 80 Zeichen.');w[key]=s;}
  }return w;
}
function bankenPruefen(rows){
  if(!Array.isArray(rows)||rows.length>100)fail('Höchstens 100 Bankzuordnungen möglich.');
  const seen=new Set();return rows.map(r=>{
    if(!r||typeof r!=='object'||Object.keys(r).some(k=>!['lfdnr','konto','aktiv'].includes(k)))fail('Ungültige Bankzuordnung.');
    if(!/^\d+$/.test(String(r.lfdnr))||Number(r.lfdnr)<1||Number(r.lfdnr)>32767||seen.has(Number(r.lfdnr)))fail('HP-Bankverbindungsnummer muss eindeutig und größer als 0 sein.');seen.add(Number(r.lfdnr));
    let konto=null;if(r.konto!==null&&r.konto!==''){
      if(!/^\d+$/.test(String(r.konto))||(Number(r.konto)!==0&&(r.konto<1000||r.konto>9999)))fail('Bankkonto muss 0 oder eine Kontonummer von 1000 bis 9999 sein.');konto=Number(r.konto);
    }
    if(![null,true,false,0,1,'0','1'].includes(r.aktiv))fail('Aktivstatus der Bankverbindung ist ungültig.');
    return {lfdnr:Number(r.lfdnr),konto,aktiv:r.aktiv===null?null:r.aktiv===true||r.aktiv===1||r.aktiv==='1'};
  }).sort((a,b)=>a.lfdnr-b.lfdnr);
}
async function speichern(db,id,bj,data,benutzerId){
  const j=jahr(bj);await holen(db,id,j);const neu=pruefen(data.werte);
  if(!Number.isSafeInteger(data.version)||data.version<0)fail('Bitte Jahresgrundwerte neu öffnen.',409);
  const bankNeu=data.banken===undefined?undefined:bankenPruefen(data.banken);
  await db.transaktion(async tx=>{
    const alt=await tx.get('SELECT * FROM fibu_jahresdaten WHERE objekt_id=? AND jahr=?',[id,j]);
    if((alt?.version||0)!==data.version)fail('Die Jahresgrundwerte wurden zwischenzeitlich geändert. Bitte neu öffnen.',409);
    const g=await tx.get('SELECT erstes_bj,aktuelles_bj FROM fibu_objekt WHERE objekt_id=?',[id]);
    if(!g||j<g.erstes_bj||j>g.aktuelles_bj)fail('Dieses Buchungsjahr ist nicht eingerichtet.');
    const w={...(alt?JSON.parse(alt.werte):{}),...neu},banken=bankNeu??(alt?JSON.parse(alt.banken):[]);
    if(w.zeitraum_von&&w.zeitraum_bis&&w.zeitraum_von>w.zeitraum_bis)fail('Beginn darf nicht nach dem Ende des Buchungsjahres liegen.');
    for(const key of ['zeitraum_von','zeitraum_bis'])if(w[key]&&Number(w[key].slice(0,4))!==j)fail('Zeitraum gehört nicht zum gewählten Buchungsjahr.');
    if(w.gebucht_bis&&((w.zeitraum_von&&w.gebucht_bis<w.zeitraum_von)||(w.zeitraum_bis&&w.gebucht_bis>w.zeitraum_bis)||Number(w.gebucht_bis.slice(0,4))!==j))fail('Gebucht-bis liegt außerhalb des Buchungsjahres.');
    for(const b of banken)if(b.konto){const k=await tx.get('SELECT art FROM sachkonten WHERE objekt_id=? AND nummer=?',[id,b.konto]);if(!k||k.art!=='B')fail('Konto '+b.konto+' fehlt als Bankkonto im Objekt.');}
    const values=[id,j,JSON.stringify(w),JSON.stringify(banken),(alt?.version||0)+1];
    await tx.run(`INSERT INTO fibu_jahresdaten(objekt_id,jahr,werte,banken,version) VALUES(?,?,?,?,?) ON CONFLICT(objekt_id,jahr) DO UPDATE SET werte=excluded.werte,banken=excluded.banken,version=excluded.version,geaendert_am=datetime('now')`,values);
    await tx.run('INSERT INTO fibu_jahresdaten_historie(objekt_id,jahr,werte,banken,version,benutzer_id) VALUES(?,?,?,?,?,?)',[...values,benutzerId||null]);
  });return holen(db,id,j);
}
async function verwendet(db,id,nr){return (await db.all('SELECT banken FROM fibu_jahresdaten WHERE objekt_id=?',[id])).some(r=>JSON.parse(r.banken).some(b=>b.konto===nr));}
module.exports={holen,speichern,verwendet,pruefen,bankenPruefen};
