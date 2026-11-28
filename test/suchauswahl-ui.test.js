'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
function setup(t){const d=new JSDOM('<div id="hp-desktop"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test/#/hwa'});t.after(()=>d.window.close());for(const f of ['adressdaten','ui','kern','suchauswahl','shell','dialoge','masken','vorgaenge','hwa-status','handwerkerauftraege','hwa-erfassung'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());const w=d.window;w.eval('S.lauf=1;S.benutzer={id:1,name:"Test",rolle:"mitarbeiter"}');w.API={qs:q=>'?'+new URLSearchParams(q)};return w;}
const settle=()=>new Promise(r=>setTimeout(r,220));
const type=(w,i,value)=>{i.value=value;i.dispatchEvent(new w.Event('input',{bubbles:true}));};
const key=(w,i,key)=>i.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
test('Objekt- und Wohnungsauswahl: Namenssuche, echte ID, Änderungen, dynamische Optionen und Sperren',async t=>{
 const w=setup(t);w.API.get=async url=>{assert.match(url,/objekte.*suche=Park/);return[{id:901,nummer:'90001',bezeichnung:'Parkhaus'}];};
 const form=w.eval('UI').formular([[{name:'objekt_id',label:'Objekt',type:'select',required:true,options:[{value:'',label:'Wählen'}]},{name:'einheit_id',label:'Wohnung',type:'select',options:[{value:'',label:'Ganzes Objekt'},{value:7,label:'0007 · Wohnung links'}]}]]);
 w.document.body.append(form.form);const obj=w.document.getElementById('f_objekt_id_suche');type(w,obj,'Park');await settle();key(w,obj,'Tab');
 assert.equal(form.inputs.objekt_id.value,'901');assert.equal(form.werte().objekt_id,'901');
 type(w,obj,'Unbekannt');assert.equal(form.inputs.objekt_id.value,'');assert.throws(()=>form.werte(),/Treffer/);
 form.inputs.objekt_id.value='901';form.inputs.objekt_id.dispatchEvent(new w.Event('change'));await settle();
 const unit=w.document.getElementById('f_einheit_id_suche');type(w,unit,'links');await settle();key(w,unit,'Enter');assert.equal(form.inputs.einheit_id.value,'7');
 form.inputs.einheit_id.replaceChildren(new w.Option('Ganzes Objekt',''),new w.Option('0008 · Wohnung rechts','8'));form.inputs.einheit_id.value='';await settle();
 assert.equal(unit.value,'');form.inputs.einheit_id.disabled=true;await settle();assert.equal(unit.disabled,true);
});
test('Suchvorschläge: alte Antworten und falscher Objektbezug sind gesperrt',async t=>{
 const w=setup(t),input=w.document.createElement('input');input.id='bezug';w.document.body.append(input);let scope='A',resolve,selected=0;
 const c=w.tippAuswahl(input,{scope:()=>scope,suchen:()=>new Promise(r=>resolve=r),auswaehlen:()=>selected++});
 type(w,input,'alt');await settle();scope='B';resolve([{value:1,label:'Alte Wohnung'}]);await settle();assert.equal(c.wrap.querySelectorAll('[role=option]').length,0);assert.equal(selected,0);
});
test('HWA: Objekt, Wohnung und Handwerker per Name wählen und als IDs speichern; Objektwechsel leert die Wohnung',async t=>{
 const w=setup(t),queries=[];let saved;
 const object={id:3,nummer:'21350',bezeichnung:'Ackerstraße 77'},unit={id:9,objekt_id:3,nummer:'21350-0007',bezeichnung:'Wohnung links'},supplier={id:2,nummer:'31359',anzeigename:'Spanke Haustechnik'};
 w.API.get=async url=>{queries.push(url);if(url==='/mitarbeiter')return[{id:1,kuerzel:'FD',name:'Test'}];if(url.startsWith('/objekte/3/einheiten'))return[unit];if(url.startsWith('/objekte?'))return[object];if(url.startsWith('/adressen?'))return[supplier];return[];};
 w.API.post=async(url,b)=>{if(url==='/vorgaenge'){saved=b;return{id:8};}throw Error('Gewählte Treffer sollen nicht erneut als Freitext aufgelöst werden.');};
 w.handwerkerMaske(w.hwaLeereAnzeige());await w.handwerkerErfassung();
 for(const [id,q] of [['objekt_nr','Acker'],['wohnung_nr','links'],['handwerker_nr','Spanke']]){const i=w.document.getElementById('f_'+id);type(w,i,q);await settle();key(w,i,'Tab');}
 assert.equal(w.document.getElementById('f_wohnung_nr').value,'21350-0007');assert.ok(queries.some(u=>u.startsWith('/objekte/3/einheiten?suche=links')));
 type(w,w.document.getElementById('f_titel'),'Abfluss prüfen');w.document.getElementById('hwa-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
 assert.equal(saved.auftrag.objekt_id,3);assert.equal(saved.auftrag.einheit_id,9);assert.equal(saved.auftrag.handwerker_id,2);
 // Separate frische Erfassung prüft das Verwerfen einer alten Wohnung.
 w.document.querySelector('.cu-hwa-form').remove();await w.handwerkerErfassung();
 for(const [id,q] of [['objekt_nr','Acker'],['wohnung_nr','links']]){const i=w.document.getElementById('f_'+id);type(w,i,q);await settle();key(w,i,'Tab');}
 type(w,w.document.getElementById('f_objekt_nr'),'anderes');assert.equal(w.document.getElementById('f_wohnung_nr').value,'');
});

test('Telefoneingang: Objekt- und Wohnungsnamen werden zu Nummern; Ticket wird vorbereitet',async t=>{
 const w=setup(t),queries=[];w.API.get=async url=>{queries.push(url);if(url==='/mitarbeiter')return[{id:1,kuerzel:'FD',name:'Test'}];if(url.startsWith('/objekte/3/einheiten'))return[{id:9,objekt_id:3,nummer:'21350-0007',bezeichnung:'Wohnung links'}];if(url.startsWith('/objekte?'))return[{id:3,nummer:'21350',bezeichnung:'Ackerstraße'}];return[];};
 await w.telefonEingang();const object=w.document.getElementById('tel_objekt'),unit=w.document.getElementById('tel_wohnung');
 type(w,object,'Acker');await settle();key(w,object,'Tab');assert.equal(object.value,'21350');assert.equal(w.document.getElementById('tel_ticket').checked,true);
 type(w,unit,'links');await settle();key(w,unit,'Tab');assert.equal(unit.value,'21350-0007');
 type(w,object,'anderes');assert.equal(unit.value,'');
});
