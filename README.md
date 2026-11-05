# HausPerfekt 2.0 (CuraAedificii)

WEG and rental property management (German UI). It is a single Node.js/Express service with a vanilla-JS single-page frontend and an embedded SQLite database.

## Features

- Properties (`objekte`), units (`einheiten`), central address database with role assignments (owner, tenant, …)
- Central document archive (uploads linked to any number of properties, units, addresses)
- Contact log, call intake (`Telefoneingang`), follow-ups (`Wiedervorlagen`), ZIS info system
- Bank details with IBAN/BLZ validation (bundled Bundesbank BLZ data)
- Owner meetings (`Versammlungen`), distribution keys (`Verteiler`), dispatch preferences (post/e-mail)
- Accounting basics: chart of accounts (`Sachkonten`) incl. import, personal accounts and target values
- Change history, privacy-consent tracking
- Users with roles: `admin`, `mitarbeiter` (read/write), `leser` (read-only)
- Optional: AI summaries of recorded calls via Mistral (`MISTRAL_API_KEY`)

## Quick start (local)

Requires Node.js 20 LTS. Ships with a `package-lock.json`.

```bash
npm ci
COOKIE_INSECURE=1 ADMIN_PASSWORT=changeme npm start
# open http://localhost:8080 and sign in as "admin"
```

`COOKIE_INSECURE=1` is only for plain-HTTP local use. Production must run behind HTTPS without it.

## Tests

```bash
npm test          # node --test, uses in-memory SQLite
```

The optional UI walkthrough in `tools/ui-durchlauf.js` needs `jsdom` installed outside the project (see the header of that file).

## Documentation

| File | Content |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, data model, request flow, security model |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Build, run, reverse proxy, persistence, backups |
| [.env.example](.env.example) | All supported environment variables |
| [MIGRATION_NOTES.md](MIGRATION_NOTES.md) | Schema migrations, moving existing data, known caveats |
| [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) | Go-live checklist |
