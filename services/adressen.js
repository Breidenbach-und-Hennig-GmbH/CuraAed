'use strict';

const V = require('../lib/validation');
const N = require('../lib/nummern');

/** Anzeigename für Person/Firma. */
function anzeigename(a) {
  if (!a) return '';
  if (a.adresstyp === 'firma') return a.firmenname || '(Firma ohne Name)';
  return [a.vorname, a.nachname].filter(Boolean).join(' ') || '(Person ohne Name)';
}

async function liste(db, opts = {}) {
  const where = [];
  const params = [];
  if (opts.archiviert === undefined || opts.archiviert === null) {
    where.push('archiviert = 0');
  } else {
    where.push('archiviert = ?');
    params.push(V.bool(opts.archiviert));
  }
  if (opts.adresstyp) {
    where.push('adresstyp = ?');
    params.push(opts.adresstyp);
  }
  const suche = V.str(opts.suche);
  if (suche) {
    where.push(
      '(nummer LIKE ? OR vorname LIKE ? OR nachname LIKE ? OR firmenname LIKE ? OR zusatz LIKE ? OR email LIKE ? OR ort LIKE ? OR telefon LIKE ? OR mobil LIKE ?)'
    );
    const like = `%${suche}%`;
    params.push(like, like, like, like, like, like, like, like, like);
  }
  const rows = await db.all(
    `SELECT * FROM adressen WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(NULLIF(nachname,''), firmenname) COLLATE NOCASE ASC LIMIT ?`,
    [...params, 500]
  );
  return rows.map((r) => ({ ...r, anzeigename: anzeigename(r) }));
}

async function holen(db, id) {
  const a = await db.get(
    'SELECT a.*, b.name AS ampel_von_name FROM adressen a LEFT JOIN benutzer b ON b.id = a.ampel_von WHERE a.id = ?',
    [id]
  );
  return a ? require('./hpAdressSync').metadata(db, { ...a, anzeigename: anzeigename(a) }) : undefined;
}

function validiereNamen(data, adresstyp) {
  if (adresstyp === 'firma') {
    V.requireStr(data.firmenname, 'Firmenname');
  } else {
    if (!V.str(data.nachname) && !V.str(data.vorname)) {
      throw new V.ValidationError('Bei einer Person ist mindestens der Nachname erforderlich.');
    }
    V.requireStr(data.nachname, 'Nachname');
  }
}

const ADRESS_FELDER = [
  'adresstyp', 'anrede', 'vorname', 'nachname', 'firmenname', 'zusatz', 'ansprechpartner',
  'strasse', 'plz', 'ort', 'land', 'email', 'telefon', 'mobil', 'notizen',
  'geburtstag', 'lkto_nr', 'datenschutz_datum',
];

function adressWerte(data, adresstyp) {
  return [
    adresstyp,
    V.str(data.anrede),
    V.str(data.vorname),
    V.str(data.nachname),
    V.str(data.firmenname),
    V.str(data.zusatz, 120),
    V.str(data.ansprechpartner),
    V.str(data.strasse),
    V.str(data.plz),
    V.str(data.ort),
    V.str(data.land) || 'Deutschland',
    V.str(data.email),
    V.str(data.telefon),
    V.str(data.mobil),
    V.str(data.notizen),
    V.isoDate(data.geburtstag, 'Geburtstag'),
    V.str(data.lkto_nr, 30),
    V.isoDate(data.datenschutz_datum, 'Datenschutz-Einwilligung'),
  ];
}

async function anlegen(db, data) {
  const adresstyp = V.oneOf(data.adresstyp, V.ADRESSTYPEN, 'Adresstyp', 'person');
  validiereNamen(data, adresstyp);
  const werte = adressWerte(data, adresstyp);
  const id = await N.einfuegenMitNummer({
    feld: 'Adress-Nr.',
    manuell: N.pruefeNummer(data.nummer, 'Adress-Nr.'),
    naechste: () => N.naechsteAdressNr(db),
    einfuegen: async (nummer) =>
      (await db.run(
        `INSERT INTO adressen (nummer, ${ADRESS_FELDER.join(', ')})
         VALUES (?${',?'.repeat(ADRESS_FELDER.length)})`,
        [nummer, ...werte]
      )).lastID,
  });
  // Telefon/Mobil/E-Mail aus dem Anlageformular in die Kommunikationslisten übernehmen
  await require('./kommunikation').uebernehmenAusStamm(db, id);
  return holen(db, id);
}

async function aktualisierenIntern(db, id, data) {
  const vorhanden = await db.get('SELECT * FROM adressen WHERE id = ?', [id]);
  if (!vorhanden) throw new V.ValidationError('Adresse nicht gefunden.', 404);
  // Nicht mitgesendete Felder bleiben unverändert (z. B. Telefon/E-Mail, die
  // über die Kommunikationslisten gepflegt werden).
  data = { ...vorhanden, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) };
  const adresstyp = V.oneOf(data.adresstyp, V.ADRESSTYPEN, 'Adresstyp', vorhanden.adresstyp);
  validiereNamen(data, adresstyp);
  const nummer = N.pruefeNummer(data.nummer, 'Adress-Nr.') || vorhanden.nummer;
  await require('./hpAdressSync').validateSave(db, vorhanden, {...data,nummer});
  await N.aktualisierenMitNummer(
    () =>
      db.run(
        `UPDATE adressen SET nummer=?, ${ADRESS_FELDER.map((f) => f + '=?').join(', ')},
           geaendert_am=datetime('now') WHERE id=?`,
        [nummer, ...adressWerte(data, adresstyp), id]
      ),
    nummer,
    'Adress-Nr.'
  );
  return holen(db, id);
}

async function aktualisieren(db,id,data) {
  return db.transaktion(tx=>aktualisierenIntern(tx,id,data));
}

/** Zustimmung zur Weitergabe der Daten: 'ja' (mit Datum, Std. heute) oder 'nein'. */
async function datenschutzSetzen(db, id, data) {
  const vorhanden = await db.get('SELECT id FROM adressen WHERE id = ?', [id]);
  if (!vorhanden) throw new V.ValidationError('Adresse nicht gefunden.', 404);
  const zustimmung = V.oneOf(data.zustimmung, ['ja', 'nein'], 'Zustimmung');
  const datum = zustimmung === 'ja' ? V.isoDate(data.datum, 'Zustimmung am') || new Date().toISOString().slice(0, 10) : null;
  await db.run("UPDATE adressen SET datenschutz_zustimmung = ?, datenschutz_datum = ?, geaendert_am = datetime('now') WHERE id = ?", [zustimmung, datum, id]);
  return holen(db, id);
}

async function setzeArchiviert(db, id, archiviert) {
  const vorhanden = await db.get('SELECT id FROM adressen WHERE id = ?', [id]);
  if (!vorhanden) throw new V.ValidationError('Adresse nicht gefunden.', 404);
  await db.run(
    "UPDATE adressen SET archiviert=?, geaendert_am=datetime('now') WHERE id=?",
    [V.bool(archiviert), id]
  );
  return holen(db, id);
}

module.exports = { anzeigename, liste, holen, anlegen, aktualisieren, setzeArchiviert, datenschutzSetzen };

