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
 r.get('/callback',h(async(req,res)=>{if(await service.postfachZugang.istCallback(req.query.state)){if(req.query.error)return res.redirect('/#/posteingang?status=abgebrochen');await service.postfachZugang.callback(req.benutzer,req.sessionToken,req.query.state,req.query.code);return res.redirect('/#/posteingang?quelle=persoenlich&status=verbunden');}if(await service.kalender.istCallback(req.query.state)){if(req.query.error)return res.redirect('/#/kalender?status=abgebrochen');await service.kalender.callback(req.benutzer,req.sessionToken,req.query.state,req.query.code);await require('../services/etv-kalender').baue(db,service).nachholen(req.benutzer.id);return res.redirect('/#/kalender?status=verbunden');}if(req.benutzer.rolle!=='admin')throw new ValidationError('Administratorrechte für das Firmenpostfach erforderlich.',403);if(req.query.error)return res.redirect('/#/m365?status=abgebrochen');await service.callbackFinish(req.benutzer,req.sessionToken,req.query.state,req.query.code);await require('../services/etv-kalender').baue(db,service).nachholen();res.redirect('/#/m365?status=verbunden');}));
 r.put('/firmen/:id',auth.erfordereAdmin,same,h(async(req,res)=>res.json(await service.saveSettings(Number(req.params.id),req.body||{}))));
 r.post('/firmen/:id/verbinden',auth.erfordereAdmin,same,h(async(req,res)=>{if(req.body?.zustimmung!==true)throw new ValidationError('Bitte die Freigabe für den Versand aus dem gemeinsamen Firmenpostfach bestätigen.');res.json(await service.verbinden(Number(req.params.id),req.benutzer,req.sessionToken,{teams:req.body.teams===true,kalender:req.body.kalender===true,postfach:req.body.postfach===true}));}));
 r.post('/firmen/:id/trennen',auth.erfordereAdmin,same,h(async(req,res)=>res.json(await service.trennen(Number(req.params.id)))));
 return r;
};
