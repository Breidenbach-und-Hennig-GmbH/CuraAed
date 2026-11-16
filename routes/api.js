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

function baueApi(db, uploadDir, options = {}) {
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
    'application/xml',
    'text/xml',
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

  // Der direkte Connector verwendet eigene, zeitlich begrenzte Tokens.
  // Seine Browser-Routen erzwingen innerhalb des Routers Administratorrechte.
  router.use('/hp-direkt', require('./hausperfektDirekt').baueHpDirektRouter(db, options.hpDirekt));
  router.use('/hp-adressen', require('./hpAdressSync')(db, options.hpDirekt));
  router.use('/hp-akten',require('./hpAktenImport')(db,{directory:path.join(uploadDir,'hp-dms'),publicUrl:options.hausperfekt?.publicUrl}));
  router.use('/hp-objekte', require('./hpObjektImport')(db, options.hpDirekt));

  // Alle folgenden Routen erfordern eine Anmeldung.
  router.use(auth.erfordereLogin);
  router.use('/mitarbeiterprofile',require('./mitarbeiterprofile')(db,options.hausperfekt?.publicUrl));
  const m365=require('../services/m365').baue(db,{...options.m365,publicUrl:options.m365?.publicUrl||options.hausperfekt?.publicUrl});
  router.use('/m365',require('./m365')(db,m365));
  router.use('/kalender/m365',require('./m365-kalender')(m365.kalender,m365.origin));
  const einladungVersand=require('../services/etv-versand').baue(db,uploadDir,{m365});
  router.use('/versammlungen/:vid/einladungen',require('./etv-versand')(einladungVersand,m365.origin));
  router.get('/cockpit',auth.erfordereSchreibrecht,h(async(req,res)=>res.set('Cache-Control','no-store').json(await require('../services/cockpit').stand(db,req.benutzer))));
  router.get('/cockpit/einstellungen',h(async(req,res)=>res.set('Cache-Control','no-store').json(await require('../services/cockpit').einstellungen(db,req.benutzer))));
  router.put('/cockpit/einstellungen',h(async(req,res)=>{let origin;try{origin=new URL(options.hausperfekt?.publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}if(!origin||req.get('origin')!==origin||!req.is('application/json'))throw new ValidationError('Bitte die Firmenauswahl aus den Einstellungen öffnen.',403);res.set('Cache-Control','no-store').json(await require('../services/cockpit').speichern(db,req.benutzer,req.body||{}));}));
  router.use('/tickets',require('./tickets')(db,options.hausperfekt?.publicUrl));
  router.use('/plaud', require('./plaud').bauePlaudRouter(db, options.plaud));
  const hpRouter = require('./hausperfekt').baueHausperfektRouter(db, { ...options.hausperfekt, archivDir: path.join(uploadDir, 'hp-dms') });
  router.hpArchiv = hpRouter.archiv;
  router.use('/eingangsrechnungen',require('./eingangsrechnungen').baueRouter(db,hpRouter.archiv,options.hausperfekt?.publicUrl,uploadDir));
  router.use('/hausperfekt', hpRouter);
  const vorgaengeRouter = require('./vorgaenge').baueRouter(db,{hp:hpRouter.service,archiv:hpRouter.archiv,publicUrl:options.hausperfekt?.publicUrl});
  router.use('/vorgaenge',vorgaengeRouter);
  const posteingang=require('../services/dmsPosteingang').bauePosteingang(db);
  router.use('/dms-posteingang',(req,res,next)=>{if(req.method==='GET')return next();let origin;try{origin=new URL(options.hausperfekt?.publicUrl||process.env.APP_PUBLIC_URL||process.env.RENDER_EXTERNAL_URL).origin;}catch{}if(!origin||req.get('origin')!==origin||!req.is('application/json'))return next(new ValidationError('Bitte den Posteingang aus CuraAed bearbeiten.',403));next();});
  router.get('/dms-posteingang',auth.erfordereSchreibrecht,h(async(req,res)=>res.set('Cache-Control','no-store').json(await posteingang.list(req.query))));
  router.get('/dms-posteingang/:id',auth.erfordereSchreibrecht,h(async(req,res)=>res.set('Cache-Control','no-store').json(await posteingang.detail(req.params.id))));
  router.put('/dms-posteingang/:id/metadaten',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await posteingang.saveMeta(req.benutzer.id,req.params.id,req.body))));
  router.post('/dms-posteingang',auth.erfordereSchreibrecht,h(async(req,res)=>res.status(201).json(await posteingang.add(req.benutzer.id,req.body))));
  router.put('/dms-posteingang/:id',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await posteingang.update(req.benutzer.id,req.params.id,req.body))));
  router.get('/dms-posteingang/:id/datei',auth.erfordereSchreibrecht,h(async(req,res)=>{
    if(!await db.get('SELECT 1 FROM dms_posteingang WHERE dokument_id=?',[req.params.id]))throw new ValidationError('Posteingang nicht gefunden.',404);
    const d=await archivSvc.holen(db,req.params.id),file=path.join(uploadDir,path.basename(d.speicher_name));
    if(!fs.existsSync(file))throw new ValidationError('Datei nicht mehr vorhanden.',410);
    const handle=await fs.promises.open(file,'r'),prefix=Buffer.alloc(5);try{await handle.read(prefix,0,5,0);}finally{await handle.close();}
    res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'self'"});
    await db.run('INSERT INTO dms_dokument_meta(dokument_id,zugriffe) VALUES(?,1) ON CONFLICT(dokument_id) DO UPDATE SET zugriffe=zugriffe+1',[d.id]);
    if(req.query.vorschau==='1'&&prefix.toString()==='%PDF-')res.type('application/pdf').set('Content-Disposition','inline').sendFile(file);else res.download(file,d.original_name);
  }));
  async function zisLesen(req,typ) {
    const base=typ==='objekt'?await zisSvc.objektEintraege(db,req.params.id,{suche:req.query.suche}):await zisSvc.eintraege(db,req.params.id,{suche:req.query.suche});
    if(req.benutzer.rolle==='leser')return base;
    const rows=await vorgaengeRouter.service.timeline(req.benutzer.id,typ,req.params.id,req.query.suche||'');
    const docs=await router.hpArchiv.archiveList(req.benutzer.id,{[typ==='objekt'?'objektId':'adresseId']:req.params.id,suche:req.query.suche});
    rows.push(...docs.eintraege.map(d=>({quelle:'hp_dokument',id:d.id,hp:d.hp,zeitpunkt:d.dokument_datum?d.dokument_datum+'T00:00':'',art:'DOK',text:d.titel,notiz:d.beschreibung})));
    const all=[...base.eintraege,...rows].sort((a,b)=>String(b.zeitpunkt||'').localeCompare(String(a.zeitpunkt||'')));
    return {...base,gesamt:base.gesamt+rows.length,eintraege:all.slice(0,1000)};
  }

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
  router.get('/objekte/:id/verteiler', h(async (req, res) => res.json(await verteilerSvc.liste(db, req.params.id,req.query))));
  router.get('/objekte/:id/verteiler-jahre', h(async (req, res) => res.json(await verteilerSvc.jahre(db,req.params.id))));
  router.post('/objekte/:id/verteiler', auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await verteilerSvc.anlegen(db, req.params.id, req.body || {}))));
  router.get('/verteiler/:vid', h(async (req, res) => {
    const v = await verteilerSvc.holen(db, req.params.vid,req.query);
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
  router.get('/objekte/:id/versammlungsorte',h(async(req,res)=>res.json(await versammlungenSvc.orte(db,req.params.id))));
  router.post('/objekte/:id/versammlungsorte',auth.erfordereSchreibrecht,h(async(req,res)=>res.status(201).json(await versammlungenSvc.ortMerken(db,req.params.id,req.body||{}))));
  router.get('/objekte/:id/etv-personen',h(async(req,res)=>res.json(await versammlungenSvc.teilnahmePersonen(db,req.params.id,req.query.datum))));
  router.get('/firmenbriefkoepfe',h(async(req,res)=>res.json(await require('../services/firmenbriefkoepfe').liste(db))));
  router.get('/firmenbriefkoepfe/:id/logo',h(async(req,res)=>{const f=await require('../services/firmenbriefkoepfe').holen(db,req.params.id,true);if(!f.logo)throw new ValidationError('Kein Firmenlogo hinterlegt.',404);res.type('image/png').set('Cache-Control','private, no-store').send(f.logo);}));
  router.get('/firmenbriefkoepfe/:id',h(async(req,res)=>res.json(await require('../services/firmenbriefkoepfe').holen(db,req.params.id))));
  router.post('/firmenbriefkoepfe',auth.erfordereAdmin,h(async(req,res)=>res.json(await require('../services/firmenbriefkoepfe').speichern(db,null,req.body||{}))));
  router.put('/firmenbriefkoepfe/:id',auth.erfordereAdmin,h(async(req,res)=>res.json(await require('../services/firmenbriefkoepfe').speichern(db,req.params.id,req.body||{}))));
  const etvLive=require('../services/etv-live'),etvOrigin=options.etvOrigin||process.env.PUBLIC_URL||'https://curaaed.onrender.com';
  router.get('/versammlungen/:id/live',h(async(req,res)=>{res.set('Cache-Control','no-store');res.json(await etvLive.privateState(db,req.params.id,etvOrigin,req.benutzer.id));}));
  router.put('/versammlungen/:id/live/raum',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await etvLive.setRoom(db,req.params.id,req.body||{},req.benutzer.id))));
  router.get('/versammlungen/:id/live/qr.png',h(async(req,res)=>{const s=await etvLive.privateState(db,req.params.id,etvOrigin);if(!s.raum?.aktiv)return res.status(409).json({fehler:'Bitte den QR-Zugang zuerst öffnen.'});res.set('Cache-Control','no-store');res.type('png').send(await require('qrcode').toBuffer(s.raum.einwahl_url,{errorCorrectionLevel:'M',margin:4,width:360}));}));
  router.post('/versammlungen/:id/live/zulassen',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await etvLive.approve(db,req.params.id,req.body||{},req.benutzer.id))));
  router.post('/versammlungen/:id/live/manuell',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await etvLive.revoke(db,req.params.id,req.body||{},req.benutzer.id))));
  router.post('/versammlungen/:id/live/top',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await etvLive.currentTop(db,req.params.id,req.body?.top_id,req.benutzer.id))));
  router.post('/versammlungen/:id/live/runden',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await etvLive.startVote(db,req.params.id,req.body||{},req.benutzer.id))));
  router.post('/versammlungen/:id/live/runden/:rid/stimme',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await etvLive.vote(db,req.params.id,req.params.rid,req.body||{},{user:req.benutzer.id}))));
  router.post('/versammlungen/:id/live/runden/:rid/schliessen',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await etvLive.finishVote(db,req.params.id,req.params.rid,req.body||{},req.benutzer.id))));
  router.get('/versammlungen/:id/einlass',h(async(req,res)=>res.json(await require('../services/einlass').stand(db,req.params.id))));
  router.post('/versammlungen/:id/starten',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/einlass').starten(db,req.params.id,req.body||{},req.benutzer.id))));
  router.get('/versammlungen/:id/protokoll',h(async(req,res)=>res.json(await require('../services/protokolle').stand(db,req.params.id))));
  router.put('/versammlungen/:id/protokoll',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/protokolle').speichern(db,req.params.id,req.body||{}))));
  router.post('/versammlungen/:id/protokoll.pdf',auth.erfordereSchreibrecht,h(async(req,res)=>{const pdf=await require('../services/protokolle').speichern(db,req.params.id,req.body||{},true);res.type('application/pdf').set('Cache-Control','no-store').set('Content-Disposition','attachment; filename="Versammlungsprotokoll.pdf"').send(pdf);}));
  router.get('/versammlungen/:id/einladung',h(async(req,res)=>res.json(await require('../services/einladungen').stand(db,req.params.id))));
  router.post('/versammlungen/:id/einladung.pdf',auth.erfordereSchreibrecht,h(async(req,res)=>{const pdf=await require('../services/einladungen').erstellen(db,req.params.id,req.body||{});res.type('application/pdf').set('Cache-Control','no-store').set('Content-Disposition','attachment; filename="Einladung-ETV.pdf"').send(pdf);}));
  router.get('/versammlungen/:id/teilnehmer',h(async(req,res)=>res.json(await require('../services/teilnehmer').stand(db,req.params.id))));
  router.put('/versammlungen/:id/teilnehmer',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/teilnehmer').speichern(db,req.params.id,req.body||{},req.benutzer.id))));
  router.get('/versammlungen/:id/teilnehmer.txt',h(async(req,res)=>{res.type('text/plain').set('Content-Disposition','attachment; filename="Teilnehmerliste.txt"').send(await require('../services/teilnehmer').download(db,req.params.id));}));
  router.get('/objekte/:id/stimmprinzip',h(async(req,res)=>res.json(await require('../services/abstimmungen').config(db,req.params.id))));
  router.put('/objekte/:id/stimmprinzip',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/abstimmungen').saveConfig(db,req.params.id,req.body||{}))));
  router.get('/versammlungen/:vid/tops/:tid/abstimmung',h(async(req,res)=>res.json(await require('../services/abstimmungen').stand(db,req.params.vid,req.params.tid))));
  router.put('/versammlungen/:vid/tops/:tid/mehrheit',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/abstimmungen').saveRule(db,req.params.vid,req.params.tid,req.body||{}))));
  router.post('/versammlungen/:vid/tops/:tid/auszaehlen',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/abstimmungen').auszaehlen(db,req.params.vid,req.params.tid,req.body||{},req.benutzer.id,false))));
  router.post('/versammlungen/:vid/tops/:tid/abstimmung',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/abstimmungen').auszaehlen(db,req.params.vid,req.params.tid,req.body||{},req.benutzer.id,true))));
  router.get('/versammlungen/:vid/tops/:tid/abstimmungsverlauf',h(async(req,res)=>res.json(await require('../services/abstimmungen').verlauf(db,req.params.vid,req.params.tid))));
  router.get('/top-vorlagen',h(async(req,res)=>res.json(await require('../services/tagesordnung').vorlagen(db))));
  router.post('/top-vorlagen/:aktion',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/tagesordnung').vorlageAendern(db,req.params.aktion,req.body||{}))));
  router.post('/versammlungen/:vid/top-vorlagen-uebernehmen',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/tagesordnung').vorlagenUebernehmen(db,req.params.vid,req.body||{}))));
  router.get('/versammlungen/:vid/tops',h(async(req,res)=>res.json(await require('../services/tagesordnung').liste(db,req.params.vid))));
  router.post('/versammlungen/:vid/tops/:aktion',auth.erfordereSchreibrecht,h(async(req,res)=>res.json(await require('../services/tagesordnung').aendern(db,req.params.vid,req.params.aktion,req.body||{}))));
  router.get('/versammlungen/:vid/tagesordnung.txt',h(async(req,res)=>{const txt=await require('../services/tagesordnung').text(db,req.params.vid);res.type('text/plain; charset=utf-8').attachment('Tagesordnung-'+Number(req.params.vid)+'.txt').send(txt);}));
  const etvTeams=require('../services/etv-teams').baue(db,m365);
  const etvKalender=require('../services/etv-kalender').baue(db,m365);
  const etvSync=async(id,b)=>{await etvTeams.synchronisieren(id,b);return etvKalender.synchronisieren(id,b);};
  const etvTeamsOrigin=(req,res,next)=>{if(req.get('origin')!==m365.origin||!req.is('application/json'))return next(new (require('../lib/validation').ValidationError)('Teams bitte aus CuraAed erstellen.',403));next();};
  const etvAutoOrigin=etvTeamsOrigin;
  router.post('/versammlungen/:vid/teams',auth.erfordereSchreibrecht,etvTeamsOrigin,h(async(req,res)=>res.json(await etvSync(req.params.vid,req.body||{}))));
  router.post('/versammlungen/:vid/kalender',auth.erfordereSchreibrecht,etvTeamsOrigin,h(async(req,res)=>res.json(await etvSync(req.params.vid,{}))));
  // ETV – Eigentümerversammlungen
  router.get('/versammlungen', h(async (req, res) => {
    const t = (v) => (typeof v === 'string' ? v : '');
    res.json(await versammlungenSvc.liste(db, { archiv: req.query.archiv === '1', suche: t(req.query.suche), sort: t(req.query.sort), objekt_id: t(req.query.objekt) }));
  }));
  router.post('/versammlungen', auth.erfordereSchreibrecht,etvAutoOrigin,
    h(async (req, res) => {const v=await versammlungenSvc.anlegen(db, req.body || {}, req.benutzer.id);res.status(201).json(await etvSync(v.id,req.body||{}));}));
  router.get('/versammlungen/:vid', h(async (req, res) => {
    const v = await versammlungenSvc.holen(db, req.params.vid);
    if (!v) return res.status(404).json({ fehler: 'Versammlung nicht gefunden.' });
    res.json(v);
  }));
  router.put('/versammlungen/:vid', auth.erfordereSchreibrecht,etvAutoOrigin,
    h(async (req, res) => {const v=await versammlungenSvc.aktualisieren(db, req.params.vid, req.body || {});res.json(await etvSync(v.id,req.body||{}));}));
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
  router.get('/objekte/:id/zis', h(async (req, res) => res.json(await zisLesen(req,'objekt'))));
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
  router.post('/adressen/dubletten',auth.erfordereSchreibrecht,h(async(req,res)=>res.set('Cache-Control','no-store').json(await require('../services/adressDubletten').pruefen(db,req.body||{}))));
  router.post(
    '/adressen',
    auth.erfordereSchreibrecht,
    h(async (req, res) => res.status(201).json(await mitHistorie(req, 'adresse', null, () => db.transaktion(async tx=>{await require('../services/adressDubletten').neuanlagePruefen(tx,req.body||{});const hp=require('../services/hpAdressNeuanlage'),prepared=await hp.vorbereiten(tx,req.benutzer.id,req.body||{}),a=await adressenSvc.anlegen(tx,req.body);await hp.einreihen(tx,a.id,prepared);return hp.metadata(tx,a);}))))
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
    h(async (req, res) => res.json(await telefonSvc.aktualisieren(db, req.params.kid, req.body || {}, req.benutzer.id))));
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
  router.get('/wiedervorlagen/faellig', h(async (req, res) => res.json([...(await kontakteSvc.faelligeWiedervorlagen(db, req.benutzer.id)),...(req.benutzer.rolle==='leser'?[]:await vorgaengeRouter.service.due(req.benutzer.id))])));
  router.put('/wiedervorlagen/:wid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await kontakteSvc.wiedervorlageAktualisieren(db, req.params.wid, req.body || {}))));
  router.post('/wiedervorlagen/:wid/erledigt', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await kontakteSvc.wiedervorlageErledigt(db, req.params.wid, (req.body || {}).erledigt))));
  router.delete('/wiedervorlagen/:wid', auth.erfordereSchreibrecht,
    h(async (req, res) => res.json(await kontakteSvc.wiedervorlageLoeschen(db, req.params.wid))));
  // Z.I.S – Zentrales Informationssystem (alle Eintragungen zu einer Adresse)
  router.get('/adressen/:id/zis', h(async (req, res) => res.json(await zisLesen(req,'adresse'))));
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
    res.json((await db.all("SELECT id, name, kuerzel FROM benutzer WHERE aktiv = 1 AND rolle IN ('admin','mitarbeiter') ORDER BY name COLLATE NOCASE"))
      .map((m) => ({ ...m, kuerzel: m.kuerzel || kuerzelAus(m.name) })))));

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
      const opts = {
          suche: q.suche,
          kategorie: q.kategorie,
          objektId: q.objekt,
          einheitId: q.einheit,
          adresseId: q.adresse,
          ohneZuordnung: q.ohneZuordnung === '1',
      };
      const local = await archivSvc.liste(db, opts);
      const hp = req.benutzer.rolle === 'leser' ? { eintraege: [], mehr: false } : await router.hpArchiv.archiveList(req.benutzer.id, opts);
      const rows = [...local.eintraege, ...hp.eintraege].sort((a,b)=>String(b.dokument_datum||'').localeCompare(String(a.dokument_datum||'')));
      res.json({ eintraege: rows.slice(0,500), mehr: local.mehr || hp.mehr || rows.length>500 });
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
