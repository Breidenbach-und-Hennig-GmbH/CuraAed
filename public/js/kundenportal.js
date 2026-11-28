'use strict';
(()=>{
 const el=id=>document.getElementById(id),params=new URLSearchParams(location.search),fragment=new URLSearchParams(location.hash.slice(1));
 let token=fragment.get('aktivieren');
 if(token)history.replaceState(null,'',location.pathname+location.search);
 el('firma').value=params.get('firma')||'';
 const message=text=>{el('meldung').textContent=text;};
 async function api(path,data){const r=await fetch('/api/kundenportal/'+path,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});const b=await r.json();if(!r.ok)throw new Error(b.fehler||'Bitte versuchen Sie es später erneut.');return b;}
 function zeigen(data){
  token=null;el('anmeldung').hidden=true;el('konto').hidden=false;el('firma-name').textContent=data.firma.name;
  el('begruessung').textContent='Guten Tag, '+data.name;el('konto-email').textContent=data.email;el('wohnungen').replaceChildren();
  const table=document.createElement('table'),head=document.createElement('thead'),hr=document.createElement('tr');
  for(const text of ['Objekt','Wohnung','Bezeichnung','Funktion']){const th=document.createElement('th');th.textContent=text;hr.append(th);}head.append(hr);table.append(head);
  const body=document.createElement('tbody');for(const w of data.wohnungen){const tr=document.createElement('tr');for(const text of [w.objekt_nummer,w.nummer,w.bezeichnung,w.rolle==='eigentuemer'?'Eigentümer':'Mieter']){const td=document.createElement('td');td.textContent=text||'—';tr.append(td);}body.append(tr);}table.append(body);el('wohnungen').append(table);
  for(const o of data.objekte){const p=document.createElement('p');p.textContent='Objekt '+o.nummer+' · '+o.bezeichnung;el('wohnungen').append(p);}message(data.testkonto?'Testzugang: Es sind keine echten Objekte oder Wohnungen freigegeben.':'');
  ladeDokumente(true);
 }
 for(const [id,path] of [['login','anmelden'],['aktivieren','aktivieren']])el(id).addEventListener('submit',async e=>{
  e.preventDefault();const b=el(id).querySelector('button');b.disabled=true;
  try{if(id==='aktivieren'&&el('neu').value!==el('wiederholung').value)throw new Error('Die Passwörter stimmen nicht überein.');
   const data=id==='login'?{firma_id:Number(el('firma').value),email:el('email').value,passwort:el('passwort').value}:{token,firma_id:Number(el('firma').value),passwort:el('neu').value};
   zeigen(await api(path,data));
  }catch(error){message(error.message);}finally{for(const key of ['passwort','neu','wiederholung'])el(key).value='';b.disabled=false;}
 });
 el('abmelden').onclick=async()=>{try{await api('abmelden',{});location.assign('/kundenportal?firma='+encodeURIComponent(el('firma').value));}catch(e){message(e.message);}};
 let dokumentCursor=null,dokumentVersion=0;
 async function ladeDokumente(neu){
  const version=++dokumentVersion;if(neu){dokumentCursor=null;el('dokument-liste').replaceChildren();}
  el('dokument-weiter').disabled=true;el('dokument-status').textContent='Dokumente werden geprüft …';
  try{const r=await api('dokumente?suche='+encodeURIComponent(el('dokument-begriff').value)+'&nach='+(neu?0:dokumentCursor||0));if(version!==dokumentVersion)return;
   for(const d of r.eintraege||[]){const tr=document.createElement('tr');for(const text of [d.datum||'—',d.titel,d.dateiname]){const td=document.createElement('td');td.textContent=text;tr.append(td);}const td=document.createElement('td');for(const [label,suffix]of [['Öffnen','?vorschau=1'],['Herunterladen','']]){const a=document.createElement('a');a.textContent=label;a.href='/api/kundenportal/dokumente/'+encodeURIComponent(d.id)+'/datei'+suffix;a.target='_blank';a.rel='noopener noreferrer';td.append(a,document.createTextNode(' '));}tr.append(td);el('dokument-liste').append(tr);}
   dokumentCursor=r.nach;el('dokument-weiter').disabled=!r.mehr;el('dokument-status').textContent=el('dokument-liste').children.length?'Freigegebene Unterlagen zu Ihren eigenen Zuordnungen.':'Keine passenden freigegebenen Unterlagen vorhanden.';
  }catch(e){if(version===dokumentVersion)el('dokument-status').textContent=e.message;}
 }
 el('dokument-suche').addEventListener('submit',e=>{e.preventDefault();ladeDokumente(true);});
 el('dokument-weiter').onclick=()=>ladeDokumente(false);
 if(token){el('login').hidden=true;el('aktivieren').hidden=false;el('neu').focus();}
 else api('meine-daten').then(zeigen).catch(()=>{el('email').focus();});
})();
