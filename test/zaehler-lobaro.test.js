'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db'),Z=require('../services/zaehler'),L=require('../services/lobaro');
const admin={id:1,rolle:'admin'},token='test-lobaro-token-not-a-real-credential';
async function fixture(t){const db=await openDatabase(':memory:');t.after(()=>db.close());await db.exec("INSERT INTO benutzer(id,benutzername,passwort_hash,name,rolle) VALUES(1,'admin','x','Testverwaltung','admin'),(2,'zweiter','x','Zweite Person','mitarbeiter');INSERT INTO objekte(id,nummer,bezeichnung,strasse,ort) VALUES(1,'4236','DAMIANSWEG 2','Damiansweg 2','Köln'),(2,'4242','Anderes Objekt','','');INSERT INTO einheiten(id,objekt_id,nummer,bezeichnung) VALUES(1,1,'4236-0001','Wohnung 1'),(2,2,'4242-0001','Andere Wohnung');");return db;}
const point=(extra={})=>({bezeichnung:'Hauptzähler',medium:'strom',art:'haupt',marktlokation:'12345678901',...extra});
const meter=(extra={})=>({nummer:'TEST-001',einheit:'kWh',eingebaut_am:'2026-01-01',lobaro_geraet:'4',wert_pfad:'data.stand',zeit_pfad:'time',einheit_pfad:'data.unit',...extra});
async function setup(t,fetch,options={}){const db=await fixture(t),p=await Z.punktSpeichern(db,1,null,point(),admin),z=await Z.geraetSpeichern(db,1,p.id,null,meter());const l=L.baue(db,{fetch,tokenKey:Buffer.alloc(32,7),...options});await l.speichern(1,{revision:0,token},admin);return{db,p,z,l};}
const record=(extra={})=>({id:206,createdAt:'2026-10-01T00:00:00Z',deviceId:4,time:'2026-10-01T00:00:00+02:00',data:{stand:'123,4500',unit:'kWh'},...extra});
const response=rows=>new Response(JSON.stringify({pagination:{limit:100,offset:0,total:rows.length},data:rows}),{headers:{'content-type':'application/json'}});
const range={von:'2026-10-01',bis:'2026-10-31'};

test('MaLo bleibt am Zählpunkt bei Gerätewechsel; beide Geräte und Messwerte bleiben erhalten',async t=>{
 const db=await fixture(t),p=await Z.punktSpeichern(db,1,null,point(),admin),z=await Z.geraetSpeichern(db,1,p.id,null,meter());
 await Z.messwert(db,1,z.id,{zeitpunkt:'2026-10-01T00:00:00+02:00',wert:'00123,4500',einheit:'kWh'},admin);
 await assert.rejects(Z.geraetSpeichern(db,1,p.id,null,meter({nummer:'NEU',lobaro_geraet:'5'})),/überschneidet/);
 await Z.geraetSpeichern(db,1,p.id,z.id,{...z,ausgebaut_am:'2026-10-15'});
 await Z.geraetSpeichern(db,1,p.id,null,meter({nummer:'NEU',eingebaut_am:'2026-10-15',lobaro_geraet:'5'}));
 const result=await Z.liste(db,1);assert.equal(result.punkte[0].marktlokation,'12345678901');assert.equal(result.punkte[0].zaehler.length,2);assert.equal((await Z.messwerte(db,1,z.id))[0].wert,'123.45');
});
test('MaLo, Wohnung, Medium, Einheiten und optimistische Sperre werden geprüft',async t=>{
 const db=await fixture(t),p=await Z.punktSpeichern(db,1,null,point(),admin);
 await assert.rejects(Z.punktSpeichern(db,2,null,point(),admin),/bereits/);
 await assert.rejects(Z.punktSpeichern(db,1,null,point({marktlokation:'123'}),admin),/elf Ziffern/);
 await assert.rejects(Z.punktSpeichern(db,1,null,point({medium:'warmwasser'}),admin),/Strom oder Gas/);
 await assert.rejects(Z.punktSpeichern(db,1,null,point({marktlokation:'',einheit_id:2}),admin),/Wohnung/);
 await assert.rejects(Z.punktSpeichern(db,1,p.id,{...p,revision:0},admin),/inzwischen/);
 await assert.rejects(Z.geraetSpeichern(db,1,p.id,null,meter({einheit:'m3'})),/Einheit/);
 await assert.rejects(Z.geraetSpeichern(db,1,p.id,null,meter({wert_pfad:'data.__proto__.x'})),/Feldpfad/);
 await assert.rejects(Z.geraetSpeichern(db,1,p.id,null,meter({eingebaut_am:'2026-02-30'})),/Datum/);
});
test('Manuelle Werte: Dezimalgenauigkeit, Berliner Tagesgrenze, Konflikt und Fremdobjekt',async t=>{
 const db=await fixture(t),p=await Z.punktSpeichern(db,1,null,point(),admin),z=await Z.geraetSpeichern(db,1,p.id,null,meter());
 const m={zeitpunkt:'2026-01-01T00:00:00+01:00',wert:'99999999999999,123456',einheit:'kWh'};
 await Z.messwert(db,1,z.id,m,admin);assert.equal((await Z.messwerte(db,1,z.id))[0].wert,'99999999999999.123456');
 assert.equal((await Z.messwert(db,1,z.id,m,admin)).bekannt,true);
 await assert.rejects(Z.messwert(db,1,z.id,{...m,wert:'1'},admin),e=>e.status===409);
 await assert.rejects(Z.messwert(db,1,z.id,{...m,zeitpunkt:'2026-01-01T00:00:00'},admin),/Zeitzone/);
 await assert.rejects(Z.messwert(db,2,z.id,m,admin),e=>e.status===404);
 await assert.rejects(Z.messwert(db,1,z.id,{...m,wert:'-1'},admin),/Zählerstand/);
});
test('Lobaro dokumentierter GET, verschlüsselter Token, Vorschau ohne Schreiben, idempotente Übernahme mit Original',async t=>{
 const calls=[],{db,z,l}=await setup(t,async(url,opt)=>{calls.push({url:new URL(url),opt});return response([record()]);});
 const stored=await db.get('SELECT * FROM lobaro_verbindungen');assert.ok(!stored.token.includes(token));assert.equal((await l.status(1)).token,undefined);
 const p=await l.vorschau(1,range,admin);assert.equal(p.neu,1);assert.equal(p.fehler.length,0);assert.equal((await Z.messwerte(db,1,z.id)).length,0);assert.equal(calls[0].url.origin,'https://platform.lobaro.com');assert.equal(calls[0].url.pathname,'/api/devices/4/parsed-data');assert.equal(calls[0].opt.method,'GET');assert.equal(calls[0].opt.headers.Authorization,'Bearer '+token);assert.equal(calls[0].opt.redirect,'error');assert.equal(calls[0].url.searchParams.get('limit'),'100');
 await assert.rejects(l.uebernehmen(2,p.id,admin),e=>e.status===409);await assert.rejects(l.uebernehmen(1,p.id,{id:2}),e=>e.status===409);
 assert.deepEqual(await l.uebernehmen(1,p.id,admin),{neu:1,bekannt:0});const rows=await Z.messwerte(db,1,z.id);assert.equal(rows[0].quelle,'lobaro');assert.equal(JSON.parse(rows[0].quell_original).data.stand,'123,4500');
 const again=await l.vorschau(1,range,admin);assert.equal(again.bekannt,1);assert.equal(again.neu,0);assert.deepEqual(await l.uebernehmen(1,again.id,admin),{neu:0,bekannt:1});assert.equal((await Z.messwerte(db,1,z.id)).length,1);
});
test('Lobaro stoppt bei falschem Gerät, unbekannten Feldern, Einheit und widersprüchlichen Werten',async t=>{
 let rows=[record({deviceId:9})];const {db,z,l}=await setup(t,async()=>response(rows));let p=await l.vorschau(1,range,admin);assert.equal(p.id,null);assert.match(p.fehler[0].fehler,/anderen Geräts/);
 rows=[record({data:{other:2}})];p=await l.vorschau(1,range,admin);assert.match(p.fehler[0].fehler,/fehlt/);
 rows=[record({data:{stand:123,unit:'m3'}})];p=await l.vorschau(1,range,admin);assert.match(p.fehler[0].fehler,/einheit/i);
 await Z.messwert(db,1,z.id,{zeitpunkt:record().time,wert:'100',einheit:'kWh'},admin);rows=[record()];p=await l.vorschau(1,range,admin);assert.equal(p.id,null);assert.match(p.fehler[0].fehler,/abweicht|weicht ab/);assert.equal((await Z.messwerte(db,1,z.id))[0].wert,'100');
});
test('Vorschau verfällt bei Ablauf, Geräteänderung und Tokenwechsel',async t=>{
 let clock=1000;const {l,db,p,z}=await setup(t,async()=>response([record()]),{now:()=>clock});let preview=await l.vorschau(1,range,admin);clock+=1800001;await assert.rejects(l.uebernehmen(1,preview.id,admin),/abgelaufen/);
 preview=await l.vorschau(1,range,admin);await Z.geraetSpeichern(db,1,p.id,z.id,{...z,nummer:'Neue Bezeichnung'});await assert.rejects(l.uebernehmen(1,preview.id,admin),/zuordnung/i);
 preview=await l.vorschau(1,range,admin);await l.speichern(1,{revision:1,token:'ersatz-test-token'},admin);await assert.rejects(l.uebernehmen(1,preview.id,admin),/abgelaufen/);assert.equal((await Z.messwerte(db,1,z.id)).length,0);
});
test('Unvollständige oder übergroße Seiten, falsche Anmeldung und unterbrochene Antworten bleiben ohne Import',async t=>{
 let mode='pages';const {l,db}=await setup(t,async()=>mode==='auth'?new Response('nicht anzeigen',{status:401}):mode==='json'?new Response('<html>'):new Response(JSON.stringify({pagination:{offset:0,total:101},data:[]})));
 await assert.rejects(l.vorschau(1,range,admin),/unvollständig/);mode='auth';await assert.rejects(l.vorschau(1,range,admin),/abgelehnt/);mode='json';await assert.rejects(l.vorschau(1,range,admin),/JSON/);assert.equal((await db.get('SELECT count(*) AS n FROM zaehler_messwerte')).n,0);
});
test('Lobaro-Geräte werden vollständig paginiert, ohne Datensatzduplikate zu verschweigen',async t=>{
 let bad=false;const calls=[],{l}=await setup(t,async(url)=>{const u=new URL(url),offset=Number(u.searchParams.get('offset'));calls.push(offset);return new Response(JSON.stringify({pagination:{offset,total:101},data:Array.from({length:offset?1:100},(_,i)=>({id:bad&&offset?1:offset+i+1,name:'Gerät'}))}));});
 assert.equal((await l.geraete(1)).length,101);assert.deepEqual(calls,[0,100]);bad=true;await assert.rejects(l.geraete(1),/doppelte/);
});
test('Zähler-API schützt Rollen, Anmeldung, Origin und fremde Objektzuordnung',async t=>{
 const db=await fixture(t),app=require('express')();app.use(require('express').json());app.use((req,res,next)=>{const role=req.get('x-role');req.benutzer=role?{id:1,rolle:role}:null;next();});app.use('/api/objekte/:objektId/zaehler',require('../routes/zaehler')(db,{publicUrl:'https://cura.example'}));app.use((e,req,res,next)=>res.status(e.status||500).json({fehler:e.message}));const server=app.listen(0,'127.0.0.1');t.after(()=>new Promise(r=>server.close(r)));await new Promise(r=>server.on('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api/objekte/1/zaehler';const post=(role,origin='https://cura.example')=>fetch(url+'/punkte',{method:'POST',headers:{'x-role':role,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(point())});
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{'x-role':'eigentuemer'}})).status,403);assert.equal((await post('leser')).status,403);assert.equal((await post('admin','https://fremd.example')).status,403);assert.equal((await post('mitarbeiter')).status,201);assert.equal((await fetch(url+'/lobaro/geraete',{method:'POST',headers:{'x-role':'mitarbeiter',Origin:'https://cura.example','Content-Type':'application/json'},body:'{}'})).status,403);
});
