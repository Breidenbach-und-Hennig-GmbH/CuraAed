'use strict';
const express=require('express'),auth=require('../lib/auth');
const {ValidationError}=require('../lib/validation'),{HpMobileError}=require('../services/hausperfektMobile');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(e=>next(e instanceof HpMobileError?new ValidationError(e.message,e.status):e));
function baueRouter(db,options={}){
 const r=express.Router(),svc=require('../services/vorgaenge').baueVorgaenge(db,options);r.service=svc;
 r.use(auth.erfordereSchreibrecht);
 r.use((req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});if(req.method==='GET')return next();
  let origin;try{origin=new URL(options.publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}
  if(!origin||req.get('origin')!==origin||!req.is('application/json'))return next(new ValidationError('Bitte Vorgänge aus CuraAed heraus bearbeiten.',403));next();});
 r.post('/aufloesen',h(async(req,res)=>{if(!Array.isArray(req.body.nummern)||req.body.nummern.length!==1||typeof req.body.nummern[0]!=='string'||req.body.nummern[0].length>100)throw new ValidationError('Bitte eine gültige Nummer angeben.');if(require('../services/vorgaenge').ARTEN.includes(req.body.typ)){const id=Number(req.body.nummern[0].replace(/^CA-/i,''));const target=await svc.detail(req.benutzer.id,id);if(target.art!==req.body.typ)throw new ValidationError('Die Vorgangsart stimmt nicht überein.');res.json([{id:target.id,gefunden:true,nummer:'CA-'+target.id,label:target.titel}]);}else res.json(await require('../services/archiv').nummernAufloesen(db,req.body.typ,req.body.nummern));}));
 r.post('/hwa-nummer',h(async(req,res)=>res.json(await require('../services/handwerkerauftraege').resolve(db,req.benutzer.id,req.body))));
 r.get('/kalender',h(async(req,res)=>res.json(await svc.calendar(req.benutzer.id,req.query.monat))));
 r.get('/uebersicht',h(async(req,res)=>res.json(await svc.overview(req.benutzer.id))));
 r.post('/uebernahme',h(async(req,res)=>res.json(await svc.start(req.benutzer.id,req.body.verbindung))));
 r.post('/anhalten',h(async(req,res)=>res.json(await svc.stop(req.benutzer.id,req.body.quelle))));
 r.get('/',h(async(req,res)=>res.json(await svc.list(req.benutzer.id,req.query))));
 r.post('/',h(async(req,res)=>res.status(201).json(await svc.create(req.benutzer.id,req.body))));
 r.get('/:id/dokumente/:dateiId',h(async(req,res)=>{const file=await svc.document(req.benutzer.id,req.params.id,req.params.dateiId);res.set({'X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'self'"});if(req.query.vorschau==='1'&&file.pdf)res.type('application/pdf').set('Content-Disposition','inline').sendFile(file.path);else res.attachment(file.name).type('application/octet-stream').sendFile(file.path);}));
 r.post('/:id/auftragsdokumente',h(async(req,res)=>res.json(await svc.attach(req.benutzer.id,req.params.id,req.body||{}))));
 r.get('/:id',h(async(req,res)=>res.json(await svc.detail(req.benutzer.id,req.params.id))));
 r.put('/:id',h(async(req,res)=>res.json(await svc.update(req.benutzer.id,req.params.id,req.body))));
 r.post('/:id/vermerke',h(async(req,res)=>res.json(await svc.comment(req.benutzer.id,req.params.id,req.body))));
 r.post('/:id/zuordnungen',h(async(req,res)=>res.json(await svc.addRef(req.benutzer.id,req.params.id,req.body))));
 r.post('/:id/konflikt',h(async(req,res)=>res.json(await svc.resolve(req.benutzer.id,req.params.id,req.body))));
 return r;
}
module.exports={baueRouter};
