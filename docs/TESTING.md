# Local testing (Global-sweep)

Sweep uses **local checks** instead of hosted CI. You are the release gate.

## Before every commit (quick)

```bash
npm run ci
```

Runs, in order:

1. `npm run build` — TypeScript compile
2. `npm run lint` — ESLint on `src/`
3. `npm run test:unit` — Vitest unit/regression tests (no browser)

Typical runtime: **10–20 seconds**.

## Before pushing to `pilot/team-handoff` (full)

```bash
npm run ci:full
```

Adds:

4. `npm run test:smoke` — launches Chromium, loads a local HTML fixture, verifies Playwright + returns detection

Typical runtime: **1–2 minutes** (includes browser if already installed).

Install Chromium once per machine:

```bash
npm run playwright:install
```

## Optional: block bad pushes automatically

```bash
npm run hooks:install
```

Installs a git **pre-push** hook that runs `npm run ci`. Smoke tests stay manual via `npm run ci:full`.

## Coverage report (optional)

```bash
npm run test:coverage
```

Writes an HTML report under `coverage/`. Informational only — no fail threshold yet.

## What the unit tests guard

| Area | Test file | Regression protected |
|------|-----------|----------------------|
| Pre-order detection | `catalogDetector.test.ts` | Notify-me ≠ pre-order |
| Returns portals | `policyExtractor.test.ts` | Loop href detection |
| BRD WA parsing | `mapper.test.ts` | Done vs legacy Canceled vs no-signal |
| BRD review grid | `composer.test.ts` | Phase Out Of Scope defaults |
| Golden BRD Output | `goldenRegression.test.ts` | OAK+FORT reviewed WA BRD lines → Done / Out Of Scope |
| Crawl fixtures | `integration.test.ts` + `__fixtures__/shopify-store/` | Detectors vs expected.json (Loop, Smile, DG, etc.) |
| WA prompt | `prompt.test.ts` | Trimmed summary, no Canceled instructions |
| Jira writer | `jira.test.ts` | Phase writes, no Canceled transitions |
| Playwright | `src/smoke/playwright.smoke.test.ts` | Chromium launch + fixture scrape |

## Skip Playwright on install

For faster `npm install` when you only need unit tests:

```bash
SKIP_PLAYWRIGHT_INSTALL=1 npm install
```

Run `npm run playwright:install` before `npm run test:smoke` or live scrapes.

## Branch hygiene

| Branch | Purpose |
|--------|---------|
| `pilot/team-handoff` | **Primary** — team installs, merge target |
| `feat/sfcc-wa-parity` | Parked SFCC work — rebase before resuming |
| `feat/*` | Short-lived feature branches → merge to handoff, then delete |

Before merging feature work:

```bash
npm run ci:full
git checkout pilot/team-handoff
git merge feat/your-branch
git push origin pilot/team-handoff
git push gitlab pilot/team-handoff
```

See `docs/BRANCH_MERGE_PLAN.md` for PROD vs handoff topology.
