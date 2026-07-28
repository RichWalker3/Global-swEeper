# READ THIS FIRST — SFCC WA Parity Handoff

**For:** Codex (or any agent) continuing Website Assessment parity for **Salesforce Commerce Cloud (SFCC)** merchants.  
**Repo:** `global-sweep`  
**Branch:** `feat/sfcc-wa-parity-rebased` (rebased onto current handoff/BRD tip; do **not** merge SFCC into PROD until the 10-merchant baseline is green).  
**Last updated:** 2026-07-28

---

## Branch topology (read this)

| Branch | Role |
|--------|------|
| **`gitlab/main`** | **PROD** — hosted Sweep (`/sweep`, Docker, Product Forge). Ship target for releases. |
| **`pilot/team-handoff`** | Local/Cursor team installs. Not PROD. |
| **`release/v0.3.1-brd-quality`** | BRD quality release toward `gitlab/main`. |
| **`feat/sfcc-wa-parity-rebased`** | This SFCC workstream (parked until baseline session). |

Do **not** treat `pilot/team-handoff` as production. GitLab **`main`** is production.

---

## Mission (one sentence)

Make full Website Assessments on **non-Shopify, non-Global-e SFCC** storefronts as reliable as today’s Shopify flow — discovery, policy/catalog evidence, checkout attempt, and AI prompt quality.

---

## Read these docs next

| Doc | Purpose |
|-----|---------|
| [`docs/SFCC_WA_PARITY_PLAN.md`](docs/SFCC_WA_PARITY_PLAN.md) | Definition of Done, merge strategy, validation workflow |
| [`docs/NON_SHOPIFY_TEST_MERCHANTS.md`](docs/NON_SHOPIFY_TEST_MERCHANTS.md) | Curated **10 SFCC test merchants** (validated, non-GE) |
| [`.cursor/rules/sweep-commands.mdc`](.cursor/rules/sweep-commands.mdc) | How to launch/update Sweep locally |

**Backlog (not started):** Change feedback UI to post Jira comments instead of email.

---

## Strategy (follow this — do not overfit one site)

1. **Baseline first:** Run all 10 merchants with current code; bucket failures by class (discovery, variant, add-to-cart, checkout nav, prompt, bot/429).
2. **Fix the most common bucket** with **generic** patches (platform profile + shared checkout logic), not merchant-specific hacks.
3. **Re-run affected merchants + one control merchant**, then repeat.
4. Ship in **small, test-backed increments**; update this file’s “Latest validation” section when you learn something new.

---

## Architecture (where platform logic lives)

```
src/scraper/platforms/
  index.ts      → getPlatformProfile(platform)
  sfcc.ts       → SFCC selectors, URL patterns, checkout paths
  shopify.ts    → reference implementation
  shared.ts     → shared classifiers, store-locator filters, checkout helpers
src/scraper/checkoutTester.ts  → add-to-cart, variant selection, checkout navigation
src/scraper/crawler.ts         → crawl target discovery
src/scraper/indexedDiscovery.ts → sitemap/index discovery
src/scraper/scraper.ts         → orchestration
src/extractor/prompt.ts        → AI prompt; includes platform + scrape-health guidance
```

**Platform routing:** API/sweep options pass `platform: "sfcc"`. Scraper uses `getPlatformProfile()` for selectors and URL scoring — not a separate scraper binary per platform.

**Assisted browser:** Use `browserMode: "visible"` when bot/challenge pages block headless runs. Required for DoD but not the current top blocker until the 10-merchant baseline lands.

---

## What’s already done (high level)

### Platform wiring (2026-07-28 rebase)
- Platform types on `ScrapeOptions` / `CrawlSummary` (`selectedPlatform`, `platformConflict`, `botDetectionWarning`).
- `extractProductLinks(html, baseUrl, platform?)` via platform profiles.
- Discovery merges sitemap/search-index targets with DOM discovery.
- Checkout + prompt receive selected platform; UI/API normalize platform.
- Unit coverage in `src/scraper/platforms/platforms.test.ts`.

### Discovery / crawl quality
- Filter **physical store locator** URLs (`isPhysicalStoreLocationPath` in `shared.ts`).
- SFCC product URL patterns for locale `.html` PDPs (`sfcc.ts`).
- Quick-view / wishlist / compare / search-ajax URLs penalized or excluded from checkout candidates.

### Checkout / variants
- Multi-PDP retry, trusted swatch clicks, sold-out skip, ATC rejection/rate-limit detection.
- Locale-aware checkout paths.

### Prompt quality
- Selected-platform context + scrape-health guidance so clean crawls are not described as failed sweeps.

---

## Parked / next session

1. Run the **10-merchant baseline** from `docs/NON_SHOPIFY_TEST_MERCHANTS.md`.
2. Bucket failures (especially **429 pacing** and bot blocks).
3. Generic fixes only; re-run affected + one control.
4. Only then consider merge toward handoff / a PROD release branch targeting **`gitlab/main`**.

---

## Latest validation

- **2026-07-28:** Rebased onto handoff/BRD tip (`feat/sfcc-wa-parity-rebased`). Platform unit tests expected green via `npm run ci`. Live 10-merchant baseline **not** run yet — **parked**.
