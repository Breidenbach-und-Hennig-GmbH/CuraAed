'use strict';
const express=require('express'),crypto=require('node:crypto'),auth=require('../lib/auth'),{ValidationError}=require('../lib/validation');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),COOKIE='cu_microsoft_login';
module.exports=(db,m365)=>{
 const r=express.Router(),s=m365.anmeldung,attempts=new Map();
 const cookie={httpOnly:true,secure:m365.origin?.startsWith('https:'),sameSite:'lax',path:'/api/auth/microsoft',maxAge:300000};
 r.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
 function limit(req,res,next){const now=Date.now();for(const [ip,v] of attempts)if(v.until<now)attempts.delete(ip);let v=attempts.get(req.ip);if(!v){v={n:0,until:now+300000};attempts.set(req.ip,v);}if(++v.n>30)return res.status(429).json({fehler:'Bitte vor einer erneuten Anmeldung kurz warten.'});next();}
 r.get('/status',h(async(req,res)=>res.json(await s.status(req.benutzer))));
 r.post('/start',limit,h(async(req,res)=>{if(req.get('origin')!==m365.origin||!req.is('application/json'))throw new ValidationError('Bitte die Anmeldung in CuraAed verwenden.',403);const b=req.body||{};let user=null;if(b.verbinden===true){if(!req.benutzer)throw new ValidationError('Bitte zuerst mit Ihrer eigenen Kennung anmelden.',401);const verified=await require('../services/benutzer').pruefeAnmeldung(db,req.benutzer.benutzername,b.passwort);if(!verified)throw new ValidationError('Das aktuelle CuraAed-Passwort ist falsch.',403);user=req.benutzer;}const browser=crypto.randomBytes(32).toString('base64url'),result=await s.starten(browser,user,req.sessionToken);res.cookie(COOKIE,browser,cookie);res.json(result);}));
 r.get('/callback',limit,h(async(req,res)=>{try{if(req.query.error)throw new ValidationError('Die Microsoft-Anmeldung wurde abgebrochen.',403);const user=await s.beenden(req.cookies?.[COOKIE],req.query.state,req.query.code,req.benutzer,req.sessionToken),token=await auth.sitzungErstellen(db,user.id);auth.cookieSetzen(res,token);res.clearCookie(COOKIE,cookie);res.redirect('/#/posteingang');}catch(e){res.clearCookie(COOKIE,cookie);if(!(e instanceof ValidationError))console.error('[Microsoft-Anmeldung]',e.message);res.redirect('/?microsoft_fehler='+encodeURIComponent(e instanceof ValidationError?e.message:'Microsoft-Anmeldung konnte nicht abgeschlossen werden.')+'#/');}}));
 return r;
};
