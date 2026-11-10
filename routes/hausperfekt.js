'use strict';
const express = require('express');
const auth = require('../lib/auth');
const { baueHpVerbindungen } = require('../services/hausperfektVerbindungen');
const { HpMobileError } = require('../services/hausperfektMobile');
const { ValidationError } = require('../lib/validation');
const h = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(e => next(e instanceof HpMobileError ? new ValidationError(e.message, e.status) : e));
function baueHausperfektRouter(db, options = {}) {
  const router = express.Router(), service = baueHpVerbindungen(db, options);
  const archiv = require('../services/hpDmsArchiv').baueArchiv(db, options.archivDir || require('node:path').join(require('node:path').dirname(db.db.filename), 'hp-dms'), service);
  router.archiv = archiv;
  router.service = service;
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
  router.get('/dms/:id/dokumente/:dateiId', h(async (req, res) => {
    const detail = await service.dmsDetails(req.benutzer.id, req.params.id, req.params.dateiId);
    const source = await archiv.remember(req.benutzer.id, req.params.id, detail);
    res.json({ ...detail, archivQuelle: source.id });
  }));
  router.get('/dms/:id/uebernahme', h(async(req,res)=>res.json(await archiv.status(req.benutzer.id,req.params.id))));
  router.post('/dms/:id/zuordnen', sameOrigin, h(async(req,res)=>res.json(await archiv.bind(req.benutzer.id,req.params.id,req.body.direktId))));
  router.post('/dms/:id/anhalten',sameOrigin,h(async(req,res)=>res.json(await archiv.stop(req.benutzer.id,req.params.id))));
  router.post('/dms/:id/uebernahme', sameOrigin, h(async(req,res)=>res.json(await archiv.start(req.benutzer.id,req.params.id,req.body.suche || ''))));
  router.get('/dms/archiv/:quelle/:dateiId',h(async(req,res)=>res.json(await archiv.details(req.benutzer.id,req.params.quelle,req.params.dateiId))));
  async function sendFile(req,res,local=false) {
    const file = local ? await archiv.localFile(req.benutzer.id,req.params.quelle,req.params.dateiId) : await archiv.store(req.benutzer.id,req.params.id,req.params.dateiId);
    const pdf = file.pdf;
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'self'" });
    if(req.query.vorschau==='1' && pdf) res.type('application/pdf').set('Content-Disposition','inline').sendFile(file.path);
    else res.attachment(file.name).type('application/octet-stream').sendFile(file.path);
  }
  router.get('/dms/archiv/:quelle/:dateiId/download',h(async(req,res)=>sendFile(req,res,true)));
  router.get('/dms/:id/dokumente/:dateiId/download', h(async (req, res) => {
    await sendFile(req,res);
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
