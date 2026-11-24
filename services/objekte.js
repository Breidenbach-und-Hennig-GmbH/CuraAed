'use strict';

const V = require('../lib/validation');
const N = require('../lib/nummern');
const objektSortierung = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
function anzeigenummer(nummer) {
  const s = String(nummer || '');
  const hp = /^HP-[0-9a-f]{1,32}-(\d+)$/i.exec(s);
  return hp ? hp[1] : s;
}

/** Liste mit Suche/Filter. opts: { suche, objekttyp, archiviert } */
async function liste(db, opts = {}) {
  const where = [];
  const params = [];
  if (opts.archiviert === undefined || opts.archiviert === null) {
    where.push('o.archiviert = 0');
  } else {
    where.push('o.archiviert = ?');
    params.push(V.bool(opts.archiviert));
  }
  if (opts.objekttyp) {
    where.push('o.objekttyp = ?');
    params.push(opts.objekttyp);
  }
  const suche = V.str(opts.suche);
  if (suche) {
    where.push(
      '(o.bezeichnung LIKE ? OR o.strasse LIKE ? OR o.ort LIKE ? OR o.plz LIKE ? OR o.nummer LIKE ?)'
    );
    const like = `%${suche}%`;
    params.push(like, like, like, like, like);
  }
  const sql = `
    SELECT o.*,
      (SELECT COUNT(*) FROM einheiten e WHERE e.objekt_id = o.id AND e.archiviert = 0) AS einheiten_anzahl,
      (SELECT COUNT(DISTINCT v.dokument_id) FROM archiv_verknuepfungen v
        WHERE v.objekt_id = o.id
           OR v.einheit_id IN (SELECT id FROM einheiten WHERE objekt_id = o.id)) AS dokumente_anzahl
    FROM objekte o
    WHERE ${where.join(' AND ')}
    ORDER BY o.id`;
  const rows = await db.all(sql, params);
  return rows.map(o => ({ ...o, anzeigenummer: anzeigenummer(o.nummer) }))
    .sort((a, b) => objektSortierung.compare(a.anzeigenummer, b.anzeigenummer) || a.id - b.id);
}

async function holen(db, id) {
  const objekt = await db.get(
    `SELECT o.*, b.name AS sachbearbeiter_name, b.benutzername AS sachbearbeiter_kuerzel
     FROM objekte o LEFT JOIN benutzer b ON b.id = o.sachbearbeiter_id WHERE o.id = ?`,
    [id]
  );
  return objekt ? { ...objekt, anzeigenummer: anzeigenummer(objekt.nummer) } : objekt;
}

const ganzzahl = (v, feld) => {
  const n = V.num(v);
  if (n === null) return null;
  if (!Number.isInteger(n) || n < 0 || n > 9999) throw new V.ValidationError(`"${feld}" muss eine ganze Zahl zwischen 0 und 9999 sein.`);
  return n;
};

/** Alle frei editierbaren Felder (ohne Nummer) – gemeinsam für Anlegen und Ändern. */
async function felder(db, data, vorhanden = {}) {
  const sb = data.sachbearbeiter_id ? Number(data.sachbearbeiter_id) : null;
  if (sb && !(await db.get('SELECT id FROM benutzer WHERE id = ?', [sb]))) throw new V.ValidationError('Sachbearbeiter nicht gefunden.');
  const ja = (v, alt) => (v === undefined ? alt : V.bool(v));
  return {
    bezeichnung: V.requireStr(V.str(data.bezeichnung, 200), 'Bezeichnung'),
    objekttyp: V.oneOf(data.objekttyp, V.OBJEKTTYPEN, 'Objekttyp', vorhanden.objekttyp || 'WEG'),
    strasse: V.str(data.strasse, 200),
    plz: V.str(data.plz, 10),
    ort: V.str(data.ort, 100),
    land: V.str(data.land, 60) || 'Deutschland',
    baujahr: V.str(data.baujahr, 10),
    notizen: V.str(data.notizen),
    objekt_art: V.str(data.objekt_art, 100),
    buero_kst: V.str(data.buero_kst, 30),
    sachbearbeiter_id: sb,
    gruppe1: V.str(data.gruppe1, 60), gruppe2: V.str(data.gruppe2, 60), gruppe3: V.str(data.gruppe3, 60),
    gruppe4: V.str(data.gruppe4, 60), gruppe5: V.str(data.gruppe5, 60),
    heizungsart: V.str(data.heizungsart, 100),
    warmwasser: V.str(data.warmwasser, 100),
    garagenart: V.str(data.garagenart, 100),
    muellgefaesse: V.str(data.muellgefaesse, 200),
    anzahl_gebaeude: ganzzahl(data.anzahl_gebaeude, 'Gebäude'),
    anzahl_eingaenge: ganzzahl(data.anzahl_eingaenge, 'Eingänge'),
    verkauf: ja(data.verkauf, vorhanden.verkauf ?? 1),
    vermietung: ja(data.vermietung, vorhanden.vermietung ?? 1),
  };
}

async function anlegen(db, data) {
  const f = await felder(db, data);
  const spalten = Object.keys(f);
  const id = await N.einfuegenMitNummer({
    feld: 'Objekt-Nr.',
    manuell: N.pruefeNummer(data.nummer, 'Objekt-Nr.'),
    naechste: () => N.naechsteObjektNr(db),
    einfuegen: async (nummer) =>
      (await db.run(
        `INSERT INTO objekte (nummer, ${spalten.join(', ')}) VALUES (?${', ?'.repeat(spalten.length)})`,
        [nummer, ...spalten.map((k) => f[k])]
      )).lastID,
  });
  return holen(db, id);
}

async function aktualisieren(db, id, data) {
  const vorhanden = await holen(db, id);
  if (!vorhanden) throw new V.ValidationError('Objekt nicht gefunden.', 404);
  const f = await felder(db, data, vorhanden);
  // Leere Nummer beim Bearbeiten = bisherige behalten.
  const nummer = N.pruefeNummer(data.nummer, 'Objekt-Nr.') || vorhanden.nummer;
  const spalten = Object.keys(f);
  await N.aktualisierenMitNummer(
    () =>
      db.run(
        `UPDATE objekte SET nummer=?, ${spalten.map((k) => `${k}=?`).join(', ')}, geaendert_am=datetime('now') WHERE id=?`,
        [nummer, ...spalten.map((k) => f[k]), id]
      ),
    nummer,
    'Objekt-Nr.'
  );
  return holen(db, id);
}

async function setzeArchiviert(db, id, archiviert) {
  const vorhanden = await holen(db, id);
  if (!vorhanden) throw new V.ValidationError('Objekt nicht gefunden.', 404);
  await db.transaktion(async tx=>{
    const source=await tx.get('SELECT verwaltungsstatus FROM hp_objekt_zuordnung WHERE objekt_id=?',[id]);
    if(source?.verwaltungsstatus==='beendet'&&!V.bool(archiviert))throw new V.ValidationError('Das Objekt ist in HP beendet und kann hier nicht aktiviert werden.',409);
    await tx.run("UPDATE objekte SET archiviert=?, geaendert_am=datetime('now') WHERE id=?",[V.bool(archiviert),id]);
    await tx.run('UPDATE hp_import_objektstatus SET auto_archiviert=0 WHERE (verbindung_id,hp_objnr) IN (SELECT verbindung_id,hp_objnr FROM hp_objekt_zuordnung WHERE objekt_id=?)',[id]);
  });
  return holen(db, id);
}

module.exports = { liste, holen, anlegen, aktualisieren, setzeArchiviert };

/** Kennzahlen (Reiter „Kennzahlen"): Einheiten, Flächen, MEA, Personen, Archiv. */
async function kennzahlen(db, id) {
  if (!(await holen(db, id))) throw new V.ValidationError('Objekt nicht gefunden.', 404);
  const heute = new Date().toISOString().slice(0, 10);
  const einheiten = await db.all('SELECT einheitstyp, flaeche_qm, mea, zimmer FROM einheiten WHERE objekt_id = ? AND archiviert = 0', [id]);
  // MEA wird oft als „125/1000" erfasst → Zähler zählt
  const zahl = (v) => { const n = Number(String(v ?? '').split('/')[0].trim().replace(',', '.')); return Number.isFinite(n) ? n : 0; };
  const jeTyp = {};
  einheiten.forEach((e) => { jeTyp[e.einheitstyp] = (jeTyp[e.einheitstyp] || 0) + 1; });
  const rollen = await db.all(
    `SELECT z.rolle, COUNT(DISTINCT z.adresse_id) AS anzahl FROM rollen_zuordnungen z
     LEFT JOIN einheiten e ON e.id = z.einheit_id
     WHERE COALESCE(z.objekt_id, e.objekt_id) = ?
       AND (z.gueltig_von IS NULL OR z.gueltig_von <= ?) AND (z.gueltig_bis IS NULL OR z.gueltig_bis >= ?)
     GROUP BY z.rolle`,
    [id, heute, heute]
  );
  const leer = await db.get(
    `SELECT COUNT(*) AS n FROM einheiten e WHERE e.objekt_id = ? AND e.archiviert = 0 AND e.einheitstyp IN ('wohnung','gewerbe')
       AND NOT EXISTS (SELECT 1 FROM rollen_zuordnungen z WHERE z.einheit_id = e.id AND z.rolle = 'mieter'
         AND (z.gueltig_von IS NULL OR z.gueltig_von <= ?) AND (z.gueltig_bis IS NULL OR z.gueltig_bis >= ?))`,
    [id, heute, heute]
  );
  const dok = await db.get(
    `SELECT COUNT(DISTINCT v.dokument_id) AS n FROM archiv_verknuepfungen v
     WHERE v.objekt_id = ? OR v.einheit_id IN (SELECT id FROM einheiten WHERE objekt_id = ?)`,
    [id, id]
  );
  const r3 = (n) => Math.round(n * 1000) / 1000;
  return {
    einheiten: einheiten.length,
    einheiten_je_typ: jeTyp,
    flaeche_qm: r3(einheiten.reduce((s, e) => s + zahl(e.flaeche_qm), 0)),
    mea_summe: r3(einheiten.reduce((s, e) => s + zahl(e.mea), 0)),
    personen_je_rolle: Object.fromEntries(rollen.map((r) => [r.rolle, r.anzahl])),
    ohne_mieter: leer.n,
    dokumente: dok.n,
  };
}

module.exports.kennzahlen = kennzahlen;
