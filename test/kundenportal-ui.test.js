'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),tick=()=>new Promise(r=>setImmediate(r));
function fixture(t,activation=true){
 const html=fs.readFileSync(path.join(__dirname,'../public/kundenportal.html'),'utf8');
 const token='A'.repeat(43),dom=new JSDOM(html,{runScripts:'outside-only',url:'https://curaaed.example/kundenportal?firma=1'+(activation?'#aktivieren='+token:'')});t.after(()=>dom.window.close());
 const w=dom.window,calls=[],daten={name:'<img src=x onerror=alert(1)>',email:'test@example.test',firma:{id:1,name:'Firma A'},objekte:[{nummer:4001,bezeichnung:'Testobjekt'}],wohnungen:[{objekt_nummer:4001,nummer:8,bezeichnung:'WE 8',rolle:'eigentuemer'}]};
 w.fetch=async(url,options)=>{calls.push({url,options});return{ok:options.method==='POST',json:async()=>options.method==='POST'?daten:{fehler:'Bitte anmelden.'}};};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/kundenportal.js'),'utf8'),dom.getInternalVMContext());
 return{w,calls,token};
}
test('Kundenportal: Aktivierungsgeheimnis aus Adresszeile entfernt, Passwortabgleich, keine Fremd- oder Mitarbeiteranfragen',async t=>{
 const f=fixture(t),d=f.w.document;assert.equal(f.w.location.hash,'');assert.equal(d.activeElement.id,'neu');
 assert.equal(f.calls.length,0);d.getElementById('neu').value='Sicheres-Passwort-2026';d.getElementById('wiederholung').value='Anderes-Passwort-2026';
 d.getElementById('aktivieren').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();assert.equal(f.calls.length,0);assert.match(d.getElementById('meldung').textContent,/stimmen nicht/);
 d.getElementById('neu').value=d.getElementById('wiederholung').value='Sicheres-Passwort-2026';
 d.getElementById('aktivieren').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(f.calls[0].url,'/api/kundenportal/aktivieren');assert.equal(JSON.parse(f.calls[0].options.body).token,f.token);
 assert.ok(f.calls.every(c=>c.url.startsWith('/api/kundenportal/')&&!c.url.includes(f.token)));
 assert.equal(d.getElementById('neu').value,'');assert.equal(d.getElementById('wiederholung').value,'');
 assert.equal(d.getElementById('konto').hidden,false);assert.equal(d.querySelectorAll('img').length,0);assert.match(d.getElementById('begruessung').textContent,/<img/);
 assert.match(d.getElementById('wohnungen').textContent,/4001/);assert.match(d.getElementById('wohnungen').textContent,/Eigentümer/);
});
test('Kundenportal: ohne Aktivierung eigene Sitzungsprüfung, Anmeldung mit Firmenkennung und keine gespeicherten Passwörter',async t=>{
 const f=fixture(t,false),d=f.w.document;await tick();assert.equal(f.calls[0].url,'/api/kundenportal/meine-daten');
 d.getElementById('email').value='test@example.test';d.getElementById('passwort').value='Sicheres-Passwort-2026';
 d.getElementById('login').dispatchEvent(new f.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(JSON.parse(f.calls[1].options.body).firma_id,1);assert.equal(f.calls[1].url,'/api/kundenportal/anmelden');
 assert.equal(d.getElementById('passwort').value,'');assert.equal(f.w.localStorage.length,0);assert.equal(f.w.sessionStorage.length,0);
});
