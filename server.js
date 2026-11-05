'use strict';

const path = require('path');
const { openDatabase } = require('./db');
const { baueApp } = require('./lib/appFactory');
const auth = require('./lib/auth');
const benutzerSvc = require('./services/benutzer');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'hausverwaltung.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads');

/**
 * Legt beim allerersten Start einen Administrator an, damit man sich anmelden
 * kann. Zugangsdaten kommen aus der Projekt-Konfiguration (Secrets & Variables):
 *   ADMIN_BENUTZER   (Standard: admin)
 *   ADMIN_PASSWORT   (Standard: einmalig zufällig, wird in stdout protokolliert)
 * Das Standardpasswort sollte nach dem ersten Login geändert werden.
 */
async function seedAdmin(db) {
  const anzahl = await db.get('SELECT COUNT(*) AS n FROM benutzer');
  if (anzahl.n > 0) return;
  const benutzername = (process.env.ADMIN_BENUTZER || 'admin').toLowerCase();
  let passwort = process.env.ADMIN_PASSWORT;
  let generiert = false;
  if (!passwort) {
    passwort = require('crypto').randomBytes(9).toString('base64').replace(/[/+=]/g, 'x');
    generiert = true;
  }
  await benutzerSvc.anlegen(db, {
    benutzername,
    passwort,
    name: 'Administrator',
    rolle: 'admin',
  });
  console.log('[SETUP] Administrator angelegt. Benutzername:', benutzername);
  if (generiert) {
    console.log('[SETUP] Generiertes Start-Passwort (bitte nach Login ändern):', passwort);
    console.log('[SETUP] Für ein festes Passwort ADMIN_PASSWORT in der Projekt-Konfiguration setzen.');
  }
}

async function main() {
  const db = await openDatabase(DB_PATH);
  await auth.abgelaufeneEntfernen(db);
  await seedAdmin(db);

  const app = baueApp(db, { uploadDir: UPLOAD_DIR });
  app.listen(PORT, HOST, () => {
    console.log(`[START] Hausverwaltung läuft auf http://${HOST}:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[FATAL] Start fehlgeschlagen:', err && err.stack ? err.stack : err);
  process.exit(1);
});
