'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const hpFetch=require('../lib/hpFetch');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(t,framing,body,truncated=false){
 const server=net.createServer(socket=>socket.once('data',()=>{
  const headers='HTTP/1.1 200 OK\r\nConnection: close\r\n'+(framing==='length'?'Content-Length: '+(body.length+(truncated?19:0))+'\r\n':framing==='chunked'?'Transfer-Encoding: chunked\r\n':'')+'\r\n';
  socket.on('error',()=>{});
  socket.write(headers);
  if(framing==='chunked')socket.end(Buffer.concat([Buffer.from(body.length.toString(16)+'\r\n'),body,Buffer.from('\r\n0\r\n\r\n')]));else socket.end(body);
 }));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 return 'http://127.0.0.1:'+server.address().port+'/';
}
test('HP-Transport verwendet die separat gepflegte Bibliothek statt des betroffenen Node-fetch',()=>{
 assert.equal(hpFetch,require('undici').fetch);assert.notEqual(hpFetch,globalThis.fetch);
});
for(const framing of ['length','chunked','eof'])test('HP-Download: pausierter Leser und Socket-Ende, '+framing,async t=>{
 const body=Buffer.alloc(96*1024,97),url=await fixture(t,framing,body);
 const response=await hpFetch(url,{redirect:'error',signal:AbortSignal.timeout(5000)});
 // Regression scenario from undici #5360/#5474: FIN while the consumer is paused.
 await wait(100);assert.deepEqual(Buffer.from(await response.arrayBuffer()),body);
});
test('HP-Download: verkürzte Antwort wird abgelehnt und nicht als vollständige Datei bestätigt',async t=>{
 const url=await fixture(t,'length',Buffer.alloc(96*1024,97),true);
 await assert.rejects(async()=>{const response=await hpFetch(url,{signal:AbortSignal.timeout(5000)});await wait(100);await response.arrayBuffer();});
});
test('HP-Download: Abbruch eines ungelesenen Inhalts beendet nur die Übertragung',async t=>{
 const url=await fixture(t,'length',Buffer.alloc(128*1024,97));
 const response=await hpFetch(url,{signal:AbortSignal.timeout(5000)});await response.body.cancel();await wait(100);
 const next=await hpFetch(url,{signal:AbortSignal.timeout(5000)});assert.equal((await next.arrayBuffer()).byteLength,128*1024);
});
