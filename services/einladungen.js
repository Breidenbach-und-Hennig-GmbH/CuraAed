'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation');
const fail=(s,status=400)=>{throw new ValidationError(s,status);};
const heute=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date());
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const START='Sehr geehrte Eigentümerinnen und Eigentümer,\n\nhiermit laden wir Sie zur Eigentümerversammlung Ihrer Gemeinschaft ein. Die Tagesordnung und ein Vollmachtsformular sind dieser Einladung beigefügt.';
const ENDE='Falls Sie nicht persönlich teilnehmen können, können Sie eine bevollmächtigte Person benennen. Bitte beachten Sie dabei die Vertretungsregelungen Ihrer Gemeinschaft.\n\nWir freuen uns auf Ihre Teilnahme.\n\nMit freundlichen Grüßen';
async function stand(db,id){
 const source=await require('./tagesordnung').liste(db,id),o=await db.get('SELECT nummer,bezeichnung,strasse,plz,ort FROM objekte WHERE id=?',[source.versammlung.objekt_id]);
 const saved=await db.get('SELECT * FROM etv_einladungen WHERE versammlung_id=?',[id]);
 const v=source.versammlung,daten=saved?JSON.parse(saved.daten):{absender:v.leitung_name||'',anschrift:'',datum:heute(),einleitung:START,schluss:ENDE};
 const hinweise=[];if(!v.uhrzeit)hinweise.push('Bitte die Uhrzeit in den Basisdaten ergänzen.');if(!v.ort)hinweise.push('Bitte den Versammlungsort / Raum in den Basisdaten ergänzen.');if(!v.leitung_id)hinweise.push('Bitte die Versammlungsleitung in den Basisdaten ergänzen.');if(!source.tops.length)hinweise.push('Bitte zuerst die Tagesordnungspunkte anlegen.');
 if(v.art!=='praesenz')hinweise.push('Für Online- oder Hybridversammlungen bitte die Zugangsdaten in den Einladungstext aufnehmen.');
 return{...source,objekt:o,revision:saved?.revision||0,daten,basis_hash:hash({versammlung:v,objekt:o,tops:source.tops}),hinweise};
}
function daten(b){const out={};for(const [k,max] of [['absender',200],['anschrift',1000],['datum',10],['einleitung',5000],['schluss',3000]]){if(typeof b?.[k]!=='string'||b[k].length>max)fail('Ungültige Einladungsangabe: '+k);out[k]=b[k].trim();}
 if(!out.absender||!out.einleitung||!out.schluss)fail('Bitte Absender, Einleitung und Schluss ergänzen.');if(!/^\d{4}-\d{2}-\d{2}$/.test(out.datum)||(!Number.isFinite(Date.parse(out.datum+'T12:00:00Z'))||new Date(out.datum+'T12:00:00Z').toISOString().slice(0,10)!==out.datum))fail('Ungültiges Einladungsdatum.');return out;}
async function erstellen(db,id,b){
 const d=daten(b.daten);
 const snapshot=await db.transaktion(async tx=>{const s=await stand(tx,id);if(b.revision!==s.revision||b.basis_hash!==s.basis_hash)fail('Einladung, Basisdaten oder Tagesordnung inzwischen geändert. Bitte Einladung neu öffnen.',409);
 if(!s.versammlung.uhrzeit||!s.versammlung.ort||!s.versammlung.leitung_id||!s.tops.length)fail('Bitte zuerst Uhrzeit, Versammlungsort, Versammlungsleitung und Tagesordnung vollständig anlegen.');
 if(JSON.stringify(d)!==JSON.stringify(s.daten)||!s.revision)await tx.run('INSERT INTO etv_einladungen(versammlung_id,daten,revision) VALUES(?,?,1) ON CONFLICT(versammlung_id) DO UPDATE SET daten=excluded.daten,revision=revision+1',[id,JSON.stringify(d)]);
 return{...s,daten:d};});
 if(snapshot.tops.reduce((n,t)=>n+t.titel.length+(t.erlaeuterung||'').length+(t.beschlussvorschlag||'').length,0)>500000)fail('Die Tagesordnung ist für eine einzelne PDF zu umfangreich.');
 return require('../lib/einladung-pdf').erstellen(snapshot);
}
module.exports={stand,erstellen,daten};
