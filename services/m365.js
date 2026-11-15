'use strict';
const crypto=require('node:crypto'),kern=require('./m365-kern'),schluessel=require('../lib/m365-schluessel'),{ValidationError}=require('../lib/validation');
const queues=new WeakMap(),guid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const fail=(s,n=400)=>{throw new ValidationError(s,n);};
// Configuration changes and OAuth/token writes share one queue per database.
function exclusive(db,fn){const next=(queues.get(db)||Promise.resolve()).then(fn,fn);queues.set(db,next.catch(()=>{}));return next;}
function baue(db,options={}){
 const base=kern.baue(db,options),aad=Buffer.from('curaaed:m365:config:v1');
 let active=base,lastRevision=-1;
 function seal(data){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',schluessel(db,options),iv);c.setAAD(aad);return Buffer.concat([iv,c.update(JSON.stringify(data)),c.final(),c.getAuthTag()]).toString('base64');}
 function open(value){try{const b=Buffer.from(value,'base64');if(b.length<29)throw Error('Ungültiger Geheimtext');const c=crypto.createDecipheriv('aes-256-gcm',schluessel(db,options),b.subarray(0,12),{authTagLength:16});c.setAAD(aad);c.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString());}catch{fail('Die gespeicherte Microsoft-Einrichtung konnte nicht entschlüsselt werden. Bitte die Datensicherung und Schlüsseldatei prüfen.',503);}}
 async function load(){
  let row=await db.get('SELECT * FROM m365_app_config WHERE id=1');
  if(!row){
   const data={clientId:options.clientId||process.env.M365_CLIENT_ID,tenantId:options.tenantId||process.env.M365_TENANT_ID,clientSecret:options.clientSecret||process.env.M365_CLIENT_SECRET};
   if(guid(data.clientId)&&guid(data.tenantId)&&data.clientSecret){
    await db.run("INSERT OR IGNORE INTO m365_app_config(id,daten,revision,quelle) VALUES(1,?,1,'übernommen')",[seal(data)]);
    row=await db.get('SELECT * FROM m365_app_config WHERE id=1');
   }
  }
  return row?{...row,config:open(row.daten)}:{revision:0,config:{}};
 }
 async function current(){const row=await load();if(lastRevision!==row.revision){active=kern.baue(db,{...options,...row.config});lastRevision=row.revision;}return active;}
 function safe(row){return{client_id:row.config.clientId||'',mandant_id:row.config.tenantId||'',secret_vorhanden:!!row.config.clientSecret,revision:row.revision,quelle:row.quelle||null,geaendert_am:row.geaendert_am||null,redirect_uri:base.origin?base.origin+'/api/m365/callback':''};}
 async function konfiguration(){return safe(await load());}
 async function konfigurationSpeichern(b,user){
  const old=await load();
  if(!Number.isSafeInteger(b.revision)||b.revision!==old.revision)fail('Die Microsoft-Einrichtung wurde inzwischen geändert. Bitte neu öffnen.',409);
  if(!guid(b.client_id)||!guid(b.mandant_id)||typeof b.secret!=='string'||b.secret.length>4096)fail('Bitte Mandanten-ID, Anwendungs-ID und Schlüssel prüfen.');
  const changed=old.revision>0&&(b.client_id.toLowerCase()!==old.config.clientId.toLowerCase()||b.mandant_id.toLowerCase()!==old.config.tenantId.toLowerCase());
  if(changed&&b.verbindungen_trennen!==true)fail('Eine andere Microsoft-App trennt bestehende Verbindungen. Bitte ausdrücklich bestätigen.',409);
  const secret=b.secret||(!changed&&old.config.clientSecret);
  if(!secret||secret.trim()!==secret||/[\r\n]/.test(secret))fail('Bitte einen gültigen geheimen Schlüssel eingeben.');
  const config={clientId:!changed&&old.revision?old.config.clientId:b.client_id.toLowerCase(),tenantId:!changed&&old.revision?old.config.tenantId:b.mandant_id.toLowerCase(),clientSecret:secret};
  await db.transaktion(async tx=>{
   const row=await tx.get('SELECT revision FROM m365_app_config WHERE id=1');
   if((row?.revision||0)!==old.revision)fail('Die Microsoft-Einrichtung wurde inzwischen geändert. Bitte neu öffnen.',409);
   if(changed)await tx.run('DELETE FROM m365_verbindungen');
   await tx.run('DELETE FROM m365_oauth');
   await tx.run("INSERT INTO m365_app_config(id,daten,revision,quelle,geaendert_von) VALUES(1,?,1,'Benutzerverwaltung',?) ON CONFLICT(id) DO UPDATE SET daten=excluded.daten,revision=revision+1,quelle=excluded.quelle,geaendert_von=excluded.geaendert_von,geaendert_am=CURRENT_TIMESTAMP",[seal(config),user.id]);
  });
  return safe(await load());
 }
 const service={origin:base.origin,get ready(){return active.ready;}};
 for(const method of ['settings','saveSettings','verbinden','callbackFinish','vorbereiten','senden','trennen'])service[method]=(...args)=>exclusive(db,async()=>{const core=await current();return core[method](...args);});
 service.konfiguration=()=>exclusive(db,konfiguration);
 service.konfigurationSpeichern=(b,user)=>exclusive(db,()=>konfigurationSpeichern(b,user));
 return service;
}
module.exports={baue,mailbox:kern.mailbox};
