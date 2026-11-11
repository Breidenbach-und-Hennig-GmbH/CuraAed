'use strict';
const PDFDocument=require('pdfkit'),path=require('node:path');
const FONT=path.join(__dirname,'../assets/fonts/NotoSans-Regular.ttf');
const date=s=>s?String(s).split('-').reverse().join('.'):'',clean=s=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
async function erstellen(s){return new Promise((resolve,reject)=>{
 const v=s.versammlung,d=s.daten,doc=new PDFDocument({size:'A4',margins:{top:76,bottom:58,left:52,right:52},bufferPages:true,autoFirstPage:false,info:{Title:'Einladung - '+v.name,Author:d.absender,Subject:'Eigentümerversammlung, Tagesordnung und Vollmacht',Creator:'CuraAedificii'}}),parts=[];
 doc.on('data',c=>parts.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(parts)));
 try{
 doc.registerFont('Noto',FONT);const W=491.28,accent='#56327E';
 const reset=()=>doc.font('Noto').fontSize(10.5).fillColor('#252332');
 doc.on('pageAdded',()=>{doc.save();doc.font('Noto').fontSize(11).fillColor(accent).text('CuraAedificii',52,27,{width:W,lineBreak:false});doc.fontSize(8).fillColor('#666473').text('Eigentümerversammlung',340,30,{width:203,align:'right',lineBreak:false});doc.moveTo(52,51).lineTo(543,51).strokeColor('#DED8E8').lineWidth(0.7).stroke();doc.restore();doc.x=52;doc.y=76;reset();});
 const page=()=>doc.addPage(),ensure=h=>{if(doc.y+h>doc.page.height-58)page();};
 const para=(t,size=10.5)=>{reset();doc.fontSize(size).text(clean(t),52,doc.y,{width:W,lineGap:3,paragraphGap:5});doc.moveDown(.55);};
 const heading=(t,size=18)=>{doc.font('Noto').fontSize(size);ensure(Math.min(150,doc.heightOfString(clean(t),{width:W}))+36);doc.font('Noto').fontSize(size).fillColor(accent).text(clean(t),52,doc.y,{width:W,lineGap:2});doc.moveDown(.5);reset();};
 const ort=[v.ort,v.ort_strasse,[v.ort_plz,v.ort_stadt].filter(Boolean).join(' ')].filter(Boolean).join(', '),objekt='Objekt '+v.objekt_nummer+' - '+v.objekt_bezeichnung;
 page();para(d.absender,11);if(d.anschrift)para(d.anschrift,9);para('An die Eigentümerinnen und Eigentümer\n'+objekt,10);para('Einladungsdatum: '+date(d.datum),9);
 heading('Einladung zur Eigentümerversammlung');para(v.name,12);para(d.einleitung);
 heading('Ihre Versammlung',12);para('Gemeinschaft: '+objekt+'\nTermin: '+date(v.datum)+' um '+v.uhrzeit+' Uhr\nVersammlungsart: '+({praesenz:'Präsenz',online:'Online',hybrid:'Hybrid'}[v.art]||v.art)+'\nVersammlungsort / Raum: '+ort+'\nVersammlungsleitung: '+v.leitung_name);
 if(v.ort_beschreibung)para('Hinweise zum Versammlungsort: '+v.ort_beschreibung,9.5);
 para(d.schluss);para(d.absender);para('Anlagen: Tagesordnung und Vollmachtsformular',9);
 page();heading('Tagesordnung');para(v.name+'\n'+objekt+'\n'+date(v.datum)+' um '+v.uhrzeit+' Uhr',9.5);
 for(const t of s.tops){ensure(75);heading('TOP '+t.position+' - '+t.titel,12);para(t.art==='beschluss'?'Beschlussfassung':'Besprechung',9);if(t.erlaeuterung)para(t.erlaeuterung);if(t.beschlussvorschlag){ensure(45);heading('Beschlussvorschlag',10.5);para(t.beschlussvorschlag);}doc.moveDown(.5);}
 page();heading('Vollmacht zur Eigentümerversammlung');para(v.name+'\n'+objekt+'\nTermin: '+date(v.datum)+' um '+v.uhrzeit+' Uhr\nOrt: '+ort,9);
 para('Hiermit bevollmächtige(n) ich/wir die nachstehend benannte Person, mich/uns in der oben bezeichneten Versammlung zu vertreten und mein/unser Stimmrecht auszuüben. Diese Vollmacht gilt ausschließlich für diese Versammlung.',9.5);
 doc.font('Helvetica');doc.initForm();
 const field=(name,label,height=23,multiline=false)=>{ensure(height+34);reset();doc.fontSize(9).text(label,52,doc.y,{width:W});const y=doc.y+4;doc.save().rect(52,y,W,height).lineWidth(.6).strokeColor('#9C91AB').stroke().restore();doc.font('Helvetica').formText(name,54,y+2,W-4,height-4,{multiline,fontSize:10,borderColor:'#FFFFFF',backgroundColor:'#FFFFFF',value:''});doc.y=y+height+10;doc.x=52;reset();};
 field('vollmachtgeber','Vollmachtgeber/in - alle gemeinschaftlichen Eigentümer benennen',30,true);field('einheiten','Einheit(en) / Wohnungsnummer(n)');field('bevollmaechtigte_person','Bevollmächtigte Person - Vor- und Nachname');field('anschrift','Anschrift / Kontakt der bevollmächtigten Person',30,true);field('weisungen','Besondere Weisungen / Umfang der Vollmacht',48,true);field('ort_datum','Ort und Datum der Erteilung');field('erteilende_namen','Name(n) der erteilenden Person(en) / bei Papierausfertigung Unterschrift(en)',28,true);
 para('Bitte die Vertretungsregelungen der Gemeinschaft beachten. Gemeinschaftliche Eigentümer können ihr Stimmrecht nur einheitlich ausüben. Die Vollmacht ist in Textform zu erteilen. Das Formular kann digital ausgefüllt oder ausgedruckt werden.',8);
 const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.save();doc.font('Noto').fontSize(8).fillColor('#666473').text('Objekt '+v.objekt_nummer,52,810,{width:300,lineBreak:false}).text('Seite '+(i+1)+' von '+range.count,400,810,{width:143,align:'right',lineBreak:false});doc.restore();doc.page.margins.bottom=bottom;}doc.end();
 }catch(e){doc.destroy();reject(e);}
 });}
module.exports={erstellen};
