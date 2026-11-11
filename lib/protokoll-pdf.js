'use strict';
const PDFDocument=require('pdfkit'),path=require('node:path'),Q=require('./stimmbruch');
const STATUS={offen:'Noch nicht erfasst',angenommen:'Angenommen',abgelehnt:'Abgelehnt',nicht_abgestimmt:'Keine Abstimmung',vertagt:'Vertagt',besprechung:'Besprechung ohne Beschlussfassung'},PRINZIP={kopf:'Köpfe',mea:'Miteigentumsanteile (MEA)',einheiten:'Einheiten'};
const clean=s=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''),date=s=>s?String(s).split('-').reverse().join('.'):'Nicht erfasst';
async function erstellen(s){return new Promise((resolve,reject)=>{
 const v=s.versammlung,d=s.daten,draft=d.modus==='entwurf',doc=new PDFDocument({size:'A4',margins:{top:76,bottom:58,left:52,right:52},bufferPages:true,autoFirstPage:false,info:{Title:'Versammlungsprotokoll - '+v.name,Author:d.protokollfuehrung||v.leitung_name||'CuraAedificii',Creator:'CuraAedificii'}}),parts=[];
 doc.on('data',c=>parts.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(parts)));
 try{
 doc.registerFont('Noto',path.join(__dirname,'../assets/fonts/NotoSans-Regular.ttf'));const W=491.28,accent='#56327E',reset=()=>doc.font('Noto').fontSize(10.5).fillColor('#252332');
 doc.on('pageAdded',()=>{doc.save();doc.font('Noto').fontSize(11).fillColor(accent).text('Niederschrift',52,27,{width:W,lineBreak:false});doc.fontSize(8).fillColor('#666473').text(draft?'PROTOKOLL - ENTWURF':'PROTOKOLL - ZUR UNTERZEICHNUNG',290,30,{width:253,align:'right',lineBreak:false});doc.moveTo(52,51).lineTo(543,51).lineWidth(.7).strokeColor('#DED8E8').stroke();doc.restore();doc.x=52;doc.y=76;reset();});
 const page=()=>doc.addPage(),ensure=h=>{if(doc.y+h>doc.page.height-58)page();};
 const para=(t,size=10.5)=>{reset();doc.fontSize(size).text(clean(t),52,doc.y,{width:W,lineGap:3,paragraphGap:4});doc.moveDown(.55);};
 const heading=(t,size=15)=>{doc.font('Noto').fontSize(size);ensure(Math.min(180,doc.heightOfString(clean(t),{width:W}))+35);doc.font('Noto').fontSize(size).fillColor(accent).text(clean(t),52,doc.y,{width:W,lineGap:2});doc.moveDown(.5);reset();};
 const ort=[v.ort,v.ort_strasse,[v.ort_plz,v.ort_stadt].filter(Boolean).join(' ')].filter(Boolean).join(', '),objekt='Objekt '+v.objekt_nummer+' - '+v.objekt_bezeichnung;
 page();heading('Niederschrift',21);para(v.name,13);para(objekt+'\nVersammlungsdatum: '+date(v.datum)+'\nBeginn: '+(d.beginn?d.beginn+' Uhr':'Nicht erfasst')+' | Ende: '+(d.ende?d.ende+' Uhr':'Nicht erfasst')+'\nVersammlungsort / Raum: '+(ort||'Nicht erfasst')+'\nVersammlungsleitung: '+(v.leitung_name||'Nicht angegeben')+'\nProtokollführung: '+(d.protokollfuehrung||'Nicht angegeben'));
 if(draft){heading('Entwurfsstand',11);para('Dieses Dokument ist ein Entwurf. Noch nicht bestätigte Beschlusstexte und fehlende oder historische Auszählungen sind entsprechend gekennzeichnet.',9);}
 if(s.hinweise.length){heading('Noch zu ergänzen / zu prüfen',11);for(const h of s.hinweise)para('- '+h,9);}
 heading('Teilnahme',13);
 if(!s.teilnahme.revision)para('Noch keine Teilnehmerliste gespeichert.',9.5);else{
 const groups=s.register.gruppen,records=groups.map(g=>s.teilnahme.daten[g.key]||{}),personal=new Set(records.flatMap(r=>r.anwesende_eigentuemer||[]));
 para('Gespeicherte Teilnehmerliste: Version '+s.teilnahme.revision+' | '+s.teilnahme.geaendert_am+'\nEigentümergruppen insgesamt: '+groups.length+' | selbst anwesend: '+records.filter(r=>r.teilnahme==='selbst').length+' | per Vollmacht vertreten: '+records.filter(r=>r.teilnahme==='vollmacht').length+' | nicht teilgenommen: '+records.filter(r=>r.teilnahme==='abwesend').length+' | nicht erfasst: '+records.filter(r=>!r.teilnahme).length+'\nPersönlich anwesende Eigentümer (namentlich erfasst): '+personal.size,9.5);
 if(groups.every(g=>g.mea_vollstaendig)){const total=groups.reduce((sum,g)=>Q.add(sum,Q.parse(g.mea,true)),Q.q(0n)),present=groups.filter(g=>['selbst','vollmacht'].includes(s.teilnahme.daten[g.key]?.teilnahme)).reduce((sum,g)=>Q.add(sum,Q.parse(g.mea,true)),Q.q(0n));para('Anwesend oder vertreten: '+records.filter(r=>['selbst','vollmacht'].includes(r.teilnahme)).length+' Eigentümergruppe(n) mit insgesamt '+Q.str(present)+' von '+Q.str(total)+' MEA.',9.5);}else para('MEA sind nicht vollständig hinterlegt; eine Gesamt-MEA wird nicht geschätzt.',9);
 if(s.teilnahme_historisch)para('Achtung: Der aktuelle Eigentümerstand weicht von der gespeicherten Teilnehmerliste ab.',9);
 }
 if(d.einleitung){heading('Eröffnung / allgemeiner Verlauf',13);para(d.einleitung);}
 page();heading('Tagesordnung und Beschlüsse',18);
 if(!s.tops.length)para('Noch keine Tagesordnungspunkte erfasst.');
 for(const t of s.tops){const x=d.tops.find(x=>x.id===t.id);ensure(90);heading('TOP '+t.position+' - '+t.titel,13);para(t.art==='beschluss'?'Beschlussfassung':'Besprechung',9);
 if(t.erlaeuterung){heading('Erläuterung aus der Tagesordnung',10.5);para(t.erlaeuterung);}
 if(x.verlauf){heading('Verlauf / Beratung',10.5);para(x.verlauf);}
 if(t.art==='beschluss'){
 heading(['vertagt','nicht_abgestimmt'].includes(x.beschlussstatus)?'Vorgesehener Beschlussvorschlag - nicht zur Entscheidung gelangt':x.wortlaut_geprueft?'Bestätigter Beschlusswortlaut / Abstimmungsgegenstand':'Beschlussentwurf - Wortlaut noch nicht bestätigt',10.5);para(x.beschlusswortlaut||'Noch kein Beschlusswortlaut erfasst.');
 heading('Verkündetes Ergebnis',10.5);para(STATUS[x.beschlussstatus]);
 }
 if(t.auszaehlung){const a=t.auszaehlung,r=a.ergebnis,z=r.summen;
 heading(t.historisch?'Historische gespeicherte Auszählung':'Gespeicherte Auszählung',10.5);if(t.historisch)para('TOP, Eigentümerstand oder Abstimmungsregel wurden seit dieser Auszählung geändert. Dieser Stand wurde nicht als aktuelle Auszählung übernommen.',9);
 para('Version '+a.revision+' | '+a.erstellt_am+' | erfasst von '+(a.benutzer||'Nicht angegeben')+'\nStimmprinzip: '+(PRINZIP[r.prinzip]||r.prinzip)+'\nRechnerisches Ergebnis: '+({angenommen:'Angenommen',abgelehnt:'Abgelehnt',keine_gueltige_stimme:'Keine gültige Ja-/Nein-Stimme'}[r.status]||r.status),9.5);
 para('Ja: '+z.ja+' | Nein: '+z.nein+' | Enthaltungen: '+z.enthaltung+'\nUngültig: '+z.ungueltig+' | Nicht abgegeben: '+z.ohne_stimme+'\nStimmberechtigt: '+z.berechtigt+' | Anwesend / vertreten: '+z.vertreten+' | Ausgeschlossen: '+z.ausgeschlossen,9.5);
 para('Auszählungsregel: '+r.berechnung+'\nGrundlage: '+r.grundlage,9);
 if(r.mea_quorum!==null)para('Ja-MEA: '+z.ja_mea+' | Alle MEA: '+z.alle_mea+' | Zusätzliches MEA-Quorum: '+(r.mea_quorum?'Erreicht':'Nicht erreicht'),9);
 const exclusions=r.details.filter(r=>r.ausgeschlossen);for(const e of exclusions)para('Stimmrechtsausschluss für diesen TOP: '+e.name+' - '+e.ausschlussgrund,9);
 }else if(t.art==='beschluss')para('Keine gespeicherte Auszählung für diesen TOP.',9.5);
 if(x.abweichung){heading('Erläuterung zum Ergebnis / zur Abweichung',10.5);para(x.abweichung);}doc.moveDown(.8);
 }
 if(d.schluss){heading('Abschluss der Versammlung',13);para(d.schluss);}
 ensure(210);heading('Unterzeichnungen',15);para('Die nachstehenden Felder sind zur Unterzeichnung vorgesehen. Dieses PDF enthält keine elektronischen Unterschriften.',9);
 const sign=(label,name)=>{ensure(70);para(label+(name?' - '+name:''),9.5);doc.moveDown(.7);doc.moveTo(52,doc.y).lineTo(400,doc.y).lineWidth(.5).strokeColor('#9C91AB').stroke();doc.moveDown(.7);};
 sign('Vorsitz / Versammlungsleitung',v.leitung_name);sign('Wohnungseigentümer/in',v.unterzeichner_name);sign('Falls ein Verwaltungsbeirat bestellt ist: Vorsitz oder Vertretung',v.beirat_name);if(d.protokollfuehrung)sign('Protokollführung (zusätzlich)',d.protokollfuehrung);
 if(d.teilnehmer_anlage){page();heading('Anlage - Teilnehmer und Vollmachten',17);para(objekt+' | '+date(v.datum),9.5);if(!s.teilnahme.revision)para('Noch keine Teilnehmerliste gespeichert.');
 for(const g of s.register.gruppen){const a=s.teilnahme.daten[g.key]||{};ensure(80);heading(g.name,11);para('Einheiten: '+g.einheiten.map(u=>u.nummer||u.bezeichnung).join(', ')+'\nTeilnahme: '+({selbst:'Selbst anwesend',vollmacht:'Durch Vollmacht vertreten',abwesend:'Nicht teilgenommen'}[a.teilnahme]||'Nicht erfasst'),9.5);const names=g.eigentumer.filter(o=>(a.anwesende_eigentuemer||[]).includes(o.id)).map(o=>o.name);if(names.length)para('Persönlich anwesend: '+names.join(', '),9);if(a.teilnahme==='vollmacht')para('Bevollmächtigte Person: '+a.vertreter+'\nVollmachtsnachweis: '+a.nachweis+' | Textform geprüft: '+(a.vollmacht_textform?'Ja':'Nein'),9);}
 }
 const range=doc.bufferedPageRange();for(let i=range.start;i<range.start+range.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Noto').fontSize(8).fillColor('#666473').text('Objekt '+v.objekt_nummer+(draft?' | ENTWURF':''),52,810,{width:300,lineBreak:false}).text('Seite '+(i+1)+' von '+range.count,400,810,{width:143,align:'right',lineBreak:false});doc.page.margins.bottom=bottom;}doc.end();
 }catch(e){doc.destroy();reject(e);}
 });}
module.exports={erstellen};
