'use strict';
function etvFormStand(root){return JSON.stringify([...root.querySelectorAll('input,select,textarea')].filter(f=>f.type!=='search').map(f=>[f.id||f.name||f.getAttribute('aria-label'),f.type==='checkbox'?f.checked:f.value]));}
function etvMerkeStand(root){if(root)root.etvGespeichert=etvFormStand(root);}
function etvInlineFenster(container,{titel,inhalt,footer,onClose}){
 const close=()=>{if(onClose)onClose();if(container.etvSchliessen)container.etvSchliessen();};
 const body=el('section',{class:'cu-etv-inline'},[el('h2',{text:titel}),inhalt]);
 if(footer)body.append(el('footer',{class:'cu-etv-inline-fuss'},footer(close)));
 container.replaceChildren(body);if(typeof maskenAktionenRechts==='function')maskenAktionenRechts(container,body.querySelector('.cu-etv-inline-fuss'));etvMerkeStand(container);return{close,box:body};
}
function etvAblaufRahmen(id,schritt,inhalt){
 const steps=[['basisdaten','Basisdaten'],['tagesordnung','Tagesordnung'],['teilnehmer','Teilnehmer'],['durchfuehrung','Durchführung']],nav=el('nav',{'aria-label':'Versammlungsablauf'}),layout=el('div',{class:'cu-etv-ablauf'}),seitenkopf=el('div',{class:'cu-etv-seitenkopf',text:'Versammlung'}),main=el('div',{class:'cu-etv-inhalt'},[inhalt]);
 let wechsel=false;
 async function gehen(hash){
  if(wechsel)return;
  if(main.etvGespeichert!==undefined&&etvFormStand(main)!==main.etvGespeichert){wechsel=true;const ok=await bestaetigen('Ungespeicherte Änderungen verwerfen und den Versammlungsschritt wechseln?',{text:'Änderungen verwerfen'});wechsel=false;if(!ok)return;}
  geheZu(hash);
 }
 for(const [index,[key,label]]of steps.entries())nav.append(el('a',{href:'#/etv/'+id+'?schritt='+key,class:'cu-etv-schritt'+(key===schritt?' aktiv':''),'aria-current':key===schritt?'step':null,onclick:e=>{e.preventDefault();gehen(e.currentTarget.getAttribute('href'));}},[el('span',{'aria-hidden':'true',class:'cu-etv-schritt-nr',text:String(index+1)}),el('span',{text:label})]));
 const aside=el('aside',{class:'cu-etv-seitenleiste'},[seitenkopf,nav,el('a',{href:'#/etv',class:'cu-etv-verlassen',text:'← Versammlung verlassen',onclick:e=>{e.preventDefault();gehen('#/etv');}})]);
 layout.append(aside,main);
 main.etvSchliessen=()=>gehen('#/etv/'+id+'?schritt=tagesordnung');
 return{layout,main,seitenkopf,merken:()=>etvMerkeStand(main)};
}
async function versammlungSchrittMaske(id,schritt,params=new URLSearchParams()){
 if(schritt==='durchfuehrung'&&params.get('ansicht')==='buehne'){const lauf=S.lauf,host=el('div');if(zeigeAufDesktop(lauf,maskenFenster({titel:'Bühnenansicht',kopf:{ueberschrift:'Bühnenansicht',drucken:false},inhalt:host})))await einlassMaske(id,{container:host,buehne:true});return;}
 const lauf=S.lauf,titel={basisdaten:'Basisdaten',teilnehmer:'Teilnehmer',durchfuehrung:'Durchführung'}[schritt],content=el('div'),flow=etvAblaufRahmen(id,schritt,content);
 if(!zeigeAufDesktop(lauf,maskenFenster({titel,kopf:{ueberschrift:titel,brot:[{text:'ETV',href:'#/etv'},{text:titel}],drucken:false},inhalt:flow.layout})))return;
 try{
  const v=await API.get('/versammlungen/'+id);if(lauf!==S.lauf)return;
  flow.seitenkopf.replaceChildren(el('strong',{text:v.name}),el('span',{text:'Objekt '+v.objekt_nummer+' · '+datum(v.datum)}));
  S.kontext={typ:'etv',versammlung:v};
  if(schritt==='basisdaten'){
   if(darfSchreiben())await versammlungForm(v,{container:flow.main});
   else content.append(el('h2',{text:v.name}),el('p',{text:'Objekt '+v.objekt_nummer+' · '+datum(v.datum)+' · '+(v.uhrzeit||'')}),el('p',{text:[v.ort,v.ort_strasse,v.ort_plz,v.ort_stadt].filter(Boolean).join(', ')}),el('p',{text:'Versammlungsleitung: '+(v.leitung_name||'Noch nicht zugeordnet')}));
  }else if(schritt==='teilnehmer')await teilnehmerDialog(id,{container:flow.main});
  else if(params.get('ansicht')==='live')await etvLiveMaske(id,{container:content});
  else if(params.get('ansicht')==='protokoll'){
   content.append(einlassReiter(id,'protokoll'));
   const host=el('div');content.append(host);host.etvSchliessen=flow.main.etvSchliessen;await protokollDialog(id,{container:host});
  }
  else await einlassMaske(id,{container:content});
  if(lauf===S.lauf)flow.merken();
 }catch(e){if(lauf===S.lauf)fehler(e);}
}
