# Production Checklist

## Before go-live

- [ ] Node.js 20 LTS installed; `npm ci --omit=dev` succeeds (native `sqlite3` builds or loads)
- [ ] `npm test` passes on the target platform
- [ ] `DB_PATH` and `UPLOAD_DIR` point to persistent, backed-up, local (non-NFS) storage
- [ ] HTTPS in front of the app; `COOKIE_INSECURE` is **unset**
- [ ] Proxy body limit ≥ 100 MB; read timeout ≥ 15 min for `/api/gespraech/zusammenfassen` (if AI is used)
- [ ] Exactly one app instance per DB file (no cluster mode or multiple replicas)
- [ ] `ADMIN_PASSWORT` set to a strong value **or** the generated password from the `[SETUP]` log line has been captured
- [ ] After first login: admin password changed, and the `[SETUP]` log lines removed or rotated if they contained a generated password
- [ ] Individual user accounts created with the right roles (`admin` / `mitarbeiter` / `leser`)
- [ ] Optional: `MISTRAL_API_KEY` provisioned in the secret store, outbound access to `api.mistral.ai` allowed, and a DPA with the provider in place (GDPR)
- [ ] Secrets are kept only in the secret store, never in the repo or `.env` files under version control

## Security hardening (recommended)

- [ ] Rate limiting / lockout on `POST /api/auth/login` (none built in)
- [ ] Security headers at the proxy (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, CSP allowing same-origin scripts)
- [ ] Review the `SameSite=None` cookie default if iframe embedding is not needed (see MIGRATION_NOTES.md)
- [ ] Restrict access (VPN/IP allowlist) if only office staff use the app

## Operations

- [ ] Daily backup of DB (`VACUUM INTO` / `.backup`) **plus** `UPLOAD_DIR`; restore tested once
- [ ] Logs from stdout/stderr collected; alerts on `[FATAL]` and frequent `[FEHLER]`
- [ ] Health check on `GET /api/auth/me` (expects `200`)
- [ ] Disk space monitored (DB, uploads, `sicherung-vor-migration-*.db` files)
- [ ] Quarterly BLZ data refresh scheduled (`tools/blz-aktualisieren.js`)

## Compliance (personal data, GDPR)

- [ ] Privacy notice / records of processing updated (addresses, bank data, call notes, optional recordings)
- [ ] Retention and deletion rules defined for archive documents and contact logs
- [ ] Consent for call recordings confirmed in-app before AI processing (§ 201 StGB)
