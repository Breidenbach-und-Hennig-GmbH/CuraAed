'use strict';
const express=require('express'),auth=require('../lib/auth');
const {ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
module.exports=(db,options={})=>{
 const r=express.Router(),svc=require('../services/hpAdressSync').service(db,options);
 r.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});if(req.method!=='GET'&&(!req.is('application/json')||Buffer.byteLength(JSON.stringify(req.body||{}))>65536))return next(new ValidationError('Ungültige Adressabgleich-Anfrage.',400));next();});
 const token=req=>/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization')||'')?.[1];
 r.post('/agent/:id/vergleich',h(async(req,res)=>res.json(await svc.compare(req.params.id,token(req),req.body))));
 r.post('/agent/:id/abgleich',h(async(req,res)=>{try{res.json(await svc.scan(req.params.id,token(req),req.body));}catch(e){await svc.report(req.params.id,token(req),e).catch(()=>{});throw e;}}));
 r.post('/agent/:id/ergebnis',h(async(req,res)=>res.json(await svc.result(req.params.id,token(req),req.body))));
 r.use(auth.erfordereAdmin);
 r.use((req,res,next)=>{if(req.method==='GET')return next();let origin;try{origin=new URL(options.publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}if(!origin||req.get('origin')!==origin)return next(new ValidationError('Bitte in CuraAed bearbeiten.',403));next();});
 r.get('/verbindungen',h(async(req,res)=>res.json({verbindungen:await svc.list(req.benutzer.id)})));
 r.post('/verbindungen',h(async(req,res)=>res.json(await svc.create(req.benutzer.id,req.body))));
 r.post('/verbindungen/:id/trennen',h(async(req,res)=>res.json(await svc.disconnect(req.benutzer.id,req.params.id))));
 r.post('/verbindungen/:id/dauerhaft',h(async(req,res)=>res.json(await svc.permanent(req.benutzer.id,req.params.id,req.body))));
 r.post('/adressen/:id/konflikt',h(async(req,res)=>res.json(await svc.resolve(req.params.id,req.body))));
 return r;
};

