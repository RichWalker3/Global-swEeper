/**
 * SFCC baseline runner — scrape one or more merchants with platform=sfcc.
 * Usage:
 *   npx tsx scripts/sfcc-baseline.ts merrell
 *   npx tsx scripts/sfcc-baseline.ts --all
 *   npx tsx scripts/sfcc-baseline.ts 1 2 3
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scrape } from '../src/scraper/scraper.js';
import type { KnownPlatform } from '../src/scraper/types.js';

interface MerchantSpec {
  id: string;
  name: string;
  url: string;
}

const MERCHANTS: MerchantSpec[] = [
  { id: 'merrell', name: 'Merrell', url: 'https://www.merrell.com/' },
  { id: 'saucony', name: 'Saucony', url: 'https://www.saucony.com/' },
  { id: 'columbia', name: 'Columbia Sportswear', url: 'https://www.columbia.com/' },
  { id: 'skechers', name: 'Skechers', url: 'https://www.skechers.com/' },
  { id: 'bbw', name: 'Bath & Body Works', url: 'https://www.bathandbodyworks.com/' },
  { id: 'tommy', name: 'Tommy Hilfiger US', url: 'https://usa.tommy.com/' },
  { id: 'chaco', name: 'Chaco', url: 'https://www.chacos.com/' },
  { id: 'johnstonmurphy', name: 'Johnston & Murphy', url: 'https://www.johnstonmurphy.com/' },
  { id: 'wolverine', name: 'Wolverine', url: 'https://www.wolverine.com/' },
  { id: 'cat', name: 'CAT Footwear', url: 'https://www.catfootwear.com/' },
];

const OUT_DIR = join('logs', 'sfcc-baseline');

function parseArgs(argv: string[]): MerchantSpec[] {
  if (argv.includes('--all')) return MERCHANTS;
  const selected: MerchantSpec[] = [];
  for (const arg of argv) {
    const byIndex = Number.parseInt(arg, 10);
    if (Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= MERCHANTS.length) {
      selected.push(MERCHANTS[byIndex - 1]);
      continue;
    }
    const byId = MERCHANTS.find((m) => m.id === arg.toLowerCase() || m.name.toLowerCase() === arg.toLowerCase());
    if (byId) selected.push(byId);
  }
  return selected.length > 0 ? selected : [MERCHANTS[0]];
}

function classify(result: Awaited<ReturnType<typeof scrape>>): {
  verdict: 'pass' | 'partial' | 'fail';
  buckets: string[];
} {
  const buckets: string[] = [];
  const summary = result.summary;
  const rateLimited = (summary.errors || []).some((e) => /429|503|rate limit/i.test(e.error))
    || (summary.checkoutStoppedAt || '').toLowerCase().includes('rate limited');
  const blocked = (summary.errors || []).filter((e) => e.type === 'blocked' || /cloudflare|akamai|datadome|perimeter/i.test(e.error));
  if (blocked.length > 0 || summary.botDetectionWarning) buckets.push('bot/challenge');
  if (rateLimited) buckets.push('rate_limit');
  if (summary.pagesVisited < 3) buckets.push('discovery');
  if (summary.productPagesScraped < 1) buckets.push('pdp');
  // SFCC checkout is best-effort: record the bucket for visibility, but do not require it for Pass.
  if (!summary.checkoutSkipped && !summary.checkoutReached) buckets.push('checkout');
  if (summary.scrapingCompletionWarning) buckets.push('timeout');

  if (buckets.includes('bot/challenge') && summary.pagesVisited === 0) {
    return { verdict: 'fail', buckets };
  }

  // Soft buckets: checkout miss / scrape timeout / rate-limit alone, or missing dedicated PDP scrape when checkout already proved a product path.
  const softBuckets = new Set(['checkout', 'timeout', 'rate_limit']);
  if (summary.checkoutReached || summary.checkoutSkipped) softBuckets.add('pdp');
  const softOnly = buckets.length > 0 && buckets.every((b) => softBuckets.has(b));
  const usableCrawl =
    summary.pagesVisited >= 5 && (summary.productPagesScraped >= 1 || summary.checkoutReached || summary.checkoutSkipped);

  if ((buckets.length === 0 || softOnly) && usableCrawl) {
    return { verdict: 'pass', buckets };
  }
  if (summary.pagesVisited >= 3) {
    return { verdict: 'partial', buckets: buckets.length ? buckets : ['prompt'] };
  }
  return { verdict: 'fail', buckets: buckets.length ? buckets : ['discovery'] };
}

async function runOne(merchant: MerchantSpec, platform: KnownPlatform = 'sfcc') {
  console.log(`\n=== ${merchant.name} (${merchant.url}) platform=${platform} ===`);
  const started = Date.now();
  const result = await scrape(merchant.url, {
    platform,
    verbose: true,
    maxPages: 18,
    scrapeTimeout: 360000,
    skipCheckout: false,
    takeScreenshots: false,
  });
  const { verdict, buckets } = classify(result);
  const elapsedMs = Date.now() - started;
  const row = {
    merchant: merchant.name,
    id: merchant.id,
    url: merchant.url,
    platform,
    verdict,
    buckets,
    elapsedMs,
    pagesVisited: result.summary.pagesVisited,
    productPagesScraped: result.summary.productPagesScraped,
    checkoutReached: result.summary.checkoutReached,
    checkoutSkipped: result.summary.checkoutSkipped,
    checkoutStoppedAt: result.summary.checkoutStoppedAt,
    platformDetected: result.summary.platformDetected,
    selectedPlatform: result.summary.selectedPlatform,
    botDetectionWarning: result.summary.botDetectionWarning,
    scrapingCompletionWarning: result.summary.scrapingCompletionWarning,
    errorCount: result.summary.errors?.length ?? 0,
    errors: (result.summary.errors || []).slice(0, 8),
    completedAt: new Date().toISOString(),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${merchant.id}.json`);
  writeFileSync(file, JSON.stringify(row, null, 2));

  const summaryPath = join(OUT_DIR, 'summary.json');
  const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : { runs: [] as unknown[] };
  summary.runs = [...(summary.runs || []).filter((r: { id?: string }) => r.id !== merchant.id), row];
  summary.updatedAt = new Date().toISOString();
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`→ ${verdict.toUpperCase()} buckets=${buckets.join(',') || 'none'} pages=${row.pagesVisited} pdp=${row.productPagesScraped} checkout=${row.checkoutReached} (${Math.round(elapsedMs / 1000)}s)`);
  console.log(`  wrote ${file}`);
  return row;
}

async function main() {
  const merchants = parseArgs(process.argv.slice(2));
  const results = [];
  for (const merchant of merchants) {
    try {
      results.push(await runOne(merchant));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`→ FAIL ${merchant.name}: ${message}`);
      results.push({ id: merchant.id, name: merchant.name, verdict: 'fail', error: message });
    }
  }
  console.log('\nBaseline batch done:', results.map((r) => `${(r as { id: string }).id}:${(r as { verdict: string }).verdict}`).join(' '));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
