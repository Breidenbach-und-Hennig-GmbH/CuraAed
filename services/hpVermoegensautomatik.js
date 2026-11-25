'use strict';
const crypto=require('node:crypto');
const {ValidationError}=require('../lib/validation');
const svc=require('./vermoegensstatus'),excel=require('./vermoegensstatusExcel');
const gruppen=require('../lib/vermoegensstatusFelder.json'),felder=gruppen.flatMap(g=>g.felder);
const bankfelder=['hp_giro','hp_spar','hp_ruecklage','giro_anfang'];
const fail=m=>{throw new ValidationError(m);};
function kanonisch(v){if(Array.isArray(v))return v.map(kanonisch);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,kanonisch(v[k])]));return v;}
function datum(v){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)fail('Eindeutiger UTC-Zeitpunkt des HP-Stands fehlt.');return v;}
function zahl(v,min,max){if(!Number.isSafeInteger(v)||v<min||v>max)fail('Ungültige Nummer im HP-Export.');return v;}
function vorbereiten(p){
 if(!p||p.format!=='curaaed-hp-vermoegensstand-v1'||Buffer.byteLength(JSON.stringify(p))>262144)fail('Kein vollständiger HP-Vermögensstand im unterstützten Exportformat (max. 256 KB).');
 if(typeof p.verbindung_id!=='string'||!p.verbindung_id||p.verbindung_id.length>64||typeof p.datenbank!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(p.datenbank))fail('Eindeutige HP-Quellenkennung fehlt.');
 zahl(p.objektnummer,1,2147483647);zahl(p.jahr,1990,2100);zahl(p.laufnummer,1,2147483647);datum(p.stand_am);
 if(p.zeitraum?.von!==p.jahr+'-01-01'||p.zeitraum?.bis!==p.jahr+'-12-31')fail('Der HP-Stand muss das vollständige Kalenderjahr betreffen.');
 if(!p.abschluss||typeof p.abschluss.bestaetigt!=='boolean')fail('Die fachliche Abschlussbestätigung muss ausdrücklich angegeben sein.');
 if(!Array.isArray(p.quellen)||p.quellen.length>10||!p.quellen.length)fail('HP-Quellnachweise fehlen.');
 const quellen=p.quellen.map(q=>{
  if(!q||!['abrechnung','konten','abgrenzungen','vermoegen','abschluss'].includes(q.typ)||typeof q.name!=='string'||!q.name.trim()||q.name.length>200||!/^\w{64}$/.test(q.sha256)||!/^[a-f0-9]{64}$/.test(q.sha256))fail('Ungültiger HP-Quellnachweis.');
  return {typ:q.typ,name:q.name,sha256:q.sha256};
 }).sort((a,b)=>(a.typ+'|'+a.name+'|'+a.sha256).localeCompare(b.typ+'|'+b.name+'|'+b.sha256,'en'));
 const nachweis=(n,typ)=>!!n&&typeof n.position==='string'&&!!n.position.trim()&&n.position.length<=300&&quellen.some(q=>q.sha256===n.sha256&&(!typ||q.typ===typ));
 if(!Array.isArray(p.konten)||p.konten.length>2000||!p.konten.length)fail('HP-Kontenbestand fehlt.');
 const konten=p.konten.map(k=>{if(!k||typeof k!=='object')fail('Ungültiges HP-Konto.');zahl(k.konto,1000,9999);zahl(k.saldo_cents,-1e12,1e12);if(k.eb_cents!=null)zahl(k.eb_cents,-1e12,1e12);if(!['S','B','A'].includes(k.art)||typeof k.bezeichnung!=='string'||k.bezeichnung.length>160)fail('Ungültiges HP-Konto.');return {konto:k.konto,art:k.art,bezeichnung:k.bezeichnung,saldo_cents:k.saldo_cents,eb_cents:k.eb_cents??null};}).sort((a,b)=>a.konto-b.konto);
 if(new Set(konten.map(k=>k.konto)).size!==konten.length)fail('Doppelte Konten im HP-Stand.');
 const w=svc.wertePruefen(p.werte),meldungen=[],kontorollen={};
 for(const [key,target,sign]of [['giro_konto','hp_giro',1],['spar_konto','hp_spar',1],['ruecklage_konto','hp_ruecklage',-1]]){
  const ids=p.kontorollen?.[key];if(!Array.isArray(ids)||ids.length>30)fail('Explizite HP-Kontorollen fehlen: '+key);
  kontorollen[key]=ids.map(n=>zahl(n,1000,9999)).sort((a,b)=>a-b);
  const ks=kontorollen[key].map(n=>konten.find(k=>k.konto===n));if(ks.some(k=>!k))fail('Ein zugeordnetes Konto fehlt im HP-Kontenbestand.');
  if(key!=='ruecklage_konto'&&ks.some(k=>k.art!=='B'))fail('Ein zugeordnetes Bankkonto ist im HP-Export kein Bankkonto.');
  if(w[key]!=null&&w[key]!==kontorollen[key][0])fail('Kontorolle widerspricht der exportierten Kontozuordnung.');w[key]=kontorollen[key][0]??null;
  const cents=ks.reduce((s,k)=>s+k.saldo_cents,0);if(!Number.isSafeInteger(cents))fail('Kontensumme außerhalb des zulässigen Bereichs.');
  if(w[target]!=null&&w[target]!==sign*cents/100)fail('Betrag widerspricht dem HP-Kontensaldo: '+target);w[target]=sign*cents/100;
  if(key==='giro_konto'){if(ks.some(k=>k.eb_cents==null))meldungen.push('Giro-Anfangsbestand ist nicht vollständig belegt.');else{const eb=ks.reduce((s,k)=>s+k.eb_cents,0)/100;if(w.giro_anfang!=null&&w.giro_anfang!==eb)fail('Giro-Anfangsbestand widerspricht dem HP-Konto.');w.giro_anfang=eb;}}
 }
 const rollen=Object.values(kontorollen).flat();if(new Set(rollen).size!==rollen.length)fail('Giro, Spar-/Festgeld und Rücklage müssen getrennte Konten sein.');
 for(const k of konten)if(k.art==='B'&&k.saldo_cents!==0&&!rollen.includes(k.konto))meldungen.push('Bankkonto ohne Zuordnung: '+k.konto);
 if(!kontorollen.giro_konto.length)meldungen.push('Mindestens ein Girokonto muss zugeordnet sein.');
 for(const [key,label,typ]of felder){
  if(typ!=='optional'&&typ!=='konto'&&w[key]==null)meldungen.push('Nicht belegt: '+label);
  if((w[key]!=null||typ==='konto')&&!bankfelder.includes(key)&&!nachweis(p.nachweise?.[key]))meldungen.push('Quellnachweis fehlt: '+label);
 }
 if(!quellen.some(q=>q.typ==='abrechnung'))meldungen.push('Abrechnungsquelle fehlt.');
 if(!quellen.some(q=>q.typ==='konten'))meldungen.push('Kontenquelle fehlt.');
 if(p.abschluss.bestaetigt){if(!nachweis(p.abschluss,'abschluss'))meldungen.push('Nachweis der fachlichen Freigabe fehlt.');if(p.abschluss.am){datum(p.abschluss.am);if(p.abschluss.am>p.stand_am)fail('Der Abschluss liegt nach dem exportierten HP-Stand.');}else meldungen.push('Zeitpunkt der fachlichen Freigabe fehlt.');}
 // Abrechnung_abschlies, StapelErz oder ein Druckdatum allein sind keine Freigabe.
 let status=!p.abschluss.bestaetigt?'nicht_abgeschlossen':meldungen.length?'unvollstaendig':'erstellt';
 const berechnung=svc.rechnen(w,Object.fromEntries(konten.map(k=>[k.konto,k.saldo_cents])));
 berechnung.fehlend=berechnung.fehlend.filter(label=>!felder.some(f=>f[1]===label&&f[2]==='konto'));
 berechnung.giro_differenz=berechnung.giro_soll==null?null:Math.round((berechnung.giro_soll-w.hp_giro)*100)/100||0;
 if(status==='erstellt'&&(berechnung.giro_differenz!==0||berechnung.bilanz_differenz!==0)){status='abweichung';meldungen.push('HP-Stand ist nicht ausgeglichen. Giro- oder Vermögensabstimmung prüfen.');}
 if(status==='nicht_abgeschlossen')meldungen.unshift('HP-Abrechnung ist noch nicht fachlich freigegeben.');
 const source={format:p.format,verbindung_id:p.verbindung_id,datenbank:p.datenbank,objektnummer:p.objektnummer,jahr:p.jahr,laufnummer:p.laufnummer,stand_am:p.stand_am,zeitraum:{von:p.zeitraum.von,bis:p.zeitraum.bis},abschluss:{bestaetigt:p.abschluss.bestaetigt,am:p.abschluss.am||null,sha256:p.abschluss.sha256||null,position:p.abschluss.position||null},nachweise:Object.fromEntries(felder.filter(f=>nachweis(p.nachweise?.[f[0]])).map(f=>[f[0],{sha256:p.nachweise[f[0]].sha256,position:p.nachweise[f[0]].position}])),werte:w,kontorollen,konten,quellen};const hash=crypto.createHash('sha256').update(JSON.stringify(kanonisch(source))).digest('hex');
 return {source,hash,w,kontorollen,konten,quellen,berechnung,status,meldungen:[...new Set(meldungen)]};
}
async function uebernehmen(db,p,user){
 const v=vorbereiten(p);
 return db.transaktion(async tx=>{
  const mappings=await tx.all('SELECT z.objekt_id,o.nummer,o.bezeichnung FROM hp_objekt_zuordnung z JOIN objekte o ON o.id=z.objekt_id JOIN hp_adress_verbindungen c ON c.id=z.verbindung_id WHERE z.verbindung_id=? AND z.hp_objnr=? AND c.datenbank=?',[p.verbindung_id,p.objektnummer,p.datenbank]);
  if(mappings.length!==1)fail('Keine eindeutige Objektzuordnung für genau diese HP-Quelle. Es wird kein Objekt angelegt oder anhand eines Namens geraten.');
  const o=mappings[0],alt=await tx.get('SELECT id,status,version,meldungen FROM hp_vermoegensstaende WHERE objekt_id=? AND jahr=? AND hash=?',[o.objekt_id,p.jahr,v.hash]);
  if(alt)return {...alt,meldungen:JSON.parse(alt.meldungen),unveraendert:true};
  const latest=await tx.get('SELECT stand_am,hash FROM hp_vermoegensstaende WHERE objekt_id=? AND jahr=? ORDER BY stand_am DESC,version DESC LIMIT 1',[o.objekt_id,p.jahr]);
  if(latest&&latest.stand_am>p.stand_am){v.status='veraltet';v.meldungen.push('Ein neuerer HP-Stand liegt bereits vor.');}
  else if(latest&&latest.stand_am===p.stand_am){v.status='konflikt';v.meldungen.push('Für denselben HP-Zeitpunkt liegen unterschiedliche Daten vor.');}
  const version=(await tx.get('SELECT COALESCE(MAX(version),0)+1 n FROM hp_vermoegensstaende WHERE objekt_id=? AND jahr=?',[o.objekt_id,p.jahr])).n;
  const id=crypto.randomUUID();let bericht=null,xlsx=null;
  if(v.status==='erstellt'){
   const journal=await tx.all('SELECT konto,SUM(soll_cents-haben_cents) saldo FROM fibu_buchungen WHERE objekt_id=? AND jahr=? GROUP BY konto',[o.objekt_id,p.jahr]);
   const salden=new Map(journal.map(k=>[k.konto,k.saldo]));
   const vergleiche=[['Girokonto','giro_konto','hp_giro',1],['Spar-/Festgeldkonto','spar_konto','hp_spar',1],['Erhaltungsrücklage','ruecklage_konto','hp_ruecklage',-1]].map(([titel,key,target,sign])=>{const ids=v.kontorollen[key],curaaed=ids.some(n=>!salden.has(n))?null:sign*ids.reduce((s,n)=>s+salden.get(n),0)/100;return {titel,curaaed,hp:v.w[target],differenz:curaaed==null?null:Math.round((curaaed-v.w[target])*100)/100||0};});
   const berechnung={...v.berechnung,vergleiche};
   bericht={objekt:{id:o.objekt_id,nummer:String(p.objektnummer),hp_nummern:[String(p.objektnummer)],bezeichnung:o.bezeichnung},jahr:p.jahr,version,nur_hp:true,kontorollen:v.kontorollen,werte:v.w,berechnung,quellen:v.quellen,hinweis:`Automatisch aus HP-Exportstand ${p.stand_am}, Abrechnungslauf ${p.laufnummer}. Fachliche Freigabe: ${p.abschluss.am}. Kontenvergleich mit CuraAed nur bei vorhandenen Buchungen, Stand der Übernahme. Keine Buchungen oder Vorschüsse ausgelöst.`,saldenabgleich:v.konten.map(k=>({nummer:k.konto,bezeichnung:k.bezeichnung,hp:k.saldo_cents,curaaed:salden.has(k.konto)?salden.get(k.konto):null,differenz:salden.has(k.konto)?salden.get(k.konto)-k.saldo_cents:null}))};
   xlsx=excel.erstellen(bericht);
  }
  await tx.run('INSERT INTO hp_vermoegensstaende(id,objekt_id,jahr,verbindung_id,laufnummer,stand_am,hash,version,status,meldungen,quelle,bericht,xlsx,benutzer_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,o.objekt_id,p.jahr,p.verbindung_id,p.laufnummer,p.stand_am,v.hash,version,v.status,JSON.stringify(v.meldungen),JSON.stringify(v.source),bericht?JSON.stringify(bericht):null,xlsx,user||null]);
  return {id,status:v.status,version,meldungen:v.meldungen,unveraendert:false};
 });
}
async function stapel(db,staende,user){
 if(!Array.isArray(staende)||!staende.length||staende.length>20)fail('Bitte 1 bis 20 HP-Stände je Übernahmelauf übergeben.');
 const ergebnisse=[];for(const p of staende){try{ergebnisse.push({objektnummer:p?.objektnummer,jahr:p?.jahr,...await uebernehmen(db,p,user)});}catch(e){if(!(e instanceof ValidationError))throw e;ergebnisse.push({objektnummer:p?.objektnummer,jahr:p?.jahr,status:'abgewiesen',meldungen:[e.message]});}}
 return {ergebnisse};
}
async function liste(db,jahr){
 zahl(Number(jahr),1990,2100);jahr=Number(jahr);
 const objekte=await db.all('SELECT o.id,o.nummer,o.bezeichnung,MIN(z.hp_objnr) hp_nummer,COUNT(z.hp_objnr) hp_quellen FROM objekte o LEFT JOIN hp_objekt_zuordnung z ON z.objekt_id=o.id GROUP BY o.id ORDER BY COALESCE(MIN(z.hp_objnr),CAST(o.nummer AS INTEGER)),o.id');
 const rows=await db.all('SELECT id,objekt_id,version,status,meldungen,stand_am,laufnummer FROM hp_vermoegensstaende WHERE jahr=? ORDER BY version DESC',[jahr]);
 return {jahr,live_abholung:false,hinweis:'Datenabholung aus HausPerfekt noch nicht angeschlossen. Die automatische Verarbeitung vollständiger, fachlich freigegebener Abrechnungsstände und die Excel-Ausgabe sind vorbereitet.',objekte:objekte.map(o=>{const r=rows.find(r=>r.objekt_id===o.id),fertig=rows.find(r=>r.objekt_id===o.id&&r.status==='erstellt');return {...o,nummer:String(o.hp_nummer??o.nummer),status:r?.status||(o.hp_quellen?'wartet':'ohne_hp'),stand_am:r?.stand_am||null,version:r?.version||null,meldungen:r?JSON.parse(r.meldungen):[o.hp_quellen?'Noch kein vollständiger HP-Exportstand eingegangen.':'Keine HP-Objektzuordnung.'],excel_id:r?.status==='erstellt'?r.id:null,vorherige_excel_id:r?.status!=='erstellt'?fertig?.id||null:null};})};
}
async function datei(db,id){const r=await db.get('SELECT xlsx,bericht FROM hp_vermoegensstaende WHERE id=? AND status=\'erstellt\'',[id]);if(!r?.xlsx)throw new ValidationError('Kein fertiger Excel-Bericht für diesen Stand.',404);const b=JSON.parse(r.bericht);return {bytes:r.xlsx,name:`Vermoegensstatus-${b.objekt.nummer}-${b.jahr}-V${b.version}.xlsx`};}
async function paket(db,jahr){const l=await liste(db,jahr),ids=l.objekte.map(o=>o.excel_id).filter(Boolean);if(!ids.length)fail('Für dieses Jahr liegen noch keine fertigen automatischen Excel-Berichte vor.');const files={};let size=0;for(const id of ids){const f=await datei(db,id);size+=f.bytes.length;if(size>64*1024*1024)fail('Das Paket ist größer als 64 MB. Bitte die Excel-Dateien einzeln herunterladen.');files[f.name]=f.bytes;}return require('../lib/xlsxVorlage').packen(files);}
module.exports={vorbereiten,uebernehmen,stapel,liste,datei,paket};
