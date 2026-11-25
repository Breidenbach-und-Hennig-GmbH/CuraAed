'use strict';
const path=require('node:path'),{ValidationError}=require('../lib/validation');
const felder=require('../lib/vermoegensstatusFelder.json').flatMap(g=>g.felder);
function erstellen(r){
 if(!r.version)throw new ValidationError('Bitte zuerst den HP-Abrechnungsstand speichern.',409);
 if(r.veraltet)throw new ValidationError('Die Buchungen wurden seit der Übernahme geändert. Bitte den Saldenabgleich erneut prüfen und speichern.',409);
 if(r.berechnung.fehlend.length)throw new ValidationError('Noch nicht belegte Werte: '+r.berechnung.fehlend.join(', '));
 const book={Sheets:Object.fromEntries(['Vermögensstatus','Giroabgleich','HP-Abrechnungsstand','Saldenabgleich'].map(n=>[n,{}]))},w=r.werte,calc=r.berechnung,source=book.Sheets['HP-Abrechnungsstand'],map={};
 function value(sheet,cell,v){const old=sheet[cell]||{};sheet[cell]={...old,t:typeof v==='number'?'n':'s',v:v??'nicht belegt'};delete sheet[cell].f;}
 function formula(sheet,cell,f,v){const old=sheet[cell]||{};sheet[cell]={...old,f,t:typeof v==='number'?'n':'s',v:v??'nicht belegt'};}
 const fmt='#,##0.00;[Red](#,##0.00);0.00';
 for(const [i,[key,,typ]]of felder.entries()){const row=i+6;map[key]='B'+row;const rollen=r.kontorollen?.[key];value(source,'B'+row,rollen?(rollen.length===1?rollen[0]:rollen.length?rollen.length+' Konten':'nicht vorhanden'):w[key]);source['B'+row].z=typ==='konto'?'0':fmt;value(source,'C'+row,r.nur_hp?(rollen?'HP-Kontorolle; Details im Saldenabgleich':'Nachgewiesener HP-Exportstand'):typ==='konto'?'Kontozuordnung':'HP-Original / ergänzende Vorlage');}
 const sourceLink=(s,cell,k,sign=1)=>{const ref="'HP-Abrechnungsstand'!"+map[k];formula(s,cell,`IF(ISNUMBER(${ref}),${sign<0?'-':''}${ref},"nicht belegt")`,w[k]==null?null:w[k]*sign);};
 for(const s of Object.values(book.Sheets)){value(s,'A3',`Objekt ${r.objekt.hp_nummern?.[0]||r.objekt.nummer} · ${r.objekt.bezeichnung}`);value(s,'A4',`01.01.${r.jahr} bis 31.12.${r.jahr} · EUR · HP-Abrechnungsstand / Version ${r.version}`);}
 for(const [i,q]of r.quellen.entries()){const n=45+i;value(source,'A'+n,q.typ);value(source,'B'+n,q.name);value(source,'C'+n,q.sha256);}
 value(source,'A57','Hinweise zum Abrechnungsstand');for(const [i,line]of (r.hinweis||'').match(/.{1,105}(?:\s|$)/g)?.entries()||[])value(source,'A'+(58+i),line.trim());
 const c=book.Sheets.Giroabgleich,m=book.Sheets['Vermögensstatus'];
 for(const [row,key,sign]of [[6,'giro_anfang',1],[7,'abgrenzung_vorjahr',1],[8,'abrechnung_vorjahr',1],[10,'verbindlichkeiten',1],[11,'forderungen',-1],[12,'hp_ruecklage',1],[13,'hp_spar',-1],[14,'offene_ruecklage_vorjahr',-1],[15,'offene_ruecklage_jahr',-1],[18,'hp_giro',1],[25,'hausgeld',1],[26,'ruecklage_zufuehrung',1],[27,'sonstige_einnahmen',1],[28,'entnahme_ruecklage',1],[29,'sonderkosten_einnahmen',1],[32,'bewirtschaftung',1],[33,'ruecklage_zufuehrung',1],[34,'sonderkosten_ausgaben',1],[38,'eigentuemer_guthaben',1]])sourceLink(c,'B'+row,key,sign);
 formula(c,'B30','IF(COUNT(B25:B29)=5,ROUND(SUM(B25:B29),2),"nicht belegt")',calc.einnahmen);formula(c,'B35','IF(COUNT(B32:B34)=3,ROUND(SUM(B32:B34),2),"nicht belegt")',calc.ausgaben);formula(c,'B37','IF(COUNT(B30,B35)=2,ROUND(B30-B35,2),"nicht belegt")',calc.ergebnis);formula(c,'B9','B37',calc.ergebnis);formula(c,'B17','IF(COUNT(B6:B15)=10,ROUND(SUM(B6:B15),2),"nicht belegt")',calc.giro_soll);formula(c,'B19','IF(COUNT(B17:B18)=2,ROUND(B17-B18,2),"nicht belegt")',calc.giro_differenz);formula(c,'B39','IF(COUNT(B37:B38)=2,ROUND(B38-B37,2),"nicht belegt")',calc.verteilungsdifferenz);
 for(const [row,key]of [[7,'hp_ruecklage'],[8,'sonstige_ruecklagen'],[11,'hp_giro'],[12,'hp_spar'],[13,'handkassen'],[17,'forderungen_anerkannt'],[18,'forderungen_nach_stichtag'],[19,'forderungen_nach_beschluss'],[23,'darlehen'],[24,'verbindlichkeiten'],[25,'guthaben_vorjahre'],[26,'sonstige_verbindlichkeiten'],[27,'eigentuemer_guthaben'],[28,'sicherheitseinbehalte'],[32,'bewegliches_vermoegen'],[33,'unbewegliches_vermoegen']])sourceLink(m,'B'+row,key);
 formula(m,'B14','IF(COUNT(B11:B13)=3,ROUND(SUM(B11:B13),2),"nicht belegt")',Math.round((w.hp_giro+w.hp_spar+w.handkassen)*100)/100);
 formula(m,'B20','IF(COUNT(B17:B19)=3,ROUND(SUM(B17:B19),2),"nicht belegt")',Math.round((w.forderungen_anerkannt+w.forderungen_nach_stichtag+w.forderungen_nach_beschluss)*100)/100);
 formula(m,'B29','IF(COUNT(B23:B27)=5,ROUND(SUM(B23:B28),2),"nicht belegt")',Math.round((w.darlehen+w.verbindlichkeiten+w.guthaben_vorjahre+w.sonstige_verbindlichkeiten+w.eigentuemer_guthaben+(w.sicherheitseinbehalte??0))*100)/100);
 sourceLink(m,'B36','hp_giro');formula(m,'B36',`IF(COUNT('HP-Abrechnungsstand'!${map.hp_giro},'HP-Abrechnungsstand'!${map.hp_spar},'HP-Abrechnungsstand'!${map.forderungen})=3,ROUND('HP-Abrechnungsstand'!${map.hp_giro}+'HP-Abrechnungsstand'!${map.hp_spar}+'HP-Abrechnungsstand'!${map.forderungen},2),"nicht belegt")`,Math.round((w.hp_giro+w.hp_spar+w.forderungen)*100)/100);
 value(m,'A37','Rücklage + Verbindlichkeiten + Ergebnis + Vorjahrsrest');
 value(m,'A40','Abstimmungsdifferenz');value(m,'A41','Bereits berücksichtigter Rest des Vorjahrsabgleichs');
 value(m,'A44','Der Vorjahrsrest entspricht F24 / E141 der gelieferten Excel-Vorlage.');
 formula(m,'B41',"IF(COUNT('Giroabgleich'!B6:B8)=3,ROUND(SUM('Giroabgleich'!B6:B8),2),\"nicht belegt\")",calc.vorjahrsrest);
 formula(m,'B38',"'Giroabgleich'!B37",calc.ergebnis);formula(m,'B37','IF(COUNT(B7,B24,B38,B41)=4,ROUND(B7+B24+B38+B41,2),"nicht belegt")',Math.round((w.hp_ruecklage+w.verbindlichkeiten+calc.ergebnis+calc.vorjahrsrest)*100)/100);formula(m,'B39',"'Giroabgleich'!B39",calc.verteilungsdifferenz);formula(m,'B40','IF(COUNT(B36:B37)=2,ROUND(B36-B37,2),"nicht belegt")',calc.bilanz_differenz);
 const s=book.Sheets.Saldenabgleich;for(const [i,k]of r.saldenabgleich.entries()){const n=i+6,rolle=r.kontorollen?Object.entries(r.kontorollen).find(([,ids])=>ids.includes(k.nummer))?.[0]:null;value(s,'A'+n,String(k.nummer));value(s,'B'+n,(rolle?({giro_konto:'Giro',spar_konto:'Spar-/Festgeld',ruecklage_konto:'Rücklage'}[rolle])+': ':'')+k.bezeichnung);value(s,'C'+n,k.hp==null?'nicht aufgeführt':k.hp/100);value(s,'D'+n,k.curaaed==null?(r.nur_hp?'nicht nachgewiesen':'keine Buchungen'):k.curaaed/100);
 if(k.hp!=null&&!(r.nur_hp&&k.curaaed==null))formula(s,'E'+n,`ROUND(IF(ISNUMBER(D${n}),D${n},0)-C${n},2)`,k.differenz==null?null:k.differenz/100);else value(s,'E'+n,null);
 value(s,'F'+n,r.nur_hp&&k.curaaed==null?'Kein CuraAed-Buchungsabgleich':k.hp!=null?(k.differenz===0?'stimmt überein':k.differenz==null?'Konto fehlt':'Abweichung'):k.curaaed==null?'nicht bebucht':k.curaaed===0?'Nullsaldo, nicht in HP-Liste':'HP-Nachweis fehlt');for(const col of ['C','D','E'])s[col+n].z=fmt;
 }s['!ref']='A1:F'+Math.max(6,r.saldenabgleich.length+5);
 book.Workbook=book.Workbook||{};book.Workbook.CalcPr={calcId:'0',fullCalcOnLoad:'1'};
 return require('../lib/xlsxVorlage').schreiben(path.join(__dirname,'../assets/vermoegensstatus.xlsx'),Object.values(book.Sheets));
}
module.exports={erstellen};
