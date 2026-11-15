'use strict';
const express=require('express'),auth=require('../lib/auth'),{ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
module.exports=(service,origin)=>{
 const r=express.Router();r.use(auth.erfordereLogin);r.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
 const same=(req,res,next)=>{if(!origin||req.get('origin')!==origin||!req.is('application/json'))return next(new ValidationError('Bitte den Kalender aus CuraAed öffnen.',403));next();};
 r.get('/quellen',h(async(req,res)=>res.json(await service.quellen(req.benutzer.id))));
 r.post('/verbinden',auth.erfordereSchreibrecht,same,h(async(req,res)=>{if(req.body?.zustimmung!==true)throw new ValidationError('Bitte die persönliche Kalenderverbindung bestätigen.');res.json(await service.verbinden(req.benutzer,req.sessionToken));}));
 r.post('/trennen',auth.erfordereSchreibrecht,same,h(async(req,res)=>res.json(await service.trennen(req.benutzer.id))));
 r.get('/termine',h(async(req,res)=>res.json(await service.liste(req.benutzer.id,req.query.quelle,req.query.monat))));
 r.get('/termin',h(async(req,res)=>res.json(await service.holen(req.benutzer.id,req.query.quelle,req.query.id))));
 r.post('/termine',auth.erfordereSchreibrecht,same,h(async(req,res)=>res.json(await service.erstellen(req.benutzer.id,req.body?.quelle,req.body||{}))));
 r.put('/termin',auth.erfordereSchreibrecht,same,h(async(req,res)=>res.json(await service.aendern(req.benutzer.id,req.body?.quelle,req.body?.id,req.body||{}))));
 return r;
};
