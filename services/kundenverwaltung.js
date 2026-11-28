'use strict';
const crypto = require('node:crypto');
const { ValidationError } = require('../lib/validation');
const fail = (text, status = 400) => { throw new ValidationError(text, status); };
const hash = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
const heute = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
const positive = n => /^[1-9]\d*$/.test(String(n)) && Number.isSafeInteger(Number(n));
const flag = v => v === true || v === 1;

function normalisieren(data) {
  if (!data || data.version !== 1 || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(data.portal || '') || data.vollstaendig !== true ||
      !Array.isArray(data.users) || data.users.length > 10000 || data.users.length !== data.erwartete_anzahl)
    fail('Bitte einen vollständigen HP-Mobile-Benutzerexport der Version 1 verwenden.');
  const seen = new Set(), users = [];
  let intern = 0;
  for (const u of data.users) {
    if (!u || !positive(u.id) || seen.has(String(u.id))) fail('Der Export enthält ungültige oder doppelte Konto-IDs.');
    seen.add(String(u.id));
    for (const key of ['is_admin', 'is_team', 'is_sync', 'is_bots4you'])
      if (![true, false, 0, 1].includes(u[key])) fail('Interne und technische Konten sind nicht eindeutig gekennzeichnet.');
    if (['is_admin', 'is_team', 'is_sync', 'is_bots4you'].some(key => flag(u[key]))) { intern++; continue; }
    if (typeof u.name !== 'string' || u.name.length > 500 || !Array.isArray(u.persons) || u.persons.length > 200 || u.persons.length !== u.persons_count)
      fail('Ein Konto enthält unvollständige Personenbezüge oder einen ungültigen Namen.');
    if (u.email !== null && (typeof u.email !== 'string' || u.email.length > 320)) fail('Ein Konto enthält eine ungültige E-Mail-Angabe.');
    const persons = u.persons.map(p => ({ id: positive(p?.id) ? String(p.id) : null, hp_id: positive(p?.hp_id) ? Number(p.hp_id) : null }));
    users.push({ externe_id: String(u.id), name: u.name.trim(), email: u.email?.trim().toLowerCase() || null, persons });
  }
  return { portal: data.portal, users: users.sort((a, b) => Number(a.externe_id) - Number(b.externe_id)), intern, gesamt: data.users.length };
}

async function quelle(db, owner, id) {
  return require('./kundenFirmen').quelle(db, owner, id);
}

async function plan(db, owner, sourceId, data) {
  const source = await quelle(db, owner, sourceId), input = normalisieren(data);
  if (source.subdomain !== input.portal) fail('Der Export gehört nicht zur ausgewählten HP-Quelle.', 409);
  const day = heute();
  const mappings = source.direkt_id ? await db.all(`SELECT m.hp_nummer,m.adresse_id,a.archiviert,
    COALESCE(NULLIF(trim(a.firmenname),''),NULLIF(trim(COALESCE(a.vorname,'')||' '||COALESCE(a.nachname,'')),'')) AS adressname,
    EXISTS(SELECT 1 FROM rollen_zuordnungen r
      LEFT JOIN einheiten e ON e.id=r.einheit_id JOIN objekte o ON o.id=COALESCE(e.objekt_id,r.objekt_id)
      WHERE r.adresse_id=a.id AND r.rolle IN ('eigentuemer','mieter')
      AND (r.gueltig_von IS NULL OR r.gueltig_von<=?) AND (r.gueltig_bis IS NULL OR r.gueltig_bis>=?)
      AND o.archiviert=0 AND (r.einheit_id IS NULL OR e.archiviert=0)
      AND (r.objekt_id IS NULL OR r.einheit_id IS NULL OR r.objekt_id=e.objekt_id)) AS aktuell
    FROM hp_adress_ziele m JOIN adressen a ON a.id=m.adresse_id WHERE m.verbindung_id=?`, [day, day, source.direkt_id]) : [];
  const byHp = new Map(mappings.map(m => [m.hp_nummer, m]));
  const emails = new Map();
  for (const u of input.users) if (u.email) emails.set(u.email, (emails.get(u.email) || 0) + 1);
  const rows = input.users.map(u => {
    const hinweise = [], adressen = [], adressnamen = [];
    if (!u.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) hinweise.push('Nutzbare E-Mail-Adresse fehlt');
    if (emails.get(u.email) > 1) hinweise.push('E-Mail wird von mehreren Konten verwendet; keine automatische Zusammenführung');
    if (!u.persons.length) hinweise.push('Keine Person zugeordnet');
    if (!source.direkt_id) hinweise.push('Direkte HP-Adressquelle noch nicht verbunden');
    const hpSeen = new Set();
    for (const p of u.persons) {
      if (!p.id || !p.hp_id || hpSeen.has(p.hp_id)) { hinweise.push('Personenbezug fehlt oder ist nicht eindeutig'); continue; }
      hpSeen.add(p.hp_id);
      const m = byHp.get(p.hp_id);
      if (!m) hinweise.push('HP-Adresse ' + p.hp_id + ' ist noch nicht zugeordnet');
      else {
        adressen.push({ hp_nummer: p.hp_id, adresse_id: m.adresse_id });
        if (m.adressname && !/^Adresse ohne (?:Name|Namen)$/i.test(m.adressname)) adressnamen.push(m.adressname);
        if (m.archiviert || !m.aktuell) hinweise.push('HP-Adresse ' + p.hp_id + ': keine aktuelle Eigentümer-/Mieterfunktion');
      }
    }
    const namen = [...new Set(adressnamen)];
    const name = u.name || (namen.slice(0,3).join(' / ') + (namen.length > 3 ? ' +' + (namen.length - 3) + ' weitere' : '')).slice(0,500);
    if (!name) hinweise.push('Name fehlt');
    return { ...u, name, status: hinweise.length ? 'pruefen' : 'vorbereitet', hinweise: [...new Set(hinweise)], adressen };
  });
  const digest = hash({ quelle: source.id, firma: source.firma_id, day, rows, intern: input.intern });
  return { quelle: source.id, portal: source.subdomain, pruefwert: digest, freigeschaltet: 0,
    summen: { erfasst: input.gesamt, intern_ausgeschlossen: input.intern, kunden: rows.length,
      vorbereitet: rows.filter(r => r.status === 'vorbereitet').length, pruefen: rows.filter(r => r.status === 'pruefen').length },
    konten: rows };
}

function baue(db) {
  return {
    quellen: owner => require('./kundenFirmen').quellen(db, owner),
    async vorschau(owner, sourceId, data) {
      const p = await plan(db, owner, sourceId, data);
      return { ...p, konten: p.konten.slice(0, 100), vorschau_begrenzt: p.konten.length > 100 };
    },
    async uebernehmen(owner, sourceId, data, digest) {
      return db.transaktion(async tx => {
        const p = await plan(tx, owner, sourceId, data);
        if (typeof digest !== 'string' || digest !== p.pruefwert) fail('Export oder Zuordnungen wurden geändert. Bitte die Vorschau erneut prüfen.', 409);
        const result = { neu: 0, aktualisiert: 0, unveraendert: 0, nicht_mehr_in_quelle: 0, freigeschaltet: 0, summen: p.summen };
        const seen = new Set();
        for (const u of p.konten) {
          seen.add(u.externe_id);
          const fingerprint = hash(u);
          const old = await tx.get('SELECT id,status,fingerprint FROM kunden_konten WHERE quelle_id=? AND externe_id=?', [sourceId, u.externe_id]);
          if (old?.fingerprint === fingerprint) { result.unveraendert++; continue; }
          const status = old?.status === 'gesperrt' ? 'gesperrt' : u.status;
          let id = old?.id;
          const values = [u.name, u.email, status, JSON.stringify(u.hinweise), JSON.stringify(u.persons), fingerprint];
          if (id) {
            await tx.run('UPDATE kunden_konten SET name=?,email=?,status=?,hinweise=?,personen=?,fingerprint=?,revision=revision+1,geaendert_am=CURRENT_TIMESTAMP WHERE id=?', [...values, id]);
            result.aktualisiert++;
          } else {
            id = (await tx.run('INSERT INTO kunden_konten(name,email,status,hinweise,personen,fingerprint,quelle_id,externe_id) VALUES(?,?,?,?,?,?,?,?)', [...values, sourceId, u.externe_id])).lastID;
            result.neu++;
          }
          await tx.run('DELETE FROM kunden_konto_adressen WHERE konto_id=?', [id]);
          for (const a of u.adressen) await tx.run('INSERT INTO kunden_konto_adressen(konto_id,adresse_id,hp_nummer) VALUES(?,?,?)', [id, a.adresse_id, a.hp_nummer]);
        }
        for (const old of await tx.all('SELECT id,externe_id,status FROM kunden_konten WHERE quelle_id=?', [sourceId])) {
          if (!seen.has(old.externe_id) && old.status !== 'gesperrt') {
            await tx.run("UPDATE kunden_konten SET status='gesperrt',hinweise=?,fingerprint='',revision=revision+1,geaendert_am=CURRENT_TIMESTAMP WHERE id=?", [JSON.stringify(['Im vollständigen HP-Export nicht mehr als Kundenkonto enthalten']), old.id]);
            result.nicht_mehr_in_quelle++;
          }
        }
        return result;
      });
    },
    async liste(owner, sourceId, { seite = 1, suche = '' } = {}) {
      await quelle(db, owner, sourceId);
      if (!Number.isSafeInteger(seite) || seite < 1 || typeof suche !== 'string' || suche.length > 200) fail('Ungültige Kundensuche.');
      const term = '%' + suche + '%';
      const query = [sourceId, term, term, term, term];
      const filter = 'quelle_id=? AND (name LIKE ? OR COALESCE(email,\'\') LIKE ? OR externe_id LIKE ? OR EXISTS(SELECT 1 FROM kunden_konto_adressen a WHERE a.konto_id=kunden_konten.id AND CAST(a.hp_nummer AS TEXT) LIKE ?))';
      const { gesamt } = await db.get('SELECT COUNT(*) AS gesamt FROM kunden_konten WHERE ' + filter, query);
      const rows = await db.all('SELECT id,externe_id,name,email,status,hinweise,revision,(SELECT aktiviert_ms FROM kunden_zugaenge z WHERE z.konto_id=kunden_konten.id AND z.revision=kunden_konten.revision) AS aktiviert_ms,(SELECT group_concat(hp_nummer,\', \') FROM kunden_konto_adressen a WHERE a.konto_id=kunden_konten.id) AS adressnummern FROM kunden_konten WHERE ' + filter + ' ORDER BY name COLLATE NOCASE,id LIMIT 100 OFFSET ?', [...query, (seite - 1) * 100]);
      const {n:aktivierte_konten}=await db.get("SELECT COUNT(*) AS n FROM kunden_zugaenge z JOIN kunden_konten k ON k.id=z.konto_id WHERE k.quelle_id=? AND k.status='vorbereitet' AND z.revision=k.revision",[sourceId]);
      return { gesamt, seite, aktivierte_konten, konten: rows.map(r => ({ ...r, hinweise: JSON.parse(r.hinweise) })) };
    },
  };
}
module.exports = { baue, normalisieren };
