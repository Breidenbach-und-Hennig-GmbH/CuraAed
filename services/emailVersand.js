'use strict';
const crypto=require('node:crypto'),{ValidationError}=require('../lib/validation'),{mailbox}=require('./m365-kern');
const fail=(text,status=400)=>{throw new ValidationError(text,status);};
function baue(db,zugang){
 async function senden(user,source,b){
  if(b.bestaetigt!==true||!mailbox(b.an)||typeof b.betreff!=='string'||!b.betreff.trim()||b.betreff.length>255||/[\r\n]/.test(b.betreff)||typeof b.text!=='string'||!b.text.trim()||b.text.length>50000||typeof b.auftrag_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.auftrag_id))fail('Bitte Empfänger, Betreff und Nachricht prüfen und den Versand bestätigen.');
  const p=await zugang.provider(user,source),an=b.an.toLowerCase(),betreff=b.betreff.trim(),hash=crypto.createHash('sha256').update(JSON.stringify([p.zugang,p.postfach,an,betreff,b.text])).digest('hex');
  const old=await db.transaktion(async tx=>{const r=await tx.get('SELECT * FROM email_sendungen WHERE auftrag_id=?',[b.auftrag_id]);if(r){if(r.benutzer_id!==user.id||r.anfrage_hash!==hash)fail('Dieser Versandauftrag gehört zu einer anderen Nachricht.',409);return r;}await tx.run("INSERT INTO email_sendungen(auftrag_id,benutzer_id,zugang,postfach,empfaenger,betreff,text,anfrage_hash,status) VALUES(?,?,?,?,?,?,?,?,'unklar')",[b.auftrag_id,user.id,p.zugang,p.postfach,an,betreff,b.text,hash]);return null;});
  if(old){if(old.status==='angenommen')return{angenommen:true,absender:p.postfach,an};fail('Versandstatus bitte zuerst unter Gesendet prüfen. Dieser Auftrag wird nicht erneut gesendet.',409);}
  let response;try{response=await p.request('/sendMail','POST',{message:{subject:betreff,body:{contentType:'Text',content:b.text},from:{emailAddress:{address:p.postfach}},toRecipients:[{emailAddress:{address:an}}]},saveToSentItems:true});}catch{fail('Versand nicht bestätigt. Bitte Gesendet prüfen, bevor Sie erneut senden.',502);}
  if(response.status!==202){if(response.status>=400&&response.status<500&&![408,429].includes(response.status))await db.run("UPDATE email_sendungen SET status='abgelehnt' WHERE auftrag_id=?",[b.auftrag_id]);fail('Microsoft hat den Versand nicht bestätigt. Bitte Gesendet und die Sendeberechtigung prüfen.',502);}
  await db.run("UPDATE email_sendungen SET status='angenommen' WHERE auftrag_id=?",[b.auftrag_id]);return{angenommen:true,absender:p.postfach,an};
 }
 return{senden};
}
module.exports={baue};
