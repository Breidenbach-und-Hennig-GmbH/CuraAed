'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { baueHpMobileClient } = require('../services/hausperfektMobile');
const D = require('../services/hpDms');
const pdf = Buffer.from('%PDF-1.7\nsynthetic test file');
const file = () => ({ id: 9, container_id: 44, hp_id: 1, file_original_name: 'test.pdf', file_notes: '<b>Test</b>', file_size: pdf.length,
  file_checksum_md5: crypto.createHash('md5').update(pdf).digest('hex'), file_checksum_sha1: crypto.createHash('sha1').update(pdf).digest('hex'),
  ts: 1700000000, poc: 'FD', document_type: { name: 'Testart' }, document_container: { id: 44, hp_id: 1183031, comment: 'Testarchiv' } });

test('DMS: große Dateien werden ohne 64-MB-Grenze auf Platte gestreamt und vollständig geprüft',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hp-stream-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const chunk=Buffer.alloc(1024*1024,65),sha=crypto.createHash('sha1');for(let i=0;i<65;i++)sha.update(chunk);
 const raw={...file(),file_size:65*chunk.length,file_checksum_sha1:sha.digest('hex'),file_checksum_md5:null};
 const f=fixture(url=>{
   if(!url.endsWith('/binary'))return Response.json(raw);
   let count=0;return new Response(new ReadableStream({pull(c){if(count++<65)c.enqueue(chunk);else c.close();}}));
 });
 const target=path.join(dir,'large.part');const result=await D.speichern(f.client,9,target,70*chunk.length);
 assert.equal(result.size,65*chunk.length);assert.equal((await fs.stat(target)).size,result.size);assert.match(result.sha256,/^[a-f0-9]{64}$/);
 await assert.rejects(D.speichern(f.client,9,path.join(dir,'small.part'),60*chunk.length),e=>e.status===507);
});
function fixture(respond, { tenant = 'kunde-a' } = {}) {
  const calls = [];
  const client = baueHpMobileClient({ portalUrl: 'https://kunde-a.hausperfekt-mobile.de/', accessToken: 'synthetic', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/whoami')) return Response.json({ clientdatabases: [{ subdomain: tenant }] });
    return respond(url, init);
  } });
  return { client, calls };
}
test('DMS: Suche ist serverseitig, begrenzt, korrekt kodiert und kundenbezogen', async () => {
  const f = fixture(() => Response.json({ data: [file()], meta: { total: 81, last_page: 4 } }));
  const result = await D.liste(f.client, { seite: 2, suche: 'A&B / Test' });
  assert.equal(result.gesamt, 81); assert.equal(result.weitere, true); assert.equal(result.dokumente[0].archivnummer, 1183031);
  const url = new URL(f.calls[1].url); assert.equal(url.searchParams.get('s'), 'A&B / Test'); assert.equal(url.searchParams.get('pageNum'), '2');
  assert.equal(url.searchParams.get('pageSize'), '25'); assert.equal(url.searchParams.get('of'), 'ts');
  assert.equal(f.calls[1].init.headers['HPAPI-DOM'], 'kunde-a');
  for (const query of [{seite:0},{seite:1.5},{suche:[]},{suche:'x'.repeat(201)}]) await assert.rejects(D.liste(f.client, query), e => e.status === 400);
});
test('DMS: vollständige Containerbezüge und mehrere Dateien, keine Lesebestätigungen im Ergebnis', async () => {
  const f = fixture(url => url.includes('/documentcontainer/') ? Response.json({ id: 44, hp_id: 1183031, comment: 'Archiv',
    document_files: [file(), {...file(),id:10,hp_id:2}], units_count: 1,
    units: [{id:7,hp_id:3,position:'EG',building:{hp_id:4010,address:{street:'Testweg 1',city:'Teststadt'}}}],
    persons: [{id:8,hp_id:19,firstname:'Test',lastname:'Person'}], tasks_count: 2, tasks: [{id:22,name:'Rückruf'}] }) : Response.json({...file(),readconfirmations:[{secret:'private'}]}));
  const result = await D.details(f.client, 9);
  assert.equal(result.dateien.length, 2); assert.equal(result.dokument.archivnummer, 1183031);
  const units = result.zuordnungen.find(g => g.art === 'units'); assert.equal(units.eintraege[0].objektNummer, 4010); assert.match(units.eintraege[0].name,/Testweg/);
  assert.equal(result.zuordnungen.find(g=>g.art==='tasks').gesamt,2); assert.doesNotMatch(JSON.stringify(result),/secret|private|readconfirmations/);
});
test('DMS: fremder Kundenbestand und widersprüchlicher Container werden abgewiesen', async () => {
  const wrong = fixture(() => Response.json(file()), { tenant:'fremd' });
  await assert.rejects(D.download(wrong.client,9),e=>e.status===403); assert.equal(wrong.calls.length,1);
  const container = fixture(url=>Response.json(url.includes('/documentcontainer/')?{id:99}:file()));
  await assert.rejects(D.details(container.client,9),e=>e.status===502);
  for(const value of ['../whoami','1?x=2','0']) await assert.rejects(container.client.dmsContainer(value),e=>e.status===400);
});
test('DMS: Download validiert Größe und Prüfsummen und lässt keine Weiterleitungen zu', async () => {
  const f=fixture(url=>url.endsWith('/binary')?new Response(pdf):Response.json(file()));
  const result=await D.download(f.client,9); assert.deepEqual(result.bytes,pdf); assert.equal(result.name,'test.pdf');
  assert.ok(f.calls.every(c=>new URL(c.url).origin==='https://api.hausperfekt-mobile.de'&&c.init.redirect==='error'&&c.init.method==='GET'));
  const corrupt=fixture(url=>url.endsWith('/binary')?new Response(Buffer.from('x'.repeat(pdf.length))):Response.json(file()));
  await assert.rejects(D.download(corrupt.client,9),e=>e.status===502);
  const short=fixture(url=>url.endsWith('/binary')?new Response('short'):Response.json(file()));
  await assert.rejects(D.download(short.client,9),e=>e.status===502);
});
test('DMS: Größenlimit greift vor Download und während Streaming; 401/403/404 bleiben erhalten',async()=>{
  const large=fixture(()=>Response.json({...file(),file_size:D.MAX_BYTES+1}));
  await assert.rejects(D.download(large.client,9),e=>e.status===413);assert.equal(large.calls.length,2);
  let cancelled=false;
  const streamed=fixture(()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(6));},cancel(){cancelled=true;}})));
  await assert.rejects(streamed.client.dmsDatei(9,5),e=>e.status===413);assert.equal(cancelled,true);
  const declared=fixture(()=>new Response('x',{headers:{'content-length':'99'}}));
  await assert.rejects(declared.client.dmsDatei(9,5),e=>e.status===413);
  for(const status of [401,403,404]){
    const denied=fixture(()=>Response.json({private:'hidden'},{status}));
    await assert.rejects(denied.client.dmsDatei(9),e=>e.status===status&&!e.message.includes('hidden'));
  }
});
test('DMS-API: Anmeldung, persönliche Verbindungen, Kundentrennung und sichere Downloadheader',async t=>{
  const {openDatabase}=require('../db'),users=require('../services/benutzer'),{baueApp}=require('../lib/appFactory');
  const db=await openDatabase(':memory:');t.after(()=>db.close());
  for(const [benutzername,rolle] of [['eins','admin'],['zwei','mitarbeiter'],['leser','leser']])await users.anlegen(db,{benutzername,name:benutzername,rolle,passwort:'test12345'});
  const archiveFs=require('node:fs/promises'), archiveDir=await archiveFs.mkdtemp(require('node:path').join(require('node:os').tmpdir(),'hp-api-'));t.after(()=>archiveFs.rm(archiveDir,{recursive:true,force:true}));
  const calls=[];const app=baueApp(db,{uploadDir:archiveDir,hausperfekt:{publicUrl:'https://curaaed.example',oauth:{clientId:'test',clientSecret:'test'},fetchImpl:async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/oauth/token'))return Response.json({access_token:'test',refresh_token:'test',expires_in:3600});
    if(url.endsWith('/whoami'))return Response.json({clientdatabases:[{subdomain:'kunde-a'}]});
    if(url.endsWith('/binary'))return new Response(pdf);
    if(url.includes('/documentcontainer/'))return Response.json({id:44,hp_id:1183031,document_files:[file()],units:[]});
    if(/\/documents\?/.test(url))return Response.json({data:[file()],meta:{total:1,last_page:1}});
    return Response.json(file());
  }}});
  const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port+'/api/hausperfekt';
  const login=async user=>(await fetch(base.replace('/hausperfekt','')+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({benutzername:user,passwort:'test12345'})})).headers.get('set-cookie').split(';')[0];
  const one=await login('eins'),two=await login('zwei'),reader=await login('leser');
  const connection=await(await fetch(base+'/verbinden',{method:'POST',headers:{cookie:one,origin:'https://curaaed.example','content-type':'application/json'},body:JSON.stringify({portalUrl:'https://kunde-a.hausperfekt-mobile.de/',benutzername:'test',passwort:'synthetic',zustimmung:true})})).json();
  const p='/dms/'+connection.id+'/dokumente';const count=calls.length;
  assert.equal((await fetch(base+p)).status,401);
  assert.equal((await fetch(base+p,{headers:{cookie:reader}})).status,403);
  for(const suffix of ['', '/9', '/9/download'])assert.equal((await fetch(base+p+suffix,{headers:{cookie:two}})).status,404);
  assert.equal(calls.length,count);
  assert.deepEqual((await(await fetch(base+'/dms/verbindungen',{headers:{cookie:two}})).json()).verbindungen,[]);
  assert.equal((await fetch(base+p+'?seite=0',{headers:{cookie:one}})).status,400);
  assert.equal((await fetch(base+p,{headers:{cookie:one}})).status,200);
  const detail=await(await fetch(base+p+'/9',{headers:{cookie:one}})).json();assert.equal(detail.dokument.archivnummer,1183031);
  const response=await fetch(base+p+'/9/download',{headers:{cookie:one}});
  assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment;/);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
  assert.ok(calls.slice(count).every(c=>c.init.method==='GET'));
  const info=await(await fetch(base+'/dms/'+connection.id+'/uebernahme',{headers:{cookie:one}})).json();assert.equal(info.dateien,1);assert.equal(info.bytes,pdf.length);
  const localPath=base+'/dms/archiv/'+info.quelle+'/9/download';
  assert.equal((await fetch(localPath,{headers:{cookie:two}})).status,404);
  await fetch(base+'/verbindungen/'+connection.id+'/entfernen',{method:'POST',headers:{cookie:one,origin:'https://curaaed.example','content-type':'application/json'},body:'{}'});
  const after=calls.length;
  const preview=await fetch(localPath+'?vorschau=1',{headers:{cookie:one}});assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/application\/pdf/);assert.deepEqual(Buffer.from(await preview.arrayBuffer()),pdf);assert.equal(calls.length,after);
  const localList=await(await fetch(base.replace('/hausperfekt','')+'/archiv',{headers:{cookie:one}})).json();assert.equal(localList.eintraege.length,1);assert.equal(localList.eintraege[0].hp.gesichert,true);
});
