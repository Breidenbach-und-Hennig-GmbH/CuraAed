'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../db');
const A=require('../services/hpAdressSync');
const I=require('../services/hpObjektImport');
const F=require('../lib/hpImportFormat');
function sample(art,werte={},objnr=4010){return {art,objnr,werte:{...Object.fromEntries(F.datasets[art].fields.map(f=>[f,null])),...werte}};}
const records=()=>[
 sample('objekt',{ObjNr:'4010',Suchbegr:'Aktuelles Testobjekt',ObjTyp:'WEG',ObjTypText:'Wohnungseigentümergemeinschaft',ZustVerkauf:'0',ZustVerm:'1',ObjStr:'Teststraße 1'}),
 sample('gebaeude',{IndGeb:'1',BezGeb:'Haus A'}),
 sample('jahr',{FIBJ_BJ:'2025',FIBJ_BjVon:'739252',FIBJ_BjBis:'739616'}),
 sample('einheit',{WhgNr:'1',SuchBegr:'Wohnung 1',Whg_JN:'1',GewEinhJN:'0',WG_m2Fl:'73.5000',MEA:'123.45678901234567'}),
 sample('konto',{PKtoNr:'10001',WhgNr:'1',AdrNr:'65937',PKtoName:'HP-Testkonto',RefKtoNr:'12345',AK_Aktenzeichen:'TEST-1'}),
 sample('schluessel',{BJ:'2025',VerteilerSchl:'300',SchlTxt:'MEA',AbrObjAntSum:'1000.000000000000001',Typ_PW:'0',TabArt:'0'}),
 sample('einheitsanteil',{Buchungsjahr:'2025',WhgNr:'1',VSchl:'300',WhgAnteile:'123.45678901234567'}),
 sample('kontenanteil',{BJ:'2025',PKtoNr:'10001',VSchl:'300',AntPers:'12.345678901234567'}),
 sample('personenwert',{BJ:'2025',PKtoNr:'10001',VSchl:'300',DatAnders:'0',Info:'Test',AnzPers:'2.5',AnzTag:'365'}),
 sample('personenjahr',{BJ:'2025',PKtoNr:'10001',VSchl:'300',DatAnders:'0',BJ_Ubergreif:'1'})
];
async function setup(t){const db=await openDatabase(':memory:');t.after(()=>db.close());await db.run("INSERT INTO benutzer(id,benutzername,passwort_hash,name,rolle) VALUES(1,'import-admin','x','Test','admin')");let time=Date.UTC(2026,10,9,12);const options={now:()=>time};const addr=A.service(db,options);const c=await addr.create(1,{name:'Testkunde',datenbank:'HPSERVSD',zustimmung:true,dauerhaft:true});const svc=I.service(db,options),p=await svc.create(1,{verbindung_id:c.id,zustimmung:true});const input={datenbank:'HPSERVSD',objnr:4010,quelle:'a'.repeat(64)};await svc.bindSource(p.id,p.token,input);await svc.status(p.id,p.token,{...input,fi_beendet:0});const scan=rs=>svc.scan(p.id,p.token,{...input,records:rs});const compare=rs=>svc.compare(p.id,p.token,{...input,fingerprints:rs.map(raw=>{const r=F.record(raw);return {art:r.art,key:r.key,hash:r.hash};})});const address=()=>addr.scan(c.id,c.token,{datenbank:'HPSERVSD',records:[{nummer:65937,anrede:'',vorname:'',name1:'Testkontakt',zusatz:'',strasse:'',land:'DE',plz:'',ort:''}]});return {db,svc,p,c,input,scan,compare,address,advance:ms=>{time+=ms;}};}

test('vollständiger aktueller Objektbaum wird idempotent mit exakten Jahresanteilen importiert',async t=>{
 const x=await setup(t);await x.address();const rs=records();const first=await x.scan(rs);assert.equal(first.neu,10);assert.equal(first.fehler,0);
 assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM objekte')).n,1);
 assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM personenkonten')).n,1);
 assert.equal((await x.db.get('SELECT anteil_dezimal FROM einheit_verteilung_jahre')).anteil_dezimal,'123.45678901234567');
 assert.equal((await x.db.get('SELECT jahresuebergreifend FROM personenkonto_verteilung_zeitwerte')).jahresuebergreifend,1);
 assert.equal((await x.db.get('SELECT anzahl_personen_dezimal FROM personenkonto_verteilung_zeitwerte')).anzahl_personen_dezimal,'2.5');
 assert.equal((await x.compare(rs)).benoetigt.length,0);const twice=await x.scan(rs);assert.equal(twice.neu,0);assert.equal(twice.geaendert,0);
 assert.deepEqual(await x.db.all('PRAGMA foreign_key_check'),[]);
});

test('beendete, fehlende und veraltete Statuswerte erlauben weder Objektanlage noch Kinderimport',async t=>{
 const x=await setup(t);const ended={...x.input,objnr:4020,fi_beendet:737424};assert.equal((await x.svc.status(x.p.id,x.p.token,ended)).erlaubt,false);
 await assert.rejects(x.svc.scan(x.p.id,x.p.token,{...ended,records:[sample('objekt',{ObjNr:'4020'})]}),/Verwaltungsstatus/);
 assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM objekte')).n,0);
 await x.svc.status(x.p.id,x.p.token,{...x.input,fi_beendet:null});await assert.rejects(x.scan([records()[0]]),/Verwaltungsstatus/);
 await x.svc.status(x.p.id,x.p.token,{...x.input,fi_beendet:0});await x.scan([records()[0]]);x.advance(60001);await assert.rejects(x.scan([records()[3]]),/Verwaltungsstatus/);
 await x.svc.status(x.p.id,x.p.token,{...x.input,fi_beendet:737424});assert.equal((await x.db.get('SELECT archiviert FROM objekte')).archiviert,1);
 assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM einheiten')).n,0);
});

test('fehlende Adresse stellt nur das Konto zurück; erneuter Lauf übernimmt nachgelieferte Abhängigkeit',async t=>{
 const x=await setup(t);let result=await x.scan(records());assert.equal(result.fehler,4);assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM personenkonten')).n,0);
 assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM einheiten')).n,1);await x.address();assert.ok((await x.compare([records()[4]])).benoetigt.length);
 result=await x.scan(records());assert.equal(result.fehler,0);assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM personenkonten')).n,1);assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM hp_import_fehler')).n,0);
});

test('nur geänderte Fingerabdrücke werden angefordert; lokale Änderungen bleiben erhalten und gleiche Felder werden Konflikt',async t=>{
 const x=await setup(t),root=records()[0];await x.scan([root]);const changed=structuredClone(root);changed.werte.ObjStr='HP-Straße 2';
 await x.db.run("UPDATE objekte SET bezeichnung='Lokal gewählter Name'");assert.equal((await x.compare([root])).benoetigt.length,0);
 assert.equal((await x.compare([changed])).benoetigt.length,1);assert.equal((await x.scan([changed])).geaendert,1);
 assert.deepEqual(await x.db.get('SELECT bezeichnung,strasse FROM objekte'),{bezeichnung:'Lokal gewählter Name',strasse:'HP-Straße 2'});
 await x.db.run("UPDATE objekte SET strasse='Lokale Straße'");changed.werte.ObjStr='HP-Straße 3';const conflict=await x.scan([changed]);assert.equal(conflict.konflikt,1);assert.equal((await x.db.get('SELECT strasse FROM objekte')).strasse,'Lokale Straße');
 assert.equal((await x.db.get('SELECT status FROM hp_import_datensaetze')).status,'konflikt');assert.equal((await x.compare([changed])).benoetigt.length,0);
});

test('separate Importtokens, Kundenbindung, Widerruf und Eigentümerrechte werden durchgesetzt',async t=>{
 const x=await setup(t);await assert.rejects(x.svc.status(x.c.id,x.c.token,{...x.input,fi_beendet:0}),e=>e.status===401);
 await assert.rejects(x.svc.status(x.p.id,x.p.token,{...x.input,datenbank:'ANDERER_KUNDE',fi_beendet:0}),e=>e.status===409);
 const renewed=await x.svc.create(1,{verbindung_id:x.c.id,zustimmung:true});await assert.rejects(x.scan([]),e=>e.status===401);
 assert.equal((await x.svc.status(renewed.id,renewed.token,{...x.input,fi_beendet:0})).erlaubt,true);
 await x.svc.disconnect(1,renewed.id);await assert.rejects(x.svc.status(renewed.id,renewed.token,{...x.input,fi_beendet:0}),e=>e.status===401);
});

test('ungültiger Datensatz rollt seine Zuordnung zurück, ohne den restlichen Import zu blockieren',async t=>{
 const x=await setup(t),root=records()[0],unit=records()[3];unit.werte.MEA='NaN';let result=await x.scan([root,unit]);assert.equal(result.neu,1);assert.equal(result.fehler,1);assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM hp_einheit_zuordnung')).n,0);
 assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM einheiten')).n,0);result=await x.scan([records()[3]]);assert.equal(result.neu,1);assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM hp_import_fehler')).n,0);
});
test('HP-Funktionen werden ohne erfundene Rollen mit Konten verknüpft; normale Kontenmasken lesen direkte Bezüge und Jahresanteile',async t=>{
 const x=await setup(t);await x.address();const rs=records();const f=sample('funktion',{lfdNrDatensatz:'55',PFKt:'001',WhgNr:'1',AdrNr:'65937',PKto:'10001',DatVon:'0',DatBis:'0',inaktiv:'0',MobileEnde:'0'});
 const imported=await x.scan([...rs.slice(0,4),f,...rs.slice(4)]);assert.equal(imported.fehler,0);assert.equal(imported.neu,11);
 const p=require('../services/personenkonten'),v=require('../services/verteiler');const k=await x.db.get('SELECT * FROM personenkonten');
 const detail=await p.holen(x.db,k.id);assert.equal(detail.name,'HP-Testkonto');assert.equal(detail.pfkt_code,'001');assert.equal(detail.offene_posten,null);
 assert.equal(detail.verteiler[0].anteil,'12.345678901234567');assert.equal(detail.verteiler[0].einheitsanteil,'123.45678901234567');
 assert.equal((await p.nachObjekt(x.db,k.objekt_id)).length,1);assert.equal((await p.nachEinheit(x.db,k.einheit_id)).length,1);
 assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM personenkonto_funktionen')).n,1);
 assert.deepEqual(await v.jahre(x.db,k.objekt_id),[2025]);const keys=await v.liste(x.db,k.objekt_id);assert.equal(keys[0].jahr,2025);
 const key=await v.holen(x.db,keys[0].id);assert.equal(key.anteile[0].anteil_dezimal,'123.45678901234567');assert.equal(key.naechste_seite,null);
 await assert.rejects(v.aktualisieren(x.db,keys[0].id,{gesamt:99}),e=>e.status===409);
 const noAddress=sample('konto',{PKtoNr:'90001',WhgNr:'0',AdrNr:'0',PKtoName:'Unzugeordnetes Konto',RefKtoNr:'0'});assert.equal((await x.scan([noAddress])).fehler,0);
 const detached=await x.db.get("SELECT id FROM personenkonten WHERE nummer='90001'");assert.equal((await p.holen(x.db,detached.id)).adresse,null);
});

test('Konfliktentscheidung prüft Stand und Eigentümer und schreibt ausschließlich den gewählten lokalen Datensatz',async t=>{
 const x=await setup(t),root=records()[0];await x.scan([root]);await x.db.run("UPDATE objekte SET strasse='Lokal'");root.werte.ObjStr='HP geändert';await x.scan([root]);
 let conflicts=await x.svc.conflicts(1);assert.equal(conflicts.length,1);assert.deepEqual(await x.svc.conflicts(999),[]);assert.equal(conflicts[0].felder.find(f=>f.feld==='strasse').lokal,'Lokal');
 const old=conflicts[0];await x.db.run("UPDATE objekte SET strasse='Nochmals lokal'");await assert.rejects(x.svc.resolve(1,{...old,entscheidung:'hp'}),e=>e.status===409);
 conflicts=await x.svc.conflicts(1);await x.svc.resolve(1,{...conflicts[0],entscheidung:'lokal'});assert.equal((await x.db.get('SELECT strasse FROM objekte')).strasse,'Nochmals lokal');assert.equal((await x.svc.conflicts(1)).length,0);
 root.werte.ObjStr='HP erneut geändert';await x.scan([root]);conflicts=await x.svc.conflicts(1);await x.svc.resolve(1,{...conflicts[0],entscheidung:'hp'});assert.equal((await x.db.get('SELECT strasse FROM objekte')).strasse,'HP erneut geändert');
});

test('Jahresstände überschreiben einander nicht; veränderte HP-Fingerabdrücke aktualisieren nur die passende Jahreszeile',async t=>{
 const x=await setup(t);await x.address();await x.scan(records());
 const nextYear=sample('jahr',{FIBJ_BJ:'2026'}),nextKey=structuredClone(records()[5]),nextShare=structuredClone(records()[6]);nextKey.werte.BJ='2026';nextShare.werte.Buchungsjahr='2026';nextShare.werte.WhgAnteile='99.000000000000001';
 assert.equal((await x.scan([nextYear,nextKey,nextShare])).fehler,0);
 const changed=structuredClone(nextShare);changed.werte.WhgAnteile='100.000000000000001';assert.equal((await x.compare([records()[6],nextShare,changed])).benoetigt.length,1);await x.scan([changed]);
 const shares=await x.db.all('SELECT jahr,anteil_dezimal FROM einheit_verteilung_jahre ORDER BY jahr');assert.deepEqual(shares,[{jahr:2025,anteil_dezimal:'123.45678901234567'},{jahr:2026,anteil_dezimal:'100.000000000000001'}]);
});
test('HP-Reaktivierung hebt nur die automatische Archivierung auf; manuelle Archivierung bleibt bestehen',async t=>{
 const x=await setup(t);await x.scan([records()[0]]);const o=await x.db.get('SELECT id FROM objekte'),objects=require('../services/objekte');
 await x.svc.status(x.p.id,x.p.token,{...x.input,fi_beendet:737424});await assert.rejects(objects.setzeArchiviert(x.db,o.id,false),e=>e.status===409);
 await x.svc.status(x.p.id,x.p.token,{...x.input,fi_beendet:0});assert.equal((await x.db.get('SELECT archiviert FROM objekte')).archiviert,0);
 await objects.setzeArchiviert(x.db,o.id,true);await x.svc.status(x.p.id,x.p.token,{...x.input,fi_beendet:737424});await x.svc.status(x.p.id,x.p.token,{...x.input,fi_beendet:0});assert.equal((await x.db.get('SELECT archiviert FROM objekte')).archiviert,1);
});

test('Importgrenzen verhindern unbeschränkte Seiten; nach erneutem Service-Start bleiben Fingerabdrücke gültig',async t=>{
 const x=await setup(t),root=records()[0];await x.scan([root]);await assert.rejects(x.scan(Array(51).fill(root)),e=>e.status===400);await assert.rejects(x.svc.compare(x.p.id,x.p.token,{...x.input,fingerprints:Array(51).fill({})}),e=>e.status===400);
 assert.throws(()=>F.record({art:'__proto__',objnr:4010,werte:{}}),e=>e.status===400);
 const restarted=I.service(x.db,{now:()=>Date.UTC(2026,10,9,12)}),r=F.record(root);assert.equal((await restarted.compare(x.p.id,x.p.token,{...x.input,fingerprints:[{art:r.art,key:r.key,hash:r.hash}]})).benoetigt.length,0);
 await require('../db/hpImport').migrieren(x.db);assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM hp_import_datensaetze')).n,1);
});
test('Quellbindung bleibt bei Tokenrotation bestehen und Trennen der Kundenverbindung reaktiviert keine alte Importfreigabe',async t=>{
 const x=await setup(t);await x.scan([records()[0]]);await assert.rejects(x.svc.bindSource(x.p.id,x.p.token,{...x.input,quelle:'b'.repeat(64)}),e=>e.status===409);
 const address=A.service(x.db);await address.disconnect(1,x.c.id);await address.create(1,{name:'Testkunde',datenbank:'HPSERVSD',zustimmung:true,dauerhaft:true});
 await assert.rejects(x.svc.status(x.p.id,x.p.token,{...x.input,fi_beendet:0}),e=>e.status===401);
 const p=await x.svc.create(1,{verbindung_id:x.c.id,zustimmung:true});await assert.rejects(x.svc.bindSource(p.id,p.token,{...x.input,quelle:'b'.repeat(64)}),e=>e.status===409);
 await x.svc.bindSource(p.id,p.token,x.input);assert.equal((await x.db.get('SELECT COUNT(*) AS n FROM objekte')).n,1);
});
module.exports={sample,records};
