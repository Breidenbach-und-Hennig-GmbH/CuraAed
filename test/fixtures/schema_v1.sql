-- Hausverwaltung – Datenbankschema (Stufe 1)
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
  interne_nr    TEXT,                           -- interne Objektnummer der Verwaltung
  baujahr       TEXT,
  notizen       TEXT,
  archiviert    INTEGER NOT NULL DEFAULT 0,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Einheiten je Objekt (Wohnungen, Stellplätze, Gewerbe, ...).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS einheiten (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  objekt_id     INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
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
  adresstyp     TEXT NOT NULL DEFAULT 'person', -- person | firma
  anrede        TEXT,                           -- Herr | Frau | Divers | (leer)
  vorname       TEXT,
  nachname      TEXT,
  firmenname    TEXT,
  ansprechpartner TEXT,                         -- bei Firmen
  strasse       TEXT,
  plz           TEXT,
  ort           TEXT,
  land          TEXT DEFAULT 'Deutschland',
  email         TEXT,
  telefon       TEXT,
  mobil         TEXT,
  notizen       TEXT,
  archiviert    INTEGER NOT NULL DEFAULT 0,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);

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
-- Dokumentenarchiv je Objekt (optional je Einheit). Strukturiert so, dass
-- später generierte PDFs (iPad-Formulare) und E-Mail-Zuordnungen einsortiert
-- werden können (Feld quelle).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dokumente (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  objekt_id      INTEGER NOT NULL REFERENCES objekte(id) ON DELETE CASCADE,
  einheit_id     INTEGER REFERENCES einheiten(id) ON DELETE SET NULL,
  titel          TEXT NOT NULL,
  kategorie      TEXT NOT NULL DEFAULT 'sonstiges',
  -- kategorie: protokoll | vertrag | abrechnung | rechnung | korrespondenz |
  --            begehung | uebergabe | plan | sonstiges
  beschreibung   TEXT,
  original_name  TEXT NOT NULL,
  speicher_name  TEXT NOT NULL,   -- Name auf der Platte (uploads/)
  mime_type      TEXT,
  groesse        INTEGER,
  -- quelle: upload (manuell) | formular (Stufe 2) | email (Stufe 3) | rechnung (Stufe 4)
  quelle         TEXT NOT NULL DEFAULT 'upload',
  hochgeladen_von INTEGER REFERENCES benutzer(id) ON DELETE SET NULL,
  erstellt_am    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dok_objekt  ON dokumente(objekt_id);
CREATE INDEX IF NOT EXISTS idx_dok_einheit ON dokumente(einheit_id);
