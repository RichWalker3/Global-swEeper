# Global Sweep - TODO

## UI Improvements

- [x] **Move assessment bar above results on wide screens** ✅
  - On full-screen/wider viewports (≥1600px), layout changes to horizontal
  - Better use of horizontal space on desktop
  - Location: `src/web/public/index.html` CSS media queries

---

## Error Handling & Bad Scrapes

### High Priority

- [x] **Surface HTTP errors to users** ✅
  - Detects 404/403/401 responses and shows in UI
  - Errors displayed in progress log with red styling
  - Scrape health indicator shows success rate with color coding
  - SSE events send errors to frontend

- [x] **Detect Cloudflare/bot detection pages** ✅
  - Checks for Cloudflare, PerimeterX, DataDome, Akamai challenges
  - `detectBotBlock()` function in scraper.ts
  - Shows bot type in error messages

- [x] **Auto-retry on transient failures** ✅
  - `gotoWithRetry()` with exponential backoff
  - Max 2 retries for main pages, 1 for PDPs
  - Retries timeouts, connection errors, 429, 503
  - Waits longer on bot challenges before retry

### Medium Priority

- [x] **Scrape health summary** ✅
  - Shows "X/Y pages loaded - Z failed" 
  - Color-coded indicator (green/yellow/red based on error rate)
  - Lists failed pages with error type badges

- [x] **User notification for bad scrapes** ✅
  - Warning banner if >30% pages fail
  - Suggests re-running on high error rates

## Reducing Bot Detection

### Strategies Implemented

- [x] **Stealth mode improvements** ✅
  - Random delays between requests (500-1500ms)
  - Enhanced browser args for anti-detection
  - WebDriver property hidden, fake plugins injected

- [x] **Browser fingerprint randomization** ✅
  - User agent rotation from pool of 6 real agents
  - Viewport randomization with ±30px variation
  - Chrome version matched to user agent

- [x] **Request pacing** ✅
  - Random delays between page loads (500-1500ms)
  - Longer delays on retries (exponential backoff)

### Future Improvements

- [ ] **Cookie persistence**
  - Save/restore cookies between scrapes for same domain
  - Accept cookie consent banners automatically

- [ ] **Residential proxy support**
  - Option to route through proxy
  - Config in `.env`: `PROXY_URL=http://user:pass@proxy:port`

- [ ] Wait for network idle instead of just `domcontentloaded`
- [ ] Add `referer` header when navigating between pages
- [ ] Scroll page slowly before extracting content (mimics human)

---

## Testing

- [x] **Vitest test suite** ✅
  - Configured in `vitest.config.ts`
  - Run with `npm test`

### Test Coverage (268 tests)

| Module | Tests | Description |
|--------|-------|-------------|
| `helpers.test.ts` | 43 | Bot detection, retry logic, error classification, randomization |
| `detectors.test.ts` | 59 | Third-party detection, red flags, DG scanning, B2B detection |
| `policyExtractor.test.ts` | 56 | Return windows, fees, final sale, shipping restrictions |
| `catalogDetector.test.ts` | 64 | Bundles, subscriptions, gift cards, BNPL, loyalty, localization |
| `tagger.test.ts` | 46 | Page categorization by content/URL |

---

Last updated: 2026-03-12
