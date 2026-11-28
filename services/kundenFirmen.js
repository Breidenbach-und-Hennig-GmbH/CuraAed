'use strict';
const {ValidationError}=require('../lib/validation');
const fail=(m,s=400)=>{throw new ValidationError(m,s);};
async function quelle(db,owner,id,gebunden=true){
 const s=await db.get('SELECT s.*,k.firma_id,f.name AS firma_name FROM hp_dms_quellen s LEFT JOIN kunden_firmen_quellen k ON k.quelle_id=s.id LEFT JOIN firmenbriefkoepfe f ON f.id=k.firma_id WHERE s.id=?',[id]);
 if(!s)fail('Kundenquelle nicht gefunden.',404);
 if(s.firma_id){if(!await db.get('SELECT 1 FROM kunden_firmen_benutzer WHERE firma_id=? AND benutzer_id=?',[s.firma_id,owner]))fail('Kundenquelle nicht gefunden.',404);}
 else if(s.benutzer_id!==owner)fail('Kundenquelle nicht gefunden.',404);
 if(gebunden&&!s.firma_id)fail('Bitte diese Kundenquelle zuerst der zuständigen Firma zuordnen.',409);
 return s;
}
async function quellen(db,owner){
 return db.all(`SELECT s.id,s.subdomain,s.direkt_id,k.firma_id,f.name AS firma_name FROM hp_dms_quellen s
 LEFT JOIN kunden_firmen_quellen k ON k.quelle_id=s.id LEFT JOIN firmenbriefkoepfe f ON f.id=k.firma_id
 WHERE (k.firma_id IS NULL AND s.benutzer_id=?) OR EXISTS(SELECT 1 FROM kunden_firmen_benutzer b WHERE b.firma_id=k.firma_id AND b.benutzer_id=?) ORDER BY f.name,s.subdomain,s.id`,[owner,owner]);
}
async function firmen(db,owner){
 return db.all(`SELECT id,name FROM firmenbriefkoepfe f WHERE NOT EXISTS(SELECT 1 FROM kunden_firmen_benutzer b WHERE b.firma_id=f.id)
 OR EXISTS(SELECT 1 FROM kunden_firmen_benutzer b WHERE b.firma_id=f.id AND b.benutzer_id=?) ORDER BY name,id`,[owner]);
}
async function binden(db,owner,sourceId,firmaId){
 if(!Number.isSafeInteger(firmaId)||firmaId<1)fail('Bitte eine gültige Firma auswählen.');
 return db.transaktion(async tx=>{
  const s=await quelle(tx,owner,sourceId,false);
  if(s.firma_id){if(s.firma_id!==firmaId)fail('Diese Quelle ist bereits einer anderen Firma zugeordnet und kann nicht umgehängt werden.',409);return{quelle:sourceId,firma_id:firmaId};}
  if(!await tx.get('SELECT id FROM firmenbriefkoepfe WHERE id=?',[firmaId]))fail('Firma nicht gefunden.',404);
  const members=await tx.get('SELECT COUNT(*) AS n FROM kunden_firmen_benutzer WHERE firma_id=?',[firmaId]);
  if(members.n&&!await tx.get('SELECT 1 FROM kunden_firmen_benutzer WHERE firma_id=? AND benutzer_id=?',[firmaId,owner]))fail('Keine Berechtigung für diesen Firmenbestand.',403);
  if(await tx.get('SELECT 1 FROM kunden_firmen_quellen WHERE firma_id=? AND portal=?',[firmaId,s.subdomain]))fail('Für diese Firma ist bereits eine Kundenquelle dieses Portals hinterlegt.',409);
  await tx.run('INSERT OR IGNORE INTO kunden_firmen_benutzer(firma_id,benutzer_id) VALUES(?,?)',[firmaId,owner]);
  await tx.run('INSERT INTO kunden_firmen_quellen(quelle_id,firma_id,portal) VALUES(?,?,?)',[sourceId,firmaId,s.subdomain]);
  return{quelle:sourceId,firma_id:firmaId};
 });
}
module.exports={quelle,quellen,firmen,binden};
