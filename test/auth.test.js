'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../db');
const auth = require('../lib/auth');
const benutzer = require('../services/benutzer');

test('Sitzungen: abgelaufene ISO-Zeitstempel am selben UTC-Tag werden abgewiesen und gelöscht', async () => {
  const db = await openDatabase(':memory:');
  try {
    const b = await benutzer.anlegen(db, { benutzername: 'test', name: 'Test', passwort: 'test12345', rolle: 'admin' });
    const now = new Date();
    const expired = new Date(now);
    expired.setUTCHours(0, 0, 0, 0);
    const future = new Date(now.getTime() + 86400000);
    await db.run('INSERT INTO sitzungen (token, benutzer_id, ablauf_am) VALUES (?,?,?)', ['expired', b.id, expired.toISOString()]);
    await db.run('INSERT INTO sitzungen (token, benutzer_id, ablauf_am) VALUES (?,?,?)', ['future', b.id, future.toISOString()]);
    assert.equal(await auth.benutzerAusSitzung(db, 'expired'), null);
    assert.equal((await auth.benutzerAusSitzung(db, 'future')).id, b.id);
    await auth.abgelaufeneEntfernen(db);
    assert.equal(await db.get('SELECT token FROM sitzungen WHERE token = ?', ['expired']), undefined);
    assert.ok(await db.get('SELECT token FROM sitzungen WHERE token = ?', ['future']));
  } finally {
    await db.close();
  }
});
