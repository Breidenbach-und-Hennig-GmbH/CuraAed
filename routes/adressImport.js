'use strict';
const express = require('express'), auth = require('../lib/auth'), svc = require('../services/adressImport');
const { ValidationError } = require('../lib/validation');
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = (db, publicUrl) => {
  const r = express.Router();
  r.use(auth.erfordereAdmin);
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let origin;
    try { origin = new URL(publicUrl || process.env.APP_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL).origin; } catch {}
    if (!origin || req.get('origin') !== origin || !req.is('application/json')) return next(new ValidationError('Bitte den Adressimport in CuraAed öffnen.', 403));
    next();
  });
  r.post('/datei', h(async (req, res) => { const f = svc.datei(req.body || {}); res.json({ kopf: f.kopf, zuordnung: f.zuordnung, felder: svc.FELDER, anzahl: f.rows.length }); }));
  r.post('/vorschau', h(async (req, res) => res.json(await svc.plan(db, req.benutzer, req.body || {}))));
  r.post('/uebernehmen', h(async (req, res) => res.json(await svc.uebernehmen(db, req.benutzer, req.body || {}))));
  return r;
};
