'use strict';
const Q=require('./stimmbruch');
const clean=s=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''),date=s=>s?String(s).split('-').reverse().join('.'):'Nicht erfasst';
function zeichnen(doc,s){
 const v=s.versammlung,d=s.daten,groups=s.register.gruppen,represented=groups.filter(g=>['selbst','vollmacht'].includes(s.teilnahme.daten[g.key]?.teilnahme)),ort=[v.ort,v.ort_strasse,[v.ort_plz,v.ort_stadt].filter(Boolean).join(' ')].filter(Boolean).join(', ');
 let mea='Miteigentumsanteile: Nicht vollständig erfasst.';
 if(s.teilnahme.revision&&groups.length&&groups.every(g=>g.mea_vollstaendig)){const sum=list=>list.reduce((n,g)=>Q.add(n,Q.parse(g.mea,true)),Q.q(0n));mea='bzw. deren bevollmächtigte Vertreter mit insgesamt '+Q.str(sum(represented))+' von '+Q.str(sum(groups))+' Miteigentumsanteilen.';}
 const blocks=[
  'der Eigentümergemeinschaft: '+(v.objekt_bezeichnung||'Nicht angegeben')+' (Objekt '+v.objekt_nummer+')\nüber die Eigentümerversammlung '+v.name,
  'Datum: '+date(v.datum),
  'Ort: '+(ort||'Nicht erfasst'),
  'Zeit: '+(d.beginn?d.beginn+' Uhr':'Nicht erfasst')+' bis '+(d.ende?d.ende+' Uhr':'Nicht erfasst'),
  'Anwesend waren:',
  'a) von der Verwaltung:\n'+(d.verwaltung_anwesend||'Nicht erfasst'),
  'b) von den Wohnungseigentümern:\n'+(d.wohnungseigentuemer||'Nicht erfasst')+' stimmberechtigte Wohnungseigentümer\n'+(d.teileigentuemer||'Nicht erfasst')+' stimmberechtigte Garagen-/Teileigentümer\n'+mea,
  d.teilnehmer_anlage?'Die Anwesenheit und Vollmachtsnachweise sind in der Anlage dokumentiert. Originalvollmachten werden gesondert aufbewahrt.':'Anwesenheitsliste / Vollmachten: Keine Teilnehmeranlage ausgewählt.',
  d.einladung_festgestellt?'Vor Beginn der Versammlung wurde die ordnungsgemäße Einladung festgestellt.':'Feststellung der ordnungsgemäßen Einladung: Noch nicht bestätigt.',
  d.beschlussfaehigkeit_festgestellt?'Vor Beginn der Versammlung wurde die Beschlussfähigkeit festgestellt.':'Feststellung der Beschlussfähigkeit: Noch nicht bestätigt.',
  'Über die gefassten Beschlüsse wurde eine Niederschrift gefertigt.',
  null,
  d.beschluesse_verlesen?'Der Vorsitz dieser Versammlung hat die Beschlüsse vorgelesen und die Ergebnisse der Abstimmungen bekanntgegeben.':'Verlesen der Beschlüsse und Bekanntgabe der Abstimmungsergebnisse: Noch nicht bestätigt.'
 ];
 if(d.modus==='entwurf')blocks.push('ENTWURF - Angaben und Feststellungen sind vor der Unterzeichnung zu prüfen.');
 if(s.teilnahme_historisch)blocks.push('ACHTUNG: Eigentümerstand seit Speicherung der Teilnehmerliste geändert.');
 doc.font('Noto').fontSize(22).fillColor('#56327E').text('Niederschrift',52,67,{width:491.28,align:'center'});
 const measure=size=>{doc.font('Noto').fontSize(size);return blocks.reduce((h,t)=>h+doc.heightOfString(clean(t??'Anzahl der Seiten: 00000'),{width:491.28,lineGap:2})+8,0);};
 let size=10.5;while(size>8&&measure(size)>528)size-=.25;
 let y=119,countPos;
 doc.font('Noto').fontSize(size).fillColor('#252332');
 for(const t of blocks){const value=clean(t??'Anzahl der Seiten: 00000'),h=doc.heightOfString(value,{width:491.28,lineGap:2});if(t===null)countPos={y,size};else doc.text(value,52,y,{width:491.28,lineGap:2});y+=h+8;}
 const roles=[['Verwaltungsbeirat',v.beirat_name],['Vorsitz / Versammlungsleitung',v.leitung_name],['Wohnungseigentümer/in',v.unterzeichner_name]];
 roles.forEach(([label,name],i)=>{const x=52+i*168;doc.moveTo(x,706).lineTo(x+151,706).lineWidth(.5).strokeColor('#9C91AB').stroke();doc.font('Noto').fontSize(8).fillColor('#252332').text(label,x,713,{width:151,lineGap:1});doc.text(clean(name||'Name: __________________'),x,743,{width:151,lineGap:1});});
 doc.x=52;doc.y=776;return countPos;
}
module.exports={zeichnen};
