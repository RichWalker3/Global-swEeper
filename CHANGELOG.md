# Changelog

Global-sweep uses `major.minor.patch` style versioning during the internal pilot.

## v0.2.5 - 2026-06-15

Production hardening for hosted Playwright scraping: browser lifecycle control, assessment queuing, crash recovery, container resource tuning, and smarter degraded capture when Chromium keeps crashing.

### Added

- **Browser manager** — launches, restarts, and closes Chromium with disconnect logging and bounded teardown.
- **Hosted assessment gate** — FIFO queue for full-browser runs (`SWEEP_MAX_CONCURRENT_ASSESSMENTS`, default 1 in production).
- **Scrape quality metadata** — `summary.scrapeQuality` reports full vs degraded pages, browser restarts, fallback discovery, and crash-storm salvage.
- **Chromium runtime tuning** — env-driven launch flags (`SWEEP_CHROMIUM_USE_DEV_SHM`, `SWEEP_CHROMIUM_RENDERER_PROCESS_LIMIT`) and `docker-compose.yml` reference profile (`shm_size: 2gb`, `mem_limit: 3g`).
- **Crash-storm mode** — after repeated renderer crashes, switches to lightweight-first salvage for policy/home/collection pages (`SWEEP_RENDERER_CRASH_STORM_THRESHOLD`, `SWEEP_MAX_BROWSER_RESTARTS`).
- **URL deduplication** — treats `https://example.com` and `https://example.com/` as one crawl target.

### Changed

- **Full-browser-first recovery** — page failures retry with fresh context/browser before any no-JS salvage; salvage is marked degraded in results.
- **Dockerfile** — `tini` entrypoint, explicit Chromium install, `NODE_OPTIONS=--max-old-space-size=2048`, default renderer process limit.
- **Product Forge deployment docs** — recommended memory, `/dev/shm`, and environment variable checklist for hosted Chromium.
- **Hosted page cap** — optional override via `SWEEP_HOSTED_MAX_PAGES`.

### Fixed

- Recovery paths no longer call `browser.newContext` on a stale closed browser after restart (fixes hosted “Target page, context or browser has been closed” hard failures).
- Crash classification recognizes Playwright’s full “target page, context or browser has been closed” message.
- Duplicate home URLs from discovery no longer waste scrape time on the same page twice.

## v0.2.4 - 2026-06-15

In-app structured logs for debugging hosted runs without server access.

### Added

- Assessment Logs in the hamburger menu: view recent runs, filter by merchant URL or search text, and copy a Cursor-friendly debug bundle or NDJSON.
- Structured log API: `GET /api/logs`, `GET /api/logs/runs`, `GET /api/logs/export`, and `DELETE /api/logs` with redaction for tokens, proxy credentials, and checkout session URLs.
- Per-run correlation (`runId`) on sweep requests, with scraper events for discovery, page scrape outcomes, product sampling, checkout, and timeouts.
- Optional `SWEEP_LOGS_TOKEN` env var to protect log routes on hosted deployments.

### Changed

- Deploy verification now smoke-tests `/api/logs` in the dist-only container path.

## v0.2.3 - 2026-06-12

Emergency fix for the hosted Sweep outage caused by v0.2.2.

### Fixed

- Hosted Sweep crashed on every page visit after v0.2.2: the release notes file (CHANGELOG.md) was missing from the deployed bundle, and the failed request brought down the whole server. The build now ships the file, and the server survives even if it's missing.
- A bug in any single request can no longer crash the app — errors now return a normal error response instead of taking Sweep down for everyone.

### Added

- A pre-deploy check (`npm run verify:dist`) that runs the app exactly the way the hosted container does and fails if any core page or API breaks — this would have caught the v0.2.2 outage before it shipped.
- Automated tests that exercise the live HTTP server, including the exact failure that caused the outage.

## v0.2.2 - 2026-06-12

Sweep now handles slow office networks and VPNs much better, and you can see what changed in each update right from the app.

### Added

- A "What's new" button in the header that shows this release history, so you always know what changed after an update.
- Automatic slow-connection handling: Sweep checks how fast it can reach the merchant site at the start of each run and extends its time limits when the connection is slow (common on office VPNs). You'll see a "Slow connection detected" note in the progress feed when this kicks in.

### Changed

- Fewer "page timed out" errors and partial scrapes for teammates running Sweep over VPNs routed through another region (for example AU offices exiting via Europe).
- Updated the README and team setup guide: timeouts now adjust themselves, and if you see "blocked" errors instead of timeouts on a VPN, disconnecting the VPN is the fix.

## v0.2.1 - 2026-06-10

Hosted Product Forge deployment fix.

### Fixed

- Routed frontend API and SSE calls through the current app base path so `/sweep` deployments connect to `/sweep/events` and `/sweep/api/*`.

### Added

- Regression coverage for hosted base-path routing.

## v0.2.0 - 2026-05-18

First serious internal pilot baseline.

### Added

- BRD Workspace flow for reviewing BRD 1-30 rows before Jira updates.
- Manual BRD mode for building editable BRD tables without a completed WA.
- Optional Jira credential persistence through the OS credential store.
- GitHub update workflow for teammate installs.
- Golden BRD regression coverage on the maintainer branch.
- Subtle frontend version label.

### Changed

- Improved Jira update reliability with ADF field payloads and dynamic status transitions.
- Moved Jira send failures closer to the `Send to Jira` action.
- Cleaned stale Anthropic API key UI and unused server endpoints.
- Pruned test files and fixtures from the coworker-facing pilot branch.
- Refreshed README guidance for GitLab/GitHub users.

### Verified

- `npm run build`
- `npm run lint`
- `npm test -- --run` on `main` before the pilot branch test pruning
