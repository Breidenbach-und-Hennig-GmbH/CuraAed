'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db'),L=require('../services/etv-live'),T=require('../services/teilnehmer'),A=require('../services/abstimmungen'),E=require('../services/einlass');
const TEAMS='https://teams.live.com/meet/1234567890123?p=TestOnlyNoMeeting';
async function fixture(t,start=true){
 const db=await openDatabase(':memory:');t.after(()=>db.close());await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'admin','Testleitung','x','admin'),(2,'leser','Leser','x','leser');INSERT INTO objekte(id,nummer,bezeichnung) VALUES(1,'1001','Testobjekt'),(2,'1002','Fremdes Objekt');INSERT INTO adressen(id,nachname) VALUES(1,'Alpha'),(2,'Beta'),(3,'Gamma'),(4,'Delta');INSERT INTO einheiten(id,objekt_id,nummer,bezeichnung,mea) VALUES(1,1,'WE 1','Wohnung 1','400/1000'),(2,1,'WE 2','Wohnung 2','200/1000'),(3,1,'WE 3','Wohnung 3','250/1000'),(4,1,'WE 4','Wohnung 4','150/1000');INSERT INTO rollen_zuordnungen(einheit_id,adresse_id,rolle) VALUES(1,1,'eigentuemer'),(2,1,'eigentuemer'),(3,2,'eigentuemer'),(3,3,'eigentuemer'),(4,4,'eigentuemer');INSERT INTO versammlungen(id,objekt_id,name,datum,leitung_id) VALUES(1,1,'ETV Test','2026-11-11',1),(2,2,'Fremde ETV','2026-11-11',1);INSERT INTO versammlung_tops(id,versammlung_id,position,titel,art,beschlussvorschlag) VALUES(1,1,1,'Wirtschaftsplan','beschluss','Der Plan wird beschlossen.'),(2,1,2,'Bericht','besprechung',NULL);");
 let s=await T.stand(db,1);await T.speichern(db,1,{revision:0,basis_hash:s.register.basis_hash,teilnehmer:s.register.gruppen.map(g=>({key:g.key,teilnahme:g.key==='2:3'?'vollmacht':'selbst',kanal:g.key==='2:3'?'online':'praesenz',zugang_gesperrt:false,vertreter:g.key==='2:3'?'Vertretung':'',nachweis:g.key==='2:3'?'DMS 42':'',vollmacht_textform:g.key==='2:3',anwesende_eigentuemer:g.key==='2:3'?[]:g.eigentumer.map(o=>o.id)}))},1);
 await A.saveConfig(db,1,{revision:0,daten:{...A.DEFAULT_CONFIG,geprueft:true}});await L.setRoom(db,1,{revision:0,aktiv:true,teams_url:TEAMS},1);
 if(start){s=await E.stand(db,1);await E.starten(db,1,{basis_hash:s.basis_hash,teilnahme_revision:s.teilnahme_revision},1);}return db;
}
async function joined(db,key='1'){const room=await L.room(db,1),j=await L.join(db,1,{raum_token:room.raum_token,name:'Teilnehmer Alpha',kanal:'praesenz'});await L.approve(db,1,{anfrage_id:j.id,gruppen:[key]},1);return j;}
async function open(db,ex=[]){const s=await A.stand(db,1,1);return L.startVote(db,1,{top_id:1,basis_hash:s.register.basis_hash,top_hash:s.top_hash,teilnahme_revision:s.teilnahme_revision,config_revision:s.config.revision,regel_revision:s.regel.revision,zaehlung_revision:s.revision,geprueft:true,ausschluesse:ex},1);}
test('QR-Anfrage erhält keine Eigentümerliste oder Stimmrechte vor Identitätsfreigabe; Sitzungen sind gehasht und versammlungsgebunden',async t=>{
 const db=await fixture(t),r=await L.room(db,1);await assert.rejects(L.join(db,1,{raum_token:'a'.repeat(64),name:'X',kanal:'online'}),e=>e.status===403);
 const j=await L.join(db,1,{raum_token:r.raum_token,name:'Anfrage',kanal:'online'}),s=await L.guestState(db,1,j.token);assert.equal(s.status,'wartend');assert.equal(s.tops,undefined);assert.equal(s.teams_url,undefined);assert.equal(s.gruppen,undefined);
 const row=await db.get('SELECT * FROM etv_live_anfragen WHERE id=?',[j.id]);assert.notEqual(row.session_hash,j.token);assert.equal(row.session_hash.length,64);await assert.rejects(L.guestState(db,2,j.token));await assert.rejects(L.guest(db,1,j.token,true),e=>e.status===403);
 await L.approve(db,1,{anfrage_id:j.id,gruppen:['1']},1);const own=await L.guestState(db,1,j.token);assert.equal(own.tops.length,2);assert.equal(own.teams_url,TEAMS);assert.ok(!JSON.stringify(own).includes('Beta'));
});
test('Digital und manuell zählen gemeinsam genau einmal; digitale Gruppe ist gegen manuelle Doppelstimme geschützt',async t=>{
 const db=await fixture(t),j=await joined(db),r=await open(db);
 await L.vote(db,1,r.id,{key:'1',stimme:'ja',version:0},{anfrage:j.token});await L.vote(db,1,r.id,{key:'2:3',stimme:'nein',version:0},{user:1});await L.vote(db,1,r.id,{key:'4',stimme:'enthaltung',version:0},{user:1});
 await assert.rejects(L.vote(db,1,r.id,{key:'1',stimme:'nein',version:0},{user:1}),e=>e.status===409);await assert.rejects(L.vote(db,1,r.id,{key:'2:3',stimme:'ja',version:0},{anfrage:j.token}),e=>e.status===403);
 const before=await db.get("SELECT COUNT(*) AS n FROM etv_live_audit WHERE aktion='stimme'");await L.vote(db,1,r.id,{key:'1',stimme:'ja',version:0},{anfrage:j.token});assert.equal((await db.get("SELECT COUNT(*) AS n FROM etv_live_audit WHERE aktion='stimme'")).n,before.n);
 const end=await L.finishVote(db,1,r.id,{},1);assert.deepEqual([end.ergebnis.summen.ja,end.ergebnis.summen.nein,end.ergebnis.summen.enthaltung],['1','1','1']);assert.equal((await db.get('SELECT revision FROM etv_abstimmungen WHERE top_id=1')).revision,1);
 await assert.rejects(L.vote(db,1,r.id,{key:'1',stimme:'nein',version:1},{anfrage:j.token}),e=>e.status===409);const guest=await L.guestState(db,1,j.token);assert.equal(guest.abstimmung.gruppen.length,1);assert.equal(guest.abstimmung.ergebnis.details,undefined);assert.ok(!JSON.stringify(guest).includes('Beta'));
});
test('Stimmkorrekturen sind versioniert und nachvollziehbar; veraltete Formulare überschreiben keine neuere Stimme',async t=>{
 const db=await fixture(t),j=await joined(db),r=await open(db);await L.vote(db,1,r.id,{key:'1',stimme:'ja',version:0},{anfrage:j.token});await assert.rejects(L.vote(db,1,r.id,{key:'1',stimme:'nein',version:0},{anfrage:j.token}),e=>e.status===409);
 const changed=await L.vote(db,1,r.id,{key:'1',stimme:'nein',version:1},{anfrage:j.token});assert.equal(changed.version,2);assert.equal((await db.get("SELECT COUNT(*) AS n FROM etv_live_audit WHERE aktion='stimme'")).n,2);
});
test('Laufende Runde friert Zugangswege ein; geänderte Teilnehmer erzwingen Abbruch statt falscher Auszählung',async t=>{
 const db=await fixture(t),j=await joined(db),r=await open(db);
 await assert.rejects(L.revoke(db,1,{key:'1'},1),e=>e.status===409);await assert.rejects(L.setRoom(db,1,{revision:1,aktiv:false,teams_url:TEAMS},1),e=>e.status===409);await assert.rejects(L.currentTop(db,1,2,1),e=>e.status===409);
 const s=await T.stand(db,1),rows=Object.entries(s.teilnahme.daten).map(([key,d])=>({key,...d}));rows[0].teilnahme='abwesend';rows[0].anwesende_eigentuemer=[];await T.speichern(db,1,{revision:s.teilnahme.revision,basis_hash:s.register.basis_hash,teilnehmer:rows},1);
 await assert.rejects(L.vote(db,1,r.id,{key:'1',stimme:'ja',version:0},{anfrage:j.token}),e=>e.status===409);await assert.rejects(L.finishVote(db,1,r.id,{},1),e=>e.status===409);assert.equal((await L.finishVote(db,1,r.id,{abbrechen:true},1)).status,'abgebrochen');
 assert.equal(await db.get('SELECT * FROM etv_abstimmungen WHERE top_id=1'),undefined);
});
test('Freigabe verhindert doppelte digitale Geräte und setzt voraus, dass eine wirksame Teilnahme erfasst ist',async t=>{
 const db=await fixture(t),first=await joined(db),r=await L.room(db,1),second=await L.join(db,1,{raum_token:r.raum_token,name:'Anderes Gerät',kanal:'online'});
 await assert.rejects(L.approve(db,1,{anfrage_id:second.id,gruppen:['1']},1),e=>e.status===409);await L.revoke(db,1,{key:'1'},1);await L.approve(db,1,{anfrage_id:second.id,gruppen:['1']},1);const round=await open(db);
 await assert.rejects(L.vote(db,1,round.id,{key:'1',stimme:'ja',version:0},{anfrage:first.token}),e=>e.status===403);await L.vote(db,1,round.id,{key:'1',stimme:'ja',version:0},{anfrage:second.token});
});
test('TOP-bezogener Stimmrechtsausschluss sperrt digitale und manuelle Stimmen; MEA werden exakt gewichtet',async t=>{
 const db=await fixture(t);await A.saveConfig(db,1,{revision:1,daten:{prinzip:'mea',geprueft:true,grundlage:'Test-GO'}});const j=await joined(db),r=await open(db,[{key:'4',grund:'Testausschluss dieses TOPs'}]);
 await L.vote(db,1,r.id,{key:'1',stimme:'ja',version:0},{anfrage:j.token});await L.vote(db,1,r.id,{key:'2:3',stimme:'nein',version:0},{user:1});await assert.rejects(L.vote(db,1,r.id,{key:'4',stimme:'ja',version:0},{user:1}),e=>e.status===403);
 const end=await L.finishVote(db,1,r.id,{},1);assert.equal(end.ergebnis.summen.ja,'3/5');assert.equal(end.ergebnis.summen.nein,'1/4');assert.equal(end.ergebnis.summen.ausgeschlossen,'3/20');
});
test('Kein Öffnen vor Versammlungsstart; geschlossene oder abgelaufene Zugänge bleiben gesperrt und Erneuerung widerruft alte Sitzungen',async t=>{
 const db=await fixture(t,false);await assert.rejects(open(db),/Versammlung starten/);const j=await joined(db);await db.run("UPDATE etv_live SET ablauf_am='2000-01-01'");await assert.rejects(L.guestState(db,1,j.token),e=>e.status===410);
 await L.setRoom(db,1,{revision:1,aktiv:true,teams_url:TEAMS},1);await assert.rejects(L.guestState(db,1,j.token),e=>e.status===403);
 for(const url of ['javascript:alert(1)','https://teams.live.com.evil.test/meet/1','https://evil.test/','https://user:pass@teams.live.com/meet/1'])assert.throws(()=>L.teams(url));
});
test('Geschlossene Live-Auswertung kann nicht über die alte Erfassungsroute überschrieben werden',async t=>{
 const db=await fixture(t),r=await open(db);await L.vote(db,1,r.id,{key:'1',stimme:'ja',version:0},{user:1});await L.finishVote(db,1,r.id,{},1);await assert.rejects(A.auszaehlen(db,1,1,{},1,true),e=>e.status===409);
});

test('HTTP-Zugänge: Eigentümersitzung erhält keine Verwaltungsrechte; fremder Ursprung und Leser-Schreibzugriff werden abgewiesen',async t=>{
 const db=await fixture(t),auth=require('../lib/auth'),{baueApp}=require('../lib/appFactory'),server=baueApp(db,{etvOrigin:'http://127.0.0.1'}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,admin=await auth.sitzungErstellen(db,1),reader=await auth.sitzungErstellen(db,2),req=(path,method='GET',body,cookie='',origin=base)=>fetch(base+path,{method,headers:{cookie,origin,'content-type':'application/json'},body:body?JSON.stringify(body):undefined}),staff='/api/versammlungen/1/live';
 assert.equal((await req(staff)).status,401);assert.equal((await req(staff+'/raum','PUT',{revision:1,aktiv:false,teams_url:TEAMS},auth.COOKIE_NAME+'='+reader)).status,403);
 const room=await L.room(db,1),joined=await req('/api/etv-teilnahme/1/anfragen','POST',{raum_token:room.raum_token,name:'HTTP-Gast',kanal:'online'}),cookie=joined.headers.get('set-cookie').split(';')[0];assert.equal(joined.status,200);assert.match(joined.headers.get('set-cookie'),/HttpOnly/);
 const pending=await(await req('/api/etv-teilnahme/1/stand','GET',null,cookie)).json();assert.equal(pending.tops,undefined);assert.equal((await req(staff,'GET',null,cookie)).status,401);
 const request=await db.get("SELECT id FROM etv_live_anfragen WHERE name='HTTP-Gast'");await L.approve(db,1,{anfrage_id:request.id,gruppen:['1']},1);const round=await open(db);
 assert.equal((await req('/api/etv-teilnahme/1/runden/'+round.id+'/stimme','POST',{key:'1',stimme:'ja',version:0},cookie,'https://fremd.test')).status,403);
 assert.equal((await req('/api/etv-teilnahme/1/runden/'+round.id+'/stimme','POST',{key:'1',stimme:'ja',version:0},cookie)).status,200);
 const qr=await req(staff+'/qr.png','GET',null,auth.COOKIE_NAME+'='+admin);assert.equal(qr.status,200);assert.match(qr.headers.get('content-type'),/image\/png/);assert.ok((await qr.arrayBuffer()).byteLength>500);
 const publicPage=await req('/teilnahme.html');assert.equal(publicPage.status,200);assert.match(await publicPage.text(),/etv-teilnahme.js/);
});

test('Geänderte Zugangszuordnung entfernt alte Stimmrechte statt sie unbemerkt zu behalten',async t=>{
 const db=await fixture(t),j=await joined(db);await L.approve(db,1,{anfrage_id:j.id,gruppen:['1','2:3']},1);await L.approve(db,1,{anfrage_id:j.id,gruppen:['2:3']},1);const rows=await db.all('SELECT * FROM etv_live_gruppen WHERE versammlung_id=1');assert.equal(rows.find(x=>x.gruppen_key==='1').modus,'manuell');assert.equal(rows.find(x=>x.gruppen_key==='1').anfrage_id,null);assert.equal(rows.find(x=>x.gruppen_key==='2:3').anfrage_id,j.id);
 await db.run("UPDATE etv_live SET ablauf_am='2000-01-01'");assert.equal((await L.privateState(db,1,'https://curaaed.test')).raum.aktiv,false);
});

test('Nur zugeordnete Versammlungsleitung und Administration dürfen Freigaben und manuelle Stimmen steuern',async t=>{
 const db=await fixture(t);await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(3,'anderer','Andere Mitarbeitende','x','mitarbeiter');");
 await assert.rejects(L.setRoom(db,1,{revision:1,aktiv:false,teams_url:TEAMS},3),e=>e.status===403);assert.equal((await L.privateState(db,1,'https://curaaed.test',3)).darf_leiten,false);
 const r=await open(db);await assert.rejects(L.vote(db,1,r.id,{key:'1',stimme:'ja',version:0},{user:3}),e=>e.status===403);await assert.rejects(L.finishVote(db,1,r.id,{},3),e=>e.status===403);
});
