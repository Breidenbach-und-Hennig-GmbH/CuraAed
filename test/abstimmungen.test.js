'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('../services/abstimmungen'),Q=require('../lib/stimmbruch'),{openDatabase}=require('../db');
const group=(key,mea='1/4',units=1)=>({key,name:'Eigentümer '+key,mea,mea_vollstaendig:true,einheiten:Array.from({length:units},(_,id)=>({id,nummer:String(id)}))});
const reg=(gruppen)=>({gruppen,hinweise:[],meaHinweise:[]});
const row=(key,stimme='ja',extra={})=>({key,teilnahme:'selbst',stimme,ausgeschlossen:false,vollmacht_textform:false,stimme_textform:false,vertreter:'',nachweis:'',ausschlussgrund:'',...extra});
const count=(groups,rows,c={},r={})=>A.zaehlen(reg(groups),{...A.DEFAULT_CONFIG,geprueft:true,...c},{...A.DEFAULT_RULE,...r},rows,true);
test('MEA: exakte gemischte Brüche und Dezimalstellen ohne Rundungsfehler',()=>{
 assert.equal(Q.str(Q.add(Q.parse('1/3'),Q.parse('2/3'))),'1');assert.equal(Q.str(Q.parse('0,125')),'1/8');assert.equal(Q.str(Q.parse('123.45678901234567')),'12345678901234567/100000000000000');
 for(const v of ['1/0','-1','NaN','1e4','1.000,2','1/2/3',{},null])assert.throws(()=>Q.parse(v));
 const result=count([group('1','1/3'),group('2','2/3')],[row('1','ja'),row('2','nein')],{prinzip:'mea'});assert.equal(result.status,'abgelehnt');assert.equal(result.summen.ja,'1/3');
});
test('Köpfe, Einheiten und MEA ergeben unterschiedliche Gewichte; Clientgewicht wird ignoriert',()=>{
 const g=[group('1','3/4',3),group('2','1/4')],s=[row('1','ja',{gewicht:999}),row('2','nein')];
 assert.equal(count(g,s).status,'abgelehnt');assert.equal(count(g,s,{prinzip:'einheiten'}).summen.ja,'3');assert.equal(count(g,s,{prinzip:'mea'}).status,'angenommen');
});
test('Enthaltungen, ungültige und nicht abgegebene Stimmen werden getrennt ausgewiesen',()=>{
 const g=['1','2','3','4','5'].map(k=>group(k));const result=count(g,[row('1'),row('2','enthaltung'),row('3','ungueltig'),row('4','keine'),row('5','keine',{teilnahme:'abwesend'})]);
 assert.equal(result.status,'angenommen');assert.equal(result.abgegeben,'1');assert.equal(result.summen.enthaltung,'1');assert.equal(result.summen.ungueltig,'1');assert.equal(result.summen.ohne_stimme,'2');assert.equal(result.summen.vertreten,'4');
 assert.equal(count([group('1')],[row('1','enthaltung')]).status,'keine_gueltige_stimme');
});
test('Vollmachten zählen pro Eigentümergruppe, auch bei gleicher Vertretung; Textform und Nachweis sind Pflicht',()=>{
 const g=[group('1'),group('2')],proxy={teilnahme:'vollmacht',vertreter:'Verwalterin',vollmacht_textform:true,nachweis:'DMS 42'};
 assert.equal(count(g,g.map(x=>row(x.key,'ja',proxy))).summen.ja,'2');
 for(const extra of [{vollmacht_textform:false},{nachweis:''},{vertreter:''}])assert.throws(()=>count([g[0]],[row('1','ja',{...proxy,...extra})]),/Vollmacht/);
});
test('Stimmrechtsausschluss ist begründet, TOP-bezogen und wird aus der Berechtigung entfernt',()=>{
 const g=[group('1'),group('2')],s=[row('1'),row('2','keine',{ausgeschlossen:true,ausschlussgrund:'Rechtsgeschäft mit sich selbst'})];
 const result=count(g,s,{}, {mehrheit:'allstimmig'});assert.equal(result.summen.berechtigt,'1');assert.equal(result.summen.ausgeschlossen,'1');assert.equal(result.status,'angenommen');
 assert.throws(()=>count(g,[s[0],{...s[1],ausschlussgrund:''}]),/begründen/);assert.throws(()=>count(g,[s[0],{...s[1],stimme:'ja'}]),/keine Stimme/);
});
test('Fehlende, doppelte und abwesende Stimmen werden nicht stillschweigend gezählt',()=>{
 const g=[group('1'),group('2')];for(const s of [[row('1')],[row('1'),row('1')],[row('1'),row('999')],[row('1'),row('2','ja',{teilnahme:'abwesend'})]])assert.throws(()=>count(g,s));
 assert.throws(()=>A.zaehlen(reg(g),{...A.DEFAULT_CONFIG,geprueft:true},A.DEFAULT_RULE,g.map(x=>row(x.key)),'true'),/prüfen/);
});
test('Drei Viertel sind einschließlich Grenze, zwei Drittel sind strikt; Einstimmigkeit unterscheidet sich von Allstimmigkeit',()=>{
 const g=['1','2','3','4'].map(k=>group(k)),s=g.map((x,i)=>row(x.key,i===3?'nein':'ja'));
 assert.equal(count(g,s,{}, {mehrheit:'drei_viertel'}).status,'angenommen');
 assert.equal(count(g.slice(0,3),[row('1'),row('2'),row('3','nein')],{}, {mehrheit:'zwei_drittel'}).status,'abgelehnt');
 const e=[row('1'),row('2','enthaltung'),row('3','keine',{teilnahme:'abwesend'}),row('4')];
 assert.equal(count(g,e,{}, {mehrheit:'einstimmig'}).status,'angenommen');assert.equal(count(g,e,{}, {mehrheit:'allstimmig'}).status,'abgelehnt');
});
test('Individuelle Mehrheiten haben getrennte Bezugsgrößen für abgegeben, vertreten und alle',()=>{
 const g=['1','2','3','4'].map(k=>group(k)),s=[row('1'),row('2','enthaltung'),row('3','keine',{teilnahme:'abwesend'}),row('4','keine',{teilnahme:'abwesend'})];
 const r={mehrheit:'individuell',zaehler:1,nenner:2,vergleich:'gte'};
 assert.equal(count(g,s,{}, {...r,basis:'abgegeben'}).status,'angenommen');assert.equal(count(g,s,{}, {...r,basis:'vertreten'}).status,'angenommen');assert.equal(count(g,s,{}, {...r,basis:'alle'}).status,'abgelehnt');
});
test('MEA-Zusatzquorum bezieht sich auf alle MEA einschließlich Abwesender und Ausgeschlossener',()=>{
 const g=[group('1','1/2'),group('2','1/4'),group('3','1/4')],s=[row('1'),row('2','keine',{teilnahme:'abwesend'}),row('3','keine',{ausgeschlossen:true,ausschlussgrund:'§ 25 Abs. 4'})];
 assert.equal(count(g,s,{}, {zusatz_mea:'mehr_haelfte'}).status,'abgelehnt');assert.equal(count(g,s,{}, {zusatz_mea:'mindestens_haelfte'}).status,'angenommen');
 assert.equal(count(g,s,{}, {zusatz_mea:'mehr_haelfte'}).summen.alle_mea,'1');
});
test('Fehlende MEA blockieren nur MEA-Zählungen oder MEA-Zusatzquoren',()=>{
 const r={...reg([group('1','0')]),meaHinweise:['MEA fehlen']},c={...A.DEFAULT_CONFIG,geprueft:true};
 assert.equal(A.zaehlen(r,c,A.DEFAULT_RULE,[row('1')],true).status,'angenommen');
 assert.throws(()=>A.zaehlen(r,{...c,prinzip:'mea'},A.DEFAULT_RULE,[row('1')],true),/MEA fehlen/);
 assert.throws(()=>A.zaehlen({...r,hinweise:['Eigentümer fehlen']},c,A.DEFAULT_RULE,[row('1')],true),/Eigentümer fehlen/);
});
test('Umlaufstimmen benötigen Textform und eine Fundstelle',()=>{
 const g=[group('1')];assert.throws(()=>count(g,[row('1')],{}, {verfahren:'umlauf',mehrheit:'allstimmig'}),/Textform/);
 assert.equal(count(g,[row('1','ja',{stimme_textform:true,nachweis:'E-Mail 11.11.2026'})],{}, {verfahren:'umlauf',mehrheit:'allstimmig'}).status,'angenommen');
});
async function fixture(t){const db=await openDatabase(':memory:');t.after(()=>db.close());
 await db.exec("INSERT INTO benutzer(id,benutzername,name,passwort_hash,rolle) VALUES(1,'test','Testleitung','x','admin');INSERT INTO objekte(id,bezeichnung) VALUES(1,'Testobjekt'),(2,'Anderes Objekt');INSERT INTO versammlungen(id,objekt_id,name,datum,leitung_id) VALUES(1,1,'Test-ETV','2026-11-20',1),(2,2,'Andere ETV','2026-11-20',1);INSERT INTO versammlung_tops(id,versammlung_id,position,titel,art) VALUES(1,1,1,'Testbeschluss','beschluss'),(2,1,2,'Zweiter Beschluss','beschluss'),(3,2,1,'Fremder Beschluss','beschluss');INSERT INTO adressen(id,nachname) VALUES(1,'A'),(2,'B'),(3,'C');INSERT INTO einheiten(id,objekt_id,bezeichnung,mea) VALUES(1,1,'WE 1','1/4'),(2,1,'WE 2','1/4'),(3,1,'WE 3','1/4'),(4,1,'WE 4','1/4');INSERT INTO rollen_zuordnungen(einheit_id,adresse_id,rolle) VALUES(1,1,'eigentuemer'),(2,1,'eigentuemer'),(3,1,'eigentuemer'),(3,2,'eigentuemer'),(4,2,'eigentuemer'),(4,3,'eigentuemer');");return db;}
const body=s=>({revision:s.revision,basis_hash:s.register.basis_hash,top_hash:s.top_hash,config_revision:s.config.revision,regel_revision:s.regel.revision,geprueft:true,stimmen:s.register.gruppen.map(g=>row(g.key))});
test('Register fasst identische Eigentümergruppen zusammen und hält teilweise überlappende Gruppen getrennt',async t=>{
 const db=await fixture(t),s=await A.stand(db,1,1);assert.deepEqual(s.register.gruppen.map(g=>g.key),['1','1:2','2:3']);assert.equal(s.register.gruppen[0].einheiten.length,2);assert.equal(s.register.gruppen[0].mea,'1/2');assert.equal(s.register.hinweise.length,0);
 await db.run("UPDATE einheiten SET mea='123.45678901234567' WHERE id IN(1,2)");assert.equal((await A.stand(db,1,1)).register.gruppen[0].mea,'12345678901234567/50000000000000');
 await db.run('UPDATE rollen_zuordnungen SET inaktiv=1 WHERE einheit_id=4 AND adresse_id=3');assert.equal((await A.stand(db,1,1)).register.gruppen.some(g=>g.key==='2:3'),false);
 await db.run("UPDATE rollen_zuordnungen SET gueltig_von='2027-01-01' WHERE einheit_id=1");assert.match((await A.stand(db,1,1)).register.hinweise.join(' '),/keine Eigentümerzuordnung/);
});
test('Unvollständige Eigentumsanteile werden sichtbar und blockieren die Berechnung',async t=>{
 const db=await fixture(t);await db.run("UPDATE rollen_zuordnungen SET anteil='1/2' WHERE einheit_id=3 AND adresse_id=1");assert.match((await A.stand(db,1,1)).register.hinweise.join(' '),/nicht vollständig/);
 await db.run("UPDATE rollen_zuordnungen SET anteil='1/2' WHERE einheit_id=3 AND adresse_id=2");assert.equal((await A.stand(db,1,1)).register.hinweise.length,0);
});
test('Objektregeln sind getrennt, versionsgeschützt und nicht ungeprüft verwendbar',async t=>{
 const db=await fixture(t),s=await A.stand(db,1,1);await assert.rejects(A.auszaehlen(db,1,1,body(s),1),/prüfen/);
 await A.saveConfig(db,1,{revision:0,daten:{...A.DEFAULT_CONFIG,geprueft:true}});assert.equal((await A.config(db,2)).revision,0);
 await assert.rejects(A.saveConfig(db,1,{revision:0,daten:A.DEFAULT_CONFIG}),e=>e.status===409);
 await assert.rejects(A.config(db,999),e=>e.status===404);
});
test('TOP-Regeln sind getrennt und Umlauf-Mehrheit verlangt einen Absenkungsbeschluss',async t=>{
 const db=await fixture(t);await assert.rejects(A.saveRule(db,1,1,{revision:0,daten:{...A.DEFAULT_RULE,verfahren:'umlauf'}}),/Absenkungsbeschluss/);
 await A.saveRule(db,1,1,{revision:0,daten:{...A.DEFAULT_RULE,mehrheit:'drei_viertel'}});assert.equal((await A.rule(db,2)).daten.mehrheit,'einfach');
 await assert.rejects(A.saveRule(db,1,3,{revision:0,daten:A.DEFAULT_RULE}),e=>e.status===404);
 await assert.rejects(A.saveRule(db,1,1,{revision:0,daten:A.DEFAULT_RULE}),e=>e.status===409);
});
test('Auszählungen werden atomar versioniert; Vorschau speichert nichts und nächste TOPs übernehmen keine Stimmen/Ausschlüsse',async t=>{
 const db=await fixture(t);await A.saveConfig(db,1,{revision:0,daten:{...A.DEFAULT_CONFIG,geprueft:true}});const s=await A.stand(db,1,1),b=body(s);
 b.stimmen[0]=row('1','ja',{teilnahme:'vollmacht',vertreter:'Testperson',vollmacht_textform:true,nachweis:'DMS 10'});b.stimmen[1]=row('1:2','keine',{ausgeschlossen:true,ausschlussgrund:'Rechtsgeschäft'});
 await A.auszaehlen(db,1,1,b,1,false);assert.equal((await A.verlauf(db,1,1)).length,0);
 await A.auszaehlen(db,1,1,b,1,true);const s2=await A.stand(db,1,1);assert.equal(s2.revision,1);assert.equal(s2.auszaehlung.benutzer,'Testleitung');
 await assert.rejects(A.auszaehlen(db,1,1,b,1,true),e=>e.status===409);
 const next=await A.stand(db,1,2);assert.equal(next.teilnahme['1'].vertreter,'Testperson');assert.equal(next.teilnahme['1:2'].ausgeschlossen,undefined);assert.equal(next.teilnahme['1'].stimme,undefined);
 const b2=body(s2);b2.stimmen[0].stimme='nein';await A.auszaehlen(db,1,1,b2,1,true);const h=await A.verlauf(db,1,1);assert.equal(h.length,2);assert.equal(JSON.parse(h[1].snapshot).stimmen[0].stimme,'ja');
});
test('Veränderte Eigentümer, TOP-Texte, Regeln und Objektprinzipien sperren veraltete Erfassungen',async t=>{
 const db=await fixture(t);await A.saveConfig(db,1,{revision:0,daten:{...A.DEFAULT_CONFIG,geprueft:true}});
 for(const mutate of [()=>db.run("UPDATE versammlung_tops SET titel='Geändert' WHERE id=1"),()=>db.run("UPDATE einheiten SET mea='1/3' WHERE id=1"),()=>A.saveRule(db,1,1,{revision:0,daten:{...A.DEFAULT_RULE,mehrheit:'allstimmig'}}),()=>A.saveConfig(db,1,{revision:1,daten:{...A.DEFAULT_CONFIG,geprueft:true,prinzip:'mea'}})]){const s=await A.stand(db,1,1);await mutate();await assert.rejects(A.auszaehlen(db,1,1,body(s),1,true),e=>e.status===409);}
 const s=await A.stand(db,1,1);await A.auszaehlen(db,1,1,body(s),1,true);await db.run("UPDATE versammlung_tops SET beschlussvorschlag='Neue Fassung' WHERE id=1");const changed=await A.stand(db,1,1);assert.equal(changed.historisch,true);assert.equal(changed.auszaehlung.snapshot.top_hash,s.top_hash);
});
