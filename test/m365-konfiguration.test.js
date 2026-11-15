'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{openDatabase}=require('../db'),{baue}=require('../services/m365');
const config={clientId:'11111111-1111-1111-1111-111111111111',tenantId:'22222222-2222-2222-2222-222222222222',clientSecret:'private-client-secret',publicUrl:'https://curaaed.test'};
const body=(c,secret='')=>({client_id:c.client_id,mandant_id:c.mandant_id,revision:c.revision,secret});
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-m365-config-')),file=path.join(dir,'app.db'),db=await openDatabase(file);
 t.after(async()=>{await db.close();await fs.rm(dir,{recursive:true,force:true});});
 await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'admin','Admin','x','admin'),(2,'team','Team','x','mitarbeiter');INSERT INTO firmenbriefkoepfe(id,name,daten) VALUES(1,'Firma','{}')");
 return{db,file,options:{...config,fetch:async url=>({ok:true,json:async()=>url.includes('/me?')?{mail:'admin@example.test'}:{access_token:'private-access',refresh_token:'private-refresh',expires_in:1,scope:'Mail.Send.Shared'}})}};
}
test('Einmalige Übernahme verschlüsselt IDs und Secret; Neustart ohne Serverwerte behält OAuth-Verbindung',async t=>{
 const f=await fixture(t),legacy=require('../services/m365-kern').baue(f.db,f.options);
 await legacy.saveSettings(1,{revision:0,absender:'post@example.test',postweg:'drucker',drucker:''});
 const state=new URL((await legacy.verbinden(1,{id:1},'session')).url).searchParams.get('state');
 await legacy.callbackFinish({id:1},'session',state,'code');
 const svc=baue(f.db,f.options),c=await svc.konfiguration();
 assert.equal(c.secret_vorhanden,true);assert.equal(c.quelle,'übernommen');assert.ok(!JSON.stringify(c).includes(config.clientSecret));
 const raw=await f.db.get('SELECT * FROM m365_app_config');
 for(const s of [config.clientSecret,config.clientId,config.tenantId])assert.ok(!raw.daten.includes(s));
 const db2=await openDatabase(f.file);
 try{
  let refreshed=false;
  const next=baue(db2,{publicUrl:config.publicUrl,fetch:async(url,opt)=>{const p=new URLSearchParams(opt.body);assert.equal(p.get('client_secret'),config.clientSecret);assert.equal(p.get('client_id'),config.clientId);refreshed=true;return{ok:true,json:async()=>({access_token:'private-access',expires_in:3600})};}});
  assert.equal((await next.konfiguration()).client_id,config.clientId);
  assert.equal((await next.vorbereiten(1)).accessToken,'private-access');assert.equal(refreshed,true);
  assert.equal((await next.settings(1)).m365_verbunden,true);
 }finally{await db2.close();}
 const old=row=>row.revision;assert.equal(old(await f.db.get('SELECT * FROM m365_app_config')),1);
 assert.equal((await baue(f.db,{...f.options,clientSecret:'different-env'}).konfiguration()).revision,1);
});
test('Leer lassen behält Secret; Revision und App-Wechsel schützen aktive Verbindungen',async t=>{
 const f=await fixture(t),svc=baue(f.db,f.options);let c=await svc.konfiguration();
 await f.db.run("INSERT INTO m365_verbindungen(firma_id,token,benutzer_id,konto) VALUES(1,'opaque',1,'admin@example.test')");
 c=await svc.konfigurationSpeichern(body(c),{id:1});assert.equal(c.quelle,'Benutzerverwaltung');
 assert.equal((await f.db.get('SELECT COUNT(*) n FROM m365_verbindungen')).n,1);
 await assert.rejects(svc.konfigurationSpeichern({...body(c),revision:1},{id:1}),e=>e.status===409);
 const change={...body(c),client_id:'33333333-3333-3333-3333-333333333333'};
 await assert.rejects(svc.konfigurationSpeichern(change,{id:1}),e=>e.status===409);
 await assert.rejects(svc.konfigurationSpeichern({...change,verbindungen_trennen:true},{id:1}),/Schlüssel/);
 await svc.konfigurationSpeichern({...change,secret:'replacement-private',verbindungen_trennen:true},{id:1});
 assert.equal((await f.db.get('SELECT COUNT(*) n FROM m365_verbindungen')).n,0);
 await f.db.run("UPDATE m365_app_config SET daten='broken'");
 await assert.rejects(svc.konfiguration(),e=>e.status===503);
});
test('App-Wechsel während OAuth verhindert Wiederherstellung der alten Verbindung',async t=>{
 const f=await fixture(t);let entered,release;
 const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r),fetch=f.options.fetch;
 const svc=baue(f.db,{...f.options,fetch:async(...args)=>{if(args[0].endsWith('/token')){entered();await gate;}return fetch(...args);}});
 await svc.saveSettings(1,{revision:0,absender:'post@example.test',postweg:'drucker',drucker:''});
 const c=await svc.konfiguration(),state=new URL((await svc.verbinden(1,{id:1},'session')).url).searchParams.get('state');
 const completing=svc.callbackFinish({id:1},'session',state,'code');await waiting;
 const saving=svc.konfigurationSpeichern({...body(c,'new-secret'),client_id:'33333333-3333-3333-3333-333333333333',verbindungen_trennen:true},{id:1});
 release();await Promise.all([completing,saving]);assert.equal((await svc.settings(1)).m365_verbunden,false);
});
test('Nur Admin darf Einrichtung lesen/ändern; fremder Ursprung wird abgewiesen, Antworten enthalten kein Secret',async t=>{
 const f=await fixture(t),express=require('express'),app=express();app.use(express.json());
 app.use((req,res,next)=>{req.benutzer={id:1,rolle:req.get('x-role')||'admin'};next();});
 app.use('/m365',require('../routes/m365')(f.db,baue(f.db,f.options)));
 app.use((e,req,res,next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const url='http://127.0.0.1:'+server.address().port+'/m365/konfiguration';
 for(const role of ['mitarbeiter','leser'])for(const method of ['GET','PUT'])assert.equal((await fetch(url,{method,headers:{'x-role':role,'content-type':'application/json',Origin:config.publicUrl},...(method==='PUT'?{body:'{}'}:{})})).status,403);
 const response=await fetch(url),c=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(c).includes(config.clientSecret));
 assert.equal((await fetch(url,{method:'PUT',headers:{'content-type':'application/json',Origin:'https://foreign.test'},body:JSON.stringify(body(c,'replacement'))})).status,403);
 const saved=await fetch(url,{method:'PUT',headers:{'content-type':'application/json',Origin:config.publicUrl},body:JSON.stringify(body(c,'replacement'))});assert.equal(saved.status,200);assert.ok(!(await saved.text()).includes('replacement'));
});

test('Ersteinrichtung funktioniert vollständig ohne Microsoft-Variablen',async t=>{
 const f=await fixture(t),svc=baue(f.db,{publicUrl:config.publicUrl});
 const empty=await svc.konfiguration();assert.equal(empty.revision,0);assert.equal(empty.secret_vorhanden,false);
 await assert.rejects(svc.verbinden(1,{id:1},'session'),e=>e.status===503);
 await svc.konfigurationSpeichern({revision:0,client_id:config.clientId,mandant_id:config.tenantId,secret:config.clientSecret},{id:1});
 await svc.saveSettings(1,{revision:0,absender:'post@example.test',postweg:'drucker',drucker:''});
 assert.equal((await svc.settings(1)).m365_bereit,true);
 const url=new URL((await svc.verbinden(1,{id:1},'session')).url);
 assert.equal(url.searchParams.get('client_id'),config.clientId);
 assert.equal(url.hostname,'login.microsoftonline.com');
});
