'use strict';
const express=require('express'),auth=require('../lib/auth'),svc=require('../services/telefonie'),{ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
module.exports=(db,publicUrl)=>{
 const r=express.Router();r.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 // Persönlicher lokaler Helfer besitzt ausschließlich dieses eine Schreibrecht.
 r.post('/status',h(async(req,res)=>{
  if(!req.is('application/json'))throw new ValidationError('JSON erforderlich.',415);
  const bearer=req.get('authorization')||'';
  res.json(await svc.melden(db,bearer.startsWith('Bearer ')?bearer.slice(7):'',req.body));
 }));
 r.use(auth.erfordereSchreibrecht);
 r.get('/ich',h(async(req,res)=>res.json(await svc.metadata(db,req.benutzer.id))));
 r.use((req,res,next)=>{let origin;try{origin=new URL(publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}if(!origin||req.get('origin')!==origin||!req.is('application/json'))return next(new ValidationError('Bitte die Telefonie aus Ihrem CuraAed-Profil bearbeiten.',403));next();});
 r.post('/ich/koppeln',h(async(req,res)=>res.json(await svc.koppeln(db,req.benutzer.id))));
 r.post('/ich/trennen',h(async(req,res)=>res.json(await svc.trennen(db,req.benutzer.id))));
 return r;
};
