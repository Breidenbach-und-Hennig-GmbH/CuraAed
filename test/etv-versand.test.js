'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {openDatabase}=require('../db'),E=require('../services/einladungen'),V=require('../services/etv-versand');
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-einzelbriefe-')),db=await openDatabase(':memory:');t.after(async()=>{await db.close();await fs.rm(dir,{recursive:true,force:true});});
 await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'eins','Leitung','x','admin'),(2,'zwei','Team','x','mitarbeiter');INSERT INTO objekte(id,nummer,bezeichnung) VALUES(1,'1001','Testobjekt');INSERT INTO versammlungen(id,objekt_id,name,datum,uhrzeit,ort,leitung_id) VALUES(1,1,'ETV Test','2026-12-05','17:30','Testsaal',1);INSERT INTO versammlung_tops(id,versammlung_id,position,titel,art) VALUES(1,1,1,'Begrüßung','besprechung');INSERT INTO adressen(id,nummer,adresstyp,vorname,nachname,strasse,plz,ort,versand_standard,email) VALUES(1,'10001','person','Ada','Alpha','Weg 1','12345','Ort','email','ada@example.test'),(2,'10002','person','Beate','Beta','Weg 2','12345','Ort','post',NULL);INSERT INTO einheiten(id,objekt_id,nummer,bezeichnung,mea) VALUES(1,1,'1001-01','WE 1','1/2'),(2,1,'1001-02','WE 2','1/2');INSERT INTO rollen_zuordnungen(einheit_id,adresse_id,rolle) VALUES(1,1,'eigentuemer'),(2,1,'eigentuemer'),(2,2,'eigentuemer');");
 await db.run("INSERT INTO firmenbriefkoepfe(id,name,daten) VALUES(1,?,?)",["Testverwaltung",JSON.stringify({name:"Testverwaltung",anschrift:"Verwaltungsweg 1",telefon:"",email:"",website:"",fusszeile:""})]);
 const body=async()=>{const s=await E.stand(db,1);return{auftrag_id:'auftrag-test-123456',revision:s.revision,basis_hash:s.basis_hash,daten:{...s.daten,firma_id:1,top_weisungen:false},empfaenger_id:null};};
 return{db,dir,body,user:{id:1,rolle:'admin'}};
}
async function text(pdf){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(pdf),standardFontDataUrl:path.join(require.resolve('pdfjs-dist/package.json'),'../standard_fonts').split(path.sep).join('/')+'/'}),d=await task.promise;let out='';for(let i=1;i<=d.numPages;i++)out+=(await(await d.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');await task.destroy();return out;}
test('Jeder Eigentümer erhält eigene PDF, Adresse/Wohnungen/Objekt/ETV-Akte und seinen Versandweg; Wiederholung erzeugt keine Kopien',async t=>{
 const {db,dir,body,user}=await fixture(t),svc=V.baue(db,dir),b=await body(),r=await svc.erstellen(1,b,user);
 assert.equal(r.einladungen.length,2);assert.equal((await db.get('SELECT COUNT(*) n FROM dokumente')).n,2);
 const alpha=r.einladungen.find(e=>e.adresse_id===1),beta=r.einladungen.find(e=>e.adresse_id===2);
 assert.equal(alpha.email,'ada@example.test');assert.equal(alpha.post,0);assert.equal(beta.post,1);
 assert.equal(alpha.einheiten.length,2);assert.equal(beta.einheiten.length,1);
 const docs=await db.all('SELECT * FROM dokumente ORDER BY id');
 const a=await text(await fs.readFile(path.join(dir,docs[0].speicher_name))),btext=await text(await fs.readFile(path.join(dir,docs[1].speicher_name)));
 assert.match(a,/Ada Alpha/);assert.doesNotMatch(a,/Beate Beta/);assert.match(btext,/Beate Beta/);assert.doesNotMatch(btext,/Ada Alpha/);
 assert.equal((await db.get('SELECT COUNT(*) n FROM akte_dokumente')).n,2);assert.equal((await db.get('SELECT COUNT(*) n FROM etv_einladung_akten')).n,1);
 const repeated=await svc.erstellen(1,b,user);assert.equal(repeated.wiederverwendet,true);assert.equal((await db.get('SELECT COUNT(*) n FROM dokumente')).n,2);
 await assert.rejects(svc.erstellen(1,{...b,daten:{...b.daten,schluss:'anderer Text'}},user),e=>e.status===409);
 await assert.rejects(require('../services/archiv').loeschen(db,alpha.dokument_id),e=>e.status===409);
 const cases=require('../services/vorgaenge').baueVorgaenge(db);const record=await cases.detail(2,alpha.vorgang_id);assert.equal(record.archiv_dokumente.length,2);
});
test('Fehlgeschlagene Erstellung hinterlässt weder halbe Briefe noch Dateien',async t=>{
 const {db,dir,body,user}=await fixture(t);let count=0;
 const svc=V.baue(db,dir,{renderPdf:async()=>{if(++count===2)throw Error('PDF-Fehler');return Buffer.from('%PDF-Test');}});
 await assert.rejects(svc.erstellen(1,await body(),user),/PDF-Fehler/);assert.equal((await db.get('SELECT COUNT(*) n FROM dokumente')).n,0);assert.deepEqual(await fs.readdir(dir),[]);assert.equal((await E.stand(db,1)).revision,0);
});
test('E-Mail-Annahme, parallele Versuche und unklarer Ausgang führen nicht zu doppelter Übergabe',async t=>{
 const {db,dir,body,user}=await fixture(t);let sends=0,unclear=false;
 const m365={vorbereiten:async()=>({}),senden:async()=>{sends++;if(unclear)throw Error('Timeout');}};
 const svc=V.baue(db,dir,{m365}),r=await svc.erstellen(1,await body(),user),letter=r.einladungen.find(e=>e.email);
 const results=await Promise.allSettled([svc.email(1,letter.id,user),svc.email(1,letter.id,user)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(sends,1);
 assert.equal((await svc.liste(1)).find(r=>r.id===letter.id).email_status,'uebergeben');
 const b=await body();b.auftrag_id='auftrag-zwei-123456';const second=await svc.erstellen(1,b,user),latest=second.einladungen.find(r=>r.email&&r.id!==letter.id);
 unclear=true;await assert.rejects(svc.email(1,latest.id,user),/unklar/);await assert.rejects(svc.email(1,latest.id,user),e=>e.status===409);assert.equal(sends,2);
 assert.equal((await svc.liste(1)).find(r=>r.id===latest.id).email_status,'unklar');
});
test('Neue Versandwünsche/Quellen sperren alte E-Mails; Drucken zählt erst nach ausdrücklicher Bestätigung',async t=>{
 const {db,dir,body,user}=await fixture(t);let sends=0;const svc=V.baue(db,dir,{m365:{vorbereiten:async()=>({}),senden:async()=>sends++}});
 const r=await svc.erstellen(1,await body(),user),a=r.einladungen.find(r=>r.email),b=r.einladungen.find(r=>r.post);
 await db.run("UPDATE adressen SET versand_standard='post' WHERE id=1");await assert.rejects(svc.email(1,a.id,user),e=>e.status===409);assert.equal(sends,0);
 assert.equal(b.post_status,'offen');await svc.druckBestaetigen(1,b.id,user);assert.equal((await svc.liste(1)).find(r=>r.id===b.id).post_status,'druck_bestaetigt');
});

test('Versand-API trennt Rollen, Herkunft und Zustimmung; PDF-Erstellung versendet nichts',async t=>{
 const f=await fixture(t);
 await f.db.run("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(3,'leser','Leser','x','leser')");
 const auth=require('../lib/auth'),tokens=await Promise.all([1,2,3].map(id=>auth.sitzungErstellen(f.db,id)));
 const app=require('../lib/appFactory').baueApp(f.db,{uploadDir:f.dir,m365:{publicUrl:'https://curaaed.test'}});
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});t.after(()=>new Promise(r=>{server.closeIdleConnections();server.close(r);}));
 const root='http://127.0.0.1:'+server.address().port+'/api',url=root+'/versammlungen/1/einladungen',head=i=>({Cookie:'hv_session='+tokens[i],Origin:'https://curaaed.test','Content-Type':'application/json'});
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:head(2)})).status,403);
 assert.equal((await fetch(url,{method:'POST',headers:{...head(0),Origin:'https://fremd.test'},body:JSON.stringify(await f.body())})).status,403);
 const created=await fetch(url,{method:'POST',headers:head(0),body:JSON.stringify(await f.body())});assert.equal(created.status,200);const letters=(await created.json()).einladungen;
 assert.equal(letters.length,2);assert.ok(letters.every(l=>['offen','nicht_vorgesehen'].includes(l.email_status)));
 assert.equal((await fetch(url+'/'+letters[0].id+'/email',{method:'POST',headers:head(0),body:'{}'})).status,400);
 assert.equal((await fetch(root+'/m365/firmen/1',{method:'PUT',headers:head(1),body:JSON.stringify({revision:0,absender:'post@immo-hb.de',postweg:'drucker',drucker:''})})).status,403);
 assert.equal((await fetch(root+'/m365/firmen/1',{method:'PUT',headers:{...head(0),Origin:'https://fremd.test'},body:'{}'})).status,403);
 const configs=await fetch(root+'/m365/firmen',{headers:head(1)});assert.equal(configs.status,200);assert.equal(configs.headers.get('cache-control'),'no-store');assert.equal((await configs.json())[0].m365_verbunden,false);
 await assert.rejects(require('../services/versammlungen').loeschen(f.db,1),e=>e.status===409);
});

test('Einzeleinladung enthält den erzeugten Teams-Link; fehlende Freigabe verhindert eine unvollständige Online-Einladung',async t=>{
 const f=await fixture(t);
 await f.db.run("UPDATE versammlungen SET art='hybrid' WHERE id=1");
 await assert.rejects(E.vorbereiten(f.db,1,await f.body()),/Teams-Link/);
 const url='https://teams.microsoft.com/l/meetup-join/test-etv';
 await f.db.run("INSERT INTO etv_teams(versammlung_id,firma_id,external_id,meeting_id,join_url,organizer,status) VALUES(1,1,'test-external','meeting',?,'organizer','bereit')",[url]);
 const result=await V.baue(f.db,f.dir).erstellen(1,await f.body(),f.user);
 const doc=await f.db.get('SELECT * FROM dokumente WHERE id=?',[result.einladungen[0].dokument_id]);
 const contents=await text(await fs.readFile(path.join(f.dir,doc.speicher_name)));
 assert.match(contents,/Online-Teilnahme über Microsoft Teams/);assert.match(contents,/Hier klicken: An der Versammlung teilnehmen/);assert.ok(!contents.includes(url));
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=pdfjs.getDocument({data:new Uint8Array(await fs.readFile(path.join(f.dir,doc.speicher_name)))}),pdf=await task.promise;assert.ok((await (await pdf.getPage(1)).getAnnotations()).some(a=>a.url===url));await task.destroy();
});
