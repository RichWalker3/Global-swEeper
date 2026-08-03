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

Make full Website Assessments on **non-Shopify, non-Global-e SFCC** storefronts as reliable as today’s Shopify flow for **discovery, policy/catalog evidence, and WA prompt quality**. Checkout is **best-effort** on SFCC (bot walls / 429 / custom carts) — useful when it works, not a guarantee and not required for a usable assessment.

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

- **2026-07-28:** Full 10-merchant SFCC baseline via `scripts/sfcc-baseline.ts` on `feat/sfcc-wa-parity-rebased`.

### Product bar (SFCC checkout)
- **Must:** enough crawl/policy/PDP evidence for a usable WA; clear checkout stop reason when it doesn’t complete.
- **Nice:** ATC + checkout when the site allows it.
- **Don’t:** fail an otherwise-usable SFCC run solely because checkout wasn’t reached.
- Soft classifier buckets: `checkout`, `timeout`, `rate_limit` (and `pdp` when checkout reached/skipped). Hard fail stays for bot walls with 0 pages.

### Scoreboard
| Merchant | Verdict | Notes |
|----------|---------|--------|
| Merrell | **PASS** | 18 pages, checkout reached |
| Saucony | **PASS** | 18 pages, checkout reached |
| Columbia | **FAIL** | PerimeterX hard block (0 pages) — needs **Watch browser** assisted path |
| Skechers | **PARTIAL** | Usable crawl; ATC not confirmed under 429 pressure |
| Bath & Body Works | **PARTIAL** | PerimeterX + timeout — assisted browser |
| Tommy Hilfiger | **PASS*** | Checkout reached; dedicated PDP scrape 0 (soft) |
| Chaco | **PARTIAL** | Rate-limited PDPs; checkout now skipped when crawl already rate-limited |
| Johnston & Murphy | **PASS** | Genesco size/width + 360s budget |
| Wolverine | **FAIL*** | Heavy 429 / thin crawl; Demandware noise filtered |
| CAT Footwear | **PASS*** | Checkout reached; dedicated PDP scrape 0 (soft) |

**Totals:** 5 PASS / 3 PARTIAL / 2 FAIL

### Loop status (2026-07-29 / updated 2026-08-03)
Code mitigations landed for SFCC: Genesco variants, locale checkout paths, Wishlist/Order noise filters, 429 crawl+PDP circuit breakers, cart deferred to checkout, skip checkout when rate-limited, best-effort classifier, **evidence coverage panel** + WA prompt guidance.
**Useful evidence:** Merrell/Saucony/J&M/Tommy/CAT produce strong WA inputs (policies, apps, often checkout). Chaco-class still useful for returns/apps when checkout is skipped. Columbia-class bot walls remain empty.
**Remaining hard gaps are environmental:** PerimeterX (Columbia/BBW) and aggressive 429 walls. Hosted Watch browser cannot help end users.
**Headless retests parked.** CHANGELOG **Unreleased** holds the SFCC launch What's New copy — bump to a dated version on ship so the popup auto-opens.

### Top fix buckets (next loop work)
1. **Assisted browser validation** for Columbia / BBW (`browserMode: visible` + persistent profile) — already in UI; needs a manual assisted run, not more headless loops
2. **Accept 429 merchants as best-effort PARTIAL/soft-Pass** once crawl evidence is strong and checkout is skipped cleanly
3. Optional: Skechers ATC deep-dive only if product still wants checkout on that site
