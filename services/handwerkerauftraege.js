'use strict';
const {ValidationError}=require('../lib/validation');
const fail=(m,s=400)=>{throw new ValidationError(m,s);};
const name=a=>a?.firmenname||[a?.vorname,a?.nachname].filter(Boolean).join(' ');
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function date(v,k){if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('Ungültiges Datum: '+k);return v;}
async function prepare(tx,owner,b){
 if(b===null||typeof b!=='object'||Array.isArray(b))fail('Ungültige Auftragsdaten.');
 const d={};
 if(b.status_code!==undefined){if(typeof b.status_code!=='string'||!require('../public/js/hwa-status')[b.status_code])fail('Unbekannter Handwerkerauftrags-Status.');d.status_code=b.status_code;}
 for(const [k,max] of Object.entries({vorgang:40,sachkonto:20,betreff2:500,pfkt:3})){const v=b[k]??(k==='pfkt'?'010':'');if(typeof v!=='string'||v.length>max)fail('Ungültiges Auftragsfeld: '+k);d[k]=v.trim();}
 if(d.pfkt&&!/^\d{3}$/.test(d.pfkt))fail('PFkt bitte dreistellig eingeben.');
 for(const k of ['rechnungsempfaenger_drucken','leistungsempfaenger_drucken']){d[k]=b[k]??true;if(typeof d[k]!=='boolean')fail('Ungültige Druckoption.');}
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
 if(d.sachkonto&&d.sachkonto!=='0'&&(!d.objekt_id||!await tx.get('SELECT id FROM sachkonten WHERE objekt_id=? AND nummer=? AND aktiv=1',[d.objekt_id,d.sachkonto])))fail('Sachkonto für dieses Objekt nicht gefunden.');
 if(!Array.isArray(b.adressaten)||b.adressaten.length>50)fail('Bitte höchstens 50 Auftragsadressaten angeben.');
 d.adressaten=[];const seen=new Set();
 for(const a of b.adressaten){if(!a||!Number.isSafeInteger(a.adresse_id)||a.adresse_id<1||typeof a.bezeichnung!=='string'||a.bezeichnung.length>100)fail('Ungültiger Auftragsadressat.');if(seen.has(a.adresse_id))fail('Adresse doppelt zugeordnet.');seen.add(a.adresse_id);if(!await tx.get('SELECT id FROM adressen WHERE id=? AND archiviert=0',[a.adresse_id]))fail('Auftragsadressat nicht verfügbar.');const kontakt={};for(const [key,max] of [['kontakt_name',200],['kontakt_telefon',100]]){if(a[key]!==undefined){if(typeof a[key]!=='string'||a[key].length>max)fail('Ungültige Kontaktangabe.');kontakt[key]=a[key].trim();}}d.adressaten.push({adresse_id:a.adresse_id,bezeichnung:a.bezeichnung.trim(),...kontakt});}
 if(d.erledigt_am&&d.datum&&d.erledigt_am<d.datum)fail('Erledigungsdatum liegt vor dem Auftragsdatum.');
 return d;
}
async function save(tx,id,d){if(!d.status_code){const old=await tx.get('SELECT daten FROM handwerkerauftraege WHERE vorgang_id=?',[id]);if(old)d.status_code=JSON.parse(old.daten).status_code;}await tx.run('INSERT INTO handwerkerauftraege(vorgang_id,daten) VALUES(?,?) ON CONFLICT(vorgang_id) DO UPDATE SET daten=excluded.daten',[id,JSON.stringify(d)]);}
async function load(db,r){
 const row=await db.get('SELECT daten FROM handwerkerauftraege WHERE vorgang_id=?',[r.id]);
 const hp=r.remote_snapshot||{},refs=r.bezuege||[];
 const supplier=refs.find(b=>b.typ==='adresse'&&hp.craftsman_person&&Number(b.remote_id)===Number(hp.craftsman_person.id));
 const hpMoney=v=>/^[0-9]{1,9}(\.[0-9]{1,2})?$/.test(String(v??''))?Math.round(Number(v)*100):null;
 const d=row?JSON.parse(row.daten):{handwerker_id:supplier?.ziel_id||null,objekt_id:refs.find(b=>b.typ==='objekt')?.ziel_id||null,einheit_id:refs.find(b=>b.typ==='einheit')?.ziel_id||null,akte_id:refs.find(b=>b.typ==='akte')?.fach_id||null,firma:typeof hp.company?.name==='string'?hp.company.name.slice(0,30):'',auftragsart:/notdienst/i.test(hp.type?.name||'')?'notdienst':/eilauftrag/i.test(hp.type?.name||'')?'eilauftrag':'normal',datum:typeof hp.to_occur==='string'?hp.to_occur.slice(0,10):r.erstellt_am.slice(0,10),erledigt_am:null,gewaehrleistung_bis:null,garantie_notiz:'',betrag:hpMoney(hp.estimated_price),adressaten:[]};
 const direct=hp.odbc?.kopf,sourceUnit=direct?(Number(direct.WhgNr)>0?{hp_id:direct.WhgNr}:null):((hp.units||[])[0]||hp.first_unit),sourceObject=direct?(Number(direct.ObjNr)>0?{hp_id:direct.ObjNr}:null):((hp.buildings||[])[0]||sourceUnit?.building||hp.first_building);
 const remoteObject=(!row||direct)&&sourceObject?{id:null,nummer:String(sourceObject.hp_id??''),bezeichnung:sourceObject.search||(!direct?refs.find(b=>b.typ==='objekt')?.name:'')||'',strasse:sourceObject.address?.street||'',plz:sourceObject.address?.zip||'',ort:sourceObject.address?.city||'',nur_original:true}:null;
 const remoteUnit=(!row||direct)&&sourceUnit?{id:null,nummer:String(sourceUnit.hp_id??''),bezeichnung:sourceUnit.position||'',nur_original:true}:null;
 const handwerker=d.handwerker_id?await db.get('SELECT * FROM adressen WHERE id=?',[d.handwerker_id]):null;
 const objekt=d.objekt_id?await db.get('SELECT id,nummer,bezeichnung,strasse,plz,ort,objekttyp FROM objekte WHERE id=?',[d.objekt_id]):null;
 const einheit=d.einheit_id?await db.get('SELECT id,nummer,bezeichnung,objekt_id FROM einheiten WHERE id=?',[d.einheit_id]):null;
 const adressaten=[];
 if(!row){for(const p of hp.persons||[]){const ref=refs.find(b=>b.typ==='adresse'&&Number(b.remote_id)===Number(p.person?.id));if(ref?.ziel_id&&ref.ziel_id!==d.handwerker_id&&!d.adressaten.some(a=>a.adresse_id===ref.ziel_id))d.adressaten.push({adresse_id:ref.ziel_id,bezeichnung:p.role?.name||p.person_type?.name||'Ansprechpartner',pfkt:p.role?.hp_id||''});}}
 for(const a of d.adressaten){if(a.adresse_id===d.handwerker_id&&a.bezeichnung==='HP-Adressat'&&!a.kontakt_name)continue;const person=await db.get('SELECT id,nummer,firmenname,vorname,nachname,telefon,mobil,email FROM adressen WHERE id=?',[a.adresse_id]);if(person)adressaten.push({...person,anzeigename:a.kontakt_name||name(person),kontakt_name:a.kontakt_name||'',kontakt_telefon:a.kontakt_telefon||'',bezeichnung:a.bezeichnung,pfkt:a.pfkt||''});}
 const kommunikation=handwerker?{telefone:await db.all('SELECT * FROM adress_telefone WHERE adresse_id=? ORDER BY id',[handwerker.id]),emails:await db.all('SELECT * FROM adress_emails WHERE adresse_id=? ORDER BY standard DESC,id',[handwerker.id]),ansprechpartner:await db.all('SELECT * FROM adress_ansprechpartner WHERE adresse_id=? ORDER BY id',[handwerker.id])}:{telefone:[],emails:[],ansprechpartner:[]};
 const dokumente=await db.all('SELECT d.id,d.titel,d.original_name,d.kategorie,d.dokument_datum FROM handwerker_dokumente h JOIN dokumente d ON d.id=h.dokument_id WHERE h.vorgang_id=? ORDER BY d.id DESC',[r.id]);
 const status_code=d.status_code||(require('../public/js/hwa-status')[String(hp.status?.hp_id||'').padStart(3,'0')]?String(hp.status.hp_id).padStart(3,'0'):({offen:'001',in_bearbeitung:'002',beauftragt:'004',storniert:'007',erledigt:'004'}[r.status]||'004'));
 return {...d,status_code,status_text:require('../public/js/hwa-status')[status_code].text,betrag:d.betrag===null?'':(d.betrag/100).toFixed(2).replace('.',','),originaltext:typeof hp.status_text?.text==='string'?hp.status_text.text:'',source_sb:[hp.team?.hp_id,[hp.team?.first_name,hp.team?.last_name].filter(Boolean).join(' ')].filter(Boolean).join(' · '),source_status:!row?[hp.status?.hp_id,hp.status?.name].filter(Boolean).join(' · '):null,handwerker:handwerker?{...handwerker,anzeigename:name(handwerker)}:null,objekt:objekt||remoteObject,einheit:einheit||remoteUnit,adressaten_details:adressaten,kommunikation,dokumente};
}
async function invoices(db,owner,id){
 // Resolve ownership before this function; invoice document access is still checked
 // by the existing invoice service when a row is opened.
 const rows=await db.all("SELECT r.id,r.dokument_schluessel,r.daten,r.geaendert_am FROM eingangsrechnungen r WHERE upper(json_extract(r.daten,'$.hwa_nr')) IN (?,?) ORDER BY r.id DESC",['CA-'+Number(id),String(Number(id))]);
 const out=[];for(const r of rows){const parts=r.dokument_schluessel.split(':');if(parts[0]==='hp'&&!await db.get('SELECT id FROM hp_dms_quellen WHERE id=? AND benutzer_id=?',[parts[1],owner]))continue;out.push({...r,daten:JSON.parse(r.daten)});}return out;
}
async function resolve(db,owner,b){
 if(!b||typeof b.nummer!=='string'||!b.nummer.trim()||b.nummer.length>100)fail('Bitte eine gültige Nummer eingeben.');
 const n=b.nummer.trim(),typ=b.typ;let rows;
 if(typ==='akte'){
  rows=await db.all("SELECT id,titel AS anzeigename,hp_nummer FROM fach_vorgaenge WHERE art='akte' AND (benutzer_id=? OR zustaendig_id=?) AND (hp_nummer=? OR ('CA-'||id)=? COLLATE NOCASE)",[owner,owner,n,n]);
  if(!rows.length&&/^\d+$/.test(n))rows=await db.all("SELECT id,titel AS anzeigename,hp_nummer FROM fach_vorgaenge WHERE art='akte' AND (benutzer_id=? OR zustaendig_id=?) AND id=?",[owner,owner,Number(n)]);
  rows=rows.map(r=>({...r,nummer:r.hp_nummer||'CA-'+r.id}));
 }else if(typ==='einheit'){
  if(!Number.isSafeInteger(b.objekt_id)||b.objekt_id<1)fail('Bitte zuerst die Objekt-Nr. eingeben.');
  const all=await db.all('SELECT id,nummer,bezeichnung AS anzeigename,objekt_id FROM einheiten WHERE objekt_id=? AND archiviert=0',[b.objekt_id]);
  rows=all.filter(r=>String(r.nummer).toLowerCase()===n.toLowerCase());
  if(!rows.length&&/^\d+$/.test(n))rows=all.filter(r=>{const tail=String(r.nummer).split('-').at(-1);return /^\d+$/.test(tail)&&Number(tail)===Number(n);});
 }else if(typ==='handwerker'||typ==='adresse')rows=await db.all("SELECT id,nummer,firmenname,vorname,nachname,strasse,plz,ort,telefon,mobil,email FROM adressen WHERE archiviert=0 AND (nummer=? COLLATE NOCASE OR nummer=? COLLATE NOCASE)",[n,'HP-'+n]);
 else if(typ==='objekt')rows=await db.all('SELECT id,nummer,bezeichnung AS anzeigename,strasse,plz,ort FROM objekte WHERE archiviert=0 AND (nummer=? COLLATE NOCASE OR nummer=? COLLATE NOCASE)',[n,'HP-'+n]);
 else fail('Unbekannte Nummernart.');
 if(rows.length!==1)fail(rows.length?'Nummer ist nicht eindeutig. Bitte die vollständige Nummer eingeben.':'Nummer nicht gefunden.',rows.length?409:404);
 const r=rows[0];return {...r,anzeigename:r.anzeigename||name(r)};
}
module.exports={prepare,save,load,invoices,today,resolve};
