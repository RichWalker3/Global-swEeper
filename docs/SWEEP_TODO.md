# Sweep TODO / Backlog

Internal improvement list for Global-sweep. Not coworker-facing release notes — see `CHANGELOG.md` for shipped changes.

## Detection & catalog signals

- [ ] **Pre-order detector: stop treating "Notify Me" as pre-order** (`src/scraper/catalogDetector.ts`)
  - Remove from `PREORDER_PATTERNS`: `/notify\s*(me\s*)?when\s*available/i` and `/out\s*of\s*stock.*notify/i`
  - Rationale: "Notify me when available" is usually a **back-in-stock / waitlist** flow, not pay-now-ship-later pre-order
  - False positive example: Alex and Ani sold-out PDPs (`Notify Me When Available`) incorrectly flagged `preOrdersDetected: true` and BRD-025
  - Keep true pre-order signals: `pre-order`, `coming soon`, `ships on/by [date]`, `backorder`, pre-order UI classes/ids
  - Add/adjust unit test in catalog detector tests after change

- [ ] **Returns provider detection: surface Loop / ReturnGO / etc. in crawl + BRD-030** (`src/scraper/policyExtractor.ts`, `src/scraper/detectors.ts`, `src/scraper/scraper.ts`)
  - **Problem:** Returns vendor often missing from WA/BRD even when merchant uses a known portal
  - **False-negative example:** Alex and Ani — returns page shows button text "Returns & Exchanges Portal" but portal is **Loop Returns** at `https://alexandani-us.loopreturns.com/#/`; BRD-030 was written without naming Loop
  - **Why Sweep missed it:**
    - `extractPolicyInfo()` scans `cleanedText` (visible innerText) only — `loopreturns.com` is in the link `href`, not rendered text
    - Network `detectThirdParty()` only fires on requests to matching domains — page load fetches Shopify extension `cdn.shopify.com/extensions/.../loop-returns-469/...`, not `loopreturns.com` until the portal link is clicked
    - `returngoDetected` is a special-case flag; Loop/Narvar/Happy Returns have patterns in `detectors.ts` but were not triggered on this crawl
  - **Proposed fixes:**
    - Scan `rawHtml` hrefs (and/or anchor tags) for `RETURN_PORTAL_PATTERNS` in `policyExtractor.ts`, not just visible text
    - Add network pattern for Shopify Loop extension path (`loop-returns` in extension URLs)
    - Promote `returnProvider` / `returnPortal` into crawl summary and evidence bundle so WA prompt + BRD-030 can cite vendor by name
    - Include detected returns provider in `thirdPartiesDetected` consistently (already partially wired at `scraper.ts` ~823 when `returnProvider` is set)
  - **Providers to cover:** Loop Returns, ReturnGO, Narvar, Happy Returns, Returnly, AfterShip Returns (patterns already in `policyExtractor.ts` — need reliable triggering)
  - Add unit test using Alex and Ani–style HTML snippet (portal href present, vendor name absent from visible text)

## BRD status, Phase, and WA prompt rules

- [ ] **Stop using Jira status "Canceled" for no-evidence BRDs — use Leave Unchanged + Phase Out Of Scope**
  - **Rule:** Jira subtask **Status** should **never** be set to **Canceled** from Sweep/WA workflow
  - **When WA has no signal** (today: `Status: Canceled` / absent feature): keep status **Leave unchanged** (do not transition)
  - **Phase instead:** set Phase to **Out Of Scope** (`customfield_21069` → `Out Of Scope` / `23610`)
  - **Rationale:** "Canceled" implied the BRD was closed without scoping value; Out Of Scope captures "not in project scope" without touching workflow status
  - **Partial wiring today:** `src/brd/composer.ts` already maps `statusAction === 'canceled'` → `phaseAction: out_of_scope`, but UI + Jira still offer/write **Canceled** status
  - **Touch points:**
    - WA / Cursor prompt: `src/extractor/prompt.ts` — remove `Status: Canceled`, `"No WA evidence found."`, and Done-or-Canceled instructions
    - BRD parser: `src/brd/mapper.ts` — treat former Canceled lines as **unchanged status + Out Of Scope phase** (or omit status line)
    - BRD Workspace UI: `src/web/public/index.html` — remove **Canceled** from Status dropdown; default no-signal rows to **Leave unchanged** + **Out Of Scope**
    - Jira writer: `src/brd/jira.ts` — stop transitioning to Canceled; do not clear SE Output solely because feature is absent
    - Docs: `docs/CURSOR_CONTEXT.md` (BRD Output rules section)
  - **SE Output when no evidence:** leave existing Jira text unchanged, or omit/update Phase only — **never** write `"No WA evidence found."`

- [ ] **WA prompt: BRD Output format — Done vs Leave Unchanged**
  - **Status: Done** — when WA has evidence, a useful finding, or a scoping note for that BRD
  - **No status change** (omit or explicit **Leave unchanged**) — when feature absent / no WA signal; pair with **Phase: Out Of Scope** in Sweep UI (not in WA markdown line unless we add Phase to parser)
  - Remove all prompt examples that say `Status: Canceled | SE Output: No WA evidence found.`

## UI / workflow

- [x] **BRD Workspace: add per-row Phase dropdown + write to Jira** — **implemented on `feat/sfcc-wa-parity`, 2026-07-06, not merged to `main`**
  - **Shipped in app (local only):** `src/web/public/index.html`, `src/brd/jira.ts`, `src/brd/types.ts`, `src/brd/composer.ts`
  - **Release tracking:** `CHANGELOG.md` → **Unreleased**; merge via `docs/BRANCH_MERGE_PLAN.md` Phase 3
  - **Reference SOPP:** [SOPP-13184](https://global-e.atlassian.net/browse/SOPP-13184) (ALEX AND ANI)
  - **Jira field:** `customfield_21069` (Phase) — options: `in Scope` (`23609`), `Out Of Scope` (`23610`), `Future` (`23611`)
  - **UX:** Phase column next to Status — Leave unchanged | in Scope | Out Of Scope | Future; loads from Jira, WA suggests defaults, writes on Send to Jira
  - **Also writes:** `customfield_21538` (SE Scoping Output) + status transitions (unchanged behavior)

- [ ] **Feedback UI: post Jira comments instead of email** (not started)
