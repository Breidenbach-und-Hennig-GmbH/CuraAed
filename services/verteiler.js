'use strict';

const V = require('../lib/validation');
const { deZahl } = require('../lib/zahl');

// Verteilerschlüssel je Objekt (HausPerfekt „Vschl."): Kürzel, Bezeichnung,
// Gesamtanteil und Anteile je Einheit. Die Summe der Einheitenanteile wird
// gegen den Gesamtanteil geprüft (Hinweis, kein Fehler – z. B. bei laufender Erfassung).

const runden = (n) => Math.round(n * 1000) / 1000;

function anteilZahl(v, feld) {
  const n = V.num(deZahl(v));
  if (n === null) return null;
  if (n < 0 || n > 1e9) throw new V.ValidationError(`"${feld}" muss zwischen 0 und 1.000.000.000 liegen.`);
  return runden(n);
}

async function objektVorhanden(db, objektId) {
  if (!(await db.get('SELECT id FROM objekte WHERE id = ?', [objektId]))) throw new V.ValidationError('Objekt nicht gefunden.', 404);
}

async function jahre(db,objektId) {
  await objektVorhanden(db,objektId);
  return (await db.all('SELECT DISTINCT jahr FROM verteilerschluessel_jahre WHERE objekt_id=? ORDER BY jahr DESC',[objektId])).map(r=>r.jahr);
}
async function gewaehltesJahr(db,objektId,value) {
  if(value==='undatiert')return null;
  if(value!==undefined&&value!==null&&value!==''){
    if(!/^\d{1,4}$/.test(String(value))||Number(value)<1)throw new V.ValidationError('Ungültiges Buchungsjahr.');
    return Number(value);
  }
  const r=await db.get('SELECT MAX(jahr) AS jahr FROM verteilerschluessel_jahre WHERE objekt_id=?',[objektId]);return r.jahr??null;
}
async function liste(db, objektId,options={}) {
  await objektVorhanden(db, objektId);
  const jahr=await gewaehltesJahr(db,objektId,options.jahr);
  if(jahr!==null){const rows=await db.all(`SELECT s.*,j.bezeichnung,j.jahr,j.gesamt_dezimal,
    (SELECT COUNT(*) FROM einheit_verteilung_jahre v WHERE v.schluessel_id=s.id AND v.jahr=j.jahr) AS einheiten_anzahl
    FROM verteilerschluessel s JOIN verteilerschluessel_jahre j ON j.schluessel_id=s.id WHERE s.objekt_id=? AND j.jahr=? ORDER BY s.kuerzel`,[objektId,jahr]);
    return rows.map(r=>({...r,gesamt:r.gesamt_dezimal===null?null:Number(r.gesamt_dezimal),anteil:r.gesamt_dezimal,abweichung:false,hp_jahresstand:true}));
  }
  const rows = await db.all(
    `SELECT s.*, (SELECT COUNT(*) FROM einheit_verteilung v WHERE v.schluessel_id = s.id) AS einheiten_anzahl,
            (SELECT SUM(v.anteil) FROM einheit_verteilung v WHERE v.schluessel_id = s.id) AS summe_einheiten
     FROM verteilerschluessel s WHERE s.objekt_id = ?
     ORDER BY CASE WHEN s.kuerzel GLOB '[0-9]*' THEN 0 ELSE 1 END, CAST(s.kuerzel AS INTEGER), s.kuerzel COLLATE NOCASE`,
    [objektId]
  );
  return rows.map((r) => ({
    ...r,
    summe_einheiten: r.summe_einheiten == null ? null : runden(r.summe_einheiten),
    // Anzeige-Anteil: Gesamtanteil, sonst Summe der Einheiten
    anteil: r.gesamt != null ? r.gesamt : r.summe_einheiten == null ? null : runden(r.summe_einheiten),
    abweichung: r.gesamt != null && r.einheiten_anzahl > 0 && Math.abs(runden(r.summe_einheiten) - r.gesamt) > 0.0005,
  }));
}

async function holen(db, id,options={}) {
  const s = await db.get('SELECT * FROM verteilerschluessel WHERE id = ?', [id]);
  if (!s) return null;
  const jahr=await gewaehltesJahr(db,s.objekt_id,options.jahr);
  if(jahr!==null){const j=await db.get('SELECT * FROM verteilerschluessel_jahre WHERE schluessel_id=? AND jahr=?',[id,jahr]);if(!j)return null;
    const cursor=Number(options.nach||0);if(!Number.isSafeInteger(cursor)||cursor<0)throw new V.ValidationError('Ungültige Seitenauswahl.');
    const rows=await db.all(`SELECT e.id AS einheit_id,e.nummer,e.bezeichnung,e.lage,v.anteil_dezimal
      FROM einheiten e LEFT JOIN einheit_verteilung_jahre v ON v.einheit_id=e.id AND v.schluessel_id=? AND v.jahr=?
      WHERE e.objekt_id=? AND e.id>? ORDER BY e.id LIMIT 201`,[id,jahr,s.objekt_id,cursor]);
    const more=rows.length>200;return {...s,...j,hp_jahresstand:true,anteile:rows.slice(0,200),naechste_seite:more?rows[199].einheit_id:null};
  }
  s.anteile = await db.all(
    `SELECT e.id AS einheit_id, e.nummer, e.bezeichnung, e.lage, v.anteil
     FROM einheiten e LEFT JOIN einheit_verteilung v ON v.einheit_id = e.id AND v.schluessel_id = ?
     WHERE e.objekt_id = ? AND (e.archiviert = 0 OR v.anteil IS NOT NULL)
     ORDER BY e.nummer COLLATE NOCASE`,
    [id, s.objekt_id]
  );
  return s;
}

function werte(data) {
  const kuerzel = V.requireStr(V.str(data.kuerzel, 10), 'Schlüssel');
  if (!/^[A-Za-z0-9ÄÖÜäöü._-]+$/.test(kuerzel)) throw new V.ValidationError('Schlüssel: nur Buchstaben, Ziffern, Punkt, Binde- und Unterstrich.');
  return {
    kuerzel,
    bezeichnung: V.requireStr(V.str(data.bezeichnung, 100), 'Bezeichnung'),
    gesamt: anteilZahl(data.gesamt, 'Gesamtanteil'),
    bemerkung: V.str(data.bemerkung, 500),
  };
}

/** anteile: [{ einheit_id, anteil }] – nur Einheiten dieses Objekts; leerer Anteil = entfernen. */
async function anteileSpeichern(tx, schluessel, anteile) {
  if (!Array.isArray(anteile)) return;
  if (anteile.length > 5000) throw new V.ValidationError('Zu viele Einheiten.');
  const erlaubt = new Set((await tx.all('SELECT id FROM einheiten WHERE objekt_id = ?', [schluessel.objekt_id])).map((e) => e.id));
  for (const a of anteile) {
    const eid = Number(a && a.einheit_id);
    if (!erlaubt.has(eid)) throw new V.ValidationError('Einheit gehört nicht zu diesem Objekt.');
    const n = anteilZahl(a.anteil, 'Anteil');
    if (n === null) await tx.run('DELETE FROM einheit_verteilung WHERE schluessel_id = ? AND einheit_id = ?', [schluessel.id, eid]);
    else {
      await tx.run(
        `INSERT INTO einheit_verteilung (schluessel_id, einheit_id, anteil) VALUES (?,?,?)
         ON CONFLICT(schluessel_id, einheit_id) DO UPDATE SET anteil = excluded.anteil`,
        [schluessel.id, eid, n]
      );
    }
  }
}

function eindeutig(e) {
  if (/UNIQUE/.test(String(e && e.message))) throw new V.ValidationError('Diesen Schlüssel gibt es in diesem Objekt bereits.', 409);
  throw e;
}

async function anlegen(db, objektId, data) {
  await objektVorhanden(db, objektId);
  const w = werte(data);
  const id = await db.transaktion(async (tx) => {
    const r = await tx.run(
      'INSERT INTO verteilerschluessel (objekt_id, kuerzel, bezeichnung, gesamt, bemerkung) VALUES (?,?,?,?,?)',
      [objektId, w.kuerzel, w.bezeichnung, w.gesamt, w.bemerkung]
    ).catch(eindeutig);
    await anteileSpeichern(tx, { id: r.lastID, objekt_id: Number(objektId) }, data.anteile);
    return r.lastID;
  });
  return holen(db, id);
}

async function aktualisieren(db, id, data) {
  if(await db.get('SELECT 1 FROM hp_verteilerschluessel_zuordnung WHERE schluessel_id=?',[id]))throw new V.ValidationError('Dieser HP-Jahresstand wird durch den lesenden Import gepflegt. Bearbeitung ist noch nicht freigegeben.',409);
  const s = await db.get('SELECT * FROM verteilerschluessel WHERE id = ?', [id]);
  if (!s) throw new V.ValidationError('Verteilerschlüssel nicht gefunden.', 404);
  const w = werte(data);
  await db.transaktion(async (tx) => {
    await tx.run('UPDATE verteilerschluessel SET kuerzel=?, bezeichnung=?, gesamt=?, bemerkung=? WHERE id=?',
      [w.kuerzel, w.bezeichnung, w.gesamt, w.bemerkung, id]).catch(eindeutig);
    await anteileSpeichern(tx, s, data.anteile);
  });
  return holen(db, id);
}

async function loeschen(db, id) {
  if(await db.get('SELECT 1 FROM hp_verteilerschluessel_zuordnung WHERE schluessel_id=?',[id]))throw new V.ValidationError('Zugeordneten HP-Verteilerschlüssel nicht lokal löschen.',409);
  const r = await db.run('DELETE FROM verteilerschluessel WHERE id = ?', [id]);
  if (!r.changes) throw new V.ValidationError('Verteilerschlüssel nicht gefunden.', 404);
}

module.exports = { liste, holen, anlegen, aktualisieren, loeschen, jahre };
