'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{JSDOM}=require('jsdom');
test('Mitarbeiter-Symbole und Profil: eigene Login-ID speichern, Formular erneut laden',async t=>{
 const d=new JSDOM('<div id="cu-team"></div><div id="cu-eigenes-bild"></div><div id="modal-container"></div><div id="toast-container"></div>',{runScripts:'outside-only',url:'https://curaaed.test'});
 t.after(()=>d.window.close());const w=d.window;
 for(const f of ['ui','kern','shell','mitarbeiterprofile'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/'+f+'.js'),'utf8'),d.getInternalVMContext());
 w.eval('S.benutzer={id:1,name:"Test",rolle:"mitarbeiter"}');
 let profile={starface_login_id:'',revision:0,bild_url:'/images/mitarbeiter-platzhalter.svg'};
 w.API={get:async url=>url.endsWith('/ich')?profile:[{id:1,name:'Test',bild_url:profile.bild_url},{id:2,name:'Kollege',bild_url:profile.bild_url}],put:async(url,data)=>{assert.equal(url,'/mitarbeiterprofile/ich');assert.equal(data.revision,0);profile={...profile,...data,revision:1};}};
 await w.mitarbeiterSymbole();assert.equal(w.document.querySelectorAll('.cu-team-symbol').length,1);
 assert.match(w.document.querySelector('.cu-team-symbol').title,/^Kollege · /);
 await w.meinProfil();const input=w.document.querySelector('#profil-starface');input.value='00467';
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='Speichern').click();
 await new Promise(r=>setTimeout(r,20));assert.equal(profile.starface_login_id,'00467');
 await w.meinProfil();assert.equal(w.document.querySelector('#profil-starface').value,'00467');
 assert.equal(w.document.querySelector('#profil-foto').accept,'image/png,image/jpeg,image/webp');
});
