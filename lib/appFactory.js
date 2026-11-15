'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const auth = require('./auth');
const { ValidationError } = require('./validation');
const { baueApi } = require('../routes/api');

// Vorschau-Bridge (siehe /.ai4-preview-bootstrap.js unten).
const VORSCHAU_SKRIPT = `(function () {
  async function melden() {
    try {
      var r = await fetch('/.ai4-preview-revision.json', { cache: 'no-store' });
      if (!r.ok) return;
      var d = await r.json();
      var rev = String((d && d.revision) != null ? d.revision : '');
      if (!rev) return;
      var m = document.querySelector('meta[name="ai4-preview-revision"]');
      if (m) m.setAttribute('content', rev);
      if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'ai4-preview-ready', revision: rev }, '*');
    } catch (e) { /* Vorschau ist optional */ }
  }
  if (document.readyState === 'complete') melden(); else window.addEventListener('load', melden);
})();
`;

/**
 * Baut die Express-App. db und uploadDir werden injiziert, damit dieselbe
 * App auch in Tests mit einer In-Memory-Datenbank betrieben werden kann.
 */
function baueApp(db, options = {}) {
  const uploadDir = options.uploadDir || path.join(__dirname, '..', 'data', 'uploads');
  const publicDir = options.publicDir || path.join(__dirname, '..', 'public');
  const revisionDatei = options.revisionDatei || path.join(__dirname, '..', '.ai4', 'preview-revision.json');

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(auth.middleware(db));

  // Getrennte, auf eine freigegebene Versammlung beschränkte Eigentümersitzungen.
  app.use('/api/etv-teilnahme',require('../routes/etv-teilnahme').baueTeilnahmeApi(db));

  // API
  app.use('/api', baueApi(db, uploadDir, { plaud: options.plaud, hausperfekt: options.hausperfekt, hpDirekt: options.hpDirekt, etvOrigin: options.etvOrigin, starface: options.starface }));
  app.use('/api', (req, res) => res.status(404).json({ fehler: 'Unbekannte Schnittstelle.' }));

  // Vorschau-Aktualität (Plattform-Vertrag): Da Express alle Pfade bedient,
  // liefern wir die Helfer selbst aus – sonst fiele die SPA-Rückfallseite (HTML)
  // auf diese Pfade und das Vorschau-Skript bräche mit einem Syntaxfehler ab.
  app.get('/.ai4-preview-revision.json', (req, res) => {
    res.set('Cache-Control', 'no-store');
    fs.readFile(revisionDatei, 'utf8', (err, inhalt) => {
      let revision = '0';
      if (!err) { try { revision = String(JSON.parse(inhalt).revision ?? '0'); } catch (e) { /* Standard */ } }
      res.json({ revision });
    });
  });
  app.get('/.ai4-preview-bootstrap.js', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript').send(VORSCHAU_SKRIPT);
  });

  // Self-hosted PDF renderer: no browser PDF plugin or external document service.
  app.use('/pdfjs', express.static(path.dirname(require.resolve('pdfjs-dist/package.json'))));

  // Statische Oberfläche
  app.use(express.static(publicDir, { extensions: ['html'] }));

  // SPA-Fallback: unbekannte, nicht-API GET-Routen liefern die App-Shell.
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // Zentraler Fehler-Handler (deutsche Meldungen, saubere Statuscodes).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      return res.status(err.status || 400).json({ fehler: err.message });
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ fehler: 'Datei zu groß (Archiv max. 50 MB, Plaud-Aufnahmen max. 95 MB).' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ fehler: 'Anfrage zu groß.' });
    }
    // Unerwartete Fehler in stderr protokollieren (Diagnostik-Contract).
    console.error('[FEHLER]', err && err.stack ? err.stack : err);
    res.status(500).json({ fehler: 'Interner Serverfehler.' });
  });

  return app;
}

module.exports = { baueApp };
