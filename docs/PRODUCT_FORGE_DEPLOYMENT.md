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
3. Runtime stage installs Playwright Chromium and required Linux browser dependencies.
4. Runtime stage copies only `dist` from the build stage.
5. Runtime stage runs as the non-root `node` user.
6. `/app/logs` is created as a writable directory for local runtime logs.
7. Docker healthcheck calls `http://127.0.0.1:${PORT}/health`.

The earlier recursive `chown -R /app` approach was removed because it created a large duplicate Docker layer. Ownership is now handled through targeted copy/setup steps.

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
- Test suite passed: 17 test files, 329 tests.

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

## Pre-Deploy Checklist (required before pushing a release to main)

Every push to `main` can trigger a production rebuild, so run all of these locally first:

```bash
npm run typecheck
npm test -- --run
npm run verify:dist
```

`verify:dist` is the critical one: it builds `dist` and runs the compiled server from a
staged directory containing **only** `package.json`, `node_modules`, and `dist` — the same
filesystem the container has. It then exercises `/health`, `/`, `/api/release-notes`, and
`/api/feedback/status` and fails if the server crashes or any route breaks.

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

## Product Forge Handoff Details

- Repository: `https://gitlab.com/global-e/solutions/global-sweep.git`
- Default branch: `main`
- Guest app name: `sweep`
- Container port: `3000`
- Health path: `/health`
- Build command: Docker build from repository root.
- Start command inside container: `npm start`
