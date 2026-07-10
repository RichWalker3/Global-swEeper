# Sweep TODO / Backlog

Internal improvement list for Global-sweep. Not coworker-facing release notes — see `CHANGELOG.md` for shipped changes.

## Detection & catalog signals

- [x] **Pre-order detector: stop treating "Notify Me" as pre-order** (`src/scraper/catalogDetector.ts`) — 2026-07-10 on `feat/brd-wa-quality`
- [x] **Returns provider detection: surface Loop / ReturnGO / etc. in crawl + BRD-030** — href + Loop extension patterns — 2026-07-10 on `feat/brd-wa-quality`

## BRD status, Phase, and WA prompt rules

- [x] **Stop using Jira status "Canceled" for no-evidence BRDs — use Leave Unchanged + Phase Out Of Scope** — 2026-07-10 on `feat/brd-wa-quality`
- [x] **WA prompt: BRD Output format — Done vs omit no-signal BRDs** — 2026-07-10 on `feat/brd-wa-quality`

## UI / workflow

- [x] **BRD Workspace: add per-row Phase dropdown + write to Jira** — **implemented on `feat/brd-wa-quality`, 2026-07-10**
  - **Shipped in app (local only):** `src/web/public/index.html`, `src/brd/jira.ts`, `src/brd/types.ts`, `src/brd/composer.ts`
  - **Release tracking:** `CHANGELOG.md` → **Unreleased**; merge via `docs/BRANCH_MERGE_PLAN.md` Phase 3
  - **Reference SOPP:** [SOPP-13184](https://global-e.atlassian.net/browse/SOPP-13184) (ALEX AND ANI)
  - **Jira field:** `customfield_21069` (Phase) — options: `in Scope` (`23609`), `Out Of Scope` (`23610`), `Future` (`23611`)
  - **UX:** Phase column next to Status — Leave unchanged | in Scope | Out Of Scope | Future; loads from Jira, WA suggests defaults, writes on Send to Jira
  - **Also writes:** `customfield_21538` (SE Scoping Output) + status transitions (unchanged behavior)

- [ ] **Feedback UI: post Jira comments instead of email** (not started)
