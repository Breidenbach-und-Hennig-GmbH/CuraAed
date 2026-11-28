'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { HpMobileError } = require('./hausperfektMobile');
const CATEGORY = "CASE WHEN lower(f.art) LIKE '%abrechnung%' THEN 'abrechnung' WHEN lower(f.art) LIKE '%rechnung%' THEN 'rechnung' WHEN lower(f.art) LIKE '%protokoll%' THEN 'protokoll' WHEN lower(f.art) LIKE '%vertrag%' THEN 'vertrag' WHEN lower(f.art) LIKE '%schriftverkehr%' OR lower(f.art) LIKE '%outlook%' THEN 'korrespondenz' WHEN lower(f.art) LIKE '%foto%' OR lower(f.art) LIKE '%bild%' THEN 'foto' ELSE 'sonstiges' END";
const fail = (message, status = 409) => { throw new HpMobileError(message, status); };
// A legacy import may still belong to the former Administrator identity. Only
// administrators with explicit company membership may read that company's
// bound source (including its direct-import sibling), never another company.
const COMPANY_ADMIN = `EXISTS(SELECT 1 FROM kunden_firmen_quellen k
 JOIN hp_dms_quellen customer ON customer.id=k.quelle_id AND customer.direkt_id=s.direkt_id
 JOIN kunden_firmen_benutzer b ON b.firma_id=k.firma_id
 JOIN benutzer u ON u.id=b.benutzer_id AND u.rolle='admin' AND u.aktiv=1
 WHERE b.benutzer_id=? AND NOT EXISTS(SELECT 1 FROM kunden_firmen_quellen other WHERE other.quelle_id=s.id AND other.firma_id<>k.firma_id))`;

// Sources intentionally do not reference the temporary OAuth connection. Removing
// a connection must never remove migrated documents or their provenance.
function baueArchiv(db, directory, remote) {
  const root = path.resolve(directory), active = new Map(), writes = new Map();
  let diskQueue = Promise.resolve();
  function diskWrite(fn) { const next=diskQueue.then(fn,fn);diskQueue=next.catch(()=>{});return next; }
  async function source(owner, connection) {
    const c = await db.get('SELECT subdomain FROM hp_mobile_verbindungen WHERE id=? AND benutzer_id=?', [connection, owner]);
    if (!c) fail('HP-Verbindung nicht gefunden.', 404);
    await db.run('INSERT OR IGNORE INTO hp_dms_quellen(id,benutzer_id,subdomain) VALUES(?,?,?)', [crypto.randomUUID(), owner, c.subdomain]);
    return db.get('SELECT * FROM hp_dms_quellen WHERE benutzer_id=? AND subdomain=?', [owner, c.subdomain]);
  }
  async function owned(owner, sourceId) {
    const s = await db.get('SELECT s.* FROM hp_dms_quellen s WHERE s.id=? AND (s.benutzer_id=? OR '+COMPANY_ADMIN+')', [sourceId, owner, owner]);
    if (!s) fail('Archivbestand nicht gefunden.', 404);
    return s;
  }
  async function remember(owner, connection, detail) {
    const s = await source(owner, connection), d = detail.dokument;
    const previous = await db.get('SELECT details,speicher_name FROM hp_dms_dateien WHERE quelle_id=? AND datei_id=?',[s.id,d.id]);
    if(previous?.speicher_name && JSON.parse(previous.details).dokument.version !== d.version) fail('Die HP-Datei wurde nach der Sicherung verändert. Der gesicherte Stand bleibt erhalten; bitte prüfen.');
    await db.transaktion(async tx => {
      await tx.run(`INSERT INTO hp_dms_dateien(quelle_id,datei_id,titel,dateiname,datum,art,groesse,details,gelesen_am)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(quelle_id,datei_id) DO UPDATE SET
        titel=excluded.titel,dateiname=excluded.dateiname,datum=excluded.datum,art=excluded.art,
        groesse=excluded.groesse,details=excluded.details,gelesen_am=excluded.gelesen_am`,
      [s.id, d.id, d.titel, d.dateiname, d.datum, d.dokumentart, d.groesse, JSON.stringify(detail), new Date().toISOString()]);
      await tx.run('DELETE FROM hp_dms_bezuege WHERE quelle_id=? AND datei_id=?', [s.id, d.id]);
      for (const g of detail.zuordnungen) for (const r of g.eintraege) {
        await tx.run('INSERT OR IGNORE INTO hp_dms_bezuege(quelle_id,datei_id,art,hp_nummer,objekt_nummer,name) VALUES(?,?,?,?,?,?)',
          [s.id, d.id, g.art, String(r.hpNummer ?? ''), String(r.objektNummer ?? ''), r.name]);
      }
    });
    return s;
  }
  async function row(owner, sourceId, fileId) {
    await owned(owner, sourceId);
    const r = await db.get('SELECT * FROM hp_dms_dateien WHERE quelle_id=? AND datei_id=?', [sourceId, fileId]);
    if (!r) fail('Dokument noch nicht übernommen.', 404);
    return r;
  }
  async function cached(owner, sourceId, fileId) {
    const r = await row(owner, sourceId, fileId);
    if (!r.speicher_name) return null;
    const filePath = path.join(root,path.basename(r.speicher_name)), hash=crypto.createHash('sha256');
    for await(const chunk of require('node:fs').createReadStream(filePath)) hash.update(chunk);
    if(hash.digest('hex')!==r.sha256)fail('Die gespeicherte Datei konnte nicht bestätigt werden.',502);
    const handle=await fs.open(filePath,'r');let prefix;
    try{prefix=Buffer.alloc(5);await handle.read(prefix,0,5,0);}finally{await handle.close();}
    return {path:filePath,name:r.dateiname,pdf:prefix.toString()==='%PDF-'};
  }
  async function store(owner, connection, fileId) {
    const s = await source(owner, connection), key = s.id + ':' + fileId;
    if (writes.has(key)) return writes.get(key);
    const p = diskWrite(async () => {
      let r = await db.get('SELECT * FROM hp_dms_dateien WHERE quelle_id=? AND datei_id=?', [s.id, fileId]);
      if (r?.speicher_name) return cached(owner, s.id, fileId);
      if (!r) { await remember(owner, connection, await remote.dmsDetails(owner, connection, fileId)); r = await row(owner, s.id, fileId); }
      await fs.mkdir(root, { recursive: true });
      const space = await fs.statfs(root);
      if (space.bavail * space.bsize < Math.max(r.groesse,1) + 256 * 1024 * 1024) fail('Übernahme angehalten: Für das Archiv ist zusätzlicher freier Speicher erforderlich.', 507);
      const name = crypto.randomUUID() + '.bin', target = path.join(root, name), temp = target + '.part';
      try {
        let transfer;
        if(remote.dmsSpeichern) transfer=await remote.dmsSpeichern(owner,connection,fileId,temp,space.bavail*space.bsize-256*1024*1024);
        else {
          const file=await remote.dmsDownload(owner,connection,fileId);
          await fs.writeFile(temp,file.bytes,{flag:'wx',mode:0o600});
          transfer={sha256:crypto.createHash('sha256').update(file.bytes).digest('hex'),version:file.version};
        }
        if(transfer.version!==JSON.parse(r.details).dokument.version)fail('Die HP-Datei wurde während der Übernahme verändert. Bitte erneut abgleichen.');
        const hash=transfer.sha256;
        await fs.rename(temp, target);
        await db.run('UPDATE hp_dms_dateien SET speicher_name=?,sha256=?,gesichert_am=?,fehler=NULL WHERE quelle_id=? AND datei_id=?', [name, hash, new Date().toISOString(), s.id, fileId]);
      } catch (e) { await fs.unlink(temp).catch(() => {}); await fs.unlink(target).catch(() => {}); throw e; }
      return cached(owner,s.id,fileId);
    });
    writes.set(key, p);
    try { return await p; } finally { writes.delete(key); }
  }
  async function links(r) {
    const s = await db.get('SELECT direkt_id FROM hp_dms_quellen WHERE id=?', [r.quelle_id]);
    if (!s?.direkt_id) return [];
    const refs = await db.all('SELECT * FROM hp_dms_bezuege WHERE quelle_id=? AND datei_id=?', [r.quelle_id, r.datei_id]), found = [];
    for (const b of refs) {
      let m, typ;
      if (b.art === 'persons') { typ = 'adresse'; m = await db.get('SELECT adresse_id AS id FROM hp_adress_ziele WHERE verbindung_id=? AND hp_nummer=?', [s.direkt_id, b.hp_nummer]); }
      if (b.art === 'buildings') { typ = 'objekt'; m = await db.get('SELECT objekt_id AS id FROM hp_objekt_zuordnung WHERE verbindung_id=? AND hp_objnr=?', [s.direkt_id, b.hp_nummer]); }
      if (b.art === 'units') { typ = 'einheit'; m = await db.get('SELECT einheit_id AS id FROM hp_einheit_zuordnung WHERE verbindung_id=? AND hp_objnr=? AND hp_whgnr=?', [s.direkt_id, b.objekt_nummer, b.hp_nummer]); }
      if (m && !found.some(x => x.typ === typ && x.ziel_id === m.id)) found.push({ typ, ziel_id: m.id, nummer: b.hp_nummer, label: b.name });
    }
    return found;
  }
  async function archiveList(owner, q = {}) {
    // Filter by source-scoped ERP mappings in SQL, never names or local IDs.
    let filter = '', args = [owner,owner];
    if(q.kategorie){filter+=' AND ('+CATEGORY+')=?';args.push(q.kategorie);}
    const relation = (mapping, match, target, value) => {
      filter += ` AND EXISTS(SELECT 1 FROM hp_dms_bezuege b JOIN ${mapping} m ON m.verbindung_id=s.direkt_id AND ${match} WHERE b.quelle_id=f.quelle_id AND b.datei_id=f.datei_id AND ${target})`;
      args.push(value);
    };
    if (q.adresseId) relation('hp_adress_ziele', "b.art='persons' AND m.hp_nummer=b.hp_nummer", 'm.adresse_id=?', q.adresseId);
    if (q.einheitId) relation('hp_einheit_zuordnung', "b.art='units' AND m.hp_objnr=b.objekt_nummer AND m.hp_whgnr=b.hp_nummer", 'm.einheit_id=?', q.einheitId);
    if (q.objektId) {
      filter += ` AND EXISTS(SELECT 1 FROM hp_dms_bezuege b JOIN hp_objekt_zuordnung m ON m.verbindung_id=s.direkt_id AND m.hp_objnr=CASE WHEN b.art='units' THEN b.objekt_nummer ELSE b.hp_nummer END WHERE b.quelle_id=f.quelle_id AND b.datei_id=f.datei_id AND b.art IN ('units','buildings') AND m.objekt_id=?)`;
      args.push(q.objektId);
    }
    if (q.ohneZuordnung) filter += ' AND NOT EXISTS(SELECT 1 FROM hp_dms_bezuege b WHERE b.quelle_id=f.quelle_id AND b.datei_id=f.datei_id)';
    if (q.suche) { filter += ' AND (f.titel LIKE ? OR f.dateiname LIKE ? OR EXISTS(SELECT 1 FROM hp_dms_bezuege b WHERE b.quelle_id=f.quelle_id AND b.datei_id=f.datei_id AND (b.name LIKE ? OR b.hp_nummer LIKE ?)))'; args.push(...Array(4).fill('%' + String(q.suche).slice(0, 200) + '%')); }
    const rows = await db.all(`SELECT f.*,s.subdomain,${CATEGORY} AS kategorie FROM hp_dms_dateien f JOIN hp_dms_quellen s ON s.id=f.quelle_id WHERE (s.benutzer_id=? OR ${COMPANY_ADMIN})${filter} ORDER BY f.datum DESC,f.datei_id DESC LIMIT 501`, args);
    const result = [];
    for (const r of rows.slice(0, 500)) result.push({ id: 'hp:' + r.quelle_id + ':' + r.datei_id, hp: { quelle: r.quelle_id, datei: r.datei_id, gesichert: !!r.speicher_name }, titel: r.titel, beschreibung: r.art + ' · ' + (r.speicher_name ? 'In CuraAed gespeichert' : 'Datei noch nicht übernommen'), original_name: r.dateiname, dokument_datum: r.datum, kategorie: r.kategorie, groesse: r.groesse, verknuepfungen: await links(r) });
    return { eintraege: result, mehr: rows.length > 500 };
  }
  async function status(owner, connection) {
    const s = await source(owner, connection);
    const count = await db.get('SELECT COUNT(*) AS metadaten,COUNT(speicher_name) AS dateien,COALESCE(SUM(CASE WHEN speicher_name IS NOT NULL THEN groesse ELSE 0 END),0) AS bytes,SUM(CASE WHEN fehler IS NOT NULL THEN 1 ELSE 0 END) AS fehler FROM hp_dms_dateien WHERE quelle_id=?', [s.id]);
    if(!active.has(s.id)) await db.run("UPDATE hp_dms_auftraege SET status='angehalten',meldung='Übernahme nach Serverneustart fortsetzen.' WHERE quelle_id=? AND status='laeuft'",[s.id]);
    return { quelle: s.id, direktId: s.direkt_id, ...count, auftrag: await db.get('SELECT seite,position,status,meldung,suche FROM hp_dms_auftraege WHERE quelle_id=?', [s.id]) || null,
      direktQuellen: await db.all('SELECT id,name,datenbank FROM hp_adress_verbindungen WHERE benutzer_id=?', [owner]) };
  }
  async function bind(owner, connection, direct) {
    const s = await source(owner, connection);
    if (!await db.get('SELECT id FROM hp_adress_verbindungen WHERE id=? AND benutzer_id=?', [direct, owner])) fail('HP-Datenquelle nicht gefunden.', 404);
    if (s.direkt_id && s.direkt_id !== direct) fail('Archivbestand bereits an eine andere HP-Datenquelle gebunden.');
    await db.run('UPDATE hp_dms_quellen SET direkt_id=? WHERE id=?', [direct, s.id]);
    return status(owner, connection);
  }
  async function run(owner, connection, s) {
    try {
      let job = await db.get('SELECT * FROM hp_dms_auftraege WHERE quelle_id=?', [s.id]);
      for (;;) {
        const page = await remote.dmsListe(owner, connection, { seite: job.seite, suche: job.suche, importieren: true });
        for (let i = job.position; i < page.dokumente.length; i++) {
          if((await db.get('SELECT status FROM hp_dms_auftraege WHERE quelle_id=?',[s.id])).status!=='laeuft')return;
          const d = page.dokumente[i];
          if(!await db.get('SELECT 1 FROM hp_dms_dateien WHERE quelle_id=? AND datei_id=?',[s.id,d.id])) await remember(owner,connection,{dokument:d,dateien:[d],zuordnungen:[]});
          try {
            const detail=await remote.dmsDetails(owner,connection,d.id);
            await remember(owner,connection,detail);
            await store(owner,connection,d.id);
            if(detail.zuordnungen.some(g=>g.gesamt>g.eintraege.length))await db.run('UPDATE hp_dms_dateien SET fehler=? WHERE quelle_id=? AND datei_id=?',['HP liefert noch nicht alle Zuordnungen.',s.id,d.id]);
          } catch(e) {
            if(!(e instanceof HpMobileError) || [401,403,429,507].includes(e.status)) throw e;
            // Keep an explicit gap; one unavailable source file must not block all later files.
            await db.run('UPDATE hp_dms_dateien SET fehler=? WHERE quelle_id=? AND datei_id=?',[e.message,s.id,d.id]);
          }
          await db.run('UPDATE hp_dms_auftraege SET position=? WHERE quelle_id=?', [i + 1, s.id]);
        }
        if (!page.weitere) { await db.run("UPDATE hp_dms_auftraege SET status='fertig',meldung='Durchlauf abgeschlossen. Fehlende Dateien und Zuordnungen prüfen; bei Bedarf erneut abgleichen.' WHERE quelle_id=?", [s.id]); break; }
        job.seite++; job.position = 0;
        await db.run('UPDATE hp_dms_auftraege SET seite=?,position=0 WHERE quelle_id=?', [job.seite, s.id]);
      }
    } catch (e) { await db.run("UPDATE hp_dms_auftraege SET status='angehalten',meldung=? WHERE quelle_id=?", [e instanceof HpMobileError ? e.message : 'Übernahme unterbrochen. Bitte erneut starten.', s.id]).catch(() => {}); }
    finally { active.delete(s.id); }
  }
  async function stop(owner,connection) { const s=await source(owner,connection);await db.run("UPDATE hp_dms_auftraege SET status='angehalten',meldung='Manuell angehalten. Eine bereits laufende Datei wird noch fertig gesichert.' WHERE quelle_id=?",[s.id]);return status(owner,connection); }
  async function start(owner, connection, search = '') {
    if (typeof search !== 'string' || search.length > 200) fail('Ungültige Archivsuche.', 400);
    const s = await source(owner, connection);
    if (!active.has(s.id)) {
      active.set(s.id,Promise.resolve());
      const old = await db.get('SELECT * FROM hp_dms_auftraege WHERE quelle_id=?', [s.id]);
      const resume = old && old.status !== 'fertig' && old.suche === search;
      await db.run(`INSERT INTO hp_dms_auftraege(quelle_id,verbindung_id,suche,seite,position,status,meldung) VALUES(?,?,?,?,?,'laeuft',NULL)
        ON CONFLICT(quelle_id) DO UPDATE SET verbindung_id=excluded.verbindung_id,suche=excluded.suche,seite=excluded.seite,position=excluded.position,status='laeuft',meldung=NULL`, [s.id, connection, search, resume ? old.seite : 1, resume ? old.position : 0]);
      const p = run(owner, connection, s); active.set(s.id, p);
    }
    return status(owner, connection);
  }
  async function archiveDocument(owner,sourceId,fileId){
    const r=await row(owner,sourceId,fileId);
    return {id:'hp:'+sourceId+':'+fileId,hp:{quelle:sourceId,datei:Number(fileId),gesichert:!!r.speicher_name},titel:r.titel,original_name:r.dateiname,dokument_datum:r.datum,verknuepfungen:await links(r)};
  }
  async function details(owner, sourceId, fileId) { return JSON.parse((await row(owner, sourceId, fileId)).details); }
  async function localFile(owner, sourceId, fileId) {
    const s = await owned(owner, sourceId);
    let hit;try{hit=await cached(owner,sourceId,fileId);}catch(e){if(!(e instanceof HpMobileError)||e.status!==404)throw e;}
    if(hit)return hit;
    if(s.subdomain.startsWith('odbc-'))fail('Diese Datei wurde noch nicht aus dem HP-Archiv übernommen. Den direkten HP-Aktenimport fortsetzen.');
    const c = await db.get('SELECT id FROM hp_mobile_verbindungen WHERE benutzer_id=? AND subdomain=?', [owner, s.subdomain]);
    if (!c) fail('Die Datei wurde noch nicht übernommen. Zum einmaligen Abruf die HP-Verbindung wiederherstellen.');
    return store(owner, c.id, fileId);
  }
  // A process restart leaves the durable cursor intact; resume requires one click.
  return { source, remember, store, archiveList, archiveDocument, status, bind, start, stop, details, localFile };
}
module.exports = { baueArchiv };
