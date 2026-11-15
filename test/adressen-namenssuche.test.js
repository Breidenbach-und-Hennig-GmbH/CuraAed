'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{openDatabase}=require('../db'),a=require('../services/adressen');
test('Namenssuche findet Vor- und Nachnamen gemeinsam und Treffer außerhalb der ersten 500 Adressen',async t=>{
 const db=await openDatabase(':memory:');t.after(()=>db.close());
 await db.transaktion(async tx=>{for(let i=0;i<501;i++)await tx.run('INSERT INTO adressen(nummer,adresstyp,vorname,nachname) VALUES(?,?,?,?)',[String(i+1),'person','Anderer','A'+i]);await tx.run('INSERT INTO adressen(nummer,adresstyp,vorname,nachname) VALUES(?,?,?,?)',['99999','person','Max','Zielmann']);});
 assert.equal((await a.liste(db)).some(r=>r.nummer==='99999'),false);
 for(const suche of ['Max Zielmann','Zielmann Max','99999'])assert.equal((await a.liste(db,{suche}))[0].nummer,'99999');
});
