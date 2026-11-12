'use strict';
const PDFDocument=require('pdfkit'),path=require('node:path'),STATI=require('../public/js/hwa-status');
const clean=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''),date=v=>v?String(v).split('-').reverse().join('.'):'';
async function erstellen(s){return new Promise((resolve,reject)=>{
 const r=s.auftrag,a=r.auftrag,d=s.daten,f=s.firma.daten,nr=r.hp_nummer||'CA-'+r.id,code=a.status_code||'004',status=STATI[code],L=45,W=505,R=L+W;
 const doc=new PDFDocument({size:'A4',margins:{top:90,bottom:95,left:L,right:45},autoFirstPage:false,bufferPages:true,info:{Title:status.text+' - Handwerkerauftrag '+nr,Author:f.name,Creator:'CuraAedificii',Subject:r.titel}}),parts=[];
 doc.on('data',b=>parts.push(b));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(parts)));
 try{
  doc.registerFont('Noto',path.join(__dirname,'../assets/fonts/NotoSans-Regular.ttf'));
  const font=()=>doc.font('Noto').fontSize(10).fillColor('#111111'),footer=[f.name,f.anschrift,[f.telefon,f.email,f.website].filter(Boolean).join(' | '),f.fusszeile].filter(Boolean).join('\n');
  doc.font('Noto').fontSize(7);const footerH=doc.heightOfString(clean(footer),{width:W,lineGap:0}),BOTTOM=Math.max(70,footerH+37);let count=0;
  const logo=doc.openImage(s.firma.logo);
  doc.on('pageAdded',()=>{count++;doc.page.margins.bottom=BOTTOM;doc.save();doc.image(logo,count===1?335:425,count===1?28:20,{fit:count===1?[215,58]:[125,35],align:'right'});doc.font('Noto').fontSize(count===1?10:8).fillColor('#333333').text(clean(f.name),L,count===1?45:28,{width:265});if(count>1)doc.fontSize(8).text('Handwerkerauftrag '+nr,L,47,{width:300});doc.restore();font();doc.x=L;doc.y=count===1?118:88;});
  const page=()=>doc.addPage(),ensure=h=>{if(doc.y+h>doc.page.height-BOTTOM)page();};
  const para=(v,size=10)=>{font();doc.fontSize(size).text(clean(v),L,doc.y,{width:W,lineGap:2,paragraphGap:4});doc.moveDown(.55);};
  const heading=(v,size=11)=>{ensure(45);doc.font('Helvetica-Bold').fontSize(size).fillColor('#111111').text(clean(v),L,doc.y,{width:W});doc.moveDown(.45);font();};
  page();
  doc.font('Noto').fontSize(6.7).text(clean([f.name,...f.anschrift.split('\n')].join(' - ')),L,117,{width:270});
  doc.fontSize(10).text(clean(d.handwerker_anschrift),L,150,{width:255,lineGap:1});const addrEnd=doc.y;
  doc.font('Helvetica-Bold').fontSize(12).text(clean(status.text),318,150,{width:232,underline:true});let y=doc.y+14;
  for(const [key,value] of [['Auftragsnummer',nr],['Status',code],['Ansprechpartner',d.ansprechpartner],['Durchwahl',d.durchwahl],['E-Mail',d.email]]){if(!value)continue;doc.font('Noto').fontSize(8.5);const h=Math.max(doc.heightOfString(clean(value),{width:133,lineGap:1}),12);doc.text(key,318,y,{width:93}).text(clean(value),417,y,{width:133,lineGap:1});y+=h+4;}
  doc.font('Noto').fontSize(9).text(date(d.datum),318,y+4,{width:232});doc.y=Math.max(270,addrEnd+22,doc.y+22);doc.x=L;
  heading(({normal:'Normalauftrag',eilauftrag:'Eilauftrag',notdienst:'Notdienst',angebot:'Angebotsanfrage'}[a.auftragsart]||'Handwerkerauftrag'),10);heading(r.titel,11);if(a.betreff2)para(a.betreff2);
  const obj=a.objekt,objekt=[obj?.strasse||obj?.bezeichnung,[obj?.plz,obj?.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  para('Objekt '+(obj?.nummer||'')+'   '+objekt+(a.einheit?'\nEinheit '+a.einheit.nummer+'  '+a.einheit.bezeichnung:''),9.5);
  const billing=a.rechnungsempfaenger_drucken!==false?d.rechnungsempfaenger:'',performance=a.leistungsempfaenger_drucken!==false?d.leistungsempfaenger:'';
  for(const [label,value] of [['Angebots-/Rechnungsstellung an:',billing],['Leistungsempfänger:',performance]])if(value){font();const height=doc.heightOfString(clean(value+'\n\nc/o '+f.name+'\n'+f.anschrift),{width:232})+28;ensure(Math.min(height,300));const yy=doc.y;doc.font('Helvetica-Bold').fontSize(9.5).text(label,318,yy,{width:232});font();doc.fontSize(9).text(clean(value+(label.startsWith('Angebots')?'\n\nc/o '+f.name+'\n'+f.anschrift:'')),318,doc.y+5,{width:232,lineGap:1});doc.y+=12;doc.x=L;}
  para('Sehr geehrte Damen und Herren,');para(d.einleitung);heading(['003','004','011'].includes(code)?'A u f t r a g:':'Leistungsbeschreibung:');para(d.auftragstext);
  if(a.betrag)para('Auftragsbetrag: '+a.betrag+' EUR');if(r.faellig_am)para((['001','002'].includes(code)?'Wir bitten um Ihr Angebot bis spätestens ':'Wir bitten um Rückmeldung und Erledigung bis spätestens ')+date(r.faellig_am)+'.');
  if(s.kontakte.length)para('Zwecks Terminvereinbarung setzen Sie sich bitte mit einer der in der Kontaktanlage genannten Personen in Verbindung.');
  if(d.hinweise)para(d.hinweise,9);para('Bei Rückfragen wenden Sie sich bitte an den oben genannten Ansprechpartner unseres Hauses.\n\nMit freundlichen Grüßen\n\n'+f.name+'\nIm Auftrag',9.5);
  if(s.kontakte.length){ensure(170);heading('Anlage Kontaktadressen zum Schreiben vom '+date(d.datum),11);para('Auftragsnummer '+nr+'\nObjekt: '+objekt+'\n'+r.titel,9.5);doc.moveTo(L,doc.y).lineTo(R,doc.y).lineWidth(.6).strokeColor('#333333').stroke();doc.moveDown(.7);
   for(const p of s.kontakte){ensure(100);heading(p.bezeichnung||'Ansprechpartner',10);para(p.anschrift||p.name,9);for(const t of p.telefone)para((t.art||'Telefon')+': '+t.nummer+(t.bemerkung?' · '+t.bemerkung:''),9);for(const e of p.emails)para('E-Mail: '+e.adresse,9);doc.moveTo(L,doc.y).lineTo(R,doc.y).lineWidth(.4).strokeColor('#B9B9B9').stroke();doc.moveDown(.7);}
  }
  const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.moveTo(L,doc.page.height-BOTTOM+12).lineTo(R,doc.page.height-BOTTOM+12).lineWidth(.5).strokeColor('#444444').stroke();doc.font('Noto').fontSize(7).fillColor('#444444').text(clean(footer),L,doc.page.height-BOTTOM+18,{width:W,lineGap:0});doc.fontSize(7).text('HWA '+nr,L,doc.page.height-18,{width:300,lineBreak:false}).text('Seite '+(i+1)+' von '+range.count,435,doc.page.height-18,{width:115,align:'right',lineBreak:false});}
  doc.end();
 }catch(e){doc.destroy();reject(e);}
});}
module.exports={erstellen};
