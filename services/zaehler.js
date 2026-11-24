'use strict';
const {ValidationError}=require('../lib/validation');
const fail=(s,n=400)=>{throw new ValidationError(s,n);};
const MEDIEN=['strom','gas','kaltwasser','warmwasser','waerme','heizkostenverteiler'];
const EINHEITEN={strom:['kWh','MWh'],gas:['m3','kWh'],kaltwasser:['m3'],warmwasser:['m3'],waerme:['kWh','MWh','GJ'],heizkostenverteiler:['HKV']};
function id(v){if(!/^\d+$/.test(String(v))||!Number.isSafeInteger(Number(v))||Number(v)<1)fail('Ungültige Datensatznummer.');return Number(v);}
function text(v,max=200){if(v==null)return '';if(typeof v!=='string'||v.length>max)fail('Ungültige Texteingabe.');return v.trim();}
function tag(v){const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail('Bitte ein gültiges Datum eingeben.');return s;}
function zeit(v){const s=text(v,45);if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(s)||!Number.isFinite(Date.parse(s)))fail('Messzeitpunkt mit Zeitzone erforderlich.');tag(s.slice(0,10));return new Date(s).toISOString();}
function messTag(t){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));}
function wert(v){if(typeof v!=='string'&&typeof v!=='number')fail('Ungültiger Zählerstand.');const s=String(v).trim().replace(',','.');if(!/^\d{1,14}(?:\.\d{1,6})?$/.test(s))fail('Zählerstand als positive Zahl mit höchstens sechs Nachkommastellen eingeben.');const [a,b='']=s.split('.');return a.replace(/^0+(?=\d)/,'')+(b.replace(/0+$/,'')?'.'+b.replace(/0+$/,''):'');}
function pfad(v){const s=text(v,200);if(s&&!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/.test(s)||s.split('.').some(k=>['__proto__','prototype','constructor'].includes(k)))fail('Ungültiger Lobaro-Feldpfad.');return s||null;}
async function objekt(db,oid){const r=await db.get('SELECT id,nummer,bezeichnung,strasse,ort FROM objekte WHERE id=? AND archiviert=0',[id(oid)]);if(!r)fail('Aktives Objekt nicht gefunden.',404);return r;}
async function punkt(db,oid,pid){const p=await db.get('SELECT * FROM zaehlpunkte WHERE id=? AND objekt_id=?',[id(pid),id(oid)]);if(!p)fail('Zählpunkt nicht in diesem Objekt gefunden.',404);return p;}
async function geraet(db,oid,zid){const z=await db.get('SELECT z.*,p.objekt_id,p.medium,p.marktlokation,p.bezeichnung FROM zaehler z JOIN zaehlpunkte p ON p.id=z.zaehlpunkt_id WHERE z.id=? AND p.objekt_id=?',[id(zid),id(oid)]);if(!z)fail('Zähler nicht in diesem Objekt gefunden.',404);return z;}
async function punktSpeichern(db,oid,pid,b,user){return db.transaktion(async tx=>{
 await objekt(tx,oid);const old=pid?await punkt(tx,oid,pid):null;
 if(old&&b.revision!==old.revision)fail('Der Zählpunkt wurde inzwischen geändert. Bitte neu öffnen.',409);
 const name=text(b.bezeichnung),medium=text(b.medium),art=text(b.art),malo=text(b.marktlokation,11)||null;
 if(!name||!MEDIEN.includes(medium)||!['haupt','wohnung','unter'].includes(art))fail('Bezeichnung, Medium und Zählpunktart prüfen.');
 if(malo&&(!/^\d{11}$/.test(malo)||!['strom','gas'].includes(medium)))fail('Die Marktlokationsnummer muss aus elf Ziffern bestehen und gehört zu Strom oder Gas.');
 if(malo&&await tx.get('SELECT id FROM zaehlpunkte WHERE marktlokation=? AND id<>?',[malo,old?.id||0]))fail('Diese Marktlokationsnummer ist bereits einem Zählpunkt zugeordnet.',409);
 const eid=b.einheit_id?id(b.einheit_id):null;
 if(eid&&!await tx.get('SELECT id FROM einheiten WHERE id=? AND objekt_id=? AND archiviert=0',[eid,id(oid)]))fail('Die Wohnung gehört nicht zu diesem aktiven Objekt.');
 if(old&&(old.medium!==medium||old.art!==art||old.einheit_id!==eid)&&await tx.get('SELECT id FROM zaehler WHERE zaehlpunkt_id=?',[old.id]))fail('Medium, Art und Wohnungszuordnung mit vorhandenen Geräten nicht ändern. Einen neuen Zählpunkt anlegen.');
 if(old){await tx.run('UPDATE zaehlpunkte SET bezeichnung=?,marktlokation=?,medium=?,art=?,einheit_id=?,revision=revision+1 WHERE id=?',[name,malo,medium,art,eid,old.id]);return punkt(tx,oid,old.id);}
 const r=await tx.run('INSERT INTO zaehlpunkte(objekt_id,einheit_id,bezeichnung,medium,art,marktlokation,erstellt_von) VALUES(?,?,?,?,?,?,?)',[id(oid),eid,name,medium,art,malo,user.id]);return punkt(tx,oid,r.lastID);
});}
async function geraetSpeichern(db,oid,pid,zid,b){return db.transaktion(async tx=>{
 const p=await punkt(tx,oid,pid),old=zid?await geraet(tx,oid,zid):null;
 if(old&&(old.zaehlpunkt_id!==p.id||b.revision!==old.revision))fail('Der Zähler wurde inzwischen geändert. Bitte neu öffnen.',409);
 const nr=text(b.nummer),unit=text(b.einheit),von=tag(b.eingebaut_am),bis=b.ausgebaut_am?tag(b.ausgebaut_am):null;
 if(!nr||!EINHEITEN[p.medium].includes(unit))fail('Zählernummer und zum Medium passende Einheit prüfen.');
 if(bis&&bis<von)fail('Ausbau liegt vor dem Einbau.');
 const device=text(b.lobaro_geraet,20)||null,wp=pfad(b.wert_pfad),tp=pfad(b.zeit_pfad||'time'),kp=pfad(b.kennung_pfad),kw=text(b.kennung_wert,100)||null,ep=pfad(b.einheit_pfad);
 if(device&&!/^[1-9]\d{0,15}$/.test(device)||!!device!==!!wp||!!kp!==!!kw)fail('Lobaro-Geräte-ID, Wertpfad und optionale Zählerkennung vollständig eingeben.');
 if(device&&await tx.get("SELECT z.id FROM zaehler z WHERE z.id<>? AND z.lobaro_geraet=? AND z.wert_pfad=? AND COALESCE(z.kennung_pfad,'')=? AND COALESCE(z.kennung_wert,'')=? AND z.eingebaut_am<=COALESCE(?,'9999-12-31') AND COALESCE(z.ausgebaut_am,'9999-12-31')>=?",[old?.id||0,device,wp,kp||'',kw||'',bis,von]))fail('Dieser Lobaro-Messkanal ist bereits einem anderen Zähler zugeordnet. Zählerkennung oder Feldpfad prüfen.',409);
 const overlap=await tx.get("SELECT id FROM zaehler WHERE zaehlpunkt_id=? AND id<>? AND eingebaut_am<COALESCE(?,'9999-12-31') AND COALESCE(ausgebaut_am,'9999-12-31')>?",[p.id,old?.id||0,bis,von]);
 if(overlap)fail('Der Einbauzeitraum überschneidet sich mit einem vorhandenen Zähler. Alten Zähler zuerst ausbauen.',409);
 if(old&&await tx.get('SELECT id FROM zaehler_messwerte WHERE zaehler_id=?',[old.id])){
  if(old.nummer!==nr||old.einheit!==unit)fail('Zählernummer und Einheit mit vorhandenen Messwerten nicht ändern.');
  const readings=await tx.all('SELECT zeitpunkt FROM zaehler_messwerte WHERE zaehler_id=?',[old.id]);if(readings.some(r=>messTag(r.zeitpunkt)<von||bis&&messTag(r.zeitpunkt)>bis))fail('Vorhandene Messwerte liegen außerhalb des neuen Einbauzeitraums.');
 }
 const values=[nr,unit,von,bis,device,wp,tp,kp,kw,ep];let zidNeu=old?.id;
 if(old)await tx.run('UPDATE zaehler SET nummer=?,einheit=?,eingebaut_am=?,ausgebaut_am=?,lobaro_geraet=?,wert_pfad=?,zeit_pfad=?,kennung_pfad=?,kennung_wert=?,einheit_pfad=?,revision=revision+1 WHERE id=?',[...values,old.id]);
 else zidNeu=(await tx.run('INSERT INTO zaehler(nummer,einheit,eingebaut_am,ausgebaut_am,lobaro_geraet,wert_pfad,zeit_pfad,kennung_pfad,kennung_wert,einheit_pfad,zaehlpunkt_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[...values,p.id])).lastID;
 return geraet(tx,oid,zidNeu);
});}
function messung(z,b){const t=zeit(b.zeitpunkt),w=wert(b.wert);if(b.einheit!==z.einheit)fail('Die Messeinheit passt nicht zum Zähler.');if(messTag(t)<z.eingebaut_am||z.ausgebaut_am&&messTag(t)>z.ausgebaut_am)fail('Messwert liegt außerhalb des Einbauzeitraums.');if(Date.parse(t)>Date.now()+300000)fail('Der Messwert liegt in der Zukunft.');return{zeitpunkt:t,wert:w,einheit:z.einheit};}
async function pruefeMessung(tx,z,m,quelle,quellId){const a=await tx.get('SELECT * FROM zaehler_messwerte WHERE zaehler_id=? AND (zeitpunkt=? OR (quelle=? AND quell_id=?))',[z.id,m.zeitpunkt,quelle,quellId||null]);if(a&&(a.zeitpunkt!==m.zeitpunkt||a.wert!==m.wert||a.einheit!==m.einheit))fail('Vorhandener Messwert weicht ab; Original bleibt erhalten.',409);return a;}
async function messwert(db,oid,zid,b,user){return db.transaktion(async tx=>{const z=await geraet(tx,oid,zid),m=messung(z,b);if(await pruefeMessung(tx,z,m,'manuell',null))return{...m,bekannt:true};await tx.run("INSERT INTO zaehler_messwerte(zaehler_id,zeitpunkt,wert,einheit,quelle,erstellt_von) VALUES(?,?,?,?,'manuell',?)",[z.id,m.zeitpunkt,m.wert,m.einheit,user.id]);return m;});}
async function liste(db,oid){const o=await objekt(db,oid),punkte=await db.all('SELECT p.*,e.nummer AS wohnung FROM zaehlpunkte p LEFT JOIN einheiten e ON e.id=p.einheit_id WHERE p.objekt_id=? ORDER BY p.id',[o.id]);for(const p of punkte){p.zaehler=await db.all('SELECT z.*,(SELECT wert FROM zaehler_messwerte m WHERE m.zaehler_id=z.id ORDER BY zeitpunkt DESC LIMIT 1) AS letzter_wert,(SELECT zeitpunkt FROM zaehler_messwerte m WHERE m.zaehler_id=z.id ORDER BY zeitpunkt DESC LIMIT 1) AS letzter_zeitpunkt FROM zaehler z WHERE zaehlpunkt_id=? ORDER BY eingebaut_am DESC,id DESC',[p.id]);}for(const p of punkte)for(const z of p.zaehler){const h=await db.get('SELECT original FROM hp_zaehler_quellen WHERE zaehler_id=?',[z.id]);if(h){z.hp_geraeteart=JSON.parse(h.original).Z_Geraeteart_Schlues;const readings=await require('./hpZaehlerImport').messwerte(db,z.id);if(readings.length&&(!z.letzter_zeitpunkt||readings[0].ablesedatum>z.letzter_zeitpunkt.slice(0,10))){z.letzter_wert=readings[0].wert;z.letzter_zeitpunkt=readings[0].zeitpunkt;}}}return{objekt:o,punkte};}
async function messwerte(db,oid,zid){await geraet(db,oid,zid);const local=await db.all('SELECT * FROM zaehler_messwerte WHERE zaehler_id=? ORDER BY zeitpunkt DESC LIMIT 500',[id(zid)]),hp=await require('./hpZaehlerImport').messwerte(db,id(zid));return [...local,...hp].sort((a,b)=>b.zeitpunkt.localeCompare(a.zeitpunkt));}
module.exports={MEDIEN,EINHEITEN,id,text,tag,zeit,messTag,wert,pfad,objekt,punkt,geraet,punktSpeichern,geraetSpeichern,messung,pruefeMessung,messwert,liste,messwerte};


