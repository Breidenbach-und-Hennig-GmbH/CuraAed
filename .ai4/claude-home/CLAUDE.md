# 4everyone — Project Runner

You are running inside a 4everyone project pod. Read this file carefully before writing any code.

This file is the platform-managed source of truth for runner behavior. `/app/CLAUDE.md` is project-owned memory and may contain user edits or legacy platform guidance from older projects. If `/app/CLAUDE.md` conflicts with this file, follow this file for platform/runtime behavior. After reading this file, read `/app/CLAUDE.md` for project-specific notes and AI4 issue reporting.

## CRITICAL: Port 8080 — Bind vs. Verify

These are two different rules with two different addresses. Do not mix them up.

**BIND (how your server listens): always `0.0.0.0:8080`.**
`8080` is the only port exposed by the Kubernetes Service. A server bound to `127.0.0.1:8080` accepts connections only from inside its own container, so it is invisible to the browser. Never bind to `127.0.0.1` or `localhost`. Never use another port.

**VERIFY (how you check it came up): always `http://127.0.0.1:8080/`.**
Your workspace shares this pod's network namespace with the container that runs the app, so `127.0.0.1:8080` is the exact same socket the Kubernetes Service forwards to. It answers in milliseconds and needs no DNS.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --connect-timeout 2 --max-time 5 http://127.0.0.1:8080/
```

Expected: `200`.

The two rules are consistent, not contradictory: you bind `0.0.0.0`, which *includes* `127.0.0.1`, so the loopback check succeeds precisely because you bound correctly. If the loopback check fails, the app is not serving correctly on `127.0.0.1:8080`.

## Accessing Your App

| Variable | What it is | What it is for |
|---|---|---|
| `PROJECT_PUBLIC_URL` | The platform-managed public URL; empty until the project is published | Telling the user where their app lives, and as the target of an **external** reachability test |
| `PROJECT_INTERNAL_URL` | Platform-provided internal service metadata | Retained for backwards compatibility |
| `PROJECT_URL` | Backwards-compatible alias of `PROJECT_INTERNAL_URL` | Legacy code only |

### Two different questions

**Runtime liveness — "did my app come up and serve the code I just changed?"**
Use the bounded loopback check in **CRITICAL: Port 8080 — Bind vs. Verify** above.
**Never** use `$PROJECT_INTERNAL_URL` or `$PROJECT_URL` for this. Cluster network policy prevents project pods from reaching in-cluster Service addresses — including their own — and the failure mode varies: the attempt may time out, be refused, or on some clusters be silently dropped, where DNS resolves fine, the connection never completes, and `curl` hangs until something kills it. That is intentional project isolation, **not** a platform bug, so do not record it as a platform issue in `/app/CLAUDE.md`, and do not retry it.

**External availability — "can a real client reach the published URL?"**
Loopback cannot answer this: it proves the runtime is serving locally and says nothing about ingress, TLS, routing, redirects, or Host handling. When proving external reachability is explicitly what the task asks for, a **bounded** request to the real external URL is allowed:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' --connect-timeout 5 --max-time 15 "$PROJECT_PUBLIC_URL"
```

A failure here can be inconclusive — egress and hairpin behavior vary by environment — so report what you saw, do not retry it repeatedly, and do not conclude the runtime is down; check loopback for that.

> `PROJECT_PUBLIC_URL` is the **platform-managed** published URL. A custom domain is separate platform state that is not exposed in this workspace, so do not present `PROJECT_PUBLIC_URL` as the project's preferred domain if the user has configured one.

## Mandatory Timeouts On Every Reachability Check

Every command whose purpose is to find out whether something is reachable MUST carry an explicit time bound, sized for the operation. Never run an unbounded `curl`.

- `curl` against this pod (`127.0.0.1`): `--connect-timeout 2 --max-time 5`.
- `curl` against a third-party internet API: `--connect-timeout 5 --max-time 15`.
- Longer downloads or uploads may use larger values, but they must still be explicitly bounded.
- Any other network tool (`wget`, `nc`, a Node/Python one-liner): wrap it — `timeout 10 <command>`.

Why this is non-negotiable: an unbounded network command aimed at an unreachable route does not fail, it **hangs**. Your tool runner eventually kills it, but by then you have burned minutes, lost the exit code, and learned nothing. A check that fails in 2 seconds is strictly more informative than one that fails in two minutes.

### Waiting for a new server to come up

It can take 5–15 seconds after writing `.ai4-server-cmd` for the new server to come up. Do not `sleep 15` and hope — poll with a bounded loop that exits the moment it is ready:

```bash
code=000
for i in $(seq 1 15); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 2 --max-time 5 http://127.0.0.1:8080/ || echo 000)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "http_code=$code after $i attempt(s)"
```

Worst case 30 seconds; typically 2–6.

## Switching the Server

A default static file server (`http-server`) starts automatically on port 8080. To replace it with your project's runtime, write a **single line** to `/app/.ai4-server-cmd`:

```bash
echo "cd /app && http-server /app/dist -p 8080 --cors -c-1" > /app/.ai4-server-cmd
```

The entrypoint process manager detects the change within 2 seconds, kills the current server, and starts the new command. You do **not** need to manage processes yourself.

> **Serve a production build, not a dev server.** For build-tool projects (Vite/React/Vue), the final `.ai4-server-cmd` must serve the compiled output (e.g. `http-server /app/dist`), **not** `npm run dev` / `npx vite`. A dev server's hot-reload (HMR) client opens a WebSocket back to `localhost:8080`, which on a public project URL means the *user's own machine*, not the pod — so it never connects and floods the browser console with errors. See **React / Vite** below.

> **Required step for every non-static project.** If you don't write this file,
> the default static server runs and your framework's code won't execute.

## Node Restart Durability

`/app/node_modules` is **ephemeral scratch space** backed by `emptyDir`. Pod recreation wipes it.

For every Node-based project that depends on installed packages at runtime, deployment is only complete when you do **all** of the following in order:

1. Install dependencies successfully.
2. Validate startup/build/imports successfully.
3. Save a restart snapshot:
   ```bash
   save-node-runtime-deps.sh --start-command "cd /app && node /app/server.js"
   ```
   Replace the command string with the real long-running Node command for the project.
4. Only then write `.ai4-server-cmd`.

If `package.json` exists and `.ai4-server-cmd` points to a Node command, check that `/app/.ai4/runtime-deps/node-deps.json` and `/app/.ai4/runtime-deps/node_modules.tar.gz` exist before making more changes.

If a project uses a custom server, Express, or serves its real app from `public/` or another subdirectory, do **not** leave the platform starter page at `/app/index.html`. Replace it with a project-owned fallback page or redirect so a runtime fallback does not impersonate a fresh starter project.

## Python Restart Durability

The Python venv at `/opt/venv` is **ephemeral**. Pod recreation reverts it to the baseline image, so anything installed via `pip install` is lost.

For every Python-based project (Flask, FastAPI, Uvicorn, Streamlit, plain `python3 server.py`, …) that depends on installed packages at runtime, deployment is only complete when you do **all** of the following in order:

1. Install dependencies successfully (`pip install <pkgs>` or `pip install -r requirements.txt`).
2. Validate startup/import successfully (`python3 -c "import <pkg>"` or a brief launch).
3. Save a restart snapshot:
   ```bash
   save-python-runtime-deps.sh --start-command "cd /app && python3 /app/server.py"
   ```
   Replace the command string with the real long-running Python command. If the project has no `requirements.txt`, the script auto-generates one from `pip freeze`.
4. Only then write `.ai4-server-cmd`.

If `server.py` (or any Python entrypoint) exists and `.ai4-server-cmd` points to a Python command, check that `/app/.ai4/runtime-deps/python-deps.json` and `/app/.ai4/runtime-deps/site-packages.tar.gz` exist before making more changes.

## Preview Freshness Contract

For every web app that renders in the 4everyone preview iframe, treat preview freshness as a required integration, not an optional enhancement.

- The platform writes the current preview revision to `/app/.ai4/preview-revision.json`.
- The platform also exposes same-origin preview helpers at:
  - `/.ai4-preview-revision.json`
  - `/.ai4-preview-bootstrap.js`
- New generated web apps must expose the active revision in the served document with:
  - a meta tag such as `<meta name="ai4-preview-revision" content="...">`
  - a `window.parent.postMessage({ type: 'ai4-preview-ready', revision }, '*')` handshake after load
- The preferred implementation is to include `<script src="/.ai4-preview-bootstrap.js" defer data-ai4-preview-bridge></script>` in your HTML entrypoint.
- If the stack needs a native equivalent instead, fetch `/.ai4-preview-revision.json` with `cache: 'no-store'`, then set the meta tag and emit the message.
- If the app uses a custom server, CSP, or service worker, keep `/.ai4-preview-revision.json` and `/.ai4-preview-bootstrap.js` reachable and executable from the project origin.
- Include the bridge exactly once. Two script tags, or a script tag plus the
  native equivalent, would post the ready message twice.
- When you replace the starter app with a custom/public-backed app, preserve compatibility with these same-origin preview helper paths.

Use this browser-side snippet unless the stack needs a better native equivalent:

```html
<meta name="ai4-preview-revision" content="0" />
<script src="/.ai4-preview-bootstrap.js" defer data-ai4-preview-bridge></script>
```

If the framework cannot add an external script tag cleanly, use this inline fallback:

```html
<meta name="ai4-preview-revision" content="0" />
<script>
  async function announceAi4PreviewReady() {
    try {
      const response = await fetch('/.ai4-preview-revision.json', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      const revision = String(data?.revision ?? '');
      if (!revision) return;
      document
        .querySelector('meta[name="ai4-preview-revision"]')
        ?.setAttribute('content', revision);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'ai4-preview-ready', revision }, '*');
      }
    } catch {}
  }
  window.addEventListener('load', announceAi4PreviewReady);
</script>
```

### Service Worker Rules

- Do **not** add a service worker unless the user explicitly asks for offline/PWA behavior.
- If a service worker exists, it must not indefinitely cache `/`, the app shell HTML, `/.ai4-preview-revision.json`, or `/.ai4-preview-bootstrap.js`.
- Tie service-worker cache versions to the preview revision and delete old caches on `activate`.
- If the preview unexpectedly shows older content, check the service worker before assuming the iframe host is at fault.

### CSP Rule

- If the app defines a Content Security Policy, allow same-origin script execution for `/.ai4-preview-bootstrap.js`. Do not block platform-owned preview helper paths on the project origin.

### Rules for `.ai4-server-cmd`
- One line only — use `&&` to chain multiple steps
- Must end with the server process (long-running, blocking)
- Must bind to `0.0.0.0:8080`
- Must contain only the final runtime command, not `npm install`, `pip install`, or other setup steps
- Write it **once** after all your code is in place — the switch happens immediately
- **Validate before switching** — run install + build first; only write the file if they succeed
- The file is the **command**, detected by its content: writing the same command again does
  nothing. To restart the current server with an unchanged command, run `ai4-restart-server`
  (see **Code changes not taking effect?**).

### Validate Before Switching

Running `.ai4-server-cmd` kills the current working server immediately. If your new
command fails to start, the pod enters a crash loop. Always validate first:

**Node / npm projects (Vite, React, Vue, Next.js):**
```bash
# Step 1: install deps
cd /app && npm install          # must exit 0

# Step 2: verify the build compiles (required — only switch if this exits 0)
cd /app && npm run build        # must exit 0; requires build.emptyOutDir=false in vite.config.js

# Step 3: save a restart snapshot for pod recreation
save-node-runtime-deps.sh --start-command "cd /app && http-server /app/dist -p 8080 --cors -c-1"

# Step 4: only now switch — serve the built output, not the dev server
echo "cd /app && http-server /app/dist -p 8080 --cors -c-1" > /app/.ai4-server-cmd
```

**Python projects (Flask, FastAPI, Django):**
```bash
# Validate imports and startup don't crash immediately
cd /app && pip install flask
cd /app && python3 -c "import app"   # adjust to your module name

# Then switch
echo "cd /app && python3 app.py" > /app/.ai4-server-cmd
```

**Static HTML (no build step needed):** just write the file directly.

## Stack Examples

### Static HTML/CSS/JS (default — no action needed)
The default `http-server` already serves `/app` at port 8080. Just write your files.

### Go
Go is pre-installed. Build your binary first, then write the server command:
```bash
CGO_ENABLED=0 go build -o /app/myapp /app/main.go
echo '/app/myapp' > /app/.ai4-server-cmd
```
Make sure your binary listens on `0.0.0.0:8080`. Pre-build and commit the binary so it
survives pod restarts without rebuilding.

### React / Vite

**Serve a production build with `http-server`, not the Vite dev server.** This is the
required runtime for any Vite/React app viewed through a 4everyone project URL.

> **Why not the dev server?** `npm run dev` / `npx vite` runs Vite's HMR (hot module
> reload) client in the browser, which opens a WebSocket to `localhost:8080`. On a public
> project URL `localhost` resolves to the *visitor's own machine*, not the project pod, so
> the WebSocket never connects and the browser console fills with reconnect errors. A
> production build has no HMR client, so it is clean on public URLs.

Create `vite.config.js` first:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'   // or vue(), etc.

export default defineConfig({
  plugins: [react()],
  build: { emptyOutDir: false },   // /app lives on shared persistent storage; avoid destructive cleanup during rebuilds
})
```
Then build, snapshot, and switch (see **Validate Before Switching**):
```bash
cd /app && npm install
cd /app && npm run build        # must exit 0 before switching
save-node-runtime-deps.sh --start-command "cd /app && http-server /app/dist -p 8080 --cors -c-1"
echo "cd /app && http-server /app/dist -p 8080 --cors -c-1" > /app/.ai4-server-cmd
```
> Always point `http-server` at `dist/` (the compiled output), never `/app`.
> No hot reload here — after changing source, re-run `npm run build`. `http-server` serves
> the rebuilt `dist/` files directly (caching disabled with `-c-1`), so no restart is needed:
> verify the served result.

> **Client-side routing (React Router etc.):** `http-server` has no history fallback, so
> deep links / refreshes on a sub-route return 404. Only if your app needs that fallback,
> serve with `npx serve dist -p 8080 -s` instead — and still validate `npm run build` and
> persist the snapshot with that exact start command first. `http-server /app/dist` remains
> the default for everything else.

#### Temporary debug only — Vite dev server with HMR disabled
If you must run the dev server briefly to debug (never as the final runtime), disable HMR so
it does not try the doomed `localhost:8080` WebSocket, and add `allowedHosts: true` (Vite 5
blocks external hostnames by default):
```js
server: { host: '0.0.0.0', port: 8080, allowedHosts: true, hmr: false }
```
Switch back to the production `http-server /app/dist` command before finishing.

### Vue 3 / Vite
Same rule as **React / Vite** above — serve a production build with `http-server`, not the
Vite dev server (the HMR-WebSocket-to-`localhost:8080` problem is identical).

Create `vite.config.js`:
```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: { emptyOutDir: false },   // /app lives on shared persistent storage; avoid destructive cleanup during rebuilds
})
```
Then build, snapshot, and switch:
```bash
cd /app && npm install
cd /app && npm run build        # must exit 0 before switching
save-node-runtime-deps.sh --start-command "cd /app && http-server /app/dist -p 8080 --cors -c-1"
echo "cd /app && http-server /app/dist -p 8080 --cors -c-1" > /app/.ai4-server-cmd
```

### Next.js

**Use production mode (`next build` + `next start`) — never `next dev`.**
`next dev` runs Watchpack, which does an `lstat`/`open` storm over `/app/`. `/app` lives on shared persistent storage, so avoid long-running dev-mode file watchers there; they are noisy, fragile under shared-storage semantics, and can crash-loop the runtime container. Use production mode instead.

`next build` can also stress `/app/src/` through parallel recursive file reads. If builds fail or behave inconsistently on the shared mount, build off-mount: copy source into `/tmp/<project>-build/`, symlink `node_modules`, run `next build` there, then `tar`-pipe `.next/` back to `/app/.next/`.

Configure `next.config.js` based on the Next.js major version in `package.json`:

```js
// Next.js 14 (use experimental.serverComponentsExternalPackages)
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ['sqlite3', 'bcryptjs'],
  },
};

// Next.js 15+ (use top-level serverExternalPackages)
module.exports = {
  serverExternalPackages: ['sqlite3', 'bcryptjs'],
};
```

Leave `distDir` at default — `.next/` belongs on the persistent `/app/` mount so it survives pod restarts.

```bash
# Validate first (no Watchpack here; this is the build, not the server)
cd /app && npm install
NEXTAUTH_URL=http://localhost:8080 npx next build
# If next build fails or behaves inconsistently on /app/src, build from /tmp/ instead:
#   mkdir -p /tmp/proj-build && cp -r /app/src /tmp/proj-build/ && \
#   cp /app/{package.json,package-lock.json,next.config.js,middleware.js} /tmp/proj-build/ 2>/dev/null; \
#   cp -r /app/public /tmp/proj-build/ 2>/dev/null; \
#   ln -sf /app/node_modules /tmp/proj-build/node_modules && \
#   cd /tmp/proj-build && NEXTAUTH_URL=http://localhost:8080 npx next build && \
#   rm -rf /app/.next && tar -C /tmp/proj-build -cf - .next | tar -C /app -xf -

# Save snapshot, then switch
save-node-runtime-deps.sh --start-command "cd /app && NEXT_TELEMETRY_DISABLED=1 npx next start --hostname 0.0.0.0 --port 8080"
echo "cd /app && NEXT_TELEMETRY_DISABLED=1 npx next start --hostname 0.0.0.0 --port 8080" > /app/.ai4-server-cmd
```

If the user changes source code, you must `next build` again before the change is live (no hot reload in production mode). For NextAuth-style apps, also pass `NEXTAUTH_SECRET` and `NEXTAUTH_URL` in both the build and the start command.

### Express / Node
```bash
# Validate first
cd /app && npm install
node -e "require('./server.js')"

# Save restart snapshot, then switch
save-node-runtime-deps.sh --start-command "cd /app && node /app/server.js"
echo "cd /app && node /app/server.js" > /app/.ai4-server-cmd
```
Make sure `server.js` listens on `process.env.PORT || 8080` and binds to `0.0.0.0`.

### Flask
```bash
# Save runtime snapshot first (see Python Restart Durability above)
save-python-runtime-deps.sh --start-command "cd /app && python3 /app/app.py"
echo "cd /app && python3 app.py" > /app/.ai4-server-cmd
```
In `app.py`: `app.run(host='0.0.0.0', port=8080, debug=True)`

`debug=True` enables auto-reload — Flask restarts automatically when `.py` files change.
For production, set `debug=False`; code changes then require `ai4-restart-server` (after validating).

### FastAPI / Uvicorn
```bash
save-python-runtime-deps.sh --start-command "cd /app && uvicorn main:app --host 0.0.0.0 --port 8080 --reload"
echo "cd /app && uvicorn main:app --host 0.0.0.0 --port 8080 --reload" > /app/.ai4-server-cmd
```
`--reload` watches for file changes and auto-restarts. Remove it for production.

### Django
```bash
echo "cd /app && python3 manage.py runserver 0.0.0.0:8080" > /app/.ai4-server-cmd
```

## Environment

| Tool | Version / Location |
|------|--------------------|
| Node.js | 20.x |
| npm | bundled with Node 20 |
| Python | 3.11 |
| pip | pre-activated venv at `/opt/venv` — just run `pip install ...` |
| Go | 1.26.8 (pre-installed at `/usr/local/go/bin/go`) |
| git | latest |
| curl / wget | available |
| jq / tree | available |

The Python virtualenv at `/opt/venv` is pre-activated in every shell — `pip install` works without `sudo` and packages are immediately importable.

## Source Code vs Runtime Data

For new applications, choose paths deliberately so authored source and live state never
share the same role. A file-backed application should normally look like this:

```text
/app/
├── src/                    # authored application source
├── migrations/             # reproducible database migrations
├── data/                   # mutable runtime state
│   └── app.sqlite
├── dist/                   # generated build output
└── package.json
```

- Application code, configuration templates, schema definitions, migrations, seed
  definitions, and reproducible initialization logic are source. Keep them in intentional
  source paths such as `migrations/001_initial.sql`. Under root `data/`, the platform also
  supports narrow structured source conventions such as `data/schema/tables.sql`,
  `data/migrations/001_initial.sql`, and `data/seeds/defaults.json`.
- Root `data/` is **runtime-first**. New SQLite and other mutable file-backed databases
  belong under `/app/data/`, for example `/app/data/app.sqlite` or `/app/data/users.db`.
  Application code must create the directory when needed. Do not put a new live database
  at `/app/app.sqlite`, `/app/src/app.sqlite`, or `/app/database.sqlite`.
- Never treat or commit a live database as source code. Its WAL, SHM, journal, dump,
  backup, and similar companion files are runtime data too. Project Versions' backend
  policy is the authoritative safety boundary; do not try to work around its classification.
- Git history and Project Versions track application source. They are **not** a backup
  system for mutable application databases, and restoring a source version must not be
  expected to roll application records backward. Applications that need data backup and
  restore require a separate data-backup mechanism.
- Keep generated outputs (`dist/`, `build/`, `.next/`, coverage), caches, temporary files,
  and logs separate from authored source. Do not edit generated output as the canonical
  source when authored source exists; make it reproducible from source whenever practical.
- Keep uploads, exports, application-created files, logs, caches, temporary data, and
  backups out of source directories. When an app persists user or runtime content,
  deliberately choose a runtime-data path instead of writing into the project root.

For an existing application, inspect how its current database path is used before changing
anything and preserve the live data. Never automatically relocate, delete, or overwrite an
existing database merely to match this convention. Change an existing storage path only
when the user's task requires it or when you perform an explicit, safe data migration.

## Runtime Secrets And Variables

Project runtime configuration is managed outside chat in the 4everyone UI.

- Never ask the user to paste actual secrets, passwords, tokens, API keys, or SMTP credentials into chat.
- If an integration needs credentials, ask for the key names only, for example `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`.
- Instruct the user to open `Config` in the project UI and save the values there under `Secrets & Variables`.
- When you refer the user there, be explicit about the click path and the exact key names they should add.
  Say things like: `Open Config, add SMTP_PASSWORD in Secrets & Variables as a secret, then restart if prompted.`
- Reserve the exact `Open Config...` phrasing for moments when the user needs to take that UI action now.
  If you are only checking whether a key exists or discussing possible setup, describe it neutrally instead of phrasing it like an immediate step.
- Assume you cannot read those values from this workspace session.
- **Before choosing an AI provider** (Anthropic, OpenAI, Groq, etc.), ask the user which API
  keys they have available in Secrets. Do not default to Anthropic — the user may not have
  an Anthropic key. Groq is a good free-tier fallback.

Important:

- The `workspace` container that runs Claude does not receive the runtime secret/config mounts.
- The live app runtime picks up those values separately in the `runtime` container.
- Do not claim you verified a secret value unless the user explicitly confirms the app behavior.

## Platform-Managed PostgreSQL

Some projects have a platform-managed PostgreSQL database running next to the app.
Detect it from this shell before choosing how the app stores data:

```bash
[ "${AI4_POSTGRES_ENABLED:-}" = "true" ] && echo "managed PostgreSQL is active"
```

When `AI4_POSTGRES_ENABLED=true`:

- If the application needs persistent structured or server-side application data, use the
  platform-managed PostgreSQL database **by default**, unless the user explicitly asks for
  another storage technology.
- Application code connects **exclusively** through the runtime environment variable
  `DATABASE_URL` (for example `process.env.DATABASE_URL` or `os.environ["DATABASE_URL"]`).
  Never hard-code a host, port, user, password or database name.
- `DATABASE_URL` is intentionally **unavailable in this AI workspace** — only the live app
  runtime receives it. Its absence here does **NOT** mean PostgreSQL is unavailable.
- **Never** ask the user for `DATABASE_URL`, `PGHOST`, `PGDATABASE`, `PGUSER`,
  `PGPASSWORD`, or any other PostgreSQL credential for the managed database. The platform
  already provides it to the app.
- **Never** choose SQLite or local-file storage merely because `DATABASE_URL` cannot be
  inspected from this workspace.
- Do **not** try to connect to PostgreSQL directly from this workspace (no `psql`, no
  ad-hoc client scripts). The workspace has no credentials by design.
- Validate database behavior **through the running application** on
  `http://127.0.0.1:8080` (time-bounded, as everywhere else), where the runtime process
  has `DATABASE_URL`: create data through the app, read it back through the app.
- **Never** print, return, log, or expose `DATABASE_URL` — not in code, logs, API
  responses, error pages, or chat.

When `AI4_POSTGRES_ENABLED=true` is **absent**, do not assume managed PostgreSQL is
active. Use an appropriate alternative (see the SQLite guidance below) unless the user
explicitly asks for PostgreSQL — in that case, tell them PostgreSQL can be enabled in the
project's `Config` (if their team has access) and that a project restart applies it.

## Runtime Diagnostics Logging Contract

When you build or repair an app on this platform, treat runtime diagnostics as part of the product contract.

- Startup failures, runtime crashes, dependency/import failures, scraper failures, background job failures, and other operational errors must be written to stdout/stderr.
- File logs may be used for app history, audit trails, scraper history, or user-visible activity, but file logs must not be the only place where operational failures are recorded.
- If the app creates a diagnostic log file that would help troubleshoot failures, register it in `/app/.ai4/diagnostics/log-sources.json`.
- Keep every declared diagnostic path relative to `/app`, inside the project directory, and limited to safe text log files.
- Never log secrets, tokens, cookies, passwords, private keys, full environment dumps, or credential files.

Use this manifest shape when the app has helpful diagnostic log files:

```json
{
  "version": 1,
  "logs": [
    {
      "id": "server",
      "label": "Server log",
      "path": "data/server.log",
      "description": "Application startup, scraper, and download errors",
      "tail_default": 300
    }
  ]
}
```

## Security: Auth & Token Handling

When building any feature that involves login, sessions, API keys, or tokens:

**Token delivery — never use query strings:**
- **Bad:** redirect to `/?token=eyJ...` — visible in browser history, shareable as a full-access link, leaked in `Referer` headers
- **Good (client-side handoff):** redirect to `/#token=eyJ...` then immediately call `history.replaceState(null, '', '/')` to wipe the fragment
- **Better (server-side sessions):** set an `HttpOnly` cookie from the server; the token never touches JavaScript at all

**Never log credentials or tokens:**
- No `console.log(req.body)` near login or register routes
- No `console.log(token)` or `console.log(password)` anywhere

**Password storage:**
- Hash with bcrypt at cost ≥ 10; never store plaintext or MD5/SHA-1 hashes

**Database queries:**
- Always use parameterized queries — never interpolate user input into SQL strings
- Bad: `` db.query("SELECT * FROM users WHERE id = " + userId) ``
- Good: `` db.prepare("SELECT * FROM users WHERE id = ?").get(userId) ``

**Route protection:**
- Every endpoint that returns user-specific data must verify the session or token before responding
- Add auth middleware at the router level, not per-route

## Uploaded Files

User-uploaded reference files live under `/app/uploads`.

- When the user refers to something they uploaded, shared, or attached, inspect `/app/uploads` before saying the file is missing.
- If multiple plausible files exist, name the candidates and ask which one to use.
- Only ask the user to paste content into chat if no relevant file exists in `/app/uploads` or the file is unreadable for the task.
- When you need the user to add a file, say `Open Files and upload ...` with the clearest file hint you have
  such as `PDF`, `screenshot`, `logo.png`, or `sales.csv`.
- Reserve the exact `Open Files and upload ...` phrasing for moments when the user needs to upload a file now.
  If you are discussing workflow options or checking whether a file exists, refer to files neutrally instead of phrasing it like an immediate upload step.

### Upload Size Limits

The nginx ingress enforces a **100 MB** maximum request body size for uploads to both the platform API and project apps. If a browser upload exceeds this, the proxy returns an HTML error page (HTTP 413) — not JSON.

When building upload features in your app:
- Always check `response.ok` before calling `response.json()` — a 413 returns HTML, not JSON
- For large files (>50 MB), guide the user to upload via the AI-4 Files panel instead of inline browser uploads
- Store uploaded files under `/app/uploads/` or `/app/data/` (persisted on the shared `/app` mount), never `/tmp/` (ephemeral)

## User Communication Rules

**Never write the literal string `$PROJECT_INTERNAL_URL`, `$PROJECT_PUBLIC_URL`, or `$PROJECT_URL` in any message or response to the user.**

These variables are only expanded when executed in a shell. When you write prose or chat responses, no shell is involved — the user will see the raw variable name instead of the actual URL.

Always resolve the value first and use the real URL in your messages:
```bash
actual_url=$(echo $PROJECT_PUBLIC_URL)
```

- **Bad:** "Your app is live at `$PROJECT_PUBLIC_URL`."
- **Good:** "Your app is live at `https://my-app.maya-us.casa`."

Shell command code blocks that *expand* these variables (like `echo $PROJECT_PUBLIC_URL`) are fine — those expand correctly in the shell. Which of them you may `curl`, and for which question, is covered in **Accessing Your App**.

## Common Mistakes to Avoid

- **Do NOT** skip `allowedHosts: true` in `vite.config.js` — Vite 5 blocks every external hostname by default; the app will return a 403 at your project URL without this
- **Do NOT** use the Vite dev server (`npm run dev` / `npx vite`) as the final runtime — its HMR client opens a WebSocket to `localhost:8080`, which fails from a remote browser and floods the console with errors. Build with `npm run build` and serve the compiled output with `http-server /app/dist -p 8080 --cors -c-1`
- **Do NOT** serve `/app` or `.` directly after a Vite build — Vite outputs to `dist/`; point `http-server` at `/app/dist`
- **Do NOT** omit `build: { emptyOutDir: false }` in `vite.config.js` — `/app` is shared persistent storage on this platform, and destructive recursive cleanup during rebuilds is intentionally avoided. Keeping `emptyOutDir: false` makes rebuilds safer and preserves prior output unless the app explicitly replaces it
- **Do NOT** *bind* your server to `localhost` or `127.0.0.1` — always bind `0.0.0.0:8080`
- **Do NOT** check *runtime liveness* through `$PROJECT_INTERNAL_URL` or `$PROJECT_URL` —
  network policy blocks those and the command may hang for minutes. Use
  `curl --connect-timeout 2 --max-time 5 http://127.0.0.1:8080/`
- **Do NOT** claim a published URL works on the strength of a loopback check — loopback proves
  runtime health only. If external reachability is the question, test `$PROJECT_PUBLIC_URL`
  itself with a bounded request
- **Do NOT** run any reachability check without `--connect-timeout` and `--max-time` (or a
  `timeout N` wrapper)
- **Do NOT** use `ps` to decide whether the app server is running — it runs in a separate
  container with its own process namespace, and process tools are not installed here
- **Do NOT** repeat a failed liveness check more than twice — report the evidence and stop
- **Do NOT** use any port other than `8080`
- **Do NOT** run `sudo` — the container already runs as the `node` user with a pre-activated venv
- **Do NOT** start the server yourself with `&` in the background — write `.ai4-server-cmd` instead
- **Do NOT** end a reply while a command you started is still running, or swap in old code inside `/app` for a negative test — see **Long-Running Commands and Temporary Source Changes**
- **Do NOT** write `.ai4-server-cmd` before your code is ready — the switch is immediate
- **Do NOT** write multiple lines to `.ai4-server-cmd` — use `&&` to chain commands on one line
- **Do NOT** alter `.ai4-server-cmd` with comments, whitespace, timestamps, or any other
  functionally irrelevant change to trigger a restart — use `ai4-restart-server`
- **Do NOT** put setup steps (`npm install`, `pip install`, `go build`) in `.ai4-server-cmd` —
  these are NOT server commands. They cause a crash loop. The crash-loop guard will auto-delete
  `.ai4-server-cmd` after 10 crashes, reverting to the default static server silently.
  Always run setup steps first (in the shell), then write only the final server command.
- **Do NOT** assume `node_modules` survives pod recreation — save a restart snapshot with `save-node-runtime-deps.sh` for every Node runtime that needs installed packages
- **Do NOT** leave the 4everyone starter page at `/app/index.html` once a custom/public-backed app exists — replace it with a project-owned fallback or redirect
- **Do NOT** ship a web app in 4everyone without the preview-ready handshake — the iframe host cannot verify freshness without it
- **Do NOT** cache `/.ai4-preview-revision.json`, `/.ai4-preview-bootstrap.js`, `/`, or the app shell indefinitely in a service worker
- **Do NOT** block same-origin `/.ai4-preview-bootstrap.js` in CSP or middleware
- **Do NOT** add a service worker by default unless the user explicitly asked for offline/PWA behavior
- **Do NOT** use Binance for public crypto OHLCV data — it requires API authentication.
  Prefer Kraken (`/api/v1/OHLC`) or CoinGecko (`/api/v3/coins/{id}/ohlc`) for unauthenticated
  price data.
- **Do NOT** write code during a `[PLAN]` turn — only ask clarifying questions.
  On the following turn, implement immediately without further planning.
- **Do NOT** use SQLite when `AI4_POSTGRES_ENABLED=true` and the app needs persistent
  structured data — use the managed PostgreSQL database via `DATABASE_URL` (see
  Platform-Managed PostgreSQL above). The SQLite rules below apply when it is not active.
- **Do NOT** use `better-sqlite3` on this platform for live databases under `/app` —
  shared-storage locking behavior can be fragile even with `PRAGMA journal_mode=DELETE`. Use the
  `sqlite3` npm package with `db.run("PRAGMA journal_mode=DELETE")` and store your database
  under `/app/data/` for persistence. If you still encounter locking errors, move the live DB to
  `/tmp/your-app.db` and call `db.backup('/app/data/backup.db', callback)` periodically; restore
  from the backup file at startup if `/tmp/your-app.db` is missing.
- **Do NOT** invent local image paths for content that does not exist in the project
  (exercise photos, food images, product shots, place photos, etc.) — the runner image contains
  no stock image assets. For images the user has not uploaded: use SVG illustrations, emoji/icon
  fonts, or CDN embeds (e.g. `https://picsum.photos/300/200` for generic placeholders). For
  user-uploaded files, always check `/app/uploads/` first (see Uploaded Files above).

## Mobile Compatibility Baseline

Unless the user explicitly requests desktop-only behavior, every UI you build must meet this baseline:

- Include a viewport tag in HTML entrypoints (`<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />`)
- No horizontal scrolling at 360, 390, 768, and 1024 CSS px widths
- Responsive, fluid layouts (avoid fixed-width page containers that overflow small screens)
- Interactive touch targets of at least 44x44 CSS px
- No hover-only critical actions (all important actions must also be tap/click reachable)
- Works in both portrait and landscape orientations
- **Prevent iOS input-focus zoom**: every text-like form control (`<input>` of type `text`/`email`/`password`/`search`/`number`/`tel`/`url`/`date`/`time`/etc., `<textarea>`, and `<select>`) must render at **font-size ≥ 16px on mobile viewports**. iOS Safari zooms the page whenever a focused input is smaller than 16px CSS px. Fix it **globally** in your shared/base CSS, not per-component:
  ```css
  @media (max-width: 1023px) {
    input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']):not([type='color']):not([type='image']),
    textarea,
    select {
      font-size: 16px;
    }
  }
  ```
  If a component class overrides this, bump with `!important` — this is an accessibility/UX override. If a control must look visually smaller, shrink padding / height / line-height — **never** the font-size.
- **Do NOT disable zoom** to work around the rule above. Never add `maximum-scale=1`, `user-scalable=no`, or `minimum-scale=1` to the viewport tag — it breaks pinch-to-zoom accessibility on iOS.

Validate quickly before finishing by checking these widths with browser devtools responsive mode.

## Plan Mode

When the user's message begins with `[PLAN]`, they are asking you to clarify
requirements **before** writing any code. In this mode:

1. **Ask 2–4 specific clarifying questions** about what they want to build.
   Focus on things that would change the architecture, tech stack, or feature set.
   Examples: "Should this store data between sessions?", "Do you want user login?",
   "Is this a single page or multiple views?"
2. **Do NOT write any code** — not even a scaffold or skeleton.
3. **Do NOT write `.ai4-server-cmd`** during a Plan turn.
4. End your response with: "When you're ready, describe what you'd like and I'll build it."

On the **next turn** (user replies without `[PLAN]`), treat their response as the
final requirements and implement immediately — no more questions.

## Visual Iteration Loops

When the user asks for the same visual adjustment — "make the logo bigger", "make the hero taller", "more padding", "darker blue" — and this is their **2nd or later repeat** of the same request, your previous change was not visible or not convincing. Do not apply another small tweak. That is the #1 cause of these loops.

Before responding:

1. **Re-read the current value.** Grep the stylesheet for the selector (e.g. `.navbar-logo`, `.hero h1`) and check what value is set now, and whether a more specific rule (media query, `!important`, parent-container constraint, inline style) is overriding your earlier edit. A 10% bump shadowed by an `!important` looks identical to no change at all.
2. **Jump, don't tweak.** On the 2nd or later repeat, apply a **1.5×–2× change** relative to the current value — not a 10–20% nudge. Example: `height: 40px` → `height: 72px`, not `height: 44px`.
3. **Name a concrete reference in your reply.** Tell the user what you matched the element to — e.g. "I've matched the logo height to the Demo button (48px)." — rather than saying "I've made it bigger." This gives them a specific anchor to react to.
4. **If the user rejects the jump, stop guessing.** Ask: "Which element on the page should the logo match in size — the Demo button, the nav links, or the page title?" Do not guess a third time.

The same pattern applies to color ("darker" → step by ≥15% HSL lightness, then name the hex), spacing ("more padding" → double it), and font size ("smaller" → halve it). Small tweaks on repeat requests waste turns and frustrate users.

## Workflow Summary

1. Write all your application code to `/app/`
2. **Validate:** run `npm install && npm run build` (Node) or import-check (Python)
3. For Node runtimes with installed packages, run `save-node-runtime-deps.sh --start-command "<real command>"`. For Python runtimes with installed packages, run `save-python-runtime-deps.sh --start-command "<real command>"`.
4. Only if validation passes: write one line to `/app/.ai4-server-cmd`
5. Poll for readiness with the bounded loop in **Mandatory Timeouts On Every Reachability
   Check** — never a bare `sleep`
6. Run the **Verification Checklist** — bounded loopback `curl`, then a content check:
   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' --connect-timeout 2 --max-time 5 http://127.0.0.1:8080/
   ```
   Expected: `200`. Never check runtime liveness through `$PROJECT_INTERNAL_URL` or
   `$PROJECT_URL`. If not `200`, investigate before finishing — but stop after two checks.
   If the task also requires the *published* URL to be reachable, test that separately with a
   bounded request to `$PROJECT_PUBLIC_URL` (see **Accessing Your App**).

## Restart Troubleshooting

If a new `.ai4-server-cmd` does not appear to take effect, assume the command may have failed immediately.

- Do setup first, then write only the final long-running server command to `.ai4-server-cmd`.
- A bad control command can crash-loop and get replaced by the default server, which can make old routes keep responding while new routes never appear.
- For direct Node servers, prefer an explicit path such as `node /app/server.js`.
- If the app unexpectedly shows the starter page, check in this order: `.ai4-server-cmd`, `/app/.ai4/runtime-deps/node-deps.json`, `/app/.ai4/runtime-deps/node_modules.tar.gz`, then runtime logs.

### Code changes not taking effect?

`.ai4-server-cmd` is the server **command**. The platform restarts the server when its
content changes; writing the same command again does nothing. Pick the case that matches
what changed:

1. **The command itself changes** (different entrypoint, flags, runtime): validate, then
   write the new command to `.ai4-server-cmd` as usual. That already restarts the server.
2. **Long-running server code changed, command unchanged** (`node /app/server.js`,
   `python3 app.py` without `debug=True`, a compiled binary, `next start`, …): the running
   process still has the old code. Validate first (build / import check / tests), then
   request a restart of the current server:
   ```bash
   ai4-restart-server
   ```
   It restarts the current command within a few seconds and never changes
   `.ai4-server-cmd`. Then poll for readiness with the bounded loop.
3. **Static files or a Vite/React/Vue production build served by `http-server`**:
   rebuilding (`npm run build`) or editing the served files updates what is served; no
   restart is normally needed. Verify the served result first.
4. **Servers with intentional reload** (Flask `debug=True`, `uvicorn --reload`, a dev
   server with file watching) reload by themselves and may not need an explicit restart.

**Never** alter `.ai4-server-cmd` with no-op comments, whitespace, timestamps, or any
other functionally irrelevant change merely to trigger a restart — use
`ai4-restart-server`.

Finally, **confirm the served content changed** before telling the user it's fixed — run
the **Verification Checklist** below and check the response body, not just the status code.

## Long-Running Commands and Temporary Source Changes

Each turn runs headless: **the run ends when your reply ends**, and nothing wakes you up
afterwards. There is no "I'll continue when it finishes".

- Run slow commands (test suites, negative tests, builds) in the **foreground**, wrapped in
  `timeout N`, and wait for them inside the turn. Background tool tasks are disabled on this
  platform; do not work around that with a shell `&`, `nohup` or `setsid` — such a process is
  not waited for, may keep running after your reply, and its result never reaches you.
- **Never end a reply to "wait" for something.** If a command cannot finish within the turn,
  say so, leave the project in a known state, and tell the user what is still pending.
- A negative test that temporarily swaps in old code must run in an isolated copy, never in
  place in `/app`:
  ```bash
  git -C /app worktree add --detach /tmp/negative-test HEAD
  # change and test in /tmp/negative-test only, then:
  git -C /app worktree remove --force /tmp/negative-test
  ```
  A shell `trap` that restores a file does not run when the process is killed, so cleanup by
  trap alone is not safe. (No git repository? Copy what you need to a `/tmp` scratch
  directory instead.)
- Before reporting success, confirm any temporary change was reverted (`git -C /app status`,
  `git -C /app diff`, or re-read the file).
- If you were interrupted or a step failed mid-way, say explicitly which files may still be
  modified.

## Verification Checklist

After any change that affects the running app, run these in order and stop at the first failure. Each one proves a specific thing; none of them proves the next.

1. **What is configured** — `cat /app/.ai4-server-cmd`
   Proves what the process manager *will* run. Proves nothing about whether it started.

2. **Did your command survive** — if you wrote `.ai4-server-cmd` this turn, check it is still there:
   ```bash
   test -f /app/.ai4-server-cmd && echo present || echo REMOVED
   ```
   If the file you wrote is gone, your command crash-looped and the platform deleted it and reverted to the default server. That is a definitive failure signal from a non-network source — fix the command, do not re-check the network.
   (A project that never wrote the file has none, which is normal and means nothing.)

3. **Is anything serving** — the bounded loopback `curl` above.
   `200` proves *a* process is listening on 8080 in this pod and answered HTTP. It does **not** prove it is your server, and it does not prove the public URL works.

4. **Is it your server** — look at a little of the body:
   ```bash
   curl -sS --connect-timeout 2 --max-time 5 http://127.0.0.1:8080/ | head -c 400
   ```
   Check for a string only your app emits. If you see the 4everyone starter page or an unexpected directory listing, the default static server is answering, not your app.

**You cannot use `ps` here.** The app runs in a separate container with its own process namespace, and process tools (`ps`, `ss`, `netstat`, `lsof`) are not installed in this workspace. Any attempt would mislead you in both directions.

**You cannot read the app's stdout/stderr here.** Runtime logs are collected by the platform and shown to the user in the project's diagnostics view. If steps 1–2 look correct but 3 or 4 fail, say so plainly and ask the user to check runtime logs there. Make sure the app writes startup and crash errors to stdout so they appear (see **Runtime Diagnostics Logging Contract**).

**Stopping rule.** At most **two** liveness checks per change: one immediately, one after the bounded readiness loop. If the second fails, stop probing and report the evidence you have — the status code or connect error, the contents of `.ai4-server-cmd`, and whether that file still exists. Do not run the same failing command a third time.

## Platform-Managed Email (SMTP)

The platform provides a built-in SMTP relay. When a user asks you to send email from their project, use it — do not ask the user for SMTP credentials and do not configure `nodemailer`, `smtplib`, or any third-party mail service. The platform injects relay metadata into the pod and the bearer token into the app runtime container, so everything you need is already there.

### Quick Check

Confirm the non-secret runtime metadata is present before writing any mail code:

```sh
env | grep -E '^AI4_SMTP_(URL|FROM_DOMAIN)='
```

Expected output (values will differ per deployment):

```
AI4_SMTP_URL=http://ai4-everyone-backend.ai4-everyone.svc.cluster.local/.ai4/email/send
AI4_SMTP_FROM_DOMAIN=example.com
```

`AI4_SMTP_TOKEN` is intentionally **not** exposed in the AI workspace shell. It is injected only into the app's server/runtime container, so write server-side code that reads it at runtime (`process.env` / `os.environ` / `os.Getenv`) instead of trying to inspect it from the shell.

If `AI4_SMTP_URL` or `AI4_SMTP_FROM_DOMAIN` are absent, the backend version does not yet support this feature — tell the user and fall back to asking for external SMTP credentials.

### Send an Email

`POST $AI4_SMTP_URL` with a Bearer token and a JSON body:

```sh
curl -sS --connect-timeout 5 --max-time 15 -X POST "$AI4_SMTP_URL" \
  -H "Authorization: Bearer $AI4_SMTP_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"to":["user@example.com"],"subject":"Hello","text":"Hi from my app","display_name":"My App","reply_to":"me@example.com"}'
```

Success response (`200`):

```json
{ "message_id": "...", "accepted": true, "rejected": [] }
```

**Request body fields:**

| Field | Required | Notes |
|---|---|---|
| `to` | Yes | 1–50 addresses |
| `subject` | Yes | 1–998 chars, no CR/LF |
| `text` | One of `text`/`html` | Plain-text body |
| `html` | One of `text`/`html` | HTML body |
| `cc` | No | 0–50 addresses |
| `bcc` | No | 0–50 addresses |
| `reply_to` | No | Recommended — lets recipients reply to a real mailbox |
| `display_name` | No | Becomes `"My App <noreply@example.com>"` in the From header |

### Node Example (built-in `fetch`, no extra deps)

```js
await fetch(process.env.AI4_SMTP_URL, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.AI4_SMTP_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    to: ['user@example.com'],
    subject: 'Welcome',
    text: 'Hello!',
    display_name: 'My App',
    reply_to: 'support@myapp.com',
  }),
});
```

### Python Example (`requests`)

```python
import os, requests

resp = requests.post(
    os.environ['AI4_SMTP_URL'],
    headers={
        'Authorization': f"Bearer {os.environ['AI4_SMTP_TOKEN']}",
        'Content-Type': 'application/json',
    },
    json={
        'to': ['user@example.com'],
        'subject': 'Welcome',
        'text': 'Hello!',
        'display_name': 'My App',
        'reply_to': 'support@myapp.com',
    },
)
resp.raise_for_status()
```

`urllib.request` works too if you prefer zero extra dependencies.

### Go Example (`net/http`)

```go
import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "os"
)

payload, _ := json.Marshal(map[string]any{
    "to":           []string{"user@example.com"},
    "subject":      "Welcome",
    "text":         "Hello!",
    "display_name": "My App",
    "reply_to":     "support@myapp.com",
})

req, _ := http.NewRequest("POST", os.Getenv("AI4_SMTP_URL"), bytes.NewBuffer(payload))
req.Header.Set("Authorization", "Bearer "+os.Getenv("AI4_SMTP_TOKEN"))
req.Header.Set("Content-Type", "application/json")

resp, err := http.DefaultClient.Do(req)
if err != nil || resp.StatusCode != 200 {
    fmt.Println("send failed", err, resp.StatusCode)
}
```

### Check Your Quota

Default quota is **100 emails per project per UTC day**. Because `AI4_SMTP_TOKEN` is runtime-only, check remaining allowance from server-side code rather than the AI workspace shell:

```js
const quotaResp = await fetch(process.env.AI4_SMTP_URL.replace(/\/send$/, '/quota'), {
  headers: {
    'Authorization': `Bearer ${process.env.AI4_SMTP_TOKEN}`,
  },
});
const quota = await quotaResp.json();
// => { used: 12, limit: 100, resets_at: "2026-04-23T00:00:00Z" }
```

### Status Codes

| Code | Meaning |
|---|---|
| `200` | Sent successfully |
| `400` | Validation error — bad address, attempted `from` override, header injection, missing `text`/`html` |
| `401` | Missing or invalid token |
| `413` | Request body > 5 MiB |
| `429` | Daily quota exceeded — check `/quota`, retry tomorrow |
| `502` | Upstream SMTP failure — transient, retry with backoff |

### Rules

- Mail always goes out as `<display_name> <noreply@$AI4_SMTP_FROM_DOMAIN>`. You **cannot** override `From:` — sending a `from` field in the body returns `400`.
- Set `reply_to` so end users can reply to a real human inbox rather than `noreply`.
- Default quota is 100 emails per project per UTC day. A `429` means quota is exhausted; check `/quota` before sending in a loop.
- Recipients can be anyone on the internet. Spam is your responsibility — the platform will rate-limit or disable abusive projects.
- `AI4_SMTP_TOKEN` is a runtime-only secret. Never log it, never put it in client-side JavaScript, never commit it to git, and do not expect it to exist in the AI workspace shell. Read it only from server/runtime code (`process.env` / `os.environ` / `os.Getenv`).

### Common Mistakes to Avoid

- **Do NOT** build your own SMTP integration with `nodemailer`, `smtplib`, `net/smtp`, etc. and ask the user for SMTP credentials. The platform already provides the relay — use it.
- **Do NOT** send a `from` field in the request body. The platform locks `From:` to `noreply@$AI4_SMTP_FROM_DOMAIN` to protect SPF/DKIM/DMARC reputation. Attempting to override it returns `400`.
- **Do NOT** call the send endpoint from browser JavaScript. `AI4_SMTP_TOKEN` would be exposed to anyone who opens DevTools. Route all mail sends through your project's server-side code.
- **Do NOT** treat a missing `AI4_SMTP_TOKEN` in the AI workspace shell as a platform bug. That is expected — the token exists only in the app runtime container.
- **Do NOT** run bulk-send loops without checking `/quota` first. A mid-loop `429` will drop the remaining messages silently unless you handle it.
- **Do NOT** log `$AI4_SMTP_TOKEN` for debugging — even to a local file. Treat it like a password.
