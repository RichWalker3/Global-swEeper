# Global Sweep - TODO

## UI Improvements

- [ ] **Move assessment bar above results on wide screens**
  - On full-screen/wider viewports, position the "New Assessment" input bar above the results box
  - Better use of horizontal space on desktop
  - Location: `src/web/public/index.html` or CSS

---

## Error Handling & Bad Scrapes

### High Priority

- [ ] **Surface HTTP errors to users**
  - Detect 404 responses and show "Page not found: [URL]" in UI
  - Detect 403/401 and show "Access denied: [URL]"
  - Currently: errors are logged but not prominently displayed
  - Location: `src/scraper/scraper.ts` → `extractPageData()` checks `response.status()` but only logs to `errors[]`
  - Need: Send error events via SSE to highlight failed pages in red

- [ ] **Detect Cloudflare/bot detection pages**
  - Check page content for Cloudflare challenge indicators:
    - `<title>` containing "Just a moment" or "Attention Required"
    - `cf-browser-verification`, `cf_chl_opt`, `cf-turnstile`
    - "Checking your browser" text
    - PerimeterX: `_px` cookies, "Press & Hold" challenges
    - DataDome: `datadome` in page content
  - Surface to user: "Bot detection encountered at [URL] - try again or use manual browser"
  - Location: Add detection in `extractPageData()` or new `detectBotBlock()` function

- [ ] **Auto-retry on transient failures**
  - Implement retry with exponential backoff for:
    - Timeouts (current 15s page timeout)
    - 429 (rate limited)
    - 503 (service unavailable)
    - Cloudflare challenges (wait longer, may resolve)
  - Max 2 retries per page, 3-5 second initial delay
  - Location: Wrap `page.goto()` calls in retry logic

### Medium Priority

- [ ] **Scrape health summary**
  - Show at end of scrape: "Scraped 18/20 pages successfully, 2 failed"
  - List failures with reason (404, blocked, timeout)
  - Give overall "scrape quality" score (green/yellow/red)

- [ ] **User notification for bad scrapes**
  - If >30% of pages fail, show warning banner
  - If homepage fails, abort early with clear message
  - Suggest: "Try running again" or "Site may require authentication"

## Reducing Bot Detection

### Strategies to Implement

- [ ] **Stealth mode improvements**
  - Current: Basic anti-detection (webdriver hide, fake plugins)
  - Add: `playwright-extra` with `stealth` plugin for comprehensive evasion
  - Add: Random delays between requests (500-2000ms)
  - Add: Mouse movement simulation before clicking

- [ ] **Browser fingerprint randomization**
  - Rotate user agents from a pool of real Chrome/Safari agents
  - Randomize viewport size slightly (±50px)
  - Randomize timezone/locale based on target site region

- [ ] **Request pacing**
  - Add configurable delay between page loads (default: 1-2s random)
  - Reduce parallel requests
  - Respect robots.txt crawl-delay hints

- [ ] **Cookie persistence**
  - Save/restore cookies between scrapes for same domain
  - Accept cookie consent banners automatically
  - Location: `context.addCookies()` / `context.cookies()`

- [ ] **Residential proxy support (future)**
  - Option to route through proxy
  - Config in `.env`: `PROXY_URL=http://user:pass@proxy:port`
  - Would help with aggressive bot detection

### Quick Wins

- [ ] Add longer initial page load wait (currently 1.5s → try 2-3s)
- [ ] Wait for network idle instead of just `domcontentloaded`
- [ ] Add `referer` header when navigating between pages
- [ ] Scroll page slowly before extracting content (mimics human)

## Implementation Notes

### Error Detection Code Snippet

```typescript
// Add to scraper.ts
function detectBotBlock(html: string, title: string): string | null {
  // Cloudflare
  if (title.includes('Just a moment') || html.includes('cf-browser-verification')) {
    return 'cloudflare';
  }
  // PerimeterX
  if (html.includes('_pxCaptcha') || html.includes('Press & Hold')) {
    return 'perimeterx';
  }
  // DataDome
  if (html.includes('datadome') && html.includes('captcha')) {
    return 'datadome';
  }
  // Generic challenge
  if (html.includes('challenge-running') || title.includes('Verify')) {
    return 'generic-challenge';
  }
  return null;
}
```

### Retry Logic Snippet

```typescript
async function gotoWithRetry(
  page: Page, 
  url: string, 
  options: { timeout: number; maxRetries?: number }
): Promise<Response | null> {
  const maxRetries = options.maxRetries ?? 2;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = 1000 * Math.pow(2, attempt); // 2s, 4s
        await page.waitForTimeout(delay);
      }
      return await page.goto(url, { timeout: options.timeout, waitUntil: 'domcontentloaded' });
    } catch (error) {
      lastError = error as Error;
      if (error.message.includes('net::ERR_') || error.message.includes('timeout')) {
        continue; // Retry
      }
      throw error; // Non-retryable
    }
  }
  throw lastError;
}
```

---

Last updated: 2026-03-12
