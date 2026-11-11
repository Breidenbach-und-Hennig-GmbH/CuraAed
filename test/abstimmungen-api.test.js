'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db'),{baueApp}=require('../lib/appFactory'),auth=require('../lib/auth');
test('Abstimmungs-API: Authentifizierung, Schreibrechte, Objekt- und TOP-Grenzen',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'admin','Admin','x','admin'),(2,'leser','Leser','x','leser');INSERT INTO objekte(id,bezeichnung) VALUES(1,'Test');INSERT INTO versammlungen(id,objekt_id,name,datum,leitung_id) VALUES(1,1,'ETV','2026-11-20',1);INSERT INTO versammlung_tops(id,versammlung_id,position,titel,art) VALUES(1,1,1,'Test','beschluss');");
 const token=await auth.sitzungErstellen(db,1),reader=await auth.sitzungErstellen(db,2);const server=baueApp(db).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port+'/api';
 const request=(url,method='GET',body,session=token)=>fetch(base+url,{method,headers:{'content-type':'application/json',cookie:auth.COOKIE_NAME+'='+session},body:body?JSON.stringify(body):undefined});
 assert.equal((await request('/objekte/1/stimmprinzip','GET',null,'')).status,401);
 assert.equal((await request('/objekte/1/stimmprinzip','GET',null,reader)).status,200);
 assert.equal((await request('/versammlungen/1/teilnehmer','GET',null,reader)).status,200);assert.equal((await request('/versammlungen/1/einladung','GET',null,reader)).status,200);assert.equal((await request('/versammlungen/1/protokoll','GET',null,reader)).status,200);assert.equal((await request('/versammlungen/1/protokoll','PUT',{},reader)).status,403);assert.equal((await request('/versammlungen/1/protokoll.pdf','POST',{},reader)).status,403);assert.equal((await request('/versammlungen/999/protokoll')).status,404);assert.equal((await request('/versammlungen/1/einladung.pdf','POST',{},reader)).status,403);assert.equal((await request('/versammlungen/1/teilnehmer.txt','GET',null,reader)).status,200);assert.equal((await request('/versammlungen/1/teilnehmer','PUT',{},reader)).status,403);assert.equal((await request('/versammlungen/999/teilnehmer')).status,404);
 assert.equal((await request('/objekte/1/stimmprinzip','PUT',{revision:0,daten:{}},reader)).status,403);
 for(const suffix of ['auszaehlen','abstimmung'])assert.equal((await request('/versammlungen/1/tops/1/'+suffix,'POST',{},reader)).status,403);
 assert.equal((await request('/versammlungen/2/tops/1/abstimmung')).status,404);
 assert.equal((await request('/versammlungen/1/tops/1/mehrheit','PUT',{revision:0,daten:{}},reader)).status,403);
 assert.equal((await request('/objekte/1/stimmprinzip','PUT',{revision:0,daten:{prinzip:'mea',geprueft:true,grundlage:'GO § 4'}})).status,200);
 const saved=await (await request('/versammlungen/1/tops/1/abstimmung')).json();assert.equal(saved.config.daten.prinzip,'mea');assert.match(saved.register.hinweise[0],/Keine aktiven Einheiten/);
});
