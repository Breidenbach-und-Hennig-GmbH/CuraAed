'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const auth = require('../lib/auth');
const { ValidationError } = require('../lib/validation');
const objekteSvc = require('../services/objekte');
const einheitenSvc = require('../services/einheiten');
const adressenSvc = require('../services/adressen');
const zuordnungenSvc = require('../services/zuordnungen');
const archivSvc = require('../services/archiv');
const kommSvc = require('../services/kommunikation');
const kontakteSvc = require('../services/kontakte');
const telefonSvc = require('../services/telefoneingang');
const gespraechSvc = require('../services/gespraech');

/** SB-Kürzel wie in HausPerfekt: Initialen aus Vor- und Nachname („Franziska Dawid" → FD). */
const kuerzelAus = (name) => { const w = String(name || '').trim().split(/\s+/).filter(Boolean); return w.length ? (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase() : ''; };
const versandSvc = require('../services/versand');
const zisSvc = require('../services/zis');
const bankSvc = require('../services/bank');
const gesamtlisteSvc = require('../services/gesamtliste');
const verteilerSvc = require('../services/verteiler');
const objektBankSvc = require('../services/objektbank');
const versammlungenSvc = require('../services/versammlungen');
const historieSvc = require('../services/historie');
const fibuSvc = require('../services/fibu');
const pktoSvc = require('../services/personenkonten');
const kontenImportSvc = require('../services/kontenImport');
const pfktCodesSvc = require('../services/pfktCodes');
const N = require('../lib/nummern');
const benutzerSvc = require('../services/benutzer');

// Kleiner Async-Wrapper, der Fehler an den Error-Handler weiterreicht.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function baueApi(db, uploadDir) {
  const router = express.Router();

  // ---- Datei-Upload (multer) -------------------------------------------
  fs.mkdirSync(uploadDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 12);
      cb(null, crypto.randomBytes(16).toString('hex') + ext);
    },
  });
  const ERLAUBTE_MIME = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/tiff',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
  ]);
  const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (unterhalb Ingress-Limit 100 MB)
    fileFilter: (req, file, cb) => {
      if (ERLAUBTE_MIME.has(file.mimetype)) return cb(null, true);
      cb(new ValidationError('Dateityp nicht erlaubt. Erlaubt: PDF, Bilder, Office, Text/CSV.'));
    },
  });

  // ===================== Authentifizierung ==============================
  router.post(
    '/auth/login',
    h(async (req, res) => {
      const { benutzername, passwort } = req.body || {};
      const b = await benutzerSvc.pruefeAnmeldung(db, benutzername, passwort);
      if (!b) return res.status(401).json({ fehler: 'Benutzername oder Passwort falsch.' });
      const token = await auth.sitzungErstellen(db, b.id);
      auth.cookieSetzen(res, token);
      res.json({ benutzer: b });
    })
  );

  router.post(
    '/auth/logout',
    h(async (req, res) => {
      await auth.sitzungLoeschen(db, req.sessionToken);
      auth.cookieLoeschen(res);
      res.json({ ok: true });
    })
  );

  router.get('/auth/me', (req, res) => {
    res.json({ benutzer: req.benutzer || null });
  });

  router.post(
    '/auth/passwort',
    auth.erfordereLogin,
    h(async (req, res) => {
      // Eigenes Passwort ändern (aktuelles Passwort erforderlich)
      const { aktuell, neu } = req.body || {};
      const b = await benutzerSvc.pruefeAnmeldung(db, req.benutzer.benutzername, aktuell);
      if (!b) return res.status(400).json({ fehler: 'Aktuelles Passwort ist falsch.' });
      await benutzerSvc.passwortSetzen(db, req.benutzer.id, neu);
      res.json({ ok: true });
    })
  );

  // Alle folgenden Routen erfordern eine Anmeldung.
  router.use(auth.erfordereLogin);

  // ===================== Metadaten (für UI-Dropdowns) ===================
  const V = require('../lib/validation');
  router.get('/meta', (req, res) => {
    res.json({
      objekttypen: V.OBJEKTTYPEN,
      einheitstypen: V.EINHEITSTYPEN,
      adresstypen: V.ADRESSTYPEN,
      rollen: V.ROLLEN,
      dokumentKategorien: V.DOK_KATEGORIEN,
      benutzerRollen: V.BENUTZER_ROLLEN,
    });
  });

  // Änderungshistorie (Adressen): Datensatz vor/nach der Änderung vergleichen und protokollieren.
  // idVorher = null beim Anlegen (ID kommt dann aus dem Ergebnis).
  async function mitHistorie(req, bereich, idVorher, ausfuehren) {
    const alt = idVorher ? await historieSvc.zeile(db, bereich, idVorher) : null;
    const ergebnis = await ausfuehren();
    const id = idVorher || (ergebnis && ergebnis.id);
    const neu = await historieSvc.zeile(db, bereich, id);
    await historieSvc.protokollieren(db, { bereich, alt, neu, wer: historieSvc.akteur(req.benutzer) });
    return ergebnis;
  }

  // ===================== Objekte ========================================
  router.get(
    '/objekte',
    h(async (req, res) => {
      const { suche, objekttyp, archiviert } = req.query;
      res.json(await objekteSvc.liste(db, { suche, objekttyp, archiviert }));
    })
  );
  router.post(
    '/objekte',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await objekteSvc.anlegen(db, req.body)))
  );
  router.get(
    '/objekte/:id',
    h(async (req, res) => {
      const o = await objekteSvc.holen(db, req.params.id);
      if (!o) return res.status(404).json({ fehler: 'Objekt nicht gefunden.' });
      res.json(o);
    })
  );
  router.put(
    '/objekte/:id',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await objekteSvc.aktualisieren(db, req.params.id, req.body)))
  );
  router.post(
    '/objekte/:id/archiv',
    auth.erfordereSchreibrecht,
    h(async (req, res) =>
      res.json(await objekteSvc.setzeArchiviert(db, req.params.id, req.body.archiviert))
    )
  );

  // Einheiten eines Objekts
  router.get(
    '/objekte/:id/einheiten',
    h(async (req, res) =>
      res.json(
        await einheitenSvc.listeNachObjekt(db, req.params.id, {
          suche: req.query.suche,
          mitArchiv: req.query.mitArchiv === '1',
        })
      )
    )
  );
  router.post(
    '/objekte/:id/einheiten',
    auth.erfordereSchreibrecht,
    h(async (req, res) =>
      res.status(201).json(await einheitenSvc.anlegen(db, req.params.id, req.body))
    )
  );

  // Zuordnungen eines Objekts
  router.get(
    '/objekte/:id/zuordnungen',
    h(async (req, res) => res.json(await zuordnungenSvc.nachObjekt(db, req.params.id)))
  );
  // Objektmaske: Verteilerschlüssel, Bankkonten, Kennzahlen, Z.I.S, Bild
  router.get('/objekte/:id/verteiler', h(async (req, res) => res.json(await verteilerSvc.liste(db, req.params.id))));
  router.post('/objekte/:id/verteiler', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await verteilerSvc.anlegen(db, req.params.id, req.body || {}))));
  router.get('/verteiler/:vid', h(async (req, res) => {
    const v = await verteilerSvc.holen(db, req.params.vid);
    if (!v) return res.status(404).json({ fehler: 'Verteilerschlüssel nicht gefunden.' });
    res.json(v);
  }));
  router.put('/verteiler/:vid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await verteilerSvc.aktualisieren(db, req.params.vid, req.body || {}))));
  router.delete('/verteiler/:vid', auth.erfordereSchreibrecht,
    h(async (req, res) => { await verteilerSvc.loeschen(db, req.params.vid); res.json({ ok: true }); }));
  router.get('/objekte/:id/bank', h(async (req, res) => res.json(await objektBankSvc.liste(db, req.params.id))));
  router.post('/objekte/:id/bank', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await objektBankSvc.anlegen(db, req.params.id, req.body || {}))));
  router.put('/objektbank/:bid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await objektBankSvc.aktualisieren(db, req.params.bid, req.body || {}))));
  router.delete('/objektbank/:bid', auth.erfordereSchreibrecht,
    h(async (req, res) => { await objektBankSvc.loeschen(db, req.params.bid); res.json({ ok: true }); }));
  // ETV – Eigentümerversammlungen
  router.get('/versammlungen', h(async (req, res) => {
    const t = (v) => (typeof v === 'string' ? v : '');
    res.json(await versammlungenSvc.liste(db, { archiv: req.query.archiv === '1', suche: t(req.query.suche), sort: t(req.query.sort), objekt_id: t(req.query.objekt) }));
  }));
  router.post('/versammlungen', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await versammlungenSvc.anlegen(db, req.body || {}, req.benutzer.id))));
  router.get('/versammlungen/:vid', h(async (req, res) => {
    const v = await versammlungenSvc.holen(db, req.params.vid);
    if (!v) return res.status(404).json({ fehler: 'Versammlung nicht gefunden.' });
    res.json(v);
  }));
  router.put('/versammlungen/:vid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await versammlungenSvc.aktualisieren(db, req.params.vid, req.body || {}))));
  router.post('/versammlungen/:vid/archiv', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await versammlungenSvc.archivieren(db, req.params.vid, (req.body || {}).archiviert))));
  router.delete('/versammlungen/:vid', auth.erfordereSchreibrecht,
    h(async (req, res) => { await versammlungenSvc.loeschen(db, req.params.vid); res.json({ ok: true }); }));
  // FIBU je Objekt: Grundwerte, Buchungsjahre, Kontenrahmen
  router.get('/objekte/:id/fibu', h(async (req, res) => res.json(await fibuSvc.grundwerte(db, req.params.id))));
  router.put('/objekte/:id/fibu', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await fibuSvc.grundwerteSpeichern(db, req.params.id, req.body || {}))));
  router.post('/objekte/:id/fibu/buchungsjahr', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await fibuSvc.buchungsjahrAnlegen(db, req.params.id))));
  router.get('/objekte/:id/sachkonten', h(async (req, res) =>
    res.json(await fibuSvc.konten(db, req.params.id, typeof req.query.jahr === 'string' ? req.query.jahr : ''))));
  router.post('/objekte/:id/sachkonten', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await fibuSvc.kontoAnlegen(db, req.params.id, req.body || {}))));
  // Kontenrahmen aus HausPerfekt-Export (Excel/CSV) – ?pruefen=1 nur auswerten, sonst importieren
  const tabellenUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  router.post('/objekte/:id/sachkonten/import', auth.erfordereSchreibrecht, tabellenUpload.single('datei'),
    h(async (req, res) => {
      if (!req.file) throw new ValidationError('Keine Datei übermittelt.');
      if (!/\.(xlsx|csv|txt)$/i.test(req.file.originalname || '')) throw new ValidationError('Bitte eine Excel-Datei (.xlsx) oder CSV-Datei wählen.');
      res.json(await kontenImportSvc.importieren(db, req.params.id, req.file.buffer, { ausfuehren: req.query.pruefen !== '1' }));
    }));
  router.post('/objekte/:id/sachkonten/vorlage', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await fibuSvc.kontenAusVorlage(db, req.params.id))));
  router.post('/objekte/:id/sachkonten/kopieren', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await fibuSvc.kontenKopieren(db, req.params.id, (req.body || {}).von_objekt_id))));
  router.put('/sachkonten/:kid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await fibuSvc.kontoAendern(db, req.params.kid, req.body || {}))));
  router.delete('/sachkonten/:kid', auth.erfordereSchreibrecht,
    h(async (req, res) => { await fibuSvc.kontoLoeschen(db, req.params.kid); res.json({ ok: true }); }));
  // Personenfunktions-Codes (001 Eigentümer eigengenutzt, 002 Eigentümer fremdvermietet …) – Pflege nur Admin
  router.get('/pfkt-codes', h(async (req, res) => res.json(await pfktCodesSvc.liste(db))));
  router.put('/pfkt-codes', auth.erfordereAdmin, h(async (req, res) => res.json(await pfktCodesSvc.speichern(db, req.body || {}))));
  router.delete('/pfkt-codes/:code', auth.erfordereAdmin, h(async (req, res) => { await pfktCodesSvc.loeschen(db, req.params.code); res.json({ ok: true }); }));
  // Personenkonten (Debitoren) und Sollwerte (W.Soll)
  router.get('/einheiten/:id/personenkonten', h(async (req, res) => res.json(await pktoSvc.nachEinheit(db, req.params.id))));
  router.get('/adressen/:id/personenkonten', h(async (req, res) => res.json(await pktoSvc.nachAdresse(db, req.params.id))));
  router.get('/objekte/:id/personenkonten', h(async (req, res) => res.json(await pktoSvc.nachObjekt(db, req.params.id))));
  router.post('/personenkonten', auth.erfordereSchreibrecht, h(async (req, res) => res.status(201).json(await pktoSvc.anlegen(db, req.body || {}))));
  router.get('/personenkonten/:pid', h(async (req, res) => {
    const p = await pktoSvc.holen(db, req.params.pid);
    if (!p) return res.status(404).json({ fehler: 'Personenkonto nicht gefunden.' });
    res.json(p);
  }));
  router.put('/personenkonten/:pid', auth.erfordereSchreibrecht, h(async (req, res) => res.json(await pktoSvc.aendern(db, req.params.pid, req.body || {}))));
  router.delete('/personenkonten/:pid', auth.erfordereSchreibrecht, h(async (req, res) => { await pktoSvc.loeschen(db, req.params.pid); res.json({ ok: true }); }));
  router.post('/personenkonten/:pid/sollwerte', auth.erfordereSchreibrecht, h(async (req, res) => res.status(201).json(await pktoSvc.sollAnlegen(db, req.params.pid, req.body || {}))));
  router.put('/pkto-sollwerte/:sid', auth.erfordereSchreibrecht, h(async (req, res) => res.json(await pktoSvc.sollAendern(db, req.params.sid, req.body || {}))));
  router.delete('/pkto-sollwerte/:sid', auth.erfordereSchreibrecht, h(async (req, res) => { await pktoSvc.sollLoeschen(db, req.params.sid); res.json({ ok: true }); }));
  router.get('/objekte/:id/kennzahlen', h(async (req, res) => res.json(await objekteSvc.kennzahlen(db, req.params.id))));
  router.get('/objekte/:id/zis', h(async (req, res) => res.json(await zisSvc.objektEintraege(db, req.params.id, { suche: req.query.suche }))));
  // Neuestes Foto (Archiv-Kategorie „foto") des Objekts für das Bildfeld
  router.get('/objekte/:id/bild', h(async (req, res) => {
    const d = await db.get(
      `SELECT d.id, d.titel FROM dokumente d JOIN archiv_verknuepfungen v ON v.dokument_id = d.id AND v.objekt_id = ?
       WHERE d.kategorie = 'foto' AND d.mime_type IN ('image/jpeg','image/png','image/gif','image/webp')
       ORDER BY COALESCE(d.dokument_datum, d.erstellt_am) DESC, d.id DESC LIMIT 1`,
      [req.params.id]
    );
    res.json(d || null);
  }));

  // ===================== Einheiten ======================================
  router.get(
    '/einheiten',
    h(async (req, res) =>
      res.json(
        await einheitenSvc.suche(db, {
          suche: req.query.suche,
          einheitstyp: req.query.einheitstyp,
          mitArchiv: req.query.mitArchiv === '1',
        })
      )
    )
  );
  router.get(
    '/einheiten/:id',
    h(async (req, res) => {
      const e = await einheitenSvc.holen(db, req.params.id);
      if (!e) return res.status(404).json({ fehler: 'Einheit nicht gefunden.' });
      res.json(e);
    })
  );
  router.put(
    '/einheiten/:id',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await einheitenSvc.aktualisieren(db, req.params.id, req.body)))
  );
  router.post(
    '/einheiten/:id/archiv',
    auth.erfordereSchreibrecht,
    h(async (req, res) =>
      res.json(await einheitenSvc.setzeArchiviert(db, req.params.id, req.body.archiviert))
    )
  );
  router.get(
    '/einheiten/:id/zuordnungen',
    h(async (req, res) => res.json(await zuordnungenSvc.nachEinheit(db, req.params.id)))
  );

  // ===================== Adressen =======================================
  router.get(
    '/adressen',
    h(async (req, res) => {
      const { suche, adresstyp, archiviert } = req.query;
      res.json(await adressenSvc.liste(db, { suche, adresstyp, archiviert }));
    })
  );
  // „Gesamtliste Adresse" (Suche aus der Adressmaske, Taste s)
  router.get(
    '/adressen/gesamtliste',
    h(async (req, res) => {
      const t = (v) => (typeof v === 'string' ? v : '');
      const { filter, modus, q, feld, rolle } = req.query;
      res.json(await gesamtlisteSvc.liste(db, { filter: t(filter), modus: t(modus), q: t(q), feld: t(feld), rolle: t(rolle) }));
    })
  );
  router.post(
    '/adressen',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await mitHistorie(req, 'adresse', null, () => adressenSvc.anlegen(db, req.body))))
  );
  router.get(
    '/adressen/:id',
    h(async (req, res) => {
      const a = await adressenSvc.holen(db, req.params.id);
      if (!a) return res.status(404).json({ fehler: 'Adresse nicht gefunden.' });
      res.json(a);
    })
  );
  router.put(
    '/adressen/:id',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await mitHistorie(req, 'adresse', req.params.id, () => adressenSvc.aktualisieren(db, req.params.id, req.body))))
  );
  router.post(
    '/adressen/:id/archiv',
    auth.erfordereSchreibrecht,
    h(async (req, res) =>
      res.json(await mitHistorie(req, 'adresse', req.params.id, () => adressenSvc.setzeArchiviert(db, req.params.id, req.body.archiviert)))
    )
  );
  router.get(
    '/adressen/:id/zuordnungen',
    h(async (req, res) => res.json(await zuordnungenSvc.nachAdresse(db, req.params.id)))
  );

  // ---- Kommunikation einer Adresse (Telefon, E-Mail/Web, Ansprechpartner)
  router.get(
    '/adressen/:id/kommunikation',
    h(async (req, res) => res.json(await kommSvc.liste(db, req.params.id)))
  );
  router.get(
    '/adressen/:id/vcard',
    h(async (req, res) => {
      const v = await kommSvc.vcard(db, req.params.id);
      res.attachment(v.dateiname);
      res.type('text/vcard; charset=utf-8').send(v.text);
    })
  );
  for (const [pfad, bereich, anlegen, aendern, loeschen] of [
    ['telefone', 'telefon', kommSvc.telefonAnlegen, kommSvc.telefonAktualisieren, kommSvc.telefonLoeschen],
    ['emails', 'email', kommSvc.emailAnlegen, kommSvc.emailAktualisieren, kommSvc.emailLoeschen],
    ['ansprechpartner', 'ansprechpartner', kommSvc.apAnlegen, kommSvc.apAktualisieren, kommSvc.apLoeschen],
  ]) {
    router.post(`/adressen/:id/${pfad}`, auth.erfordereSchreibrecht,
      h(async (req, res) => res.status(201).json(await mitHistorie(req, bereich, null, () => anlegen(db, req.params.id, req.body || {})))));
    router.put(`/${pfad}/:kid`, auth.erfordereSchreibrecht,
      h(async (req, res) => res.json(await mitHistorie(req, bereich, req.params.kid, () => aendern(db, req.params.kid, req.body || {})))));
    router.delete(`/${pfad}/:kid`, auth.erfordereSchreibrecht,
      h(async (req, res) => res.json(await mitHistorie(req, bereich, req.params.kid, () => loeschen(db, req.params.kid)))));
  }

  // ---- Adress-Akte: Ampel, Kontaktprotokoll, Wiedervorlagen
  router.get('/adressen/:id/akte', h(async (req, res) => res.json(await kontakteSvc.uebersicht(db, req.params.id))));
  router.put('/adressen/:id/datenschutz', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await mitHistorie(req, 'adresse', req.params.id, () => adressenSvc.datenschutzSetzen(db, req.params.id, req.body || {})))));
  router.put('/adressen/:id/ampel', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await mitHistorie(req, 'ampel', req.params.id, () => kontakteSvc.ampelSetzen(db, req.params.id, req.body || {}, req.benutzer.id)))));
  // Telefoneingang (Strg+E)
  router.get('/telefoneingaenge/offen', h(async (req, res) =>
    res.json(await telefonSvc.offen(db, { benutzerId: req.query.alle === '1' ? null : req.benutzer.id }))));
  // Plaud-Aufnahme/-Export → Zusammenfassung (Audio nur im Arbeitsspeicher, wird nicht gespeichert)
  const aufnahmeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 95 * 1024 * 1024, files: 1 } });
  router.get('/gespraech/status', h(async (req, res) => res.json({ eingerichtet: gespraechSvc.eingerichtet() })));
  router.post('/gespraech/zusammenfassen', auth.erfordereSchreibrecht, aufnahmeUpload.single('datei'),
    h(async (req, res) => {
      const b = req.body || {};
      res.json(await gespraechSvc.verarbeiten(req.file, { modus: b.modus, zustimmung: b.zustimmung, kontext: b.kontext }));
    }));
  router.get('/telefoneingaenge/:kid', h(async (req, res) => res.json(await telefonSvc.holen(db, req.params.kid))));
  router.post('/telefoneingaenge', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await telefonSvc.anlegen(db, req.body || {}, req.benutzer.id))));
  router.put('/telefoneingaenge/:kid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await telefonSvc.aktualisieren(db, req.params.kid, req.body || {}))));
  router.get('/adressen/:id/kontakte', h(async (req, res) => res.json(await kontakteSvc.kontakteListe(db, req.params.id))));
  router.post('/adressen/:id/kontakte', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await kontakteSvc.kontaktAnlegen(db, req.params.id, req.body || {}, req.benutzer.id))));
  router.put('/kontakte/:kid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await kontakteSvc.kontaktAktualisieren(db, req.params.kid, req.body || {}))));
  router.delete('/kontakte/:kid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await kontakteSvc.kontaktLoeschen(db, req.params.kid))));
  router.get('/adressen/:id/wiedervorlagen', h(async (req, res) =>
    res.json(await kontakteSvc.wiedervorlagenListe(db, req.params.id, { mitErledigten: req.query.alle === '1' }))));
  router.post('/adressen/:id/wiedervorlagen', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await kontakteSvc.wiedervorlageAnlegen(db, req.params.id, req.body || {}, req.benutzer.id))));
  router.get('/wiedervorlagen/faellig', h(async (req, res) => res.json(await kontakteSvc.faelligeWiedervorlagen(db, req.benutzer.id))));
  router.put('/wiedervorlagen/:wid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await kontakteSvc.wiedervorlageAktualisieren(db, req.params.wid, req.body || {}))));
  router.post('/wiedervorlagen/:wid/erledigt', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await kontakteSvc.wiedervorlageErledigt(db, req.params.wid, (req.body || {}).erledigt))));
  router.delete('/wiedervorlagen/:wid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await kontakteSvc.wiedervorlageLoeschen(db, req.params.wid))));
  // Z.I.S – Zentrales Informationssystem (alle Eintragungen zu einer Adresse)
  router.get('/adressen/:id/zis', h(async (req, res) => res.json(await zisSvc.eintraege(db, req.params.id, { suche: req.query.suche }))));
  // Bankverbindungen (inkl. SEPA-Lastschriftmandat)
  router.get('/adressen/:id/bank', h(async (req, res) => res.json(await bankSvc.liste(db, req.params.id))));
  router.post('/adressen/:id/bank', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await mitHistorie(req, 'bank', null, () => bankSvc.anlegen(db, req.params.id, req.body || {})))));
  router.put('/bank/:bid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await mitHistorie(req, 'bank', req.params.bid, () => bankSvc.aktualisieren(db, req.params.bid, req.body || {})))));
  router.delete('/bank/:bid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await mitHistorie(req, 'bank', req.params.bid, () => bankSvc.loeschen(db, req.params.bid)))));
  // IBAN-Plausibilitätsprüfung mit Bankermittlung (lokal, Bankleitzahlendatei der Bundesbank)
  router.get('/iban/pruefen', h(async (req, res) => {
    const t = (v) => (typeof v === 'string' ? v.slice(0, 50) : '');
    res.json(require('../lib/iban').pruefen(t(req.query.iban), t(req.query.bic)));
  }));
  // Portooptimierung (Versandoptionen je Adresse)
  router.get('/adressen/:id/versand', h(async (req, res) => res.json(await versandSvc.holen(db, req.params.id))));
  router.put('/adressen/:id/versand', auth.erfordereSchreibrecht,
    h(async (req, res) => {
      const vorher = await versandSvc.holen(db, req.params.id);
      const ergebnis = await versandSvc.speichern(db, req.params.id, req.body || {});
      const nachher = await versandSvc.holen(db, req.params.id);
      const wer = historieSvc.akteur(req.benutzer);
      const e = [];
      const basis = { adresse_id: Number(req.params.id), bereich: 'versand', aktion: 'geaendert', ...wer };
      if (vorher.standard !== nachher.standard) e.push({ ...basis, feld: 'standard', alt: vorher.standard, neu: nachher.standard });
      nachher.arten.forEach((a, i) => { if (vorher.arten[i].kanal !== a.kanal) e.push({ ...basis, feld: a.label, alt: vorher.arten[i].kanal || 'wie Standard', neu: a.kanal || 'wie Standard' }); });
      await historieSvc.schreiben(db, e);
      res.json(ergebnis);
    }));
  // Änderungshistorie einer Adresse (nur lesen – Einträge sind unveränderlich)
  router.get('/adressen/:id/historie', h(async (req, res) => {
    const t = (v) => (typeof v === 'string' ? v : '');
    res.json(await historieSvc.liste(db, req.params.id, { bereich: t(req.query.bereich), quelle: t(req.query.quelle), suche: t(req.query.suche) }));
  }));
  // Aktive Mitarbeiter (nur Name) – z. B. für „zuständig" bei Wiedervorlagen
  router.get('/mitarbeiter', h(async (req, res) =>
    res.json((await db.all("SELECT id, name FROM benutzer WHERE aktiv = 1 AND rolle IN ('admin','mitarbeiter') ORDER BY name COLLATE NOCASE"))
      .map((m) => ({ ...m, kuerzel: kuerzelAus(m.name) })))));

  // ===================== Zuordnungen (Rollen) ===========================
  router.post(
    '/zuordnungen',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await mitHistorie(req, 'personenfunktion', null, () => zuordnungenSvc.anlegen(db, req.body))))
  );
  router.put(
    '/zuordnungen/:id',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await mitHistorie(req, 'personenfunktion', req.params.id, () => zuordnungenSvc.aktualisieren(db, req.params.id, req.body))))
  );
  router.post(
    '/zuordnungen/:id/beenden',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await mitHistorie(req, 'personenfunktion', req.params.id, () => zuordnungenSvc.beenden(db, req.params.id, req.body.datum))))
  );
  router.delete(
    '/zuordnungen/:id',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await mitHistorie(req, 'personenfunktion', req.params.id, () => zuordnungenSvc.loeschen(db, req.params.id))))
  );

  // ===================== Zentrales Archiv ===============================
  // Nummern auflösen (Live-Prüfung im Upload-/Zuordnungsdialog):
  // GET /api/nummern?objekt=1001,1002&einheit=1001-01&adresse=10001
  router.get(
    '/nummern',
    h(async (req, res) => {
      const out = {};
      for (const typ of Object.keys(archivSvc.TYPEN)) {
        const liste = N.nummernListe(req.query[typ], archivSvc.TYPEN[typ].feld);
        out[typ] = await archivSvc.nummernAufloesen(db, typ, liste);
      }
      res.json(out);
    })
  );

  router.get(
    '/archiv',
    h(async (req, res) => {
      const q = req.query;
      res.json(
        await archivSvc.liste(db, {
          suche: q.suche,
          kategorie: q.kategorie,
          objektId: q.objekt,
          einheitId: q.einheit,
          adresseId: q.adresse,
          ohneZuordnung: q.ohneZuordnung === '1',
        })
      );
    })
  );

  router.post(
    '/archiv',
    auth.erfordereSchreibrecht,
    upload.single('datei'),
    h(async (req, res) => {
      if (!req.file) throw new ValidationError('Keine Datei übermittelt.');
      try {
        const b = req.body || {};
        const eintrag = await archivSvc.anlegen(
          db,
          {
            titel: b.titel || req.file.originalname,
            kategorie: b.kategorie,
            beschreibung: b.beschreibung,
            dokument_datum: b.dokument_datum,
            original_name: req.file.originalname,
            speicher_name: req.file.filename,
            mime_type: req.file.mimetype,
            groesse: req.file.size,
            quelle: 'upload',
            hochgeladen_von: req.benutzer.id,
          },
          { objekt: b.objekt_nr, einheit: b.einheit_nr, adresse: b.adresse_nr }
        );
        res.status(201).json(eintrag);
      } catch (e) {
        // Datei wieder entfernen, wenn der Eintrag nicht gespeichert wurde.
        fs.unlink(path.join(uploadDir, req.file.filename), () => {});
        throw e;
      }
    })
  );

  router.get(
    '/archiv/:id',
    h(async (req, res) => {
      const d = await archivSvc.holen(db, req.params.id);
      if (!d) return res.status(404).json({ fehler: 'Archiv-Eintrag nicht gefunden.' });
      res.json(d);
    })
  );
  router.put(
    '/archiv/:id',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await archivSvc.aktualisierenMeta(db, req.params.id, req.body)))
  );
  router.get(
    '/archiv/:id/download',
    h(async (req, res) => {
      const d = await archivSvc.holen(db, req.params.id);
      if (!d) return res.status(404).json({ fehler: 'Archiv-Eintrag nicht gefunden.' });
      // speicher_name stammt vom Server (Zufallsname); basename gegen Pfad-Tricks.
      const p = path.join(uploadDir, path.basename(d.speicher_name));
      if (!fs.existsSync(p)) return res.status(410).json({ fehler: 'Datei nicht mehr vorhanden.' });
      res.download(p, d.original_name);
    })
  );
  // Bild-Vorschau (nur Rasterbilder, kein SVG) – inline mit festem Content-Type
  router.get(
    '/archiv/:id/bild',
    h(async (req, res) => {
      const d = await archivSvc.holen(db, req.params.id);
      const erlaubt = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!d || !erlaubt.includes(d.mime_type)) return res.status(404).json({ fehler: 'Kein Bild.' });
      const p = path.join(uploadDir, path.basename(d.speicher_name));
      if (!fs.existsSync(p)) return res.status(410).json({ fehler: 'Datei nicht mehr vorhanden.' });
      res.set({ 'Content-Type': d.mime_type, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Cache-Control': 'private, max-age=300' });
      fs.createReadStream(p).pipe(res);
    })
  );
  router.delete(
    '/archiv/:id',
    auth.erfordereSchreibrecht,
    h(async (req, res) => {
      const d = await archivSvc.loeschen(db, req.params.id);
      fs.unlink(path.join(uploadDir, path.basename(d.speicher_name)), () => {});
      res.json({ geloescht: true });
    })
  );
  router.post(
    '/archiv/:id/verknuepfungen',
    auth.erfordereSchreibrecht,
    h(async (req, res) => {
      const { typ, nummer } = req.body || {};
      res.status(201).json(await archivSvc.verknuepfen(db, req.params.id, typ, nummer));
    })
  );
  router.delete(
    '/archiv/verknuepfungen/:vid',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await archivSvc.verknuepfungLoeschen(db, req.params.vid)))
  );

  // ===================== Benutzerverwaltung (nur Admin) =================
  router.get('/benutzer', auth.erfordereAdmin, h(async (req, res) => res.json(await benutzerSvc.liste(db))));
  router.post(
    '/benutzer',
    auth.erfordereAdmin,
    h(async (req, res) => res.status(201).json(await benutzerSvc.anlegen(db, req.body)))
  );
  router.put(
    '/benutzer/:id',
    auth.erfordereAdmin,
    h(async (req, res) => res.json(await benutzerSvc.aktualisieren(db, req.params.id, req.body)))
  );
  router.post(
    '/benutzer/:id/passwort',
    auth.erfordereAdmin,
    h(async (req, res) => {
      await benutzerSvc.passwortSetzen(db, req.params.id, req.body.passwort);
      res.json({ ok: true });
    })
  );

  return router;
}

module.exports = { baueApi };
