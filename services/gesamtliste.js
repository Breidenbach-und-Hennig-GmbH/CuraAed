'use strict';

/**
 * „Gesamtliste Adresse" (HausPerfekt): alle aktiven Adressen mit aktueller
 * Personenfunktion, gefiltert nach Pfkt.-Status und Suchmodus.
 *
 * Modi: suche (Name/Nr. beginnt mit), intensiv (alle Felder inkl. Telefon,
 * E-Mail, Ansprechpartner, Notizen), feld (ein bestimmtes Feld), telefon
 * (Ziffernvergleich), pfkt (Rolle und/oder Objekt-/Einheit-Nr.), ansprechp.
 */
const V = require('../lib/validation');
const { istAktiv } = require('./zuordnungen');

const FILTER = ['alle', 'aktiv', 'nicht_aktiv', 'ohne'];
const MODI = ['suche', 'intensiv', 'feld', 'telefon', 'pfkt', 'ansprechp'];
const FELDER = {
  nummer: (a) => [a.nummer],
  name: (a) => [a.nachname, a.vorname, a.firmenname],
  plz: (a) => [a.plz],
  ort: (a) => [a.ort],
  strasse: (a) => [a.strasse],
  email: (a, x) => [a.email, ...x.emails],
  lkto_nr: (a) => [a.lkto_nr],
  notizen: (a) => [a.notizen],
};
const MAX_SUCHE = 100;

const klein = (s) => String(s == null ? '' : s).toLocaleLowerCase('de-DE');
const ziffern = (s) => String(s == null ? '' : s).replace(/\D+/g, '');
const listenname = (a) =>
  a.adresstyp === 'firma' ? a.firmenname || '' : [a.nachname, a.vorname].filter(Boolean).join(', ');

function gruppieren(rows) {
  const m = new Map();
  rows.forEach((r) => {
    if (!m.has(r.adresse_id)) m.set(r.adresse_id, []);
    m.get(r.adresse_id).push(r);
  });
  return m;
}

async function liste(db, opts = {}) {
  const filter = FILTER.includes(opts.filter) ? opts.filter : 'alle';
  const modus = MODI.includes(opts.modus) ? opts.modus : 'suche';
  const q = String(opts.q == null ? '' : opts.q).trim().slice(0, MAX_SUCHE);
  if (modus === 'feld' && opts.feld && !FELDER[opts.feld]) throw new V.ValidationError('Unbekanntes Suchfeld.');
  if (modus === 'pfkt' && opts.rolle && !V.ROLLEN.includes(opts.rolle)) throw new V.ValidationError('Unbekannte Personenfunktion.');
  const stichtag = new Date().toISOString().slice(0, 10);

  const [adressen, zuord, telefone, emails, ansprech] = await Promise.all([
    db.all('SELECT * FROM adressen WHERE archiviert = 0'),
    db.all(
      `SELECT z.id, z.adresse_id, z.rolle, z.gueltig_von, z.gueltig_bis, z.einheit_id,
              o.nummer AS objekt_nummer, e.nummer AS einheit_nummer
       FROM rollen_zuordnungen z
       LEFT JOIN einheiten e ON e.id = z.einheit_id
       LEFT JOIN objekte o ON o.id = COALESCE(z.objekt_id, e.objekt_id)
       ORDER BY z.gueltig_von DESC, z.id DESC`
    ),
    db.all('SELECT adresse_id, nummer FROM adress_telefone'),
    db.all('SELECT adresse_id, adresse FROM adress_emails'),
    db.all('SELECT adresse_id, name FROM adress_ansprechpartner'),
  ]);
  const zMap = gruppieren(zuord);
  const tMap = gruppieren(telefone);
  const eMap = gruppieren(emails);
  const apMap = gruppieren(ansprech);

  const qk = klein(q);
  const enthaelt = (werte) => werte.some((w) => klein(w).includes(qk));

  const treffer = adressen.filter((a) => {
    const z = zMap.get(a.id) || [];
    const aktiv = z.filter((x) => istAktiv(x, stichtag));
    if (filter === 'aktiv' && !aktiv.length) return false;
    if (filter === 'nicht_aktiv' && (!z.length || aktiv.length)) return false;
    if (filter === 'ohne' && z.length) return false;

    const x = {
      telefone: (tMap.get(a.id) || []).map((t) => t.nummer),
      emails: (eMap.get(a.id) || []).map((m) => m.adresse),
      ansprech: (apMap.get(a.id) || []).map((p) => p.name),
    };
    if (modus === 'pfkt') {
      return z.some((r) => (!opts.rolle || r.rolle === opts.rolle) &&
        (!q || klein(r.objekt_nummer).startsWith(qk) || klein(r.einheit_nummer).startsWith(qk)));
    }
    if (!q) return true;
    switch (modus) {
      case 'suche':
        return [listenname(a), a.nachname, a.firmenname, a.nummer].some((w) => klein(w).startsWith(qk));
      case 'intensiv':
        return enthaelt([a.nummer, a.vorname, a.nachname, a.firmenname, a.ansprechpartner, a.strasse, a.plz, a.ort,
          a.land, a.telefon, a.mobil, a.email, a.notizen, a.lkto_nr, ...x.telefone, ...x.emails, ...x.ansprech]);
      case 'feld':
        return enthaelt(FELDER[opts.feld || 'name'](a, x));
      case 'telefon': {
        const d = ziffern(q);
        return !!d && [a.telefon, a.mobil, ...x.telefone].some((t) => ziffern(t).includes(d));
      }
      case 'ansprechp':
        return enthaelt([a.ansprechpartner, ...x.ansprech]);
      default:
        return true;
    }
  });

  return treffer
    .map((a) => {
      const z = zMap.get(a.id) || [];
      const aktiv = z.filter((x) => istAktiv(x, stichtag));
      const pf = aktiv[0] || null;
      return {
        id: a.id,
        nummer: a.nummer,
        name: listenname(a),
        plz: a.plz,
        ort: a.ort,
        strasse: a.strasse,
        pf_status: aktiv.length ? 'aktiv' : z.length ? 'nicht_aktiv' : 'ohne',
        pf_anzahl: aktiv.length,
        pf_rolle: pf ? pf.rolle : null,
        pf_einheit: pf ? pf.einheit_nummer : null,
        pf_objekt: pf ? pf.objekt_nummer : null,
      };
    })
    .sort((x, y) => x.name.localeCompare(y.name, 'de', { sensitivity: 'base' }) || String(x.nummer).localeCompare(String(y.nummer)));
}

module.exports = { liste, FILTER, MODI, FELDER: Object.keys(FELDER) };
