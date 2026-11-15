'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{openDatabase}=require('../db'),{baue}=require('../services/m365-kern');
async function fixture(t){
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'admin','Admin','x','admin');INSERT INTO firmenbriefkoepfe(id,name,daten) VALUES(1,'Breidenbach und Hennig GmbH','{}'),(2,'Andere Firma','{}');");
 let calls=[],sendStatus=202,refreshes=0,expires=3600,waiter=null;
 const fetch=async(url,opt)=>{
  calls.push({url,opt});
  if(url.endsWith('/token')){const p=new URLSearchParams(opt.body);if(p.get('grant_type')==='refresh_token')refreshes++;if(waiter)await waiter;return{ok:true,json:async()=>({access_token:'access-secret',refresh_token:'refresh-secret',expires_in:expires,scope:'User.Read Mail.Send.Shared'})};}
  if(url.includes('/me?'))return{ok:true,json:async()=>({mail:'admin@example.test'})};
  if(url.endsWith('/sendMail'))return{status:sendStatus};
  throw Error('Unexpected network call');
 };
 const options={clientId:'11111111-1111-1111-1111-111111111111',clientSecret:'client-secret',tenantId:'22222222-2222-2222-2222-222222222222',publicUrl:'https://curaaed.test',tokenKey:crypto.randomBytes(32),fetch};
 const svc=baue(db,options),user={id:1};
 await svc.saveSettings(1,{revision:0,absender:'post@immo-hb.de',postweg:'epostbox',drucker:''});
 const begin=async()=>new URL((await svc.verbinden(1,user,'session')).url).searchParams.get('state');
 const connect=async()=>svc.callbackFinish(user,'session',await begin(),'code');
 return{db,svc,user,options,calls,begin,connect,setStatus:n=>sendStatus=n,setExpires:n=>expires=n,block:p=>waiter=p,refreshes:()=>refreshes};
}
test('OAuth bindet Sitzung, einmaligen State und PKCE; Tokens bleiben verschlüsselt und firmengebunden',async t=>{
 const f=await fixture(t),state=await f.begin();
 await assert.rejects(f.svc.callbackFinish(f.user,'fremde-sitzung',state,'code'),e=>e.status===403);assert.equal(f.calls.length,0);
 await f.svc.callbackFinish(f.user,'session',state,'code');
 await assert.rejects(f.svc.callbackFinish(f.user,'session',state,'code'),e=>e.status===403);
 const tokenCall=f.calls.find(c=>c.url.endsWith('/token')),params=new URLSearchParams(tokenCall.opt.body);assert.equal(params.get('redirect_uri'),'https://curaaed.test/api/m365/callback');assert.ok(params.get('code_verifier'));
 const row=await f.db.get('SELECT * FROM m365_verbindungen WHERE firma_id=1');assert.ok(!row.token.includes('secret'));
 const settings=await f.svc.settings(1);assert.equal(settings.m365_verbunden,true);assert.equal(settings.absender,'post@immo-hb.de');assert.equal(settings.epostbox_verbunden,false);assert.ok(!JSON.stringify(settings).includes('secret'));
 await f.svc.saveSettings(2,{revision:0,absender:'other@example.test',postweg:'drucker',drucker:'Testdrucker'});
 await f.db.run('INSERT INTO m365_verbindungen(firma_id,token,benutzer_id,konto) VALUES(2,?,1,?)',[row.token,'admin@example.test']);
 await assert.rejects(f.svc.vorbereiten(2),/neu verbinden/);
 await assert.rejects(baue(f.db,{...f.options,tenantId:'33333333-3333-3333-3333-333333333333'}).vorbereiten(1),/neu verbinden/);
});
test('Graph erhält genau den Eigentümer, seine PDF und das gemeinsame Absenderpostfach; 202 bedeutet Annahme',async t=>{
 const f=await fixture(t);await f.connect();const prepared=await f.svc.vorbereiten(1);
 const body={an:'owner@example.test',pdf:Buffer.from('%PDF-Personal'),dateiname:'Einladung.pdf',betreff:'Einladung',text:'Persönliche Einladung'};
 assert.deepEqual(await f.svc.senden(prepared,body),{angenommen:true});
 const call=f.calls.find(c=>c.url.endsWith('/sendMail')),payload=JSON.parse(call.opt.body);
 assert.equal(payload.message.from.emailAddress.address,'post@immo-hb.de');assert.deepEqual(payload.message.toRecipients,[{emailAddress:{address:body.an}}]);assert.equal(payload.message.attachments[0].contentBytes,body.pdf.toString('base64'));assert.equal(payload.saveToSentItems,true);
 f.setStatus(403);await assert.rejects(f.svc.senden(prepared,body),e=>e.sicherAbgelehnt===true);
 f.setStatus(503);await assert.rejects(f.svc.senden(prepared,body),e=>e.sicherAbgelehnt===false);
 await f.svc.trennen(1);const count=f.calls.length;await assert.rejects(f.svc.senden(prepared,body),e=>e.sicherAbgelehnt===true);assert.equal(f.calls.length,count);
});
test('Abgelaufene Anmeldung und fehlende Serverkonfiguration senden nichts; parallele Erneuerung läuft einmal',async t=>{
 const f=await fixture(t),state=await f.begin();await f.db.run('UPDATE m365_oauth SET ablauf_am=0');await assert.rejects(f.svc.callbackFinish(f.user,'session',state,'code'),e=>e.status===403);assert.equal(f.calls.length,0);
 await assert.rejects(baue(f.db,{publicUrl:'https://curaaed.test'}).verbinden(1,f.user,'session'),e=>e.status===503);
 f.setExpires(1);await f.connect();f.setExpires(3600);
 const results=await Promise.all([f.svc.vorbereiten(1),f.svc.vorbereiten(1)]);assert.equal(f.refreshes(),1);assert.equal(results[0].revision,results[1].revision);
});
test('Trennen während OAuth verhindert eine wiederauferstandene Verbindung',async t=>{
 const f=await fixture(t),state=await f.begin();let release;f.block(new Promise(r=>release=r));
 const connected=f.svc.callbackFinish(f.user,'session',state,'code');while(!f.calls.length)await new Promise(r=>setImmediate(r));
 const disconnected=f.svc.trennen(1);release();await Promise.all([connected,disconnected]);
 assert.equal((await f.svc.settings(1)).m365_verbunden,false);assert.equal((await f.db.get('SELECT COUNT(*) n FROM m365_oauth')).n,0);
});
