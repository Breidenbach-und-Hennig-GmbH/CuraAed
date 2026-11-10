'use strict';
const express = require('express');
const auth = require('../lib/auth');
const { baueHpVerbindungen } = require('../services/hausperfektVerbindungen');
const { HpMobileError } = require('../services/hausperfektMobile');
const { ValidationError } = require('../lib/validation');
const h = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(e => next(e instanceof HpMobileError ? new ValidationError(e.message, e.status) : e));
function baueHausperfektRouter(db, options = {}) {
  const router = express.Router(), service = baueHpVerbindungen(db, options);
  router.use(auth.erfordereSchreibrecht);
  router.use((req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  const sameOrigin = (req, res, next) => {
    let expected;
    try { expected = new URL(options.publicUrl || process.env.APP_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL).origin; } catch { /* disabled until a public origin is configured */ }
    if (!expected || req.get('origin') !== expected || !req.is('application/json')) return next(new ValidationError('Bitte die HP-Verbindung aus CuraAed heraus bearbeiten.', 403));
    next();
  };
  router.get('/dms/verbindungen', h(async (req, res) => res.json({ verbindungen: await service.liste(req.benutzer.id) })));
  router.get('/dms/:id/dokumente', h(async (req, res) => res.json(await service.dmsListe(req.benutzer.id, req.params.id, {
    seite: req.query.seite === undefined ? 1 : Number(req.query.seite), suche: req.query.suche === undefined ? '' : req.query.suche,
  }))));
  router.get('/dms/:id/dokumente/:dateiId', h(async (req, res) => res.json(await service.dmsDetails(req.benutzer.id, req.params.id, req.params.dateiId))));
  router.get('/dms/:id/dokumente/:dateiId/download', h(async (req, res) => {
    const file = await service.dmsDownload(req.benutzer.id, req.params.id, req.params.dateiId);
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox' });
    res.attachment(file.name).type('application/octet-stream').send(file.bytes);
  }));
  router.get('/status', (req, res) => res.json(service.status()));
  router.get('/verbindungen', h(async (req, res) => res.json({ verbindungen: await service.liste(req.benutzer.id) })));
  router.post('/verbinden', sameOrigin, h(async (req, res) => {
    if (req.body.zustimmung !== true) throw new ValidationError('Bitte die Übertragung der Anmeldung an HP bestätigen.');
    res.json(await service.verbinden(req.benutzer.id, req.body));
  }));
  router.get('/verbindungen/:id/daten/:resource', h(async (req, res) => res.json(await service.daten(req.benutzer.id, req.params.id, req.params.resource, req.query.seite === undefined ? 1 : Number(req.query.seite)))));
  router.post('/verbindungen/:id/entfernen', sameOrigin, h(async (req, res) => res.json(await service.entfernen(req.benutzer.id, req.params.id))));
  return router;
}
module.exports = { baueHausperfektRouter };
