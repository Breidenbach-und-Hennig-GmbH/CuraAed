'use strict';
const express=require('express'),auth=require('../lib/auth');
const {ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
module.exports=(db,options={})=>{
 const r=express.Router(),s=require('../services/hpObjektImport').service(db,options);
 r.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});if(req.method!=='GET'&&(!req.is('application/json')||Buffer.byteLength(JSON.stringify(req.body||{}))>262144))return next(new ValidationError('Ungültige oder zu große Objektimport-Anfrage.',400));next();});
 const token=req=>/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization')||'')?.[1];
 for(const [path,method] of [['quelle','bindSource'],['status','status'],['vergleich','compare'],['abgleich','scan'],['diagnose','diagnose'],['wiederholen','retryPlan']])r.post('/agent/:id/'+path,h(async(req,res)=>res.json(await s[method](req.params.id,token(req),req.body||{}))));
 r.use(auth.erfordereAdmin);
 r.use((req,res,next)=>{if(req.method==='GET')return next();let origin;try{origin=new URL(options.publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}if(!origin||req.get('origin')!==origin)return next(new ValidationError('Bitte den Objektimport in CuraAed verwalten.',403));next();});
 r.get('/verbindungen',h(async(req,res)=>res.json({verbindungen:await s.list(req.benutzer.id)})));
 r.get('/originaldaten',h(async(req,res)=>res.json(await s.originals(req.benutzer.id,req.query||{}))));
 r.get('/konflikte',h(async(req,res)=>res.json({konflikte:await s.conflicts(req.benutzer.id)})));
 r.post('/konflikte',h(async(req,res)=>res.json(await s.resolve(req.benutzer.id,req.body||{}))));
 r.post('/verbindungen',h(async(req,res)=>res.json(await s.create(req.benutzer.id,req.body||{}))));
 r.post('/verbindungen/:id/trennen',h(async(req,res)=>res.json(await s.disconnect(req.benutzer.id,req.params.id))));
 return r;
};
