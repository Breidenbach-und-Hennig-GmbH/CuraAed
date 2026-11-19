'use strict';
const crypto=require('node:crypto');
const {ValidationError}=require('../lib/validation');
const F=require('../lib/hpImportFormat');
const {ordinalDatum,bewerteObjektstatus}=require('../lib/hpObjektstatus');
const fail=(m,s=409)=>{throw new ValidationError(m,s);};
const hash=t=>crypto.createHash('sha256').update(t).digest('hex');
const integer=(v,min=0,feld='')=>{if(typeof v!=='string'||!(/^-?(0|[1-9]\d*)$/).test(v)||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>2147483647)fail('Ungültige HP-Ganzzahl'+(feld?': '+feld:'')+'.',400);return Number(v);};
const optionalInt=(v,feld)=>v===null||v===''?null:integer(v,0,feld);
const decimal=(v,feld)=>{if(v===null||v==='')return null;if(typeof v!=='string'||v.length>64||!(/^-?\d+(\.\d+)?$/).test(v)||!Number.isFinite(Number(v)))fail('Ungültiger HP-Dezimalwert'+(feld?': '+feld:'')+'.',400);return v;};
const boolean=(v,feld)=>{if(v===null||v==='')return null;if(v==='J')return 1;if(v==='N')return 0;if(!['0','1'].includes(v))fail('Ungültiger HP-Ja/Nein-Wert'+(feld?': '+feld:'')+'.',400);return Number(v);};
const currency=v=>{if(v===null||v==='')return null;if(typeof v==='string'&&/^[A-Z]{3}$/.test(v))return v;return optionalInt(v,'FIBJ_Wahrung');};
const date=(v,feld)=>{if(v===null||v===''||v==='0')return null;try{return ordinalDatum(integer(v,1));}catch{fail('Ungültiger HP-Datumswert'+(feld?': '+feld:'')+'.',400);}};
const tables=new Set(['objekte','objekt_gebaeude','objekt_buchungsjahre','einheiten','rollen_zuordnungen','personenkonten','verteilerschluessel_jahre','einheit_verteilung_jahre','personenkonto_verteilung_jahre','personenkonto_verteilung_zeitwerte']);
function whereClause(keys){if(!keys||!Object.keys(keys).length||Object.keys(keys).some(k=>!(/^[a-z_]+$/).test(k)))fail('Ungültige lokale Zuordnung.');return Object.keys(keys).map(k=>k+'=?').join(' AND ');}
async function row(tx,table,keys){if(!tables.has(table))fail('Unbekannte Importzuordnung.');return tx.get('SELECT * FROM '+table+' WHERE '+whereClause(keys),Object.values(keys));}
async function ensure(tx,table,keys,values){let current=await row(tx,table,keys);if(!current){const data={...keys,...values};const result=await tx.run('INSERT INTO '+table+' ('+Object.keys(data).join(',')+') VALUES ('+Object.keys(data).map(()=>'?').join(',')+')',Object.values(data));if(!Object.keys(keys).length)keys.id=result.lastID;current=await row(tx,table,keys);}return current;}
async function mapping(tx,table,connection,objnr,field,value){const r=await tx.get('SELECT * FROM '+table+' WHERE verbindung_id=? AND hp_objnr=?'+(field?' AND '+field+'=?':''),field?[connection,objnr,value]:[connection,objnr]);if(!r)fail('HP-Abhängigkeit noch nicht importiert: '+table);return r;}

async function project(tx,id,r){
 const w=r.werte,n=r.objnr;
 let o=await tx.get('SELECT * FROM hp_objekt_zuordnung WHERE verbindung_id=? AND hp_objnr=?',[id,n]);
 if(r.art==='objekt'){
  if(w.ObjTyp==='BKS')fail('Bürokostenstellen gehören nicht zum Objektimport.');
  if(integer(w.ObjNr,1)!==n)fail('Abweichende HP-Objektnummer.');
  if(!o){const number='HP-'+id.replace(/-/g,'').slice(0,8)+'-'+n;
   if(await tx.get('SELECT 1 FROM objekte WHERE nummer=? COLLATE NOCASE',[number]))fail('Lokale Objektnummer belegt; keine automatische Zusammenführung.');
   const a=await tx.run("INSERT INTO objekte(nummer,bezeichnung,objekttyp) VALUES (?,?,'HP')",[number,'HP-Objekt '+n]);
   await tx.run("INSERT INTO hp_objekt_zuordnung(verbindung_id,hp_objnr,objekt_id,fi_beendet,verwaltungsstatus) VALUES(?,?,?,0,'aktiv')",[id,n,a.lastID]);o={objekt_id:a.lastID};
  }
  return {table:'objekte',keys:{id:o.objekt_id},values:{bezeichnung:w.Suchbegr||'HP-Objekt '+n,objekttyp:w.ObjTyp==='WEG'?'WEG':'HP',objekt_art:w.ObjTypText||w.ObjTyp,hp_zustellpostamt:optionalInt(w.Zustellpostamt,'Zustellpostamt'),hp_freier_verteilerschluessel_code:w.VSchlFREI,hp_anzeigen:boolean(w.anzeigen_ja_nein,'anzeigen_ja_nein'),hp_objekttyp2_code:w.Objekttyp2,strasse:w.ObjStr,land:w.Land,plz:w.PLZ,ort:w.Ort,baujahr:w.Baujahr,hp_objekttyp_code:w.ObjTyp,hp_objekt_id:w.ObjektID,gebaeudebezeichnung:w.GebBezeichnung,objekt_alias:w.ObjektAlias,objektstrasse_2:w.Objektstrasse_2,hp_team_code:w.Team,hp_sachbearbeiter_code:w.SB,hp_buchhalter_code:w.BuchhalterDesh,hp_reservebuchhalter_code:w.BuchhalterReserve,verkauf:boolean(w.ZustVerkauf,'ZustVerkauf')??0,vermietung:boolean(w.ZustVerm,'ZustVerm')??0,heizungsart:w.Heizungsart,warmwasser:w.WWArt,garagenart:w.Garagenart,muellgefaesse:w.M_llGefArt,...Object.fromEntries([1,2,3,4,5].map(i=>['gruppe'+i,w['ObjGr'+i]]))}};
 }
 if(!o)fail('Aktuelles Elternobjekt noch nicht importiert.');const oid=o.objekt_id;
 if(r.art==='objektzahlen'){if(integer(w.ObjNr,1)!==n)fail('Abweichende HP-Objektnummer.');return {table:'objekte',keys:{id:oid},values:{anzahl_gebaeude:optionalInt(w.AnzGeb,'AnzGeb'),hp_anzahl_ein:optionalInt(w.AnzEin,'AnzEin')}};}
 if(r.art==='gebaeude')return {table:'objekt_gebaeude',keys:{objekt_id:oid,nummer:integer(w.IndGeb)},values:{bezeichnung:w.BezGeb},create:true};
 if(r.art==='jahr')return {table:'objekt_buchungsjahre',keys:{objekt_id:oid,jahr:integer(w.FIBJ_BJ,1)},values:{beginnt_am:date(w.FIBJ_BjVon,'FIBJ_BjVon'),endet_am:date(w.FIBJ_BjBis,'FIBJ_BjBis'),gebucht_bis:date(w.FIBJ_gebBis,'FIBJ_gebBis'),hp_sb_code:w.FIBJ_SB,hp_waehrung:currency(w.FIBJ_Wahrung),vorsteuerquote_dezimal:decimal(w.FIBJ_VorstAbzQuote,'FIBJ_VorstAbzQuote')},create:true};
 if(r.art==='einheit'){
  const number=integer(w.WhgNr);let m=await tx.get('SELECT * FROM hp_einheit_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND hp_whgnr=?',[id,n,number]);
  if(!m){const a=await tx.run("INSERT INTO einheiten(objekt_id,nummer,bezeichnung,einheitstyp) VALUES(?,?,?,'sonstiges')",[oid,'HP-'+id.replace(/-/g,'').slice(0,8)+'-'+n+'-'+number,'HP-Einheit '+number]);await tx.run('INSERT INTO hp_einheit_zuordnung(verbindung_id,hp_objnr,objekt_id,hp_whgnr,einheit_id) VALUES(?,?,?,?,?)',[id,n,oid,number,a.lastID]);m={einheit_id:a.lastID};}
  const fl=decimal(w.WG_m2Fl,'WG_m2Fl'),mea=decimal(w.MEA,'MEA');
  return {table:'einheiten',keys:{id:m.einheit_id},values:{bezeichnung:w.SuchBegr||'HP-Einheit '+number,lage:w.WhgLage,gebaeude_index:optionalInt(w.IndGeb,'IndGeb'),bauteil_index:optionalInt(w.IndBauteil,'IndBauteil'),hp_einheitstyp_code:w.WhgTyp,hp_verwaltungsart_code:w.WG_VwArt,einheitstyp:boolean(w.GewEinhJN,'GewEinhJN')===1?'gewerbe':boolean(w.Whg_JN,'Whg_JN')===1?'wohnung':'sonstiges',wohnung:boolean(w.Whg_JN,'Whg_JN'),gewerbe:boolean(w.GewEinhJN,'GewEinhJN'),teileigentum:boolean(w.TeilEigJN,'TeilEigJN'),mwst_optiert:boolean(w.MwStoptJN,'MwStoptJN'),gefoerdert:boolean(w.gefJN,'gefJN'),mittel_getilgt:boolean(w.MittelGetilgtJN,'MittelGetilgtJN'),bewertungskategorie:optionalInt(w.BewKat,'BewKat'),bindung_bis:date(w.BindBis,'BindBis'),gueltig_bis:date(w.gilt_bis_Datum,'gilt_bis_Datum'),datum_frei:date(w.Datum_Frei,'Datum_Frei'),flaeche_qm:fl===null?null:Number(fl),flaeche_qm_dezimal:fl,mea,mea_dezimal:mea,hp_minol_folge_nr:optionalInt(w.MI_MinolFolgeNrHeizA,'MI_MinolFolgeNrHeizA'),hp_minol_whg_nr:optionalInt(w.MIMinolWhgNr,'MIMinolWhgNr'),hp_dta_ordnungsbegriff:w.DTA_OrdBgr13,hp_frei_1:boolean(w.CB_mit_Text_Frei,'CB_mit_Text_Frei'),hp_frei_2:boolean(w.CB_mit_Text_Frei_1,'CB_mit_Text_Frei_1'),hp_frei_3:boolean(w.CB_mit_Text_Frei_2,'CB_mit_Text_Frei_2'),garagen_nr:w.WG_GarNr,stellplatz_nr:w.WG_StellPlNr,...Object.fromEntries([1,2,3,4,5].map(i=>['hp_vschl'+i,w['WG_VSchl'+i]]))}};
 }
 if(r.art==='funktion'){
  const number=integer(w.lfdNrDatensatz,1),an=integer(w.AdrNr||'0'),wn=integer(w.WhgNr||'0');
  const a=an&&await tx.get('SELECT adresse_id FROM hp_adress_zuordnung WHERE verbindung_id=? AND hp_nummer=?',[id,an]);if(!a)fail('Personenfunktion ohne zugeordnete HP-Adresse; Adressabgleich prüfen.');
  const eid=wn?(await mapping(tx,'hp_einheit_zuordnung',id,n,'hp_whgnr',wn)).einheit_id:null;
  const code=await tx.get('SELECT rolle FROM pfkt_codes WHERE code=?',[w.PFKt]);if(!code)fail('HP-Personenfunktionscode ist noch nicht zugeordnet.');
  let m=await tx.get('SELECT * FROM hp_personenfunktion_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND hp_lfdnr=?',[id,n,number]);
  if(!m){const created=await tx.run('INSERT INTO rollen_zuordnungen(adresse_id,objekt_id,einheit_id,rolle,pfkt_code) VALUES(?,?,?,?,?)',[a.adresse_id,oid,eid,code.rolle,w.PFKt]);await tx.run('INSERT INTO hp_personenfunktion_zuordnung(verbindung_id,hp_objnr,objekt_id,hp_lfdnr,zuordnung_id) VALUES(?,?,?,?,?)',[id,n,oid,number,created.lastID]);m={zuordnung_id:created.lastID};}
  return {table:'rollen_zuordnungen',keys:{id:m.zuordnung_id},values:{adresse_id:a.adresse_id,einheit_id:eid,rolle:code.rolle,pfkt_code:w.PFKt,gueltig_von:date(w.DatVon,'DatVon'),gueltig_bis:date(w.DatBis,'DatBis'),notizen:w.Info,hp_personenkonto_nr:optionalInt(w.PKto,'PKto'),hp_mieter_pktonr:optionalInt(w.FI_MieterPKto,'FI_MieterPKto'),hp_firma_code:w.KEY_Firma,hp_pfkt_art:optionalInt(w.PFktArtEigMiet,'PFktArtEigMiet'),hp_steuer_schluessel:optionalInt(w.ST_SchlAustriaPKto,'ST_SchlAustriaPKto'),inaktiv:boolean(w.inaktiv,'inaktiv'),inaktiv_bis:date(w.inaktivBis,'inaktivBis'),mobile_ende:boolean(w.MobileEnde,'MobileEnde'),option_von:date(w.DatOptvon,'DatOptvon'),option_bis:date(w.DatOptbis,'DatOptbis'),option_ausgeuebt_am:date(w.DatOptausueb,'DatOptausueb')}};
 }
 if(r.art==='konto'){
  const number=integer(w.PKtoNr,1),wn=integer(w.WhgNr||'0'),an=integer(w.AdrNr||'0');let eid=null,aid=null;
  if(wn){eid=(await mapping(tx,'hp_einheit_zuordnung',id,n,'hp_whgnr',wn)).einheit_id;}
  if(an){const a=await tx.get('SELECT adresse_id FROM hp_adress_zuordnung WHERE verbindung_id=? AND hp_nummer=?',[id,an]);if(!a)fail('HP-Adresse '+an+' fehlt noch. Adressabgleich abwarten.');aid=a.adresse_id;}
  let m=await tx.get('SELECT * FROM hp_personenkonto_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND hp_pktonr=?',[id,n,number]);
  if(!m){if(await tx.get('SELECT 1 FROM personenkonten WHERE objekt_id=? AND nummer=?',[oid,String(number)]))fail('Lokale Kontonummer bereits belegt; keine automatische Zusammenführung.');const a=await tx.run('INSERT INTO personenkonten(objekt_id,nummer) VALUES(?,?)',[oid,String(number)]);await tx.run('INSERT INTO hp_personenkonto_zuordnung(verbindung_id,hp_objnr,objekt_id,hp_pktonr,hp_adrnr,hp_whgnr,personenkonto_id) VALUES(?,?,?,?,?,?,?)',[id,n,oid,number,an,wn,a.lastID]);m={personenkonto_id:a.lastID};}
  return {table:'personenkonten',keys:{id:m.personenkonto_id},values:{adresse_id:aid,einheit_id:eid,kontoname:w.PKtoName,aktenzeichen:w.AK_Aktenzeichen,ref_nr:decimal(w.RefKtoNr,'RefKtoNr')}};
 }
 const year=integer(w.BJ||w.Buchungsjahr,1);if(year>9999)fail('Ungültiges HP-Buchungsjahr.');
 if(r.art==='schluessel'){
  if(!await tx.get('SELECT 1 FROM objekt_buchungsjahre WHERE objekt_id=? AND jahr=?',[oid,year]))fail('HP-Buchungsjahr noch nicht importiert.');
  let m=await tx.get('SELECT * FROM hp_verteilerschluessel_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND jahr=? AND hp_code=?',[id,n,year,w.VerteilerSchl]);
  if(!m){let s=await tx.get('SELECT * FROM verteilerschluessel WHERE objekt_id=? AND kuerzel=?',[oid,w.VerteilerSchl]);if(s){const own=await tx.get('SELECT 1 FROM hp_verteilerschluessel_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND schluessel_id=?',[id,n,s.id]);if(!own)fail('Lokaler Verteilerschlüssel bereits belegt; Zuordnung prüfen.');}else s={id:(await tx.run('INSERT INTO verteilerschluessel(objekt_id,kuerzel,bezeichnung) VALUES(?,?,?)',[oid,w.VerteilerSchl,w.SchlTxt||w.VerteilerSchl])).lastID};
   await tx.run('INSERT INTO verteilerschluessel_jahre(schluessel_id,objekt_id,jahr,bezeichnung) VALUES(?,?,?,?)',[s.id,oid,year,w.SchlTxt||w.VerteilerSchl]);await tx.run('INSERT INTO hp_verteilerschluessel_zuordnung(verbindung_id,hp_objnr,objekt_id,hp_code,jahr,schluessel_id) VALUES(?,?,?,?,?,?)',[id,n,oid,w.VerteilerSchl,year,s.id]);m={schluessel_id:s.id};}
  return {table:'verteilerschluessel_jahre',keys:{schluessel_id:m.schluessel_id,jahr:year,objekt_id:oid},values:{bezeichnung:w.SchlTxt||w.VerteilerSchl,gesamt_dezimal:decimal(w.AbrObjAntSum,'AbrObjAntSum'),hp_typ_pw:optionalInt(w.Typ_PW,'Typ_PW'),hp_tabellenart:optionalInt(w.TabArt,'TabArt'),hp_geraeteart_code:w.Ger_teArt}};
 }
 const s=await tx.get('SELECT * FROM hp_verteilerschluessel_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND jahr=? AND hp_code=?',[id,n,year,w.VSchl]);if(!s)fail('HP-Jahres-Verteilerschlüssel noch nicht importiert.');
 const keys={schluessel_id:s.schluessel_id,jahr:year,objekt_id:oid};
 if(r.art==='einheitsanteil'){keys.einheit_id=(await mapping(tx,'hp_einheit_zuordnung',id,n,'hp_whgnr',integer(w.WhgNr))).einheit_id;return {table:'einheit_verteilung_jahre',keys,values:{anteil_dezimal:decimal(w.WhgAnteile,'WhgAnteile')},create:true};}
 keys.personenkonto_id=(await mapping(tx,'hp_personenkonto_zuordnung',id,n,'hp_pktonr',integer(w.PKtoNr,1))).personenkonto_id;
 if(r.art==='kontenanteil')return {table:'personenkonto_verteilung_jahre',keys,values:{anteil_dezimal:decimal(w.AntPers,'AntPers')},create:true};
 keys.hp_dat_anders=integer(w.DatAnders);
 return {table:'personenkonto_verteilung_zeitwerte',keys,values:r.art==='personenwert'?{datum:date(w.DatAnders,'DatAnders'),info:w.Info,anzahl_personen_dezimal:decimal(w.AnzPers,'AnzPers'),anzahl_tage:optionalInt(w.AnzTag,'AnzTag')}:{jahresuebergreifend:boolean(w.BJ_Ubergreif,'BJ_Ubergreif')},create:true};
}

async function relink(tx,id,r,p){
  if(r.art==='funktion'||r.art==='konto'){
   const roles=await tx.all('SELECT z.id,z.hp_personenkonto_nr FROM rollen_zuordnungen z JOIN hp_personenfunktion_zuordnung m ON m.zuordnung_id=z.id WHERE m.verbindung_id=? AND m.hp_objnr=? AND '+(r.art==='konto'?'z.hp_personenkonto_nr=?':'z.id=?'),[id,r.objnr,r.art==='konto'?integer(r.werte.PKtoNr,1):p.keys.id]);
   for(const role of roles){const account=await tx.get('SELECT personenkonto_id,objekt_id FROM hp_personenkonto_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND hp_pktonr=?',[id,r.objnr,role.hp_personenkonto_nr]);
    await tx.run('DELETE FROM personenkonto_funktionen WHERE hp_verbindung_id=? AND zuordnung_id=?'+(account?' AND personenkonto_id<>?':''),account?[id,role.id,account.personenkonto_id]:[id,role.id]);
    if(account)await tx.run('INSERT OR IGNORE INTO personenkonto_funktionen(personenkonto_id,objekt_id,zuordnung_id,hp_verbindung_id) VALUES(?,?,?,?)',[account.personenkonto_id,account.objekt_id,role.id,id]);
   }
  }
}

async function sourceMeta(tx,id,r,basis,status,at){
 const map={objekt:['hp_objekt_zuordnung',[],[]],einheit:['hp_einheit_zuordnung',['hp_whgnr'],[r.werte.WhgNr]],konto:['hp_personenkonto_zuordnung',['hp_pktonr'],[r.werte.PKtoNr]],funktion:['hp_personenfunktion_zuordnung',['hp_lfdnr'],[r.werte.lfdNrDatensatz]],schluessel:['hp_verteilerschluessel_zuordnung',['jahr','hp_code'],[r.werte.BJ,r.werte.VerteilerSchl]]}[r.art];
 if(!map)return;
 await tx.run('UPDATE '+map[0]+' SET basis=?,remote=?,hash=?,sync_status=?,revision=revision+1,gelesen_am=? WHERE verbindung_id=? AND hp_objnr=?'+map[1].map(k=>' AND '+k+'=?').join(''),[JSON.stringify(basis),JSON.stringify(r.werte),r.hash,status,at,id,r.objnr,...map[2]]);
}

function service(db,{now=()=>Date.now()}={}){
 const iso=()=>new Date(now()).toISOString();
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date(now()));
 async function auth(tx,id,token,data,sourceRequired=true){const v=await tx.get("SELECT v.*,i.token_hash AS import_hash FROM hp_objekt_importe i JOIN hp_adress_verbindungen v ON v.id=i.verbindung_id JOIN benutzer b ON b.id=v.benutzer_id WHERE v.id=? AND i.aktiv=1 AND v.aktiv=1 AND b.aktiv=1 AND b.rolle='admin'",[id]);if(!v||typeof token!=='string'||!(/^[A-Za-z0-9_-]{43}$/).test(token)||!crypto.timingSafeEqual(Buffer.from(hash(token)),Buffer.from(v.import_hash)))fail('Objektimport-Freigabe ungültig oder beendet.',401);if(data?.datenbank!==v.datenbank)fail('HP-Datenbank gehört nicht zu dieser Kopplung.');if(sourceRequired){const source=await tx.get('SELECT fingerprint FROM hp_import_quellen WHERE verbindung_id=?',[id]);if(!source||data.quelle!==source.fingerprint)fail('HP-Quelle stimmt nicht mit der festen Kundenkopplung überein.');}return v;}
 async function active(tx,id,n){const s=await tx.get('SELECT * FROM hp_import_objektstatus WHERE verbindung_id=? AND hp_objnr=?',[id,n]);if(!s||s.status!=='aktiv'||now()<s.geprueft_ms||now()-s.geprueft_ms>60000)fail('Aktueller HP-Verwaltungsstatus muss erneut gelesen werden.');}
 async function apply(tx,id,r){
  await active(tx,id,r.objnr);
  const old=await tx.get('SELECT * FROM hp_import_datensaetze WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',[id,r.art,r.objnr,r.key]);
  const p=await project(tx,id,r);for(const k of Object.keys(p.values))if(p.values[k]==='')p.values[k]=null;let current=await row(tx,p.table,p.keys),created=!old;
  if(!current&&p.create){await ensure(tx,p.table,p.keys,p.values);current=await row(tx,p.table,p.keys);}
  if(!current)fail('Lokaler Importdatensatz fehlt.');
  const base=old?JSON.parse(old.basis):p.values,merged={};let conflict=false;
  for(const [k,value] of Object.entries(p.values)){
   const local=current[k]??null,b=base[k]??null;
   if(old&&local!==b&&value!==b&&local!==value)conflict=true;
   merged[k]=old&&local!==b?local:value;
  }
  const changed=Object.keys(merged).filter(k=>(current[k]??null)!==merged[k]);
  if(!conflict&&changed.length)await tx.run('UPDATE '+p.table+' SET '+changed.map(k=>k+'=?').join(',')+(p.table==='objekte'||p.table==='einheiten'?",geaendert_am=datetime('now')":'')+' WHERE '+whereClause(p.keys),[...changed.map(k=>merged[k]),...Object.values(p.keys)]);
  const status=conflict?'konflikt':Object.keys(p.values).some(k=>merged[k]!==p.values[k])?'lokal_geaendert':'synchron';
  await tx.run(`INSERT INTO hp_import_datensaetze(verbindung_id,art,hp_objnr,quellschluessel,hash,remote,basis,tabelle,lokal_schluessel,status,meldung,geaendert_am,remote_projection) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(verbindung_id,art,hp_objnr,quellschluessel) DO UPDATE SET hash=excluded.hash,remote=excluded.remote,remote_projection=excluded.remote_projection,basis=excluded.basis,status=excluded.status,meldung=excluded.meldung,geaendert_am=excluded.geaendert_am`,[id,r.art,r.objnr,r.key,r.hash,JSON.stringify(r.werte),JSON.stringify(conflict?base:p.values),p.table,JSON.stringify(p.keys),status,conflict?'Dasselbe Feld wurde in HP und CuraAed geändert. Keine Seite überschrieben.':null,iso(),JSON.stringify(p.values)]);
  await tx.run('UPDATE hp_import_datensaetze SET bestaetigt_ms=? WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',[now(),id,r.art,r.objnr,r.key]);
  await sourceMeta(tx,id,r,conflict?base:p.values,status,iso());
  if(conflict)return 'konflikt';
  await relink(tx,id,r,p);
  return created?'neu':changed.length?'geaendert':'unveraendert';
 }
 return {
  async bindSource(id,token,input){if(typeof input.quelle!=='string'||!(/^[a-f0-9]{64}$/).test(input.quelle))fail('Ungültige HP-Quellbindung.',400);return db.transaktion(async tx=>{await auth(tx,id,token,input,false);const previous=await tx.get('SELECT fingerprint FROM hp_import_quellen WHERE verbindung_id=?',[id]);if(previous&&previous.fingerprint!==input.quelle)fail('Andere HP-Quelle erkannt. Kein Import; bestehende Kundenzuordnung zuerst prüfen.');if(!previous)await tx.run('INSERT INTO hp_import_quellen VALUES(?,?)',[id,input.quelle]);return {ok:true};});},
  async diagnose(id,token,input){if(typeof input.art!=='string'||!F.datasets[input.art]||!Number.isSafeInteger(input.objnr)||input.objnr<1||input.code!==null&&!(typeof input.code==='string'&&/^(ODBC_[A-Z0-9]{5}|QUELLE_UNKLAR)$/.test(input.code)))fail('Ungültige HP-Lesediagnose.',400);return db.transaktion(async tx=>{await auth(tx,id,token,input);if(input.code===null)await tx.run("DELETE FROM hp_import_fehler WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel='!quelle'",[id,input.art,input.objnr]);else await tx.run("INSERT INTO hp_import_fehler VALUES(?,?,?,'!quelle',?,?) ON CONFLICT(verbindung_id,art,hp_objnr,quellschluessel) DO UPDATE SET meldung=excluded.meldung,gesehen_am=excluded.gesehen_am",[id,input.art,input.objnr,'HP-Leseprüfung fehlgeschlagen: '+input.code+'. Andere Bereiche werden weiter geprüft.',iso()]);return {ok:true};});},
  async conflicts(owner){const entries=await db.all("SELECT d.* FROM hp_import_datensaetze d JOIN hp_adress_verbindungen v ON v.id=d.verbindung_id WHERE v.benutzer_id=? AND d.status='konflikt' ORDER BY d.geaendert_am DESC LIMIT 50",[owner]);const out=[];for(const d of entries){const keys=JSON.parse(d.lokal_schluessel),current=await row(db,d.tabelle,keys);if(!current)continue;const p={values:JSON.parse(d.remote_projection)};out.push({verbindung_id:d.verbindung_id,art:d.art,objnr:d.hp_objnr,key:d.quellschluessel,revision:hash(JSON.stringify([d.hash,d.basis,current])),felder:Object.keys(p.values).filter(k=>(current[k]??null)!==p.values[k]).map(k=>({feld:k,lokal:current[k]??null,hp:p.values[k]}))});}return out;},
  async resolve(owner,input){if(!['hp','lokal'].includes(input.entscheidung))fail('Konfliktentscheidung fehlt.',400);return db.transaktion(async tx=>{const d=await tx.get("SELECT d.* FROM hp_import_datensaetze d JOIN hp_adress_verbindungen v ON v.id=d.verbindung_id WHERE v.benutzer_id=? AND d.verbindung_id=? AND d.art=? AND d.hp_objnr=? AND d.quellschluessel=? AND d.status='konflikt'",[owner,input.verbindung_id,input.art,input.objnr,input.key]);if(!d)fail('Importkonflikt nicht gefunden.',404);const current=await row(tx,d.tabelle,JSON.parse(d.lokal_schluessel));if(!current||!d.bestaetigt_ms||now()-d.bestaetigt_ms>120000||input.revision!==hash(JSON.stringify([d.hash,d.basis,current])))fail('Konfliktstand veraltet. Importprogramm weiterlaufen lassen und erneut laden.');await active(tx,d.verbindung_id,d.hp_objnr);const p={table:d.tabelle,keys:JSON.parse(d.lokal_schluessel),values:JSON.parse(d.remote_projection)};if(input.entscheidung==='hp')await tx.run('UPDATE '+p.table+' SET '+Object.keys(p.values).map(k=>k+'=?').join(',')+' WHERE '+whereClause(p.keys),[...Object.values(p.values),...Object.values(p.keys)]);await tx.run('UPDATE hp_import_datensaetze SET basis=?,status=?,meldung=NULL WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',[JSON.stringify(p.values),input.entscheidung==='hp'?'synchron':'lokal_geaendert',d.verbindung_id,d.art,d.hp_objnr,d.quellschluessel]);await relink(tx,d.verbindung_id,{art:d.art,objnr:d.hp_objnr,werte:JSON.parse(d.remote)},p);return {ok:true};});},
  async create(owner,input){if(input.zustimmung!==true)fail('Lesenden Importumfang ausdrücklich freigeben.',400);return db.transaktion(async tx=>{const v=await tx.get('SELECT * FROM hp_adress_verbindungen WHERE id=? AND benutzer_id=? AND aktiv=1',[input.verbindung_id,owner]);if(!v)fail('Eigene aktive HP-Kundenverbindung fehlt.');const token=crypto.randomBytes(32).toString('base64url');await tx.run('INSERT INTO hp_objekt_importe(verbindung_id,token_hash) VALUES(?,?) ON CONFLICT(verbindung_id) DO UPDATE SET token_hash=excluded.token_hash,aktiv=1',[v.id,hash(token)]);return {id:v.id,token,scope:'objekte-import-v1',datenbank:v.datenbank,ablauf_ms:0};});},
  async disconnect(owner,id){await db.run('UPDATE hp_objekt_importe SET aktiv=0 WHERE verbindung_id IN (SELECT id FROM hp_adress_verbindungen WHERE id=? AND benutzer_id=?)',[id,owner]);return {ok:true};},
  async list(owner){const vs=await db.all('SELECT i.verbindung_id AS id,i.aktiv,i.zuletzt_gesehen,i.letzter_lauf,v.name,v.datenbank FROM hp_objekt_importe i JOIN hp_adress_verbindungen v ON v.id=i.verbindung_id WHERE v.benutzer_id=?',[owner]);for(const v of vs){v.bereiche=await db.all('SELECT art,status,COUNT(*) AS anzahl FROM hp_import_datensaetze WHERE verbindung_id=? GROUP BY art,status',[v.id]);v.objektstatus=await db.all('SELECT status,COUNT(*) AS anzahl FROM hp_import_objektstatus WHERE verbindung_id=? GROUP BY status',[v.id]);v.fehler=await db.all('SELECT art,hp_objnr,quellschluessel,meldung FROM hp_import_fehler WHERE verbindung_id=? ORDER BY gesehen_am DESC LIMIT 50',[v.id]);}return vs;},
  async status(id,token,input){
   if(!Number.isSafeInteger(input.objnr)||input.objnr<1||input.objnr>2147483647)fail('Ungültige HP-Objektnummer.',400);
   return db.transaktion(async tx=>{
    await auth(tx,id,token,input);const result=bewerteObjektstatus(input.fi_beendet,today());
    await tx.run('INSERT INTO hp_import_objektstatus(verbindung_id,hp_objnr,fi_beendet,status,geprueft_ms) VALUES(?,?,?,?,?) ON CONFLICT(verbindung_id,hp_objnr) DO UPDATE SET fi_beendet=excluded.fi_beendet,status=excluded.status,geprueft_ms=excluded.geprueft_ms',[id,input.objnr,Number.isInteger(input.fi_beendet)?input.fi_beendet:null,result.status,now()]);
    await tx.run('UPDATE hp_objekt_zuordnung SET fi_beendet=?,beendet_am=?,verwaltungsstatus=? WHERE verbindung_id=? AND hp_objnr=?',[Number.isInteger(input.fi_beendet)?input.fi_beendet:null,result.beendet_am,result.status,id,input.objnr]);
    if(result.status==='beendet'){
     const retired=await tx.run('UPDATE objekte SET archiviert=1 WHERE archiviert=0 AND id IN (SELECT objekt_id FROM hp_objekt_zuordnung WHERE verbindung_id=? AND hp_objnr=?)',[id,input.objnr]);
     if(retired.changes)await tx.run('UPDATE hp_import_objektstatus SET auto_archiviert=1 WHERE verbindung_id=? AND hp_objnr=?',[id,input.objnr]);
    }else if(result.status==='aktiv'){
     const previous=await tx.get('SELECT auto_archiviert FROM hp_import_objektstatus WHERE verbindung_id=? AND hp_objnr=?',[id,input.objnr]);
     if(previous?.auto_archiviert){
      await tx.run('UPDATE objekte SET archiviert=0 WHERE id IN (SELECT objekt_id FROM hp_objekt_zuordnung WHERE verbindung_id=? AND hp_objnr=?)',[id,input.objnr]);
      await tx.run('UPDATE hp_import_objektstatus SET auto_archiviert=0 WHERE verbindung_id=? AND hp_objnr=?',[id,input.objnr]);
     }
    }
    await tx.run('UPDATE hp_objekt_importe SET zuletzt_gesehen=? WHERE verbindung_id=?',[now(),id]);return {erlaubt:result.importierbar,status:result.status};
   });
  },
  async compare(id,token,input){if(!Array.isArray(input.fingerprints)||input.fingerprints.length>50)fail('Höchstens 50 HP-Fingerabdrücke.',400);return db.transaktion(async tx=>{await auth(tx,id,token,input);await active(tx,id,input.objnr);const needed=[];for(const f of input.fingerprints){if(!f||typeof f.art!=='string'||!F.datasets[f.art]||typeof f.key!=='string'||f.key.length>256||typeof f.hash!=='string'||!(/^[a-f0-9]{64}$/).test(f.hash))fail('Ungültiger HP-Fingerabdruck.',400);const old=await tx.get('SELECT * FROM hp_import_datensaetze WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',[id,f.art,input.objnr,f.key]);const error=await tx.get('SELECT 1 FROM hp_import_fehler WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',[id,f.art,input.objnr,f.key]);if(old&&old.hash===f.hash)await tx.run('UPDATE hp_import_datensaetze SET bestaetigt_ms=? WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',[now(),id,f.art,input.objnr,f.key]);if(!old||old.hash!==f.hash||error)needed.push({art:f.art,key:f.key});else if(old.status!=='konflikt'){const basis=JSON.parse(old.basis),current=await row(tx,old.tabelle,JSON.parse(old.lokal_schluessel));const status=!current?'fehler':Object.keys(basis).some(k=>(current[k]??null)!==basis[k])?'lokal_geaendert':'synchron';if(status==='fehler')needed.push({art:f.art,key:f.key});if(status!==old.status)await tx.run('UPDATE hp_import_datensaetze SET status=? WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',[status,id,f.art,input.objnr,f.key]);}}return {protokoll:'objekt-import-delta-v1',benoetigt:needed};});},
  async scan(id,token,input){if(!Array.isArray(input.records)||input.records.length>50)fail('Höchstens 50 HP-Datensätze je Anfrage.',400);return db.transaktion(async tx=>{await auth(tx,id,token,input);await active(tx,id,input.objnr);const result={neu:0,geaendert:0,unveraendert:0,konflikt:0,fehler:0};for(const raw of input.records){await tx.run('SAVEPOINT hp_import_row');let r;try{r=F.record(raw);if(r.objnr!==input.objnr)fail('Fremdes Elternobjekt im Import.');result[await apply(tx,id,r)]++;await tx.run('DELETE FROM hp_import_fehler WHERE verbindung_id=? AND art=? AND hp_objnr=? AND quellschluessel=?',[id,r.art,r.objnr,r.key]);await tx.run('RELEASE hp_import_row');}catch(e){await tx.run('ROLLBACK TO hp_import_row');await tx.run('RELEASE hp_import_row');if(!(e instanceof ValidationError)&&!['SQLITE_CONSTRAINT'].includes(e.code))throw e;result.fehler++;const art=typeof raw?.art==='string'&&F.datasets[raw.art]?raw.art:'datensatz',key=r?.key||'';await tx.run('INSERT INTO hp_import_fehler VALUES(?,?,?,?,?,?) ON CONFLICT(verbindung_id,art,hp_objnr,quellschluessel) DO UPDATE SET meldung=excluded.meldung,gesehen_am=excluded.gesehen_am',[id,art,input.objnr,key,e instanceof ValidationError?e.message:'HP-Zuordnung oder Werte verletzen die Datenprüfung.',iso()]);}}await tx.run('UPDATE hp_objekt_importe SET zuletzt_gesehen=?,letzter_lauf=? WHERE verbindung_id=?',[now(),iso(),id]);return result;});}
 };
}
module.exports={service};
