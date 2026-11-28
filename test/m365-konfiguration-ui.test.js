'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(r=>setImmediate(r));
test('Benutzerverwaltung zeigt geschützte Einrichtung und leert eingegebenen Schlüssel nach dem Speichern',async t=>{
 const dom=new JSDOM('<div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test'});t.after(()=>dom.window.close());const w=dom.window;
 let request;const c={client_id:'11111111-1111-1111-1111-111111111111',mandant_id:'22222222-2222-2222-2222-222222222222',secret_vorhanden:true,revision:1,redirect_uri:'https://curaaed.test/api/m365/callback'};
 w.API={get:async()=>c,put:async(url,b)=>{request={url,body:{...b}};return{...c,revision:2};}};
 for(const f of ['adressdaten','ui','kern','shell','m365'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),dom.getInternalVMContext());
 w.eval('S.benutzer={rolle:"admin"}');w.document.body.append(await w.m365KonfigurationsPanel());
 const secret=w.document.querySelector('input[type=password]');assert.equal(secret.value,'');assert.equal(secret.placeholder,'Gespeichert · leer lassen zum Beibehalten');
 secret.value='new-private';w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();await tick();
 assert.equal(request.url,'/m365/konfiguration');assert.equal(request.body.secret,'new-private');assert.equal(secret.value,'');assert.ok(!w.document.body.innerHTML.includes('new-private'));
 assert.match(fs.readFileSync(path.join(__dirname,'../public/js/masken.js'),'utf8'),/microsoft = await m365KonfigurationsPanel/);
});
