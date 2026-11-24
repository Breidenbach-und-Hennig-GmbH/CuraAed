'use strict';
const express = require('express'), auth = require('../lib/auth'), { ValidationError } = require('../lib/validation');
const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = (db, publicUrl, options, uploadDir) => {
  const r = express.Router(), eddi = require('../services/eddi').baue(db, options);
  const te = require('../services/teilungserklaerung').baue(db, uploadDir, options);
  const model = require('../services/eddiModell').baue(db, options);
  r.use(auth.erfordereSchreibrecht);
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'GET') return next();
    let origin; try { origin = new URL(publicUrl || process.env.APP_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL).origin; } catch {}
    const pdfUpload = req.path === '/teilungen' && req.is('multipart/form-data');
    if (!origin || req.get('origin') !== origin || (!req.is('application/json') && !pdfUpload)) return next(new ValidationError('Bitte Eddi in CuraAed verwenden.', 403));
    next();
  });
  r.get('/status', h(async (req, res) => res.json(await eddi.status())));
  r.get('/modell',auth.erfordereAdmin,h(async(req,res)=>res.json(await model.settings())));
  r.put('/modell',auth.erfordereAdmin,h(async(req,res)=>res.json(await model.save(req.benutzer,req.body||{}))));
  r.post('/modell/test',auth.erfordereAdmin,h(async(req,res)=>{const answer=await model.complete([{role:'user',content:'Antworte nur mit OK.'}],[],20000);res.json({verbunden:!!answer.content});}));
  r.get('/chats/:id', h(async (req, res) => res.json(await eddi.history(req.benutzer, req.params.id))));
  r.post('/fragen', h(async (req, res) => res.json(await eddi.ask(req.benutzer, req.body || {}))));
  r.post('/aktionen/:id', h(async (req, res) => res.json(await eddi.bestaetigen(req.benutzer, req.params.id, req.body?.ausfuehren))));
  const upload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } }).single('datei');
  let uploadHolder=null;
  r.post('/teilungen',(req,res,next)=>{if(uploadHolder||te.aktiv())return next(new ValidationError('Eddi bearbeitet gerade ein Dokument. Bitte kurz warten.',409));const holder=uploadHolder=Symbol();res.once('close',()=>{if(uploadHolder===holder)uploadHolder=null;});next();}, (req, res, next) => upload(req, res, e => e ? next(new ValidationError('Bitte eine einzelne PDF bis 25 MB auswählen.')) : next()), h(async (req, res) => res.status(202).json(await te.starten(req.benutzer, req.file))));
  r.get('/teilungen/:id', h(async (req, res) => res.json(await te.stand(req.benutzer, req.params.id))));
  r.post('/teilungen/:id/lesen',h(async(req,res)=>res.status(202).json(await te.erneutLesen(req.benutzer,req.params.id))));
  r.post('/teilungen/:id/auswerten', h(async (req, res) => {
    if (!(await eddi.status()).bereit) throw new ValidationError('Bitte zuerst Eddis Sprachmodell einrichten.', 503);
    res.status(202).json(await te.analysieren(req.benutzer, req.params.id, req.body?.zustimmung));
  }));
  r.post('/teilungen/:id/uebernehmen', h(async (req, res) => res.json(await te.uebernehmen(req.benutzer, req.params.id, req.body || {}))));
  r.post('/teilungen/:id/vorbereitung', h(async(req,res)=>res.json(await te.vorbereiten(req.benutzer,req.params.id,req.body||{}))));
  r.get('/teilungen/:id/datei', h(async (req, res) => {
    const row = await te.own(req.benutzer, req.params.id);
    res.type('application/pdf').sendFile(require('node:path').resolve(uploadDir, require('node:path').basename(row.speicher_name)));
  }));
  r.post('/anleitungen', auth.erfordereAdmin, h(async (req, res) => {
    const b = req.body || {};
    if (typeof b.titel !== 'string' || !b.titel.trim() || b.titel.length > 200 || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 20000 || typeof b.stand !== 'string' || !b.stand.trim() || b.stand.length > 200) throw new ValidationError('Titel, Text und Stand der Anleitung angeben.');
    let url; try { url = new URL(b.quelle_url); } catch { throw new ValidationError('Gültige SharePoint-Quelle angeben.'); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.sharepoint.com') || url.username || url.password) throw new ValidationError('Als Quelle eine HTTPS-SharePoint-Adresse verwenden.');
    const result = await db.run('INSERT INTO eddi_anleitungen(titel,text,quelle_url,stand) VALUES(?,?,?,?)', [b.titel.trim(), b.text.trim(), url.href, b.stand.trim()]);
    res.status(201).json({ id: result.lastID });
  }));
  return r;
};
