'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{openDatabase}=require('../db'),V=require('../services/versammlungen'),T=require('../services/etv-teams');
const options={clientId:'11111111-1111-1111-1111-111111111111',tenantId:'22222222-2222-2222-2222-222222222222',clientSecret:'secret-private',publicUrl:'https://curaaed.test'};
async function fixture(t){
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'admin','Testleitung','x','admin');INSERT INTO objekte(id,nummer,bezeichnung) VALUES(1,'1001','Testobjekt');INSERT INTO firmenbriefkoepfe(id,name,daten) VALUES(1,'Testverwaltung','{}');");
 const body={objekt_id:1,leitung_id:1,name:'ETV Test',datum:'2027-01-20',uhrzeit:'17:30',art:'hybrid',ort:'Testsaal'};
 return{db,body,create:()=>V.anlegen(db,body,1)};
}
test('ETV-Zeit wird in Europe/Berlin umgerechnet; Zeitumstellungen werden nicht geraten',()=>{
 assert.equal(T.beginn('2027-01-20','17:30').toISOString(),'2027-01-20T16:30:00.000Z');
 assert.equal(T.beginn('2027-07-20','17:30').toISOString(),'2027-07-20T15:30:00.000Z');
 assert.throws(()=>T.beginn('2027-03-28','02:30'),/Zeitumstellung/);
 assert.throws(()=>T.beginn('2027-10-31','02:30'),/Zeitumstellung/);
 assert.throws(()=>T.beginn('2027-01-20',''),/Uhrzeit/);
});
test('Teams wird einmal je ETV erstellt; erneutes Speichern verwendet denselben Link, Änderungen aktualisieren dieselbe Besprechung',async t=>{
 const f=await fixture(t),calls=[],m365={teamsBesprechung:async(firma,b,old)=>{calls.push({firma,b,old:{...old}});return{meeting_id:'meeting-1',join_url:'https://teams.microsoft.com/l/meetup-join/test',organizer:'organizer-1'};}},svc=T.baue(f.db,m365),v=await f.create();
 let r=await svc.synchronisieren(v.id);assert.equal(r.teams_status,'bereit');assert.equal(calls.length,2);assert.equal(calls[0].old.meeting_id,null);assert.equal(calls[1].old.meeting_id,'meeting-1');
 assert.equal(calls[0].b.startDateTime,'2027-01-20T16:30:00.000Z');assert.equal(calls[0].b.endDateTime,'2027-01-20T19:30:00.000Z');
 await Promise.all([svc.synchronisieren(v.id),svc.synchronisieren(v.id)]);assert.equal(calls.length,2);
 await V.aktualisieren(f.db,v.id,{uhrzeit:'18:00'});r=await svc.synchronisieren(v.id,{teams_dauer:120});assert.equal(calls.length,3);assert.equal(calls[2].old.meeting_id,'meeting-1');assert.equal(r.teams_url,'https://teams.microsoft.com/l/meetup-join/test');
 const copy=await f.create();await svc.synchronisieren(copy.id);assert.notEqual(calls[0].b.externalId,calls[3].b.externalId);
 await V.aktualisieren(f.db,v.id,{art:'praesenz'});const n=calls.length;r=await svc.synchronisieren(v.id);assert.equal(calls.length,n);assert.equal(r.teams_url,null);
});
test('Unklare Teams-Antwort behält externe ID; nach erfolgreicher Erstellung verhindert ein fehlgeschlagenes Update doppelte Besprechungen',async t=>{
 const f=await fixture(t),v=await f.create(),created=new Set(),ids=[];let timeout=true,failPatch=true;
 const svc=T.baue(f.db,{teamsBesprechung:async(firma,b,old)=>{
  ids.push(b.externalId);
  if(!old.meeting_id){created.add(b.externalId);if(timeout){timeout=false;throw Error('Timeout');}}
  else if(failPatch){failPatch=false;throw Error('Timeout beim Aktualisieren');}
  return{meeting_id:'same-id',join_url:'https://teams.microsoft.com/meet/test',organizer:'owner'};
 }});
 assert.equal((await svc.synchronisieren(v.id)).teams_status,'fehler');
 assert.equal((await svc.synchronisieren(v.id)).teams_status,'fehler');
 assert.equal((await f.db.get('SELECT meeting_id FROM etv_teams')).meeting_id,'same-id');
 assert.equal((await svc.synchronisieren(v.id)).teams_status,'bereit');
 assert.equal(created.size,1);assert.equal(new Set(ids).size,1);
});
test('Zusätzliche Teams-Zustimmung verwendet PKCE und nur delegierte Berechtigung; Graph bekommt keine Eigentümer-Empfänger',async t=>{
 const f=await fixture(t),calls=[];
 const fetch=async(url,opt)=>{calls.push({url,opt});if(url.endsWith('/token'))return{ok:true,json:async()=>({access_token:'access-private',refresh_token:'refresh-private',expires_in:3600,scope:new URLSearchParams(opt.body).get('scope')})};if(url.includes('/me?'))return{ok:true,json:async()=>({id:'organizer-id',mail:'leitung@example.test'})};return{status:201,json:async()=>({id:'meeting-id',joinWebUrl:'https://teams.microsoft.com/l/meetup-join/test'})};};
 const svc=require('../services/m365').baue(f.db,{...options,fetch,tokenKey:crypto.randomBytes(32)});
 await svc.saveSettings(1,{revision:0,absender:'post@example.test',postweg:'drucker',drucker:''});
 const url=new URL((await svc.verbinden(1,{id:1},'session',{teams:true})).url);assert.match(url.searchParams.get('scope'),/OnlineMeetings.ReadWrite/);assert.doesNotMatch(url.searchParams.get('scope'),/ReadWrite.All|Calendars/);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 await svc.callbackFinish({id:1},'session',url.searchParams.get('state'),'code');
 assert.equal((await svc.settings(1)).teams_bereit,true);
 await svc.teamsBesprechung(1,{externalId:'id',subject:'ETV',startDateTime:'2027-01-20T16:30:00Z',endDateTime:'2027-01-20T19:30:00Z'});
 const call=calls.find(c=>c.url.endsWith('/createOrGet'));assert.equal(call.opt.method,'POST');assert.equal(JSON.parse(call.opt.body).participants,undefined);
 await assert.rejects(svc.teamsBesprechung(1,{}, {meeting_id:'id',organizer:'someone-else'}),/Organisatorkonto/);
 assert.ok(!JSON.stringify(await svc.settings(1)).includes('private'));
});
test('ETV-API erfordert den eigenen Ursprung für automatische Teams-Erstellung; fehlende Freigabe speichert die ETV mit sichtbarem Fehlerstatus',async t=>{
 const f=await fixture(t),app=require('../lib/appFactory').baueApp(f.db,{m365:{publicUrl:options.publicUrl}}),token=await require('../lib/auth').sitzungErstellen(f.db,1);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const root='http://127.0.0.1:'+server.address().port+'/api',headers={'content-type':'application/json',Cookie:'hv_session='+token};
 const no=await fetch(root+'/versammlungen',{method:'POST',headers,body:JSON.stringify(f.body)});assert.equal(no.status,403);assert.equal((await f.db.get('SELECT COUNT(*) n FROM versammlungen')).n,0);
 const yes=await fetch(root+'/versammlungen',{method:'POST',headers:{...headers,Origin:options.publicUrl},body:JSON.stringify(f.body)});assert.equal(yes.status,201);const v=await yes.json();assert.equal(v.teams_status,'fehler');assert.match(v.teams_meldung,/Microsoft 365/);assert.equal((await f.db.get('SELECT COUNT(*) n FROM versammlungen')).n,1);
 const retry=await fetch(root+'/versammlungen/'+v.id+'/teams',{method:'POST',headers:{...headers,Origin:options.publicUrl},body:'{}'});assert.equal(retry.status,200);assert.equal((await f.db.get('SELECT COUNT(*) n FROM versammlungen')).n,1);
});
