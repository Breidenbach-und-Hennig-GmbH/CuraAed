'use strict';
const express = require('express'), auth = require('../lib/auth');
const { ValidationError } = require('../lib/validation');
const h = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
module.exports = function(db, publicUrl) {
  const r = express.Router(), svc = require('../services/kundenverwaltung').baue(db);
  r.use(auth.erfordereAdmin);
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'GET') return next();
    let origin; try { origin = new URL(publicUrl || process.env.APP_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL).origin; } catch {}
    if (!origin || req.get('origin') !== origin || !req.is('application/json')) return next(new ValidationError('Bitte die Kundenübernahme aus CuraAed öffnen.', 403));
    next();
  });
  r.get('/quellen', h(async(req,res) => res.json({ quellen: await svc.quellen(req.benutzer.id), firmen: await require('../services/kundenFirmen').firmen(db,req.benutzer.id) })));
  r.post('/firma',h(async(req,res)=>res.json(await require('../services/kundenFirmen').binden(db,req.benutzer.id,req.body.quelle,req.body.firma_id))));
  r.get('/', h(async(req,res) => res.json(await svc.liste(req.benutzer.id, req.query.quelle, { seite: Number(req.query.seite || 1), suche: req.query.suche || '' }))));
  r.post('/vorschau', h(async(req,res) => res.json(await svc.vorschau(req.benutzer.id, req.body.quelle, req.body.export))));
  r.post('/uebernehmen', h(async(req,res) => res.json(await svc.uebernehmen(req.benutzer.id, req.body.quelle, req.body.export, req.body.pruefwert))));
  return r;
};
