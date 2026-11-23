'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const Z=require('./zaehler'),{ValidationError}=require('../lib/validation');
const fail=(s,n=400)=>{throw new ValidationError(s,n);};
const ORIGIN='https://platform.lobaro.com';
// Vertrag: https://platform.lobaro.com/api/swagger.yaml (24.11.2026).
// Ausschließlich GET; keine Geräteänderungen, Downlinks oder HP-Schreibzugriffe.
function baue(db,options={}){
 const request=options.fetch||globalThis.fetch,now=options.now||Date.now;let key;
 function schluessel(){
  if(key)return key;
  if(options.tokenKey)key=Buffer.from(options.tokenKey);
  else if(db.db.filename===':memory:')key=crypto.randomBytes(32);
  else{const file=path.join(path.dirname(path.resolve(db.db.filename)),'.lobaro-token-key');try{fs.writeFileSync(file,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}key=fs.readFileSync(file);}
  if(key.length!==32)fail('Der Lobaro-Schlüssel konnte nicht geladen werden.',503);return key;
 }
 function seal(token,oid){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',schluessel(),iv);c.setAAD(Buffer.from('curaaed:lobaro:'+oid));return Buffer.concat([iv,c.update(token,'utf8'),c.final(),c.getAuthTag()]).toString('base64');}
 function open(value,oid){try{const b=Buffer.from(value,'base64'),c=crypto.createDecipheriv('aes-256-gcm',schluessel(),b.subarray(0,12));c.setAAD(Buffer.from('curaaed:lobaro:'+oid));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString('utf8');}catch{fail('Lobaro-Zugang konnte nicht entschlüsselt werden. Sicherung und Schlüsseldatei prüfen.',503);}}
 async function status(oid){await Z.objekt(db,oid);const c=await db.get('SELECT revision FROM lobaro_verbindungen WHERE objekt_id=?',[Z.id(oid)]);return{portal:ORIGIN,revision:c?.revision||0,token_vorhanden:!!c,automatisch:false,status:c?'Zugang hinterlegt – Geräte und Messwertzuordnung prüfen':'Vorbereitet – Lobaro-Zugang fehlt'};}
 async function speichern(oid,b,user){await Z.objekt(db,oid);const token=Z.text(b.token,8192).replace(/^Bearer\s+/i,'');if(!token||/[\s\x00-\x1f\x7f]/.test(token))fail('Bitte einen gültigen Lobaro-API-Token eingeben.');const sealed=seal(token,Z.id(oid));await db.transaktion(async tx=>{const old=await tx.get('SELECT revision FROM lobaro_verbindungen WHERE objekt_id=?',[Z.id(oid)]);if(b.revision!==(old?.revision||0))fail('Die Lobaro-Verbindung wurde geändert. Bitte neu öffnen.',409);await tx.run('INSERT INTO lobaro_verbindungen(objekt_id,token,geaendert_von) VALUES(?,?,?) ON CONFLICT(objekt_id) DO UPDATE SET token=excluded.token,revision=revision+1,geaendert_von=excluded.geaendert_von',[Z.id(oid),sealed,user.id]);await tx.run('DELETE FROM lobaro_vorschauen WHERE objekt_id=?',[Z.id(oid)]);});return status(oid);}
 async function config(oid){await Z.objekt(db,oid);const c=await db.get('SELECT * FROM lobaro_verbindungen WHERE objekt_id=?',[Z.id(oid)]);if(!c)fail('Bitte zuerst den Lobaro-Zugang hinterlegen.',409);return c;}
 async function get(c,pathname,query={}){
  const url=new URL(pathname,ORIGIN);if(url.origin!==ORIGIN||!/^\/api\/devices(?:\/\d+\/parsed-data)?$/.test(url.pathname))fail('Ungültiger Lobaro-Abruf.');
  Object.entries(query).forEach(([k,v])=>url.searchParams.set(k,String(v)));let res;
  try{res=await request(url,{method:'GET',headers:{Authorization:'Bearer '+open(c.token,c.objekt_id),Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});}catch(e){if(e instanceof ValidationError)throw e;fail('Lobaro ist momentan nicht erreichbar. Es wurden keine Messwerte übernommen.',502);}
  if(!res.ok)fail(res.status===401||res.status===403?'Lobaro hat den Zugriff abgelehnt. Token und Gerätefreigabe prüfen.':'Lobaro konnte die Daten nicht liefern (HTTP '+res.status+').',res.status===401||res.status===403?409:502);
  if(Number(res.headers.get('content-length'))>2000000)fail('Lobaro-Antwort zu groß. Bitte den Zeitraum eingrenzen.',502);
  const reader=res.body?.getReader();let raw='';
  if(reader){const decoder=new TextDecoder();let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();fail('Lobaro-Antwort zu groß. Bitte den Zeitraum eingrenzen.',502);}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}catch(e){if(e instanceof ValidationError)throw e;fail('Lobaro-Antwort wurde unterbrochen. Bitte erneut abrufen.',502);}finally{reader.releaseLock();}}
  else raw=await res.text();
  if(Buffer.byteLength(raw)>2000000)fail('Lobaro-Antwort zu groß.',502);
  let data;try{data=JSON.parse(raw);}catch{fail('Lobaro liefert keine gültigen JSON-Daten.',502);}
  if(!data||!Array.isArray(data.data)||!data.pagination||!Number.isSafeInteger(data.pagination.total)||data.pagination.total<0)fail('Lobaro-Antwort entspricht nicht dem dokumentierten Format.',502);return data;
 }
 async function seiten(c,pathname,query,max=2000){const out=[],seen=new Set();let total=null;for(let offset=0;offset<max;offset+=100){const r=await get(c,pathname,{...query,limit:100,offset,'sort-field':'createdAt','sort-dir':'ASC'});if(r.pagination.offset!==offset||r.data.length>100)fail('Lobaro-Seitenfolge konnte nicht geprüft werden.',502);if(total===null)total=r.pagination.total;else if(total!==r.pagination.total)fail('Lobaro-Daten haben sich während des Abrufs geändert. Bitte erneut abrufen.',409);if(total>max)fail('Mehr als '+max+' Datensätze. Bitte einen kleineren Zeitraum wählen.',409);for(const row of r.data){if(!row||!/^\d+$/.test(String(row.id))||seen.has(String(row.id)))fail('Lobaro-Seiten enthalten fehlende oder doppelte Datensatznummern.',502);seen.add(String(row.id));}out.push(...r.data);if(out.length===total)return out;if(!r.data.length||out.length>total)fail('Lobaro-Abruf ist unvollständig. Es wurden keine Messwerte übernommen.',502);}fail('Lobaro-Abruf ist unvollständig.',502);}
 async function geraete(oid){const c=await config(oid),rows=await seiten(c,'/api/devices',{noSuborgs:true});return rows.map(r=>({id:r.id,name:r.name||'',seriennummer:r.serial||'',adresse:r.addr||''}));}
 function lese(row,field){let value=row;for(const k of field.split('.')){if(!value||typeof value!=='object'||!Object.prototype.hasOwnProperty.call(value,k))fail('Lobaro-Feld „'+field+'“ fehlt.');value=value[k];}return value;}
 async function vorschau(oid,b,user){
  const c=await config(oid),von=Z.tag(b.von),bis=Z.tag(b.bis);if(von>bis||Date.parse(bis)-Date.parse(von)>93*86400000)fail('Bitte einen Zeitraum von höchstens 93 Tagen wählen.');
  const meters=await db.all('SELECT z.*,p.objekt_id FROM zaehler z JOIN zaehlpunkte p ON p.id=z.zaehlpunkt_id WHERE p.objekt_id=? AND z.lobaro_geraet IS NOT NULL AND z.eingebaut_am<=? AND COALESCE(z.ausgebaut_am,\'9999-12-31\')>=?',[Z.id(oid),bis,von]);
  if(!meters.length)fail('Bitte zuerst die Lobaro-Geräte und Messwertfelder den Zählern zuordnen.',409);
  const records=new Map(),items=[],errors=[];let skipped=0;
  for(const dev of new Set(meters.map(z=>z.lobaro_geraet))){const qs={'f:createdAt':'gt:'+new Date(Date.parse(von)-86400000).toISOString()};/* Auch Berliner Mitternacht und verspätete Uploads erfassen. */records.set(dev,await seiten(c,'/api/devices/'+dev+'/parsed-data',qs));}
  const seen=new Map();
  for(const z of meters)for(const row of records.get(z.lobaro_geraet)){
   try{
    if(String(row.deviceId)!==z.lobaro_geraet)fail('Lobaro liefert Daten eines anderen Geräts.');
    if(!/^\d+$/.test(String(row.id)))fail('Die Lobaro-Datensatznummer fehlt.');
    if(z.kennung_pfad&&String(lese(row,z.kennung_pfad))!==z.kennung_wert){skipped++;continue;}
    const zeitpunkt=Z.zeit(lese(row,z.zeit_pfad)),day=Z.messTag(zeitpunkt);
    if(day<von||day>bis||day<z.eingebaut_am||z.ausgebaut_am&&day>z.ausgebaut_am){skipped++;continue;}
    const m=Z.messung(z,{zeitpunkt,wert:lese(row,z.wert_pfad),einheit:z.einheit_pfad?lese(row,z.einheit_pfad):z.einheit});
    const source=z.lobaro_geraet+':'+row.id,existing=await Z.pruefeMessung(db,z,m,'lobaro',source),k=z.id+':'+m.zeitpunkt;
    if(seen.has(k)){if(seen.get(k)!==m.wert)fail('Mehrere abweichende Werte zum selben Zeitpunkt.');skipped++;continue;}seen.set(k,m.wert);
    const original=JSON.stringify(row);if(Buffer.byteLength(original)>16000)fail('Originaldatensatz zu groß; einen einzelnen Messkanal bereitstellen.');
    items.push({...m,zaehler_id:z.id,nummer:z.nummer,revision:z.revision,quell_id:source,original,bekannt:!!existing});
    if(items.length>2000)fail('Zu viele Messwerte für eine Übernahme.');
   }catch(e){errors.push({zaehler:z.nummer,datensatz:String(row.id||''),fehler:e instanceof ValidationError?e.message:'Messwert konnte nicht geprüft werden.'});}
  }
  await db.run('DELETE FROM lobaro_vorschauen WHERE ablauf<?',[now()]);const vid=crypto.randomUUID();
  const payload=JSON.stringify(items);if(Buffer.byteLength(payload)>2000000)fail('Vorschau zu groß. Bitte einen kleineren Zeitraum wählen.');
  if(!errors.length&&items.length)await db.run('INSERT INTO lobaro_vorschauen(id,objekt_id,benutzer_id,verbindung_revision,ablauf,daten) VALUES(?,?,?,?,?,?)',[vid,Z.id(oid),user.id,c.revision,now()+1800000,payload]);
  return{id:!errors.length&&items.length?vid:null,eintraege:items,fehler:errors,uebersprungen:skipped,neu:items.filter(x=>!x.bekannt).length,bekannt:items.filter(x=>x.bekannt).length};
 }
 async function uebernehmen(oid,vid,user){return db.transaktion(async tx=>{
  const p=await tx.get('SELECT * FROM lobaro_vorschauen WHERE id=? AND objekt_id=? AND benutzer_id=?',[Z.text(vid,50),Z.id(oid),user.id]);if(!p||p.ablauf<now())fail('Die Vorschau ist abgelaufen. Bitte neu abrufen.',409);
  const c=await tx.get('SELECT revision FROM lobaro_verbindungen WHERE objekt_id=?',[Z.id(oid)]);if(!c||c.revision!==p.verbindung_revision)fail('Der Lobaro-Zugang wurde geändert. Bitte neu abrufen.',409);
  let neu=0,bekannt=0;
  for(const item of JSON.parse(p.daten)){const z=await Z.geraet(tx,oid,item.zaehler_id);if(z.revision!==item.revision)fail('Eine Zählerzuordnung wurde geändert. Bitte neu abrufen.',409);const m=Z.messung(z,item);if(await Z.pruefeMessung(tx,z,m,'lobaro',item.quell_id)){bekannt++;continue;}await tx.run("INSERT INTO zaehler_messwerte(zaehler_id,zeitpunkt,wert,einheit,quelle,quell_id,quell_original,erstellt_von) VALUES(?,?,?,?,'lobaro',?,?,?)",[z.id,m.zeitpunkt,m.wert,m.einheit,item.quell_id,item.original,user.id]);neu++;}
  await tx.run('DELETE FROM lobaro_vorschauen WHERE id=?',[p.id]);return{neu,bekannt};
 });}
 return{status,speichern,geraete,vorschau,uebernehmen};
}
module.exports={baue};
