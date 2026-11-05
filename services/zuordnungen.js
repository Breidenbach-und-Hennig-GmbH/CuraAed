'use strict';

const V = require('../lib/validation');
const { anzeigename } = require('./adressen');

/** HausPerfekt-Code der Personenfunktion prüfen (muss zur Rolle passen). */
async function pfktCodePruefen(db, code, rolle) {
  const c = V.str(code, 3) ? V.str(code, 3).toUpperCase() : null;
  if (!c) return null;
  if (!/^[0-9A-Z$]{1,3}$/.test(c)) throw new V.ValidationError('Ungültiger Personenfunktions-Code (z. B. 002).');
  const eintrag = await db.get('SELECT * FROM pfkt_codes WHERE code = ?', [c]);
  if (!eintrag) throw new V.ValidationError(`Den Personenfunktions-Code ${c} gibt es nicht – bitte unter Einstellungen › Personenfunktionen anlegen.`);
  if (eintrag.rolle !== rolle) throw new V.ValidationError(`Code ${c} (${eintrag.bezeichnung}) passt nicht zur gewählten Funktion.`);
  return c;
}

/**
 * Prüft, ob eine Zuordnung zu einem Stichtag aktiv ist.
 * Offene Grenzen (null) gelten als unbegrenzt.
 */
function istAktiv(z, stichtag) {
  const von = z.gueltig_von;
  const bis = z.gueltig_bis;
  if (von && stichtag < von) return false;
  if (bis && stichtag > bis) return false;
  return true;
}

function anreichern(rows, stichtag) {
  return rows.map((r) => ({
    ...r,
    anzeigename: anzeigename(r),
    aktiv: istAktiv(r, stichtag),
  }));
}

/** Heutiges Datum als ISO (ohne Date.now – für Testbarkeit optional übergeben). */
function heute(stichtag) {
  return stichtag || new Date().toISOString().slice(0, 10);
}

async function anlegen(db, data) {
  const adresse = await db.get('SELECT id FROM adressen WHERE id = ?', [data.adresse_id]);
  if (!adresse) throw new V.ValidationError('Adresse nicht gefunden.', 404);

  const objektId = data.objekt_id ? Number(data.objekt_id) : null;
  const einheitId = data.einheit_id ? Number(data.einheit_id) : null;
  if (!objektId && !einheitId) {
    throw new V.ValidationError('Zuordnung muss sich auf ein Objekt oder eine Einheit beziehen.');
  }
  if (objektId) {
    const o = await db.get('SELECT id FROM objekte WHERE id = ?', [objektId]);
    if (!o) throw new V.ValidationError('Objekt nicht gefunden.', 404);
  }
  let effObjektId = objektId;
  if (einheitId) {
    const e = await db.get('SELECT id, objekt_id FROM einheiten WHERE id = ?', [einheitId]);
    if (!e) throw new V.ValidationError('Einheit nicht gefunden.', 404);
    // Objektbezug automatisch aus der Einheit ableiten, wenn nicht gesetzt.
    if (!effObjektId) effObjektId = e.objekt_id;
  }

  const rolle = V.oneOf(data.rolle, V.ROLLEN, 'Rolle');
  const von = V.isoDate(data.gueltig_von, 'Gültig von');
  const bis = V.isoDate(data.gueltig_bis, 'Gültig bis');
  if (von && bis && bis < von) {
    throw new V.ValidationError('"Gültig bis" darf nicht vor "Gültig von" liegen.');
  }

  const pfktCode = await pfktCodePruefen(db, data.pfkt_code, rolle);
  const r = await db.run(
    `INSERT INTO rollen_zuordnungen (adresse_id, objekt_id, einheit_id, rolle, gueltig_von, gueltig_bis, anteil, notizen, pfkt_code)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      data.adresse_id,
      effObjektId,
      einheitId,
      rolle,
      von,
      bis,
      V.str(data.anteil),
      V.str(data.notizen),
      pfktCode,
    ]
  );
  return db.get('SELECT * FROM rollen_zuordnungen WHERE id = ?', [r.lastID]);
}

async function aktualisieren(db, id, data) {
  const z = await db.get('SELECT * FROM rollen_zuordnungen WHERE id = ?', [id]);
  if (!z) throw new V.ValidationError('Zuordnung nicht gefunden.', 404);
  const rolle = V.oneOf(data.rolle, V.ROLLEN, 'Rolle', z.rolle);
  const von = V.isoDate(data.gueltig_von, 'Gültig von');
  const bis = V.isoDate(data.gueltig_bis, 'Gültig bis');
  if (von && bis && bis < von) {
    throw new V.ValidationError('"Gültig bis" darf nicht vor "Gültig von" liegen.');
  }
  const pfktCode = data.pfkt_code === undefined ? z.pfkt_code : await pfktCodePruefen(db, data.pfkt_code, rolle);
  await db.run(
    `UPDATE rollen_zuordnungen SET rolle=?, gueltig_von=?, gueltig_bis=?, anteil=?, notizen=?, pfkt_code=? WHERE id=?`,
    [rolle, von, bis, V.str(data.anteil), V.str(data.notizen), pfktCode, id]
  );
  return db.get('SELECT * FROM rollen_zuordnungen WHERE id = ?', [id]);
}

/** Beendet eine Zuordnung zum Stichtag (Wechsel ohne Historienverlust). */
async function beenden(db, id, datum) {
  const z = await db.get('SELECT * FROM rollen_zuordnungen WHERE id = ?', [id]);
  if (!z) throw new V.ValidationError('Zuordnung nicht gefunden.', 404);
  const bis = V.isoDate(datum, 'Gültig bis') || heute();
  if (z.gueltig_von && bis < z.gueltig_von) {
    throw new V.ValidationError('Enddatum darf nicht vor dem Beginn liegen.');
  }
  await db.run('UPDATE rollen_zuordnungen SET gueltig_bis=? WHERE id=?', [bis, id]);
  return db.get('SELECT * FROM rollen_zuordnungen WHERE id = ?', [id]);
}

async function loeschen(db, id) {
  const z = await db.get('SELECT id FROM rollen_zuordnungen WHERE id = ?', [id]);
  if (!z) throw new V.ValidationError('Zuordnung nicht gefunden.', 404);
  if (await db.get('SELECT 1 FROM personenkonten WHERE zuordnung_id = ?', [id])) {
    throw new V.ValidationError('Zu dieser Personenfunktion gibt es ein Personenkonto – bitte „Beenden" statt Löschen verwenden.', 409);
  }
  await db.run('DELETE FROM rollen_zuordnungen WHERE id = ?', [id]);
  return { geloescht: true };
}

const SELECT_MIT_ADRESSE = `
  SELECT z.*, a.nummer AS adresse_nummer, a.adresstyp, a.anrede, a.vorname, a.nachname, a.firmenname,
         a.email, a.telefon, a.mobil, pc.bezeichnung AS pfkt_bezeichnung
  FROM rollen_zuordnungen z
  JOIN adressen a ON a.id = z.adresse_id
  LEFT JOIN pfkt_codes pc ON pc.code = z.pfkt_code`;

/** Alle Zuordnungen eines Objekts (inkl. Einheiten-Zuordnungen optional). */
async function nachObjekt(db, objektId, opts = {}) {
  const rows = await db.all(
    `SELECT q.*, e.nummer AS einheit_nummer, e.bezeichnung AS einheit_bezeichnung
     FROM (${SELECT_MIT_ADRESSE} WHERE z.objekt_id = ?) q
     LEFT JOIN einheiten e ON e.id = q.einheit_id
     ORDER BY q.rolle, q.gueltig_bis IS NULL DESC, q.gueltig_von DESC`,
    [objektId]
  );
  return anreichern(rows, heute(opts.stichtag));
}

async function nachEinheit(db, einheitId, opts = {}) {
  const rows = await db.all(
    `${SELECT_MIT_ADRESSE} WHERE z.einheit_id = ?
     ORDER BY z.rolle, z.gueltig_bis IS NULL DESC, z.gueltig_von DESC`,
    [einheitId]
  );
  return anreichern(rows, heute(opts.stichtag));
}

/** Alle Zuordnungen (Rollen) einer Adresse – zeigt Mehrfachrollen. */
async function nachAdresse(db, adresseId, opts = {}) {
  const rows = await db.all(
    `SELECT z.*, o.nummer AS objekt_nummer, o.bezeichnung AS objekt_bezeichnung,
            o.strasse AS objekt_strasse, o.plz AS objekt_plz, o.ort AS objekt_ort,
            e.nummer AS einheit_nummer, e.bezeichnung AS einheit_bezeichnung, pc.bezeichnung AS pfkt_bezeichnung
     FROM rollen_zuordnungen z
     LEFT JOIN pfkt_codes pc ON pc.code = z.pfkt_code
     LEFT JOIN objekte o ON o.id = z.objekt_id
     LEFT JOIN einheiten e ON e.id = z.einheit_id
     WHERE z.adresse_id = ?
     ORDER BY z.gueltig_bis IS NULL DESC, z.gueltig_von DESC`,
    [adresseId]
  );
  return rows.map((r) => ({ ...r, aktiv: istAktiv(r, heute(opts.stichtag)) }));
}

module.exports = {
  pfktCodePruefen,
  istAktiv,
  anlegen,
  aktualisieren,
  beenden,
  loeschen,
  nachObjekt,
  nachEinheit,
  nachAdresse,
};
