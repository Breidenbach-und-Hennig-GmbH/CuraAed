'use strict';
const crypto=require('node:crypto'),V=require('../lib/validation'),Q=require('../lib/stimmbruch');
const fail=(s,status=400)=>{throw new V.ValidationError(s,status);};
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const DEFAULT_CONFIG={prinzip:'kopf',grundlage:'§ 25 Abs. 2 WEG',geprueft:false};
const DEFAULT_RULE={mehrheit:'einfach',basis:'abgegeben',zaehler:1,nenner:2,vergleich:'gt',zusatz_mea:'keines',verfahren:'versammlung',grundlage:'§ 25 Abs. 1 WEG',umlauf_beschluss:''};
const text=(v,max=2000)=>{if(typeof v!=='string'||v.length>max)fail('Ungültige Textangabe.');return v.trim();};
function konfig(b){
 if(!b||!['kopf','mea','einheiten'].includes(b.prinzip)||typeof b.geprueft!=='boolean')fail('Ungültiges Stimmprinzip.');
 const grundlage=text(b.grundlage);if(b.geprueft&&!grundlage)fail('Bitte die Grundlage des Stimmprinzips angeben.');
 return{prinzip:b.prinzip,geprueft:b.geprueft,grundlage};
}
function regel(b){
 if(!b||!['einfach','drei_viertel','zwei_drittel','einstimmig','allstimmig','individuell'].includes(b.mehrheit)||!['abgegeben','alle','vertreten','gesamt'].includes(b.basis)||!['gt','gte'].includes(b.vergleich)||!['keines','mehr_haelfte','mindestens_haelfte'].includes(b.zusatz_mea)||!['versammlung','umlauf'].includes(b.verfahren))fail('Ungültige Mehrheitsregel.');
 const zaehler=Number(b.zaehler),nenner=Number(b.nenner);
 if(!Number.isSafeInteger(zaehler)||!Number.isSafeInteger(nenner)||zaehler<1||nenner<1||zaehler>nenner||nenner>10000)fail('Ungültiges Mehrheitsverhältnis.');
 const r={mehrheit:b.mehrheit,basis:b.basis,zaehler,nenner,vergleich:b.vergleich,zusatz_mea:b.zusatz_mea,verfahren:b.verfahren,grundlage:text(b.grundlage),umlauf_beschluss:text(b.umlauf_beschluss)};
 if(!r.grundlage)fail('Bitte die Grundlage der Mehrheitsregel angeben.');
 if(r.verfahren==='umlauf'&&r.mehrheit!=='allstimmig'&&!r.umlauf_beschluss)fail('Für eine Mehrheitsentscheidung im Umlaufverfahren ist der Absenkungsbeschluss zu hinterlegen.');
 return r;
}
async function config(db,id){
 if(!await db.get('SELECT id FROM objekte WHERE id=?',[id]))fail('Objekt nicht gefunden.',404);
 const row=await db.get('SELECT * FROM objekt_stimmregeln WHERE objekt_id=?',[id]);
 const te=await db.get('SELECT dokument_id,stimmregeln,hinweise FROM objekt_teilungserklaerung WHERE objekt_id=?',[id]);
 return{objekt_id:Number(id),revision:row?.revision||0,daten:row?JSON.parse(row.daten):{...DEFAULT_CONFIG},...(te?{teilungserklaerung:{dokument_id:te.dokument_id,stimmregeln:JSON.parse(te.stimmregeln),hinweise:JSON.parse(te.hinweise)}}:{})};
}
async function saveConfig(db,id,b){
 const d=konfig(b.daten);if(!Number.isSafeInteger(b.revision)||b.revision<0)fail('Ungültige Version.');
 return db.transaktion(async tx=>{
 const c=await config(tx,id);if(c.revision!==b.revision)fail('Stimmprinzip inzwischen geändert. Bitte neu öffnen.',409);
 await tx.run('INSERT INTO objekt_stimmregeln(objekt_id,daten,revision) VALUES(?,?,1) ON CONFLICT(objekt_id) DO UPDATE SET daten=excluded.daten,revision=revision+1',[id,JSON.stringify(d)]);return{revision:c.revision+1,daten:d};
 });
}
async function top(db,vid,tid){
 const r=await db.get('SELECT t.*,v.objekt_id,v.datum,v.name AS versammlung_name FROM versammlung_tops t JOIN versammlungen v ON v.id=t.versammlung_id WHERE t.id=? AND v.id=?',[tid,vid]);
 if(!r)fail('TOP nicht gefunden.',404);return r;
}
async function rule(db,tid){
 const r=await db.get('SELECT * FROM top_stimmregeln WHERE top_id=?',[tid]);return{revision:r?.revision||0,daten:r?JSON.parse(r.daten):{...DEFAULT_RULE}};
}
async function saveRule(db,vid,tid,b){
 const d=regel(b.daten);if(!Number.isSafeInteger(b.revision)||b.revision<0)fail('Ungültige Version.');
 return db.transaktion(async tx=>{
 await top(tx,vid,tid);const r=await rule(tx,tid);if(r.revision!==b.revision)fail('Mehrheitsregel inzwischen geändert. Bitte neu öffnen.',409);
 await tx.run('INSERT INTO top_stimmregeln(top_id,daten,revision) VALUES(?,?,1) ON CONFLICT(top_id) DO UPDATE SET daten=excluded.daten,revision=revision+1',[tid,JSON.stringify(d)]);return{revision:r.revision+1,daten:d};
 });
}
async function register(db,v){
 const M=require('../lib/meaAnzeige'),units=await M.ergaenzen(db,await db.all('SELECT id,objekt_id,nummer,bezeichnung,mea FROM einheiten WHERE objekt_id=? AND archiviert=0 ORDER BY id',[v.objekt_id])),meaBasis=M.basis(units);
 const rows=await db.all("SELECT z.einheit_id,z.adresse_id,z.anteil,a.adresstyp,a.vorname,a.nachname,a.firmenname,a.nummer FROM rollen_zuordnungen z JOIN adressen a ON a.id=z.adresse_id JOIN einheiten e ON e.id=z.einheit_id WHERE e.objekt_id=? AND z.rolle='eigentuemer' AND COALESCE(z.inaktiv,0)=0 AND (z.objekt_id IS NULL OR z.objekt_id=e.objekt_id) AND (z.gueltig_von IS NULL OR z.gueltig_von<=?) AND (z.gueltig_bis IS NULL OR z.gueltig_bis>=?) ORDER BY z.einheit_id,z.adresse_id",[v.objekt_id,v.datum,v.datum]);
 const groups=new Map(),hinweise=[],meaHinweise=[];
 if(!units.length)hinweise.push('Keine aktiven Einheiten vorhanden. Bitte zuerst die Einheiten und ihre Eigentümer zuordnen.');
 for(const u of units){
  const owners=[...new Map(rows.filter(r=>r.einheit_id===u.id).map(r=>[r.adresse_id,r])).values()];
  if(!owners.length){hinweise.push('Einheit '+(u.nummer||u.bezeichnung)+': keine Eigentümerzuordnung zum Versammlungsdatum.');continue;}
  // Anteile sind nur ein Hinweis auf unvollständige Zuordnungen; Stimmrechte werden nicht daraus geschätzt.
  const shares=owners.filter(o=>o.anteil);
  if(shares.length){try{const sum=shares.reduce((s,o)=>Q.add(s,Q.parse(o.anteil)),Q.q(0n));if(shares.length!==owners.length||Q.cmp(sum,Q.q(1n))!==0)hinweise.push('Einheit '+(u.nummer||u.bezeichnung)+': Eigentumsanteile sind nicht vollständig oder nicht als Brüche mit Summe 1 hinterlegt.');}catch{hinweise.push('Einheit '+(u.nummer||u.bezeichnung)+': Eigentumsanteile nicht eindeutig lesbar.');}}
  const key=owners.map(o=>o.adresse_id).sort((a,b)=>a-b).join(':');
  if(!groups.has(key))groups.set(key,{key,name:owners.map(o=>require('./adressen').anzeigename(o)).join(' / '),eigentumer:owners.map(o=>({id:o.adresse_id,name:require('./adressen').anzeigename(o)})),einheiten:[],mea:'0',mea_vollstaendig:true});
  const g=groups.get(key);g.einheiten.push({id:u.id,nummer:u.nummer,bezeichnung:u.bezeichnung,mea:u.mea,...(u.mea_anzeige?{mea_anzeige:u.mea_anzeige}:{})});
  try{const m=Q.parse(u.mea);if(m.n<=0n)throw Error();g.mea=Q.str(Q.add(Q.parse(g.mea,true),m));}catch{g.mea_vollstaendig=false;meaHinweise.push('Einheit '+(u.nummer||u.bezeichnung)+': MEA fehlen oder sind nicht eindeutig.');}
 }
 const gruppen=[...groups.values()];if(meaBasis)for(const g of gruppen)g.mea_anzeige=M.darstellen(g.mea,meaBasis,true);
 const basis={datum:v.datum,objekt_id:v.objekt_id,gruppen,hinweise,meaHinweise,...(meaBasis?{mea_basis:meaBasis}:{})};
 return{...basis,basis_hash:hash(basis)};
}
function topHash(t){return hash([t.id,t.versammlung_id,t.objekt_id,t.datum,t.titel,t.art,t.erlaeuterung,t.beschlussvorschlag]);}
async function stand(db,vid,tid){
 const t=await top(db,vid,tid),c=await config(db,t.objekt_id),r=await rule(db,t.id),reg=await register(db,t);
 const saved=await db.get('SELECT a.*,b.name AS benutzer FROM etv_abstimmungen a LEFT JOIN benutzer b ON b.id=a.benutzer_id WHERE a.top_id=?',[tid]);
 const attendance=await require('./teilnehmer').lesen(db,vid);
 const auszaehlung=saved?{revision:saved.revision,snapshot:JSON.parse(saved.snapshot),ergebnis:JSON.parse(saved.ergebnis),benutzer:saved.benutzer,erstellt_am:saved.erstellt_am}:null;
 const historisch=!!auszaehlung&&(auszaehlung.snapshot.basis_hash!==reg.basis_hash||auszaehlung.snapshot.top_hash!==topHash(t)||auszaehlung.snapshot.config_revision!==c.revision||auszaehlung.snapshot.regel_revision!==r.revision);
 return{top:t,config:c,regel:r,register:reg,top_hash:topHash(t),auszaehlung,historisch,teilnahme:attendance.daten,teilnahme_revision:attendance.revision,teilnahme_geaendert:!!auszaehlung&&(auszaehlung.snapshot.teilnahme_revision||0)!==attendance.revision,revision:saved?.revision||0};
}
function zaehlen(reg,c,r,stimmen,geprueft){
 if(c.geprueft!==true||geprueft!==true)fail('Bitte Gemeinschaftsordnung/Stimmprinzip und Eigentümergruppen prüfen und bestätigen.');
 if(reg.hinweise.length)fail(reg.hinweise.join(' '));
 if((c.prinzip==='mea'||r.zusatz_mea!=='keines')&&reg.meaHinweise.length)fail(reg.meaHinweise.join(' '));
 if(!Array.isArray(stimmen)||stimmen.length!==reg.gruppen.length)fail('Bitte jede Stimmrechtsgruppe genau einmal erfassen.');
 const map=new Map();for(const s of stimmen){if(!s||typeof s.key!=='string'||map.has(s.key))fail('Doppelte oder ungültige Stimmrechtsgruppe.');map.set(s.key,s);}
 const sums={ja:Q.q(0n),nein:Q.q(0n),enthaltung:Q.q(0n),ungueltig:Q.q(0n),ohne_stimme:Q.q(0n),berechtigt:Q.q(0n),vertreten:Q.q(0n),ausgeschlossen:Q.q(0n),alle_mea:Q.q(0n),ja_mea:Q.q(0n)},details=[];
 for(const g of reg.gruppen){
  const raw=map.get(g.key);if(!raw)fail('Unbekannte oder fehlende Stimmrechtsgruppe.');
  if(!['selbst','vollmacht','abwesend'].includes(raw.teilnahme)||!['ja','nein','enthaltung','ungueltig','keine'].includes(raw.stimme)||typeof raw.ausgeschlossen!=='boolean'||typeof raw.vollmacht_textform!=='boolean'||typeof raw.stimme_textform!=='boolean')fail('Ungültige Stimmabgabe.');
  const s={key:g.key,teilnahme:raw.teilnahme,stimme:raw.stimme,ausgeschlossen:raw.ausgeschlossen,vollmacht_textform:raw.vollmacht_textform,stimme_textform:raw.stimme_textform,vertreter:text(raw.vertreter,200),nachweis:text(raw.nachweis,500),ausschlussgrund:text(raw.ausschlussgrund,1000)};
  const w=c.prinzip==='kopf'?Q.q(1n):c.prinzip==='einheiten'?Q.q(BigInt(g.einheiten.length)):Q.parse(g.mea,true),mea=Q.parse(g.mea,true);
  sums.alle_mea=Q.add(sums.alle_mea,mea);
  if(s.ausgeschlossen){
   if(!s.ausschlussgrund)fail('Bitte einen Stimmrechtsausschluss begründen: '+g.name);
   if(s.stimme!=='keine')fail('Bei Stimmrechtsausschluss darf keine Stimme erfasst sein: '+g.name);
   sums.ausgeschlossen=Q.add(sums.ausgeschlossen,w);
  }else{
   sums.berechtigt=Q.add(sums.berechtigt,w);
   if(s.teilnahme==='abwesend'){if(s.stimme!=='keine')fail('Abwesende ohne Vertretung können nicht abstimmen: '+g.name);sums.ohne_stimme=Q.add(sums.ohne_stimme,w);}
   else{
    if(s.teilnahme==='vollmacht'&&(!s.vertreter||!s.vollmacht_textform||!s.nachweis))fail('Vertreter und Nachweis einer Vollmacht in Textform fehlen: '+g.name);
    if(r.verfahren==='umlauf'&&s.stimme!=='keine'&&(!s.stimme_textform||!s.nachweis))fail('Für den Umlaufbeschluss bitte Textform und Nachweis der Stimme bestätigen: '+g.name);
    sums.vertreten=Q.add(sums.vertreten,w);
    sums[s.stimme==='keine'?'ohne_stimme':s.stimme]=Q.add(sums[s.stimme==='keine'?'ohne_stimme':s.stimme],w);
    if(s.stimme==='ja')sums.ja_mea=Q.add(sums.ja_mea,mea);
   }
  }
  details.push({...s,name:g.name,gewicht:Q.str(w),mea:g.mea,einheiten:g.einheiten});
 }
 const abgegeben=Q.add(sums.ja,sums.nein);
 let bestanden=false,berechnung='',basis=abgegeben;
 if(r.mehrheit==='einfach'){bestanden=Q.cmp(sums.ja,sums.nein)>0;berechnung='Ja > Nein; Enthaltungen und ungültige Stimmen bleiben unberücksichtigt.';}
 else if(r.mehrheit==='einstimmig'){bestanden=sums.ja.n>0n&&sums.nein.n===0n;berechnung='Mindestens eine Ja-Stimme und keine Nein-Stimme; Enthaltungen bleiben unberücksichtigt.';}
 else if(r.mehrheit==='allstimmig'){basis=sums.berechtigt;bestanden=basis.n>0n&&Q.cmp(sums.ja,basis)===0;berechnung='Alle berechtigten Stimmrechte müssen zustimmen, auch nicht vertretene.';}
 else{
  const n=r.mehrheit==='drei_viertel'?3:r.mehrheit==='zwei_drittel'?2:r.zaehler,d=r.mehrheit==='drei_viertel'?4:r.mehrheit==='zwei_drittel'?3:r.nenner,op=r.mehrheit==='drei_viertel'?'gte':r.mehrheit==='zwei_drittel'?'gt':r.vergleich;
  basis=r.basis==='gesamt'?Q.add(sums.berechtigt,sums.ausgeschlossen):r.basis==='alle'?sums.berechtigt:r.basis==='vertreten'?sums.vertreten:abgegeben;
  const cmp=Q.cmp(Q.mul(sums.ja,BigInt(d)),Q.mul(basis,BigInt(n)));bestanden=basis.n>0n&&(op==='gt'?cmp>0:cmp>=0);
  berechnung='Ja '+(op==='gt'?'>':'≥')+' '+n+'/'+d+' × '+({alle:'alle stimmberechtigten Stimmrechte',gesamt:'alle vorhandenen Stimmrechte einschließlich ausgeschlossener',vertreten:'vertretene Stimmrechte',abgegeben:'abgegebene Ja-/Nein-Stimmen'}[r.basis]||'abgegebene Ja-/Nein-Stimmen')+'.';
 }
 let mea_quorum=null;
 if(r.zusatz_mea!=='keines'){
  const cmp=Q.cmp(Q.mul(sums.ja_mea,2n),sums.alle_mea);mea_quorum=sums.alle_mea.n>0n&&(r.zusatz_mea==='mehr_haelfte'?cmp>0:cmp>=0);bestanden=bestanden&&mea_quorum;
  berechnung+=' Zusätzlich Ja-MEA '+(r.zusatz_mea==='mehr_haelfte'?'>':'≥')+' 1/2 aller MEA. Dies prüft nur die hinterlegte Rechenregel, nicht weitere gesetzliche Voraussetzungen einer Kostenfolge.';
 }
 const status=abgegeben.n===0n?'keine_gueltige_stimme':bestanden?'angenommen':'abgelehnt';
 const summen=Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,Q.str(v)])),M=require('../lib/meaAnzeige');
 const display=reg.mea_basis?{mea_bezug:BigInt(reg.mea_basis).toLocaleString('de-DE'),summen_anzeige:Object.fromEntries(Object.entries(summen).map(([k,v])=>[k,c.prinzip==='mea'||['alle_mea','ja_mea'].includes(k)?M.darstellen(v,reg.mea_basis):v])),basis_anzeige:c.prinzip==='mea'?M.darstellen(Q.str(basis),reg.mea_basis):Q.str(basis)}:{};
 return{status,prinzip:c.prinzip,mehrheit:r.mehrheit,verfahren:r.verfahren,berechnung,grundlage:r.grundlage,basis:Q.str(basis),summen,abgegeben:Q.str(abgegeben),mea_quorum,details,...display};
}
async function auszaehlen(db,vid,tid,b,owner,speichern=false){
 return db.transaktion(async tx=>{
 const s=await stand(tx,vid,tid);
 if(speichern&&await tx.get("SELECT id FROM etv_live_runden WHERE top_id=? AND status IN ('offen','geschlossen') LIMIT 1",[tid]))fail('Dieser TOP wird über die Live-Abstimmung geführt. Bitte dort arbeiten.',409);
 if(s.top.art!=='beschluss')fail('Für diesen TOP bitte zuerst die Art Beschlussfassung wählen.');
 if((b.teilnahme_revision??0)!==s.teilnahme_revision)fail('Teilnehmerliste inzwischen geändert. Bitte die Abstimmung neu öffnen.',409);
 if(b.basis_hash!==s.register.basis_hash||b.top_hash!==s.top_hash||b.config_revision!==s.config.revision||b.regel_revision!==s.regel.revision||b.revision!==s.revision)fail('Daten inzwischen geändert. Bitte die Abstimmung neu öffnen.',409);
 const r=zaehlen(s.register,s.config.daten,s.regel.daten,b.stimmen,b.geprueft);
 if(!speichern)return{ergebnis:r,revision:s.revision};
 const attendanceRows=r.details.map(d=>{const ids=d.teilnahme!=='abwesend'?s.teilnahme[d.key]?.anwesende_eigentuemer:undefined;return{...d,kanal:s.teilnahme[d.key]?.kanal||'praesenz',zugang_gesperrt:d.teilnahme==='abwesend'&&s.teilnahme[d.key]?.zugang_gesperrt===true,anwesende_eigentuemer:ids?.length?ids:undefined};});
 const attendance=await require('./teilnehmer').schreiben(tx,vid,s.register,attendanceRows,owner);
 const revision=s.revision+1,snapshot={teilnahme_revision:attendance.revision,top:s.top,basis_hash:s.register.basis_hash,top_hash:s.top_hash,config_revision:s.config.revision,regel_revision:s.regel.revision,config:s.config.daten,regel:s.regel.daten,register:s.register,stimmen:r.details,geprueft:true};
 await tx.run("INSERT INTO etv_abstimmungen(top_id,revision,snapshot,ergebnis,benutzer_id) VALUES(?,?,?,?,?) ON CONFLICT(top_id) DO UPDATE SET revision=excluded.revision,snapshot=excluded.snapshot,ergebnis=excluded.ergebnis,benutzer_id=excluded.benutzer_id,erstellt_am=datetime('now')",[tid,revision,JSON.stringify(snapshot),JSON.stringify(r),owner]);
 await tx.run('INSERT INTO etv_abstimmungsverlauf(top_id,revision,snapshot,ergebnis,benutzer_id) VALUES(?,?,?,?,?)',[tid,revision,JSON.stringify(snapshot),JSON.stringify(r),owner]);
 return{ergebnis:r,revision};
 });
}
async function verlauf(db,vid,tid){await top(db,vid,tid);return db.all('SELECT h.revision,h.ergebnis,h.snapshot,h.erstellt_am,b.name AS benutzer FROM etv_abstimmungsverlauf h LEFT JOIN benutzer b ON b.id=h.benutzer_id WHERE h.top_id=? ORDER BY h.revision DESC',[tid]);}
module.exports={topHash,config,saveConfig,rule,saveRule,stand,register,zaehlen,auszaehlen,verlauf,DEFAULT_CONFIG,DEFAULT_RULE};
