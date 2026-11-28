'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

async function pruefeDatei(root, row, hashPruefen) {
  const name = row.speicher_name;
  if (!name) return 'ohne_dateikopie';
  if (name !== path.basename(name) || /[\\/]/.test(name) || name === '.' || name === '..') return 'ungueltiger_speichername';
  const target = path.join(root, name);
  let stat;
  try { stat = await fs.lstat(target); }
  catch (e) { if (e.code === 'ENOENT') return 'datei_fehlt'; throw e; }
  if (!stat.isFile() || stat.isSymbolicLink()) return 'kein_regulaeres_dokument';
  if (stat.size === 0) return 'datei_leer';
  if (Number(row.groesse) > 0 && stat.size !== Number(row.groesse)) return 'groesse_abweichend';
  if (!/^[a-f0-9]{64}$/i.test(row.sha256 || '')) return 'pruefsumme_fehlt';
  if (!hashPruefen) return 'vorhanden_ungepruefte_pruefsumme';
  const hash = crypto.createHash('sha256');
  for await (const chunk of require('node:fs').createReadStream(target)) hash.update(chunk);
  return hash.digest('hex') === row.sha256.toLowerCase() ? 'bestaetigt' : 'pruefsumme_abweichend';
}

async function pruefeArchiv(db, directory, { hashPruefen = false } = {}) {
  const root = await fs.realpath(directory);
  const bericht = { beginn: new Date().toISOString(), ende: null, pruefsummen_geprueft: hashPruefen,
    vollstaendigkeit_bestaetigt: false, gepruefte_datensaetze: 0, ergebnisse: {}, beispiele: [],
    hinweis: 'Nur bereits erfasste HP-Archivdateien. Kein Nachweis des vollständigen HP-Quellbestands. Keine normale CuraAed-Uploadprüfung. Während der Prüfung geänderte Dateien müssen erneut geprüft werden.' };
  let cursor = 0;
  for (;;) {
    const rows = await db.all('SELECT rowid AS cursor,quelle_id,datei_id,speicher_name,sha256,groesse FROM hp_dms_dateien WHERE rowid>? ORDER BY rowid LIMIT 250', [cursor]);
    if (!rows.length) break;
    for (const row of rows) {
      const ergebnis = await pruefeDatei(root, row, hashPruefen);
      bericht.gepruefte_datensaetze++;
      bericht.ergebnisse[ergebnis] = (bericht.ergebnisse[ergebnis] || 0) + 1;
      if (!['bestaetigt', 'vorhanden_ungepruefte_pruefsumme'].includes(ergebnis) && bericht.beispiele.length < 100)
        bericht.beispiele.push({ quelle_id: row.quelle_id, datei_id: row.datei_id, ergebnis });
      cursor = row.cursor;
    }
  }
  bericht.ende = new Date().toISOString();
  return bericht;
}

async function main(args) {
  if (args.length < 2 || args.length > 3 || (args[2] && args[2] !== '--sha256'))
    throw new Error('Aufruf: node tools/hp-archiv-pruefen.js DATENBANK ARCHIVORDNER [--sha256]. JSON-Bericht auf Standardausgabe. Vorzugsweise auf einer Sicherung ausführen.');
  // Never use openDatabase here: it creates/migrates application tables.
  const sqlite3 = require('sqlite3');
  const connection = await new Promise((resolve, reject) => {
    const c = new sqlite3.Database(path.resolve(args[0]), sqlite3.OPEN_READONLY, e => e ? reject(e) : resolve(c));
  });
  connection.configure('busyTimeout', 5000);
  const db = { all: (sql, params) => new Promise((resolve, reject) => connection.all(sql, params, (e, rows) => e ? reject(e) : resolve(rows))) };
  try { process.stdout.write(JSON.stringify(await pruefeArchiv(db, args[1], { hashPruefen: args[2] === '--sha256' }), null, 2) + '\n'); }
  finally { await new Promise((resolve, reject) => connection.close(e => e ? reject(e) : resolve())); }
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { pruefeDatei, pruefeArchiv };
