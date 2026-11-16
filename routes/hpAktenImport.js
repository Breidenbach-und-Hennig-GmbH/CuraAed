'use strict';
const express=require('express'),auth=require('../lib/auth'),{ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
module.exports=(db,{directory,publicUrl}={})=>{
 const r=express.Router(),svc=require('../services/hpAktenImport').service(db,directory),uploads=new Set();
 r.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
 const token=req=>/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization')||'')?.[1];
 const json=(req,res,next)=>req.is('application/json')?next():next(new ValidationError('JSON-Anfrage erforderlich.',400));
 for(const [name,method]of [['abholen','poll'],['seite','page'],['dateistatus','fileResult'],['altnamen','legacyNames'],['fehler','report']])r.post('/agent/:id/'+name,json,h(async(req,res)=>res.json(await svc[method](req.params.id,token(req),req.body||{}))));
 r.post('/agent/:id/datei/:file',h(async(req,res,next)=>{
  if(!req.is('application/octet-stream'))throw new ValidationError('Binärdatei erforderlich.',400);
  req.hpFile={vertrag:req.get('x-hp-vertrag'),datenbank:req.get('x-hp-datenbank'),generation:req.get('x-hp-generation'),datei:Number(req.params.file),groesse:Number(req.get('x-hp-groesse')),mtime:req.get('x-hp-mtime'),sha256:req.get('x-hp-sha256')};
  await svc.fileJob(req.params.id,token(req),req.hpFile);if(uploads.has(req.params.id))throw new ValidationError('Eine Dateiübertragung läuft bereits.',409);uploads.add(req.params.id);const release=()=>uploads.delete(req.params.id);res.once('finish',release);res.once('close',release);next();
 }),express.raw({type:'application/octet-stream',limit:'64mb'}),h(async(req,res)=>res.json(await svc.store(req.params.id,token(req),req.hpFile,req.body))));
 r.use(auth.erfordereAdmin);
 r.use((req,res,next)=>{if(req.method==='GET')return next();let origin;try{origin=new URL(publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}if(!req.is('application/json')||!origin||req.get('origin')!==origin)return next(new ValidationError('Bitte die Aktenübernahme in CuraAed bedienen.',403));next();});
 r.get('/status',h(async(req,res)=>res.json(await svc.status(req.benutzer.id))));
 r.get('/:id/meldungen',h(async(req,res)=>res.json(await svc.warnings(req.benutzer.id,req.params.id))));
 r.post('/:id/starten',h(async(req,res)=>res.json(await svc.start(req.benutzer.id,req.params.id))));
 r.post('/:id/anhalten',h(async(req,res)=>res.json(await svc.stop(req.benutzer.id,req.params.id))));
 return r;
};
