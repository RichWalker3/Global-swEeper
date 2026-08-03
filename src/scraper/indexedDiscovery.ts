import type { CrawlTarget, CrawlTargetType, KnownPlatform } from './types.js';
import { getPlatformProfile } from './platforms/index.js';
import { isLowValueCommerceCloudActionUrl, isPhysicalStoreLocationPath, SHARED_TEXT_CLASSIFIERS } from './platforms/shared.js';
import { gunzipSync } from 'node:zlib';

type FetchLike = typeof fetch;

interface SearchResult {
  url: string;
  title?: string;
  description?: string;
}

interface DiscoveryOptions {
  verbose?: boolean;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
}

const MAX_SITEMAPS_TO_READ = 12;
const MAX_URLS_PER_SITEMAP = 500;
const MAX_SITEMAP_TARGETS = 18;
const MAX_SEARCH_TARGETS = 12;

const SOURCE_PRIORITY: Record<string, number> = {
  seed: 1000,
  sitemap: 900,
  'search-index': 850,
};

const TYPE_PRIORITY: Record<CrawlTargetType, number> = {
  home: 100,
  policy: 95,
  rewards: 94,
  cart: 90,
  collection: 80,
  checkout: 70,
  pdp: 10,
  other: 5,
};

const MAX_TARGETS_PER_TYPE: Partial<Record<CrawlTargetType, number>> = {
  home: 2,
  policy: 4,
  rewards: 3,
  cart: 2,
  checkout: 2,
  collection: 4,
  pdp: 4,
  other: 4,
};

export function classifyCrawlTargetUrl(
  targetUrl: string,
  platform?: KnownPlatform,
  text = ''
): CrawlTargetType {
  const profile = getPlatformProfile(platform);
  const url = new URL(targetUrl);
  const path = url.pathname;

  if (path === '/' || path === '') return 'home';

  if (profile.productUrlScorePatterns.some(({ pattern }) => pattern.test(targetUrl))) return 'pdp';
  if (profile.productUrlPatterns.some((pattern) => new RegExp(pattern.source, pattern.flags.replace('g', '')).test(`href="${targetUrl}"`))) {
    return 'pdp';
  }

  for (const classifier of profile.linkClassifiers) {
    if (classifier.pattern.test(path)) return classifier.type;
  }

  if (text) {
    for (const classifier of SHARED_TEXT_CLASSIFIERS) {
      if (classifier.pattern.test(text)) return classifier.type;
    }
  }

  if (profile.productDiscoveryPaths.some((candidate) => candidate !== '/' && path.includes(candidate.replace(/^\//, '')))) {
    return 'collection';
  }

  return 'other';
}

export function normalizeCrawlTargetUrl(rawUrl: string, seedUrl: string): string | null {
  try {
    const seed = new URL(seedUrl);
    const url = new URL(rawUrl, seed.origin);
    if (!url.protocol.startsWith('http')) return null;
    if (url.hostname.replace(/^www\./, '') !== seed.hostname.replace(/^www\./, '')) return null;
    if (/\.(jpg|jpeg|png|gif|svg|css|js|woff2?|ico|pdf|xml|xml\.gz)$/i.test(url.pathname)) return null;
    if (isPhysicalStoreLocationPath(url.pathname)) return null;
    url.hash = '';
    return url.origin + url.pathname.replace(/\/$/, '') + url.search;
  } catch {
    return null;
  }
}

export function sortAndLimitTargets(targets: CrawlTarget[], maxTargets: number): CrawlTarget[] {
  const seen = new Set<string>();
  const typeCounts: Partial<Record<CrawlTargetType, number>> = {};
  return targets
    .filter((target) => {
      if (seen.has(target.url)) return false;
      if (isLowValueCommerceCloudActionUrl(target.url)) return false;
      seen.add(target.url);
      return true;
    })
    .sort((a, b) => {
      const typeDelta = (TYPE_PRIORITY[b.type] || 0) - (TYPE_PRIORITY[a.type] || 0);
      if (typeDelta !== 0) return typeDelta;
      return (SOURCE_PRIORITY[b.source || ''] || 0) - (SOURCE_PRIORITY[a.source || ''] || 0);
    })
    .filter((target) => {
      typeCounts[target.type] = (typeCounts[target.type] || 0) + 1;
      return typeCounts[target.type]! <= (MAX_TARGETS_PER_TYPE[target.type] || maxTargets);
    })
    .slice(0, maxTargets);
}

export async function discoverIndexedTargets(
  seedUrl: string,
  platform?: KnownPlatform,
  options: DiscoveryOptions = {}
): Promise<CrawlTarget[]> {
  const sitemapTargets = await discoverSitemapTargets(seedUrl, platform, options);
  const searchTargets = await discoverSearchIndexTargets(seedUrl, platform, options);
  return sortAndLimitTargets([...sitemapTargets, ...searchTargets], MAX_SITEMAP_TARGETS + MAX_SEARCH_TARGETS);
}

export async function discoverSitemapTargets(
  seedUrl: string,
  platform?: KnownPlatform,
  options: DiscoveryOptions = {}
): Promise<CrawlTarget[]> {
  const fetchImpl = options.fetchImpl || fetch;
  const sitemapUrls = await discoverSitemapUrls(seedUrl, fetchImpl);
  const targets: CrawlTarget[] = [];
  const visitedSitemaps = new Set<string>();
  const queue = sitemapUrls.slice(0, MAX_SITEMAPS_TO_READ);

  while (queue.length > 0 && visitedSitemaps.size < MAX_SITEMAPS_TO_READ && targets.length < MAX_SITEMAP_TARGETS) {
    const sitemapUrl = queue.shift()!;
    if (visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);

    const xml = await fetchText(sitemapUrl, fetchImpl);
    if (!xml) continue;

    const locs = extractLocValues(xml).slice(0, MAX_URLS_PER_SITEMAP);
    const nestedSitemaps = locs.filter(isSitemapUrl);
    queue.push(...nestedSitemaps.slice(0, MAX_SITEMAPS_TO_READ - visitedSitemaps.size));

    for (const loc of locs) {
      if (isSitemapUrl(loc)) continue;
      const normalized = normalizeCrawlTargetUrl(loc, seedUrl);
      if (!normalized) continue;
      targets.push({
        url: normalized,
        type: classifyCrawlTargetUrl(normalized, platform),
        source: 'sitemap',
      });
      if (targets.length >= MAX_SITEMAP_TARGETS) break;
    }
  }

  if (options.verbose && targets.length > 0) {
    console.log(`  → Sitemap discovery found ${targets.length} target(s)`);
  }

  return sortAndLimitTargets(targets, MAX_SITEMAP_TARGETS);
}

async function discoverSitemapUrls(seedUrl: string, fetchImpl: FetchLike): Promise<string[]> {
  const base = new URL(seedUrl).origin;
  const robotsText = await fetchText(`${base}/robots.txt`, fetchImpl);
  const fromRobots = robotsText
    ? robotsText
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*sitemap:\s*(.+)\s*$/i)?.[1]?.trim())
      .filter((value): value is string => Boolean(value))
    : [];

  return Array.from(new Set([...fromRobots, `${base}/sitemap.xml`]));
}

async function fetchText(url: string, fetchImpl: FetchLike): Promise<string | null> {
  try {
    const response = await fetchImpl(url, {
      headers: {
        'user-agent': 'Global-swEep sitemap discovery',
        'accept': 'application/xml,text/xml,text/plain,*/*',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (/\.gz(\?|$)/i.test(url)) {
      try {
        return gunzipSync(buffer).toString('utf8');
      } catch {
        return buffer.toString('utf8');
      }
    }
    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

function isSitemapUrl(url: string): boolean {
  return /\.xml(?:\.gz)?(\?|$)/i.test(url);
}

function extractLocValues(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi), (match) => decodeXml(match[1].trim()));
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function discoverSearchIndexTargets(
  seedUrl: string,
  platform?: KnownPlatform,
  options: DiscoveryOptions = {}
): Promise<CrawlTarget[]> {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const provider = (env.SWEEP_SEARCH_INDEX_PROVIDER || '').toLowerCase();
  const domain = new URL(seedUrl).hostname;
  const queries = buildSearchQueries(domain);
  const results: SearchResult[] = [];

  if (provider === 'brave' && env.BRAVE_SEARCH_API_KEY) {
    for (const query of queries) {
      results.push(...await searchBrave(query, env.BRAVE_SEARCH_API_KEY, fetchImpl));
    }
  } else if (provider === 'bing' && env.BING_SEARCH_API_KEY) {
    for (const query of queries) {
      results.push(...await searchBing(query, env.BING_SEARCH_API_KEY, fetchImpl));
    }
  } else {
    if (options.verbose && provider) {
      console.log('  → Search-index discovery skipped (missing API key or unsupported provider)');
    }
    return [];
  }

  const targets = results
    .map((result): CrawlTarget | null => {
      const normalized = normalizeCrawlTargetUrl(result.url, seedUrl);
      if (!normalized) return null;
      const text = [result.title, result.description].filter(Boolean).join(' ');
      return {
        url: normalized,
        type: classifyCrawlTargetUrl(normalized, platform, text),
        source: 'search-index',
      };
    })
    .filter((target): target is CrawlTarget => Boolean(target));

  if (options.verbose && targets.length > 0) {
    console.log(`  → Search-index discovery found ${targets.length} target(s)`);
  }

  return sortAndLimitTargets(targets, MAX_SEARCH_TARGETS);
}

function buildSearchQueries(domain: string): string[] {
  return [
    `site:${domain} shipping OR delivery`,
    `site:${domain} returns OR exchanges`,
    `site:${domain} gift cards OR registry OR rewards`,
    `site:${domain} product OR shop`,
  ];
}

async function searchBrave(query: string, apiKey: string, fetchImpl: FetchLike): Promise<SearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '5');

  const response = await fetchImpl(url, {
    headers: {
      'accept': 'application/json',
      'x-subscription-token': apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return [];

  const data = await response.json() as { web?: { results?: Array<{ url: string; title?: string; description?: string }> } };
  return data.web?.results || [];
}

async function searchBing(query: string, apiKey: string, fetchImpl: FetchLike): Promise<SearchResult[]> {
  const url = new URL('https://api.bing.microsoft.com/v7.0/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '5');

  const response = await fetchImpl(url, {
    headers: {
      'accept': 'application/json',
      'ocp-apim-subscription-key': apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return [];

  const data = await response.json() as { webPages?: { value?: Array<{ url: string; name?: string; snippet?: string }> } };
  return (data.webPages?.value || []).map((result) => ({
    url: result.url,
    title: result.name,
    description: result.snippet,
  }));
}
