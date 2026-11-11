'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db'),T=require('../services/teilnehmer'),A=require('../services/abstimmungen');
async function fixture(t){const db=await openDatabase(':memory:');t.after(()=>db.close());await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'test','Testleitung','x','admin');INSERT INTO objekte(id,nummer,bezeichnung) VALUES(1,'1001','Haus A'),(2,'1002','Haus B');INSERT INTO versammlungen(id,objekt_id,name,datum,leitung_id) VALUES(1,1,'ETV A','2026-11-20',1),(2,2,'ETV B','2026-11-20',1);INSERT INTO adressen(id,nachname) VALUES(1,'Alpha'),(2,'Beta'),(3,'Gamma'),(4,'Früherer Eigentümer');INSERT INTO einheiten(id,objekt_id,nummer,bezeichnung,mea) VALUES(1,1,'WE 1','Wohnung 1','1/4'),(2,1,'WE 2','Wohnung 2','1/2'),(3,1,'WE 3','Wohnung 3','1/4');INSERT INTO rollen_zuordnungen(einheit_id,adresse_id,rolle,gueltig_bis) VALUES(1,1,'eigentuemer',NULL),(3,1,'eigentuemer',NULL),(2,2,'eigentuemer',NULL),(2,3,'eigentuemer',NULL),(1,4,'eigentuemer','2026-11-19');INSERT INTO versammlung_tops(id,versammlung_id,position,titel,art) VALUES(1,1,1,'Beschluss','beschluss');");return db;}
const row=(key,extra={})=>({key,teilnahme:'abwesend',vertreter:'',nachweis:'',vollmacht_textform:false,anwesende_eigentuemer:[],...extra});
const body=(s,teilnehmer)=>({revision:s.teilnahme.revision,basis_hash:s.register.basis_hash,teilnehmer:teilnehmer||s.register.gruppen.map(g=>row(g.key))});
test('Teilnehmerliste übernimmt Eigentümer zum Stichtag, bündelt gleiche Gruppen und ist ohne TOP nutzbar',async t=>{
 const db=await fixture(t);await db.run('DELETE FROM versammlung_tops');const s=await T.stand(db,1);assert.deepEqual(s.register.gruppen.map(g=>g.key),['1','2:3']);assert.equal(s.register.gruppen[0].einheiten.length,2);assert.equal(s.register.gruppen[1].eigentumer.length,2);assert.equal(s.teilnahme.revision,0);assert.equal((await T.stand(db,2)).register.gruppen.length,0);await assert.rejects(T.stand(db,999),e=>e.status===404);
});
test('Persönliche Anwesenheit und Vollmacht bleiben gespeichert und versammlungsbezogen',async t=>{
 const db=await fixture(t),s=await T.stand(db,1),rows=[row('1',{teilnahme:'selbst',anwesende_eigentuemer:[1]}),row('2:3',{teilnahme:'vollmacht',vertreter:'Verwalterin',nachweis:'DMS 42',vollmacht_textform:true,anwesende_eigentuemer:[2]})];
 await T.speichern(db,1,body(s,rows),1);const n=await T.stand(db,1);assert.equal(n.teilnahme.revision,1);assert.equal(n.teilnahme.benutzer,'Testleitung');assert.deepEqual(n.teilnahme.daten['2:3'].anwesende_eigentuemer,[2]);assert.equal(n.teilnahme.daten['2:3'].vertreter,'Verwalterin');assert.deepEqual((await T.stand(db,2)).teilnahme.daten,{});
 const a=await A.stand(db,1,1);assert.equal(a.teilnahme['2:3'].nachweis,'DMS 42');assert.equal(a.teilnahme['1'].stimme,undefined);assert.equal(a.teilnahme['1'].ausgeschlossen,undefined);await T.speichern(db,1,body(n,rows),1);assert.equal((await T.stand(db,1)).teilnahme.revision,1,'Unveränderte Liste erzeugt keinen falschen Teilnehmerwechsel');
});
test('Vollmachten, fremde Personen und widersprüchliche Anwesenheit werden geprüft; Speichern ist atomar',async t=>{
 const db=await fixture(t),s=await T.stand(db,1);for(const bad of [row('1',{teilnahme:'vollmacht'}),row('1',{teilnahme:'selbst'}),row('1',{teilnahme:'selbst',anwesende_eigentuemer:[2]}),row('1',{anwesende_eigentuemer:[1]}),row('1',{teilnahme:'selbst',anwesende_eigentuemer:[1,1]})]){await assert.rejects(T.speichern(db,1,body(s,[bad,row('2:3')]),1));assert.equal((await T.stand(db,1)).teilnahme.revision,0);}
 await assert.rejects(T.speichern(db,1,body(s,[row('1'),row('1')]),1),/Doppelte/);await assert.rejects(T.speichern(db,1,body(s,[row('1')]),1),/jede Eigentümergruppe/);
});
test('Versions- und Eigentümerwechsel verhindern stilles Überschreiben',async t=>{
 const db=await fixture(t),s=await T.stand(db,1);await T.speichern(db,1,body(s),1);await assert.rejects(T.speichern(db,1,body(s),1),e=>e.status===409);
 const n=await T.stand(db,1);await db.run("UPDATE versammlungen SET datum='2026-12-01' WHERE id=1");await assert.rejects(T.speichern(db,1,body(n),1),e=>e.status===409);assert.equal((await T.stand(db,1)).historisch,true);
});
test('Geänderte Teilnehmerliste sperrt bereits geöffnete Abstimmung, gespeicherte Ergebnisse bleiben unverändert',async t=>{
 const db=await fixture(t);await A.saveConfig(db,1,{revision:0,daten:{...A.DEFAULT_CONFIG,geprueft:true}});let a=await A.stand(db,1,1);
 const ballot=s=>({revision:s.revision,teilnahme_revision:s.teilnahme_revision,basis_hash:s.register.basis_hash,top_hash:s.top_hash,config_revision:s.config.revision,regel_revision:s.regel.revision,geprueft:true,stimmen:s.register.gruppen.map(g=>({key:g.key,teilnahme:'selbst',stimme:'ja',ausgeschlossen:false,vertreter:'',nachweis:'',ausschlussgrund:'',vollmacht_textform:false,stimme_textform:false}))});
 await A.auszaehlen(db,1,1,ballot(a),1,true);a=await A.stand(db,1,1);assert.equal(a.teilnahme_geaendert,false);const p=await T.stand(db,1);await T.speichern(db,1,body(p),1);
 await assert.rejects(A.auszaehlen(db,1,1,ballot(a),1,true),e=>e.status===409);const n=await A.stand(db,1,1);assert.equal(n.teilnahme_geaendert,true);assert.equal(n.auszaehlung.ergebnis.summen.ja,'2');assert.equal(n.teilnahme['1'].teilnahme,'abwesend');
});
test('Alte Teilnahmedaten bleiben lesbar; veraltete Vollmachtsangaben werden bei Nichtteilnahme gelöscht',async t=>{
 const db=await fixture(t);await db.run('INSERT INTO etv_teilnahme(versammlung_id,daten) VALUES(?,?)',[1,JSON.stringify({'1':{teilnahme:'selbst',vertreter:'Alt',nachweis:'Alt',vollmacht_textform:true}})]);const s=await T.stand(db,1);assert.equal(s.teilnahme.daten['1'].teilnahme,'selbst');await T.speichern(db,1,body(s,[row('1',{vertreter:'Alt',nachweis:'Alt',vollmacht_textform:true}),row('2:3')]),1);const n=await T.stand(db,1);assert.equal(n.teilnahme.daten['1'].vertreter,'');assert.equal(n.teilnahme.daten['1'].vollmacht_textform,false);
});
test('Download enthält gespeicherte Anwesenheit und Vollmachtsnachweis, aber keine Stimmen',async t=>{
 const db=await fixture(t),s=await T.stand(db,1);await T.speichern(db,1,body(s,[row('1',{teilnahme:'selbst',anwesende_eigentuemer:[1]}),row('2:3',{teilnahme:'vollmacht',vertreter:'Testperson',nachweis:'DMS 42',vollmacht_textform:true})]),1);
 const txt=await T.download(db,1);assert.match(txt,/ETV A/);assert.match(txt,/Alpha/);assert.match(txt,/Testperson\tDMS 42\tJa/);assert.match(txt,/Version 1/);assert.doesNotMatch(txt,/stimme/);
});
