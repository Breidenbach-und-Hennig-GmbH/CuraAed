'use strict';
const express=require('express'),auth=require('../lib/auth'),{ValidationError}=require('../lib/validation');
function baueRouter(db,archiv,publicUrl){
 const r=express.Router(),s=require('../services/eingangsrechnungen').baueRechnungen(db,archiv);
 const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 r.use(auth.erfordereSchreibrecht);
 r.use((req,res,next)=>{res.set('Cache-Control','no-store');if(req.method==='GET')return next();let origin;try{origin=new URL(publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}
 if(!origin||req.get('origin')!==origin||!req.is('application/json'))return next(new ValidationError('Bitte Rechnungen aus CuraAed bearbeiten.',403));next();});
 r.get('/dokument',h(async(req,res)=>res.json(await s.get(req.benutzer.id,req.query))));
 r.post('/dokument',h(async(req,res)=>res.json(await s.save(req.benutzer.id,req.body||{}))));
 return r;
}
module.exports={baueRouter};
