'use strict';
const {SaxesParser}=require('saxes');
const MAX_XML=2*1024*1024;
const URI={
 r2:'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
 r1:'urn:ferd:CrossIndustryDocument:invoice:1p0',
 a2:'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
 a1:'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:12',
 d2:'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
 d1:'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:15'
};
function fail(message){const e=new Error(message);e.code='ZUGFERD_XML';throw e;}
function decode(bytes){
 if(bytes.length>MAX_XML)fail('Die eingebettete Rechnungs-XML ist größer als 2 MB.');
 let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
 try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{fail('Die Rechnungs-XML hat eine nicht lesbare Zeichenkodierung.');}
}
function tree(bytes){
 const xml=typeof bytes==='string'?bytes:decode(bytes);if(Buffer.byteLength(xml)>MAX_XML)fail('Die Rechnungs-XML ist zu groß.');
 const parser=new SaxesParser({xmlns:true}),stack=[];let root,count=0;
 parser.on('doctype',()=>fail('DTD und externe Entitäten sind in Rechnungs-XML nicht erlaubt.'));
 parser.on('error',()=>fail('Die Rechnungs-XML ist nicht wohlgeformt.'));
 parser.on('opentag',tag=>{if(++count>30000||stack.length>64)fail('Die Rechnungs-XML ist zu umfangreich oder zu tief verschachtelt.');
  const n={name:tag.local,uri:tag.uri,text:'',attrs:{},children:[]};for(const a of Object.values(tag.attributes))if(!a.uri)n.attrs[a.local]=a.value;
  if(stack.length)stack.at(-1).children.push(n);else root=n;stack.push(n);
 });
 parser.on('text',s=>{if(stack.length)stack.at(-1).text+=s;});parser.on('cdata',s=>{if(stack.length)stack.at(-1).text+=s;});parser.on('closetag',()=>stack.pop());
 try{parser.write(xml).close();}catch(e){if(e.code==='ZUGFERD_XML')throw e;fail('Die Rechnungs-XML konnte nicht gelesen werden.');}return root;
}
function parseZugferd(bytes){
 const root=tree(bytes),legacy=root?.name==='CrossIndustryDocument'&&root.uri===URI.r1;
 if(!legacy&&!(root?.name==='CrossIndustryInvoice'&&root.uri===URI.r2))fail('Diese XML ist keine unterstützte ZUGFeRD-/Factur-X-Rechnung im CII-Format.');
 const allowed=new Set(legacy?[URI.r1,URI.a1,URI.d1]:[URI.r2,URI.a2,URI.d2]),hinweise=[],felder={},belege={};
 const children=(n,name)=>(n?.children||[]).filter(c=>c.name===name&&allowed.has(c.uri));
 const one=(n,name)=>{const list=children(n,name);if(list.length>1)fail('Die Rechnungs-XML enthält mehrdeutige Kopfdaten: '+name+'.');return list[0];};
 const at=(n,...names)=>names.reduce((p,k)=>one(p,k),n),value=n=>n?.text.trim()||'',txt=(n,...p)=>value(at(n,...p));
 const head=one(root,legacy?'HeaderExchangedDocument':'ExchangedDocument'),trans=one(root,legacy?'SpecifiedSupplyChainTradeTransaction':'SupplyChainTradeTransaction'),
 agreement=one(trans,legacy?'ApplicableSupplyChainTradeAgreement':'ApplicableHeaderTradeAgreement'),settlement=one(trans,legacy?'ApplicableSupplyChainTradeSettlement':'ApplicableHeaderTradeSettlement'),
 sum=one(settlement,'SpecifiedTradeSettlementHeaderMonetarySummation'),currency=txt(settlement,'InvoiceCurrencyCode'),type=txt(head,'TypeCode');
 if(type.length>10||currency.length>3)fail('Ungültiger Dokumenttyp oder Währung in der Rechnungs-XML.');
 if(!head||!trans||!settlement||!txt(head,'ID'))fail('In der Rechnungs-XML fehlen notwendige Kopfdaten.');
 const format=legacy?'ZUGFeRD 1.0':'ZUGFeRD / Factur-X',id=txt(head,'ID');
 if(id.length>100)fail('Die Rechnungsnummer in der XML ist zu lang.');
 felder.rechnungs_nr=id;belege.rechnungs_nr='ExchangedDocument / ID: '+id;felder.verwendungszweck1=('Re-Nr. '+id).slice(0,140);
 function date(n){const d=one(n,'DateTimeString'),s=value(d);if(!d)return null;if(d.attrs.format!=='102'||!/^\d{8}$/.test(s)){hinweise.push('Datumsformat der XML wird nicht automatisch übernommen.');return null;}
  const out=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);if(Number.isNaN(Date.parse(out+'T00:00Z'))||new Date(out+'T00:00Z').toISOString().slice(0,10)!==out){hinweise.push('Ungültiges Datum in der XML.');return null;}return out;}
 const issued=date(one(head,'IssueDateTime'));if(issued){felder.rechnungsdatum=issued;belege.rechnungsdatum='IssueDateTime: '+issued;}
 const terms=children(settlement,'SpecifiedTradePaymentTerms'),parsedTerms=terms.map(t=>({node:t,datum:date(one(t,'DueDateDateTime')),discount:one(t,'ApplicableTradePaymentDiscountTerms')||one(t,'SpecifiedTradePaymentDiscountTerms')}));
 const dates=[...new Set(parsedTerms.filter(t=>!t.discount).map(t=>t.datum).filter(Boolean))];
 const daysBetween=(start,end)=>{if(!start||!end)return null;const days=(Date.parse(end+'T00:00Z')-Date.parse(start+'T00:00Z'))/86400000;return Number.isInteger(days)&&days>=0&&days<=999?String(days):null;};
 if(dates.length===1){felder.faelligkeit=dates[0];belege.faelligkeit='SpecifiedTradePaymentTerms / DueDateDateTime: '+dates[0];const days=daysBetween(issued,dates[0]);if(days!==null){felder.netto_tage=days;belege.netto_tage='Aus Rechnungsdatum und regulärer Fälligkeit: '+days+' Tage';}}
 else if(dates.length>1)hinweise.push('Mehrere reguläre Fälligkeitstermine in der XML – bitte Zahlungsplan prüfen.');
 function amount(n,label){if(!n)return null;const s=value(n),m=s.match(/^([+-]?)(\d{1,9})(?:\.(\d{1,6}))?$/);if(!m||((m[3]||'').slice(2).replace(/0/g,''))){hinweise.push('Ungültiger oder zu genauer Geldbetrag: '+label+'.');return null;}
  if(n.attrs.currencyID&&n.attrs.currencyID!==currency){hinweise.push('Abweichende Währung bei '+label+'.');return null;}
  const cents=(BigInt(m[2])*100n+BigInt((m[3]||'').slice(0,2).padEnd(2,'0')))*(m[1]==='-'?-1n:1n);return{cents,value:(cents<0n?'-':'')+(cents<0n?-cents:cents)/100n+','+String((cents<0n?-cents:cents)%100n).padStart(2,'0')};}
 const grand=amount(one(sum,'GrandTotalAmount'),'Gesamtbetrag'),due=amount(one(sum,'DuePayableAmount'),'Zahlbetrag'),prepaid=amount(one(sum,'TotalPrepaidAmount'),'Vorauszahlung'),basis=amount(one(sum,'TaxBasisTotalAmount'),'Steuerbasis'),rounding=amount(one(sum,'RoundingAmount'),'Rundung');
 const taxNodes=children(sum,'TaxTotalAmount').filter(n=>!n.attrs.currencyID||n.attrs.currencyID===currency);if(taxNodes.length>1)fail('Mehrdeutige Steuersummen für die Rechnungswährung.');
 const tax=amount(taxNodes[0],'Steuersumme');
 if(currency!=='EUR')hinweise.push('Rechnungswährung '+(currency||'fehlt')+' – Beträge bitte manuell prüfen. Die Rechnungsmaske verwendet EUR.');
 else if(!['380','384','386','389'].includes(type))hinweise.push(type==='381'?'Gutschrift erkannt – Vorzeichen und Betrag manuell prüfen.':'Dokumenttyp '+type+' – Betrag manuell prüfen.');
 else if(grand){felder.betrag=grand.value;belege.betrag='GrandTotalAmount (Gesamtbetrag inklusive Steuer): '+grand.value+' EUR';if(prepaid){felder.teilzahlung=prepaid.value;belege.teilzahlung='TotalPrepaidAmount: '+prepaid.value+' EUR';}}
 else hinweise.push('Gesamtbetrag fehlt in der XML. Der Zahlbetrag wird nicht als Rechnungs-Gesamtbetrag eingesetzt.');
 if(grand&&basis&&tax&&grand.cents!==basis.cents+tax.cents)hinweise.push('Steuerbasis und Steuersumme ergeben nicht den angegebenen Gesamtbetrag.');
 if(grand&&due&&due.cents!==grand.cents-(prepaid?.cents||0n)+(rounding?.cents||0n))hinweise.push('Gesamtbetrag, Vorauszahlung und Rundung ergeben nicht den angegebenen Zahlbetrag.');
 if(rounding?.cents)hinweise.push('Die XML enthält einen Rundungsausgleich. Zahlbetrag separat prüfen.');
 const discounts=parsedTerms.filter(t=>t.discount).map(t=>({datum:t.datum,prozent:txt(t.discount,'CalculationPercent'),basis:amount(one(t.discount,'BasisAmount'),'Skontobasis')}));
 const uniqueDiscounts=[...new Map(discounts.map(d=>[d.datum+':'+d.prozent,d])).values()].sort((a,b)=>String(a.datum).localeCompare(String(b.datum)));
 if(uniqueDiscounts.length>2)hinweise.push('Mehr als zwei Skontostufen in der XML – bitte manuell prüfen.');
 else uniqueDiscounts.forEach((d,i)=>{const days=daysBetween(issued,d.datum),p=/^\d{1,3}(?:\.\d{1,2})?$/.test(d.prozent)?Number(d.prozent):NaN;
  if(days===null||!Number.isFinite(p)||p>100||p<0||!grand||!d.basis||d.basis.cents!==grand.cents){hinweise.push('Skontobedingung mit abweichender Basis oder unvollständiger Frist – bitte manuell prüfen.');return;}
  felder['ziel'+(i+1)+'_tage']=days;felder['ziel'+(i+1)+'_skonto']=p.toFixed(2).replace('.',',');belege['ziel'+(i+1)+'_tage']=belege['ziel'+(i+1)+'_skonto']='XML-Skontostufe bis '+d.datum+', '+d.prozent+' %';
 });
 const means=children(settlement,'SpecifiedTradeSettlementPaymentMeans'),paymentCodes=[...new Set(means.map(m=>txt(m,'TypeCode')).filter(Boolean))];
 if(paymentCodes.length===1){if(['30','58'].includes(paymentCodes[0]))felder.zahlungsart='ueberweisung';if(['49','59'].includes(paymentCodes[0]))felder.zahlungsart='abbuchung';}
 else if(paymentCodes.length>1)hinweise.push('Mehrere Zahlungsarten in der XML – bitte prüfen.');
 const ibans=[...new Set(means.map(m=>txt(m,'PayeePartyCreditorFinancialAccount','IBANID').replace(/\s/g,'').toUpperCase()).filter(s=>/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(s)))];
 const party=n=>({name:txt(n,'Name').slice(0,500),id:txt(n,'ID').slice(0,100),strasse:txt(n,'PostalTradeAddress','LineOne').slice(0,500),plz:txt(n,'PostalTradeAddress','PostcodeCode').slice(0,40),ort:txt(n,'PostalTradeAddress','CityName').slice(0,200),land:txt(n,'PostalTradeAddress','CountryID').slice(0,10)});
 const items=children(trans,'IncludedSupplyChainTradeLineItem');if(items.length>1000)fail('Mehr als 1.000 Rechnungspositionen – automatische Übernahme abgebrochen.');
 const positionen=items.map(item=>{const product=one(item,'SpecifiedTradeProduct'),lineSettlement=one(item,legacy?'SpecifiedSupplyChainTradeSettlement':'SpecifiedLineTradeSettlement'),delivery=one(item,legacy?'SpecifiedSupplyChainTradeDelivery':'SpecifiedLineTradeDelivery'),quantity=one(delivery,'BilledQuantity'),lineSum=one(lineSettlement,'SpecifiedTradeSettlementLineMonetarySummation');return{nummer:txt(item,'AssociatedDocumentLineDocument','LineID').slice(0,50),name:txt(product,'Name').slice(0,500),menge:value(quantity).slice(0,50),einheit:quantity?.attrs.unitCode||'',netto:value(one(lineSum,'LineTotalAmount')).slice(0,50)};});
 const steuern=children(settlement,'ApplicableTradeTax').map(n=>({art:txt(n,'TypeCode'),kategorie:txt(n,'CategoryCode'),satz:txt(n,legacy?'ApplicablePercent':'RateApplicablePercent'),basis:txt(n,'BasisAmount'),betrag:txt(n,'CalculatedAmount')}));
 const profile=txt(one(root,legacy?'SpecifiedExchangedDocumentContext':'ExchangedDocumentContext'),'GuidelineSpecifiedDocumentContextParameter','ID');
 return{rechnung:true,felder,belege,hinweise,ibans,struktur:{format,profil:profile.slice(0,500),typ:type,waehrung:currency,lieferant:party(one(agreement,'SellerTradeParty')),empfaenger:party(one(agreement,'BuyerTradeParty')),kaeuferreferenz:txt(agreement,'BuyerReference').slice(0,500),zahlungsreferenz:txt(settlement,'PaymentReference').slice(0,500),zahlungsbedingungen:terms.map(t=>txt(t,'Description').slice(0,2000)),positionen,steuern,summen:{brutto:grand?.value||'',zahlbetrag:due?.value||'',vorauszahlung:prepaid?.value||'',steuerbasis:basis?.value||'',steuer:tax?.value||'',rundung:rounding?.value||''},iban:ibans},methode:format+' (XML)'};
}
module.exports={parseZugferd,MAX_XML};
