'use strict';
const express=require('express'),L=require('../services/etv-live');
const h=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const cookie=id=>'etv_gast_'+id;
const buckets=new Map();
function guard(req,res,next){
 res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 if(req.method!=='GET'){
  if(!req.is('application/json'))return res.status(415).json({fehler:'Bitte JSON verwenden.'});
  const origin=req.get('origin');if(origin){let u;try{u=new URL(origin);}catch{return res.status(403).json({fehler:'Ungültiger Ursprung.'});}if(u.host!==req.get('host'))return res.status(403).json({fehler:'Fremder Ursprung ist nicht erlaubt.'});}
  const key=req.ip||'unknown',now=Date.now(),old=buckets.get(key);const state=old&&old.end>now?old:{n:0,end:now+60000};state.n++;buckets.set(key,state);
  if(buckets.size>10000)for(const [k,v]of buckets)if(v.end<now)buckets.delete(k);
  if(state.n>1000)return res.status(429).json({fehler:'Zu viele Anfragen. Bitte kurz warten.'});
 }
 next();
}
function baueTeilnahmeApi(db){
 const r=express.Router();r.use(guard);
 r.post('/:vid/anfragen',h(async(req,res)=>{const id=Number(req.params.vid);if(!Number.isSafeInteger(id)||id<1)return res.status(404).json({fehler:'Versammlung nicht gefunden.'});
  const joined=await L.join(db,id,req.body||{},req.cookies?.[cookie(id)]);res.cookie(cookie(id),joined.token,{httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_INSECURE!=='1',path:'/api/etv-teilnahme/'+id,maxAge:7*86400000});res.json({ok:true});}));
 r.get('/:vid/stand',h(async(req,res)=>res.json(await L.guestState(db,req.params.vid,req.cookies?.[cookie(req.params.vid)]))));
 r.post('/:vid/runden/:rid/stimme',h(async(req,res)=>{const token=req.cookies?.[cookie(req.params.vid)];await L.guest(db,req.params.vid,token,true);res.json(await L.vote(db,req.params.vid,req.params.rid,req.body||{},{anfrage:token}));}));
 return r;
}
module.exports={baueTeilnahmeApi};
