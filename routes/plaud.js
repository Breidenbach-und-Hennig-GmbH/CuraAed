'use strict';
const express = require('express');
const auth = require('../lib/auth');
const { ValidationError } = require('../lib/validation');
const { bauePlaud } = require('../services/plaud');
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function bauePlaudRouter(db, options) {
  const service = bauePlaud(db, options);
  const router = express.Router();
  router.use(auth.erfordereSchreibrecht);
  router.use((req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
  const sameOrigin = (req, res, next) => {
    if (!service.origin || req.get('origin') !== service.origin || !req.is('application/json')) return next(new ValidationError('Bitte die Plaud-Verbindung aus der App heraus öffnen.', 403));
    next();
  };
  router.get('/status', h(async (req, res) => res.json(await service.status(req.benutzer.id))));
  router.post('/verbinden', sameOrigin, h(async (req, res) => {
    if (req.body.zustimmung !== true) throw new ValidationError('Bitte den persönlichen Plaud-Zugriff zuerst bestätigen.');
    res.json(await service.verbinden(req.benutzer.id, req.sessionToken));
  }));
  router.get('/callback', h(async (req, res) => {
    const ok = await service.abschliessen(req.benutzer.id, req.sessionToken, req.query.state, req.query.code, !!req.query.error);
    res.redirect('/#/plaud?status=' + (ok ? 'verbunden' : 'abgebrochen'));
  }));
  router.post('/trennen', sameOrigin, h(async (req, res) => res.json(await service.trennen(req.benutzer.id))));
  router.get('/gespraeche', h(async (req, res) => res.json(await service.liste(req.benutzer.id, req.query.seite === undefined ? 1 : Number(req.query.seite)))));
  router.get('/gespraeche/:id/notizen', h(async (req, res) => res.json(await service.notizen(req.benutzer.id, req.params.id))));
  return router;
}
module.exports = { bauePlaudRouter };
