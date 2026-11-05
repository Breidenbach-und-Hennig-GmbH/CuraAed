'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../db');
const adressen = require('../services/adressen');
const komm = require('../services/kommunikation');
const versand = require('../services/versand');

test('Portooptimierung: Standard, Abweichungen je Dokumentart, Ausweichen auf Post', async () => {
  const db = await openDatabase(':memory:');
  const a = await adressen.anlegen(db, { vorname: 'Luka', nachname: 'Vujica' });
  let v = await versand.holen(db, a.id);
  assert.equal(v.standard, 'post', 'neue Adressen bekommen Post');
  assert.equal(v.arten.length, 13);
  assert.ok(v.arten.every((x) => x.effektiv === 'post' && x.kanal === null));

  v = await versand.speichern(db, a.id, { standard: 'email', abweichungen: { mahnung: 'post', abrechnung: 'beides', umlage: 'email' } });
  assert.equal(v.standard, 'email');
  assert.equal(v.arten.find((x) => x.key === 'mahnung').effektiv, 'post');
  assert.equal(v.arten.find((x) => x.key === 'abrechnung').effektiv, 'beides');
  assert.equal(v.arten.find((x) => x.key === 'umlage').kanal, null, '„wie Standard" wird nicht als Abweichung gespeichert');

  // Ohne E-Mail-Adresse → Post mit Hinweis
  let w = await versand.versandFuer(db, a.id, 'serienbrief');
  assert.deepEqual(w, { post: true, email: null, hinweis: 'Keine E-Mail-Adresse hinterlegt – Versand per Post.' });
  await komm.emailAnlegen(db, a.id, { adresse: 'vujica.luka@gmail.com', standard: 1 });
  w = await versand.versandFuer(db, a.id, 'serienbrief');
  assert.deepEqual(w, { post: false, email: 'vujica.luka@gmail.com', hinweis: null });
  w = await versand.versandFuer(db, a.id, 'abrechnung');
  assert.equal(w.post, true);
  assert.equal(w.email, 'vujica.luka@gmail.com');
  assert.equal((await versand.versandFuer(db, a.id, 'mahnung')).email, null);

  await assert.rejects(() => versand.speichern(db, a.id, { standard: 'brieftaube' }), /Ungültiger Wert/);
  await assert.rejects(() => versand.speichern(db, a.id, { standard: 'post', abweichungen: { gibtsnicht: 'post' } }), /Unbekannte Dokumentart/);
  // Bearbeiten der Adresse lässt Versand unverändert
  await adressen.aktualisieren(db, a.id, { vorname: 'Luka', nachname: 'Vujica', ort: 'Leverkusen' });
  assert.equal((await versand.holen(db, a.id)).standard, 'email');
  await db.close();
});
