-- Hausverwaltung – Datenbankschema (Stufe 1)
-- Basisdefinitionen. openDatabase() wendet anschließend db/migrate.js an;
-- HP-Strukturen ab user_version 5 sind in db/hpStrukturen.js definiert.
-- WEG-/Mietverwaltung: Objekte, Einheiten, zentrale Adressdatenbank,
-- rollenbasierte Zuordnungen (zeitlich nachvollziehbar) und Dokumentenarchiv.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Benutzer (interne Mitarbeiter). Kundenzugänge werden in einer späteren
-- Ausbaustufe ergänzt; das Rollenmodell ist bereits darauf vorbereitet.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS benutzer (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  benutzername  TEXT NOT NULL UNIQUE,
  passwort_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT,
  kuerzel       TEXT CHECK (kuerzel IS NULL OR (length(kuerzel) BETWEEN 1 AND 3 AND kuerzel NOT GLOB '*[^A-Z]*')),
  -- interne Rollen: admin | mitarbeiter | leser
  -- vorbereitet (Stufe „Kundenzugang"): eigentuemer | mieter
  rolle         TEXT NOT NULL DEFAULT 'mitarbeiter',
  -- optionale Verknüpfung eines Kundenkontos mit einer Adresse (spätere Stufe)
  adresse_id    INTEGER REFERENCES adressen(id) ON DELETE SET NULL,
  aktiv         INTEGER NOT NULL DEFAULT 1,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Serverseitige Sitzungen (HttpOnly-Cookie-Token). Überlebt Neustarts.
CREATE TABLE IF NOT EXISTS sitzungen (
  token       TEXT PRIMARY KEY,
  benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
  ablauf_am   TEXT NOT NULL
);

-- Persönliche Plaud-Verbindungen: Tokens und Clientdaten nur verschlüsselt.
CREATE TABLE IF NOT EXISTS hp_mobile_verbindungen (
  id TEXT PRIMARY KEY,
  benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  subdomain TEXT NOT NULL,
  erp TEXT,
  daten TEXT NOT NULL,
  aktualisiert_am TEXT NOT NULL,
  UNIQUE(benutzer_id, subdomain)
);

CREATE TABLE IF NOT EXISTS plaud_verbindungen (
  benutzer_id INTEGER PRIMARY KEY REFERENCES benutzer(id) ON DELETE CASCADE,
  daten TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plaud_anmeldungen (
  state_hash TEXT PRIMARY KEY,
  benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  ablauf INTEGER NOT NULL,
  daten TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Objekte (Häuser). WEG vs. Miete unterscheidbar.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objekte (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  bezeichnung   TEXT NOT NULL,
  objekttyp     TEXT NOT NULL DEFAULT 'WEG',   -- WEG | MIETE
  strasse       TEXT,
  plz           TEXT,
  ort           TEXT,
  land          TEXT DEFAULT 'Deutschland',
  nummer        TEXT,                           -- Objekt-Nr. (eindeutig, z. B. 1001)
  baujahr       TEXT,
  notizen       TEXT,                           -- „Info" zum Objekt
  -- Objektmaske nach HausPerfekt
  objekt_art    TEXT,                           -- Objekt-Typ im Klartext, z. B. „Mehrfamilienhaus eines Eigentümers"
  buero_kst     TEXT,                           -- gehört zu Büro-KST
  sachbearbeiter_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  gruppe1 TEXT, gruppe2 TEXT, gruppe3 TEXT, gruppe4 TEXT, gruppe5 TEXT,
  heizungsart   TEXT,
  warmwasser    TEXT,
  garagenart    TEXT,
  muellgefaesse TEXT,
  anzahl_gebaeude  INTEGER,
  anzahl_eingaenge INTEGER,
  verkauf       INTEGER NOT NULL DEFAULT 1,     -- Verkauf (Eigentümerwechsel) möglich: Ja/Nein
  vermietung    INTEGER NOT NULL DEFAULT 1,     -- Vermietung: Ja/Nein
  archiviert    INTEGER NOT NULL DEFAULT 0,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Verteilerschlüssel je Objekt (Vschl.) mit Anteilen je Einheit.
-- gesamt = Gesamtanteil (z. B. 1000 MEA); die Summe der Einheitenanteile wird
-- dagegen geprüft.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verteilerschluessel (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  objekt_id   INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
  kuerzel     TEXT NOT NULL,                    -- z. B. 200, 500, SWA
  bezeichnung TEXT NOT NULL,
  gesamt      REAL,
  bemerkung   TEXT,
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (objekt_id, kuerzel)
);
CREATE TABLE IF NOT EXISTS einheit_verteilung (
  schluessel_id INTEGER NOT NULL REFERENCES verteilerschluessel(id) ON DELETE CASCADE,
  einheit_id    INTEGER NOT NULL REFERENCES einheiten(id) ON DELETE CASCADE,
  anteil        REAL NOT NULL,
  PRIMARY KEY (schluessel_id, einheit_id)
);

-- ---------------------------------------------------------------------------
-- Bankkonten des Objekts (Hausgeld-, Rücklagen-, Mietkonto …).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS objekt_bank (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  objekt_id    INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
  kontoart     TEXT NOT NULL DEFAULT 'hausgeld', -- hausgeld | ruecklage | miete | kaution | sonstiges
  kontoinhaber TEXT NOT NULL,
  iban         TEXT NOT NULL,
  bic          TEXT,
  bankname     TEXT,
  standard     INTEGER NOT NULL DEFAULT 0,
  bemerkung    TEXT,
  erstellt_am  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_objbank_objekt ON objekt_bank(objekt_id);

-- ---------------------------------------------------------------------------
-- Einheiten je Objekt (Wohnungen, Stellplätze, Gewerbe, ...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS einheiten (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  objekt_id     INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
  nummer        TEXT,                           -- Einheit-Nr. (eindeutig, z. B. 1001-01)
  bezeichnung   TEXT NOT NULL,                  -- z. B. "WE 1", "Stellplatz 3"
  einheitstyp   TEXT NOT NULL DEFAULT 'wohnung',-- wohnung | stellplatz | gewerbe | keller | sonstiges
  lage          TEXT,                           -- z. B. "2. OG links"
  flaeche_qm    REAL,
  zimmer        REAL,
  mea           TEXT,                           -- Miteigentumsanteil (WEG)
  notizen       TEXT,
  archiviert    INTEGER NOT NULL DEFAULT 0,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_einheiten_objekt ON einheiten(objekt_id);

-- ---------------------------------------------------------------------------
-- Zentrale Adressdatenbank (Person ODER Firma). Einmal anlegen, mehrfach
-- verknüpfen. Rollen werden NICHT hier gespeichert, sondern als eigene
-- Beziehung (rollen_zuordnungen), damit Mehrfachrollen möglich sind.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adressen (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nummer        TEXT,                           -- Adress-Nr. (eindeutig, z. B. 10001)
  adresstyp     TEXT NOT NULL DEFAULT 'person', -- person | firma
  anrede        TEXT,                           -- Herr | Frau | Divers | (leer)
  vorname       TEXT,
  nachname      TEXT,
  firmenname    TEXT,
  zusatz        TEXT,                           -- 2. Namenszeile (z. B. Ehepartner, „Außenstelle …“, „c/o …“)
  ansprechpartner TEXT,                         -- bei Firmen
  strasse       TEXT,
  plz           TEXT,
  ort           TEXT,
  land          TEXT DEFAULT 'Deutschland',
  email         TEXT,
  telefon       TEXT,
  mobil         TEXT,
  notizen       TEXT,
  geburtstag    TEXT,                           -- ISO-Datum
  lkto_nr       TEXT,                           -- Personenkonto-Nr. (FIBU)
  datenschutz_datum TEXT,                       -- Datum der Datenschutz-Einwilligung
  datenschutz_zustimmung TEXT,                  -- Zustimmung zur Datenweitergabe: ja | nein | NULL (nicht erfasst)
  ampel         TEXT,                           -- Mitarbeiter-Einschätzung: gruen | gelb | rot | NULL
  ampel_notiz   TEXT,
  ampel_datum   TEXT,
  ampel_von     INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  versand_standard TEXT NOT NULL DEFAULT 'post',  -- Portooptimierung: post | email | beides
  archiviert    INTEGER NOT NULL DEFAULT 0,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kommunikation je Adresse (mehrere Telefonnummern, E-Mail-Adressen/Webseiten,
-- Ansprechpartner). Die Spalten telefon/mobil/email in adressen werden daraus
-- als „Standardwerte" für Suche und Listen abgeleitet (services/kommunikation.js).
CREATE TABLE IF NOT EXISTS adress_telefone (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  adresse_id  INTEGER NOT NULL REFERENCES adressen(id) ON DELETE CASCADE,
  art         TEXT NOT NULL DEFAULT 'Telefon',  -- Telefon | Funktelefon | Fax | Geschäftlich | Privat | Sonstiges
  nummer      TEXT NOT NULL,
  bemerkung   TEXT,
  kurzwahl    TEXT,
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tel_adresse ON adress_telefone(adresse_id);

CREATE TABLE IF NOT EXISTS adress_emails (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  adresse_id  INTEGER NOT NULL REFERENCES adressen(id) ON DELETE CASCADE,
  adresse     TEXT NOT NULL,                    -- E-Mail-Adresse oder Webseite
  bemerkung   TEXT,
  ist_email   INTEGER NOT NULL DEFAULT 1,       -- 1 = E-Mail, 0 = Webseite
  standard    INTEGER NOT NULL DEFAULT 0,
  hpmobile    INTEGER NOT NULL DEFAULT 0,
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mail_adresse ON adress_emails(adresse_id);

CREATE TABLE IF NOT EXISTS adress_ansprechpartner (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  adresse_id  INTEGER NOT NULL REFERENCES adressen(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  funktion    TEXT,
  telefon     TEXT,
  email       TEXT,
  erstellt_am TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ap_adresse ON adress_ansprechpartner(adresse_id);

-- ---------------------------------------------------------------------------
-- Rollen-/Funktionszuordnung: verknüpft eine Adresse mit einem Objekt ODER
-- einer Einheit unter einer Funktionsrolle, mit optionalem Gültigkeitszeitraum.
-- Eigentümer-/Mieterwechsel werden über gueltig_von/gueltig_bis abgebildet,
-- ohne Historie zu löschen.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rollen_zuordnungen (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  adresse_id    INTEGER NOT NULL REFERENCES adressen(id) ON DELETE CASCADE,
  objekt_id     INTEGER REFERENCES objekte(id) ON DELETE CASCADE,
  einheit_id    INTEGER REFERENCES einheiten(id) ON DELETE CASCADE,
  -- rolle: eigentuemer | mieter | handwerker | beirat | verwalter_kontakt |
  --        hausmeister | sonstiges
  rolle         TEXT NOT NULL,
  gueltig_von   TEXT,                           -- ISO-Datum oder NULL (unbefristet)
  gueltig_bis   TEXT,                           -- ISO-Datum oder NULL (offen)
  anteil        TEXT,                           -- optional (z. B. Eigentumsanteil)
  notizen       TEXT,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  -- Zuordnung muss sich auf Objekt ODER Einheit beziehen (mindestens eines)
  CHECK (objekt_id IS NOT NULL OR einheit_id IS NOT NULL),
  -- Datumslogik: Ende nicht vor Beginn
  CHECK (gueltig_bis IS NULL OR gueltig_von IS NULL OR gueltig_bis >= gueltig_von)
);
CREATE INDEX IF NOT EXISTS idx_zuord_adresse ON rollen_zuordnungen(adresse_id);
CREATE INDEX IF NOT EXISTS idx_zuord_objekt  ON rollen_zuordnungen(objekt_id);
CREATE INDEX IF NOT EXISTS idx_zuord_einheit ON rollen_zuordnungen(einheit_id);

-- ---------------------------------------------------------------------------
-- Zentrales Archiv. Ein Eintrag (Dokument) wird über archiv_verknuepfungen
-- beliebig vielen Objekten, Einheiten und Adressen zugeordnet (auch keinem –
-- dann liegt er als „nicht zugeordnet" im Eingang). Feld quelle ist für
-- spätere iPad-Formulare (Stufe 2), E-Mails (Stufe 3) und Rechnungen (Stufe 4).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dokumente (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  titel           TEXT NOT NULL,
  kategorie       TEXT NOT NULL DEFAULT 'sonstiges',
  -- kategorie: protokoll | vertrag | abrechnung | rechnung | korrespondenz |
  --            begehung | uebergabe | plan | foto | sonstiges
  beschreibung    TEXT,
  dokument_datum  TEXT,            -- Datum des Dokuments (ISO), nicht Upload-Datum
  original_name   TEXT NOT NULL,
  speicher_name   TEXT NOT NULL,   -- Name auf der Platte (data/uploads/)
  mime_type       TEXT,
  groesse         INTEGER,
  -- quelle: upload (manuell) | formular (Stufe 2) | email (Stufe 3) | rechnung (Stufe 4)
  quelle          TEXT NOT NULL DEFAULT 'upload',
  hochgeladen_von INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  erstellt_am     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Zuordnung eines Archiv-Eintrags zu genau EINEM Ziel je Zeile.
CREATE TABLE IF NOT EXISTS archiv_verknuepfungen (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  dokument_id  INTEGER NOT NULL REFERENCES dokumente(id) ON DELETE CASCADE,
  objekt_id    INTEGER REFERENCES objekte(id) ON DELETE CASCADE,
  einheit_id   INTEGER REFERENCES einheiten(id) ON DELETE CASCADE,
  adresse_id   INTEGER REFERENCES adressen(id) ON DELETE CASCADE,
  erstellt_am  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((objekt_id IS NOT NULL) + (einheit_id IS NOT NULL) + (adresse_id IS NOT NULL) = 1)
);
CREATE INDEX IF NOT EXISTS idx_av_dokument ON archiv_verknuepfungen(dokument_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_av_objekt  ON archiv_verknuepfungen(dokument_id, objekt_id)  WHERE objekt_id  IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_av_einheit ON archiv_verknuepfungen(dokument_id, einheit_id) WHERE einheit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_av_adresse ON archiv_verknuepfungen(dokument_id, adresse_id) WHERE adresse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_av_objekt  ON archiv_verknuepfungen(objekt_id);
CREATE INDEX IF NOT EXISTS idx_av_einheit ON archiv_verknuepfungen(einheit_id);
CREATE INDEX IF NOT EXISTS idx_av_adresse ON archiv_verknuepfungen(adresse_id);

-- Eindeutige Nummern (Groß-/Kleinschreibung egal) werden in db/migrate.js
-- angelegt, weil ältere Datenbanken die Spalten erst per ALTER TABLE erhalten.

-- ---------------------------------------------------------------------------
-- Kontaktprotokoll („Telefoneingänge"): jeder Anruf, jede E-Mail, jedes
-- persönliche Gespräch zu einer Adresse.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kontakte (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  adresse_id   INTEGER NOT NULL REFERENCES adressen(id) ON DELETE CASCADE,
  art          TEXT NOT NULL DEFAULT 'anruf',   -- anruf | email | gespraech | brief | notiz | sonstiges
  richtung     TEXT,                            -- eingehend | ausgehend | NULL
  zeitpunkt    TEXT NOT NULL,                   -- ISO 'YYYY-MM-DDTHH:MM'
  betreff      TEXT NOT NULL,
  notiz        TEXT,
  erfasst_von  INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  intern       INTEGER NOT NULL DEFAULT 0,      -- ZIS: interner Eintrag
  minuten      INTEGER,                         -- ZIS: Zeitaufwand in Minuten
  objekt_id    INTEGER REFERENCES objekte(id) ON DELETE SET NULL,
  einheit_id   INTEGER REFERENCES einheiten(id) ON DELETE SET NULL,
  -- Maske „Telefoneingang erfassen" (Strg+E)
  eingang      INTEGER NOT NULL DEFAULT 0,      -- 1 = über die Telefoneingangs-Maske erfasst
  anrufer_adresse_id INTEGER REFERENCES adressen(id) ON DELETE SET NULL,
  anrufer_name TEXT,
  rueckruf_tel TEXT,
  pfkt_code    TEXT,
  erledigt     INTEGER NOT NULL DEFAULT 1,
  rueckruf_sb_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  team         TEXT,
  zis          INTEGER NOT NULL DEFAULT 1,      -- im Z.I.S. anzeigen
  aufnahme     TEXT,                            -- Bemerkung aus Plaud: audio | text | NULL
  aufnahme_zustimmung INTEGER NOT NULL DEFAULT 0, -- Gesprächspartner hat der Aufzeichnung zugestimmt (§ 201 StGB)
  erstellt_am  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kontakte_adresse ON kontakte(adresse_id, zeitpunkt);

-- ---------------------------------------------------------------------------
-- Wiedervorlagen zu einer Adresse. quelle: manuell | handwerkerauftrag (später)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wiedervorlagen (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  adresse_id    INTEGER NOT NULL REFERENCES adressen(id) ON DELETE CASCADE,
  faellig_am    TEXT NOT NULL,                  -- ISO-Datum
  betreff       TEXT NOT NULL,
  notiz         TEXT,
  zustaendig_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  erledigt      INTEGER NOT NULL DEFAULT 0,
  erledigt_am   TEXT,
  quelle        TEXT NOT NULL DEFAULT 'manuell',
  erstellt_von  INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wv_adresse ON wiedervorlagen(adresse_id, erledigt, faellig_am);

-- ---------------------------------------------------------------------------
-- Portooptimierung: abweichender Versandweg je Dokumentart (sonst Standard).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adress_versand (
  adresse_id  INTEGER NOT NULL REFERENCES adressen(id) ON DELETE CASCADE,
  dokumentart TEXT NOT NULL,
  kanal       TEXT NOT NULL,                    -- post | email | beides
  PRIMARY KEY (adresse_id, dokumentart)
);

-- ---------------------------------------------------------------------------
-- Bankverbindungen je Adresse (Grundlage für spätere SEPA-Lastschriften/
-- Auszahlungen). Genau eine kann Standard sein.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adress_bank (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  adresse_id      INTEGER NOT NULL REFERENCES adressen(id) ON DELETE CASCADE,
  kontoinhaber    TEXT NOT NULL,
  iban            TEXT NOT NULL,                -- ohne Leerzeichen, Großbuchstaben
  bic             TEXT,
  bankname        TEXT,
  standard        INTEGER NOT NULL DEFAULT 0,
  mandatsreferenz TEXT,                         -- SEPA-Lastschriftmandat
  mandat_datum    TEXT,                         -- Datum der Unterschrift (ISO)
  mandat_aktiv    INTEGER NOT NULL DEFAULT 0,
  bemerkung       TEXT,
  erstellt_am     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bank_adresse ON adress_bank(adresse_id);

-- ---------------------------------------------------------------------------
-- Eigentümerversammlungen (ETV) – Übersicht nach Vorbild Vulcavo „Versammlungen".
-- art: praesenz | hybrid | online; status: vorbereitung | eingeladen | durchgefuehrt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS versammlungen (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  objekt_id    INTEGER NOT NULL REFERENCES objekte(id) ON DELETE RESTRICT,
  nummer       INTEGER,                         -- laufende Nr. der Versammlung im Objekt (optional)
  name         TEXT NOT NULL,                   -- z. B. „ETV 2026"
  datum        TEXT NOT NULL,                   -- ISO-Datum
  uhrzeit      TEXT,                            -- HH:MM
  art          TEXT NOT NULL DEFAULT 'praesenz',
  ort          TEXT,
  ort_strasse TEXT,
  ort_plz TEXT,
  ort_stadt TEXT,
  ort_beschreibung TEXT,
  top_revision INTEGER NOT NULL DEFAULT 1,
  leitung_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  beisitzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  protokollfuehrer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  beirat_id INTEGER REFERENCES adressen(id) ON DELETE SET NULL,
  unterzeichner_id INTEGER REFERENCES adressen(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'vorbereitung',
  notizen      TEXT,
  archiviert   INTEGER NOT NULL DEFAULT 0,
  erstellt_von INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  erstellt_am  TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_versammlungen_objekt ON versammlungen(objekt_id, datum);

-- ---------------------------------------------------------------------------
-- Änderungshistorie (Adressen): wer hat wann was geändert. Nur anhängen –
-- es gibt bewusst keine API zum Ändern oder Löschen von Einträgen.
-- quelle: intern (Mitarbeiter) | portal (Kundenportal) | system
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aenderungen (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  zeitpunkt     TEXT NOT NULL DEFAULT (datetime('now')),   -- UTC
  adresse_id    INTEGER NOT NULL,                          -- bleibt auch nach Löschen lesbar
  bereich       TEXT NOT NULL,                             -- adresse | telefon | email | ansprechpartner | bank | personenfunktion | versand | ampel
  datensatz_id  INTEGER,
  aktion        TEXT NOT NULL,                             -- angelegt | geaendert | geloescht
  feld          TEXT,
  alt           TEXT,
  neu           TEXT,
  benutzer_id   INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  benutzer_name TEXT,                                      -- Name zum Zeitpunkt der Änderung
  quelle        TEXT NOT NULL DEFAULT 'intern'
);
CREATE INDEX IF NOT EXISTS idx_aenderungen_adresse ON aenderungen(adresse_id, zeitpunkt);

-- ---------------------------------------------------------------------------
-- FIBU je Objekt (HausPerfekt „Objekt FIBU", Strg+F/Strg+S im Objekt).
-- rechnungsart: eue (Einnahmen-Überschuss – bei WEG immer) | bilanz
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fibu_objekt (
  objekt_id     INTEGER PRIMARY KEY REFERENCES objekte(id) ON DELETE CASCADE,
  rechnungsart  TEXT NOT NULL DEFAULT 'eue',
  erstes_bj     INTEGER NOT NULL,
  aktuelles_bj  INTEGER NOT NULL,
  ust_option    INTEGER NOT NULL DEFAULT 0,       -- Umsatzsteuer-Option (§ 9 UStG)
  notiz         TEXT,
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Kontenrahmen Objekt: Sachkonten 1000–9999 je Objekt
CREATE TABLE IF NOT EXISTS sachkonten (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  objekt_id      INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
  nummer         INTEGER NOT NULL,
  art            TEXT NOT NULL DEFAULT 'S',        -- S = Sachkonto
  bezeichnung    TEXT NOT NULL,
  referenz_konto INTEGER,
  aktiv          INTEGER NOT NULL DEFAULT 1,
  notiz          TEXT,
  vs_eg          TEXT,                             -- Verteilerschlüssel Eigentümer (aus HausPerfekt)
  vs_mi          TEXT,                             -- Verteilerschlüssel Mieter
  hp_attribute   TEXT,                             -- weitere Abrechnungsangaben aus HausPerfekt (JSON)
  erstellt_am    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (objekt_id, nummer)
);
-- Werte je Buchungsjahr (Wirtschaftsplan-Ansatz)
CREATE TABLE IF NOT EXISTS sachkonto_werte (
  sachkonto_id INTEGER NOT NULL REFERENCES sachkonten(id) ON DELETE CASCADE,
  jahr         INTEGER NOT NULL,
  wp_ansatz    REAL,
  PRIMARY KEY (sachkonto_id, jahr)
);

-- ---------------------------------------------------------------------------
-- Personenkonten (HausPerfekt „Personenkonto zur Wohnung", Strg+P in der Wohnung):
-- bisheriger Hauptbezug je Personenfunktion; Migration 5 ergänzt direkte Bezüge
-- und weitere Funktionszuordnungen, ohne vorhandene Hauptbezüge zu entfernen.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS personenkonten (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  objekt_id     INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
  zuordnung_id  INTEGER NOT NULL UNIQUE REFERENCES rollen_zuordnungen(id) ON DELETE RESTRICT,
  nummer        TEXT NOT NULL,                    -- PKto-Nr., z. B. 100201
  ref_nr        TEXT,
  sachbearbeiter_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  bemerkung     TEXT,                             -- Wichtige Informationen
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (objekt_id, nummer)
);
-- Sollwerte (W.Soll): monatlicher Sollstellungsbetrag ab Datum (Hausgeld als Gesamtbetrag)
CREATE TABLE IF NOT EXISTS pkto_sollwerte (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  personenkonto_id INTEGER NOT NULL REFERENCES personenkonten(id) ON DELETE CASCADE,
  gilt_ab          TEXT NOT NULL,
  bezeichnung      TEXT NOT NULL,
  netto            REAL NOT NULL,
  betrag           REAL NOT NULL,                 -- Sollstellungsbetrag (brutto)
  erstellt_am      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pkto_soll ON pkto_sollwerte(personenkonto_id, gilt_ab);

-- ---------------------------------------------------------------------------
-- Personenfunktions-Codes wie in HausPerfekt (001 Eigentümer eigengenutzt,
-- 002 Eigentümer fremdvermietet, …). Die letzte Ziffer bildet die 1. Stelle
-- der PKto-Nr. (Personenfunktion + Wechsler + Einheitsnummer).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pfkt_codes (
  code        TEXT PRIMARY KEY,                  -- dreistellig, z. B. 001 (auch 00M, $LE, SEV …)
  bezeichnung TEXT NOT NULL,
  rolle       TEXT NOT NULL,                     -- eigentuemer | mieter | handwerker | …
  kennz       TEXT                               -- HausPerfekt Mieter/Eigentümer: E | M | L | A
);
INSERT OR IGNORE INTO pfkt_codes (code, bezeichnung, rolle) VALUES
  ('001', 'Eigentümer eigengenutzt', 'eigentuemer'),
  ('002', 'Eigentümer fremdvermietet', 'eigentuemer');

-- Zeitlich begrenzter direkter HP-Test: persönliche Verbindung und dauerhafte
-- Aufträge. Ausschließlich ein benannter Testkontakt und dessen Titel.
CREATE TABLE IF NOT EXISTS hp_direkt_verbindungen (
  id TEXT PRIMARY KEY,
  benutzer_id INTEGER NOT NULL REFERENCES benutzer(id),
  name TEXT NOT NULL,
  datenbank TEXT NOT NULL,
  test_nummer INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  ablauf_ms INTEGER NOT NULL,
  aktiv INTEGER NOT NULL DEFAULT 1,
  zuletzt_gesehen INTEGER,
  snapshot TEXT,
  version TEXT,
  gelesen_am INTEGER
);
CREATE TABLE IF NOT EXISTS hp_direkt_auftraege (
  id TEXT PRIMARY KEY,
  verbindung_id TEXT NOT NULL REFERENCES hp_direkt_verbindungen(id),
  art TEXT NOT NULL CHECK (art IN ('lesen','titel')),
  status TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  daten TEXT NOT NULL,
  claim TEXT,
  abgeholt_ms INTEGER,
  result_hash TEXT,
  meldung TEXT,
  erstellt_am TEXT NOT NULL,
  erledigt_am TEXT
);
CREATE INDEX IF NOT EXISTS hp_direkt_job_status ON hp_direkt_auftraege(verbindung_id,status);

-- Ein HP-Kundenbestand je CuraAed-Installation; Adressen niemals per Name zuordnen.
CREATE TABLE IF NOT EXISTS hp_adress_verbindungen (
 id TEXT PRIMARY KEY, benutzer_id INTEGER NOT NULL REFERENCES benutzer(id),
 name TEXT NOT NULL, datenbank TEXT NOT NULL, token_hash TEXT NOT NULL,
 ablauf_ms INTEGER NOT NULL, aktiv INTEGER NOT NULL DEFAULT 1, zuletzt_gesehen INTEGER
);
CREATE TABLE IF NOT EXISTS hp_adress_zuordnung (
 verbindung_id TEXT NOT NULL REFERENCES hp_adress_verbindungen(id),
 hp_nummer INTEGER NOT NULL, adresse_id INTEGER NOT NULL UNIQUE REFERENCES adressen(id),
 basis TEXT NOT NULL, remote TEXT, ziel TEXT, claim TEXT UNIQUE, result_hash TEXT,
 status TEXT NOT NULL, meldung TEXT, unterwegs_ms INTEGER, gelesen_am TEXT,
 PRIMARY KEY(verbindung_id,hp_nummer)
);
CREATE TABLE IF NOT EXISTS hp_adress_importfehler (
 verbindung_id TEXT NOT NULL REFERENCES hp_adress_verbindungen(id),
 hp_nummer INTEGER NOT NULL, meldung TEXT NOT NULL, gesehen_am TEXT NOT NULL,
 PRIMARY KEY(verbindung_id,hp_nummer)
);
CREATE INDEX IF NOT EXISTS hp_adress_sync_status ON hp_adress_zuordnung(verbindung_id,status,unterwegs_ms);

CREATE TABLE IF NOT EXISTS hp_adress_vollfreigaben(
 verbindung_id TEXT PRIMARY KEY REFERENCES hp_adress_verbindungen(id),aktiv INTEGER NOT NULL DEFAULT 0,
 neuanlagen INTEGER NOT NULL DEFAULT 0,erstellt_am TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS hp_adress_bereiche(
 verbindung_id TEXT NOT NULL REFERENCES hp_adress_verbindungen(id),hp_nummer INTEGER NOT NULL,
 bereich TEXT NOT NULL,rohdaten TEXT NOT NULL,hash TEXT NOT NULL,status TEXT NOT NULL,meldung TEXT,
 gelesen_am TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(verbindung_id,hp_nummer,bereich)
);
CREATE TABLE IF NOT EXISTS hp_adress_detail_zuordnung(
 verbindung_id TEXT NOT NULL,hp_nummer INTEGER NOT NULL,bereich TEXT NOT NULL,quellschluessel TEXT NOT NULL,
 lokal_id INTEGER,projektion TEXT,status TEXT NOT NULL DEFAULT 'synchron',
 PRIMARY KEY(verbindung_id,hp_nummer,bereich,quellschluessel),
 FOREIGN KEY(verbindung_id,hp_nummer,bereich) REFERENCES hp_adress_bereiche(verbindung_id,hp_nummer,bereich)
);

-- Durable DMS migration: independent of OAuth connection lifetime.
CREATE TABLE IF NOT EXISTS hp_dms_quellen (id TEXT PRIMARY KEY,benutzer_id INTEGER NOT NULL REFERENCES benutzer(id),subdomain TEXT NOT NULL,direkt_id TEXT REFERENCES hp_adress_verbindungen(id),UNIQUE(benutzer_id,subdomain));
CREATE TABLE IF NOT EXISTS hp_dms_dateien (quelle_id TEXT NOT NULL REFERENCES hp_dms_quellen(id),datei_id INTEGER NOT NULL,titel TEXT NOT NULL,dateiname TEXT NOT NULL,datum TEXT,art TEXT,groesse INTEGER NOT NULL,details TEXT NOT NULL,gelesen_am TEXT NOT NULL,speicher_name TEXT,sha256 TEXT,gesichert_am TEXT,fehler TEXT,PRIMARY KEY(quelle_id,datei_id));
CREATE TABLE IF NOT EXISTS hp_dms_bezuege (quelle_id TEXT NOT NULL,datei_id INTEGER NOT NULL,art TEXT NOT NULL,hp_nummer TEXT NOT NULL,objekt_nummer TEXT NOT NULL,name TEXT NOT NULL,FOREIGN KEY(quelle_id,datei_id) REFERENCES hp_dms_dateien(quelle_id,datei_id),UNIQUE(quelle_id,datei_id,art,hp_nummer,objekt_nummer,name));
CREATE INDEX IF NOT EXISTS hp_dms_bezug_suche ON hp_dms_bezuege(quelle_id,art,hp_nummer,objekt_nummer);
CREATE TABLE IF NOT EXISTS hp_dms_auftraege (quelle_id TEXT PRIMARY KEY REFERENCES hp_dms_quellen(id),verbindung_id TEXT NOT NULL,suche TEXT NOT NULL,seite INTEGER NOT NULL,position INTEGER NOT NULL,status TEXT NOT NULL,meldung TEXT);

-- Independent work modules, scoped to the importing CuraAed account.
CREATE TABLE IF NOT EXISTS fach_vorgaenge (id INTEGER PRIMARY KEY AUTOINCREMENT,benutzer_id INTEGER NOT NULL REFERENCES benutzer(id),quelle_id TEXT REFERENCES hp_dms_quellen(id),remote_art TEXT,remote_id INTEGER,hp_nummer TEXT,art TEXT NOT NULL CHECK(art IN ('akte','handwerker','wiedervorlage','zis','notiz')),titel TEXT NOT NULL,text TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'offen',prioritaet TEXT NOT NULL DEFAULT 'normal',faellig_am TEXT,uhrzeit TEXT,zustaendig_id INTEGER REFERENCES benutzer(id),basis TEXT,remote_snapshot TEXT,remote_hash TEXT,incoming TEXT,quelle_status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),geaendert_am TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(quelle_id,remote_art,remote_id));
CREATE INDEX IF NOT EXISTS fach_vorgaenge_kontext ON fach_vorgaenge(benutzer_id,art,status,faellig_am);
CREATE TABLE IF NOT EXISTS fach_bezuege (id INTEGER PRIMARY KEY AUTOINCREMENT,vorgang_id INTEGER NOT NULL REFERENCES fach_vorgaenge(id),typ TEXT NOT NULL,ziel_id INTEGER,remote_id INTEGER,hp_nummer TEXT,objekt_nummer TEXT,name TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS fach_bezug_eindeutig ON fach_bezuege(vorgang_id,typ,COALESCE(ziel_id,0),COALESCE(remote_id,0),COALESCE(hp_nummer,''),COALESCE(objekt_nummer,''));
CREATE TABLE IF NOT EXISTS fach_verlauf (id INTEGER PRIMARY KEY AUTOINCREMENT,vorgang_id INTEGER NOT NULL REFERENCES fach_vorgaenge(id),benutzer_id INTEGER NOT NULL REFERENCES benutzer(id),aktion TEXT NOT NULL,vorher TEXT,nachher TEXT NOT NULL,erstellt_am TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS fach_import_jobs (quelle_id TEXT PRIMARY KEY REFERENCES hp_dms_quellen(id),verbindung_id TEXT NOT NULL,resource TEXT NOT NULL,seite INTEGER NOT NULL,position INTEGER NOT NULL,status TEXT NOT NULL,meldung TEXT);
CREATE TABLE IF NOT EXISTS fach_import_fehler (quelle_id TEXT NOT NULL REFERENCES hp_dms_quellen(id),resource TEXT NOT NULL,remote_id INTEGER NOT NULL,meldung TEXT NOT NULL,PRIMARY KEY(quelle_id,resource,remote_id));

-- Native inbox assignment is independent of an archive file's author (HP poc).
CREATE TABLE IF NOT EXISTS dms_posteingang (dokument_id INTEGER PRIMARY KEY REFERENCES dokumente(id) ON DELETE CASCADE,sachbearbeiter TEXT NOT NULL DEFAULT '',status TEXT NOT NULL CHECK(status IN ('offen','abgeschlossen')),revision INTEGER NOT NULL DEFAULT 1,erstellt_von INTEGER REFERENCES benutzer(id),erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),geaendert_am TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS dms_posteingang_sb ON dms_posteingang(sachbearbeiter,status);
CREATE TABLE IF NOT EXISTS dms_posteingang_verlauf (id INTEGER PRIMARY KEY AUTOINCREMENT,dokument_id INTEGER NOT NULL REFERENCES dokumente(id) ON DELETE CASCADE,benutzer_id INTEGER REFERENCES benutzer(id),aktion TEXT NOT NULL,sachbearbeiter TEXT NOT NULL,erstellt_am TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS dms_dokument_meta (dokument_id INTEGER PRIMARY KEY REFERENCES dokumente(id) ON DELETE CASCADE,oeffentlich INTEGER NOT NULL DEFAULT 0 CHECK(oeffentlich IN (0,1)),verfall_am TEXT,zugriffe INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS eingangsrechnungen (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 dokument_schluessel TEXT NOT NULL UNIQUE,
 erstellt_von INTEGER NOT NULL REFERENCES benutzer(id),
 daten TEXT NOT NULL,
 pruefungen TEXT NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 1,
 erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
 geaendert_am TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS rechnungs_verlauf (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 rechnung_id INTEGER NOT NULL REFERENCES eingangsrechnungen(id),
 benutzer_id INTEGER NOT NULL REFERENCES benutzer(id),
 vorher TEXT,
 nachher TEXT NOT NULL,
 erstellt_am TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rechnungs_erkennung (
 dokument_schluessel TEXT PRIMARY KEY,
 datei_hash TEXT NOT NULL,
 ergebnis TEXT NOT NULL,
 erstellt_am TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dokumentenarten (dokument_schluessel TEXT PRIMARY KEY,art TEXT NOT NULL DEFAULT 'DX');
INSERT OR IGNORE INTO dokumentenarten(dokument_schluessel,art) SELECT dokument_schluessel,'RE' FROM eingangsrechnungen;

CREATE TABLE IF NOT EXISTS versammlungsorte (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 objekt_id INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
 ort TEXT NOT NULL,
 ort_strasse TEXT NOT NULL DEFAULT '',
 ort_plz TEXT NOT NULL DEFAULT '',
 ort_stadt TEXT NOT NULL DEFAULT '',
 ort_beschreibung TEXT NOT NULL DEFAULT '',
 UNIQUE(objekt_id,ort,ort_strasse,ort_plz,ort_stadt,ort_beschreibung)
);

CREATE TABLE IF NOT EXISTS versammlung_tops (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 versammlung_id INTEGER NOT NULL REFERENCES versammlungen(id) ON DELETE CASCADE,
 position INTEGER NOT NULL,
 titel TEXT NOT NULL,
 art TEXT NOT NULL DEFAULT 'besprechung',
 erlaeuterung TEXT,
 beschlussvorschlag TEXT
);
CREATE INDEX IF NOT EXISTS idx_etv_tops ON versammlung_tops(versammlung_id,position,id);

CREATE TABLE IF NOT EXISTS top_vorlagen (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 titel TEXT NOT NULL,
 art TEXT NOT NULL DEFAULT 'besprechung',
 erlaeuterung TEXT,
 beschlussvorschlag TEXT,
 revision INTEGER NOT NULL DEFAULT 1,
 archiviert INTEGER NOT NULL DEFAULT 0,
 erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),
 geaendert_am TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS objekt_stimmregeln (
 objekt_id INTEGER PRIMARY KEY REFERENCES objekte(id) ON DELETE CASCADE,
 daten TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS top_stimmregeln (
 top_id INTEGER PRIMARY KEY REFERENCES versammlung_tops(id) ON DELETE CASCADE,
 daten TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS etv_abstimmungen (
 top_id INTEGER PRIMARY KEY REFERENCES versammlung_tops(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 1, snapshot TEXT NOT NULL, ergebnis TEXT NOT NULL,
 benutzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
 erstellt_am TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS etv_abstimmungsverlauf (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 top_id INTEGER NOT NULL REFERENCES versammlung_tops(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, snapshot TEXT NOT NULL, ergebnis TEXT NOT NULL,
 benutzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
 erstellt_am TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(top_id,revision)
);
CREATE TABLE IF NOT EXISTS etv_teilnahme (
 versammlung_id INTEGER PRIMARY KEY REFERENCES versammlungen(id) ON DELETE CASCADE,
 daten TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS etv_teilnahme_version (
 versammlung_id INTEGER PRIMARY KEY REFERENCES versammlungen(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, basis_hash TEXT NOT NULL,
 benutzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
 geaendert_am TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS etv_einladungen (
 versammlung_id INTEGER PRIMARY KEY REFERENCES versammlungen(id) ON DELETE CASCADE,
 daten TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS etv_protokolle (
 versammlung_id INTEGER PRIMARY KEY REFERENCES versammlungen(id) ON DELETE CASCADE,
 daten TEXT NOT NULL, quellen_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS firmenbriefkoepfe (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, daten TEXT NOT NULL,
 logo BLOB, revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS etv_durchfuehrung (
 versammlung_id INTEGER PRIMARY KEY REFERENCES versammlungen(id) ON DELETE CASCADE,
 gestartet_am TEXT NOT NULL, benutzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
 teilnahme_revision INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS etv_live (
 versammlung_id INTEGER PRIMARY KEY REFERENCES versammlungen(id) ON DELETE CASCADE,
 raum_token TEXT NOT NULL, aktiv INTEGER NOT NULL DEFAULT 1, generation INTEGER NOT NULL DEFAULT 1,
 ablauf_am TEXT NOT NULL, teams_url TEXT NOT NULL DEFAULT '', aktueller_top_id INTEGER REFERENCES versammlung_tops(id) ON DELETE SET NULL,
 revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS etv_live_anfragen (
 id TEXT PRIMARY KEY, versammlung_id INTEGER NOT NULL REFERENCES versammlungen(id) ON DELETE CASCADE,
 session_hash TEXT NOT NULL UNIQUE, generation INTEGER NOT NULL, name TEXT NOT NULL, kanal TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'wartend', erstellt_am TEXT NOT NULL, zugelassen_von INTEGER REFERENCES benutzer(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS etv_live_gruppen (
 versammlung_id INTEGER NOT NULL REFERENCES versammlungen(id) ON DELETE CASCADE, gruppen_key TEXT NOT NULL,
 anfrage_id TEXT REFERENCES etv_live_anfragen(id), modus TEXT NOT NULL DEFAULT 'manuell',
 PRIMARY KEY(versammlung_id,gruppen_key)
);
CREATE TABLE IF NOT EXISTS etv_live_runden (
 id INTEGER PRIMARY KEY AUTOINCREMENT, versammlung_id INTEGER NOT NULL REFERENCES versammlungen(id) ON DELETE CASCADE,
 top_id INTEGER NOT NULL REFERENCES versammlung_tops(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'offen', snapshot TEXT NOT NULL, ergebnis TEXT,
 geoeffnet_am TEXT NOT NULL, geschlossen_am TEXT, benutzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS etv_live_eine_offene_runde ON etv_live_runden(versammlung_id) WHERE status='offen';
CREATE TABLE IF NOT EXISTS etv_live_stimmen (
 runde_id INTEGER NOT NULL REFERENCES etv_live_runden(id) ON DELETE CASCADE, gruppen_key TEXT NOT NULL,
 stimme TEXT NOT NULL, quelle TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 anfrage_id TEXT REFERENCES etv_live_anfragen(id), benutzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
 zeit TEXT NOT NULL, PRIMARY KEY(runde_id,gruppen_key)
);
CREATE TABLE IF NOT EXISTS etv_live_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, versammlung_id INTEGER NOT NULL REFERENCES versammlungen(id) ON DELETE CASCADE,
 runde_id INTEGER REFERENCES etv_live_runden(id) ON DELETE SET NULL, aktion TEXT NOT NULL,
 daten TEXT NOT NULL, zeit TEXT NOT NULL, benutzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
 anfrage_id TEXT REFERENCES etv_live_anfragen(id)
);

-- Eigene Auftragsdaten ergänzen bestehende Vorgänge ohne HP-Abhängigkeit.
CREATE TABLE IF NOT EXISTS handwerkerauftraege (vorgang_id INTEGER PRIMARY KEY REFERENCES fach_vorgaenge(id) ON DELETE CASCADE,daten TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS handwerker_dokumente (vorgang_id INTEGER NOT NULL REFERENCES fach_vorgaenge(id) ON DELETE CASCADE,dokument_id INTEGER NOT NULL REFERENCES dokumente(id) ON DELETE CASCADE,PRIMARY KEY(vorgang_id,dokument_id));

CREATE TABLE IF NOT EXISTS handwerker_pdf (vorgang_id INTEGER PRIMARY KEY REFERENCES fach_vorgaenge(id) ON DELETE CASCADE,daten TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS cockpit_einstellungen (benutzer_id INTEGER PRIMARY KEY REFERENCES benutzer(id) ON DELETE CASCADE,firma_id INTEGER REFERENCES firmenbriefkoepfe(id) ON DELETE SET NULL,revision INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT,kontakt_id INTEGER UNIQUE REFERENCES kontakte(id) ON DELETE SET NULL,objekt_id INTEGER NOT NULL REFERENCES objekte(id),einheit_id INTEGER REFERENCES einheiten(id) ON DELETE SET NULL,adresse_id INTEGER REFERENCES adressen(id) ON DELETE SET NULL,erstellt_von INTEGER NOT NULL REFERENCES benutzer(id),zustaendig_id INTEGER NOT NULL REFERENCES benutzer(id),titel TEXT NOT NULL,beschreibung TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'offen' CHECK(status IN ('offen','in_bearbeitung','wartet','erledigt')),prioritaet TEXT NOT NULL DEFAULT 'normal' CHECK(prioritaet IN ('normal','hoch','dringend')),faellig_am TEXT,revision INTEGER NOT NULL DEFAULT 1,erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),geaendert_am TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_tickets_zustaendig ON tickets(zustaendig_id,status,faellig_am);
CREATE INDEX IF NOT EXISTS idx_tickets_objekt ON tickets(objekt_id);
CREATE TABLE IF NOT EXISTS ticket_verlauf (id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,benutzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,aktion TEXT NOT NULL,daten TEXT NOT NULL,erstellt_am TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS ticket_handwerkerauftraege (ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,vorgang_id INTEGER NOT NULL UNIQUE REFERENCES fach_vorgaenge(id) ON DELETE CASCADE,entwurf_id TEXT NOT NULL,payload_hash TEXT NOT NULL,erstellt_am TEXT NOT NULL DEFAULT (datetime('now')),PRIMARY KEY(ticket_id,entwurf_id));

CREATE TABLE IF NOT EXISTS ticket_status_migrationen (version INTEGER PRIMARY KEY,angewendet_am TEXT NOT NULL DEFAULT (datetime('now')));

-- Persönliche Telefonzuordnung und Profilbilder; keine STARFACE-Passwörter.
CREATE TABLE IF NOT EXISTS mitarbeiterprofile (
 benutzer_id INTEGER PRIMARY KEY REFERENCES benutzer(id) ON DELETE CASCADE,
 starface_login_id TEXT,
 bild BLOB,
 revision INTEGER NOT NULL DEFAULT 0
);

-- Persönliche ETV-Einladungen: unveränderliche PDF und getrennte Versandnachweise.
CREATE TABLE IF NOT EXISTS etv_einladung_akten(
 versammlung_id INTEGER PRIMARY KEY REFERENCES versammlungen(id),
 vorgang_id INTEGER NOT NULL UNIQUE REFERENCES fach_vorgaenge(id)
);
CREATE TABLE IF NOT EXISTS akte_dokumente(
 vorgang_id INTEGER NOT NULL REFERENCES fach_vorgaenge(id),
 dokument_id INTEGER NOT NULL REFERENCES dokumente(id),
 PRIMARY KEY(vorgang_id,dokument_id)
);
CREATE TABLE IF NOT EXISTS etv_versandlaeufe(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 versammlung_id INTEGER NOT NULL REFERENCES versammlungen(id),
 auftrag_id TEXT NOT NULL,
 anfrage_hash TEXT NOT NULL,
 basis_hash TEXT NOT NULL,
 vorlage_hash TEXT NOT NULL,
 firma_id INTEGER REFERENCES firmenbriefkoepfe(id),
 benutzer_id INTEGER REFERENCES benutzer(id),
 erstellt_am TEXT NOT NULL DEFAULT(datetime('now')),
 UNIQUE(versammlung_id,auftrag_id)
);
CREATE TABLE IF NOT EXISTS etv_einzelbriefe(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 lauf_id INTEGER NOT NULL REFERENCES etv_versandlaeufe(id),
 adresse_id INTEGER NOT NULL REFERENCES adressen(id),
 dokument_id INTEGER NOT NULL UNIQUE REFERENCES dokumente(id),
 empfaenger TEXT NOT NULL, email TEXT, post INTEGER NOT NULL,
 versand_hinweis TEXT, datei_hash TEXT NOT NULL,
 email_status TEXT NOT NULL DEFAULT 'offen',
 post_status TEXT NOT NULL DEFAULT 'offen',
 UNIQUE(lauf_id,adresse_id)
);
CREATE TABLE IF NOT EXISTS etv_versandverlauf(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 brief_id INTEGER NOT NULL REFERENCES etv_einzelbriefe(id),
 kanal TEXT NOT NULL, status TEXT NOT NULL,
 meldung TEXT NOT NULL, benutzer_id INTEGER REFERENCES benutzer(id),
 erstellt_am TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TABLE IF NOT EXISTS firmen_versand(
 firma_id INTEGER PRIMARY KEY REFERENCES firmenbriefkoepfe(id),
 absender TEXT NOT NULL DEFAULT '',
 postweg TEXT NOT NULL DEFAULT 'drucker' CHECK(postweg IN ('drucker','epostbox')),
 drucker TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS m365_verbindungen(
 firma_id INTEGER PRIMARY KEY REFERENCES firmenbriefkoepfe(id),
 token TEXT NOT NULL, benutzer_id INTEGER NOT NULL REFERENCES benutzer(id),
 konto TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS m365_oauth(
 state_hash TEXT PRIMARY KEY, firma_id INTEGER NOT NULL REFERENCES firmenbriefkoepfe(id),
 benutzer_id INTEGER NOT NULL REFERENCES benutzer(id), sitzung_hash TEXT NOT NULL,
 verifier TEXT NOT NULL, absender TEXT NOT NULL, ablauf_am INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS m365_app_config(
 id INTEGER PRIMARY KEY CHECK(id=1), daten TEXT NOT NULL, revision INTEGER NOT NULL,
 quelle TEXT NOT NULL, geaendert_von INTEGER REFERENCES benutzer(id), geaendert_am TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS m365_oauth_teams(state_hash TEXT PRIMARY KEY REFERENCES m365_oauth(state_hash) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS etv_teams(
 versammlung_id INTEGER PRIMARY KEY REFERENCES versammlungen(id) ON DELETE CASCADE,
 firma_id INTEGER REFERENCES firmenbriefkoepfe(id),dauer INTEGER NOT NULL DEFAULT 180,external_id TEXT NOT NULL,meeting_id TEXT,join_url TEXT,organizer TEXT,basis_hash TEXT,
 status TEXT NOT NULL DEFAULT 'ausstehend',meldung TEXT NOT NULL DEFAULT '',geaendert_am TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS m365_oauth_kalender(state_hash TEXT PRIMARY KEY REFERENCES m365_oauth(state_hash) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS m365_persoenliche_kalender(benutzer_id INTEGER PRIMARY KEY REFERENCES benutzer(id) ON DELETE CASCADE,token TEXT NOT NULL,konto TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS m365_kalender_oauth(state_hash TEXT PRIMARY KEY,benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,sitzung_hash TEXT NOT NULL,verifier TEXT NOT NULL,config_hash TEXT NOT NULL,ablauf_am INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS m365_kalender_auftraege(benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,auftrag_id TEXT NOT NULL,quelle TEXT NOT NULL,identitaet TEXT NOT NULL,anfrage_hash TEXT NOT NULL,event_id TEXT,status TEXT NOT NULL DEFAULT 'ausstehend',PRIMARY KEY(benutzer_id,auftrag_id));

CREATE TABLE IF NOT EXISTS etv_kalender(
 versammlung_id INTEGER PRIMARY KEY REFERENCES versammlungen(id) ON DELETE CASCADE,
 firma_id INTEGER REFERENCES firmenbriefkoepfe(id),dauer INTEGER NOT NULL DEFAULT 180,
 status TEXT NOT NULL DEFAULT 'ausstehend',meldung TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS etv_kalender_termine(
 id INTEGER PRIMARY KEY,versammlung_id INTEGER NOT NULL REFERENCES versammlungen(id) ON DELETE CASCADE,
 ziel TEXT NOT NULL,quelle TEXT NOT NULL,benutzer_id INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
 identitaet TEXT,transaction_id TEXT NOT NULL,event_id TEXT,anfrage TEXT,basis_hash TEXT,stillgelegt INTEGER NOT NULL DEFAULT 0,
 UNIQUE(versammlung_id,ziel)
);
