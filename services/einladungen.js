'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation');
const fail=(s,status=400)=>{throw new ValidationError(s,status);};
const heute=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date());
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const START='Sehr geehrte Eigentümerinnen und Eigentümer,\n\nhiermit laden wir Sie zur Eigentümerversammlung Ihrer Gemeinschaft ein. Die Tagesordnung und ein Vollmachtsformular sind dieser Einladung beigefügt.';
const ENDE='Falls Sie nicht persönlich teilnehmen können, können Sie eine bevollmächtigte Person benennen. Bitte beachten Sie dabei die Vertretungsregelungen Ihrer Gemeinschaft.\n\nWir freuen uns auf Ihre Teilnahme.\n\nMit freundlichen Grüßen';
async function stand(db,id){
 const source=await require('./tagesordnung').liste(db,id),o=await db.get('SELECT nummer,bezeichnung,strasse,plz,ort FROM objekte WHERE id=?',[source.versammlung.objekt_id]);
 const empfang=await require('./einladung-empfaenger').lesen(db,source.versammlung),firmen=await require('./firmenbriefkoepfe').liste(db);
 const saved=await db.get('SELECT * FROM etv_einladungen WHERE versammlung_id=?',[id]);
 const v=source.versammlung,daten=saved?JSON.parse(saved.daten):{absender:v.leitung_name||'',anschrift:'',datum:heute(),einleitung:START,schluss:ENDE};
 daten.firma_id=daten.firma_id??null;daten.top_weisungen=daten.top_weisungen??true;
 const hinweise=[...empfang.hinweise];if(!empfang.empfaenger.length)hinweise.push('Keine Eigentümer zum Versammlungsdatum zugeordnet.');for(const e of empfang.empfaenger)if(e.fehler.length)hinweise.push(e.name+': '+e.fehler.join(', '));if(!v.uhrzeit)hinweise.push('Bitte die Uhrzeit in den Basisdaten ergänzen.');if(!v.ort&&v.art!=='online')hinweise.push('Bitte den Versammlungsort / Raum in den Basisdaten ergänzen.');if(!v.leitung_id)hinweise.push('Bitte die Versammlungsleitung in den Basisdaten ergänzen.');if(!source.tops.length)hinweise.push('Bitte zuerst die Tagesordnungspunkte anlegen.');
 if(v.art!=='praesenz'&&(!v.teams_url||v.teams_status!=='bereit'))hinweise.push('Der Teams-Link ist noch nicht bereit. Bitte Microsoft 365 für ETV freigeben und die Versammlung erneut speichern.');
 return{...source,objekt:o,empfaenger:empfang.empfaenger,empfaenger_hinweise:empfang.hinweise,firmen,revision:saved?.revision||0,daten,basis_hash:hash({versammlung:v,objekt:o,tops:source.tops,empfang,firmen}),hinweise};
}
function daten(b){const out={};for(const [k,max] of [['absender',200],['anschrift',1000],['datum',10],['einleitung',5000],['schluss',3000]]){if(typeof b?.[k]!=='string'||b[k].length>max)fail('Ungültige Einladungsangabe: '+k);out[k]=b[k].trim();}
 out.firma_id=b.firma_id==null||b.firma_id===''?null:Number(b.firma_id);if(out.firma_id!==null&&(!Number.isSafeInteger(out.firma_id)||out.firma_id<1))fail('Ungültiger Firmenbriefkopf.');out.top_weisungen=b.top_weisungen??true;if(typeof out.top_weisungen!=='boolean')fail('Ungültige Vollmachtsauswahl.');
 if(!out.absender||!out.einleitung||!out.schluss)fail('Bitte Absender, Einleitung und Schluss ergänzen.');if(!/^\d{4}-\d{2}-\d{2}$/.test(out.datum)||(!Number.isFinite(Date.parse(out.datum+'T12:00:00Z'))||new Date(out.datum+'T12:00:00Z').toISOString().slice(0,10)!==out.datum))fail('Ungültiges Einladungsdatum.');return out;}
async function vorbereiten(db,id,b){
 const d=daten(b.daten);
 const tx=db;const s=await stand(tx,id);if(b.revision!==s.revision||b.basis_hash!==s.basis_hash)fail('Einladung, Basisdaten oder Tagesordnung inzwischen geändert. Bitte Einladung neu öffnen.',409);
 if(!s.versammlung.uhrzeit||(!s.versammlung.ort&&s.versammlung.art!=='online')||!s.versammlung.leitung_id||!s.tops.length)fail('Bitte zuerst Uhrzeit, Versammlungsort, Versammlungsleitung und Tagesordnung vollständig anlegen.');
 if(s.versammlung.art!=='praesenz'&&(s.versammlung.teams_status!=='bereit'||!s.versammlung.teams_url))fail('Bitte vor der Einladung zuerst den Teams-Link in den ETV-Basisdaten erstellen.');
 let targets;if(b.empfaenger_id===null){if(s.empfaenger_hinweise.length)fail(s.empfaenger_hinweise.join(' '));targets=s.empfaenger;}else{const id=b.empfaenger_id===undefined&&s.empfaenger.length===1?s.empfaenger[0].id:b.empfaenger_id;if(!Number.isSafeInteger(id))fail('Bitte einen Eigentümer oder die Sammelausgabe auswählen.');targets=s.empfaenger.filter(e=>e.id===id);}
 if(!targets.length)fail('Eigentümer für diese Versammlung nicht gefunden.',404);if(targets.some(e=>e.fehler.length))fail(targets.filter(e=>e.fehler.length).map(e=>e.name+': '+e.fehler.join(', ')).join(' '));if(targets.length>250||targets.length*s.tops.length>5000)fail('Die Sammelausgabe ist zu umfangreich. Bitte Einzeleinladungen erstellen.');
 if((s.tops.reduce((n,t)=>n+t.titel.length+(t.erlaeuterung||'').length+(t.beschlussvorschlag||'').length,0)+d.einleitung.length+d.schluss.length)*targets.length>5000000)fail('Die Sammelausgabe ist zu umfangreich. Bitte Einzeleinladungen erstellen.');
 const firma=d.firma_id?await require('./firmenbriefkoepfe').holen(tx,d.firma_id,true):null;
 return{...s,daten:d,briefempfaenger:targets,firma};
}
async function vorlageSpeichern(db,id,s){
 if(JSON.stringify(s.daten)!==JSON.stringify((await stand(db,id)).daten)||!s.revision)await db.run('INSERT INTO etv_einladungen(versammlung_id,daten,revision) VALUES(?,?,1) ON CONFLICT(versammlung_id) DO UPDATE SET daten=excluded.daten,revision=revision+1',[id,JSON.stringify(s.daten)]);
}
async function erstellen(db,id,b){
 const snapshot=await db.transaktion(async tx=>{const s=await vorbereiten(tx,id,b);if(s.briefempfaenger.length!==1)fail('Bitte Einladungen als einzelne PDFs je Eigentümer erstellen.');await vorlageSpeichern(tx,id,s);return s;});
 if(snapshot.tops.reduce((n,t)=>n+t.titel.length+(t.erlaeuterung||'').length+(t.beschlussvorschlag||'').length,0)>500000)fail('Die Tagesordnung ist für eine einzelne PDF zu umfangreich.');
 return require('../lib/einladung-pdf').erstellen(snapshot);
}
module.exports={stand,erstellen,daten,vorbereiten,vorlageSpeichern};
