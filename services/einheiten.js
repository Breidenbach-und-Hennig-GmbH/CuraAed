'use strict';

const V = require('../lib/validation');
const N = require('../lib/nummern');

async function listeNachObjekt(db, objektId, opts = {}) {
  const where = ['e.objekt_id = ?'];
  const params = [objektId];
  if (!opts.mitArchiv) where.push('e.archiviert = 0');
  const suche = V.str(opts.suche);
  if (suche) {
    where.push('(e.bezeichnung LIKE ? OR e.lage LIKE ? OR e.nummer LIKE ?)');
    params.push(`%${suche}%`, `%${suche}%`, `%${suche}%`);
  }
  return require('../lib/meaAnzeige').ergaenzen(db,await db.all(
    `SELECT e.* FROM einheiten e WHERE ${where.join(' AND ')}
     ORDER BY e.nummer COLLATE NOCASE, e.bezeichnung COLLATE NOCASE`,
    params
  ));
}

/** Globale Suche über alle Einheiten (für „Wohnung"-Suche). */
async function suche(db, opts = {}) {
  const where = [];
  const params = [];
  where.push(opts.mitArchiv ? '1=1' : 'e.archiviert = 0 AND o.archiviert = 0');
  const s = V.str(opts.suche, 200);
  if (s) {
    const like = `%${s}%`;
    where.push('(e.nummer LIKE ? OR e.bezeichnung LIKE ? OR e.lage LIKE ? OR o.nummer LIKE ? OR o.bezeichnung LIKE ? OR o.strasse LIKE ?)');
    params.push(like, like, like, like, like, like);
  }
  if (opts.einheitstyp) {
    where.push('e.einheitstyp = ?');
    params.push(V.oneOf(opts.einheitstyp, V.EINHEITSTYPEN, 'Einheitstyp'));
  }
  return require('../lib/meaAnzeige').ergaenzen(db,await db.all(
    `SELECT e.*, o.nummer AS objekt_nummer, o.bezeichnung AS objekt_bezeichnung, o.ort AS objekt_ort
     FROM einheiten e JOIN objekte o ON o.id = e.objekt_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.nummer COLLATE NOCASE LIMIT 500`,
    params
  ));
}

async function holen(db, id) {
  const row=await db.get('SELECT * FROM einheiten WHERE id = ?', [id]);
  return row?(await require('../lib/meaAnzeige').ergaenzen(db,[row]))[0]:row;
}

async function anlegen(db, objektId, data) {
  const objekt = await db.get('SELECT id FROM objekte WHERE id = ?', [objektId]);
  if (!objekt) throw new V.ValidationError('Objekt nicht gefunden.', 404);
  const bezeichnung = V.requireStr(data.bezeichnung, 'Bezeichnung');
  const einheitstyp = V.oneOf(data.einheitstyp, V.EINHEITSTYPEN, 'Einheitstyp', 'wohnung');
  const id = await N.einfuegenMitNummer({
    feld: 'Einheit-Nr.',
    manuell: N.pruefeNummer(data.nummer, 'Einheit-Nr.'),
    naechste: () => N.naechsteEinheitNr(db, objektId),
    einfuegen: async (nummer) =>
      (await db.run(
        `INSERT INTO einheiten (objekt_id, nummer, bezeichnung, einheitstyp, lage, flaeche_qm, zimmer, mea, notizen)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          objektId,
          nummer,
          bezeichnung,
          einheitstyp,
          V.str(data.lage),
          V.num(data.flaeche_qm),
          V.num(data.zimmer),
          V.str(data.mea),
          V.str(data.notizen),
        ]
      )).lastID,
  });
  return holen(db, id);
}

async function aktualisieren(db, id, data) {
  const vorhanden = await holen(db, id);
  if (!vorhanden) throw new V.ValidationError('Einheit nicht gefunden.', 404);
  const bezeichnung = V.requireStr(data.bezeichnung, 'Bezeichnung');
  const einheitstyp = V.oneOf(data.einheitstyp, V.EINHEITSTYPEN, 'Einheitstyp', vorhanden.einheitstyp);
  const nummer = N.pruefeNummer(data.nummer, 'Einheit-Nr.') || vorhanden.nummer;
  await N.aktualisierenMitNummer(
    () =>
      db.run(
        `UPDATE einheiten SET nummer=?, bezeichnung=?, einheitstyp=?, lage=?, flaeche_qm=?, zimmer=?, mea=?,
           notizen=?, geaendert_am=datetime('now') WHERE id=?`,
        [
          nummer,
          bezeichnung,
          einheitstyp,
          V.str(data.lage),
          V.num(data.flaeche_qm),
          V.num(data.zimmer),
          V.str(data.mea),
          V.str(data.notizen),
          id,
        ]
      ),
    nummer,
    'Einheit-Nr.'
  );
  return holen(db, id);
}

async function setzeArchiviert(db, id, archiviert) {
  const vorhanden = await holen(db, id);
  if (!vorhanden) throw new V.ValidationError('Einheit nicht gefunden.', 404);
  await db.run(
    "UPDATE einheiten SET archiviert=?, geaendert_am=datetime('now') WHERE id=?",
    [V.bool(archiviert), id]
  );
  return holen(db, id);
}

module.exports = { suche, listeNachObjekt, holen, anlegen, aktualisieren, setzeArchiviert };
