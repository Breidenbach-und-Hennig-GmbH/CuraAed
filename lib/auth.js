'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'hv_session';
const SESSION_TAGE = 7;

function neuerToken() {
  return crypto.randomBytes(32).toString('hex');
}

function ablaufDatum() {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_TAGE);
  return d.toISOString();
}

/** Erstellt eine Sitzung und gibt das Token zurück. */
async function sitzungErstellen(db, benutzerId) {
  const token = neuerToken();
  await db.run(
    'INSERT INTO sitzungen (token, benutzer_id, ablauf_am) VALUES (?,?,?)',
    [token, benutzerId, ablaufDatum()]
  );
  return token;
}

async function sitzungLoeschen(db, token) {
  if (!token) return;
  await db.run('DELETE FROM sitzungen WHERE token = ?', [token]);
}

/** Löscht abgelaufene Sitzungen (Wartung). */
async function abgelaufeneEntfernen(db) {
  await db.run("DELETE FROM sitzungen WHERE julianday(ablauf_am) <= julianday('now')");
}

async function benutzerAusSitzung(db, token) {
  if (!token) return null;
  const s = await db.get(
    "SELECT * FROM sitzungen WHERE token = ? AND julianday(ablauf_am) > julianday('now')",
    [token]
  );
  if (!s) return null;
  const b = await db.get('SELECT * FROM benutzer WHERE id = ? AND aktiv = 1', [s.benutzer_id]);
  if (!b) return null;
  const { passwort_hash, ...rest } = b;
  return rest;
}

// Die App wird u. a. im 4everyone-Vorschau-iFrame (fremde Top-Level-Domain)
// angezeigt. Damit das Session-Cookie in diesem eingebetteten Kontext gesetzt
// und mitgesendet wird, muss es SameSite=None; Secure; Partitioned tragen.
// Da der Plattform-Ingress TLS terminiert (öffentliche URL ist HTTPS), ist
// Secure erfüllt. Über die Env-Variable COOKIE_INSECURE=1 lässt sich das für
// reine HTTP-Umgebungen (z. B. lokale Tests) abschalten.
const COOKIE_INSECURE = process.env.COOKIE_INSECURE === '1';
function cookieOptionen() {
  if (COOKIE_INSECURE) {
    return { httpOnly: true, sameSite: 'lax', secure: false, path: '/' };
  }
  return { httpOnly: true, sameSite: 'none', secure: true, partitioned: true, path: '/' };
}

/** Setzt das Session-Cookie (HttpOnly, kein Token in Query/JS-Zugriff nötig). */
function cookieSetzen(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptionen(),
    maxAge: SESSION_TAGE * 24 * 60 * 60 * 1000,
  });
}

function cookieLoeschen(res) {
  res.clearCookie(COOKIE_NAME, cookieOptionen());
}

/** Express-Middleware: hängt req.benutzer an, wenn eingeloggt. */
function middleware(db) {
  return async (req, res, next) => {
    try {
      const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
      req.sessionToken = token;
      req.benutzer = await benutzerAusSitzung(db, token);
    } catch (e) {
      req.benutzer = null;
    }
    next();
  };
}

/** Verlangt eine Anmeldung. */
function erfordereLogin(req, res, next) {
  if (!req.benutzer) {
    return res.status(401).json({ fehler: 'Nicht angemeldet.' });
  }
  next();
}

/** Verlangt Schreibrechte (admin oder mitarbeiter). "leser" darf nur lesen. */
function erfordereSchreibrecht(req, res, next) {
  if (!req.benutzer) return res.status(401).json({ fehler: 'Nicht angemeldet.' });
  if (req.benutzer.rolle === 'leser') {
    return res.status(403).json({ fehler: 'Keine Schreibberechtigung (nur Lesezugriff).' });
  }
  next();
}

/** Verlangt Administratorrechte. */
function erfordereAdmin(req, res, next) {
  if (!req.benutzer) return res.status(401).json({ fehler: 'Nicht angemeldet.' });
  if (req.benutzer.rolle !== 'admin') {
    return res.status(403).json({ fehler: 'Administratorrechte erforderlich.' });
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  sitzungErstellen,
  sitzungLoeschen,
  abgelaufeneEntfernen,
  benutzerAusSitzung,
  cookieSetzen,
  cookieLoeschen,
  middleware,
  erfordereLogin,
  erfordereSchreibrecht,
  erfordereAdmin,
};
