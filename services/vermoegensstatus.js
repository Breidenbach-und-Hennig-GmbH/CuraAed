'use strict';
const crypto=require('node:crypto');
const {ValidationError}=require('../lib/validation'),{deZahl}=require('../lib/zahl');
const gruppen=require('../lib/vermoegensstatusFelder.json'),felder=gruppen.flatMap(g=>g.felder);
const rund=n=>Math.round(n*100)/100;
function jahr(v){if(!/^\d{4}$/.test(String(v))||v<1990||v>2100)throw new ValidationError('Bitte ein gültiges Buchungsjahr wählen.');return Number(v);}
function wertePruefen(w){
 if(!w||typeof w!=='object'||Array.isArray(w))throw new ValidationError('Abrechnungswerte fehlen.');
 const r={};for(const [k,v]of Object.entries(w)){
  const f=felder.find(f=>f[0]===k);if(!f)throw new ValidationError('Unbekanntes Feld: '+k);
  if(v===null||v===''){r[k]=null;continue;}
  if(!['string','number'].includes(typeof v))throw new ValidationError(f[1]+': ungültiger Wert.');
  const s=String(deZahl(v)),n=Number(s);if(!/^-?\d+(?:\.\d{1,2})?$/.test(s)||!Number.isFinite(n)||Math.abs(n)>1e10)throw new ValidationError(f[1]+': Betrag mit höchstens zwei Nachkommastellen eingeben.');
  if(f[2]==='konto'&&(!Number.isInteger(n)||n<1000||n>9999))throw new ValidationError(f[1]+': Konto 1000–9999 eingeben.');
  r[k]=rund(n);
 }return r;
}
async function objekt(db,id){const o=await db.get('SELECT id,nummer,bezeichnung FROM objekte WHERE id=?',[id]);if(!o)throw new ValidationError('Objekt nicht gefunden.',404);const z=await db.all('SELECT hp_objnr FROM hp_objekt_zuordnung WHERE objekt_id=?',[id]);return {...o,hp_nummern:[...new Set(z.map(z=>String(z.hp_objnr)).concat(/^\d+$/.test(o.nummer)?[o.nummer]:[]))]};}
async function journal(db,id,j){
 const rows=await db.all('SELECT pn,journal,konto,soll_cents,haben_cents,fingerprint FROM fibu_buchungen WHERE objekt_id=? AND jahr=? ORDER BY pn,journal',[id,j]);
 const salden={};for(const r of rows)salden[r.konto]=(salden[r.konto]||0)+r.soll_cents-r.haben_cents;
 return {hash:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),anzahl:rows.length,salden};
}
function rechnen(w,salden){
 const fehlend=felder.filter(f=>f[2]!=='optional'&&w[f[0]]==null).map(f=>f[1]);
 const sum=(...keys)=>keys.some(k=>w[k]==null)?null:rund(keys.reduce((s,k)=>s+w[k],0));
 const einnahmen=sum('hausgeld','ruecklage_zufuehrung','sonstige_einnahmen','entnahme_ruecklage','sonderkosten_einnahmen');
 const ausgaben=sum('bewirtschaftung','ruecklage_zufuehrung','sonderkosten_ausgaben');
 const ergebnis=einnahmen==null||ausgaben==null?null:rund(einnahmen-ausgaben);
 const saldo=k=>w[k]==null||salden[w[k]]===undefined?null:salden[w[k]]/100;
 const giro=saldo('giro_konto'),spar=saldo('spar_konto'),rl=saldo('ruecklage_konto');
 const vergleiche=[['Girokonto',giro,w.hp_giro],['Spar-/Festgeldkonto',spar,w.hp_spar],['Erhaltungsrücklage',rl==null?null:-rl,w.hp_ruecklage]].map(([titel,curaaed,hp])=>({titel,curaaed,hp:hp??null,differenz:curaaed==null||hp==null?null:rund(curaaed-hp)}));
 const giroKeys=['giro_anfang','abgrenzung_vorjahr','abrechnung_vorjahr','verbindlichkeiten','forderungen','hp_ruecklage','hp_spar','offene_ruecklage_vorjahr','offene_ruecklage_jahr'];
 const giroSoll=ergebnis==null||giroKeys.some(k=>w[k]==null)?null:rund(w.giro_anfang+w.abgrenzung_vorjahr+w.abrechnung_vorjahr+ergebnis+w.verbindlichkeiten-w.forderungen+w.hp_ruecklage-w.hp_spar-w.offene_ruecklage_vorjahr-w.offene_ruecklage_jahr);
 return {fehlend,einnahmen,ausgaben,ergebnis,vergleiche,giro_soll:giroSoll,giro_differenz:giroSoll==null||giro==null?null:rund(giroSoll-giro),verteilungsdifferenz:ergebnis==null||w.eigentuemer_guthaben==null?null:rund(w.eigentuemer_guthaben-ergebnis),bilanz_differenz:[w.hp_giro,w.hp_spar,w.forderungen,w.hp_ruecklage,w.verbindlichkeiten,ergebnis].some(v=>v==null)?null:rund(w.hp_giro+w.hp_spar+w.forderungen-w.hp_ruecklage-w.verbindlichkeiten-ergebnis)};
}
async function holen(db,id,bj){const j=jahr(bj),o=await objekt(db,id),row=await db.get('SELECT * FROM vermoegensstatus WHERE objekt_id=? AND jahr=?',[id,j]),buch=await journal(db,id,j),werte=row?JSON.parse(row.werte):{},hp_salden=row?JSON.parse(row.hp_salden):[],konten=await db.all('SELECT nummer,bezeichnung FROM sachkonten WHERE objekt_id=? ORDER BY nummer',[id]);
 const saldenabgleich=konten.map(k=>{const hp=hp_salden.find(h=>h.konto===k.nummer),c=buch.salden[k.nummer];return {...k,hp:hp?.saldo_cents??null,curaaed:c??null,differenz:hp?(c??0)-hp.saldo_cents:null};});
 for(const hp of hp_salden)if(!konten.some(k=>k.nummer===hp.konto))saldenabgleich.push({nummer:hp.konto,bezeichnung:'Konto fehlt in CuraAed',hp:hp.saldo_cents,curaaed:null,differenz:null});
 return {objekt:o,jahr:j,gruppen,werte,version:row?.version||0,quellen:row?JSON.parse(row.quellen):[],hp_salden,saldenabgleich,hinweis:row?.hinweis||'',journal:buch,veraltet:!!row&&row.journal_hash!==buch.hash,berechnung:rechnen(werte,buch.salden)};}
async function speichern(db,id,bj,data,user){
 const j=jahr(bj);await objekt(db,id);const neu=wertePruefen(data.werte);
 if(!Number.isSafeInteger(data.version)||data.version<0)throw new ValidationError('Bitte den Vermögensstatus neu öffnen.',409);
 if(!Array.isArray(data.quellen)||data.quellen.length>10)throw new ValidationError('Quellenangaben fehlen.');
 const quellen=data.quellen.map(q=>{if(typeof q.name!=='string'||q.name.length>200||!q.name.trim()||!['kontrollblatt','salden','vorlage'].includes(q.typ)||!/^\w{64}$/.test(q.sha256))throw new ValidationError('Ungültige Quellenangabe.');return {typ:q.typ,name:q.name,sha256:q.sha256};});
 if(!quellen.some(q=>q.typ==='kontrollblatt')||!quellen.some(q=>q.typ==='salden'))throw new ValidationError('Bitte das HP-Abrechnungskontrollblatt und die HP-Saldenliste übernehmen.');
 const hinweis=typeof data.hinweis==='string'?data.hinweis.trim().slice(0,4000):'';
 if(!Array.isArray(data.hp_salden)||!data.hp_salden.length||data.hp_salden.length>2000)throw new ValidationError('HP-Kontensalden fehlen.');
 const hp_salden=data.hp_salden.map(k=>{if(!Number.isInteger(k.konto)||k.konto<1000||k.konto>9999||!Number.isSafeInteger(k.saldo_cents)||Math.abs(k.saldo_cents)>1e12)throw new ValidationError('Ungültiger HP-Kontensaldo.');return {konto:k.konto,saldo_cents:k.saldo_cents};});
 if(new Set(hp_salden.map(k=>k.konto)).size!==hp_salden.length)throw new ValidationError('Doppelte Konten in der HP-Saldenliste.');
 await db.transaktion(async tx=>{
  const alt=await tx.get('SELECT * FROM vermoegensstatus WHERE objekt_id=? AND jahr=?',[id,j]);if((alt?.version||0)!==data.version)throw new ValidationError('Der Vermögensstatus wurde zwischenzeitlich geändert. Bitte neu öffnen.',409);
  const g=await tx.get('SELECT erstes_bj,aktuelles_bj FROM fibu_objekt WHERE objekt_id=?',[id]);if(!g||j<g.erstes_bj||j>g.aktuelles_bj)throw new ValidationError('Buchungsjahr nicht eingerichtet.');
  const w={...(alt?JSON.parse(alt.werte):{}),...neu};for(const key of ['giro_konto','spar_konto','ruecklage_konto']){if(w[key]==null)continue;const k=await tx.get('SELECT art FROM sachkonten WHERE objekt_id=? AND nummer=?',[id,w[key]]);if(!k||(key!=='ruecklage_konto'&&k.art!=='B'))throw new ValidationError('Die Kontozuordnung '+key+' ist ungültig.');}
  if(new Set(['giro_konto','spar_konto','ruecklage_konto'].map(k=>w[k]).filter(v=>v!=null)).size!==['giro_konto','spar_konto','ruecklage_konto'].filter(k=>w[k]!=null).length)throw new ValidationError('Die drei Konten müssen verschieden sein.');
  const b=await journal(tx,id,j),version=(alt?.version||0)+1,values=[id,j,JSON.stringify(w),JSON.stringify(quellen),hinweis,b.hash,version,JSON.stringify(hp_salden)];
  await tx.run(`INSERT INTO vermoegensstatus(objekt_id,jahr,werte,quellen,hinweis,journal_hash,version,hp_salden) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(objekt_id,jahr) DO UPDATE SET werte=excluded.werte,quellen=excluded.quellen,hinweis=excluded.hinweis,journal_hash=excluded.journal_hash,version=excluded.version,hp_salden=excluded.hp_salden`,values);
  await tx.run('INSERT INTO vermoegensstatus_historie(objekt_id,jahr,werte,quellen,hinweis,journal_hash,version,hp_salden,benutzer_id) VALUES(?,?,?,?,?,?,?,?,?)',[...values,user||null]);
 });return holen(db,id,j);
}
module.exports={holen,speichern,rechnen,wertePruefen};
