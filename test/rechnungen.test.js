'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db'),users=require('../services/benutzer');
const {baueRechnungen,money}=require('../services/eingangsrechnungen');
function body(){return{lieferantenkonto:'123',bankverbindung:'000',rechnungs_nr:'RE-17',rechnungsbeleg:'Test',rechnungsdatum:'2026-11-07',eingangsdatum:'2026-11-08',betrag:'1234,56',anerkannt:'1234,56',hndl_re:'100,00',hndl_teil:'0,00',bagatellgrenze:'0,00',teilzahlung:'0,00',netto_tage:'14',ziel1_tage:'7',ziel2_tage:'',ziel1_skonto:'2,00',ziel2_skonto:'0,00',objekt_nr:'',buchungskonto:'',bank_verb_nr:'000',steuerschluessel:'000',buchungstext:'Test',buchungstext2:'',buchungstext3:'',verwendungszweck1:'RE-17',verwendungszweck2:'',hwa_nr:'',akte:'',faelligkeit:'2026-11-21',fibu_bj:'2026',notiz:'Notiz',rechnerisch_richtig:false,sachlich_richtig:false,zahlung_freigegeben:false,abgrenzen:false,zahlungsart:'ueberweisung'};}
async function fixture(t){const db=await openDatabase(':memory:');t.after(()=>db.close());for(const name of ['eins','zwei'])await users.anlegen(db,{benutzername:name,name,rolle:'admin',passwort:'test12345'});const owner=(await db.get("SELECT id FROM benutzer WHERE benutzername='eins'")).id,other=(await db.get("SELECT id FROM benutzer WHERE benutzername='zwei'")).id;
 await db.run("INSERT INTO dokumente(id,titel,kategorie,original_name,speicher_name,mime_type,groesse,quelle) VALUES(1,'Rechnung','rechnung','test.pdf','test.pdf','application/pdf',8,'upload')");
 return{db,owner,other,svc:baueRechnungen(db,{archiveDocument:async(owner,q,id)=>({id:'hp:'+q+':'+id,verknuepfungen:[]})})};}
test('Eingangsrechnung: Cent-genaue Erfassung, Wiederöffnung, eindeutige Dokumentbindung und Konfliktschutz',async t=>{
 const {db,owner,svc}=await fixture(t),dokument={typ:'archiv',id:1};
 assert.equal((await svc.get(owner,dokument)).rechnung,null);
 const created=await svc.save(owner,{dokument,revision:0,daten:body()});assert.ok(created.id);assert.equal((await svc.get(owner,dokument)).dokument.dokumentenart,'RE');
 const d=await svc.get(owner,dokument);assert.equal(d.rechnung.daten.betrag,'1234,56');assert.equal(JSON.parse((await db.get('SELECT daten FROM eingangsrechnungen')).daten).betrag,123456);
 await assert.rejects(svc.save(owner,{dokument,revision:0,daten:body()}),e=>e.status===409);
 await svc.save(owner,{dokument,revision:1,daten:{...body(),notiz:'Ergänzt'}});
 assert.equal((await db.get('SELECT count(*) n FROM rechnungs_verlauf')).n,2);
 const inbox=require('../services/dmsPosteingang').bauePosteingang(db);await inbox.add(owner,{dokument_id:1});
 await db.run("INSERT INTO objekte(nummer,bezeichnung) VALUES('1001','Testhaus')");
 await db.run("INSERT INTO adressen(nummer,firmenname,lkto_nr,adresstyp) VALUES('A1','Test GmbH','123','firma')");
 const before=await inbox.detail(1);await svc.save(owner,{dokument,revision:2,daten:{...body(),objekt_nr:'1001'}});
 assert.equal((await inbox.detail(1)).dokument.verknuepfungen.length,2);
 assert.equal((await inbox.detail(1)).eingang.revision,before.eingang.revision+1);
 await assert.rejects(inbox.saveMeta(owner,1,{revision:before.eingang.revision,basis_bemerkung:'',bemerkung:'',oeffentlich:false,dokumentenart:'DX'}),e=>e.status===409);
 await assert.rejects(inbox.saveMeta(owner,1,{revision:before.eingang.revision+1,basis_bemerkung:'',bemerkung:'',oeffentlich:false,dokumentenart:'DX'}),/Dokumentenart bleibt RE/);

 await assert.rejects(require('../services/archiv').loeschen(db,1),e=>e.status===409);
 assert.equal(money('0,29'),29);assert.equal(money('-12,34'),-1234);for(const s of ['1e3','NaN','1,234','Infinity','12.34'])assert.throws(()=>money(s));
 await assert.rejects(svc.save(owner,{dokument,revision:3,daten:{...body(),rechnungsdatum:'2026-02-30'}}));
 await assert.rejects(svc.save(owner,{dokument,revision:3,daten:{...body(),zahlung_freigegeben:true}}));
});
test('Eingangsrechnung: Prüfvermerke stammen vom angemeldeten Benutzer und müssen bei Änderungen zurückgenommen werden',async t=>{
 const {db,owner,svc}=await fixture(t),dokument={typ:'archiv',id:1};
 await svc.save(owner,{dokument,revision:0,daten:{...body(),rechnerisch_richtig:true}});
 const d=await svc.get(owner,dokument);assert.equal(d.rechnung.pruefungen.rechnerisch_richtig.benutzer,'eins');
 await assert.rejects(svc.save(owner,{dokument,revision:1,daten:{...body(),betrag:'999,00',rechnerisch_richtig:true}}),e=>e.status===409);
 await svc.save(owner,{dokument,revision:1,daten:{...body(),betrag:'999,00'}});
 assert.deepEqual((await svc.get(owner,dokument)).rechnung.pruefungen,{});
});
test('Eingangsrechnung: HP-Dateinummern bleiben nach Quelle getrennt und fremde Bestände gesperrt',async t=>{
 const {db,owner,other,svc}=await fixture(t);
 for(const [q,u] of [['a',owner],['b',other]]){await db.run('INSERT INTO hp_dms_quellen(id,benutzer_id,subdomain) VALUES(?,?,?)',[q,u,'kunde-'+q]);await db.run("INSERT INTO hp_dms_dateien(quelle_id,datei_id,titel,dateiname,groesse,details,gelesen_am) VALUES(?,9,'Rechnung','test.pdf',8,'{}','2026-11-10')",[q]);}
 await svc.save(owner,{dokument:{typ:'hp',quelle:'a',id:9},revision:0,daten:body()});
 await assert.rejects(svc.get(other,{typ:'hp',quelle:'a',id:9}),e=>e.status===404);
 assert.equal((await svc.get(other,{typ:'hp',quelle:'b',id:9})).rechnung,null);assert.equal((await svc.get(owner,{typ:'hp',quelle:'a',id:9})).dokument.dokumentenart,'RE');assert.equal((await svc.get(other,{typ:'hp',quelle:'b',id:9})).dokument.dokumentenart,'DX');
});


test('Rechnungs-API: Anmeldung, Schreibrecht und Herkunft werden vor Zugriff und Speicherung geprüft',async t=>{
 const {db,owner}=await fixture(t),express=require('express'),app=express();app.use(express.json());app.use((req,res,next)=>{if(req.get('x-test-role'))req.benutzer={id:owner,rolle:req.get('x-test-role')};next();});app.use('/rechnungen',require('../routes/eingangsrechnungen').baueRouter(db,{},'https://curaaed.example'));app.use((e,req,res,next)=>res.status(e.status||500).json({fehler:e.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{server.closeAllConnections();server.close();});const base='http://127.0.0.1:'+server.address().port+'/rechnungen/dokument';
 assert.equal((await fetch(base+'?typ=archiv&id=1')).status,401);
 assert.equal((await fetch(base+'?typ=archiv&id=1',{headers:{'x-test-role':'leser'}})).status,403);
 assert.equal((await fetch(base,{method:'POST',headers:{'x-test-role':'admin','content-type':'application/json',origin:'https://fremd.example'},body:JSON.stringify({})})).status,403);
 const r=await fetch(base,{method:'POST',headers:{'x-test-role':'mitarbeiter','content-type':'application/json',origin:'https://curaaed.example'},body:JSON.stringify({dokument:{typ:'archiv',id:1},revision:0,daten:body()})});assert.equal(r.status,200);assert.ok((await r.json()).id);
});
