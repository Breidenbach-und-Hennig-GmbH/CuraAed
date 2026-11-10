'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {parseZugferd}=require('../services/zugferd'),{extract}=require('../services/rechnungsErkennung');
const xml=()=>[
'<?xml version="1.0" encoding="UTF-8"?>',
'<r:CrossIndustryInvoice xmlns:r="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:a="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:d="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">',
'<r:ExchangedDocumentContext><a:GuidelineSpecifiedDocumentContextParameter><a:ID>urn:cen.eu:en16931:2017</a:ID></a:GuidelineSpecifiedDocumentContextParameter></r:ExchangedDocumentContext>',
'<r:ExchangedDocument><a:ID>ZF-00042</a:ID><a:TypeCode>380</a:TypeCode><a:IssueDateTime><d:DateTimeString format="102">20261109</d:DateTimeString></a:IssueDateTime></r:ExchangedDocument><r:SupplyChainTradeTransaction>',
'<a:IncludedSupplyChainTradeLineItem><a:AssociatedDocumentLineDocument><a:LineID>1</a:LineID></a:AssociatedDocumentLineDocument><a:SpecifiedTradeProduct><a:Name>Heizungswartung &amp; Kontrolle</a:Name></a:SpecifiedTradeProduct><a:SpecifiedLineTradeDelivery><a:BilledQuantity unitCode="C62">1</a:BilledQuantity></a:SpecifiedLineTradeDelivery><a:SpecifiedLineTradeSettlement><a:SpecifiedTradeSettlementLineMonetarySummation><a:LineTotalAmount>1000.00</a:LineTotalAmount></a:SpecifiedTradeSettlementLineMonetarySummation></a:SpecifiedLineTradeSettlement></a:IncludedSupplyChainTradeLineItem>',
'<a:ApplicableHeaderTradeAgreement><a:BuyerReference>OB-42</a:BuyerReference><a:SellerTradeParty><a:Name>Muster &amp; Sohn</a:Name><a:PostalTradeAddress><a:LineOne>Testweg 1</a:LineOne><a:PostcodeCode>51645</a:PostcodeCode><a:CityName>Gummersbach</a:CityName><a:CountryID>DE</a:CountryID></a:PostalTradeAddress></a:SellerTradeParty><a:BuyerTradeParty><a:Name>Testverwaltung</a:Name></a:BuyerTradeParty></a:ApplicableHeaderTradeAgreement>',
'<a:ApplicableHeaderTradeSettlement><a:InvoiceCurrencyCode>EUR</a:InvoiceCurrencyCode><a:PaymentReference>ZF-00042</a:PaymentReference><a:SpecifiedTradeSettlementPaymentMeans><a:TypeCode>58</a:TypeCode><a:PayeePartyCreditorFinancialAccount><a:IBANID>DE89370400440532013000</a:IBANID></a:PayeePartyCreditorFinancialAccount></a:SpecifiedTradeSettlementPaymentMeans>',
'<a:SpecifiedTradePaymentTerms><a:Description>Zahlbar bis 23.11.2026</a:Description><a:DueDateDateTime><d:DateTimeString format="102">20261123</d:DateTimeString></a:DueDateDateTime></a:SpecifiedTradePaymentTerms>',
'<a:ApplicableTradeTax><a:CalculatedAmount>190.00</a:CalculatedAmount><a:TypeCode>VAT</a:TypeCode><a:BasisAmount>1000.00</a:BasisAmount><a:CategoryCode>S</a:CategoryCode><a:RateApplicablePercent>19.00</a:RateApplicablePercent></a:ApplicableTradeTax>',
'<a:SpecifiedTradeSettlementHeaderMonetarySummation><a:TaxBasisTotalAmount>1000.00</a:TaxBasisTotalAmount><a:TaxTotalAmount currencyID="EUR">190.00</a:TaxTotalAmount><a:GrandTotalAmount>1190.00</a:GrandTotalAmount><a:TotalPrepaidAmount>200.00</a:TotalPrepaidAmount><a:DuePayableAmount>990.00</a:DuePayableAmount></a:SpecifiedTradeSettlementHeaderMonetarySummation>',
'</a:ApplicableHeaderTradeSettlement></r:SupplyChainTradeTransaction></r:CrossIndustryInvoice>'
].join('\n');
function pdf(files){
 const content=Buffer.from('BT /F1 12 Tf 50 780 Td (TEST: VISUELLER BETRAG 9999,00 EUR) Tj ET');
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names ['+files.map((f,i)=>'('+f.name+') '+(6+i*2)+' 0 R').join(' ') +'] >> >> >>'),
 Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'),Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),Buffer.concat([Buffer.from('<< /Length '+content.length+' >>\nstream\n'),content,Buffer.from('\nendstream')])];
 files.forEach((f,i)=>{const bytes=Buffer.from(f.xml);objects.push(Buffer.from('<< /Type /Filespec /F ('+f.name+') /UF ('+f.name+') /AFRelationship /Data /EF << /F '+(7+i*2)+' 0 R >> >>'),Buffer.concat([Buffer.from('<< /Type /EmbeddedFile /Subtype /application#2Fxml /Length '+bytes.length+' >>\nstream\n'),bytes,Buffer.from('\nendstream')]));});
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[];objects.forEach((o,i)=>{offsets.push(Buffer.concat(chunks).length);chunks.push(Buffer.from((i+1)+' 0 obj\n'),o,Buffer.from('\nendobj\n'));});const offset=Buffer.concat(chunks).length;chunks.push(Buffer.from('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer << /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF'));return Buffer.concat(chunks);
}
test('ZUGFeRD: exakte XML-Werte, Gesamtbetrag und offener Zahlbetrag bleiben getrennt',()=>{
 const d=parseZugferd(xml());assert.equal(d.felder.rechnungs_nr,'ZF-00042');assert.equal(d.felder.betrag,'1190,00');assert.equal(d.felder.teilzahlung,'200,00');assert.equal(d.struktur.summen.zahlbetrag,'990,00');assert.equal(d.felder.rechnungsdatum,'2026-11-09');assert.equal(d.felder.faelligkeit,'2026-11-23');
 assert.equal(d.struktur.lieferant.name,'Muster & Sohn');assert.equal(d.struktur.positionen[0].name,'Heizungswartung & Kontrolle');assert.equal(d.struktur.steuern[0].satz,'19.00');assert.equal(d.felder.zahlung_freigegeben,undefined);assert.equal(d.felder.lieferantenkonto,undefined);assert.equal(d.felder.buchungskonto,undefined);assert.deepEqual(d.hinweise,[]);
});
test('ZUGFeRD: Währungen, Gutschriften, Summendifferenzen und ungültige Datumsangaben erfordern Prüfung',()=>{
 const usd=parseZugferd(xml().replaceAll('EUR','USD'));assert.equal(usd.felder.betrag,undefined);assert.equal(usd.felder.teilzahlung,undefined);assert.match(usd.hinweise.join(' '),/Währung/i);
 const credit=parseZugferd(xml().replace('<a:TypeCode>380','<a:TypeCode>381'));assert.equal(credit.felder.betrag,undefined);assert.match(credit.hinweise.join(' '),/Gutschrift/);
 assert.match(parseZugferd(xml().replace('990.00','1.00')).hinweise.join(' '),/Zahlbetrag/);
 assert.equal(parseZugferd(xml().replace('20261109','20260231')).felder.rechnungsdatum,undefined);
});
test('ZUGFeRD: Skontofrist und reguläre Fälligkeit bleiben getrennt; abweichende Skontobasis wird nicht geraten',()=>{
 const withDiscount=xml().replace('<a:SpecifiedTradePaymentTerms>', '<a:SpecifiedTradePaymentTerms><a:DueDateDateTime><d:DateTimeString format="102">20261116</d:DateTimeString></a:DueDateDateTime><a:ApplicableTradePaymentDiscountTerms><a:BasisAmount>1190.00</a:BasisAmount><a:CalculationPercent>2.5</a:CalculationPercent></a:ApplicableTradePaymentDiscountTerms></a:SpecifiedTradePaymentTerms><a:SpecifiedTradePaymentTerms>');
 const d=parseZugferd(withDiscount);assert.equal(d.felder.faelligkeit,'2026-11-23');assert.equal(d.felder.netto_tage,'14');assert.equal(d.felder.ziel1_tage,'7');assert.equal(d.felder.ziel1_skonto,'2,50');
 const other=parseZugferd(withDiscount.replace('<a:BasisAmount>1190.00','<a:BasisAmount>1000.00'));assert.equal(other.felder.ziel1_skonto,undefined);assert.match(other.hinweise.join(' '),/Skontobedingung/);
});
test('ZUGFeRD: fremde Namensräume, mehrdeutige Kopfdaten, externe Entitäten und übergroße XML werden abgewiesen',()=>{
 assert.throws(()=>parseZugferd(xml().replace('CrossIndustryInvoice:100','FAKE')),/keine unterstützte/);
 assert.throws(()=>parseZugferd(xml().replace('<a:ID>ZF-00042</a:ID>','<a:ID>ZF-00042</a:ID><a:ID>Andere</a:ID>')),/mehrdeutige/);
 assert.throws(()=>parseZugferd('<!DOCTYPE r:CrossIndustryInvoice [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+xml().replace(/<\?xml.*?\?>/,'')),/DTD/);
 assert.throws(()=>parseZugferd(xml()+'<x>'),/wohlgeformt/);assert.throws(()=>parseZugferd('x'.repeat(2*1024*1024+1)),/groß/);
});
test('ZUGFeRD 1.0: ältere CII-Knoten und Namensräume werden separat gelesen',()=>{
 const old=xml().replaceAll('CrossIndustryInvoice:100','CrossIndustryDocument:invoice:1p0').replace('urn:un:unece:uncefact:data:standard:CrossIndustryDocument:invoice:1p0','urn:ferd:CrossIndustryDocument:invoice:1p0').replaceAll('CrossIndustryInvoice','CrossIndustryDocument').replaceAll('ReusableAggregateBusinessInformationEntity:100','ReusableAggregateBusinessInformationEntity:12').replaceAll('UnqualifiedDataType:100','UnqualifiedDataType:15').replaceAll('ExchangedDocumentContext','SpecifiedExchangedDocumentContext').replaceAll('r:ExchangedDocument>','r:HeaderExchangedDocument>').replaceAll('SupplyChainTradeTransaction','SpecifiedSupplyChainTradeTransaction').replaceAll('ApplicableHeaderTradeAgreement','ApplicableSupplyChainTradeAgreement').replaceAll('ApplicableHeaderTradeSettlement','ApplicableSupplyChainTradeSettlement').replaceAll('SpecifiedLineTradeDelivery','SpecifiedSupplyChainTradeDelivery').replaceAll('SpecifiedLineTradeSettlement','SpecifiedSupplyChainTradeSettlement').replaceAll('RateApplicablePercent','ApplicablePercent');
 const d=parseZugferd(old);assert.equal(d.struktur.format,'ZUGFeRD 1.0');assert.equal(d.felder.betrag,'1190,00');
});
test('ZUGFeRD-PDF: XML hat Vorrang vor PDF-Text; beschädigte oder mehrere Rechnungs-XMLs werden nicht ersetzt',{timeout:30000},async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'curaaed-zf-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'test.pdf'),bytes=pdf([{name:'factur-x.xml',xml:xml()}]);await fs.writeFile(file,bytes);const d=await extract(file);assert.match(d.methode,/XML/);assert.equal(d.zugferd.felder.betrag,'1190,00');assert.equal(d.zugferd.struktur.dateiname,'factur-x.xml');assert.deepEqual(await fs.readFile(file),bytes);
 await fs.writeFile(file,pdf([{name:'factur-x.xml',xml:'<kaputt'}]));await assert.rejects(extract(file),/XML/);
 await fs.writeFile(file,pdf([{name:'factur-x.xml',xml:xml()},{name:'zugferd-invoice.xml',xml:xml()}]));await assert.rejects(extract(file),/Mehrere/);
 const separate=path.join(dir,'test.xml');await fs.writeFile(separate,xml());assert.equal((await extract(separate)).zugferd.felder.rechnungs_nr,'ZF-00042');
});
