# Branch & Merge Plan

Last updated: 2026-06-11. Live PROD = GitLab `main` @ v0.2.1 (`1166614`).

## Branch map

```
                    ┌── gitlab/main (PROD v0.2.1) ── Docker, base-path, golden tests
                    │   └── prod (local tracking branch)
                    │
1bbd0aa ────────────┤
                    │
                    └── pilot/team-handoff ── Playwright fix, pruned tests, team docs
                        └── feat/sfcc-wa-parity (active dev)
```

| Branch | Remote | Purpose | Playwright fix | Docker / hosted |
|--------|--------|---------|----------------|-----------------|
| `prod` / `gitlab/main` | GitLab | **What is live** at `/sweep` | No | Yes |
| `pilot/team-handoff` | GitHub + GitLab | Team local installs via Cursor | Yes | No |
| `main` (local) | GitHub | Stale at v0.2.0; do not push to GitLab | Partial | No |
| `feat/sfcc-wa-parity` | GitLab | Your active feature work | Yes | No |

## Why people hit Playwright errors

The Windows / mixed-folder Playwright fix (`90a8b4e`) lives only on **`pilot/team-handoff`**. It was never merged into **`gitlab/main`**, which is what PROD and anyone cloning GitLab use.

Symptoms:

- "Chromium not found" after install
- Wrong browser type (`headless-shell` instead of full Chromium)
- Two copies of the repo (Desktop + Downloads) with browsers in the wrong folder

**Hosted users** (`solutions.bglobale.com/sweep`) should not see this — Docker installs Chromium in the container at build time.

**Local users** see it when they:

1. Clone or update from GitLab `main` instead of GitHub `pilot/team-handoff`
2. Run bare `npx playwright install` instead of `npm run playwright:install`
3. Keep multiple `global-sweep` folders and run Sweep from the wrong one

## Merge plan (recommended order)

### Phase 1 — Unify PROD baseline (you + Marouane)

**Goal:** One branch (`main` on GitLab) that is both hosted-ready and has the Playwright fix.

1. Branch from `prod` (GitLab main):
   ```bash
   git fetch gitlab
   git checkout prod
   git pull gitlab main
   git checkout -b release/v0.2.2-unify
   ```

2. Merge Playwright fix from `pilot/team-handoff`:
   ```bash
   git merge pilot/team-handoff -m "Merge Playwright install hardening from pilot/team-handoff"
   ```
   Resolve conflicts prioritizing:
   - Keep Docker / `tsconfig.build.json` / base-path from `prod`
   - Keep `src/playwright/paths.ts`, `scripts/install-playwright.ts`, server startup validation from `pilot/team-handoff`
   - Update `package.json` `playwright:install` to use the script, not the bare CLI

3. Run checks:
   ```bash
   npm run build && npm test -- --run
   npm run playwright:install
   PORT=3000 npm start   # verify /health
   ```

4. Bump to v0.2.2 in `CHANGELOG.md` + `package.json`.

5. Open MR to GitLab `main` — **only merge when Marouane confirms tag-based deploy** (or you both agree on the release).

### Phase 2 — Sync team handoff

After GitLab `main` has the unified release:

```bash
git checkout pilot/team-handoff
git merge prod   # or cherry-pick Docker/base-path commits if you want handoff lean
git push origin pilot/team-handoff
git push gitlab pilot/team-handoff
```

Update `SETUP_PROMPT.txt` / `UPDATE_SWEEP_PROMPT.txt` to say team handoff and GitLab main are aligned from v0.2.2 onward.

### Phase 3 — Feature work

| Branch | Purpose | Status |
|--------|---------|--------|
| `feat/brd-wa-quality` | Shopify WA cleanup, BRD Phase workflow, detection fixes | **Active** — merge → `pilot/team-handoff` when validated |
| `feat/sfcc-wa-parity` | SFCC platform parity + checkout hardening | **Parked** — WIP pushed; rebase onto `pilot/team-handoff` after Phase 3 BRD merge |

Rebase or merge feature branches onto the unified `prod` baseline before any PROD release.

**Shipped on `feat/brd-wa-quality` (2026-07-10):**

| Feature | Files |
|---------|-------|
| BRD Phase dropdown → Jira | `index.html`, `jira.ts`, `types.ts`, `composer.ts` |
| Canceled → Out Of Scope | `mapper.ts`, `jira.ts`, `prompt.ts`, `index.html` |
| Pre-order detector fix | `catalogDetector.ts` |
| Returns href detection | `policyExtractor.ts`, `scraper.ts`, `detectors.ts` |
| WA prompt slim-down | `prompt.ts` |

### Phase 4 — Governance (Marouane)

- [ ] GitLab `main`: protected branch, MR required, Richard approves
- [ ] Deploy on git tag (`v*`) only, not every commit
- [ ] Document in README: GitHub = team handoff, GitLab = hosted PROD

## Day-to-day rules

| Action | Branch |
|--------|--------|
| Local feature work | `feat/*` |
| Team Cursor installs | `pilot/team-handoff` (after Phase 2 sync) |
| Release to hosted PROD | MR → GitLab `main` + tag |
| Compare to live | `git log prod..HEAD` |

## Jira credentials on hosted (separate track)

See `docs/PILOT_READINESS.md` — hosted needs Okta + server-side secrets. Until then:

- Hosted: scrape + WA prompt only; disable "Remember on this computer"
- Jira BRD updates: local Sweep or Cursor MCP
