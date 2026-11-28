# Deployment

## Requirements

- Node.js 24 LTS (project range: >=24 <25; Render uses `.node-version`)
- Persistent writable storage for the SQLite file and the upload directory
- HTTPS termination in front of the app (required: the session cookie is `Secure`)
- Build tools (`python3`, `make`, `g++`) only if no `sqlite3` prebuilt binary exists for your platform

## Install & run

```bash
npm ci --omit=dev
export NODE_ENV=production
export DB_PATH=/var/lib/hausperfekt/hausverwaltung.db
export UPLOAD_DIR=/var/lib/hausperfekt/uploads
export ADMIN_PASSWORT=REPLACE_ME          # first start only
node server.js
```

- The server listens on `0.0.0.0:${PORT:-8080}`.
- On startup it applies the schema, runs migrations, removes expired sessions, and creates the first admin if no user exists.
- There is no build step. `public/` is served as-is.
- Health check: `GET /api/auth/me` → `200` with `{"benutzer":null}` when not logged in. `GET /` returns the SPA shell.

See [.env.example](.env.example) for all variables.

## Process management

Run exactly **one** instance per database (SQLite, single serialized connection). Use systemd, a container restart policy, or PM2 in fork mode with 1 instance. **Never use cluster mode.**

Example systemd unit:

```ini
[Service]
WorkingDirectory=/opt/hausperfekt
ExecStart=/usr/bin/node server.js
EnvironmentFile=/etc/hausperfekt/env
Restart=on-failure
User=hausperfekt
```

## Container

There is no Dockerfile in the export. A minimal approach:

- Base image `node:24-slim`, then `npm ci --omit=dev`, copy the source, and `CMD ["node","server.js"]`
- Mount a volume at e.g. `/data` and set `DB_PATH=/data/hausverwaltung.db`, `UPLOAD_DIR=/data/uploads`
- Keep `replicas: 1` and use the `Recreate` strategy (no rolling overlap on the same DB file)
- Prefer local/block storage. SQLite on network file systems (NFS/SMB) can have locking problems.

## Reverse proxy

- Terminate TLS and forward to `127.0.0.1:8080`.
- Allow request bodies of **≥ 100 MB** (the largest upload is 95 MB). Example for nginx: `client_max_body_size 100m;`
- Raise read timeouts for `/api/gespraech/zusammenfassen`: AI transcription can take minutes (the app allows up to 15 min). Example for nginx: `proxy_read_timeout 900s;`
- Recommended: add rate limiting on `/api/auth/login`.

## Backups

Back up the DB file **and** `UPLOAD_DIR` together.

- Consistent online DB copy: `sqlite3 "$DB_PATH" "VACUUM INTO '/backup/hv-$(date +%F).db'"` (or the `.backup` command)
- Do not copy the DB file while it is being written without one of these methods
- Migrations write `sicherung-vor-migration-<timestamp>.db` next to the DB. Prune these over time.

## Updates

1. Back up DB + uploads.
2. Deploy the new code, then run `npm ci --omit=dev`.
3. Restart. Migrations run automatically and idempotently on start. Check the logs for `[MIGRATION]` / `[FATAL]`.

## Optional: HP-Mobile connection setup

The HP-Mobile connection uses a separate API from the HausPerfekt Datendienst.
See [the verified protocol and current implementation scope](docs/hausperfekt-mobile.md).
Configure `HP_MOBILE_CLIENT_ID` and `HP_MOBILE_CLIENT_SECRET` in the server's
secret store for the authorized OAuth application. The existing public-origin
configuration is reused. The optional setup screen is `/#/hausperfekt`.
Back up `.hausperfekt-token-key` beside the persistent database with the database
and uploads. Do not expose connection tokens or user passwords to logs or GitHub.

The initial setup permits login verification and direct reads. It does not yet
connect the existing local editing screens to the ERP or activate write-back.

## Optional: AI summaries

Set `MISTRAL_API_KEY` (and optionally `MISTRAL_ZUSAMMENFASSUNG_MODELL`). Outbound HTTPS to `api.mistral.ai` must be allowed. Without the key, only this feature is disabled.

### Plaud in the call intake form

The primary workflow is now "Gespräch aus Plaud auswählen": connect a personal
Plaud account, select a synchronized conversation, review an existing summary,
then transfer it into the current note. Each `mitarbeiter` or `admin` connects
their own account. No AI key is needed to read existing Plaud summaries.
The original form stays open while authentication takes place in a separate tab.
After authentication, return to the original tab and select "Verbindung prüfen".
Saving the call remains a separate explicit action. Existing note text is
preserved and the 4,000-character limit is checked before insertion.

The connection uses Plaud's official remote MCP endpoint and OAuth with PKCE.
Plaud Cloud Sync must be enabled and the summary must already exist in Plaud.
The MCP service currently exposes personal recordings; shared Teamworks files
are not supported. It cannot generate missing summaries. Text/file import is
still available under the secondary manual-import section.

**Data processing:** Plaud documents its hosted MCP service as running in the
USA. The connection dialog discloses this before registration/authorization.
An EU Mistral configuration does not change the location of the Plaud MCP service.
See [Plaud MCP documentation](https://docs.plaud.ai/plaud-mcp-cli/mcp) and
[Plaud's MCP help](https://support.plaud.ai/hc/en-us/articles/57751078986265-Plaud-MCP).

Configure `APP_PUBLIC_URL` to the public HTTPS origin, for example
`https://curaaed.onrender.com`. On Render the built-in `RENDER_EXTERNAL_URL` is
used automatically if `APP_PUBLIC_URL` is unset. Set the explicit URL when using
a custom domain. The OAuth callback is `<origin>/api/plaud/callback`; no other
Plaud API key or manually registered OAuth client is required. Registration is
performed with Plaud when the employee explicitly starts the connection.

OAuth access and refresh tokens are encrypted per user using AES-256-GCM.
By default, `.plaud-token-key` is created beside `DB_PATH`, so that directory
**must be persistent**. Back up the key securely together with the database.
Alternatively, set a stable, random 32-byte base64 `PLAUD_TOKEN_KEY` in the host's
secret store and retain it in protected backups. Losing or changing the key
requires employees to remove and reconnect their Plaud accounts. The key and
tokens are never exposed to the browser. "Verbindung entfernen" deletes local
credentials only; an employee can also revoke the grant in their Plaud account.

The integration has automated OAuth, HTTP/MCP, permissions, account-isolation
and UI tests using mock provider responses. A full live OAuth connection with
an authorized Plaud account still needs to be verified after deployment.

For audio transcription or additional AI summarization, configure one central
`MISTRAL_API_KEY` on the app host. On Render, open the web service's Environment
settings, add that secret and apply it with a deploy/restart. Do not enter keys
into the application's notes or commit them to GitHub. An absent key is a host
configuration issue, not an employee permission issue.

Every signed-in `mitarbeiter` and `admin` can use the processing endpoint with
this shared server configuration. No employee-specific AI key is required.
The `leser` role remains read-only. A configured key's validity and provider
quota must still be checked with the provider; the status endpoint only reports
whether a nonblank key is configured.
