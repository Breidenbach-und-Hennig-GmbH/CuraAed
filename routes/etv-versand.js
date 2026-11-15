'use strict';
const express=require('express'),auth=require('../lib/auth'),{ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
module.exports=(service,origin)=>{
 const r=express.Router({mergeParams:true});r.use(auth.erfordereSchreibrecht);
 r.use((req,res,next)=>{res.set('Cache-Control','no-store');if(req.method==='GET')return next();if(!origin||req.get('origin')!==origin||!req.is('application/json'))return next(new ValidationError('Bitte die Einladungen aus CuraAed bearbeiten.',403));next();});
 r.get('/',h(async(req,res)=>res.json({einladungen:await service.liste(req.params.vid)})));
 r.post('/',h(async(req,res)=>res.json(await service.erstellen(req.params.vid,req.body||{},req.benutzer))));
 r.post('/:id/email',h(async(req,res)=>{if(req.body?.bestaetigt!==true)throw new ValidationError('Bitte den E-Mail-Versand an den angezeigten Eigentümer bestätigen.');res.json(await service.email(req.params.vid,req.params.id,req.benutzer));}));
 r.post('/:id/druck-bestaetigen',h(async(req,res)=>{if(req.body?.bestaetigt!==true)throw new ValidationError('Bitte den tatsächlich erfolgten Ausdruck bestätigen.');res.json(await service.druckBestaetigen(req.params.vid,req.params.id,req.benutzer));}));
 return r;
};
