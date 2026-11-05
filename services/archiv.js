'use strict';

const V = require('../lib/validation');
const N = require('../lib/nummern');
const { anzeigename } = require('./adressen');

// Zentrales Archiv: Einträge (Dokumente) werden über Objekt-, Einheit- und
// Adress-Nummern beliebig vielen Datensätzen zugeordnet.

const TYPEN = {
  objekt: { spalte: 'objekt_id', tabelle: 'objekte', feld: 'Objekt-Nr.' },
  einheit: { spalte: 'einheit_id', tabelle: 'einheiten', feld: 'Einheit-Nr.' },
  adresse: { spalte: 'adresse_id', tabelle: 'adressen', feld: 'Adress-Nr.' },
};
const MAX_TREFFER = 500;

function typInfo(typ) {
  const t = TYPEN[typ];
  if (!t) throw new V.ValidationError('Ungültiger Zuordnungstyp (erlaubt: objekt, einheit, adresse).');
  return t;
}

/** Löst Nummern eines Typs auf → [{nummer, gefunden, id, label}]. */
async function nummernAufloesen(db, typ, nummern) {
  const t = typInfo(typ);
  const ergebnis = [];
  for (const nummer of nummern) {
    let row;
    if (typ === 'einheit') {
      row = await db.get(
        `SELECT e.id, e.nummer, e.bezeichnung, o.bezeichnung AS objekt_bezeichnung
         FROM einheiten e JOIN objekte o ON o.id = e.objekt_id WHERE e.nummer = ? COLLATE NOCASE`,
        [nummer]
      );
    } else {
      row = await db.get(`SELECT * FROM ${t.tabelle} WHERE nummer = ? COLLATE NOCASE`, [nummer]);
    }
    if (!row) {
      ergebnis.push({ nummer, gefunden: false });
      continue;
    }
    let label;
    if (typ === 'objekt') label = row.bezeichnung;
    else if (typ === 'einheit') label = `${row.bezeichnung} – ${row.objekt_bezeichnung}`;
    else label = anzeigename(row);
    ergebnis.push({ nummer: row.nummer, gefunden: true, id: row.id, label });
  }
  return ergebnis;
}

/** Wie nummernAufloesen, wirft aber bei unbekannten Nummern. */
async function nummernPflicht(db, typ, nummern) {
  const res = await nummernAufloesen(db, typ, nummern);
  const fehlend = res.filter((r) => !r.gefunden).map((r) => r.nummer);
  if (fehlend.length) {
    throw new V.ValidationError(`${typInfo(typ).feld} nicht gefunden: ${fehlend.join(', ')}`);
  }
  return res;
}

/** Lädt die Zuordnungen für mehrere Dokumente → Map dokument_id → [...] */
async function verknuepfungenFuer(db, ids) {
  const map = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const rows = await db.all(
    `SELECT v.id, v.dokument_id, v.objekt_id, v.einheit_id, v.adresse_id,
            o.nummer AS o_nr, o.bezeichnung AS o_bez,
            e.nummer AS e_nr, e.bezeichnung AS e_bez, eo.bezeichnung AS e_obj,
            a.nummer AS a_nr, a.adresstyp, a.vorname, a.nachname, a.firmenname
     FROM archiv_verknuepfungen v
     LEFT JOIN objekte o ON o.id = v.objekt_id
     LEFT JOIN einheiten e ON e.id = v.einheit_id
     LEFT JOIN objekte eo ON eo.id = e.objekt_id
     LEFT JOIN adressen a ON a.id = v.adresse_id
     WHERE v.dokument_id IN (${ids.map(() => '?').join(',')})
     ORDER BY v.objekt_id IS NULL, v.einheit_id IS NULL, v.id`,
    ids
  );
  for (const r of rows) {
    let eintrag;
    if (r.objekt_id) eintrag = { typ: 'objekt', ziel_id: r.objekt_id, nummer: r.o_nr, label: r.o_bez };
    else if (r.einheit_id) eintrag = { typ: 'einheit', ziel_id: r.einheit_id, nummer: r.e_nr, label: `${r.e_bez} – ${r.e_obj}` };
    else eintrag = { typ: 'adresse', ziel_id: r.adresse_id, nummer: r.a_nr, label: anzeigename(r) };
    map.get(r.dokument_id).push({ id: r.id, ...eintrag });
  }
  return map;
}

/**
 * Suche im Archiv. opts: { suche, kategorie, objektId, einheitId, adresseId, ohneZuordnung }
 * Objekt-Filter schließt Einträge seiner Einheiten ein.
 */
async function liste(db, opts = {}) {
  const where = [];
  const params = [];
  if (opts.objektId) {
    where.push(`d.id IN (SELECT dokument_id FROM archiv_verknuepfungen
                WHERE objekt_id = ? OR einheit_id IN (SELECT id FROM einheiten WHERE objekt_id = ?))`);
    params.push(opts.objektId, opts.objektId);
  }
  if (opts.einheitId) {
    where.push('d.id IN (SELECT dokument_id FROM archiv_verknuepfungen WHERE einheit_id = ?)');
    params.push(opts.einheitId);
  }
  if (opts.adresseId) {
    where.push('d.id IN (SELECT dokument_id FROM archiv_verknuepfungen WHERE adresse_id = ?)');
    params.push(opts.adresseId);
  }
  if (opts.ohneZuordnung) {
    where.push('NOT EXISTS (SELECT 1 FROM archiv_verknuepfungen v WHERE v.dokument_id = d.id)');
  }
  if (opts.kategorie) {
    where.push('d.kategorie = ?');
    params.push(V.oneOf(opts.kategorie, V.DOK_KATEGORIEN, 'Kategorie'));
  }
  const suche = V.str(opts.suche, 200);
  if (suche) {
    const like = `%${suche}%`;
    // Volltext über Titel/Beschreibung/Dateiname sowie Nummern und Namen der Zuordnungen.
    where.push(`(d.titel LIKE ? OR d.beschreibung LIKE ? OR d.original_name LIKE ?
      OR d.id IN (SELECT v.dokument_id FROM archiv_verknuepfungen v
        LEFT JOIN objekte o ON o.id = v.objekt_id
        LEFT JOIN einheiten e ON e.id = v.einheit_id
        LEFT JOIN adressen a ON a.id = v.adresse_id
        WHERE o.nummer LIKE ? OR o.bezeichnung LIKE ? OR e.nummer LIKE ? OR e.bezeichnung LIKE ?
           OR a.nummer LIKE ? OR a.vorname LIKE ? OR a.nachname LIKE ? OR a.firmenname LIKE ?))`);
    params.push(like, like, like, like, like, like, like, like, like, like, like);
  }
  const rows = await db.all(
    `SELECT d.*, b.name AS hochgeladen_von_name
     FROM dokumente d
     LEFT JOIN benutzer b ON b.id = d.hochgeladen_von
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY COALESCE(d.dokument_datum, date(d.erstellt_am)) DESC, d.id DESC
     LIMIT ${MAX_TREFFER + 1}`,
    params
  );
  const mehr = rows.length > MAX_TREFFER;
  const eintraege = rows.slice(0, MAX_TREFFER);
  const map = await verknuepfungenFuer(db, eintraege.map((d) => d.id));
  return {
    eintraege: eintraege.map((d) => ({ ...d, verknuepfungen: map.get(d.id) })),
    mehr,
  };
}

async function holen(db, id) {
  const d = await db.get('SELECT * FROM dokumente WHERE id = ?', [id]);
  if (!d) return undefined;
  const map = await verknuepfungenFuer(db, [d.id]);
  return { ...d, verknuepfungen: map.get(d.id) };
}

function metaWerte(data, vorher = {}) {
  return {
    titel: V.requireStr(V.str(data.titel, 200), 'Titel'),
    kategorie: V.oneOf(data.kategorie, V.DOK_KATEGORIEN, 'Kategorie', vorher.kategorie || 'sonstiges'),
    beschreibung: V.str(data.beschreibung, 4000),
    dokument_datum: V.isoDate(data.dokument_datum, 'Dokumentdatum'),
  };
}

/**
 * Legt einen Archiv-Eintrag an. Die Datei liegt bereits auf der Platte.
 * nummern: { objekt: '1001, 1002', einheit: '...', adresse: '...' } (Freitext)
 * Unbekannte Nummern → 400, es wird nichts gespeichert.
 */
async function anlegen(db, data, nummern = {}) {
  const meta = metaWerte(data);
  const ziele = [];
  for (const typ of Object.keys(TYPEN)) {
    const liste = N.nummernListe(nummern[typ], TYPEN[typ].feld);
    for (const r of await nummernPflicht(db, typ, liste)) ziele.push({ typ, id: r.id });
  }
  const id = await db.transaktion(async (tx) => {
    const r = await tx.run(
      `INSERT INTO dokumente (titel, kategorie, beschreibung, dokument_datum, original_name,
         speicher_name, mime_type, groesse, quelle, hochgeladen_von)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        meta.titel,
        meta.kategorie,
        meta.beschreibung,
        meta.dokument_datum,
        V.requireStr(V.str(data.original_name, 255), 'Dateiname'),
        V.requireStr(data.speicher_name, 'Speichername'),
        V.str(data.mime_type, 200),
        data.groesse != null ? Number(data.groesse) : null,
        V.str(data.quelle, 20) || 'upload',
        data.hochgeladen_von || null,
      ]
    );
    for (const z of ziele) {
      await tx.run(
        `INSERT OR IGNORE INTO archiv_verknuepfungen (dokument_id, ${TYPEN[z.typ].spalte}) VALUES (?, ?)`,
        [r.lastID, z.id]
      );
    }
    return r.lastID;
  });
  return holen(db, id);
}

async function aktualisierenMeta(db, id, data) {
  const d = await db.get('SELECT * FROM dokumente WHERE id = ?', [id]);
  if (!d) throw new V.ValidationError('Archiv-Eintrag nicht gefunden.', 404);
  const m = metaWerte(data, d);
  await db.run(
    'UPDATE dokumente SET titel=?, kategorie=?, beschreibung=?, dokument_datum=? WHERE id=?',
    [m.titel, m.kategorie, m.beschreibung, m.dokument_datum, id]
  );
  return holen(db, id);
}

/** Ordnet einen Eintrag per Nummer zu. */
async function verknuepfen(db, dokumentId, typ, nummer) {
  const t = typInfo(typ);
  const d = await db.get('SELECT id FROM dokumente WHERE id = ?', [dokumentId]);
  if (!d) throw new V.ValidationError('Archiv-Eintrag nicht gefunden.', 404);
  const nr = N.pruefeNummer(nummer, t.feld);
  if (!nr) throw new V.ValidationError(`Bitte eine ${t.feld} angeben.`);
  const [ziel] = await nummernPflicht(db, typ, [nr]);
  const r = await db.run(
    `INSERT OR IGNORE INTO archiv_verknuepfungen (dokument_id, ${t.spalte}) VALUES (?, ?)`,
    [dokumentId, ziel.id]
  );
  if (!r.changes) throw new V.ValidationError(`Bereits zugeordnet: ${t.feld} ${ziel.nummer}.`, 409);
  return holen(db, dokumentId);
}

async function verknuepfungLoeschen(db, verknuepfungId) {
  const v = await db.get('SELECT * FROM archiv_verknuepfungen WHERE id = ?', [verknuepfungId]);
  if (!v) throw new V.ValidationError('Zuordnung nicht gefunden.', 404);
  await db.run('DELETE FROM archiv_verknuepfungen WHERE id = ?', [verknuepfungId]);
  return holen(db, v.dokument_id);
}

async function loeschen(db, id) {
  const d = await db.get('SELECT * FROM dokumente WHERE id = ?', [id]);
  if (!d) throw new V.ValidationError('Archiv-Eintrag nicht gefunden.', 404);
  await db.run('DELETE FROM dokumente WHERE id = ?', [id]);
  return d; // enthält speicher_name, damit der Aufrufer die Datei entfernen kann
}

module.exports = {
  TYPEN,
  MAX_TREFFER,
  nummernAufloesen,
  liste,
  holen,
  anlegen,
  aktualisierenMeta,
  verknuepfen,
  verknuepfungLoeschen,
  loeschen,
};
