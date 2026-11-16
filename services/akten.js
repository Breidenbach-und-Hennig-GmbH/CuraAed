'use strict';
const {ValidationError}=require('../lib/validation');
const fail=m=>{throw new ValidationError(m,400);};
async function prepare(tx,b){
 if(!b||typeof b!=='object'||Array.isArray(b))fail('Ungültige Aktendaten.');const a={};
 for(const [k,max] of Object.entries({art_code:3,art_text:100,bemerkung:2000,ablageort:200,firma:30,sb:3})){if(typeof(b[k]??'')!=='string'||(b[k]||'').length>max)fail('Ungültiges Aktenfeld: '+k);a[k]=(b[k]||'').trim();}
 a.art_code=a.art_code.toUpperCase();a.sb=a.sb.toUpperCase();if(a.art_code&&!/^[A-Z0-9]{3}$/.test(a.art_code))fail('Aktenart bitte als dreistelligen Schlüssel eingeben.');if(a.sb&&!/^[A-Z]{1,3}$/.test(a.sb))fail('Sachbearbeiterkürzel bitte mit bis zu drei Großbuchstaben eingeben.');
 if(!a.art_text)a.art_text=({BB0:'Protokollakte','267':'Versicherungsschaden'})[a.art_code]||'';
 for(const k of ['begonnen_am','geschlossen_am']){const v=b[k]||null;if(v&&(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v))fail('Ungültiges Aktendatum.');a[k]=v;}
 if(a.begonnen_am&&a.geschlossen_am&&a.geschlossen_am<a.begonnen_am)fail('Das Schließdatum liegt vor dem Beginn.');
 a.sonderleistung=b.sonderleistung??false;if(typeof a.sonderleistung!=='boolean')fail('Ungültige Sonderleistung.');
 for(const [key,table]of [['objekt_id','objekte'],['einheit_id','einheiten']]){a[key]=b[key]===null||b[key]===undefined||b[key]===''?null:Number(b[key]);if(a[key]!==null&&(!Number.isSafeInteger(a[key])||a[key]<1||!await tx.get('SELECT id FROM '+table+' WHERE id=?',[a[key]])))fail('Objekt oder Wohnung nicht gefunden.');}
 if(a.einheit_id){const unit=await tx.get('SELECT objekt_id FROM einheiten WHERE id=?',[a.einheit_id]);if(unit.objekt_id!==a.objekt_id)fail('Die Wohnung gehört nicht zum gewählten Objekt.');}
 return a;
}
async function save(tx,id,a){await tx.run('INSERT INTO fach_akten(vorgang_id,daten) VALUES(?,?) ON CONFLICT(vorgang_id) DO UPDATE SET daten=excluded.daten',[id,JSON.stringify(a)]);}
async function load(db,r,refs,owner){
 const stored=await db.get('SELECT daten FROM fach_akten WHERE vorgang_id=?',[r.id]),a=stored?JSON.parse(stored.daten):{},source=r.remote_snapshot?JSON.parse(r.remote_snapshot):{};
 if(!stored){a.objekt_id=refs.find(b=>b.typ==='objekt'&&b.ziel_id)?.ziel_id||null;a.einheit_id=refs.find(b=>b.typ==='einheit'&&b.ziel_id)?.ziel_id||null;if(a.einheit_id&&!a.objekt_id)a.objekt_id=(await db.get('SELECT objekt_id FROM einheiten WHERE id=?',[a.einheit_id]))?.objekt_id||null;}
 const etv=await db.get('SELECT versammlung_id FROM etv_einladung_akten WHERE vorgang_id=?',[r.id]);
 const code=String(source.type?.hp_id??source.status?.hp_id??'');
 const out={art_code:/^[A-Z0-9]{3}$/.test(code)?code:'',art_text:source.type?.name||source.status?.name||source.status?.description||'',bemerkung:[source.info_1,source.info_2].filter(Boolean).join('\n'),ablageort:'',firma:'',sb:'',begonnen_am:null,geschlossen_am:typeof source.closed==='string'?source.closed.slice(0,10):null,angelegt_hp:source.created_hp||null,sonderleistung:false,...(etv?{art_code:'BB0',art_text:'Protokollakte'}:{}),...a};
 out.objekt=out.objekt_id?await db.get('SELECT id,nummer,bezeichnung,strasse,plz,ort FROM objekte WHERE id=?',[out.objekt_id]):null;
 out.einheit=out.einheit_id?await db.get('SELECT id,nummer,bezeichnung,lage,objekt_id FROM einheiten WHERE id=?',[out.einheit_id]):null;
 out.adressen=[];for(const ref of refs.filter(b=>b.typ==='adresse')){const row=ref.ziel_id?await db.get('SELECT id,nummer,adresstyp,vorname,nachname,firmenname,strasse,plz,ort FROM adressen WHERE id=?',[ref.ziel_id]):null;out.adressen.push(row||{id:null,nummer:ref.hp_nummer,name:ref.name});}
 const related=await db.all("SELECT f.id,f.art,f.titel,f.status,f.faellig_am,f.uhrzeit,f.prioritaet,f.hp_nummer FROM fach_vorgaenge f WHERE (f.benutzer_id=? OR f.zustaendig_id=?) AND f.id!=? AND (EXISTS(SELECT 1 FROM fach_bezuege b WHERE (b.vorgang_id=f.id AND b.typ='akte' AND (b.ziel_id=? OR (b.ziel_id IS NULL AND b.remote_id=? AND f.quelle_id=?))) OR (b.vorgang_id=? AND b.typ=f.art AND (b.ziel_id=f.id OR (b.ziel_id IS NULL AND b.remote_id=f.remote_id AND f.quelle_id=?)))) OR EXISTS(SELECT 1 FROM handwerkerauftraege h WHERE h.vorgang_id=f.id AND json_extract(h.daten,'$.akte_id')=?)) ORDER BY f.faellig_am IS NULL,f.faellig_am,f.id DESC LIMIT 200",[owner,owner,r.id,r.id,r.remote_id,r.quelle_id,r.id,r.quelle_id,r.id]);
 out.handwerkerauftraege=related.filter(v=>v.art==='handwerker');out.wiedervorlagen=related.filter(v=>v.art==='wiedervorlage');out.versammlung_id=etv?.versammlung_id||null;
 out.dokumente=await db.all('SELECT d.id,d.titel,d.original_name,d.kategorie,d.dokument_datum FROM akte_dokumente a JOIN dokumente d ON d.id=a.dokument_id WHERE a.vorgang_id=? ORDER BY d.id DESC',[r.id]);
 out.hp_dokumente=[];for(const ref of refs.filter(b=>b.typ==='dokument')){const file=Number(ref.remote_id)>=2**52?await db.get('SELECT f.* FROM hp_akten_zuordnung m JOIN hp_akten_importe j ON j.verbindung_id=m.verbindung_id JOIN hp_dms_dateien f ON f.quelle_id=j.quelle_id WHERE m.vorgang_id=? AND f.datei_id=?',[r.id,ref.remote_id]):await db.get('SELECT datei_id,titel,dateiname,datum,art,speicher_name FROM hp_dms_dateien WHERE quelle_id=? AND datei_id=?',[r.quelle_id,ref.remote_id]);out.hp_dokumente.push({id:ref.remote_id,hp:true,titel:file?.titel||ref.name,original_name:file?.dateiname||ref.name,dokument_datum:file?.datum||null,kategorie:/schrift|mail|outlook/i.test(file?.art||'')?'korrespondenz':'sonstiges',gesichert:!!file?.speicher_name});}
 return out;
}
module.exports={prepare,save,load};
