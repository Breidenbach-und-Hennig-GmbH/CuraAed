'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {parseInvoice,extract,baueErkennung}=require('../services/rechnungsErkennung');
const text='Muster GmbH\nRECHNUNG\nRechnungs-Nr.: RE-2026-42\nRechnungsdatum: 09.11.2026\nNettobetrag 1.000,00 EUR\nUmsatzsteuer 19% 190,00 EUR\nRechnungsbetrag: 1.190,00 EUR\nZahlbar bis 23.11.2026\nZahlungsziel: 14 Tage\nVielen Dank';
test('Rechnungsanalyse: Brutto statt Netto, Rechnungsdatum, Fälligkeit und Belegstellen',()=>{
 const d=parseInvoice(text);assert.equal(d.rechnung,true);assert.equal(d.felder.rechnungs_nr,'RE-2026-42');assert.equal(d.felder.betrag,'1190,00');assert.equal(d.felder.rechnungsdatum,'2026-11-09');assert.equal(d.felder.faelligkeit,'2026-11-23');assert.equal(d.felder.netto_tage,'14');assert.match(d.belege.betrag,/Rechnungsbetrag/);assert.equal(d.felder.zahlung_freigegeben,undefined);
});
test('Rechnungsanalyse: Konflikte, Gutschriften, andere Währungen und unpassende Dokumente werden nicht blind vorbelegt',()=>{
 assert.equal(parseInvoice(text+'\nRechnungsbetrag: 9.999,00 EUR').felder.betrag,undefined);
 assert.equal(parseInvoice(text+'\nGutschrift').felder.betrag,undefined);assert.equal(parseInvoice(text+'\nUSD').felder.betrag,undefined);
 assert.equal(parseInvoice('Besprechungsnotiz\nTermin 09.11.2026').rechnung,false);
 assert.equal(parseInvoice(text.replace('09.11.2026','31.02.2026')).felder.rechnungsdatum,undefined);
 assert.equal(parseInvoice('Rechnung\nRE-Nr.: 7\nDatum: 10.11.2026\nGesamtbetrag: 9,99 EUR').felder.rechnungs_nr,'7');
});
function pdf(lines){let stream='BT /F1 13 Tf 50 790 Td ';for(const [i,line] of lines.entries())stream+=(i?'0 -24 Td ':'')+'('+line.replace(/[()\\]/g,' ') +') Tj ';stream+='ET';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'];let s='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(s));s+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});const start=Buffer.byteLength(s);s+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer << /Size 6 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';return Buffer.from(s);}
test('Lokale Texterkennung: echte PDF-Texte und ein gescanntes Rechnungsbild ohne externen Dienst', {timeout:90000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-ocr-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const pdfPath=path.join(dir,'rechnung.pdf');await fs.writeFile(pdfPath,pdf((text+'\nMusterstrasse 42 51645 Gummersbach\nReparatur der Heizungsanlage im Verwaltungsobjekt\nLeistungszeitraum November 2026\nBitte verwenden Sie die Rechnungsnummer bei der Zahlung.').split('\n')));
 const result=await extract(pdfPath);assert.equal(parseInvoice(result.text).felder.betrag,'1190,00');assert.equal(result.methode,'PDF-Text');
 const {createCanvas}=require('@napi-rs/canvas'),c=createCanvas(1600,1200),ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1600,1200);ctx.fillStyle='black';ctx.font='36px sans-serif';text.split('\n').forEach((line,i)=>ctx.fillText(line,80,90+i*76));const image=path.join(dir,'scan.png');await fs.writeFile(image,c.toBuffer('image/png'));
 const scan=await extract(image),parsed=parseInvoice(scan.text);assert.equal(scan.methode,'Lokale OCR');assert.equal(parsed.felder.rechnungs_nr,'RE-2026-42');assert.equal(parsed.felder.betrag,'1190,00');assert.equal(parsed.felder.rechnungsdatum,'2026-11-09');
 const jpg=c.toBuffer('image/jpeg'),content=Buffer.from('q 800 0 0 600 0 0 cm /Im0 Do Q'),objects=[
 Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
 Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 600] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
 Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width 1600 /Height 1200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n'),jpg,Buffer.from('\nendstream')]),
 Buffer.concat([Buffer.from('<< /Length '+content.length+' >>\nstream\n'),content,Buffer.from('\nendstream')])];
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[];for(const [i,o] of objects.entries()){offsets.push(Buffer.concat(chunks).length);chunks.push(Buffer.from((i+1)+' 0 obj\n'),o,Buffer.from('\nendobj\n'));}
 const start=Buffer.concat(chunks).length;chunks.push(Buffer.from('xref\n0 6\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer << /Size 6 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF'));
 const scanPdf=path.join(dir,'scan.pdf');await fs.writeFile(scanPdf,Buffer.concat(chunks));const recognizedPdf=await extract(scanPdf);assert.match(recognizedPdf.methode,/OCR/);assert.equal(parseInvoice(recognizedPdf.text).felder.betrag,'1190,00');
});
test('Erkennungsdienst: speichert Vorschläge getrennt von Rechnungen, cached und prüft Dokumentrechte zuerst',async t=>{
 const {openDatabase}=require('../db'),db=await openDatabase(':memory:');t.after(()=>db.close());const dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-detect-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.writeFile(path.join(dir,'test.pdf'),'%PDF-test');
 await db.run("INSERT INTO dokumente(id,titel,kategorie,original_name,speicher_name,mime_type,groesse,quelle) VALUES(1,'Test','rechnung','test.pdf','test.pdf','application/pdf',9,'upload')");
 let count=0;const svc=baueErkennung(db,{uploadDir:dir,rechnungen:{document:async(owner,ref)=>{if(owner!==1)throw Object.assign(new Error('Nicht gefunden'),{status:404});return{key:'archiv:1',dokument:{id:1}};}},lesen:async()=>{count++;return{text,methode:'Test',seiten:1};}});
 assert.equal((await svc.erkennen(1,{typ:'archiv',id:1})).felder.betrag,'1190,00');await svc.erkennen(1,{typ:'archiv',id:1});assert.equal(count,1);await assert.rejects(svc.erkennen(2,{typ:'archiv',id:1}),e=>e.status===404);
 assert.equal((await db.get('SELECT count(*) n FROM eingangsrechnungen')).n,0);assert.equal((await db.get('SELECT count(*) n FROM rechnungs_erkennung')).n,1);
});
