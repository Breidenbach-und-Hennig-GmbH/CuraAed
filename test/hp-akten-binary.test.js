'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

for(const filename of ['HP-Aktenimport.exe','HP-Mailpruefung.exe'])test('Ausgeliefertes '+filename+' verwendet zwingend den 32-Bit-ODBC-Treiber',()=>{
 const b=fs.readFileSync(path.join(__dirname,'../public/downloads',filename));
 const pe=b.readUInt32LE(0x3c);assert.equal(b.toString('ascii',pe,pe+4),'PE\0\0');assert.equal(b.readUInt16LE(pe+4),0x14c);
 const optional=pe+24;assert.equal(b.readUInt16LE(optional),0x10b);
 const clrRva=b.readUInt32LE(optional+96+14*8),sections=optional+b.readUInt16LE(pe+20);let clr;
 for(let i=0;i<b.readUInt16LE(pe+6);i++){const s=sections+i*40,rva=b.readUInt32LE(s+12),size=Math.max(b.readUInt32LE(s+8),b.readUInt32LE(s+16));if(clrRva>=rva&&clrRva<rva+size)clr=b.readUInt32LE(s+20)+clrRva-rva;}
 assert.ok(clr!==undefined,'CLR-Header fehlt');assert.equal(b.readUInt32LE(clr+16)&2,2,'32BITREQUIRED muss gesetzt sein; AnyCPU kann HPSD nicht öffnen');
});
