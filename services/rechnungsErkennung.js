'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{fork}=require('node:child_process');
const {ValidationError}=require('../lib/validation');
function parseInvoice(text){
 const lines=String(text).replace(/\u00a0/g,' ').replace(/\u2212/g,'-').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),felder={},belege={},hinweise=[];
 function one(key,items){const values=[...new Set(items.map(x=>x.value))];if(values.length===1){felder[key]=values[0];belege[key]=items.find(x=>x.value===values[0]).line.slice(0,500);}else if(values.length>1)hinweise.push('Mehrdeutige Angaben für '+key+' – bitte manuell prüfen.');}
 const date=s=>{if(s.includes('/')&&Number(s.split('/')[0])<=12&&Number(s.split('/')[1])<=12)return null;const m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2}|\d{4})$/);if(!m)return null;const y=m[3].length===2?'20'+m[3]:m[3],v=y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return !Number.isNaN(Date.parse(v+'T00:00Z'))&&new Date(v+'T00:00Z').toISOString().slice(0,10)===v?v:null;};
 const amount=s=>{s=s.replace(/\s/g,'');if(!/^-?(?:\d{1,3}(?:\.\d{3})+|\d{1,9}),\d{2}$/.test(s))return null;return s.replace(/\./g,'');};
 const nrs=[],dates=[],genericDates=[],due=[],gross=[],terms=[],skontos=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i],joined=line+' '+(lines[i+1]||'');let m;
  if((m=joined.match(/\b(?:(?:Rechnungs?(?:nummer|[\s.-]*(?:Nr\.?|Nummer))|Rechn\.[\s-]*Nr\.?|R[EG][\s.-]*Nr\.?)|Invoice\s*(?:number|no\.?))\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/_.-]{0,99})/i))&&/\d/.test(m[1])&&!/^(?:datum|Rechnungsdatum|Rechnungsbetrag|Kundennummer|EUR|IBAN)$/i.test(m[1]))nrs.push({value:m[1],line:joined});
  if((m=joined.match(/(?:Rechnungsdatum|Rechnung\s+vom|Invoice\s+date)\s*[:\-]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-](?:\d{4}|\d{2}))/i))&&date(m[1]))dates.push({value:date(m[1]),line:joined});
  if((m=line.match(/^Datum\s*[:\-]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-](?:\d{4}|\d{2}))/i))&&date(m[1]))genericDates.push({value:date(m[1]),line});
  if((m=joined.match(/(?:fällig\s*(?:am|zum|bis)?|zahlbar\s+bis|Zahlungsziel\s*:|due\s+date)\s*[:\-]?\s*(\d{1,2}[.\/-]\d{1,2}[.\/-](?:\d{4}|\d{2}))/i))&&date(m[1]))due.push({value:date(m[1]),line:joined});
  const label=/(?:Rechnungsbetrag|Rechnungssumme|Endbetrag|Gesamtbetrag|Gesamtsumme|Gesamt\s+brutto|Summe\s+brutto|Bruttobetrag|zu\s+zahlender\s+Betrag|Zahlbetrag|Amount\s+due|Invoice\s+total)/i;
  if(label.test(line)&&!/(?:netto|Zwischensumme|Teilzahlung|bereits\s+bezahlt)/i.test(line)){
   const tail=joined.slice(joined.search(label)).replace(label,'');const nums=[...tail.matchAll(/-?(?:\d{1,3}(?:\.\d{3})+|\d{1,9}),\d{2}/g)];
   if(nums.length&&amount(nums[0][0]))gross.push({value:amount(nums[0][0]),line:joined});
  }
  if(!/Skonto/i.test(line)&&(m=line.match(/(?:zahlbar(?:\s+innerhalb(?:\s+von)?)?|Zahlungsziel|rein\s+netto|netto)\s*:?\s*(\d{1,3})\s*Tage(?:n)?\b/i)))terms.push({value:m[1],line:joined});
 }
 for(const line of lines){let m;if((m=line.match(/(\d{1,3})\s*Tage(?:n)?[^%]{0,40}?\b(\d{1,3}(?:,\d{1,2})?)\s*%\s*Skonto/i)))skontos.push({tage:m[1],prozent:Number(m[2].replace(',','.')).toFixed(2).replace('.',','),line});}
 const distinct=[...new Map(skontos.map(s=>[s.tage+':'+s.prozent,s])).values()].sort((a,b)=>Number(a.tage)-Number(b.tage));
 if(distinct.length<=2)distinct.forEach((s,i)=>{felder['ziel'+(i+1)+'_tage']=s.tage;felder['ziel'+(i+1)+'_skonto']=s.prozent;belege['ziel'+(i+1)+'_tage']=belege['ziel'+(i+1)+'_skonto']=s.line.slice(0,500);});
 one('rechnungs_nr',nrs);one('rechnungsdatum',dates.length?dates:genericDates);one('faelligkeit',due);one('betrag',gross);one('netto_tage',terms);
 const invoice=!!(felder.rechnungs_nr&&felder.betrag)||lines.some(l=>/^\s*(?:Rechnung|Invoice)\b/i.test(l));
 if(/\b(?:USD|GBP|CHF|US\s*Dollar|Pfund)\b/.test(text)){delete felder.betrag;delete belege.betrag;hinweise.push('Andere oder mehrere Währungen erkannt. Betrag und Währung manuell prüfen.');}
 if(/\bGutschrift\b/i.test(text)){delete felder.betrag;delete belege.betrag;hinweise.push('Gutschrift erkannt. Vorzeichen und Betrag manuell prüfen.');}
 if(invoice&&!felder.betrag)hinweise.push('Kein eindeutiger Rechnungs-Gesamtbetrag erkannt.');
 if(invoice&&!felder.rechnungs_nr)hinweise.push('Rechnungsnummer nicht eindeutig erkannt.');
 const ibans=[...new Set([...String(text).matchAll(/\bDE(?:\s*\d){20}\b/g)].map(m=>m[0].replace(/\s/g,'')))];
 if(felder.rechnungs_nr)felder.verwendungszweck1='Re-Nr. '+felder.rechnungs_nr;
 return{rechnung:invoice,felder:invoice?felder:{},belege:invoice?belege:{},hinweise,ibans};
}
function extract(file){
 return new Promise((resolve,reject)=>{
  const child=fork(path.join(__dirname,'rechnungsOcrWorker.js'),[file],{execArgv:['--max-old-space-size=384'],stdio:['ignore','ignore','ignore','ipc']});
  let done=false;const finish=(e,r)=>{if(done)return;done=true;clearTimeout(timer);child.kill();e?reject(e):resolve(r);};
  const timer=setTimeout(()=>finish(new ValidationError('Die Texterkennung hat zu lange gedauert. Bitte erneut versuchen oder Angaben manuell erfassen.',504)),85000);
  child.once('error',()=>finish(new ValidationError('Texterkennung konnte nicht gestartet werden.',503)));
  child.once('exit',(code,signal)=>{if(done)return;const error=new ValidationError('Texterkennung wurde unterbrochen. Bitte erneut versuchen.',503);error.workerExit={code,signal};finish(error);});
  child.on('message',m=>m.error?finish(new ValidationError(m.error,422)):finish(null,m));
 });
}
function baueErkennung(db,{rechnungen,archiv,uploadDir,lesen=extract}){
 const active=new Map();
 async function erkennen(owner,ref){
  const resolved=await rechnungen.document(owner,ref),key=resolved.key,doc=resolved.dokument;let file;
  if(ref.typ==='archiv'){
   const r=await db.get('SELECT speicher_name,mime_type FROM dokumente WHERE id=?',[Number(ref.id)]);
   if(!/^application\/pdf$|^image\//.test(r.mime_type))return{status:'nicht_unterstuetzt',rechnung:false,felder:{},hinweise:['Automatische Erkennung unterstützt PDFs und Bilder.']};
   file=path.join(uploadDir,path.basename(r.speicher_name));
  }else{if(!doc.hp.gesichert)throw new ValidationError('Bitte das Dokument zuerst dauerhaft in CuraAed übernehmen.',409);file=(await archiv.localFile(owner,ref.quelle,ref.id)).path;}
  const stat=await fs.stat(file).catch(()=>null);if(!stat)throw new ValidationError('Dokumentdatei nicht vorhanden.',404);
  if(stat.size>50*1024*1024)throw new ValidationError('Datei ist für die Erkennung zu groß.',413);
  const hash=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),cached=await db.get('SELECT ergebnis FROM rechnungs_erkennung WHERE dokument_schluessel=? AND datei_hash=?',[key,hash]);
  if(cached)return JSON.parse(cached.ergebnis);
  if(active.has(key))return active.get(key);
  if(active.size)throw new ValidationError('Die Rechnungserkennung ist gerade belegt. Bitte gleich erneut versuchen.',503);
  const promise=(async()=>{
   const data=await lesen(file),result=parseInvoice(data.text);
   result.status='fertig';result.methode=data.methode;result.seiten=data.seiten;result.hinweise.push(...(data.hinweise||[]));
   if(data.konfidenz!==undefined&&data.konfidenz<65)result.hinweise.push('Scan schwer lesbar – alle erkannten Angaben besonders sorgfältig prüfen.');
   // Bankdaten liefern nur einen Lieferantenhinweis, keine erfundene Kreditorenkontonummer.
   const suppliers=[];for(const iban of result.ibans){const rows=await db.all('SELECT DISTINCT a.nummer,a.firmenname,a.vorname,a.nachname FROM adress_bank b JOIN adressen a ON a.id=b.adresse_id WHERE b.iban=?',[iban]);suppliers.push(...rows);}
   result.lieferanten=[...new Map(suppliers.map(a=>[a.nummer,{nummer:a.nummer,name:a.firmenname||[a.vorname,a.nachname].filter(Boolean).join(' ')}])).values()];delete result.ibans;
   await db.run('INSERT INTO rechnungs_erkennung(dokument_schluessel,datei_hash,ergebnis) VALUES(?,?,?) ON CONFLICT(dokument_schluessel) DO UPDATE SET datei_hash=excluded.datei_hash,ergebnis=excluded.ergebnis,erstellt_am=datetime(\'now\')',[key,hash,JSON.stringify(result)]);return result;
  })();active.set(key,promise);try{return await promise;}finally{active.delete(key);}
 }
 return{erkennen};
}
module.exports={parseInvoice,baueErkennung,extract};
