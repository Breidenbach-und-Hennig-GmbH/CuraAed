'use strict';
(()=>{
 const root=document.getElementById('teilnahme'),parts=location.hash.slice(1).split('/'),id=Number(parts[0]);let roomToken=parts[1]||'',busy=false,last='',timer,sequence=0;
 const el=(tag,attrs={},children=[])=>{const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='text')n.textContent=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(k==='class')n.className=v;else if(k==='disabled')n.disabled=v;else n.setAttribute(k,v);}for(const c of children)n.append(c);return n;};
 async function request(path,method='GET',body){const r=await fetch('/api/etv-teilnahme/'+id+path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined}),d=await r.json().catch(()=>({}));if(!r.ok){const e=Error(d.fehler||'Verbindung fehlgeschlagen.');e.status=r.status;throw e;}return d;}
 const msg=el('p',{role:'status'});
 function login(){
  if(root.querySelector('form'))return;root.replaceChildren(el('h1',{text:'An der Eigentümerversammlung teilnehmen'}));
  if(!Number.isSafeInteger(id)||id<1||!roomToken){root.append(el('p',{text:'Bitte den QR-Code scannen oder den vollständigen Teilnahme-Link Ihrer Versammlungsleitung öffnen.'}));return;}
  const name=el('input',{required:'',maxlength:'160',autocomplete:'name','aria-label':'Ihr Name'}),channel=el('select',{'aria-label':'Teilnahmeort'},[el('option',{value:'praesenz',text:'Ich bin vor Ort'}),el('option',{value:'online',text:'Ich nehme von zu Hause teil'})]),submit=el('button',{text:'Teilnahme anfragen',type:'submit'}),form=el('form',{},[el('label',{text:'Ihr Name'},[name]),el('label',{text:'Teilnahmeort'},[channel]),el('p',{class:'muted',text:'Die Versammlungsleitung prüft Ihre Identität und ordnet Ihre Eigentümergruppe oder Vollmacht zu.'}),submit,msg]);
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy||!form.reportValidity())return;busy=true;submit.disabled=true;msg.textContent='';
   try{await request('/anfragen','POST',{raum_token:roomToken,name:name.value,kanal:channel.value});roomToken='';history.replaceState(null,'','#'+id);busy=false;last='';await poll();}
   catch(e){msg.textContent=e.message;busy=false;submit.disabled=false;}
  });root.append(el('section',{},[form]));
 }
 function render(s){
  const expanded=new Set([...root.querySelectorAll('details[open]')].map(n=>n.dataset.top));root.replaceChildren(el('h1',{text:s.versammlung.name}),el('p',{class:'muted',text:s.name+' · '+s.versammlung.datum.split('-').reverse().join('.')}),msg);
  if(s.status!=='zugelassen'){root.append(el('section',{},[el('h2',{text:'Bitte auf Freigabe warten'}),el('p',{text:'Ihre Anfrage liegt der Versammlungsleitung vor. Nach der Prüfung erscheinen Tagesordnung und Abstimmung automatisch.'})]));return;}
  const current=s.tops.find(t=>t.id===s.aktueller_top_id),agenda=el('div'),side=el('div');
  const topBox=el('section',{},[el('h2',{text:current?'Aktuell: TOP '+current.position+' · '+current.titel:'Die Versammlung beginnt in Kürze'})]);
  if(current){if(current.erlaeuterung)topBox.append(el('h3',{text:'Erläuterung'}),el('p',{class:'pre',text:current.erlaeuterung}));if(current.beschlussvorschlag)topBox.append(el('h3',{text:'Beschlussvorschlag'}),el('p',{class:'pre',text:current.beschlussvorschlag}));}
  agenda.append(topBox);
  const round=s.abstimmung,top=round&&s.tops.find(t=>t.id===round.top_id);
  if(round){const box=el('section',{},[el('h2',{text:'Abstimmung · TOP '+(top?.position||'')+' '+(top?.titel||'')})]);
   if(round.status==='offen'){
    if(!round.gruppen.length)box.append(el('p',{text:'Für Ihren Zugang ist kein digitales Stimmrecht in dieser Runde freigegeben.'}));
    for(const g of round.gruppen){const row=el('div',{},[el('h3',{text:g.name})]);if(!g.berechtigt){row.append(el('p',{text:'In dieser Runde nicht stimmberechtigt.'}));box.append(row);continue;}
     row.append(el('p',{class:g.stimme?'success':'muted',text:g.stimme?'Gespeichert: '+({ja:'Ja',nein:'Nein',enthaltung:'Enthaltung'}[g.stimme]||g.stimme):'Noch keine Stimme abgegeben.'}));
     const buttons=el('div',{class:'votes'});for(const[choice,label]of [['ja','Ja'],['nein','Nein'],['enthaltung','Enthaltung']])buttons.append(el('button',{type:'button',text:label,class:choice+(g.stimme===choice?' selected':''),'aria-label':label+' · '+g.name,onclick:async()=>{
      if(busy)return;busy=true;sequence++;msg.textContent='';for(const b of root.querySelectorAll('.votes button'))b.disabled=true;
      try{await request('/runden/'+round.id+'/stimme','POST',{key:g.key,stimme:choice,version:g.version});last='';msg.textContent='Ihre Stimme wurde gespeichert.';}
      catch(e){last='';msg.textContent=e.message;}finally{busy=false;await poll();}
     }}));row.append(buttons);box.append(row);
    }
   }else{box.append(el('p',{text:'Die Abstimmung ist geschlossen.'}));if(round.ergebnis){const z=round.ergebnis,counts=z.summen_anzeige||z.summen;box.append(el('p',{text:'Ja: '+counts.ja+' · Nein: '+counts.nein+' · Enthaltungen: '+counts.enthaltung}),el('p',{text:'Rechnerisch: '+({angenommen:'angenommen',abgelehnt:'abgelehnt',keine_gueltige_stimme:'keine gültige Ja-/Nein-Stimme'}[z.status]||z.status)}));}}
   agenda.append(box);
  }
  if(s.teams_url)side.append(el('section',{},[el('h2',{text:'Bild und Ton über Teams'}),el('p',{text:'Teams in einem zweiten Fenster öffnen. Hier bleiben Tagesordnung und Abstimmung sichtbar.'}),el('a',{href:s.teams_url,target:'_blank',rel:'noopener noreferrer',class:'button',text:'Teams-Besprechung öffnen'})]));
  side.append(el('section',{},[el('h2',{text:'Tagesordnung'}),...s.tops.map(t=>{const d=el('details',{'data-top':String(t.id)},[el('summary',{text:'TOP '+t.position+' · '+t.titel}),el('p',{class:'pre',text:t.erlaeuterung||''}),el('p',{class:'pre',text:t.beschlussvorschlag||''})]);if(expanded.has(String(t.id)))d.open=true;return d;})]));
  root.append(el('div',{class:'layout'},[agenda,side]));
 }
 async function poll(){if(busy)return;const n=++sequence;try{const s=await request('/stand');if(busy||n!==sequence)return;const key=JSON.stringify(s);if(key!==last){last=key;render(s);}else for(const b of root.querySelectorAll('.votes button'))b.disabled=false;}
  catch(e){if(e.status===401){if(!last)login();return;}if([403,410].includes(e.status)){root.replaceChildren(el('h1',{text:'Zugang nicht verfügbar'}),el('p',{text:e.message}));last='';return;}
   msg.textContent=e.message+' Bitte die Verbindung prüfen.';for(const b of root.querySelectorAll('.votes button'))b.disabled=true;
  }
 }
 if(Number.isSafeInteger(id)&&id>0){poll();timer=setInterval(poll,3000);}else login();
 window.addEventListener('pagehide',()=>clearInterval(timer));
})();
