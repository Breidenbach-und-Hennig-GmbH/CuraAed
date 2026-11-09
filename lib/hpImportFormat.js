'use strict';
const crypto=require('node:crypto');
const {ValidationError}=require('./validation');
// Reihenfolge ist Teil des Windows-/Server-Protokolls. Quellwerte sind Invariant-Text oder NULL.
const datasets=Object.assign(Object.create(null),{
 objekt:{keys:['ObjNr'],fields:'ObjNr,Suchbegr,ObjTyp,ObjStr,Land,PLZ,Ort,Baujahr,ZustVerkauf,ZustVerm,Heizungsart,WWArt,Garagenart,M_llGefArt,ObjGr1,ObjGr2,ObjGr3,ObjGr4,ObjGr5,ObjektID,GebBezeichnung,ObjektAlias,SB,Team,Objekttyp2,Objektstrasse_2,BuchhalterDesh,BuchhalterReserve,ObjTypText,Zustellpostamt,VSchlFREI,anzeigen_ja_nein'},
 objektzahlen:{keys:['ObjNr'],fields:'ObjNr,AnzGeb,AnzEin'},
 gebaeude:{keys:['IndGeb'],fields:'IndGeb,BezGeb'},
 jahr:{keys:['FIBJ_BJ'],fields:'FIBJ_BJ,FIBJ_BjVon,FIBJ_BjBis,FIBJ_gebBis,FIBJ_SB,FIBJ_Wahrung,FIBJ_VorstAbzQuote'},
 einheit:{keys:['WhgNr'],fields:'WhgNr,SuchBegr,WhgLage,IndGeb,IndBauteil,WhgTyp,WG_VSchl1,WG_VSchl2,WG_VSchl3,WG_VSchl4,WG_VSchl5,Whg_JN,GewEinhJN,TeilEigJN,BewKat,MwStoptJN,gefJN,MittelGetilgtJN,BindBis,WG_VwArt,WG_m2Fl,WG_GarNr,WG_StellPlNr,MEA,gilt_bis_Datum,Datum_Frei,MI_MinolFolgeNrHeizA,MIMinolWhgNr,DTA_OrdBgr13,CB_mit_Text_Frei,CB_mit_Text_Frei_1,CB_mit_Text_Frei_2'},
 funktion:{keys:['lfdNrDatensatz'],fields:'lfdNrDatensatz,PFKt,WhgNr,DatVon,DatBis,AdrNr,KEY_Firma,Info,PKto,FI_MieterPKto,PFktArtEigMiet,ST_SchlAustriaPKto,inaktiv,inaktivBis,MobileEnde,DatOptvon,DatOptbis,DatOptausueb'},
 konto:{keys:['PKtoNr'],fields:'PKtoNr,WhgNr,AdrNr,PKtoName,RefKtoNr,AK_Aktenzeichen'},
 schluessel:{keys:['BJ','VerteilerSchl'],fields:'BJ,VerteilerSchl,Typ_PW,SchlTxt,AbrObjAntSum,TabArt,Ger_teArt'},
 einheitsanteil:{keys:['Buchungsjahr','WhgNr','VSchl'],fields:'Buchungsjahr,WhgNr,VSchl,WhgAnteile'},
 kontenanteil:{keys:['BJ','PKtoNr','VSchl'],fields:'BJ,PKtoNr,VSchl,AntPers'},
 personenwert:{keys:['BJ','PKtoNr','VSchl','DatAnders'],fields:'BJ,PKtoNr,VSchl,DatAnders,Info,AnzPers,AnzTag'},
 personenjahr:{keys:['BJ','PKtoNr','VSchl','DatAnders'],fields:'BJ,PKtoNr,VSchl,DatAnders,BJ_Ubergreif'}
});
for(const d of Object.values(datasets))d.fields=d.fields.split(',');
const fail=m=>{throw new ValidationError(m,400);};
const part=v=>v===null?'-1:':Buffer.byteLength(v,'utf8')+':'+v;
function key(art,values){const d=datasets[art];if(!d)fail('Unbekannter HP-Datenbereich.');return d.keys.map(k=>{if(typeof values[k]!=='string'||!values[k].length)fail('HP-Quellschlüssel fehlt: '+k);return part(values[k]);}).join('');}
function record(input){
 if(!input||typeof input.art!=='string'||!datasets[input.art]||!Number.isSafeInteger(input.objnr)||input.objnr<1||input.objnr>2147483647||!input.werte||Array.isArray(input.werte))fail('Ungültiger HP-Importdatensatz.');
 const d=datasets[input.art],werte={};
 if(Object.keys(input.werte).length!==d.fields.length)fail('HP-Feldliste stimmt nicht mit dem Importprotokoll überein.');
 for(const f of d.fields){const v=input.werte[f];if(v!==null&&(typeof v!=='string'||v.length>200||/[\x00-\x1f\x7f]/.test(v)||v!==v.trimEnd()))fail('Ungültiger HP-Feldwert: '+f);werte[f]=v;}
 const r={art:input.art,objnr:input.objnr,werte};r.key=key(r.art,werte);
 if(r.key.length>256)fail('HP-Quellschlüssel zu lang.');
 r.hash=fingerprint(r);return r;
}
function fingerprint(r){return crypto.createHash('sha256').update([r.art,String(r.objnr),...datasets[r.art].fields.map(f=>r.werte[f])].map(part).join(''),'utf8').digest('hex');}
module.exports={datasets,key,record,fingerprint};
