'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),reserve=require('../lib/ocrSlot');
test('Texterkennung koordiniert Rechnung und Teilungserklärung ohne doppelte Freigabe',async()=>{
 const release=reserve();
 try{assert.throws(()=>reserve(),e=>e.status===503);await assert.rejects(require('../services/rechnungsErkennung').extract('nicht-benutzt.pdf'),e=>e.status===503);}finally{release();}
 const second=reserve();release();try{assert.throws(()=>reserve(),e=>e.status===503);}finally{second();}
 const third=reserve();third();
});
