'use strict';
async function hpDirektBereich(lauf, desktop) {
  if (S.benutzer?.rolle !== 'admin') return;
  const section = el('section', {class:'cu-karte',style:'padding:20px;max-width:1100px;margin:16px auto'});
  const status = el('p',{role:'status','aria-live':'polite'}), list = el('div');
  let busy = false;
  async function action(fn) {
    if (busy) return; busy = true;
    try { await fn(); await load(); } catch(e) { status.textContent=e.message; } finally { busy=false; }
  }
  async function load() {
    const r=await API.get('/hp-direkt/verbindungen');
    if(lauf!==S.lauf || !section.isConnected)return;
    list.replaceChildren();
    for(const v of r.verbindungen) {
      const fresh=v.snapshot && v.version && Date.now()-v.gelesen_am<60000;
      const title=el('input',{type:'text',value:v.snapshot?.titel || '',maxlength:'30','aria-label':'Titel des HP-Testkontakts',autocomplete:'off'});
      const queue=(art,extra={}) => action(async()=> {
        await API.post('/hp-direkt/verbindungen/'+encodeURIComponent(v.id)+'/auftrag',{id:crypto.randomUUID(),art,...extra});
        status.textContent='Auftrag wartet auf den verbundenen HP-Connector. „Status aktualisieren“ zeigt die bestätigte Rückmeldung.';
      });
      const online=v.zuletzt_gesehen && Date.now()-v.zuletzt_gesehen<20000;
      list.append(el('div',{style:'border:1px solid #ddd;padding:14px;margin:12px 0'},[
        el('h3',{text:v.name}),
        el('p',{text:v.datenbank+' · Testkontakt '+v.test_nummer+' · '+(Date.now()>v.ablauf_ms?'Freigabe abgelaufen':online?'Connector verbunden':'Connector nicht aktuell verbunden')}),
        el('p',{text:v.snapshot?'Zuletzt aus HP gelesen: '+v.snapshot.name+'; Titel: '+(v.snapshot.titel||'(leer)'):'Noch kein bestätigter HP-Lesezugriff für diese Verbindung.'}),
        el('button',{type:'button',text:'Testkontakt frisch aus HP lesen',onclick:()=>queue('lesen')}),
        el('label',{},[' Titel des Testkontakts ',title]),
        el('button',{type:'button',text:'Titel in HP speichern',disabled:fresh?null:'disabled',onclick:async()=> {
          if(!/^[\x20-\x7e]{0,30}$/.test(title.value) || title.value.endsWith(' ')){status.textContent='Im Test bitte höchstens 30 druckbare ASCII-Zeichen ohne Leerzeichen am Ende eingeben.';return;}
          if(await bestaetigen('Den Titel ausschließlich für HP-Testkontakt '+v.test_nummer+' / CURAAED-TEST ändern?'))queue('titel',{version:v.version,neu:title.value});
        }}),
        el('button',{type:'button',text:'Verbindung trennen',onclick:()=>action(async()=> {
          if(await bestaetigen('Diese Connector-Freigabe beenden? Ein bereits abgeholter Auftrag kann noch ausgeführt werden.')) await API.post('/hp-direkt/verbindungen/'+encodeURIComponent(v.id)+'/trennen',{});
        })}),
        el('ul',{},v.auftraege.map(j=>el('li',{text:(j.art==='titel'?'Titeländerung':'Leseauftrag')+' · '+j.status+(j.meldung?' · '+j.meldung:'')}))),
      ]));
    }
    if(!r.verbindungen.length)list.append(el('p',{text:'Noch kein direkter HP-Connector gekoppelt.'}));
  }
  const create=el('button',{type:'button',text:'Direkten HP-Testconnector koppeln',onclick:()=> {
    const f=formular([[{name:'name',label:'Name dieser HP-Verbindung',required:true},{name:'datenbank',label:'HP-Datenbank (aus der Serverprüfung)',required:true},{name:'test_nummer',label:'HP-Nummer des separaten Kontakts CURAAED-TEST',required:true,type:'number'}]]);
    const consent=el('input',{type:'checkbox'}), info=el('p',{role:'status'}); let sending=false;
    f.form.append(el('label',{},[consent,' Für 8 Stunden das Lesen des benannten Testkontakts und Änderungen ausschließlich an dessen Titel freigeben.']));
    const win=modal({titel:'Direkten HP-Testconnector koppeln',inhalt:el('div',{},[f.form,info]),footer:close=>[
      el('button',{type:'button',text:'Freigabe erstellen',onclick:()=>f.form.requestSubmit()}),el('button',{type:'button',text:'Schließen',onclick:close}),
    ]});
    f.form.addEventListener('submit',async ev=> {
      ev.preventDefault(); if(sending || !consent.checked)return; sending=true;
      try {
        const r=await API.post('/hp-direkt/verbindungen',{name:f.inputs.name.value,datenbank:f.inputs.datenbank.value,test_nummer:Number(f.inputs.test_nummer.value),zustimmung:true});
        const pairing=el('textarea',{readonly:'readonly',rows:'6','aria-label':'Einmalig angezeigte Connector-Zugangsdaten'});
        pairing.value=JSON.stringify({id:r.id,token:r.token});
        f.form.replaceChildren(el('p',{text:'Diese Zugangsdaten einmalig in das HP-Connector-Fenster auf dem Server einfügen. Sie werden hier nach dem Schließen nicht erneut angezeigt. Nicht per E-Mail oder Chat versenden.'}),pairing);
        info.textContent='Freigabe gültig bis '+new Date(r.ablauf_ms).toLocaleString('de-DE')+'. Auf dem Server müssen Datenbank und Testnummer übereinstimmen.';
        await load();
      }catch(e){info.textContent=e.message;sending=false;}
    });
  }});
  section.append(el('h2',{text:'Direkte Rückschreibung – Testphase'}),el('p',{text:'Der Windows-Connector verbindet euren HP-Bestand direkt mit CuraAed. Zunächst wird ausschließlich der Titel eines separaten Kontakts CURAAED-TEST zurückgeschrieben. Normale Adressmasken, Objekte und Einheiten sind noch nicht gekoppelt.'}),
    el('p',{},[el('a',{href:'/downloads/HP-Direktconnector.exe',download:'HP-Direktconnector.exe',text:'HP-Testconnector für Windows herunterladen'})]),create,
    el('button',{type:'button',text:'Status aktualisieren',onclick:()=>action(async()=>{})}),status,list);
  desktop.append(section);
  try{await load();}catch(e){status.textContent=e.message;}
}

