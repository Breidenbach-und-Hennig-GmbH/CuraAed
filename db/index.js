'use strict';

const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

/**
 * Dünner Promise-Wrapper um node-sqlite3.
 * Auf dieser Plattform wird bewusst das `sqlite3`-Paket (nicht better-sqlite3)
 * verwendet und journal_mode=DELETE gesetzt, da /app auf gemeinsam genutztem
 * Speicher liegt und WAL-Locking dort fragil sein kann.
 *
 * Alle Anfragen laufen über eine Verbindung. Damit eine Transaktion keine
 * Anweisungen paralleler HTTP-Anfragen „einsammelt" (und bei ROLLBACK mit
 * verwirft), werden Anweisungen nacheinander abgearbeitet; transaktion()
 * hält die Warteschlange bis COMMIT/ROLLBACK exklusiv.
 */
class Database {
  constructor(dbInstance) {
    this.db = dbInstance;
    this._warteschlange = Promise.resolve();
  }

  _exklusiv(fn) {
    const p = this._warteschlange.then(fn, fn);
    this._warteschlange = p.catch(() => {});
    return p;
  }

  _run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  _get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  }

  _all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
  }

  _execRoh(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
  }

  run(sql, params) { return this._exklusiv(() => this._run(sql, params)); }
  get(sql, params) { return this._exklusiv(() => this._get(sql, params)); }
  all(sql, params) { return this._exklusiv(() => this._all(sql, params)); }
  exec(sql) { return this._exklusiv(() => this._execRoh(sql)); }

  /**
   * Führt fn(tx) atomar aus. tx hat dieselbe Schnittstelle (run/get/all);
   * innerhalb von fn ausschließlich tx verwenden, nicht db (sonst Deadlock).
   */
  transaktion(fn) {
    return this._exklusiv(async () => {
      const tx = {
        run: (s, p) => this._run(s, p),
        get: (s, p) => this._get(s, p),
        all: (s, p) => this._all(s, p),
        exec: (s) => this._execRoh(s),
      };
      await this._run('BEGIN IMMEDIATE');
      try {
        const ergebnis = await fn(tx);
        await this._run('COMMIT');
        return ergebnis;
      } catch (e) {
        await this._run('ROLLBACK').catch(() => {});
        throw e;
      }
    });
  }

  close() {
    return this._exklusiv(
      () => new Promise((resolve, reject) => this.db.close((err) => (err ? reject(err) : resolve())))
    );
  }
}

/**
 * Öffnet (oder erstellt) die Datenbank, wendet das Schema an und migriert
 * ältere Datenbestände (siehe db/migrate.js).
 * @param {string} filePath  Pfad zur SQLite-Datei oder ':memory:'
 */
async function openDatabase(filePath) {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const raw = await new Promise((resolve, reject) => {
    const inst = new sqlite3.Database(filePath, (err) => (err ? reject(err) : resolve(inst)));
  });
  const db = new Database(raw);
  // Gemeinsamer Speicher: DELETE-Journal statt WAL (siehe Plattform-Hinweis).
  await db.run('PRAGMA journal_mode = DELETE');
  await db.run('PRAGMA foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.exec(schema);
  await require('./migrate').migrieren(db, filePath);
  return db;
}

module.exports = { Database, openDatabase };
