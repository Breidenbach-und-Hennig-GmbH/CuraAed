'use strict';
const {ValidationError}=require('../lib/validation');
const fail=(m,s=400)=>{throw new ValidationError(m,s);};
const PLATZHALTER='/images/mitarbeiter-platzhalter.svg';
const bildUrl=r=>r.hat_bild?'/api/mitarbeiterprofile/'+r.benutzer_id+'/bild?v='+r.revision:PLATZHALTER;
async function eigenes(db,id){
 const r=await db.get('SELECT benutzer_id,starface_login_id,rufnummer,revision,bild IS NOT NULL AS hat_bild FROM mitarbeiterprofile WHERE benutzer_id=?',[id]);
 const p=r||{benutzer_id:id,starface_login_id:null,revision:0,hat_bild:0};
 return {...p,bild_url:bildUrl(p)};
}
async function liste(db,now=Date.now()){
 return (await db.all("SELECT b.id AS benutzer_id,b.name,b.kuerzel,p.rufnummer,p.revision,p.bild IS NOT NULL AS hat_bild,CASE WHEN t.ablauf_ms>? AND t.gesehen_ms>=? THEN t.status ELSE 'unbekannt' END AS telefon_status,EXISTS(SELECT 1 FROM mitarbeiter_aktivitaet a JOIN sitzungen s ON s.token=a.sitzung_token WHERE s.benutzer_id=b.id AND julianday(s.ablauf_am)>julianday('now') AND a.gesehen_ms>=?) AS cura_online FROM benutzer b LEFT JOIN mitarbeiterprofile p ON p.benutzer_id=b.id LEFT JOIN telefonie_kopplung t ON t.benutzer_id=b.id WHERE b.aktiv=1 AND b.rolle IN ('admin','mitarbeiter') ORDER BY b.name COLLATE NOCASE,b.id",[now,now-require('./telefonie').FRESH,now-120000]))
 .map(r=>({id:r.benutzer_id,name:r.name,kuerzel:r.kuerzel,rufnummer:r.rufnummer||'',cura_online:!!r.cura_online,telefon_status:r.telefon_status,bild_url:bildUrl(r)}));
}
async function aktivitaet(db,token,now=Date.now()){
 return db.transaktion(async tx=>{
 // Nur eine tatsächlich bestehende Sitzung verlängert die Präsenz; keine fremde Benutzer-ID aus dem Request.
 const s=await tx.get("SELECT token FROM sitzungen WHERE token=? AND julianday(ablauf_am)>julianday('now')",[token]);
 if(!s)fail('Sitzung abgelaufen.',401);
 await tx.run('INSERT INTO mitarbeiter_aktivitaet(sitzung_token,gesehen_ms) VALUES(?,?) ON CONFLICT(sitzung_token) DO UPDATE SET gesehen_ms=excluded.gesehen_ms',[token,now]);
 await tx.run('DELETE FROM mitarbeiter_aktivitaet WHERE gesehen_ms<?',[now-86400000]);
 return {ok:true};
 });
}
async function speichern(db,id,b){
 if(!Number.isSafeInteger(b.revision)||b.revision<0)fail('Bitte das Profil neu öffnen.');
 if(typeof b.starface_login_id!=='string'||!/^\d{1,20}$/.test(b.starface_login_id.trim())&&b.starface_login_id.trim()!=='')fail('Die STARFACE-Login-ID darf nur Ziffern enthalten (maximal 20).');
 const login=b.starface_login_id.trim()||null;
 if(b.rufnummer!==undefined&&(typeof b.rufnummer!=='string'||b.rufnummer.length>40||!/^\+?[\d ()/.-]*$/.test(b.rufnummer)||b.rufnummer.trim()&&!/\d/.test(b.rufnummer)))fail('Bitte eine gültige Rufnummer oder Durchwahl eingeben (höchstens 40 Zeichen).');
 let image;
 if(b.bild!==undefined){
  if(b.bild===null)image=null;
  else {
   // Browser übergibt ein verkleinertes PNG. Header vor dem Dekodieren prüfen.
   if(typeof b.bild!=='string'||b.bild.length>750000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.bild))fail('Bitte ein gültiges Profilbild wählen.');
   const bytes=Buffer.from(b.bild.split(',')[1],'base64');
   if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('Ungültiges Profilbild.');
   const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);
   if(!w||!h||w>512||h>512)fail('Profilbild bitte auf höchstens 512 × 512 Bildpunkte verkleinern.');
   try{
    const {loadImage,createCanvas}=require('@napi-rs/canvas'),img=await loadImage(bytes);
    if(img.width!==w||img.height!==h)fail('Ungültige Bildabmessungen.');
    const c=createCanvas(256,256),size=Math.min(w,h);
    c.getContext('2d').drawImage(img,(w-size)/2,(h-size)/2,size,size,0,0,256,256);
    image=c.toBuffer('image/png');
   }catch(e){if(e instanceof ValidationError)throw e;fail('Das Profilbild konnte nicht gelesen werden.');}
  }
 }
 return db.transaktion(async tx=>{
  const old=await eigenes(tx,id);
  if(old.revision!==b.revision)fail('Das Profil wurde inzwischen geändert. Bitte neu öffnen.',409);
  await tx.run('INSERT OR IGNORE INTO mitarbeiterprofile(benutzer_id) VALUES(?)',[id]);
  await tx.run('UPDATE mitarbeiterprofile SET starface_login_id=?,rufnummer=?,revision=revision+1'+(image!==undefined?',bild=?':'')+' WHERE benutzer_id=?',[login,b.rufnummer===undefined?old.rufnummer||null:b.rufnummer.trim()||null,...(image!==undefined?[image]:[]),id]);
  return eigenes(tx,id);
 });
}
module.exports={eigenes,liste,speichern,aktivitaet};
