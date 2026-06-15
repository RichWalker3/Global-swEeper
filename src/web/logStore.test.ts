import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendLog,
  clearLogs,
  exportDebugBundle,
  exportNdjson,
  listRuns,
  queryLogs,
  redactString,
  startRun,
  endRun,
} from './logStore.js';

describe('redactString', () => {
  it('redacts proxy credentials in URLs', () => {
    const input = 'Using proxy: http://user:secretpass@proxy.example.com:8080';
    expect(redactString(input)).not.toContain('secretpass');
    expect(redactString(input)).toContain('[REDACTED]');
  });

  it('redacts bearer tokens and API keys', () => {
    const input = 'Authorization: Bearer sk-ant-api03-abc123 JIRA_API_TOKEN=supersecret';
    const out = redactString(input);
    expect(out).not.toContain('sk-ant-api03-abc123');
    expect(out).not.toContain('supersecret');
  });

  it('redacts Shopify checkout path tokens', () => {
    const input = 'Checkout: https://shop.com/checkouts/cn/hWNDMPAUZ4QhEzwdfvk0ah1v/de-ie?_r=AQAB';
    const out = redactString(input);
    expect(out).not.toContain('hWNDMPAUZ4QhEzwdfvk0ah1v');
    expect(out).toContain('/checkouts/cn/[REDACTED]');
  });
});

describe('logStore', () => {
  beforeEach(() => {
    clearLogs();
  });

  afterEach(() => {
    clearLogs();
  });

  it('stores and queries logs by merchant URL', () => {
    const runId = 'run-rokid';
    startRun(runId, 'client-1', 'https://de.rokid.com/');
    appendLog({
      level: 'info',
      scope: 'scraper',
      event: 'page.scraped',
      runId,
      clientId: 'client-1',
      merchantUrl: 'https://de.rokid.com/',
      phase: 'page-scraping',
      message: 'Scraped home page',
      details: { url: 'https://de.rokid.com/de-de' },
    });
    endRun(runId, 'completed', { pagesScraped: 1, errorCount: 0 });

    const filtered = queryLogs({ merchantUrl: 'https://de.rokid.com/', q: 'page.scraped' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].event).toBe('page.scraped');
  });

  it('filters logs by runId and search text', () => {
    const runId = 'run-timeout';
    startRun(runId, 'client-2', 'https://example.com/');
    appendLog({
      level: 'warn',
      scope: 'scraper',
      event: 'page.timeout',
      runId,
      merchantUrl: 'https://example.com/',
      phase: 'page-scraping',
      message: 'Navigation timeout on /collections',
    });
    appendLog({
      level: 'info',
      scope: 'scraper',
      event: 'discovery.complete',
      runId,
      merchantUrl: 'https://example.com/',
      phase: 'discovery',
      message: 'Found 12 pages',
    });
    endRun(runId, 'partial', { pagesScraped: 0, errorCount: 1 });

    expect(queryLogs({ runId, q: 'timeout' })).toHaveLength(1);
    expect(queryLogs({ runId, q: 'discovery.complete' })).toHaveLength(1);
  });

  it('lists recent runs with summary metadata', () => {
    startRun('run-a', 'c1', 'https://a.com/');
    endRun('run-a', 'completed', { pagesScraped: 5, errorCount: 0 });
    startRun('run-b', 'c2', 'https://b.com/');
    appendLog({
      level: 'error',
      scope: 'server',
      event: 'sweep.failed',
      runId: 'run-b',
      merchantUrl: 'https://b.com/',
      message: 'Sweep failed',
    });
    endRun('run-b', 'failed', { pagesScraped: 0, errorCount: 1 });

    const runs = listRuns();
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const runB = runs.find((r) => r.runId === 'run-b');
    expect(runB?.status).toBe('failed');
    expect(runB?.errorCount).toBe(1);
  });

  it('exports a Cursor-friendly debug bundle', () => {
    const runId = 'run-export';
    startRun(runId, 'client-x', 'https://merchant.test/');
    appendLog({
      level: 'error',
      scope: 'scraper',
      event: 'scrape.timeout',
      runId,
      merchantUrl: 'https://merchant.test/',
      phase: 'page-scraping',
      message: 'Timed out after 420s',
      details: { proxyUrl: 'http://user:pass@proxy.test:8080' },
    });
    endRun(runId, 'partial', { pagesScraped: 0, errorCount: 3 });

    const bundle = exportDebugBundle({ runId });
    expect(bundle).toContain('Sweep Debug Bundle');
    expect(bundle).toContain('run-export');
    expect(bundle).toContain('Timed out after 420s');
    expect(bundle).not.toContain('pass@proxy');
  });

  it('exports NDJSON lines', () => {
    appendLog({
      level: 'info',
      scope: 'server',
      event: 'server.started',
      message: 'Server ready',
    });
    const ndjson = exportNdjson();
    const lines = ndjson.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe('server.started');
  });
});
