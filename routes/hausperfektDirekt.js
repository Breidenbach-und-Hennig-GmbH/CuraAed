'use strict';
const express = require('express');
const auth = require('../lib/auth');
const { ValidationError } = require('../lib/validation');
const { baueHpDirekt } = require('../services/hausperfektDirekt');
const h = fn => (req,res,next) => Promise.resolve(fn(req,res)).catch(next);
function baueHpDirektRouter(db, options = {}) {
  const router = express.Router(), svc = baueHpDirekt(db, options);
  router.use((req,res,next) => { res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}); next(); });
  function agentBody(req,res,next) {
    if (!req.is('application/json') || Buffer.byteLength(JSON.stringify(req.body || {})) > 4096) return next(new ValidationError('Ungültige Connector-Anfrage.',400));
    next();
  }
  const bearer = req => /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization') || '')?.[1];
  router.post('/agent/:id/poll',agentBody,h(async(req,res) => res.json(await svc.poll(req.params.id,bearer(req),req.body))));
  router.post('/agent/:id/ergebnis',agentBody,h(async(req,res) => res.json(await svc.ergebnis(req.params.id,bearer(req),req.body))));
  router.use(auth.erfordereAdmin);
  router.use((req,res,next) => {
    if (req.method === 'GET') return next();
    let origin;
    try { origin = new URL(options.publicUrl || process.env.APP_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL).origin; } catch {}
    if (!origin || req.get('origin') !== origin || !req.is('application/json')) return next(new ValidationError('Bitte die direkte HP-Verbindung aus CuraAed heraus bearbeiten.',403));
    next();
  });
  router.get('/verbindungen',h(async(req,res) => res.json({verbindungen:await svc.liste(req.benutzer.id)})));
  router.post('/verbindungen',h(async(req,res) => {
    if(req.body.zustimmung!==true)throw new ValidationError('Bitte die zeitlich begrenzte Connector-Freigabe bestätigen.');
    res.json(await svc.anlegen(req.benutzer.id,req.body));
  }));
  router.post('/verbindungen/:id/auftrag',h(async(req,res) => res.json(await svc.auftrag(req.benutzer.id,req.params.id,req.body))));
  router.post('/verbindungen/:id/trennen',h(async(req,res) => res.json(await svc.trennen(req.benutzer.id,req.params.id))));
  return router;
}
module.exports = { baueHpDirektRouter };

