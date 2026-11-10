'use strict';
const express=require('express'),auth=require('../lib/auth'),{ValidationError}=require('../lib/validation');
function baueRouter(db,archiv,publicUrl,uploadDir){
 const r=express.Router(),s=require('../services/eingangsrechnungen').baueRechnungen(db,archiv);
 const erkennung=require('../services/rechnungsErkennung').baueErkennung(db,{rechnungen:s,archiv,uploadDir});
 const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
 r.use(auth.erfordereSchreibrecht);
 r.use((req,res,next)=>{res.set('Cache-Control','no-store');if(req.method==='GET')return next();let origin;try{origin=new URL(publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}
 if(!origin||req.get('origin')!==origin||!req.is('application/json'))return next(new ValidationError('Bitte Rechnungen aus CuraAed bearbeiten.',403));next();});
 r.get('/dokument',h(async(req,res)=>res.json(await s.get(req.benutzer.id,req.query))));
 r.post('/zuordnung',h(async(req,res)=>{
  const b=req.body||{},a=b.auswahl||{};
  if(typeof a.objekt_nr!=='string'||a.objekt_nr.length>100||typeof a.lieferantenkonto!=='string'||a.lieferantenkonto.length>40)throw new ValidationError('Ungültige Zuordnung.');
  res.json(await s.zuordnung(req.benutzer.id,b.dokument,a));
 }));
 r.post('/erkennen',h(async(req,res)=>res.json(await erkennung.erkennen(req.benutzer.id,req.body?.dokument))));
 r.post('/dokument',h(async(req,res)=>res.json(await s.save(req.benutzer.id,req.body||{}))));
 return r;
}
module.exports={baueRouter};
