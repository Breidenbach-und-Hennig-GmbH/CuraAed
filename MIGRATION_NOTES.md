# Migration Notes

## Schema migrations (automatic)

- `db/schema.sql` is applied on every start (`CREATE … IF NOT EXISTS`).
- `db/migrate.js` then upgrades older databases in place. Every step checks whether it is needed, so it is safe to run repeatedly.
  - v1 → v2: adds `nummer` columns to objects, units and addresses, and auto-assigns missing numbers (unique, case-insensitive)
  - v1 → v2: rebuilds `dokumente` into the central archive (links move to `archiv_verknuepfungen`), followed by an FK check
  - Adds many columns to `adressen`, `objekte`, `kontakte`, `sachkonten`, `rollen_zuordnungen`, `pfkt_codes`
  - `PRAGMA user_version` 3: copies phone/mobile/e-mail into the communication lists (one-time)
  - `PRAGMA user_version` 4: imports the 340 HausPerfekt person-function codes (one-time, upsert)
- Before structural changes, a backup `sicherung-vor-migration-<timestamp>.db` is written via `VACUUM INTO` next to the DB file. It needs free disk space roughly equal to the DB size.
- There is no down-migration. Restore from backup to roll back.

## Moving an existing installation

1. Stop the old instance. Only one process may use the DB.
2. Copy the DB file (e.g. `data/hausverwaltung.db`) and the **entire** upload directory (`data/uploads/`). Upload file names must stay unchanged because they are referenced by `dokumente.speicher_name`.
3. Point `DB_PATH` and `UPLOAD_DIR` at the new locations.
4. Start the app and check the logs. Then spot-check that archive documents open.
5. Existing user accounts and passwords carry over with the DB. `ADMIN_PASSWORT` has no effect once users exist.
6. Existing sessions stay valid until they expire. To force re-login, run `DELETE FROM sitzungen;` while the app is stopped.

The export may contain a sample upload under `data/uploads/`. That is runtime data, not source. Don't ship it to a fresh installation unless you are migrating the matching DB.

## Environment changes vs. original hosting

- The original host ran `node /app/server.js` on port 8080 behind a TLS-terminating ingress. In a new environment, nothing host-specific is required beyond the variables in `.env.example`.
- The routes `/.ai4-preview-revision.json` and `/.ai4-preview-bootstrap.js`, the matching `<script>`/`<meta>` tags in `public/index.html`, and the root `index.html` fallback page are leftovers from the previous hosting platform's preview. They are harmless. They can be removed in a later code change if desired (and `lib/appFactory.js` adjusted).
- The session cookie defaults to `SameSite=None; Partitioned` for iframe embedding. If the app is never embedded, a later code change to `SameSite=Lax` would improve CSRF resistance.
- Secrets (`ADMIN_PASSWORT`, `MISTRAL_API_KEY`) were stored in the previous platform's secret store and are **not** part of this export. Re-provision them in the new environment.

## Data maintenance

- Bank-code data: refresh quarterly with `node tools/blz-aktualisieren.js <blz-aktuell-txt-data.txt>` (Bundesbank download), then redeploy `lib/blz-daten.json`.
