'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../db'),users=require('../services/benutzer'),{bauePosteingang,kuerzel}=require('../services/dmsPosteingang');
test('DMS-Posteingang: eigene Zuordnung statt Archivautor, leeres Kürzel zeigt alle; Abschluss erhält Archivdatei',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());await users.anlegen(db,{benutzername:'test',name:'Test',rolle:'admin',passwort:'test12345'});const owner=(await db.get('SELECT id FROM benutzer')).id;
 for(const [id,title] of [[1,'FD-Dokument'],[2,'AD-Dokument']])await db.run("INSERT INTO dokumente(id,titel,kategorie,original_name,speicher_name,mime_type,groesse,quelle) VALUES(?,?,'sonstiges','test.pdf',?,'application/pdf',8,'upload')",[id,title,id+'.pdf']);
 const s=bauePosteingang(db);await s.add(owner,{dokument_id:1,sachbearbeiter:'fd'});await s.add(owner,{dokument_id:2,sachbearbeiter:'AD'});
 assert.equal((await s.list({sb:''})).gesamt,2);assert.equal((await s.list({sb:'FD'})).eintraege[0].dokument_id,1);assert.equal((await s.list({sb:'AD'})).gesamt,1);
 await s.update(owner,1,{sachbearbeiter:'AD',status:'offen',revision:1});assert.equal((await s.list({sb:'FD'})).gesamt,0);assert.equal((await s.list({sb:'AD'})).gesamt,2);
 await assert.rejects(s.update(owner,1,{sachbearbeiter:'FD',status:'offen',revision:1}),e=>e.status===409);
 await s.update(owner,1,{sachbearbeiter:'AD',status:'abgeschlossen',revision:2});assert.equal((await s.list()).gesamt,1);assert.equal((await s.list({alle:'1'})).gesamt,2);assert.ok(await db.get('SELECT 1 FROM dokumente WHERE id=1'));
 assert.equal(kuerzel('fd'),'FD');assert.throws(()=>kuerzel('ABCD'));assert.throws(()=>kuerzel('F1'));await assert.rejects(s.add(owner,{dokument_id:999,sachbearbeiter:''}),e=>e.status===404);
});
