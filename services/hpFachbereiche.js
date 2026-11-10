'use strict';
const {HpMobileError}=require('./hausperfektMobile');
const BEREICHE=Object.freeze({cis:'zis',craftsman_tasks:'handwerker',records:'akte',tasks:'wiedervorlage',notes:'notiz'});
const txt=v=>typeof v==='string'?v:'';
const number=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
const unwrap=v=>v?.data&&!Array.isArray(v.data)?v.data:v;
function bereich(resource){if(!Object.hasOwn(BEREICHE,resource))throw new HpMobileError('Unbekannter Fachbereich.',400);return BEREICHE[resource];}
// Keep source data for independent access, without recursively retaining account
// objects, credentials or prototype keys from the source service.
function snapshot(value,depth=0){
 if(depth>20)return null;
 if(Array.isArray(value))return value.map(v=>snapshot(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/^(__proto__|prototype|constructor|user|user_created|authenticated_user|password|passwort|access_token|refresh_token|authorization|token|secret)$/i.test(k)).map(([k,v])=>[k,snapshot(v,depth+1)]));
 return value;
}
function datum(v){const s=txt(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))?s:null;}
function projection(resource,raw){
 const art=bereich(resource),text=txt(raw.text)||txt(raw.description)||[raw.info_1,raw.info_2].filter(Boolean).join('\n');
 const done=[raw.closed,raw.finished,raw.completed,raw.processed_at].some(v=>v===true||v===1||(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}/.test(v)));
 const phase=txt(raw.status?.name)||txt(raw.status?.description);
 const status=done?'erledigt':/storniert|abgebrochen/i.test(phase)?'storniert':/auftrag erteilt|beauftragt/i.test(phase)?'beauftragt':/mahnung|bearbeitung/i.test(phase)?'in_bearbeitung':'offen';
 return {art,titel:(txt(raw.subject)||txt(raw.search)||txt(raw.title)||txt(raw.name)||text.split(/[\r\n]/)[0]||({akte:'Akte',handwerker:'Handwerkerauftrag',wiedervorlage:'Wiedervorlage',zis:'ZIS',notiz:'Notiz'}[art]+' '+(raw.hp_id??raw.id))).slice(0,500),
 text:text.slice(0,65535),status,prioritaet:/notdienst/i.test(raw.type?.name||'')?'dringend':/eilauftrag/i.test(raw.type?.name||'')?'hoch':'normal',
 faellig_am:datum(raw.due_date||raw.deadline||raw.date),uhrzeit:/^\d\d:\d\d/.test(txt(raw.due_time||raw.time))?txt(raw.due_time||raw.time).slice(0,5):null};
}
function bezuege(raw){
 const out=[];
 function add(typ,item,objekt=null){
  if(!item||!number(item.id))return;
  const name=typ==='adresse'?[item.firstname,item.lastname].filter(Boolean).join(' '):txt(item.position)||txt(item.search)||txt(item.subject)||txt(item.file_notes)||txt(item.file_original_name)||txt(item.name);
  const r={typ,remote_id:number(item.id),hp_nummer:item.hp_id===undefined?null:String(item.hp_id),objekt_nummer:objekt===null?null:String(objekt),name:name||'HP '+(item.hp_id??item.id)};
  if(!out.some(x=>x.typ===r.typ&&x.remote_id===r.remote_id))out.push(r);
 }
 for(const item of raw.persons||[])add('adresse',item.person||item);
 add('adresse',raw.craftsman_person);
 for(const item of raw.buildings||[])add('objekt',item);
 for(const item of raw.units||[]){add('einheit',item,item.building?.hp_id);if(item.building)add('objekt',item.building);}
 for(const [key,typ] of Object.entries(BEREICHE))for(const item of Array.isArray(raw[key])?raw[key]:[])add(typ,item);
 for(const container of Array.isArray(raw.documents)?raw.documents:[]){
  if(Array.isArray(container.document_files))for(const file of container.document_files)add('dokument',file);
  else if(container.container_id)add('dokument',container);
 }
 return out;
}
async function liste(client,resource,page=1){
 bereich(resource);const result=await client.fachListe(resource,page),rows=Array.isArray(result)?result:result?.data;
 if(!Array.isArray(rows)||rows.some(r=>!number(r.id)))throw new HpMobileError('Ungültige HP-Fachbereichsliste.',502);
 return {eintraege:rows.map(r=>({id:number(r.id)})),gesamt:Number.isSafeInteger(result.meta?.total)?result.meta.total:null,weitere:Number.isSafeInteger(result.meta?.last_page)?page<result.meta.last_page:rows.length===50};
}
async function details(client,resource,id){
 bereich(resource);const raw=unwrap(await client.fachDetails(resource,id));
 if(!raw||number(raw.id)!==number(id))throw new HpMobileError('Ungültiger HP-Eintrag.',502);
 const missing=['persons','units','buildings','records','craftsman_tasks','cis','tasks','documents'].filter(k=>Number(raw[k+'_count'])>(Array.isArray(raw[k])?raw[k].length:0));
 return {remote_id:number(raw.id),hp_nummer:raw.hp_id===undefined?null:typeof raw.hp_id==='object'?JSON.stringify(raw.hp_id):String(raw.hp_id),werte:projection(resource,raw),snapshot:snapshot(raw),bezuege:bezuege(raw),unvollstaendig:missing};
}
module.exports={BEREICHE,projection,bezuege,snapshot,liste,details};
