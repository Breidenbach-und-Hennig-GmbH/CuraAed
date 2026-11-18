'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const objekte = require('../services/objekte');
const einheiten = require('../services/einheiten');
const adressen = require('../services/adressen');
const zuordnungen = require('../services/zuordnungen');
const komm = require('../services/kommunikation');
const gesamtliste = require('../services/gesamtliste');

test('Gesamtliste Adresse: Pfkt.-Filter und Suchmodi', async () => {
  const db = await openDatabase(':memory:');
  const o = await objekte.anlegen(db, { bezeichnung: 'Alte Landstr.', nummer: '18505' });
  const e = await einheiten.anlegen(db, o.id, { bezeichnung: 'WE 2' });
  const luka = await adressen.anlegen(db, { vorname: 'Luka', nachname: 'Vujica', plz: '51373', ort: 'Leverkusen', strasse: 'Alte Landstr. 42' });
  const anja = await adressen.anlegen(db, { vorname: 'Anja', nachname: 'Vukusic', ort: 'Köln', notizen: 'Schlüssel beim Nachbarn' });
  const alt = await adressen.anlegen(db, { vorname: 'Jovo', nachname: 'Vukovic', ort: 'München' });
  const firma = await adressen.anlegen(db, { adresstyp: 'firma', firmenname: 'VULCAVO GmbH', ort: 'Overath' });
  await zuordnungen.anlegen(db, { adresse_id: luka.id, einheit_id: e.id, rolle: 'eigentuemer', gueltig_von: '2020-01-01' });
  await zuordnungen.anlegen(db, { adresse_id: alt.id, einheit_id: e.id, rolle: 'mieter', gueltig_von: '2010-01-01', gueltig_bis: '2015-12-31' });
  await komm.telefonAnlegen(db, luka.id, { art: 'Funktelefon', nummer: '0152 / 540-24077' });
  await komm.apAnlegen(db, firma.id, { name: 'Petra Schmitz' });

  const namen = async (opts) => (await gesamtliste.liste(db, opts)).map((x) => x.name);
  assert.deepEqual(await namen({}), ['Vujica, Luka', 'Vukovic, Jovo', 'Vukusic, Anja', 'VULCAVO GmbH'], 'alle, alphabetisch');
  const l = (await gesamtliste.liste(db, {})).find((x) => x.id === luka.id);
  assert.equal(l.pf_status, 'aktiv');
  assert.equal(l.pf_objekt, '18505');
  assert.equal(l.pf_einheit, e.nummer);
  assert.deepEqual(await namen({ filter: 'aktiv' }), ['Vujica, Luka']);
  assert.deepEqual(await namen({ filter: 'nicht_aktiv' }), ['Vukovic, Jovo']);
  assert.deepEqual(await namen({ filter: 'ohne' }), ['Vukusic, Anja', 'VULCAVO GmbH']);

  assert.deepEqual(await namen({ q: 'vuk' }), ['Vukovic, Jovo', 'Vukusic, Anja'], 'Suche: Name beginnt mit');
  assert.deepEqual(await namen({ q: 'vujica, l' }), ['Vujica, Luka']);
  for (const opts of [{}, { modus: 'intensiv' }, { modus: 'feld', feld: 'name' }]) {
    for (const q of ['Luka Vujica', 'Vujica Luka', 'Vujica, Luka']) {
      assert.deepEqual(await namen({ ...opts, q }), ['Vujica, Luka'], 'Vollständiger Name in beiden Reihenfolgen: '+JSON.stringify({ ...opts, q }));
    }
  }
  assert.deepEqual(await namen({ q: luka.nummer }), ['Vujica, Luka'], 'Suche: Adress-Nr.');
  assert.deepEqual(await namen({ modus: 'intensiv', q: 'schlüssel' }), ['Vukusic, Anja'], 'Intensiv: Notizen');
  assert.deepEqual(await namen({ modus: 'intensiv', q: 'schmitz' }), ['VULCAVO GmbH'], 'Intensiv: Ansprechpartner');
  assert.deepEqual(await namen({ modus: 'feld', feld: 'ort', q: 'köln' }), ['Vukusic, Anja'], 'Feldsuche Ort');
  assert.deepEqual(await namen({ modus: 'telefon', q: '015254024077' }), ['Vujica, Luka'], 'Telefon ohne Trennzeichen');
  assert.deepEqual(await namen({ modus: 'telefon', q: '24077' }), ['Vujica, Luka']);
  assert.deepEqual(await namen({ modus: 'ansprechp', q: 'petra' }), ['VULCAVO GmbH']);
  assert.deepEqual(await namen({ modus: 'pfkt', rolle: 'mieter' }), ['Vukovic, Jovo'], 'Pfkt.: Rolle (auch beendet)');
  assert.deepEqual(await namen({ modus: 'pfkt', q: '18505' }), ['Vujica, Luka', 'Vukovic, Jovo'], 'Pfkt.: Objekt-Nr.');
  assert.deepEqual(await namen({ modus: 'pfkt', q: '18505', filter: 'aktiv' }), ['Vujica, Luka']);

  await adressen.setzeArchiviert(db, anja.id, true);
  assert.ok(!(await namen({})).includes('Vukusic, Anja'), 'deaktivierte Adressen fehlen');
  await assert.rejects(() => gesamtliste.liste(db, { modus: 'feld', feld: 'passwort', q: 'x' }), /Suchfeld/);
  await assert.rejects(() => gesamtliste.liste(db, { modus: 'pfkt', rolle: 'chef' }), /Personenfunktion/);
  await db.close();
});
