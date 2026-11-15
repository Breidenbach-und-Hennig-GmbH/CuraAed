'use strict';
const express=require('express'),auth=require('../lib/auth'),{ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
module.exports=(db,service)=>{
 const r=express.Router();r.use(auth.erfordereSchreibrecht);
 r.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
 const same=(req,res,next)=>{if(!service.origin||req.get('origin')!==service.origin||!req.is('application/json'))return next(new ValidationError('Bitte die Versandeinstellungen aus CuraAed öffnen.',403));next();};
 r.get('/konfiguration',auth.erfordereAdmin,h(async(req,res)=>res.json(await service.konfiguration())));
 r.put('/konfiguration',auth.erfordereAdmin,same,h(async(req,res)=>res.json(await service.konfigurationSpeichern(req.body||{},req.benutzer))));
 r.get('/firmen',h(async(req,res)=>{const firms=await db.all('SELECT id FROM firmenbriefkoepfe ORDER BY name COLLATE NOCASE');res.json(await Promise.all(firms.map(f=>service.settings(f.id))));}));
 r.get('/callback',auth.erfordereAdmin,h(async(req,res)=>{if(req.query.error)return res.redirect('/#/m365?status=abgebrochen');await service.callbackFinish(req.benutzer,req.sessionToken,req.query.state,req.query.code);res.redirect('/#/m365?status=verbunden');}));
 r.put('/firmen/:id',auth.erfordereAdmin,same,h(async(req,res)=>res.json(await service.saveSettings(Number(req.params.id),req.body||{}))));
 r.post('/firmen/:id/verbinden',auth.erfordereAdmin,same,h(async(req,res)=>{if(req.body?.zustimmung!==true)throw new ValidationError('Bitte die Freigabe für den Versand aus dem gemeinsamen Firmenpostfach bestätigen.');res.json(await service.verbinden(Number(req.params.id),req.benutzer,req.sessionToken));}));
 r.post('/firmen/:id/trennen',auth.erfordereAdmin,same,h(async(req,res)=>res.json(await service.trennen(Number(req.params.id)))));
 return r;
};
