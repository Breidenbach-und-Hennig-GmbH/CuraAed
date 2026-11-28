'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {openDatabase}=require('../db'),registry=require('../services/kundenverwaltung'),activation=require('../services/kundenAktivierung');
const origin='https://curaaed.example',password='Sicheres-Kundenpasswort-2026';
function exportData(portal){return{version:1,portal,vollstaendig:true,erwartete_anzahl:1,users:[{id:42,name:'Testkunde',email:'kunde@example.test',persons:[{id:88,hp_id:500}],persons_count:1,is_admin:false,is_team:false,is_sync:false,is_bots4you:false}]};}
async function fixture(t){
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 await db.run("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'admin-a','Firma A','synthetic','admin'),(2,'admin-b','Firma B','synthetic','admin')");
 await db.run("INSERT INTO firmenbriefkoepfe(id,name,daten) VALUES(1,'Firma A','{}'),(2,'Firma B','{}')");
 for(const n of [1,2]){
  const direct='direct'+n,source='source'+n;
  await db.run('INSERT INTO hp_adress_verbindungen VALUES(?,?,?,?,?,0,0,NULL)',[direct,n,'HP','HPDATA'+n,'synthetic']);
  await db.run('INSERT INTO hp_dms_quellen VALUES(?,?,?,?)',[source,n,'portal'+n,direct]);
  await require('../services/kundenFirmen').binden(db,n,source,n);
  await db.run('INSERT INTO objekte(id,bezeichnung,nummer) VALUES(?,?,?)',[n,'Objekt '+n,'HP-technical-'+n]);
  await db.run('INSERT INTO einheiten(id,objekt_id,bezeichnung,nummer) VALUES(?,?,?,?)',[n,n,'Wohnung '+n,'HP-technical-unit-'+n]);
  await db.run("INSERT INTO hp_objekt_zuordnung(verbindung_id,hp_objnr,objekt_id,verwaltungsstatus) VALUES(?,?,?,'aktiv')",[direct,4000+n,n]);
  await db.run('INSERT INTO hp_einheit_zuordnung(verbindung_id,hp_objnr,objekt_id,hp_whgnr,einheit_id) VALUES(?,?,?,?,?)',[direct,4000+n,n,7+n,n]);
  await db.run('INSERT INTO adressen(id,nummer,nachname) VALUES(?,?,?)',[n,'Adresse '+n,'Kunde '+n]);
  await db.run("INSERT INTO hp_adress_zuordnung(verbindung_id,hp_nummer,adresse_id,basis,status) VALUES(?,500,?,'{}','synchron')",[direct,n]);
  await db.run("INSERT INTO rollen_zuordnungen(adresse_id,einheit_id,rolle) VALUES(?,?,'eigentuemer')",[n,n]);
  const data=exportData('portal'+n),p=await registry.baue(db).vorschau(n,source,data);await registry.baue(db).uebernehmen(n,source,data,p.pruefwert);
 }
 let ms=Date.UTC(2026,10,28,9);
 const svc=activation.baue(db,{origin,now:()=>ms}),kontoA=(await db.get("SELECT id FROM kunden_konten WHERE quelle_id='source1'")).id,kontoB=(await db.get("SELECT id FROM kunden_konten WHERE quelle_id='source2'")).id;
 const link=async(id=kontoA,owner=1)=>{const p=await svc.vorschau(owner,id),r=await svc.erstellen(owner,id,p.pruefwert);return{...r,token:new URLSearchParams(new URL(r.link).hash.slice(1)).get('aktivieren')};};
 return{db,svc,kontoA,kontoB,link,advance:n=>{ms+=n;}};
}
test('Aktivierung: Einmal-Link nur gehasht gespeichert, eigenes Passwort, eigene Sitzungen und normale HP-Nummern',async t=>{
 const f=await fixture(t),l=await f.link();
 assert.equal(new URL(l.link).searchParams.get('token'),null);
 assert.equal(l.wohnungen[0].objekt_nummer,4001);assert.equal(l.wohnungen[0].nummer,8);
 assert.doesNotMatch(JSON.stringify(await f.db.all('SELECT * FROM kunden_aktivierungen')),new RegExp(l.token));
 const a=await f.svc.aktivieren(l.token,password);
 assert.equal(a.daten.firma.id,1);assert.equal((await f.svc.sitzung(a.token)).wohnungen.length,1);
 assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM sitzungen')).n,0);
 assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM benutzer')).n,2);
 const z=await f.db.get('SELECT passwort_hash FROM kunden_zugaenge');assert.notEqual(z.passwort_hash,password);
 assert.doesNotMatch(JSON.stringify(await f.db.all('SELECT * FROM kunden_sitzungen')),new RegExp(a.token));
 await assert.rejects(f.svc.aktivieren(l.token,password),e=>e.status===409);
 const login=await f.svc.anmelden(1,'KUNDE@example.test',password);assert.equal(login.daten.firma.id,1);
 await f.svc.abmelden(login.token);await assert.rejects(f.svc.sitzung(login.token),e=>e.status===401);
});
test('Einmalige Aktivierung bleibt auch bei zwei gleichzeitigen Anfragen einmalig',async t=>{
 const f=await fixture(t),l=await f.link();
 const results=await Promise.allSettled([f.svc.aktivieren(l.token,password),f.svc.aktivieren(l.token,password)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
 assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM kunden_sitzungen')).n,1);
});
test('Neue Links widerrufen ältere; abgelaufene Links und zu kurze oder abgeschnittene Passwörter bleiben gesperrt',async t=>{
 const f=await fixture(t),old=await f.link(),current=await f.link();
 await assert.rejects(f.svc.aktivieren(old.token,password),e=>e.status===409);
 await assert.rejects(f.svc.aktivieren(current.token,'kurz'),e=>e.status===400);
 await assert.rejects(f.svc.aktivieren(current.token,'ü'.repeat(40)),e=>e.status===400);
 f.advance(8*86400000);await assert.rejects(f.svc.aktivieren(current.token,password),e=>e.status===409);
 assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM kunden_zugaenge')).n,0);
});
test('Firmenkennungen trennen gleiche E-Mails und externe IDs; fremde Objektrollen werden nie übernommen',async t=>{
 const f=await fixture(t);await f.db.run("INSERT INTO rollen_zuordnungen(adresse_id,einheit_id,rolle) VALUES(1,2,'eigentuemer')");
 const a=await f.link();assert.deepEqual(a.wohnungen.map(w=>w.objekt_nummer),[4001]);
 await assert.rejects(f.svc.vorschau(1,f.kontoB),e=>e.status===404);
 await f.svc.aktivieren(a.token,password);
 const b=await f.link(f.kontoB,2);await f.svc.aktivieren(b.token,'Anderes-Kundenpasswort-2026');
 await assert.rejects(f.svc.anmelden(2,'kunde@example.test',password),e=>e.status===401);
 const login=await f.svc.anmelden(1,'kunde@example.test',password);assert.deepEqual(login.daten.objekte.map(o=>o.nummer),[4001]);
});
test('Geänderte Konten, abgelaufene Rollen und geschlossene Objekte sperren Links und bestehende Sitzungen sofort',async t=>{
 const f=await fixture(t),l=await f.link();
 await f.db.run('UPDATE kunden_konten SET revision=revision+1 WHERE id=?',[f.kontoA]);
 await assert.rejects(f.svc.aktivieren(l.token,password),e=>e.status===409);
 const fresh=await f.link(),a=await f.svc.aktivieren(fresh.token,password);
 await f.db.run("UPDATE rollen_zuordnungen SET gueltig_bis='2020-01-01' WHERE adresse_id=1");
 await assert.rejects(f.svc.sitzung(a.token),e=>e.status===401);
 await assert.rejects(f.svc.anmelden(1,'kunde@example.test',password),e=>e.status===401);
 await f.db.run('UPDATE rollen_zuordnungen SET gueltig_bis=NULL WHERE adresse_id=1');
 await f.db.run("UPDATE hp_objekt_zuordnung SET verwaltungsstatus='beendet' WHERE objekt_id=1");
 await assert.rejects(f.svc.vorschau(1,f.kontoA),e=>e.status===409);
});
test('Aktivierung scheitert bei veralteten Adress-/Wohnungsbezügen und bei fremdem Firmenbestand',async t=>{
 const f=await fixture(t),p=await f.svc.vorschau(1,f.kontoA);
 await f.db.run('DELETE FROM hp_einheit_zuordnung WHERE einheit_id=1');
 await assert.rejects(f.svc.erstellen(1,f.kontoA,p.pruefwert),e=>e.status===409);
 await f.db.run("UPDATE kunden_konten SET status='gesperrt' WHERE id=?",[f.kontoB]);
 await assert.rejects(f.svc.vorschau(2,f.kontoB),e=>e.status===409);
 const bad=activation.baue(f.db,{origin:'http://example.test'});
 await assert.rejects(bad.erstellen(1,f.kontoA,p.pruefwert),e=>e.status===503);
});
test('Kundenportal-API: CSRF, sichere eigene Cookies, keine Mitarbeiterrechte und kein Archivzugriff',async t=>{
 const f=await fixture(t),dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-portal-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const app=require('../lib/appFactory').baueApp(f.db,{uploadDir:dir,hausperfekt:{publicUrl:origin}}),server=app.listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));t.after(async()=>{server.closeIdleConnections();await new Promise(r=>server.close(r));});
 const base='http://127.0.0.1:'+server.address().port;
 const admin='hv_session='+await require('../lib/auth').sitzungErstellen(f.db,1);
 const p=await fetch(base+'/api/kunden/'+f.kontoA+'/zuordnung',{headers:{Cookie:admin}});assert.equal(p.status,200);
 const preview=await p.json();
 const issued=await fetch(base+'/api/kunden/'+f.kontoA+'/aktivierung',{method:'POST',headers:{Cookie:admin,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({pruefwert:preview.pruefwert})});
 assert.equal(issued.status,200);const invite=await issued.json(),token=new URLSearchParams(new URL(invite.link).hash.slice(1)).get('aktivieren');
 const post=(body,requestOrigin=origin)=>fetch(base+'/api/kundenportal/aktivieren',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post({token,firma_id:1,passwort:password},'https://evil.test')).status,403);
 assert.equal((await post({token,firma_id:2,passwort:password})).status,409);
 const a=await post({token,firma_id:1,passwort:password});assert.equal(a.status,200);
 const cookie=a.headers.get('set-cookie');assert.match(cookie,/^ca_kunde=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Path=\/api\/kundenportal/);
 const headers={Cookie:cookie.split(';')[0]};assert.equal((await fetch(base+'/api/kundenportal/meine-daten',{headers})).status,200);
 assert.equal((await fetch(base+'/api/adressen',{headers})).status,401);
 assert.equal((await fetch(base+'/api/kunden/quellen',{headers})).status,401);
 assert.equal((await fetch(base+'/api/kundenportal/archiv',{headers})).status,401);
 const html=await fetch(base+'/kundenportal');assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(html.headers.get('referrer-policy'),'no-referrer');
 const logout=await fetch(base+'/api/kundenportal/abmelden',{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(logout.status,200);
 assert.equal((await fetch(base+'/api/kundenportal/meine-daten',{headers})).status,401);
});
