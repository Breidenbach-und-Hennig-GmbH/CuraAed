'use strict';
const crypto = require('node:crypto');
const { ValidationError } = require('../lib/validation');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const bad = (message, status = 400) => { throw new ValidationError(message, status); };
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
const titel = value => typeof value === 'string' && /^[\x20-\x7e]{0,30}$/.test(value) && !value.endsWith(' ');
const version = (id, record) => hash(JSON.stringify([id, record.nummer, record.name, record.titel]));
function recordCheck(record, row) {
  if (!record || record.nummer !== row.test_nummer || record.name !== 'CURAAED-TEST' || typeof record.titel !== 'string' || record.titel.length > 30)
    bad('Der vereinbarte HP-Testkontakt wurde nicht eindeutig bestätigt.', 409);
  return { nummer: record.nummer, name: record.name, titel: record.titel };
}

function baueHpDirekt(db, { now = () => Date.now() } = {}) {
  const iso = () => new Date(now()).toISOString();
  async function own(tx, owner, id) {
    const row = await tx.get('SELECT * FROM hp_direkt_verbindungen WHERE id=? AND benutzer_id=? AND aktiv=1', [id, owner]);
    if (!row) bad('Direkte HP-Verbindung nicht gefunden.', 404);
    return row;
  }
  async function agent(tx, id, token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) bad('Connector-Anmeldung ungültig.', 401);
    const row = await tx.get('SELECT v.* FROM hp_direkt_verbindungen v JOIN benutzer b ON b.id=v.benutzer_id WHERE v.id=? AND v.aktiv=1 AND b.aktiv=1 AND b.rolle=\'admin\'', [id]);
    if (!row || !crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(row.token_hash))) bad('Connector-Anmeldung ungültig.', 401);
    if (row.ablauf_ms <= now()) bad('Die achtstündige Connector-Freigabe ist abgelaufen. Bitte in CuraAed neu koppeln.', 401);
    return row;
  }
  async function expire(tx, id) {
    await tx.run("UPDATE hp_direkt_auftraege SET status='unklar',meldung='Keine bestätigte Rückmeldung. HP prüfen und frisch lesen; Auftrag wird nicht automatisch wiederholt.' WHERE verbindung_id=? AND status='unterwegs' AND abgeholt_ms<?", [id, now() - 120000]);
  }
  const snapshot = row => row.snapshot ? JSON.parse(row.snapshot) : null;
  async function view(tx, row) {
    await expire(tx, row.id);
    return { id: row.id, name: row.name, datenbank: row.datenbank, test_nummer: row.test_nummer, ablauf_ms: row.ablauf_ms, zuletzt_gesehen: row.zuletzt_gesehen,
      snapshot: snapshot(row), version: row.version, gelesen_am: row.gelesen_am,
      auftraege: await tx.all('SELECT id,art,status,meldung,erstellt_am,erledigt_am FROM hp_direkt_auftraege WHERE verbindung_id=? ORDER BY rowid DESC LIMIT 20', [row.id]) };
  }
  return {
    async liste(owner) {
      return db.transaktion(async tx => {
        const rows = await tx.all('SELECT * FROM hp_direkt_verbindungen WHERE benutzer_id=? AND aktiv=1 ORDER BY rowid DESC', [owner]);
        const result = []; for (const row of rows) result.push(await view(tx, row)); return result;
      });
    },
    async anlegen(owner, input) {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.datenbank !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(input.datenbank) || !Number.isSafeInteger(input.test_nummer) || input.test_nummer < 1 || input.test_nummer > 2147483647)
        bad('Bitte Verbindungsname, HP-Datenbank und Nummer des separaten Testkontakts angeben.');
      const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url'), ablauf = now() + 8 * 3600000;
      await db.run('INSERT INTO hp_direkt_verbindungen (id,benutzer_id,name,datenbank,test_nummer,token_hash,ablauf_ms,aktiv) VALUES (?,?,?,?,?,?,?,1)', [id, owner, input.name.trim(), input.datenbank.toUpperCase(), input.test_nummer, hash(token), ablauf]);
      return { id, token, ablauf_ms: ablauf };
    },
    async trennen(owner, id) {
      return db.transaktion(async tx => {
        await own(tx, owner, id);
        await tx.run('UPDATE hp_direkt_verbindungen SET aktiv=0,ablauf_ms=0 WHERE id=?', [id]);
        await tx.run("UPDATE hp_direkt_auftraege SET status='abgebrochen',meldung='Verbindung getrennt.' WHERE verbindung_id=? AND status='wartend'", [id]);
        return { ok: true };
      });
    },
    async auftrag(owner, id, input) {
      if (!uuid(input.id) || !['lesen', 'titel'].includes(input.art)) bad('Ungültiger HP-Testauftrag.');
      const payload = input.art === 'lesen' ? {} : { version: input.version, neu: input.neu };
      const requestHash = hash(JSON.stringify([input.art, payload]));
      return db.transaktion(async tx => {
        const row = await own(tx, owner, id); await expire(tx, id);
        if (row.ablauf_ms <= now()) bad('Die Connector-Freigabe ist abgelaufen. Bitte eine neue Verbindung einrichten.', 409);
        const existing = await tx.get('SELECT * FROM hp_direkt_auftraege WHERE id=?', [input.id]);
        if (existing) {
          if (existing.verbindung_id !== id || existing.request_hash !== requestHash) bad('Auftragskennung bereits anders verwendet.', 409);
          return { id: existing.id, status: existing.status };
        }
        if (await tx.get("SELECT id FROM hp_direkt_auftraege WHERE verbindung_id=? AND status IN ('wartend','unterwegs')", [id])) bad('Bitte den laufenden HP-Auftrag abwarten.', 409);
        let body = {};
        if (input.art === 'titel') {
          const base = snapshot(row);
          if (!base || !row.version || input.version !== row.version || now() - row.gelesen_am > 60000) bad('Bitte den HP-Testkontakt vor der Änderung frisch lesen.', 409);
          if (!titel(input.neu) || !titel(base.titel)) bad('Im Test sind höchstens 30 druckbare ASCII-Zeichen ohne Leerzeichen am Ende für den Titel erlaubt.');
          if (input.neu === base.titel) bad('Der Titel ist unverändert.');
          body = { alt: base.titel, neu: input.neu };
        }
        await tx.run("INSERT INTO hp_direkt_auftraege (id,verbindung_id,art,status,request_hash,daten,erstellt_am) VALUES (?,?,?,'wartend',?,?,?)", [input.id, id, input.art, requestHash, JSON.stringify(body), iso()]);
        // Ab dem Absenden einer Änderung gilt der alte Snapshot nicht mehr als Schreibgrundlage.
        if (input.art === 'titel') await tx.run('UPDATE hp_direkt_verbindungen SET version=NULL WHERE id=?', [id]);
        return { id: input.id, status: 'wartend' };
      });
    },
    async poll(id, token, input) {
      return db.transaktion(async tx => {
        const row = await agent(tx, id, token);
        if (!input || typeof input.datenbank !== 'string' || input.datenbank.toUpperCase() !== row.datenbank || input.test_nummer !== row.test_nummer || input.test_name !== 'CURAAED-TEST') bad('Connector und HP-Kundenbestand stimmen nicht überein.', 409);
        await tx.run('UPDATE hp_direkt_verbindungen SET zuletzt_gesehen=? WHERE id=?', [now(), id]);
        await expire(tx, id);
        const job = await tx.get("SELECT * FROM hp_direkt_auftraege WHERE verbindung_id=? AND status='wartend' ORDER BY rowid LIMIT 1", [id]);
        if (!job) return { auftrag: null };
        const claim = crypto.randomBytes(24).toString('base64url');
        await tx.run("UPDATE hp_direkt_auftraege SET status='unterwegs',claim=?,abgeholt_ms=? WHERE id=? AND status='wartend'", [claim, now(), job.id]);
        return { auftrag: { id: job.id, claim, art: job.art, nummer: row.test_nummer, name: 'CURAAED-TEST', ...JSON.parse(job.daten) } };
      });
    },
    async ergebnis(id, token, input) {
      return db.transaktion(async tx => {
        const row = await agent(tx, id, token);
        if (!input || !uuid(input.id) || typeof input.claim !== 'string' || !['erfolg','konflikt','fehler','unklar'].includes(input.status)) bad('Ungültige Connector-Rückmeldung.');
        const job = await tx.get('SELECT * FROM hp_direkt_auftraege WHERE id=? AND verbindung_id=?', [input.id, id]);
        if (!job || job.claim !== input.claim) bad('HP-Auftrag nicht gefunden.', 404);
        const resultHash = hash(JSON.stringify([input.status, input.record || null]));
        if (job.result_hash) {
          if (job.result_hash !== resultHash) bad('Abweichende doppelte Rückmeldung.', 409);
          return { ok: true };
        }
        if (!['unterwegs','unklar'].includes(job.status)) bad('HP-Auftrag wird nicht mehr verarbeitet.', 409);
        let record = null;
        if (input.status === 'erfolg' || input.status === 'konflikt') record = recordCheck(input.record, row);
        if (input.status === 'erfolg' && job.art === 'titel' && record.titel !== JSON.parse(job.daten).neu) bad('HP hat den gewünschten Titel nicht bestätigt.', 409);
        const messages = { erfolg: job.art === 'titel' ? 'In HP gespeichert und nach dem Commit zurückgelesen.' : 'Direkt aus HP gelesen.', konflikt: 'In HP inzwischen geändert. Neu lesen und Änderung prüfen.', fehler: 'Der Connector hat den Auftrag abgelehnt. Keine bestätigte Änderung.', unklar: 'Ausgang unklar. HP prüfen und frisch lesen; keine automatische Wiederholung.' };
        await tx.run('UPDATE hp_direkt_auftraege SET status=?,meldung=?,result_hash=?,erledigt_am=? WHERE id=?', [input.status, messages[input.status], resultHash, iso(), job.id]);
        const newer = await tx.get('SELECT id FROM hp_direkt_auftraege WHERE verbindung_id=? AND rowid>(SELECT rowid FROM hp_direkt_auftraege WHERE id=?) LIMIT 1', [id, job.id]);
        if (!newer) await tx.run('UPDATE hp_direkt_verbindungen SET snapshot=?,version=?,gelesen_am=?,zuletzt_gesehen=? WHERE id=?', [record ? JSON.stringify(record) : null, record ? version(id, record) : null, record ? now() : null, now(), id]);
        return { ok: true };
      });
    },
  };
}
module.exports = { baueHpDirekt, recordCheck, version };

