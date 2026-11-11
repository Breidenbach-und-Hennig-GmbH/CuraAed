'use strict';
const {ValidationError}=require('../lib/validation');
const fail=(m,s=400)=>{throw new ValidationError(m,s);};
const name=a=>a?.firmenname||[a?.vorname,a?.nachname].filter(Boolean).join(' ');
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function date(v,k){if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('Ungültiges Datum: '+k);return v;}
async function prepare(tx,owner,b){
 if(b===null||typeof b!=='object'||Array.isArray(b))fail('Ungültige Auftragsdaten.');
 const d={};
 for(const [k,max] of Object.entries({firma:30,auftragsart:30,garantie_notiz:2000})){if(typeof b[k]!=='string'||b[k].length>max)fail('Ungültiges Auftragsfeld: '+k);d[k]=b[k].trim();}
 if(!['normal','eilauftrag','notdienst','angebot'].includes(d.auftragsart))fail('Bitte eine gültige Auftragsart wählen.');
 for(const k of ['datum','erledigt_am','gewaehrleistung_bis'])d[k]=date(b[k],k);
 if(typeof b.betrag!=='string'||(b.betrag&&!/^\d{1,9}(,\d{1,2})?$/.test(b.betrag)))fail('Betrag bitte in EUR eingeben, z. B. 250,00.');
 const [w,p='']=b.betrag.split(',');d.betrag=b.betrag?Number(w)*100+Number(p.padEnd(2,'0')):null;
 for(const [k,table] of [['handwerker_id','adressen'],['objekt_id','objekte'],['einheit_id','einheiten'],['akte_id','fach_vorgaenge']]){
  const id=b[k];if(id===''||id===null){d[k]=null;continue;}
  if(!Number.isSafeInteger(id)||id<1)fail('Ungültige Zuordnung: '+k);
  const r=await tx.get('SELECT * FROM '+table+' WHERE id=?',[id]);
  if(!r||(table==='adressen'&&r.archiviert)||(table==='fach_vorgaenge'&&(r.art!=='akte'||(r.benutzer_id!==owner&&r.zustaendig_id!==owner))))fail('Zuordnung nicht verfügbar: '+k);
  d[k]=id;
 }
 if(d.einheit_id){const e=await tx.get('SELECT objekt_id FROM einheiten WHERE id=?',[d.einheit_id]);if(d.objekt_id&&d.objekt_id!==e.objekt_id)fail('Die Wohnung gehört nicht zum ausgewählten Objekt.');d.objekt_id=e.objekt_id;}
 if(!Array.isArray(b.adressaten)||b.adressaten.length>50)fail('Bitte höchstens 50 Auftragsadressaten angeben.');
 d.adressaten=[];const seen=new Set();
 for(const a of b.adressaten){if(!a||!Number.isSafeInteger(a.adresse_id)||a.adresse_id<1||typeof a.bezeichnung!=='string'||a.bezeichnung.length>100)fail('Ungültiger Auftragsadressat.');if(seen.has(a.adresse_id))fail('Adresse doppelt zugeordnet.');seen.add(a.adresse_id);if(!await tx.get('SELECT id FROM adressen WHERE id=? AND archiviert=0',[a.adresse_id]))fail('Auftragsadressat nicht verfügbar.');d.adressaten.push({adresse_id:a.adresse_id,bezeichnung:a.bezeichnung.trim()});}
 if(d.erledigt_am&&d.datum&&d.erledigt_am<d.datum)fail('Erledigungsdatum liegt vor dem Auftragsdatum.');
 return d;
}
async function save(tx,id,d){await tx.run('INSERT INTO handwerkerauftraege(vorgang_id,daten) VALUES(?,?) ON CONFLICT(vorgang_id) DO UPDATE SET daten=excluded.daten',[id,JSON.stringify(d)]);}
async function load(db,r){
 const row=await db.get('SELECT daten FROM handwerkerauftraege WHERE vorgang_id=?',[r.id]);
 const hp=r.remote_snapshot||{},refs=r.bezuege||[];
 const supplier=refs.find(b=>b.typ==='adresse'&&hp.craftsman_person&&Number(b.remote_id)===Number(hp.craftsman_person.id));
 const hpMoney=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?Math.round(v*100):null;
 const d=row?JSON.parse(row.daten):{handwerker_id:supplier?.ziel_id||null,objekt_id:refs.find(b=>b.typ==='objekt')?.ziel_id||null,einheit_id:refs.find(b=>b.typ==='einheit')?.ziel_id||null,akte_id:refs.find(b=>b.typ==='akte')?.fach_id||null,firma:typeof hp.company?.name==='string'?hp.company.name.slice(0,30):'',auftragsart:/notdienst/i.test(hp.type?.name||'')?'notdienst':/eilauftrag/i.test(hp.type?.name||'')?'eilauftrag':'normal',datum:typeof hp.to_occur==='string'?hp.to_occur.slice(0,10):r.erstellt_am.slice(0,10),erledigt_am:null,gewaehrleistung_bis:null,garantie_notiz:'',betrag:hpMoney(hp.estimated_price),adressaten:[]};
 const handwerker=d.handwerker_id?await db.get('SELECT * FROM adressen WHERE id=?',[d.handwerker_id]):null;
 const objekt=d.objekt_id?await db.get('SELECT id,nummer,bezeichnung,strasse,plz,ort FROM objekte WHERE id=?',[d.objekt_id]):null;
 const einheit=d.einheit_id?await db.get('SELECT id,nummer,bezeichnung,objekt_id FROM einheiten WHERE id=?',[d.einheit_id]):null;
 const adressaten=[];
 for(const a of d.adressaten){const person=await db.get('SELECT id,nummer,firmenname,vorname,nachname,telefon,mobil,email FROM adressen WHERE id=?',[a.adresse_id]);if(person)adressaten.push({...person,anzeigename:name(person),bezeichnung:a.bezeichnung});}
 const kommunikation=handwerker?{telefone:await db.all('SELECT * FROM adress_telefone WHERE adresse_id=? ORDER BY id',[handwerker.id]),emails:await db.all('SELECT * FROM adress_emails WHERE adresse_id=? ORDER BY standard DESC,id',[handwerker.id]),ansprechpartner:await db.all('SELECT * FROM adress_ansprechpartner WHERE adresse_id=? ORDER BY id',[handwerker.id])}:{telefone:[],emails:[],ansprechpartner:[]};
 const dokumente=await db.all('SELECT d.id,d.titel,d.original_name,d.kategorie,d.dokument_datum FROM handwerker_dokumente h JOIN dokumente d ON d.id=h.dokument_id WHERE h.vorgang_id=? ORDER BY d.id DESC',[r.id]);
 return {...d,betrag:d.betrag===null?'':(d.betrag/100).toFixed(2).replace('.',','),handwerker:handwerker?{...handwerker,anzeigename:name(handwerker)}:null,objekt,einheit,adressaten_details:adressaten,kommunikation,dokumente};
}
async function invoices(db,owner,id){
 // Resolve ownership before this function; invoice document access is still checked
 // by the existing invoice service when a row is opened.
 const rows=await db.all("SELECT r.id,r.dokument_schluessel,r.daten,r.geaendert_am FROM eingangsrechnungen r WHERE upper(json_extract(r.daten,'$.hwa_nr')) IN (?,?) ORDER BY r.id DESC",['CA-'+Number(id),String(Number(id))]);
 const out=[];for(const r of rows){const parts=r.dokument_schluessel.split(':');if(parts[0]==='hp'&&!await db.get('SELECT id FROM hp_dms_quellen WHERE id=? AND benutzer_id=?',[parts[1],owner]))continue;out.push({...r,daten:JSON.parse(r.daten)});}return out;
}
module.exports={prepare,save,load,invoices,today};
