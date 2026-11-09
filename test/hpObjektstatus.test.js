'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ordinalDatum,bewerteObjektstatus}=require('../lib/hpObjektstatus');

test('belegte HP-Objekte: 4010 aktiv, 4020 beendet am 31.12.2019',()=>{
  assert.deepEqual(bewerteObjektstatus(0,'2026-11-09'),{status:'aktiv',beendet_am:null,importierbar:true,grund:null});
  assert.deepEqual(bewerteObjektstatus(737424,'2026-11-09'),{status:'beendet',beendet_am:'2019-12-31',importierbar:false,grund:null});
});

test('fehlende, falsch typisierte und ungültige HP-Werte niemals als aktiv behandeln',()=>{
  for(const value of [undefined,null,'',false,true,'0','737424',NaN,Infinity,-1,737424.5,3652060,{},[]]) {
    const result=bewerteObjektstatus(value,'2026-11-09');
    assert.equal(result.importierbar,false); assert.equal(result.status,'unklar');
  }
});

test('Ordinaldatum erhält Tagesgrenzen und Schaltjahre ohne lokale Zeitzonenumrechnung',()=>{
  assert.equal(ordinalDatum(1),'0001-01-01');
  assert.equal(ordinalDatum(719163),'1970-01-01');
  assert.equal(ordinalDatum(737483),'2020-02-28');
  assert.equal(ordinalDatum(737484),'2020-02-29');
  assert.equal(ordinalDatum(737485),'2020-03-01');
  assert.equal(ordinalDatum(3652059),'9999-12-31');
  assert.throws(()=>ordinalDatum(0),RangeError);
});

test('Beendigung am Stichtag oder in der Zukunft bleibt bis zur fachlichen Prüfung zurückgestellt',()=>{
  for(const stichtag of ['2019-12-31','2019-12-30']) {
    const result=bewerteObjektstatus(737424,stichtag);
    assert.equal(result.status,'beendigungsdatum_zu_pruefen'); assert.equal(result.importierbar,false);
  }
  assert.equal(bewerteObjektstatus(737424,'2020-01-01').status,'beendet');
});

test('ungültiger oder fehlender Stichtag führt zu einem Konfigurationsfehler',()=>{
  for(const stichtag of [undefined,null,'','2026-2-1','2026-02-30','2026-11-09T00:00:00Z','0000-01-01']) {
    assert.throws(()=>bewerteObjektstatus(0,stichtag),RangeError);
  }
});
