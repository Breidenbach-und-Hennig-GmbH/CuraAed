'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {openDatabase}=require('../db'),a=require('../services/adressen'),g=require('../services/gesamtliste');
test('Großer HP-Bestand: begrenzte Listen und gezielte Suche auch hinter der ersten Treffergrenze',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 await db.run("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<60000) INSERT INTO adressen(nummer,nachname) SELECT 'HP-'||x,'Altbestand '||x FROM n");
 const target=await a.anlegen(db,{nummer:'HP-65937',nachname:'ZZ CURAAED-TEST',ort:'Testort',email:'test@example.invalid',telefon:'+49 (123) 456-78'});
 assert.equal((await a.liste(db)).length,500);assert.equal((await g.liste(db)).length,500);
 for(const opts of [{q:'CURAAED-TEST',modus:'intensiv'},{q:'HP-65937',modus:'suche'},{q:'Testort',modus:'feld',feld:'ort'},{q:'test@example.invalid',modus:'feld',feld:'email'},{q:'4912345678',modus:'telefon'}])assert.equal((await g.liste(db,opts))[0].id,target.id);
 assert.equal((await a.liste(db,{suche:'HP-65937'}))[0].id,target.id);
 const traces=[],tracked={...db,all:async(sql,args)=>{const rows=await db.all(sql,args);traces.push(rows.length);return rows;}};
 await g.liste(tracked,{q:'CURAAED-TEST',modus:'intensiv'});assert.ok(traces.every(n=>n<=500));
});

