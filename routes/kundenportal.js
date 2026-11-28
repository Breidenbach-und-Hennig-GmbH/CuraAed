'use strict';
const express=require('express'),rateLimit=require('express-rate-limit');
const crypto=require('node:crypto');
const {ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const COOKIE='ca_kunde';
module.exports=function(db,publicUrl){
 let origin;try{origin=new URL(publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}
 const svc=require('../services/kundenAktivierung').baue(db,{origin}),r=express.Router();
 const secure=origin?.startsWith('https:'),cookie={httpOnly:true,secure,sameSite:'strict',path:'/api/kundenportal',maxAge:86400000};
 r.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  if(req.method==='GET')return next();
  if(!origin||req.get('origin')!==origin||!req.is('application/json'))return next(new ValidationError('Bitte das Kundenportal über die Adresse Ihrer Verwaltung öffnen.',403));next();});
 const limits={windowMs:15*60000,standardHeaders:'draft-7',legacyHeaders:false,message:{fehler:'Zu viele Anmeldeversuche. Bitte später erneut versuchen.'}};
 const ipLimit=rateLimit({...limits,limit:1000});
 const kontoLimit=rateLimit({...limits,limit:20,keyGenerator:req=>crypto.createHash('sha256').update(req.body?.token?String(req.body.token):String(req.body?.firma_id)+':'+String(req.body?.email||'').trim().toLowerCase()).digest('hex')});
 r.post('/aktivieren',ipLimit,kontoLimit,h(async(req,res)=>{const a=await svc.aktivieren(req.body.token,req.body.passwort,Number(req.body.firma_id));res.cookie(COOKIE,a.token,cookie).json(a.daten);}));
 r.post('/anmelden',ipLimit,kontoLimit,h(async(req,res)=>{const a=await svc.anmelden(Number(req.body.firma_id),req.body.email,req.body.passwort);res.cookie(COOKIE,a.token,cookie).json(a.daten);}));
 r.get('/meine-daten',h(async(req,res)=>res.json(await svc.sitzung(req.cookies?.[COOKIE]))));
 r.post('/abmelden',h(async(req,res)=>{await svc.abmelden(req.cookies?.[COOKIE]);res.clearCookie(COOKIE,{...cookie,maxAge:undefined}).json({ok:true});}));
 return r;
};
