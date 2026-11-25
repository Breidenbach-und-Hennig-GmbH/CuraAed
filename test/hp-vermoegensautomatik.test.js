'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../db'),svc=require('../services/hpVermoegensautomatik');
const zip=require('../lib/xlsxVorlage').entpacken;
const felder=require('../lib/vermoegensstatusFelder.json').flatMap(g=>g.felder);
const quellId='automatik-testquelle';
function stand(nummer=7001){
 const werte=Object.fromEntries(felder.filter(f=>f[2]!=='konto'&&!['hp_giro','hp_spar','hp_ruecklage','giro_anfang'].includes(f[0])).map(([k,,typ])=>[k,typ==='optional'?null:0]));Object.assign(werte,{hausgeld:10,bewirtschaftung:9,eigentuemer_guthaben:1.01});
 const quellen=['abrechnung','konten','abschluss','vermoegen'].map((typ,i)=>({typ,name:typ+'.json',sha256:String(i+1).repeat(64)}));
 const nachweise=Object.fromEntries(felder.map(([key])=>[key,{sha256:quellen[3].sha256,position:'Expliziter HP-Quellwert: '+key}]));
 return {format:'curaaed-hp-vermoegensstand-v1',verbindung_id:quellId,datenbank:'TESTHP',objektnummer:nummer,jahr:2025,laufnummer:42,stand_am:'2026-03-17T10:00:00.000Z',zeitraum:{von:'2025-01-01',bis:'2025-12-31'},abschluss:{bestaetigt:true,am:'2026-03-17T09:00:00.000Z',sha256:quellen[2].sha256,position:'Freigabe des finalen Abrechnungslaufs'},kontorollen:{giro_konto:[8100],spar_konto:[8160],ruecklage_konto:[8600]},werte,nachweise,quellen,konten:[{konto:8100,art:'B',bezeichnung:'Giro',saldo_cents:1140,eb_cents:40},{konto:8160,art:'B',bezeichnung:'Sparen',saldo_cents:2000,eb_cents:2000},{konto:8600,art:'S',bezeichnung:'Rücklage',saldo_cents:-3000}]};
}
async function setup(t){const db=await openDatabase(':memory:');t.after(()=>db.close());const u=await db.run("INSERT INTO benutzer(benutzername,name,rolle,passwort_hash) VALUES('tester','Test','admin','test')");await db.run('INSERT INTO hp_adress_verbindungen(id,benutzer_id,name,datenbank,token_hash,ablauf_ms) VALUES(?,?,?,?,?,?)',[quellId,u.lastID,'Testquelle','TESTHP','test',Date.now()+100000]);const ids=[];for(const nr of [7001,7002]){const r=await db.run('INSERT INTO objekte(nummer,bezeichnung) VALUES(?,?)',['HP-intern-'+nr,'Testgemeinschaft '+nr]);ids.push(r.lastID);await db.run('INSERT INTO hp_objekt_zuordnung(verbindung_id,hp_objnr,objekt_id) VALUES(?,?,?)',[quellId,nr,r.lastID]);}return {db,ids,user:u.lastID};}
test('Vollständige HP-Stände erzeugen pro Objekt Excel, auch ohne lokale Buchungen; wiederholte Übergabe bleibt identisch',async t=>{
 const {db,user}=await setup(t);const r=await svc.stapel(db,[stand(),stand(7002)],user);assert.deepEqual(r.ergebnisse.map(x=>x.status),['erstellt','erstellt']);
 const f=await svc.datei(db,r.ergebnisse[0].id),xml=zip(f.bytes);assert.match(f.name,/7001-2025-V1.xlsx/);assert.match(xml['xl/worksheets/sheet1.xml'].toString(),/r="B40"[^>]*><f>[^<]+<\/f><v>0<\/v>/);assert.match(xml['xl/worksheets/sheet4.xml'].toString(),/Kein CuraAed-Buchungsabgleich/);assert.doesNotMatch(xml['xl/worksheets/sheet4.xml'].toString(),/<c r="E6"[^>]*><f>/);
 const row=await db.get('SELECT bericht FROM hp_vermoegensstaende WHERE id=?',[r.ergebnisse[0].id]),b=JSON.parse(row.bericht);assert.equal(b.berechnung.vorjahrsrest,.4);assert.equal(b.berechnung.verteilungsdifferenz,.01);assert.equal(b.berechnung.vergleiche[0].curaaed,null);
 const again=stand();again.konten.reverse();again.quellen.reverse();const a=await svc.uebernehmen(db,again,user);assert.equal(a.unveraendert,true);assert.equal(a.id,r.ergebnisse[0].id);assert.equal((await db.get('SELECT COUNT(*) n FROM hp_vermoegensstaende')).n,2);assert.equal((await db.get('SELECT COUNT(*) n FROM fibu_buchungen')).n,0);assert.equal((await db.get('SELECT COUNT(*) n FROM vermoegensstatus')).n,0);
});
test('Fehlende Freigabe, fehlende Nachweise und Differenzen bleiben sichtbar; fertige frühere Dateien bleiben erhalten',async t=>{
 const {db,user}=await setup(t),ok=await svc.uebernehmen(db,stand(),user);
 const p=stand();p.stand_am='2026-03-18T10:00:00.000Z';p.werte.bewegliches_vermoegen=null;const missing=await svc.uebernehmen(db,p,user);assert.equal(missing.status,'unvollstaendig');assert.match(missing.meldungen.join(' '),/Bewegliches/);await assert.rejects(svc.datei(db,missing.id),/Kein fertiger/);
 const l=await svc.liste(db,2025);assert.equal(l.objekte[0].excel_id,null);assert.equal(l.objekte[0].vorherige_excel_id,ok.id);assert.equal(l.live_abholung,false);
 const open=stand(7002);open.abschluss.bestaetigt=false;assert.equal((await svc.uebernehmen(db,open,user)).status,'nicht_abgeschlossen');
 const proof=stand();delete proof.nachweise.handkassen;assert.equal(svc.vorbereiten(proof).status,'unvollstaendig');
 const diff=stand();diff.werte.bewirtschaftung=8;assert.equal(svc.vorbereiten(diff).status,'abweichung');
 assert.equal((await svc.datei(db,ok.id)).bytes.length>10000,true);
});
test('Quellenbindung, Zeitraum und Konten werden geprüft; aus unbekannten HP-Nummern entstehen keine Objekte',async t=>{
 const {db,user}=await setup(t);for(const change of [{verbindung_id:'fremde-quelle'},{datenbank:'ANDERE'},{objektnummer:9999},{jahr:2024},{zeitraum:{von:'2025-01-01',bis:'2025-06-30'}}])await assert.rejects(svc.uebernehmen(db,{...stand(),...change},user));
 const k=stand();k.konten[0].art='S';assert.throws(()=>svc.vorbereiten(k),/kein Bankkonto/);const d=stand();d.konten.push(d.konten[0]);assert.throws(()=>svc.vorbereiten(d),/Doppelte/);const wrong=stand();wrong.werte.hp_giro=999;assert.throws(()=>svc.vorbereiten(wrong),/widerspricht/);assert.equal((await db.get('SELECT COUNT(*) n FROM objekte')).n,2);
});
test('Mehrere Bankkonten und ausdrücklich nicht vorhandene Spar-/Rücklagenkonten brauchen keine erfundenen Nullen',()=>{
 const p=stand();p.konten[0].saldo_cents=1000;p.konten.push({konto:8101,art:'B',bezeichnung:'Zweites Giro',saldo_cents:140,eb_cents:40});p.konten[0].eb_cents=0;p.kontorollen.giro_konto=[8101,8100];assert.equal(svc.vorbereiten(p).status,'erstellt');assert.equal(svc.vorbereiten(p).w.hp_giro,11.4);
 const none=stand();none.kontorollen.spar_konto=[];none.konten=none.konten.filter(k=>k.konto!==8160);none.konten[0].saldo_cents=3140;const r=svc.vorbereiten(none);assert.equal(r.status,'erstellt');assert.equal(r.w.hp_spar,0);assert.equal(r.w.spar_konto,null);assert.equal(r.berechnung.fehlend.length,0);
 const unassigned=stand();unassigned.konten.push({konto:8110,art:'B',bezeichnung:'Unbekannte Bankrolle',saldo_cents:10,eb_cents:0});assert.equal(svc.vorbereiten(unassigned).status,'unvollstaendig');
});
test('Ältere und widersprüchliche Stände verdrängen keine fertige Excel; Paket enthält nur aktuelle fertige Objekte',async t=>{
 const {db,user}=await setup(t);const a=await svc.uebernehmen(db,stand(),user);const p=stand();p.stand_am='2026-03-16T10:00:00.000Z';p.abschluss.am='2026-03-16T09:00:00.000Z';assert.equal((await svc.uebernehmen(db,p,user)).status,'veraltet');const c=stand();c.werte.bewegliches_vermoegen=2;assert.equal((await svc.uebernehmen(db,c,user)).status,'konflikt');await svc.uebernehmen(db,stand(7002),user);
 const files=zip(await svc.paket(db,2025));assert.deepEqual(Object.keys(files),['Vermoegensstatus-7002-2025-V1.xlsx']);assert.equal((await svc.datei(db,a.id)).bytes.length>0,true);
});
test('HTTP: Leser sehen Status und Excel, nur Administratoren dürfen neue HP-Exportstände übergeben',async t=>{
 const {db}=await setup(t),users=require('../services/benutzer');for(const [name,rolle]of [['admin','admin'],['bearbeiter','mitarbeiter'],['leser','leser']])await users.anlegen(db,{benutzername:name,name,rolle,passwort:'Automatik-Test-2026'});
 const app=require('../lib/appFactory').baueApp(db,{uploadDir:require('os').tmpdir()}),server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}/api/vermoegensstatus/hp-staende`;
 const login=async name=>{const r=await fetch(base.replace('/vermoegensstatus/hp-staende','/auth/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({benutzername:name,passwort:'Automatik-Test-2026'})});return r.headers.get('set-cookie').split(';')[0];};
 assert.equal((await fetch(base+'?jahr=2025')).status,401);const admin=await login('admin'),leser=await login('leser'),bearbeiter=await login('bearbeiter');
 for(const cookie of [leser,bearbeiter])assert.equal((await fetch(base,{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({staende:[stand()]})})).status,403);
 const r=await fetch(base,{method:'POST',headers:{cookie:admin,'Content-Type':'application/json'},body:JSON.stringify({staende:[stand()]})});assert.equal(r.status,200);const result=await r.json();assert.equal(result.ergebnisse[0].status,'erstellt');assert.equal((await fetch(base+'/excel/'+result.ergebnisse[0].id,{headers:{cookie:leser}})).status,200);
 assert.equal((await fetch(base+'?jahr=2025',{headers:{cookie:leser}})).status,200);assert.equal((await fetch(base+'/paket?jahr=2025',{headers:{cookie:leser}})).status,200);
});
test('Gleichzeitige Wiederholungen erzeugen genau eine unveränderliche Excel-Version',async t=>{
 const {db,user}=await setup(t);const results=await Promise.all([svc.uebernehmen(db,stand(),user),svc.uebernehmen(db,stand(),user)]);assert.equal(results[0].id,results[1].id);assert.equal(results.filter(r=>r.unveraendert).length,1);assert.equal((await db.get('SELECT COUNT(*) n FROM hp_vermoegensstaende')).n,1);
});
