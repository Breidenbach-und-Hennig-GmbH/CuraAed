'use strict';
const {fork}=require('node:child_process'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {ValidationError}=require('../lib/validation');
const zahl=s=>Math.round(Number(s.replace(/\./g,'').replace(',','.'))*100);
const betraege=s=>[...s.matchAll(/[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}(?!\d)/g)].map(m=>zahl(m[0]));
function zeilen(seiten){return seiten.flatMap(p=>{const groups=[];for(const i of p.items){let g=groups.find(g=>Math.abs(g.y-i.y)<2);if(!g){g={y:i.y,items:[]};groups.push(g);}g.items.push(i);}return groups.sort((a,b)=>b.y-a.y).map(g=>({breite:p.breite,items:g.items.sort((a,b)=>a.x-b.x),text:g.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')}));});}
function pruefeKopf(lines,typ,nummern,jahr){
 const text=lines.map(l=>l.text).join('\n');
 if(typ==='kontrollblatt'&&!/ABRECHNUNGS-KONTROLLBLATT/i.test(text))throw new ValidationError('Kein HP-Abrechnungskontrollblatt erkannt.');
 if(typ==='salden'&&!/Summen-?\s*und\s*Saldenliste/i.test(text))throw new ValidationError('Keine HP-Summen- und Saldenliste erkannt.');
 const nums=[...text.matchAll(/Objekt\s*:?\s*(\d+)[ ,]/g)].map(m=>m[1]);
 if(!nums.length||nums.some(n=>!nummern.includes(n)))throw new ValidationError('Der Bericht gehört nicht eindeutig zu diesem Objekt.');
 const jahre=[...text.matchAll(/(?:Buchungsjahr\s*:?|BJ\s*:)\s*(\d{4})/g)].map(m=>Number(m[1]));
 if(!jahre.length||jahre.some(j=>j!==jahr))throw new ValidationError('Das Buchungsjahr des HP-Berichts stimmt nicht überein.');
 const y=String(jahr),yy=y.slice(2),periode=new RegExp(`01\\.01\\.(?:${y}|${yy})\\s*[-–]\\s*31\\.12\\.(?:${y}|${yy})(?!\\d)`);
 if(!periode.test(text))throw new ValidationError('Bitte einen HP-Bericht für das vollständige Kalenderjahr auswählen (01.01.–31.12.).');
 return text;
}
function parse(seiten,typ,nummern,jahr){
 if(!['kontrollblatt','salden'].includes(typ))throw new ValidationError('Unbekannte Berichtsart.');
 const lines=zeilen(seiten),text=pruefeKopf(lines,typ,nummern,jahr),werte={},konten=[];
 if(typ==='salden'){
  for(const l of lines){const m=l.text.match(/^(\d{4})\s+([SBA])\s+/);if(!m)continue;
   const columns=[297.1,365.1,433,500.9,568.8,636.8,704.7,772.6].map(x=>x/841.89*l.breite),v=Array(8).fill(0);
   for(const i of l.items){if(!/^-?[\d.]+,\d{2}$/.test(i.text))continue;const k=columns.reduce((best,x,n)=>Math.abs(i.rechts-x)<Math.abs(i.rechts-columns[best])?n:best,0);if(Math.abs(i.rechts-columns[k])>3)throw new ValidationError('Spalten der Saldenliste nicht eindeutig erkannt.');v[k]+=zahl(i.text);}
   konten.push({konto:Number(m[1]),saldo_cents:v[6]-v[7],eb_cents:v[0]-v[1],soll_cents:v[4],haben_cents:v[5]});
  }
  if(!konten.length||new Set(konten.map(k=>k.konto)).size!==konten.length)throw new ValidationError('Keine eindeutigen Kontensalden erkannt.');
 }else{
  let bereich='';for(const l of lines){
   if(/^Ausgaben Sachkonten\s+Verteilung/.test(l.text))bereich='ausgaben';
   if(/^Einnahmen Sachkonten\s+Verteilung/.test(l.text))bereich='einnahmen';
   if(/^Abrechnungsergebnisse Guthaben/.test(l.text))bereich='';
   const m=l.text.match(/^(\d{4})\s+/);if(!m||!bereich)continue;
   const a=betraege(l.text);if(!a.length)continue;
   if(bereich==='ausgaben'){if(a.length<2)throw new ValidationError('Abgerechnete Ausgaben fehlen.');konten.push({konto:Number(m[1]),saldo_cents:a[0],abgerechnet_cents:a[1]});}
   else konten.push({konto:Number(m[1]),saldo_cents:a[0]});
  }
  const summaries=lines.filter(l=>/^Summe Objekt \d+/.test(l.text));const total=summaries.at(-1),a=total?betraege(total.text):[];
  if(!konten.length||!a.length)throw new ValidationError('Abrechnungssummen nicht eindeutig erkannt.');
  werte.eigentuemer_guthaben=-a.at(-1)/100;
  const kosten=konten.filter(k=>k.abgerechnet_cents!==undefined),einnahmen=konten.filter(k=>k.abgerechnet_cents===undefined);
  // Zuordnungen bleiben explizit in der Vorschau; fremde Kontonummern werden nicht geraten.
  const rl=kosten.find(k=>k.konto===6600),hg=einnahmen.find(k=>k.konto===9311),rz=einnahmen.find(k=>k.konto===9250);
  if(rl&&hg&&rz){werte.hausgeld=-hg.saldo_cents/100;werte.ruecklage_zufuehrung=-rz.saldo_cents/100;werte.bewirtschaftung=(kosten.reduce((s,k)=>s+k.saldo_cents,0)-rl.saldo_cents)/100;}
 }
 return {werte,konten,typ,seiten:seiten.length,hinweise:typ==='kontrollblatt'?['Nur eindeutig erkannte Positionen werden vorbelegt. Ergänzende Vermögenswerte und Abgrenzungen bitte mit den Originalunterlagen ergänzen.']:[]};
}
async function lesen(buf,typ,nummern,jahr){
 if(buf.subarray(0,5).toString()!=='%PDF-')throw new ValidationError('Bitte eine originale HP-PDF auswählen.');
 const release=require('../lib/ocrSlot')(),dir=await fs.mkdtemp(path.join(os.tmpdir(),'cura-hp-bericht-'));
 try{const file=path.join(dir,'bericht.pdf');await fs.writeFile(file,buf);const result=await new Promise((resolve,reject)=>{
  const child=fork(path.join(__dirname,'hpBerichtWorker.js'),[file],{execArgv:['--max-old-space-size=384'],stdio:['ignore','ignore','ignore','ipc']});let done=false;
  const finish=(e,r)=>{if(done)return;done=true;clearTimeout(timer);child.kill();e?reject(e):resolve(r);};const timer=setTimeout(()=>finish(new ValidationError('Das Lesen des HP-Berichts dauerte zu lange.',504)),45000);
  child.once('error',()=>finish(new ValidationError('Berichtsprüfung konnte nicht gestartet werden.',503)));child.once('exit',()=>finish(new ValidationError('Berichtsprüfung unterbrochen.',503)));child.once('message',m=>m.error?finish(new ValidationError(m.error)):finish(null,m));
 });return {...parse(result.seiten,typ,nummern,jahr),sha256:crypto.createHash('sha256').update(buf).digest('hex')};
 }finally{await fs.rm(dir,{recursive:true,force:true});release();}
}
module.exports={lesen,parse,zeilen};
