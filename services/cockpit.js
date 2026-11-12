'use strict';
const {ValidationError}=require('../lib/validation');
const datumBerlin=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function einstellungen(db,user){
 const firmen=await require('./firmenbriefkoepfe').liste(db);
 const p=await db.get('SELECT firma_id,revision FROM cockpit_einstellungen WHERE benutzer_id=?',[user.id]);
 const firma_id=p?p.firma_id:(firmen.length===1?firmen[0].id:null);
 const firma=firma_id?await require('./firmenbriefkoepfe').holen(db,firma_id):null;
 return{firma_id,firma,revision:p?.revision||0,firmen:firmen.map(({id,name,logo_url})=>({id,name,logo_url}))};
}
async function speichern(db,user,b){
 const id=b.firma_id===null||b.firma_id===''?null:Number(b.firma_id);
 if((id!==null&&(!Number.isSafeInteger(id)||id<1))||!Number.isSafeInteger(b.revision)||b.revision<0)throw new ValidationError('Ungültige Firmenauswahl.');
 return db.transaktion(async tx=>{if(id!==null)await require('./firmenbriefkoepfe').holen(tx,id);const old=await tx.get('SELECT revision FROM cockpit_einstellungen WHERE benutzer_id=?',[user.id]);if((old?.revision||0)!==b.revision)throw new ValidationError('Firmenauswahl inzwischen geändert. Bitte neu öffnen.',409);
 await tx.run('INSERT INTO cockpit_einstellungen(benutzer_id,firma_id,revision) VALUES(?,?,1) ON CONFLICT(benutzer_id) DO UPDATE SET firma_id=excluded.firma_id,revision=revision+1',[user.id,id]);return einstellungen(tx,user);});
}
async function stand(db,user,heute=datumBerlin()){
 // Fachvorgänge bleiben auf Ersteller/Zuständige beschränkt. Nicht zugewiesene
 // Rückrufe und DMS-Eingänge erscheinen wie in den jeweiligen Arbeitslisten.
 const personal='(benutzer_id=? OR zustaendig_id=?)';
 const active="status NOT IN ('erledigt','storniert')";
 const legacy='erledigt=0 AND (zustaendig_id=? OR (zustaendig_id IS NULL AND (erstellt_von=? OR erstellt_von IS NULL)))';
 const wv="SELECT id,titel,prioritaet,faellig_am,uhrzeit,'vorgang' AS quelle,NULL AS adresse_id FROM fach_vorgaenge WHERE "+personal+" AND "+active+" AND art='wiedervorlage' UNION ALL SELECT id,betreff AS titel,'normal',faellig_am,NULL,'adresse',adresse_id FROM wiedervorlagen WHERE "+legacy;
 const args=[user.id,user.id,user.id,user.id];
 const wiedervorlagen={gesamt:(await db.get('SELECT COUNT(*) AS n FROM ('+wv+')',args)).n,eintraege:await db.all('SELECT * FROM ('+wv+') ORDER BY faellig_am,uhrzeit,id LIMIT 12',args)};
 const tickets=await require('./tickets').zaehler(db,user,heute);
 const prozesse=await db.get("SELECT COALESCE(SUM(status IN ('in_bearbeitung','beauftragt')),0) AS in_arbeit,COALESCE(SUM(status='offen'),0) AS nicht_gestartet FROM fach_vorgaenge WHERE "+personal+" AND art='akte' AND "+active,[user.id,user.id]);
 const telWhere='k.eingang=1 AND k.erledigt=0 AND (k.rueckruf_sb_id=? OR k.rueckruf_sb_id IS NULL)';
 const telefone={gesamt:(await db.get('SELECT COUNT(*) AS n FROM kontakte k WHERE '+telWhere,[user.id])).n,eintraege:await db.all("SELECT k.id,k.adresse_id,k.zeitpunkt,COALESCE(NULLIF(k.anrufer_name,''),a.firmenname,TRIM(COALESCE(a.vorname,'')||' '||COALESCE(a.nachname,''))) AS anrufer,k.betreff,k.notiz,b.kuerzel FROM kontakte k JOIN adressen a ON a.id=k.adresse_id LEFT JOIN benutzer b ON b.id=k.rueckruf_sb_id WHERE "+telWhere+' ORDER BY k.zeitpunkt,k.id LIMIT 12',[user.id])};
 const sb=user.kuerzel||'';
 const dokumente=await require('./dmsPosteingang').bauePosteingang(db).list({sb});
 // Ohne Kürzel keine fremden persönlichen Posteingänge auf der Startseite.
 if(!sb){const from=" FROM dms_posteingang p JOIN dokumente d ON d.id=p.dokument_id WHERE p.status='offen' AND p.sachbearbeiter=''";dokumente.gesamt=(await db.get('SELECT COUNT(*) AS n'+from)).n;dokumente.eintraege=await db.all('SELECT p.dokument_id,p.erstellt_am,d.titel,d.original_name'+from+' ORDER BY p.erstellt_am DESC,p.dokument_id DESC LIMIT 12');}
 const jahrEnde=(Number(heute.slice(0,4))+1)+'-01-01';
 const cal="SELECT id,titel,faellig_am,uhrzeit,'vorgang' AS quelle,NULL AS adresse_id FROM fach_vorgaenge WHERE "+personal+" AND "+active+" AND faellig_am>=? AND faellig_am<? UNION ALL SELECT id,betreff,faellig_am,NULL,'adresse',adresse_id FROM wiedervorlagen WHERE "+legacy+' AND faellig_am>=? AND faellig_am<?';
 const calArgs=[user.id,user.id,heute,jahrEnde,user.id,user.id,heute,jahrEnde];
 const kalender={gesamt:(await db.get('SELECT COUNT(*) AS n FROM ('+cal+')',calArgs)).n,eintraege:await db.all('SELECT * FROM ('+cal+') ORDER BY faellig_am,uhrzeit,id LIMIT 12',calArgs)};
 const geburtstage=await db.all("SELECT id,geburtstag,COALESCE(NULLIF(firmenname,''),TRIM(COALESCE(vorname,'')||' '||COALESCE(nachname,''))) AS name FROM adressen WHERE archiviert=0 AND substr(geburtstag,6,5)=? ORDER BY name COLLATE NOCASE,id LIMIT 50",[heute.slice(5)]);
 const tageszis=await db.all("SELECT id,titel,text,erstellt_am FROM fach_vorgaenge WHERE "+personal+" AND art='zis' AND substr(COALESCE(faellig_am,erstellt_am),1,10)=? ORDER BY erstellt_am DESC,id DESC LIMIT 100",[user.id,user.id,heute]);
 const prefs=await einstellungen(db,user);
 return{heute,tickets,prozesse,tageszis,wiedervorlagen,telefone,kalender,dokumente:{gesamt:dokumente.gesamt,eintraege:dokumente.eintraege.slice(0,12)},geburtstage,firma:prefs.firma};
}
module.exports={stand,einstellungen,speichern};
