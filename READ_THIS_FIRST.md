# READ THIS FIRST — SFCC WA Parity Handoff

**For:** Codex (or any agent) continuing Website Assessment parity for **Salesforce Commerce Cloud (SFCC)** merchants.  
**Repo:** `global-sweep`  
**Branch:** `feat/sfcc-wa-parity` (do **not** develop on `pilot/team-handoff`; merge to `main` only after validation).  
**Last updated:** 2026-05-20 (handoff from Cursor agent session)

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

**Backlog:** See [`docs/SWEEP_TODO.md`](docs/SWEEP_TODO.md).

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
src/scraper/scraper.ts         → orchestration (checkout timeout ~90s)
src/extractor/prompt.ts        → AI prompt; includes scrape-health guidance
```

**Platform routing:** API/sweep options pass `platform: "sfcc"`. Scraper uses `getPlatformProfile()` for selectors and URL scoring — not a separate scraper binary per platform.

**Assisted browser:** Use `browserMode: "visible"` when bot/challenge pages block headless runs. `scraper.ts` has `retryAfterAssistedPause` for visible-mode recovery. Required for DoD but not the current top blocker.

---

## What’s already done (high level)

### Discovery / crawl quality
- Filter **physical store locator** URLs (`isPhysicalStoreLocationPath` in `shared.ts`, used in `crawler.ts` + `indexedDiscovery.ts`).
- SFCC product URL patterns improved for locale `.html` PDPs (`sfcc.ts`).
- Quick-view / wishlist / compare / search-ajax URLs penalized or excluded from checkout candidates.

### Checkout / variants
- Multi-PDP retry (`MAX_CHECKOUT_PRODUCT_ATTEMPTS = 5`).
- `selectPurchasableOptions()` — radios, selects, Magento/SFCC swatch groups.
- **`selectPurchasableOptionsWithTrustedClicks()`** — Playwright clicks on `.swatchanchor` in `ul.swatches.size` / `width` (critical for CAT/Wolverine-family sites that ignore synthetic DOM `click()`).
- Add-to-cart waits for `Cart-Add` / `AddProuctVariationSelection` network responses.
- Sold-out PDP skip (`pageLooksSoldOut`).
- Rejection / rate-limit text detection on ATC responses (`ADD_TO_CART_REJECTION_PATTERNS`, `ADD_TO_CART_RATE_LIMIT_PATTERNS`).
- Locale-aware checkout paths (`inferLocalePathPrefix`).
- Checkout timeout increased to **90s** in `scraper.ts`.

### Prompt quality
- `prompt.ts`: scrape-health line so partial success is not described as “failed sweep” when crawl was clean.

### Tests
- `src/scraper/platforms/platforms.test.ts` — run after checkout/platform changes.

---

## Latest validation snapshot (local runs, May 2026)

Logs under `logs/assessments/*.json` (only a subset of 10 merchants re-run recently).

| Merchant | checkoutReached | Notes |
|----------|-----------------|-------|
| **CAT Footwear** | **true** | After trusted swatch clicks — reached `/US/en/checkout`. Log: `2026-05-20T00-42-54-813Z_www_catfootwear_com.json` |
| Skechers | false | `stage=add-to-cart`; crawl/checkout hit **HTTP 429** heavily |
| Chaco | false | Add-to-cart not confirmed; crawl dominated by **HTTP 429** |
| Merrell, Johnston & Murphy | (earlier session) | Partial progress on checkout nav / variants before CAT fix; re-baseline needed |
| Remaining 6 | not in recent logs | Run full baseline |

**Important finding:** CAT failed with `productaddtocartstatus=novariant` until **width + size** were selected via real Playwright clicks (not `page.evaluate` click only). Manual proof: clicking `label#swatch-width-M` and `label#swatch-size-10` then `#add-to-cart` returns `Cart-AddProduct` 200 and cart line items.

**Top remaining failure class:** **HTTP 429 / rate limiting** on aggressive parallel crawls (especially Skechers, Chaco), not variant logic alone.

---

## Immediate next work (priority order)

1. **Rate-limit-aware pacing (highest impact)**
   - Slow crawl + checkout on domains returning 429.
   - Consider: longer delays between page navigations, serial checkout after 429 on cart, backoff multiplier, reduce concurrent targets for SFCC profile.
   - Files: `helpers.ts` (`gotoWithRetry`), `scraper.ts`, possibly SFCC-specific limits in `sfcc.ts` or crawl options.

2. **Full 10-merchant baseline** (headless, `platform: "sfcc"`)
   - Record Pass / Partial / Fail per `SFCC_WA_PARITY_PLAN.md`.
   - Do **not** run all 10 in parallel on one machine if 429s spike — stagger or serialize.

3. **Chaco-specific check (after pacing)**
   - Accessory PDPs (e.g. wrist wrap) may be one-size; confirm color swatch + `One Size` still need trusted click path.

4. **Assisted browser DoD**
   - Document/trigger visible mode when PerimeterX or challenge pages appear; ensure logs say “manual intervention needed.”

5. **Merge hygiene**
   - Large uncommitted diff on branch — review `git status` before commit; **never commit `.env`**.

---

## How to run Sweep locally

```bash
cd /path/to/global-sweep
npm install
npm run playwright:install   # if browsers missing
npm run web                  # http://localhost:3847
```

**API example (SFCC merchant):**

```bash
curl -sS -X POST "http://localhost:3847/api/sweep" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.catfootwear.com/",
    "clientId": "sfcc-baseline-cat",
    "options": {
      "platform": "sfcc",
      "browserMode": "headless",
      "persistentProfile": true
    }
  }'
```

**Restart after code changes:**

```bash
lsof -ti :3847 | xargs kill -9
npm run web
```

Exit code **137** on restart shells is normal (intentional `kill -9`).

**Tests:**

```bash
npm test -- --run src/scraper/platforms/platforms.test.ts
npm run build
```

---

## 10-merchant SFCC test set (seed URLs)

From `docs/NON_SHOPIFY_TEST_MERCHANTS.md`:

1. https://www.merrell.com/
2. https://www.saucony.com/
3. https://www.columbia.com/
4. https://www.skechers.com/
5. https://www.bathandbodyworks.com/
6. https://usa.tommy.com/
7. https://www.chacos.com/
8. https://www.johnstonmurphy.com/
9. https://www.wolverine.com/
10. https://www.catfootwear.com/

Always **exclude Global-e-operated** merchants for this milestone.

---

## Failure taxonomy (use in notes)

| Class | Example symptom |
|-------|-----------------|
| discovery | Store locator loops, wrong PDP types, missing locale PDPs |
| variant selection | `novariant`, “select size”, empty `pid` |
| add-to-cart confirmation | `added=true` but empty cart, no `Cart-Add` response |
| checkout navigation | Stuck on cart, tracking page, locale path wrong |
| prompt quality | Report says “failed sweep” despite good crawl |
| bot / 429 | HTTP 429, PerimeterX, challenge pages |

---

## Key code pointers

- **Trusted swatch clicks:** `selectPurchasableOptionsWithTrustedClicks` in `checkoutTester.ts` (called from `ensurePurchasableVariant`).
- **Non-purchasable PDP URLs:** `NON_PURCHASABLE_CHECKOUT_CANDIDATE_PATTERNS`.
- **ATC network confirm:** `tryAddToCart` → `waitForResponse` for `Cart-Add|AddProuctVariationSelection|...`.
- **SFCC profile selectors:** `src/scraper/platforms/sfcc.ts` (`addToCartSelectors`, `checkoutButtonSelectors`, product URL score patterns).
- **Prompt scrape health:** `src/extractor/prompt.ts` → `scrapeHealthLine`.

---

## Git / branch state (at handoff)

- **Branch:** `feat/sfcc-wa-parity`
- **HEAD:** `db149b0 Release pilot version 0.2.0` (SFCC work may be **uncommitted** — run `git status` / `git diff`)
- **Merge target:** `main` → later sync to `pilot/team-handoff`

---

## Constraints for agents

- Use **MCP Jira/Confluence** or `.env` Atlassian creds per `.cursor/rules/` — no browser login to Atlassian.
- **Do not commit** unless the user asks.
- Prefer **common fixes** over per-merchant branches.
- After patches: unit tests + **at least one** SFCC merchant rerun + check `logs/assessments/`.

---

## Prior conversation context

Full agent transcript (large JSONL):  
`/Users/richard.walker/.cursor/projects/Users-richard-walker-Desktop-global-sweep/agent-transcripts/4ade5060-b2ca-4492-9708-8866c723f3f2/4ade5060-b2ca-4492-9708-8866c723f3f2.jsonl`

Search keywords: `novariant`, `trusted click`, `429`, `baseline`, `checkoutTester`.

---

## Suggested first message to Codex

> Continue SFCC WA parity on `feat/sfcc-wa-parity`. Read `READ_THIS_FIRST.md` and `docs/SFCC_WA_PARITY_PLAN.md`. Implement rate-limit pacing, then run a staggered 10-merchant baseline and fix the next most common failure bucket.
