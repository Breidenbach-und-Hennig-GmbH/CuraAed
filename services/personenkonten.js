'use strict';

const V = require('../lib/validation');
const { deZahl } = require('../lib/zahl');
const { anzeigename } = require('./adressen');

// Personenkonten (Debitoren) je Personenfunktion einer Wohnung/Einheit.
// PKto-Nr. wie in HausPerfekt: Personenfunktion (Code 001 → 1, 002 → 2 …) + Wechsler (0 = erster, 1 = zweiter …)
// + Einheitsnummer (mind. 3-stellig, egal ob Wohnung, Gewerbe oder Stellplatz).
// Beispiel: 20001 = 002 Eigentümer fremdvermietet, erster, Einheit 001; 11009 = 001, zweiter Wechsel, Einheit 009.
const ROLLEN_MIT_PKTO = ['eigentuemer', 'mieter'];

const heute = () => new Date().toISOString().slice(0, 10);
const aktiv = (z, tag = heute()) => !z.inaktiv && (!z.gueltig_von || z.gueltig_von <= tag) && (!z.gueltig_bis || z.gueltig_bis >= tag);

const SELECT = `
  SELECT p.id AS pkto_id, p.nummer AS pkto_nummer, p.kontoname, p.aktenzeichen, p.ref_nr, p.bemerkung, p.sachbearbeiter_id,
         EXISTS(SELECT 1 FROM hp_personenkonto_zuordnung m WHERE m.personenkonto_id=p.id) AS hp_importiert,
         z.id AS zuordnung_id, z.rolle, z.pfkt_code, z.inaktiv, pc.bezeichnung AS pfkt_bezeichnung, z.gueltig_von, z.gueltig_bis,
         COALESCE(p.adresse_id,z.adresse_id) AS adresse_id, COALESCE(p.einheit_id,z.einheit_id) AS einheit_id,
         a.nummer AS adresse_nummer, a.adresstyp, a.anrede, a.vorname, a.nachname, a.firmenname,
         e.nummer AS einheit_nummer, e.bezeichnung AS einheit_bezeichnung, e.lage, e.flaeche_qm,
         o.id AS objekt_id, o.nummer AS objekt_nummer, o.bezeichnung AS objekt_bezeichnung, o.strasse AS objekt_strasse,
         b.benutzername AS sb_kuerzel, b.name AS sb_name
  FROM (
    SELECT p.id AS konto, COALESCE(p.zuordnung_id,(SELECT f.zuordnung_id FROM personenkonto_funktionen f JOIN rollen_zuordnungen rz ON rz.id=f.zuordnung_id WHERE f.personenkonto_id=p.id ORDER BY COALESCE(rz.inaktiv,0),rz.gueltig_bis IS NULL DESC,rz.gueltig_von DESC,rz.id DESC LIMIT 1)) AS funktion FROM personenkonten p
    UNION ALL
    SELECT NULL,z.id FROM rollen_zuordnungen z WHERE NOT EXISTS(SELECT 1 FROM personenkonten p WHERE p.zuordnung_id=z.id)
      AND NOT EXISTS(SELECT 1 FROM personenkonto_funktionen f WHERE f.zuordnung_id=z.id)
  ) link
  LEFT JOIN personenkonten p ON p.id=link.konto
  LEFT JOIN rollen_zuordnungen z ON z.id=link.funktion
  LEFT JOIN adressen a ON a.id = COALESCE(p.adresse_id,z.adresse_id)
  LEFT JOIN einheiten e ON e.id = COALESCE(p.einheit_id,z.einheit_id)
  JOIN objekte o ON o.id = COALESCE(p.objekt_id,z.objekt_id,e.objekt_id)
  LEFT JOIN pfkt_codes pc ON pc.code = z.pfkt_code
  LEFT JOIN benutzer b ON b.id = p.sachbearbeiter_id`;

async function sollSumme(db, pktoIds) {
  if (!pktoIds.length) return new Map();
  const rows = await db.all(`SELECT * FROM pkto_sollwerte WHERE personenkonto_id IN (${pktoIds.map(() => '?').join(',')}) ORDER BY gilt_ab`, pktoIds);
  const m = new Map();
  for (const id of pktoIds) m.set(id, monatlich(rows.filter((r) => r.personenkonto_id === id)));
  return m;
}

/** Aktuell gültige Sollwerte: je Bezeichnung der jüngste mit „gilt ab" ≤ heute (sonst der früheste künftige). */
function monatlich(sollwerte, tag = heute()) {
  const jeBez = new Map();
  for (const s of sollwerte) {
    const alt = jeBez.get(s.bezeichnung);
    const gilt = s.gilt_ab <= tag;
    if (!alt) jeBez.set(s.bezeichnung, s);
    else if (gilt && (alt.gilt_ab > tag || s.gilt_ab > alt.gilt_ab)) jeBez.set(s.bezeichnung, s);
  }
  const aktuell = [...jeBez.values()];
  const r2 = (n) => Math.round(n * 100) / 100;
  return { aktuell, netto: r2(aktuell.reduce((x, s) => x + s.netto, 0)), betrag: r2(aktuell.reduce((x, s) => x + s.betrag, 0)) };
}

function anreichern(rows) {
  return rows.map((r) => ({ ...r, name: r.kontoname || (r.adresse_id ? anzeigename(r) : 'HP-Konto '+r.pkto_nummer), aktiv: aktiv(r), mit_pkto: !!r.pkto_id || ROLLEN_MIT_PKTO.includes(r.rolle) }));
}

async function mitSummen(db, rows) {
  const summen = await sollSumme(db, rows.filter((r) => r.pkto_id).map((r) => r.pkto_id));
  return rows.map((r) => ({ ...r, soll: r.pkto_id ? summen.get(r.pkto_id) : null }));
}

async function nachEinheit(db, einheitId) {
  const rows = anreichern(await db.all(`${SELECT} WHERE COALESCE(p.einheit_id,z.einheit_id) = ? ORDER BY z.rolle, z.gueltig_bis IS NULL DESC, z.gueltig_von DESC`, [einheitId]));
  return mitSummen(db, rows);
}
async function nachAdresse(db, adresseId) {
  return mitSummen(db, anreichern(await db.all(`${SELECT} WHERE COALESCE(p.adresse_id,z.adresse_id) = ? ORDER BY o.nummer, e.nummer`, [adresseId])));
}
async function nachObjekt(db, objektId) {
  return mitSummen(db, anreichern(await db.all(`${SELECT} WHERE o.id = ? AND p.id IS NOT NULL ORDER BY p.nummer`, [objektId])));
}

/** Einheitsnummer für die PKto-Nr.: Teil hinter dem Objekt (4010-01 → 001), mind. 3-stellig. */
async function einheitsTeil(db, z) {
  const e = await db.get('SELECT nummer, objekt_id FROM einheiten WHERE id = ?', [z.einheit_id]);
  let teil = String(e.nummer || '').split('-').pop().replace(/\D/g, '');
  if (!teil) {
    const alle = await db.all('SELECT id FROM einheiten WHERE objekt_id = ? ORDER BY nummer, id', [e.objekt_id]);
    teil = String(alle.findIndex((x) => x.id === z.einheit_id) + 1);
  }
  return { objektId: e.objekt_id, teil: teil.padStart(3, '0') };
}

async function naechsteNummer(db, z) {
  if (!z.pfkt_code) throw new V.ValidationError('Bitte zuerst die Personenfunktion wählen (z. B. 001 Eigentümer eigengenutzt) – sie bildet die 1. Stelle der PKto-Nr.');
  if (!/^\d+$/.test(z.pfkt_code)) throw new V.ValidationError(`Aus dem Code ${z.pfkt_code} lässt sich keine PKto-Nr. bilden – bitte die Nummer manuell eintragen.`);
  const funktion = String(Number(z.pfkt_code));
  const { objektId, teil } = await einheitsTeil(db, z);
  // Wechsler = Anzahl bisheriger Konten mit gleicher Funktion für diese Einheit
  for (let wechsler = 0; wechsler < 10; wechsler++) {
    const nr = funktion + wechsler + teil;
    if (!(await db.get('SELECT 1 FROM personenkonten WHERE objekt_id = ? AND nummer = ?', [objektId, nr]))) return nr;
  }
  throw new V.ValidationError('Mehr als 10 Wechsel für diese Einheit – bitte die PKto-Nr. manuell vergeben.');
}

function nummerPruefen(v) {
  const s = V.str(v, 12);
  if (!s) return null;
  if (!/^\d{1,12}$/.test(s)) throw new V.ValidationError('PKto-Nr. darf nur aus Ziffern bestehen (max. 12).');
  return s;
}
const eindeutig = (e) => {
  if (/UNIQUE/.test(String(e && e.message))) {
    if (/zuordnung_id/.test(e.message)) throw new V.ValidationError('Für diese Personenfunktion gibt es bereits ein Personenkonto.', 409);
    throw new V.ValidationError('Diese PKto-Nr. ist im Objekt bereits vergeben.', 409);
  }
  throw e;
};

async function anlegen(db, data) {
  let z = await db.get('SELECT * FROM rollen_zuordnungen WHERE id = ?', [Number(data.zuordnung_id)]);
  if (!z) throw new V.ValidationError('Personenfunktion nicht gefunden.', 404);
  // Code der Personenfunktion beim Anlegen festlegen, falls noch nicht vorhanden
  if (data.pfkt_code && data.pfkt_code !== z.pfkt_code) {
    const code = await require('./zuordnungen').pfktCodePruefen(db, data.pfkt_code, z.rolle);
    await db.run('UPDATE rollen_zuordnungen SET pfkt_code = ? WHERE id = ?', [code, z.id]);
    z = { ...z, pfkt_code: code };
  }
  if (!z.einheit_id) throw new V.ValidationError('Personenkonten gibt es nur für Personenfunktionen in einer Wohnung/Einheit.');
  if (!ROLLEN_MIT_PKTO.includes(z.rolle)) throw new V.ValidationError('Personenkonten gibt es für Eigentümer und Mieter.');
  const e = await db.get('SELECT objekt_id FROM einheiten WHERE id = ?', [z.einheit_id]);
  const nummer = nummerPruefen(data.nummer) || (await naechsteNummer(db, z));
  const sb = data.sachbearbeiter_id ? Number(data.sachbearbeiter_id) : null;
  const r = await db.run('INSERT INTO personenkonten (objekt_id, zuordnung_id, nummer, ref_nr, sachbearbeiter_id, bemerkung) VALUES (?,?,?,?,?,?)',
    [e.objekt_id, z.id, nummer, V.str(data.ref_nr, 30), sb, V.str(data.bemerkung)]).catch(eindeutig);
  return holen(db, r.lastID);
}

async function holen(db, id) {
  const r = (await db.all(`${SELECT} WHERE p.id = ?`, [id]))[0];
  if (!r) return null;
  const [k] = anreichern([r]);
  const [adresse, bank, telefone, verteiler, sollwerte] = await Promise.all([
    db.get('SELECT * FROM adressen WHERE id = ?', [k.adresse_id]),
    db.get('SELECT * FROM adress_bank WHERE adresse_id = ? ORDER BY standard DESC, id LIMIT 1', [k.adresse_id]),
    db.all('SELECT * FROM adress_telefone WHERE adresse_id = ? ORDER BY id', [k.adresse_id]),
    kontoVerteiler(db,k),
    db.all('SELECT * FROM pkto_sollwerte WHERE personenkonto_id = ? ORDER BY gilt_ab DESC, id DESC', [id]),
  ]);
  return { ...k, adresse:adresse||null, bank: bank || null, telefone, verteiler, sollwerte, soll: monatlich(sollwerte), offene_posten: k.hp_importiert?null:0 };
}

async function kontoVerteiler(db,k){
 const {jahr}=await db.get('SELECT MAX(jahr) AS jahr FROM verteilerschluessel_jahre WHERE objekt_id=?',[k.objekt_id]);
 if(jahr!==null)return db.all(`SELECT s.kuerzel,j.bezeichnung,j.jahr,p.anteil_dezimal AS anteil,u.anteil_dezimal AS einheitsanteil
   FROM verteilerschluessel s JOIN verteilerschluessel_jahre j ON j.schluessel_id=s.id
   LEFT JOIN personenkonto_verteilung_jahre p ON p.schluessel_id=s.id AND p.jahr=j.jahr AND p.personenkonto_id=?
   LEFT JOIN einheit_verteilung_jahre u ON u.schluessel_id=s.id AND u.jahr=j.jahr AND u.einheit_id=?
   WHERE s.objekt_id=? AND j.jahr=? ORDER BY s.kuerzel`,[k.pkto_id,k.einheit_id,k.objekt_id,jahr]);
 return db.all(`SELECT s.kuerzel,s.bezeichnung,v.anteil FROM einheit_verteilung v JOIN verteilerschluessel s ON s.id=v.schluessel_id WHERE v.einheit_id=? ORDER BY s.kuerzel`,[k.einheit_id]);
}

async function aendern(db, id, data) {
  const p = await db.get('SELECT * FROM personenkonten WHERE id = ?', [id]);
  if (!p) throw new V.ValidationError('Personenkonto nicht gefunden.', 404);
  const nummer = nummerPruefen(data.nummer) || p.nummer;
  const sb = data.sachbearbeiter_id ? Number(data.sachbearbeiter_id) : null;
  await db.run('UPDATE personenkonten SET nummer=?, ref_nr=?, sachbearbeiter_id=?, bemerkung=? WHERE id=?',
    [nummer, V.str(data.ref_nr, 30), sb, V.str(data.bemerkung), id]).catch(eindeutig);
  return holen(db, id);
}

async function loeschen(db, id) {
  if(await db.get('SELECT 1 FROM hp_personenkonto_zuordnung WHERE personenkonto_id=?',[id]))throw new V.ValidationError('Zugeordnetes HP-Personenkonto nicht lokal löschen.',409);
  // Sobald es Buchungen gibt, dürfen Konten mit Buchungen nicht mehr gelöscht werden.
  const r = await db.run('DELETE FROM personenkonten WHERE id = ?', [id]);
  if (!r.changes) throw new V.ValidationError('Personenkonto nicht gefunden.', 404);
}

function betrag(v, feld) {
  const n = V.num(deZahl(v));
  if (n === null) return null;
  if (Math.abs(n) > 1e9) throw new V.ValidationError(`"${feld}" ist zu groß.`);
  return Math.round(n * 100) / 100;
}
function sollWerte(data) {
  const gilt = V.isoDate(data.gilt_ab, 'Gilt ab');
  if (!gilt) throw new V.ValidationError('Feld "Gilt ab" ist erforderlich.');
  const netto = betrag(data.netto, 'Netto');
  let brutto = betrag(data.betrag, 'Sollstellungsbetrag');
  if (netto === null && brutto === null) throw new V.ValidationError('Bitte einen Betrag eingeben.');
  if (brutto === null) brutto = netto;
  return { gilt_ab: gilt, bezeichnung: V.str(data.bezeichnung, 40) || 'Hausgeld', netto: netto === null ? brutto : netto, betrag: brutto };
}
async function sollAnlegen(db, pktoId, data) {
  if (!(await db.get('SELECT id FROM personenkonten WHERE id = ?', [pktoId]))) throw new V.ValidationError('Personenkonto nicht gefunden.', 404);
  const w = sollWerte(data);
  const r = await db.run('INSERT INTO pkto_sollwerte (personenkonto_id, gilt_ab, bezeichnung, netto, betrag) VALUES (?,?,?,?,?)', [pktoId, w.gilt_ab, w.bezeichnung, w.netto, w.betrag]);
  return db.get('SELECT * FROM pkto_sollwerte WHERE id = ?', [r.lastID]);
}
async function sollAendern(db, id, data) {
  const w = sollWerte(data);
  const r = await db.run('UPDATE pkto_sollwerte SET gilt_ab=?, bezeichnung=?, netto=?, betrag=? WHERE id=?', [w.gilt_ab, w.bezeichnung, w.netto, w.betrag, id]);
  if (!r.changes) throw new V.ValidationError('Sollwert nicht gefunden.', 404);
  return db.get('SELECT * FROM pkto_sollwerte WHERE id = ?', [id]);
}
async function sollLoeschen(db, id) {
  const r = await db.run('DELETE FROM pkto_sollwerte WHERE id = ?', [id]);
  if (!r.changes) throw new V.ValidationError('Sollwert nicht gefunden.', 404);
}

module.exports = { ROLLEN_MIT_PKTO, naechsteNummer, monatlich, nachEinheit, nachAdresse, nachObjekt, anlegen, holen, aendern, loeschen, sollAnlegen, sollAendern, sollLoeschen };
