'use strict';
const crypto=require('node:crypto'),spec=require('../lib/hpAdressBereiche.json'),{ValidationError}=require('../lib/validation');
const fail=(s,n=400)=>{throw new ValidationError(s,n);},hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function rows(key,n,values){
 const p=Object.hasOwn(spec,key)&&spec[key];if(!p||!Number.isSafeInteger(n)||n<1||n>2147483647||!Array.isArray(values)||values.length>5000)fail('Ungültiger HP-Adressbereich.');
 const seen=new Set();return values.map(v=>{if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).some(k=>!p.fields.some(f=>f.name===k)))fail('Unbekanntes HP-Adressfeld.');const r={};for(const f of p.fields){const x=v[f.name];if(x!==null&&(typeof x!=='string'||x.length>(f.typ===13?1048576:Math.max(f.max*4,1024))))fail('Ungültiger HP-Feldwert: '+key+'/'+f.name);r[f.name]=x;}
 if(Number(r[p.adr])!==n||p.filter&&Object.entries(p.filter).some(([f,x])=>r[f]!==x))fail('HP-Adressbereich gehört zu einer anderen Adresse oder einem anderen Modul.',403);
 const id=JSON.stringify(p.pk.map(k=>r[k]));if(seen.has(id))fail('Mehrdeutiger HP-Quellschlüssel in '+key+'.');seen.add(id);return r;}).sort((a,b)=>JSON.stringify(p.pk.map(k=>a[k])).localeCompare(JSON.stringify(p.pk.map(k=>b[k])),'en'));
}
const tables={telefon:'adress_telefone',email:'adress_emails',ansprechpartner:'adress_ansprechpartner',bank:'adress_bank'};
function projection(key,r){
 if(key==='telefon')return r.TelNr?{art:/mobil|funk|handy/i.test(r.TelTxt||'')?'Funktelefon':/fax/i.test(r.TelTxt||'')?'Fax':'Telefon',nummer:r.TelNr,bemerkung:[r.TelTxt,r.Bemerkung].filter(Boolean).join(' · '),kurzwahl:r.Kurzwahl}:null;
 if(key==='email')return r.eMail_Adresse___Webs?{adresse:r.eMail_Adresse___Webs,bemerkung:r.Bemerkung,ist_email:r.eMail==='1'?1:0,standard:r.Standard==='1'?1:0,hpmobile:r.HPMobile==='1'?1:0}:null;
 if(key==='ansprechpartner'){const name=[r.Vorname,r.Name].filter(Boolean).join(' ');return name?{name,funktion:r.Funktion,telefon:r.Tel,email:r.Email}:null;}
 if(key==='bank'){const iban=(r.IBANkomplett||'').replace(/\s/g,'').toUpperCase();if(!require('../lib/iban').gueltig(iban))fail('HP-Bankverbindung hat keine gültige IBAN. Originalwerte bleiben im HP-Datenbereich erhalten.');return{kontoinhaber:r.Inhaber||'Kontoinhaber in HP nicht angegeben',iban,bic:r.BICkomplett,bankname:r.NameBank,bemerkung:'HP-Bankverbindung '+r.LfdNrBV};}
 return null;
}
function service(db){
 async function auth(tx,id,token,datenbank){await require('./hpAdressSync').service(tx).zugang(id,token,datenbank);if(!await tx.get('SELECT 1 FROM hp_adress_vollfreigaben WHERE verbindung_id=? AND aktiv=1',[id]))fail('Die zusätzlichen HP-Adressbereiche sind noch nicht freigegeben.',403);}
 async function project(tx,id,n,key,aid,data){if(!tables[key])return [];const table=tables[key],p=spec[key],warnings=[];
  const currentKeys=new Set();for(const r of data){const source=JSON.stringify(p.pk.map(k=>r[k]));currentKeys.add(source);let w;try{w=projection(key,r);}catch(e){warnings.push(e.message);continue;}if(!w)continue;
   const old=await tx.get('SELECT * FROM hp_adress_detail_zuordnung WHERE verbindung_id=? AND hp_nummer=? AND bereich=? AND quellschluessel=?',[id,n,key,source]);
   let local=old?.lokal_id?await tx.get('SELECT * FROM '+table+' WHERE id=? AND adresse_id=?',[old.lokal_id,aid]):null;
   if(old&&!local){warnings.push('Ein lokal entfernter HP-Eintrag wurde nicht automatisch neu angelegt.');continue;}
   if(local){const before=JSON.parse(old.projektion);if(Object.keys(before).some(k=>(local[k]??'')!==(before[k]??''))){await tx.run("UPDATE hp_adress_detail_zuordnung SET status='konflikt' WHERE verbindung_id=? AND hp_nummer=? AND bereich=? AND quellschluessel=?",[id,n,key,source]);warnings.push('Lokal bearbeiteter HP-Eintrag bleibt erhalten; Änderungskonflikt prüfen.');continue;}
    const cols=Object.keys(w);await tx.run('UPDATE '+table+' SET '+cols.map(k=>k+'=?').join(',')+' WHERE id=? AND adresse_id=?',[...Object.values(w),local.id,aid]);
   }else{const cols=Object.keys(w);local={id:(await tx.run('INSERT INTO '+table+'(adresse_id,'+cols.join(',')+') VALUES(?,'+cols.map(()=>'?').join(',')+')',[aid,...Object.values(w)])).lastID};}
   await tx.run("INSERT INTO hp_adress_detail_zuordnung(verbindung_id,hp_nummer,bereich,quellschluessel,lokal_id,projektion,status) VALUES(?,?,?,?,?,?,'synchron') ON CONFLICT(verbindung_id,hp_nummer,bereich,quellschluessel) DO UPDATE SET lokal_id=excluded.lokal_id,projektion=excluded.projektion,status='synchron'",[id,n,key,source,local.id,JSON.stringify(w)]);
  }
  const old=await tx.all('SELECT quellschluessel FROM hp_adress_detail_zuordnung WHERE verbindung_id=? AND hp_nummer=? AND bereich=?',[id,n,key]);for(const row of old)if(!currentKeys.has(row.quellschluessel)){await tx.run("UPDATE hp_adress_detail_zuordnung SET status='in_hp_entfernt' WHERE verbindung_id=? AND hp_nummer=? AND bereich=? AND quellschluessel=?",[id,n,key,row.quellschluessel]);warnings.push('Ein früher übernommener Eintrag fehlt jetzt in HP. Er wurde in CuraAed zur Prüfung beibehalten.');}
  if(key==='telefon'||key==='email')await require('./kommunikation').syncStammfelder(tx,aid);
  return [...new Set(warnings)];
 }
 async function speichernTx(tx,id,token,b,authorized=false){
  if(!authorized)await auth(tx,id,token,b.datenbank);let wire;if(b.daten_json!==undefined){if(typeof b.daten_json!=='string'||Buffer.byteLength(b.daten_json)>1500000)fail('HP-Bereich zu groß.');try{wire=JSON.parse(b.daten_json);}catch{fail('Ungültige HP-Bereichsdaten.');}}
  const data=rows(b.bereich,b.nummer,wire||b.zeilen);let m=await tx.get('SELECT adresse_id FROM hp_adress_zuordnung WHERE verbindung_id=? AND hp_nummer=?',[id,b.nummer]);
  // Reservierte Nummern sind bis zur vollständigen Rückprüfung keine Stammdatenbindung.
  // Insbesondere nach einem Rollback kann HP dieselbe Nummer anderweitig vergeben.
  if(m&&await tx.get("SELECT 1 FROM hp_adress_neuanlagen WHERE adresse_id=? AND status!='synchron'",[m.adresse_id]))return{ok:true,status:'ausstehend',gesperrt:true};
  // Preserve malformed legacy source values for reading without relaxing any HP write validation.
  if(!m&&b.bereich==='stamm'&&data.length===1){const r=data[0],number='HP-'+b.nummer;if(await tx.get('SELECT id FROM adressen WHERE nummer=?',[number]))fail('Lokale HP-Adressnummer bereits belegt. Keine automatische Zusammenführung.',409);const raw={nummer:b.nummer,anrede:r.Anrede||'',vorname:r.Vorname||'',name1:r.Name1||'',zusatz:r.Name2||'',strasse:r.Strasse||'',land:r.Land||'',plz:r.PLZ||'',ort:r.Ort||''};require('./hpAdressSync').record(raw,true);const a=await tx.run("INSERT INTO adressen(nummer,adresstyp,anrede,vorname,nachname,zusatz,strasse,land,plz,ort) VALUES(?,'person',?,?,?,?,?,?,?,?)",[number,raw.anrede,raw.vorname,raw.name1,raw.zusatz,raw.strasse,raw.land,raw.plz,raw.ort]);await tx.run("INSERT INTO hp_adress_zuordnung(verbindung_id,hp_nummer,adresse_id,basis,status,meldung,gelesen_am) VALUES(?,?,?,?,'fehler',?,CURRENT_TIMESTAMP)",[id,b.nummer,a.lastID,JSON.stringify(raw),'HP-Bestandsdaten wurden lesend übernommen. Vor Rückschreibung die gemeldeten Quellfeldfehler prüfen.']);m={adresse_id:a.lastID};}
  if(!m)fail('Hauptadresse noch nicht übernommen; Bereich wird erneut angefordert.',409);
  await tx.run("INSERT INTO hp_adress_bereiche(verbindung_id,hp_nummer,bereich,rohdaten,hash,status,meldung) VALUES(?,?,?,?,?,'synchron',NULL) ON CONFLICT(verbindung_id,hp_nummer,bereich) DO UPDATE SET rohdaten=excluded.rohdaten,hash=excluded.hash,status='synchron',meldung=NULL,gelesen_am=CURRENT_TIMESTAMP",[id,b.nummer,b.bereich,JSON.stringify(data),b.daten_json?crypto.createHash('sha256').update(b.daten_json).digest('hex'):hash(data)]);
  const notices=await project(tx,id,b.nummer,b.bereich,m.adresse_id,data);if(notices.length)await tx.run("UPDATE hp_adress_bereiche SET status='pruefen',meldung=? WHERE verbindung_id=? AND hp_nummer=? AND bereich=?",[notices.join(' · '),id,b.nummer,b.bereich]);return{ok:true,status:notices.length?'pruefen':'synchron'};
 }
 async function speichern(id,token,b){return db.transaktion(tx=>speichernTx(tx,id,token,b));}
 async function vergleich(id,token,b){if(!Array.isArray(b.fingerprints)||b.fingerprints.length>550)fail('Ungültiger Bereichsvergleich.');return db.transaktion(async tx=>{await auth(tx,id,token,b.datenbank);const needed=[];for(const v of b.fingerprints){if(!Object.hasOwn(spec,v.bereich)||!Number.isSafeInteger(v.nummer)||v.nummer<1||!/^[a-f0-9]{64}$/.test(v.hash))fail('Ungültiger Bereichsfingerabdruck.');const old=await tx.get('SELECT hash,status FROM hp_adress_bereiche WHERE verbindung_id=? AND hp_nummer=? AND bereich=?',[id,v.nummer,v.bereich]);if(!old||old.hash!==v.hash||old.status==='fehler')needed.push({nummer:v.nummer,bereich:v.bereich});}return{benoetigt:needed};});}
 async function fehler(id,token,b){if(!Object.hasOwn(spec,b.bereich)||!Number.isSafeInteger(b.nummer)||b.nummer<1||typeof b.code!=='string'||!/^ODBC_[A-Z0-9]{4,5}$/.test(b.code))fail('Ungültige HP-Bereichsdiagnose.');return db.transaktion(async tx=>{await auth(tx,id,token,b.datenbank);await tx.run("INSERT INTO hp_adress_bereiche(verbindung_id,hp_nummer,bereich,rohdaten,hash,status,meldung) VALUES(?,?,?,'[]','','fehler',?) ON CONFLICT(verbindung_id,hp_nummer,bereich) DO UPDATE SET status='fehler',meldung=excluded.meldung,gelesen_am=CURRENT_TIMESTAMP",[id,b.nummer,b.bereich,'Leseprüfung fehlgeschlagen: '+b.code]);return{ok:true};});}
 async function stand(aid){const m=await db.get('SELECT verbindung_id,hp_nummer FROM hp_adress_zuordnung WHERE adresse_id=?',[aid]);if(!m)return{bereiche:[]};const r=await db.all('SELECT bereich,status,meldung,gelesen_am,json_array_length(rohdaten) anzahl FROM hp_adress_bereiche WHERE verbindung_id=? AND hp_nummer=?',[m.verbindung_id,m.hp_nummer]);return{bereiche:Object.entries(spec).filter(([key])=>key!=='bank_aktuell').map(([key,p])=>({key,label:p.label,...r.find(x=>x.bereich===key),status:r.find(x=>x.bereich===key)?.status||'ausstehend'}))};}
 async function details(aid,key){if(!Object.hasOwn(spec,key))fail('Unbekannter HP-Adressbereich.');const m=await db.get('SELECT verbindung_id,hp_nummer FROM hp_adress_zuordnung WHERE adresse_id=?',[aid]);if(!m)fail('Keine HP-Zuordnung.',404);const r=await db.get('SELECT * FROM hp_adress_bereiche WHERE verbindung_id=? AND hp_nummer=? AND bereich=?',[m.verbindung_id,m.hp_nummer,key]);return{label:spec[key].label,felder:spec[key].fields.map(f=>f.name),zeilen:r?JSON.parse(r.rohdaten):[],status:r?.status||'ausstehend',meldung:r?.meldung};}
 async function stapel(id,token,b){
  if(!Array.isArray(b.eintraege)||!b.eintraege.length||b.eintraege.length>50)fail('Ungültiger HP-Bereichsstapel.');
  return db.transaktion(async tx=>{await auth(tx,id,token,b.datenbank);const ergebnisse=[];
  for(const v of b.eintraege){await tx.run('SAVEPOINT hp_bereich');try{const r=await speichernTx(tx,id,token,{...v,datenbank:b.datenbank},true);await tx.run('RELEASE hp_bereich');ergebnisse.push({nummer:v.nummer,bereich:v.bereich,...r});}catch(e){await tx.run('ROLLBACK TO hp_bereich');await tx.run('RELEASE hp_bereich');if(!(e instanceof ValidationError)||![400,409].includes(e.status))throw e;ergebnisse.push({nummer:v?.nummer,bereich:v?.bereich,ok:false,status:'fehler',meldung:e.message});}}
  return{ergebnisse};});
 }
 return{speichern,stapel,vergleich,stand,details,fehler};
}
module.exports={service,rows,projection,spec,hash};
