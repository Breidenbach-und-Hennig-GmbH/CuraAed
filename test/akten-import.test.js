'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {openDatabase}=require('../db'),{baueVorgaenge}=require('../services/vorgaenge'),{baueArchiv}=require('../services/hpDmsArchiv'),HP=require('../services/hpFachbereiche'),{HpMobileError,baueHpMobileClient}=require('../services/hausperfektMobile');
test('HP-Aktenimport: Akte, Adresse, bidirektionale HWA-Zuordnung und PDF bleiben ohne HP-Verbindung verfügbar',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());const dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-akten-import-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 for(const id of [1,2])await db.run("INSERT INTO benutzer(id,benutzername,name,rolle,passwort_hash) VALUES(?,?,?,'admin','test')",[id,'user'+id,'User '+id]);
 await db.run("INSERT INTO hp_mobile_verbindungen VALUES('mobile',1,'kunde','hp','synthetic','now')");await db.run("INSERT INTO hp_adress_verbindungen VALUES('direct',1,'HP','HPSD','synthetic',0,0,NULL)");await db.run("INSERT INTO adressen(id,nummer,nachname) VALUES(1,'2348','Eigentümer')");await db.run("INSERT INTO hp_adress_zuordnung(verbindung_id,hp_nummer,adresse_id,basis,status) VALUES('direct',2348,1,'{}','synchron')");
 let broken=true,downloads=0;const raw={id:1,hp_id:'118334-0',search:'Protokollakte',status:{hp_id:'BB0',description:'Protokollakte'},created_hp:'2022-06-22',persons:[{id:3,hp_id:2348,lastname:'Eigentümer'}],craftsman_tasks:[{id:2,hp_id:122502,subject:'Leckortung'}],documents:[{id:10,document_files:[{id:99,file_original_name:'Schaden.pdf'}]}]};
 const child={id:2,hp_id:122502,subject:'Leckortung',records:[{id:1,hp_id:'118334-0'}]};
 const hp={fachListe:async(o,c,r)=>({eintraege:r==='records'?[{id:1}]:[],weitere:false}),fachDetails:async(o,c,r,id)=>HP.details({fachDetails:async()=>r==='records'?raw:child},r,id)};
 const file={id:99,titel:'Schaden',dateiname:'Schaden.pdf',groesse:8,version:'v1',dokumentart:'Schriftverkehr'};
 const remote={dmsDetails:async()=>({dokument:file,zuordnungen:[]}),dmsDownload:async()=>{if(broken)throw new HpMobileError('Testunterbrechung',502);downloads++;return{bytes:Buffer.from('%PDF-1.7'),version:'v1'};}};
 const archiv=baueArchiv(db,dir,remote);await archiv.bind(1,'mobile','direct');const svc=baueVorgaenge(db,{hp,archiv});
 async function finish(){for(let i=0;i<300;i++){const info=await svc.overview(1);if(info.auftraege[0]?.status!=='laeuft')return info;await new Promise(r=>setTimeout(r,5));}throw Error('Import läuft zu lange');}
 await svc.start(1,'mobile');let info=await finish();assert.equal(info.auftraege[0].fehler,1);assert.equal(info.uebernahme.ausstehend,1);assert.match(info.auftraege[0].meldung,/nicht vollständig/);
 broken=false;await svc.start(1,'mobile');info=await finish();assert.equal(info.auftraege[0].fehler,0);assert.equal(info.uebernahme.gesichert,1);assert.equal(info.uebernahme.ausstehend,0);assert.equal(info.uebernahme.akten,1);assert.equal(info.uebernahme.handwerker,1);
 const akte=await db.get("SELECT id FROM fach_vorgaenge WHERE art='akte'"),hwa=await db.get("SELECT id FROM fach_vorgaenge WHERE art='handwerker'");let d=await svc.detail(1,akte.id);assert.equal(d.akte.art_text,'Protokollakte');assert.equal(d.akte.adressen[0].id,1);assert.equal(d.akte.handwerkerauftraege[0].id,hwa.id);assert.equal(d.akte.hp_dokumente[0].gesichert,true);
 await svc.start(1,'mobile');await finish();assert.equal((await db.get('SELECT COUNT(*) n FROM fach_vorgaenge')).n,2);assert.equal(downloads,1);
 await db.run("DELETE FROM hp_mobile_verbindungen WHERE id='mobile'");const offline=baueVorgaenge(db,{archiv:baueArchiv(db,dir,{})});d=await offline.detail(1,akte.id);assert.equal(d.akte.handwerkerauftraege.length,1);const saved=await offline.document(1,akte.id,99);assert.equal((await fs.readFile(saved.path)).toString(),'%PDF-1.7');await assert.rejects(offline.detail(2,akte.id),e=>e.status===404);
 // HP IDs are scoped to the source: an identical remote key elsewhere must not join.
 await db.run("INSERT INTO hp_dms_quellen VALUES('other',1,'other',NULL)");await svc.importOne(1,{id:'other'},'craftsman_tasks',await HP.details({fachDetails:async()=>child},'craftsman_tasks',2));assert.equal((await svc.detail(1,akte.id)).akte.handwerkerauftraege.length,1);
});
test('HP-Akten und Aufträge fragen Beziehungen ausdrücklich ab; fehlende Dateilisten werden erkannt',async()=>{
 const calls=[],client=baueHpMobileClient({portalUrl:'https://kunde.hausperfekt-mobile.de/',accessToken:'synthetic',fetchImpl:async(url)=>{calls.push(url);return Response.json(url.endsWith('whoami')?{clientdatabases:[{subdomain:'kunde'}]}:{id:1});}});
 for(const r of ['records','craftsman_tasks'])await client.fachDetails(r,1);for(const url of calls.filter(x=>!x.endsWith('whoami'))){const rel=JSON.parse(new URL(url).searchParams.get('rel'));assert.ok(rel.includes('persons'));assert.ok(rel.includes('documents.document_files'));}
 const data=await HP.details({fachDetails:async()=>({id:1,documents:[{id:10,document_files_count:1}]})},'records',1);assert.ok(data.unvollstaendig.includes('documents.document_files'));
});
