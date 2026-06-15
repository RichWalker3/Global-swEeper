# Product Forge Deployment Notes

This note documents the Docker and production-runtime changes made to prepare Global-sweep for Product Forge guest app hosting at `/sweep`.

## Runtime Contract

- Guest app path: `/sweep`
- Container port: `3000`
- Health endpoint: `GET /health`
- Production start command: `npm start`
- Production entrypoint: `node dist/web/server.js`
- Local development command remains: `npm run web`

The app still reads `PORT`, so Product Forge can override the listen port if needed. The Docker image defaults to `PORT=3000`.

## Product Forge Onboarding Contract

Product Forge's guest-app onboarding contract says the provider supplies source access and, optionally, a push webhook. Product Forge clones the repo, builds the Docker image, runs it behind HTTPS, and strips the `/sweep` prefix before traffic reaches the app.

Sweep currently satisfies the app-side requirements:

- Repository: `https://gitlab.com/global-e/solutions/global-sweep.git`
- Default branch: `main`
- Path/name: `sweep` (`https://solutions.bglobale.com/sweep/`)
- Port: `3000`
- Dockerfile: present at repository root
- Health check: `GET /health` returns HTTP 200
- Base path: frontend API/SSE calls use the current browser path through `appUrl(...)`, so `/sweep/api/*` and `/sweep/events` work behind Product Forge
- Build input: `CHANGELOG.md` is included in the Docker build context and copied into `dist` for `/api/release-notes`

The webhook is not code and cannot be fixed by a repository change alone. It is a GitLab project setting:

1. Product Forge contact provides the webhook URL.
2. GitLab project maintainer opens `Settings -> Webhooks`.
3. Add the Product Forge URL.
4. Enable `Push events`.
5. If branch filtering is available, restrict it to `main`.
6. Save the webhook.
7. Use GitLab's webhook test button for a push event if available.
8. Confirm Product Forge sees the event and builds the exact latest commit.

If the deployed app is still on an older version after a push, check the webhook first. The deployed app can be checked without server access:

```bash
curl -fsS https://solutions.bglobale.com/sweep/health
curl -fsS https://solutions.bglobale.com/sweep/api/release-notes
curl -fsS https://solutions.bglobale.com/sweep/api/logs
```

Expected for v0.2.4 or later:

- `/api/release-notes` includes the current release.
- `/api/logs` returns JSON with a `logs` array, or HTTP 401 if `SWEEP_LOGS_TOKEN` is enabled.
- The header version label in the app matches `package.json`.

## Build Changes

- Added `Dockerfile` for Product Forge/container deployment.
- Added `.dockerignore` exclusions for local browser downloads and package artifacts.
- Added `tsconfig.build.json` so production builds emit JavaScript into `dist`.
- Kept the existing `tsconfig.json` as a strict no-emit typecheck config.
- Added `scripts/copy-web-public.mjs` to copy `src/web/public` into `dist/web/public`.
- Updated `package.json` scripts:
  - `npm run build` now emits `dist` and copies static web assets.
  - `npm run typecheck` runs the old no-emit TypeScript check.
  - `npm start` runs the compiled server from `dist`.
  - `npm run web` remains the local TypeScript launcher via `tsx`.

## Dockerfile Shape

The Dockerfile uses a multi-stage build:

1. `build` stage installs all dependencies and runs `npm run build`.
2. `runtime` stage installs production dependencies only.
3. Runtime stage installs Playwright Chromium and required Linux browser dependencies explicitly.
4. Runtime stage copies only `dist` from the build stage.
5. Runtime stage runs as the non-root `node` user.
6. `/app/logs` is created as a writable directory for local runtime logs.
7. Docker healthcheck calls `http://127.0.0.1:${PORT}/health`.
8. `tini` is the container entrypoint so zombie Chromium child processes are reaped.
9. `SWEEP_MAX_CONCURRENT_ASSESSMENTS=1` is set by default so hosted runs queue instead of overlapping browsers.

The earlier recursive `chown -R /app` approach was removed because it created a large duplicate Docker layer. Ownership is now handled through targeted copy/setup steps.

## Chromium Stability (Single Container)

Sweep keeps **full Playwright/Chromium** as the primary assessment path. Reliability improvements in production:

- **Browser manager** — launches Chromium once per assessment, restarts on renderer crash/disconnect, and closes with bounded teardown timeouts.
- **Full-browser-first recovery** — page failures retry with a fresh context or browser restart before any degraded/no-JS salvage path.
- **Assessment run gate** — hosted deployments default to one active browser assessment; additional requests wait in queue (`SWEEP_MAX_CONCURRENT_ASSESSMENTS`).
- **Scrape quality metadata** — `summary.scrapeQuality` reports full vs degraded pages, browser restarts, and fallback discovery usage.

If Product Forge supports container runtime flags, prefer adequate shared memory for Chromium:

```bash
docker run --init --ipc=host -p 3000:3000 global-sweep:dist-runtime
# or docker compose: shm_size: '2gb'
```

Without enough `/dev/shm`, Chromium may crash on heavy Shopify pages even when the Node app stays healthy. The image sets `--disable-dev-shm-usage` in Chromium launch args as a fallback, but larger shared memory is still preferred when the platform allows it.

Future option: a dedicated Playwright browser sidecar connected via WebSocket (`PLAYWRIGHT_WS_ENDPOINT`) if Product Forge supports multi-container guest apps.

## Verification Performed

Commands run successfully:

```bash
npm run build
PORT=3000 PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npm start
curl -fsS http://localhost:3000/health
docker build -t global-sweep:dist-runtime .
docker run -d --name global-sweep-dist-test -p 3000:3000 global-sweep:dist-runtime
curl -fsS http://localhost:3000/health
npm run typecheck
npm test -- --run
```

Observed results:

- Compiled local server returned healthy JSON from `/health`.
- Docker container returned healthy JSON from `/health`.
- Docker health status became `healthy`.
- Typecheck passed.
- Test suite passed locally before handoff. Run the current checklist before every release because test counts change as coverage is added.

## Image Size Analysis

Measured local image sizes:

- Original single-stage image with recursive `chown`: `2.91GB`
- Image after removing recursive `chown`: `1.89GB`
- Multi-stage compiled runtime image: `1.71GB`

Current `global-sweep:dist-runtime` size breakdown:

- `/app/.playwright-browsers`: `593MB`
- `/usr`: `537MB`
- `/app/node_modules`: `62MB`
- `/app/dist`: `548KB`

The remaining size is primarily Playwright Chromium plus Linux browser system dependencies. The app code itself is small after compilation.

## Remaining Optimization Options

- Use a Playwright-maintained base image for deployment consistency. This may improve reliability more than size.
- Investigate whether the full Chromium dependency set is required for Product Forge workloads.
- Move browser execution to a remote browser service if image size becomes a hard constraint. This would be an architectural change.

## Rollout / Deploy Runbook

Every push to `main` should be treated as a production deploy candidate. Follow this sequence exactly.

### 1. Before committing

Update release metadata when user-facing behavior changes:

- `CHANGELOG.md`: add a new version entry.
- `package.json` and `package-lock.json`: bump the version.
- `src/web/public/index.html`: update the visible version label.

Run local verification:

```bash
npm run typecheck
npm test -- --run
npm run verify:dist
docker build -t global-sweep:verify-build .
```

`verify:dist` is the critical one: it builds `dist` and runs the compiled server from a
staged directory containing **only** `package.json`, `node_modules`, and `dist` — the same
filesystem the runtime container has. It exercises `/health`, `/`, `/api/release-notes`,
`/api/feedback/status`, `/api/logs`, and `/api/logs/runs`, and fails if the server crashes
or any route breaks.

`docker build` is also required before pushing because `.dockerignore` controls the actual
Product Forge build context. `verify:dist` cannot catch files excluded from Docker before
the build stage starts.

### 2. Commit and push

Use conventional commits:

```bash
git status --short
git add <changed files>
git commit -m "feat: concise description"
git push origin main
```

After pushing, record the commit SHA:

```bash
git ls-remote origin main
```

### 3. Confirm Product Forge picked up the push

The webhook should trigger a Product Forge rebuild from the latest `main` commit. Confirm with the Product Forge owner or dashboard:

- The webhook was received.
- The build checked out the same commit shown by `git ls-remote origin main`.
- Docker build completed successfully.
- The new container passed `GET /health`.
- Product Forge switched traffic to the new image.

If Product Forge did not start a build, the GitLab webhook is missing, disabled, pointing to the wrong URL, or filtered away from `main`.

### 4. Confirm production after deploy

Check from outside the repo:

```bash
curl -fsS https://solutions.bglobale.com/sweep/health
curl -fsS https://solutions.bglobale.com/sweep/api/release-notes
curl -fsS https://solutions.bglobale.com/sweep/api/logs
```

Then open `https://solutions.bglobale.com/sweep/` and verify:

- Visible version label is current.
- What's New shows the current release.
- Hamburger menu includes Assessment Logs.
- `GET /sweep/api/logs` is not 404.

### 5. If production is still old

Use this order:

1. Confirm GitLab `origin/main` contains the expected commit.
2. Confirm Product Forge webhook exists and received the push event.
3. Confirm Product Forge built that exact commit.
4. Confirm the Docker build did not fail.
5. Confirm Product Forge promoted the new image rather than keeping the previous healthy image.
6. Add a cache-busting query string only after the above; stale deployment is more likely than browser cache when API routes are missing.

Context: the v0.2.2 outage happened because the app worked from a full checkout but
crashed in the dist-only container (`CHANGELOG.md` wasn't shipped in `dist`, and the
failing route killed the Node process on every visit). `verify:dist` reproduces the
container conditions and would have caught it before deploy.

Rules that keep this class of bug out:

- Any runtime data file the server reads must be copied into `dist` by
  `scripts/copy-web-public.mjs` (the container ships only `dist`).
- Never call `res.writeHead()` before the work that can throw; build the payload first.
- The request handler is wrapped in a top-level catch (`src/web/server.ts`) so a bug in
  one route returns a 500 instead of crashing the process — don't bypass it.
- Any file required during `npm run build` must not be excluded by `.dockerignore`.

## Product Forge Handoff Details

- Repository: `https://gitlab.com/global-e/solutions/global-sweep.git`
- Default branch: `main`
- Guest app name: `sweep`
- Container port: `3000`
- Health path: `/health`
- Build command: Docker build from repository root.
- Start command inside container: `npm start`
- Required GitLab webhook: Product Forge-provided URL in `Settings -> Webhooks`, with push events enabled for `main`.
- Required GitLab clone credential: read-only deploy token with `read_repository` scope.

Current known external dependency: the Product Forge webhook URL is not stored in this repository. A GitLab project maintainer/owner must either add it manually in project settings or provide an API token with project hook permissions so it can be managed programmatically.

## In-App Structured Logs

Sweep exposes structured server/scraper logs without shell access:

- UI: hamburger menu → **Assessment Logs**
- API:
  - `GET /api/logs` — filter by `merchantUrl`, `runId`, `level`, `phase`, `q`, `from`, `to`, `limit`
  - `GET /api/logs/runs` — recent run summaries
  - `GET /api/logs/export?format=text|ndjson` — copyable debug bundle for Cursor
  - `DELETE /api/logs` — clear the in-memory log store

Logs are redacted before storage (tokens, proxy passwords, checkout session URLs). Retention is bounded (about 2,000 entries / 5 MB in memory).

Optional protection: set `SWEEP_LOGS_TOKEN` in the deployment environment. When set, log routes require `Authorization: Bearer <token>` (enterable in the Logs UI).
