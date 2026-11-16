'use strict';
async function hpAktenMaske(){
 if(!istAdmin()){toast('Die HP-Übernahme ist nur für Administratoren verfügbar.','error');geheZu('#/');return;}
 const lauf=S.lauf,root=el('section');if(!arbeitsMaske(lauf,root,{titel:'Akten aus HausPerfekt übernehmen',brot:[{text:'Einstellungen'},{text:'HP-Aktenübernahme'}],aktionen:[{text:'Akten / Vorgänge',onclick:()=>geheZu('#/vorgaenge')},{text:'HP-Verbindungen',onclick:()=>geheZu('#/hausperfekt')}]}))return;
 root.append(el('p',{text:'Übernimmt Akten mit ihren Adressen, Handwerkeraufträgen und Archivdateien direkt aus HausPerfekt. Vorhandene Zuordnungen werden wiederverwendet; lokale Änderungen bleiben erhalten.'}));
 const body=el('div'),warnings=el('div');root.append(body,warnings);let busy=false;
 async function refresh(){try{const info=await API.get('/hp-akten/status');if(lauf!==S.lauf)return;body.replaceChildren();
  for(const c of info.verbindungen){const j=info.auftraege.find(x=>x.verbindung_id===c.id),active=['metadaten','zuordnen','dateien'].includes(j?.status);body.append(abschnitt(c.name+' · '+c.datenbank,panel([['Bereich',j?.bereich||'Noch nicht gestartet'],['Gelesen / verarbeitet',j?.anzahl||0],['Status',({metadaten:'Aktenbestand wird gelesen',zuordnen:'Zuordnungen werden aufgebaut',dateien:'Dateien werden gesichert',angehalten:'Angehalten',fertig:'Durchlauf beendet',fehler:'Prüfung erforderlich'})[j?.status]||'Bereit'],['Akten / Aufträge',(j?.akten||0)+' Akten · '+(j?.handwerker||0)+' Handwerkeraufträge'],['Archivdateien',(j?.gesichert||0)+' gesichert · '+(j?.ausstehend||0)+' ausstehend'],['Meldungen',j?.warnungen||0],['HP-Programm zuletzt verbunden',j?.zuletzt_gesehen||'HP-Aktenimport auf dem HP-Rechner öffnen'],['Hinweis',j?.meldung||'']]),[
   {text:j?'Übernahme fortsetzen / erneut abgleichen':'Übernahme starten',disabled:active,onclick:async()=>{if(busy)return;busy=true;try{await API.post('/hp-akten/'+c.id+'/starten',{});refresh();}catch(e){fehler(e);}finally{busy=false;}}},
   active?{text:'Anhalten',onclick:async()=>{try{await API.post('/hp-akten/'+c.id+'/anhalten',{});refresh();}catch(e){fehler(e);}}}:null,
   j?.warnungen?{text:'Meldungen anzeigen',onclick:async()=>{try{const rows=await API.get('/hp-akten/'+c.id+'/meldungen');if(lauf===S.lauf)warnings.replaceChildren(abschnitt('Zu prüfende Zuordnungen und Dateien (bis zu 200)',raster([{label:'Meldung',render:r=>r.meldung}],rows)));}catch(e){fehler(e);}}}:null
  ].filter(Boolean)));
  }
  if(!info.verbindungen.length)body.append(el('p',{text:'Zuerst den HP-Adressabgleich unter HP-Verbindungen einrichten.'}));
  body.append(el('p',{},[el('a',{href:'/downloads/HP-Aktenimport.exe',text:'HP-Aktenimport für den HP-Rechner herunterladen'})]),el('p',{class:'small muted',text:'Das HP-Programm verwendet die dort bereits gespeicherte Verbindung des Adressabgleichs. Es liest den Bestand und kopiert zugeordnete Dateien. HausPerfekt wird dabei nicht verändert. Nach einer Unterbrechung an derselben Stelle fortsetzen.'}));
  if(info.auftraege.some(j=>['metadaten','zuordnen','dateien'].includes(j.status)))setTimeout(()=>{if(lauf===S.lauf)refresh();},5000);
 }catch(e){if(lauf===S.lauf)body.replaceChildren(el('p',{role:'alert',text:e.message}));}}
 await refresh();
}
