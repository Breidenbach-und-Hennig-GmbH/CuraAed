'use strict';
const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
const contains=(text,value)=>{const n=norm(value);return n.length>=6&&(' '+norm(text)+' ').includes(' '+n+' ');};
const name=a=>a.firmenname||[a.vorname,a.nachname].filter(Boolean).join(' ');
async function zuordnen(db,result,doc,key,auswahl={}){
 const r=structuredClone(result||{rechnung:false,felder:{},belege:{},hinweise:[]});
 const text=r.zuordnungsbasis||'',z=r.struktur||{},ibans=r.ibans||z.iban||[];
 const lieferanten=[],objekte=[],konten=[];
 const suppliers=await db.all('SELECT * FROM adressen WHERE archiviert=0');
 const banks=await db.all('SELECT adresse_id,iban FROM adress_bank');
 const bankIds=new Set(banks.filter(b=>ibans.some(i=>String(i).replace(/\s/g,'').toUpperCase()===String(b.iban||'').replace(/\s/g,'').toUpperCase())).map(b=>b.adresse_id));
 const legalIds=new Set(suppliers.filter(a=>norm(name(a)).length>=6&&norm(name(a))===norm(z.lieferant?.name)&&((z.lieferant?.plz&&String(a.plz)===z.lieferant.plz)||(z.lieferant?.strasse&&norm(a.strasse)===norm(z.lieferant.strasse)))).map(a=>a.id));
 const firstLines=text.split(/\r?\n/).slice(0,6).join('\n');
 for(const a of suppliers){
  const bank=bankIds.has(a.id),legal=legalIds.has(a.id),scan=!z.lieferant&&contains(firstLines,name(a))&&contains(text,a.strasse);
  if(bank||legal||scan)lieferanten.push({id:a.id,nummer:a.nummer,name:name(a),konto:a.lkto_nr||'',grund:bank?'IBAN stimmt mit der Adresse überein':legal?'Name und Anschrift des XML-Lieferanten stimmen überein':'Name am Beleganfang und Anschrift stimmen überein'});
 }
 const conflict=bankIds.size&&legalIds.size&&![...bankIds].some(id=>legalIds.has(id));
 if(conflict)r.hinweise.push('Lieferantenname und IBAN verweisen auf verschiedene Adressen. Bitte Lieferant auswählen.');
 let supplier=auswahl.lieferantenkonto||'';
 if(!supplier&&!conflict&&lieferanten.length===1&&lieferanten[0].konto&&suppliers.filter(a=>a.lkto_nr===lieferanten[0].konto).length===1){supplier=lieferanten[0].konto;r.felder.lieferantenkonto=supplier;r.belege.lieferantenkonto=lieferanten[0].grund+' · '+lieferanten[0].name;}
 if(lieferanten.length&&!supplier)r.hinweise.push('Lieferantenkonto nicht eindeutig oder bei der Adresse noch nicht hinterlegt. Bitte prüfen.');
 const allObjects=await db.all('SELECT * FROM objekte WHERE archiviert=0');
 const linked=new Set((doc?.verknuepfungen||[]).filter(v=>v.typ==='objekt').map(v=>String(v.nummer)));
 const objectText=[text,z.kaeuferreferenz,z.empfaenger?.name,z.empfaenger?.strasse,...(z.positionen||[]).map(p=>p.name)].filter(Boolean).join('\n');
 const explicit=[...objectText.matchAll(/(?:Objekt(?:[ .-]*(?:Nr\.?|Nummer))?|Liegenschaft)\s*[:#-]?\s*([0-9][a-zA-Z0-9/_-]*)/gi)].map(m=>m[1]);
 for(const o of allObjects){
  const link=linked.has(String(o.nummer)),number=explicit.includes(String(o.nummer));
  const address=contains(objectText,o.strasse)&&norm(o.strasse)!==norm(z.lieferant?.strasse)&&!lieferanten.some(a=>norm(suppliers.find(s=>s.id===a.id)?.strasse)===norm(o.strasse));
  if(link||number||address)objekte.push({id:o.id,nummer:String(o.nummer),name:o.bezeichnung,grund:link?'Vorhandene Dokumentzuordnung':number?'Objekt-Nr. im Beleg':'Objektanschrift im Beleg'});
 }
 let object=auswahl.objekt_nr||'';
 if(!object&&objekte.length===1){object=objekte[0].nummer;r.felder.objekt_nr=object;r.belege.objekt_nr=objekte[0].grund+' · '+objekte[0].name;}
 if(objekte.length>1&&!object)r.hinweise.push('Mehrere passende Objekte gefunden. Bitte Objekt auswählen.');
 if(object){
  const accounts=await db.all('SELECT k.* FROM sachkonten k JOIN objekte o ON o.id=k.objekt_id WHERE o.nummer=? AND o.archiviert=0 AND k.aktiv=1',[object]);
  const previous=supplier?await db.all("SELECT DISTINCT json_extract(daten,'$.buchungskonto') AS nummer FROM eingangsrechnungen WHERE dokument_schluessel<>? AND erstellt_von=? AND json_extract(daten,'$.lieferantenkonto')=? AND json_extract(daten,'$.objekt_nr')=?",[key,auswahl.owner,supplier,object]):[];
  const history=new Set(previous.filter(p=>p.nummer).map(p=>String(p.nummer)));
  const serviceText=[text,...(z.positionen||[]).map(p=>p.name)].join('\n');
  for(const a of accounts){const phrase=contains(serviceText,a.bezeichnung),learned=history.has(String(a.nummer));
   if(phrase||learned)konten.push({nummer:String(a.nummer),name:a.bezeichnung,objekt_nr:object,grund:phrase?'Kontobezeichnung im Leistungstext':'Bereits gespeicherte Rechnung für Lieferant und Objekt'});
  }
  if(konten.length===1){r.felder.buchungskonto=konten[0].nummer;r.belege.buchungskonto=konten[0].grund+' · '+konten[0].name;}
  else if(konten.length>1)r.hinweise.push('Mehrere Buchungskonten passen. Bitte Buchungskonto auswählen.');
 }
 r.zuordnungen={lieferanten,objekte,konten};r.lieferanten=lieferanten;
 delete r.zuordnungsbasis;delete r.ibans;return r;
}
module.exports={zuordnen,norm};
