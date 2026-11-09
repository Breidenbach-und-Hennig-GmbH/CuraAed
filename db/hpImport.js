'use strict';
async function migrieren(db){
 const {user_version:v}=await db.get('PRAGMA user_version');if(v>=6)return;
 await db.transaktion(async tx=>{
  await tx.exec(`
   ALTER TABLE rollen_zuordnungen ADD COLUMN hp_personenkonto_nr INTEGER;
   ALTER TABLE objekte ADD COLUMN hp_zustellpostamt INTEGER;
   ALTER TABLE objekte ADD COLUMN hp_freier_verteilerschluessel_code TEXT;
   ALTER TABLE objekte ADD COLUMN hp_anzeigen INTEGER;
   ALTER TABLE objekte ADD COLUMN hp_objekttyp2_code TEXT;
   ALTER TABLE objekte ADD COLUMN hp_anzahl_ein INTEGER;
   ALTER TABLE einheiten ADD COLUMN hp_minol_folge_nr INTEGER;
   ALTER TABLE einheiten ADD COLUMN hp_minol_whg_nr INTEGER;
   ALTER TABLE einheiten ADD COLUMN hp_dta_ordnungsbegriff TEXT;
   ALTER TABLE einheiten ADD COLUMN hp_frei_1 INTEGER;
   ALTER TABLE einheiten ADD COLUMN hp_frei_2 INTEGER;
   ALTER TABLE einheiten ADD COLUMN hp_frei_3 INTEGER;
   ALTER TABLE personenkonto_funktionen ADD COLUMN hp_verbindung_id TEXT REFERENCES hp_adress_verbindungen(id) ON DELETE RESTRICT;
   CREATE INDEX hp_funktion_konto ON rollen_zuordnungen(objekt_id,hp_personenkonto_nr);
   CREATE TABLE hp_objekt_importe (
    verbindung_id TEXT PRIMARY KEY REFERENCES hp_adress_verbindungen(id) ON DELETE RESTRICT,
    token_hash TEXT NOT NULL, aktiv INTEGER NOT NULL DEFAULT 1 CHECK(aktiv IN (0,1)),
    zuletzt_gesehen INTEGER, letzter_lauf TEXT
   );
   CREATE TABLE hp_import_quellen (
    verbindung_id TEXT PRIMARY KEY REFERENCES hp_adress_verbindungen(id),fingerprint TEXT NOT NULL
   );
   CREATE TABLE hp_import_objektstatus (
    verbindung_id TEXT NOT NULL REFERENCES hp_objekt_importe(verbindung_id), hp_objnr INTEGER NOT NULL,
    fi_beendet INTEGER, status TEXT NOT NULL, geprueft_ms INTEGER NOT NULL,auto_archiviert INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(verbindung_id,hp_objnr)
   );
   CREATE TABLE hp_import_datensaetze (
    verbindung_id TEXT NOT NULL REFERENCES hp_objekt_importe(verbindung_id), art TEXT NOT NULL,
    hp_objnr INTEGER NOT NULL, quellschluessel TEXT NOT NULL, hash TEXT NOT NULL,
    remote TEXT NOT NULL, remote_projection TEXT NOT NULL, basis TEXT NOT NULL, tabelle TEXT NOT NULL, lokal_schluessel TEXT NOT NULL,
    status TEXT NOT NULL, meldung TEXT, geaendert_am TEXT NOT NULL, bestaetigt_ms INTEGER,
    PRIMARY KEY(verbindung_id,art,hp_objnr,quellschluessel)
   );
   CREATE TABLE hp_import_fehler (
    verbindung_id TEXT NOT NULL REFERENCES hp_objekt_importe(verbindung_id), art TEXT NOT NULL,
    hp_objnr INTEGER NOT NULL, quellschluessel TEXT NOT NULL, meldung TEXT NOT NULL, gesehen_am TEXT NOT NULL,
    PRIMARY KEY(verbindung_id,art,hp_objnr,quellschluessel)
   );
   CREATE INDEX hp_import_status ON hp_import_datensaetze(verbindung_id,status);
   CREATE INDEX hp_import_eltern ON hp_import_datensaetze(verbindung_id,hp_objnr,art);
  `);
  await tx.run('PRAGMA user_version=6');
 });
}
module.exports={migrieren};
