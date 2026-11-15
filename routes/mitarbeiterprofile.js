'use strict';
const express=require('express'),path=require('path');
const auth=require('../lib/auth'),svc=require('../services/mitarbeiterprofile'),{ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
module.exports=(db,publicUrl)=>{
 const r=express.Router();r.use(auth.erfordereSchreibrecht);
 r.use((req,res,next)=>{res.set('Cache-Control','no-store');if(req.method==='GET')return next();let origin;try{origin=new URL(publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}if(!origin||req.get('origin')!==origin||!req.is('application/json'))return next(new ValidationError('Bitte das Profil aus CuraAed bearbeiten.',403));next();});
 r.get('/ich',h(async(req,res)=>res.json(await svc.eigenes(db,req.benutzer.id))));
 r.put('/ich',h(async(req,res)=>res.json(await svc.speichern(db,req.benutzer.id,req.body||{}))));
 r.get('/',h(async(req,res)=>res.json(await svc.liste(db))));
 r.get('/:id/bild',h(async(req,res)=>{
  const row=await db.get("SELECT p.bild FROM mitarbeiterprofile p JOIN benutzer b ON b.id=p.benutzer_id WHERE p.benutzer_id=? AND b.aktiv=1 AND b.rolle IN ('admin','mitarbeiter')",[req.params.id]);
  res.set('X-Content-Type-Options','nosniff');
  if(row?.bild)return res.type('image/png').send(row.bild);
  res.sendFile(path.resolve(__dirname,'../public/images/mitarbeiter-platzhalter.svg'));
 }));return r;
};
