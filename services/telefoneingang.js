'use strict';

const V = require('../lib/validation');
const K = require('./kontakte');
const { anzeigename } = require('./adressen');

// Maske „Telefoneingang erfassen" (HausPerfekt Strg+E): ein eingehender Anruf
// wird als Kontakt (art = anruf, richtung = eingehend, eingang = 1) gespeichert.
// Optional: Eintrag ins Z.I.S., Wiedervorlage „Rückruf" für den Sachbearbeiter,
// Minuten aus der Gesprächsdauer für die Zeiterfassung.

const heute = () => K.jetzt().slice(0, 10);

async function adresse(db, id, feld, pflicht) {
  if (!id) {
    if (pflicht) throw new V.ValidationError(`Bitte „${feld}" auswählen.`);
    return null;
  }
  const a = await db.get('SELECT * FROM adressen WHERE id = ?', [Number(id)]);
  if (!a) throw new V.ValidationError(`${feld} nicht gefunden.`, 404);
  return a;
}

/** Herkunft der Bemerkung (Plaud). Eine Audio-Aufnahme setzt die Zustimmung des Gesprächspartners voraus. */
function aufnahme(data) {
  const art = V.str(data.aufnahme) ? V.oneOf(data.aufnahme, ['audio', 'text'], 'Aufnahme') : null;
  const zustimmung = V.bool(data.aufnahme_zustimmung);
  if (art === 'audio' && !zustimmung) throw new V.ValidationError('Für eine Gesprächsaufnahme muss die Zustimmung des Gesprächspartners bestätigt sein (§ 201 StGB).');
  return { aufnahme: art, aufnahme_zustimmung: art === 'audio' ? zustimmung : 0 };
}

async function werte(db, data) {
  const a = await adresse(db, data.adresse_id, 'Adresse / Firma', true);
  const anrufer = await adresse(db, data.anrufer_adresse_id, 'Anrufer', false);
  const bemerkung = V.str(data.bemerkung, 4000);
  const ersteZeile = bemerkung ? bemerkung.split('\n').find((z) => z.trim()) || '' : '';
  const pfkt = V.str(data.pfkt_code, 3);
  const pfktCode = pfkt ? pfkt.toUpperCase() : null;
  if (pfktCode && !(await db.get('SELECT code FROM pfkt_codes WHERE code = ?', [pfktCode]))) {
    throw new V.ValidationError(`Personenfunktion ${pfktCode} gibt es nicht.`);
  }
  const min = V.num(data.minuten);
  if (min !== null && (!Number.isInteger(min) || min < 0 || min > 1440)) throw new V.ValidationError('Minuten: ganze Zahl zwischen 0 und 1440.');
  const { objektId, einheitId } = await K.bezugAufloesen(db, data);
  return {
    a,
    adresse_id: a.id,
    anrufer_adresse_id: anrufer ? anrufer.id : null,
    anrufer_name: V.str(data.anrufer_name, 120) || (anrufer ? anzeigename(anrufer) : null),
    rueckruf_tel: V.str(data.rueckruf_tel, 60),
    notiz: bemerkung,
    betreff: (ersteZeile.trim().slice(0, 200)) || 'Telefoneingang',
    pfkt_code: pfktCode,
    objekt_id: objektId,
    einheit_id: einheitId,
    erledigt: V.bool(data.erledigt),
    rueckruf_sb_id: await K.benutzerPruefen(db, data.rueckruf_sb_id ? Number(data.rueckruf_sb_id) : null),
    team: V.str(data.team, 60),
    zeitpunkt: K.zeitpunkt(data.zeitpunkt, 'Datum/Zeit') || K.jetzt(),
    minuten: min,
    zis: V.bool(data.zis),
    ...aufnahme(data),
  };
}

const FELDER = ['adresse_id', 'anrufer_adresse_id', 'anrufer_name', 'rueckruf_tel', 'notiz', 'betreff', 'pfkt_code', 'objekt_id',
  'einheit_id', 'erledigt', 'rueckruf_sb_id', 'team', 'zeitpunkt', 'minuten', 'zis', 'aufnahme', 'aufnahme_zustimmung'];

async function holen(db, id) {
  const k = await db.get(`${K.KONTAKT_SELECT} WHERE k.id = ?`, [id]);
  if (!k) throw new V.ValidationError('Telefoneingang nicht gefunden.', 404);
  const ticket=await db.get('SELECT id,status FROM tickets WHERE kontakt_id=?',[k.id]);
  return {...k,ticket:ticket?{...ticket,nummer:require('./tickets').nummer(ticket.id)}:null};
}

async function anlegen(db, data, benutzerId) {
  const id = await db.transaktion(async (tx) => {
    const w = await werte(tx, data);
    const r = await tx.run(
      `INSERT INTO kontakte (art, richtung, eingang, erfasst_von, ${FELDER.join(', ')}) VALUES ('anruf', 'eingehend', 1, ?${',?'.repeat(FELDER.length)})`,
      [benutzerId || null, ...FELDER.map((f) => w[f])]
    );
    if (V.bool(data.wiedervorlage) && !w.erledigt) {
      const wer = w.anrufer_name || anzeigename(w.a);
      await tx.run(
        `INSERT INTO wiedervorlagen (adresse_id, faellig_am, betreff, notiz, zustaendig_id, quelle, erstellt_von)
         VALUES (?,?,?,?,?, 'telefon', ?)`,
        [w.adresse_id, heute(), `Rückruf: ${wer}`.slice(0, 200),
          [w.rueckruf_tel ? 'Tel. ' + w.rueckruf_tel : null, w.notiz].filter(Boolean).join('\n') || null,
          w.rueckruf_sb_id || benutzerId || null, benutzerId || null]
      );
    }
    await require('./tickets').syncTelefon(tx,{...w,id:r.lastID,erfasst_von:benutzerId},benutzerId);
    return r.lastID;
  });
  return holen(db, id);
}

async function aktualisieren(db, id, data, benutzerId) {
  await db.transaktion(async tx=>{
    const vorh=await tx.get('SELECT * FROM kontakte WHERE id=? AND eingang=1',[id]);
    if(!vorh)throw new V.ValidationError('Telefoneingang nicht gefunden.',404);
    const w=await werte(tx,{...data,zeitpunkt:data.zeitpunkt||vorh.zeitpunkt});
    await tx.run('UPDATE kontakte SET '+FELDER.map(f=>f+'=?').join(', ')+' WHERE id=?',[...FELDER.map(f=>w[f]),id]);
    await require('./tickets').syncTelefon(tx,{...w,id:Number(id),erfasst_von:vorh.erfasst_von},benutzerId||vorh.erfasst_von,vorh);
  });
  return holen(db,id);
}

/** Offene Rückrufe (nicht erledigt) – eigene bzw. alle. */
async function offen(db, { benutzerId } = {}) {
  return db.all(
    `SELECT q.*, a.nummer AS adresse_nummer, COALESCE(a.firmenname, TRIM(COALESCE(a.vorname,'') || ' ' || COALESCE(a.nachname,''))) AS adresse_name
     FROM (${K.KONTAKT_SELECT} WHERE k.eingang = 1 AND k.erledigt = 0 ${benutzerId ? 'AND (k.rueckruf_sb_id = ? OR k.rueckruf_sb_id IS NULL)' : ''}) q
     JOIN adressen a ON a.id = q.adresse_id ORDER BY q.zeitpunkt`,
    benutzerId ? [benutzerId] : []
  );
}

module.exports = { holen, anlegen, aktualisieren, offen };
