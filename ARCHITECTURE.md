# Architecture

## Overview

```text
Browser (SPA, public/)  ──HTTPS──►  Reverse proxy / TLS  ──HTTP──►  Node.js + Express (server.js)
                                                                     ├── /api/*      JSON API (routes/api.js)
                                                                     ├── static      public/
                                                                     └── SPA fallback → public/index.html
                                                                            │
                                                     ┌──────────────────────┼─────────────────────────┐
                                                     ▼                      ▼                         ▼
                                           SQLite (DB_PATH)       Upload dir (UPLOAD_DIR)   Mistral API (optional)
```

One process, no build step, no background workers, no external database.

## Code layout

| Path | Role |
|---|---|
| `server.js` | Entry point: opens DB, purges expired sessions, seeds first admin, starts HTTP server on `0.0.0.0:$PORT` |
| `lib/appFactory.js` | Builds the Express app (middleware, API, static files, SPA fallback, central error handler) |
| `lib/auth.js` | Session-cookie auth (`hv_session`), role guards |
| `lib/validation.js`, `lib/iban.js`, `lib/nummern.js`, `lib/zahl.js`, `lib/tabelle.js` | Validation, IBAN/BLZ checks, number allocation, parsing helpers |
| `lib/blz-daten.json` | Bundled Bundesbank bank-code table (regenerate with `tools/blz-aktualisieren.js`) |
| `routes/api.js` | All REST endpoints under `/api` |
| `services/*.js` | Domain logic per area (objects, units, addresses, archive, contacts, accounting, …) |
| `db/index.js` | Promise wrapper around `sqlite3`, serialized statement queue, transactions |
| `db/schema.sql` | Idempotent schema (`CREATE … IF NOT EXISTS`) |
| `db/migrate.js` | Idempotent in-place migrations, run on every start |
| `public/` | Frontend: `index.html`, `js/*.js`, `css/*.css`, icons, web manifest (no service worker) |
| `test/` | `node:test` suites; `test/fixtures/schema_v1.sql` covers legacy migration |
| `tools/` | Maintenance scripts (BLZ update, icon generation, UI walkthrough) |

## Runtime dependencies

`express`, `cookie-parser`, `multer`, `bcryptjs`, `sqlite3` (native module; prebuilt binaries for common platforms, otherwise needs a C/C++ toolchain and Python at install time). Uses Node built-ins `fetch`, `FormData`, `Blob`, `AbortSignal.timeout` → **Node.js ≥ 18, 20 LTS recommended**.

## Data storage

- **SQLite**, single connection, `journal_mode=DELETE`, `foreign_keys=ON`. All statements go through one serialized queue. `transaktion()` holds the queue exclusively (`BEGIN IMMEDIATE`). This means **one app instance per database file**. Do not scale horizontally.
- Main tables: `benutzer`, `sitzungen`, `objekte`, `einheiten`, `adressen` (+ `adress_telefone`, `adress_emails`, `adress_ansprechpartner`, `adress_bank`, `adress_versand`), `rollen_zuordnungen`, `dokumente`, `archiv_verknuepfungen`, `kontakte`, `wiedervorlagen`, `versammlungen`, `verteilerschluessel`, `einheit_verteilung`, `objekt_bank`, `aenderungen`, `fibu_objekt`, `sachkonten`, `sachkonto_werte`, `personenkonten`, `pkto_sollwerte`, `pfkt_codes`.
- **Files**: archive uploads are stored in `UPLOAD_DIR` under random hex names. Original name, MIME type and links live in `dokumente`. DB and upload dir must be backed up **together**.
- Call recordings for AI summaries and spreadsheet imports are processed **in memory only** and never written to disk.

## Authentication & authorization

- Login `POST /api/auth/login` → bcrypt check → random 32-byte session token stored in `sitzungen` (7-day expiry) → `HttpOnly` cookie `hv_session`.
- Cookie defaults: `Secure; SameSite=None; Partitioned`, so the app also works when embedded in an iframe. `COOKIE_INSECURE=1` switches to `SameSite=Lax`, non-secure (HTTP dev only).
- All `/api` routes except the `auth/*` routes require login. Write routes require `admin` or `mitarbeiter`. User management requires `admin`.
- Minimum password length: 8. There is **no built-in login rate limiting or CSRF token**. See the production checklist.

## Request limits

| Path | Limit |
|---|---|
| JSON / form bodies | 2 MB |
| Archive uploads (PDF, images, Office, TXT/CSV whitelist) | 50 MB |
| Account/table imports | 10 MB (memory) |
| Call recordings / transcripts | 95 MB (memory) |

## External integrations

- **Mistral AI** (`https://api.mistral.ai/v1`, optional): `voxtral-mini-latest` for transcription and `MISTRAL_ZUSAMMENFASSUNG_MODELL` (default `mistral-small-latest`) for summaries. Timeouts: 15 min for transcription, 3 min for the summary. Audio requires an explicit consent confirmation (§ 201 StGB). Status is exposed via `GET /api/gespraech/status`.
- No e-mail sending, payment, or other third-party services.

## Logging

Everything goes to stdout/stderr: `[START]`, `[SETUP]`, `[MIGRATION]`, `[FEHLER]` (unhandled errors with stack), `[FATAL]` (startup failure → exit 1), and `[gespraech]` (AI provider errors, never with the key).

## Preview helper routes

`/.ai4-preview-revision.json` and `/.ai4-preview-bootstrap.js` are served by Express for the original hosting environment's preview iframe. They are harmless elsewhere. The revision route returns `{"revision":"0"}` when its source file is missing. See MIGRATION_NOTES.md.
