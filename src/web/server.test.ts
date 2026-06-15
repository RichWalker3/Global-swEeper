/**
 * HTTP integration tests against the real server.
 * Regression coverage for the v0.2.2 production crash loop: a throwing route
 * handler must answer with a single error response, never kill the process.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'net';
import { server } from './server.js';
import { appendLog, clearLogs, startRun, endRun } from './logStore.js';

let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('GET /api/release-notes', () => {
  it('returns parsed releases', async () => {
    const response = await fetch(`${baseUrl}/api/release-notes`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.releases)).toBe(true);
    expect(data.releases.length).toBeGreaterThan(0);
    expect(data.releases[0].version).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('responds 500 once when the changelog is unreadable, and the server survives', async () => {
    process.env.SWEEP_CHANGELOG_PATH = '/nonexistent/CHANGELOG.md';
    try {
      const failed = await fetch(`${baseUrl}/api/release-notes`);
      expect(failed.status).toBe(500);
      const body = await failed.json();
      expect(typeof body.error).toBe('string');
    } finally {
      delete process.env.SWEEP_CHANGELOG_PATH;
    }

    // The v0.2.2 bug killed the Node process here; the server must still answer.
    const recovered = await fetch(`${baseUrl}/api/release-notes`);
    expect(recovered.status).toBe(200);
  });
});

describe('core routes', () => {
  it('serves the health check', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  it('serves the frontend', async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Global-sw');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(response.status).toBe(404);
  });
});

describe('logs API', () => {
  beforeEach(() => {
    clearLogs();
    delete process.env.SWEEP_LOGS_TOKEN;
  });

  it('returns structured logs with merchant filter', async () => {
    const runId = 'api-run-1';
    startRun(runId, 'client-1', 'https://de.rokid.com/');
    appendLog({
      level: 'warn',
      scope: 'scraper',
      event: 'page.timeout',
      runId,
      merchantUrl: 'https://de.rokid.com/',
      phase: 'page-scraping',
      message: 'Timed out on /collections',
    });
    endRun(runId, 'partial', { pagesScraped: 0, errorCount: 1 });

    const response = await fetch(`${baseUrl}/api/logs?merchantUrl=${encodeURIComponent('https://de.rokid.com/')}&q=timeout`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.logs)).toBe(true);
    expect(data.logs.some((entry: { event: string }) => entry.event === 'page.timeout')).toBe(true);
  });

  it('returns recent runs', async () => {
    startRun('run-list', 'c1', 'https://merchant.test/');
    endRun('run-list', 'completed', { pagesScraped: 3, errorCount: 0 });

    const response = await fetch(`${baseUrl}/api/logs/runs`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.runs.some((run: { runId: string }) => run.runId === 'run-list')).toBe(true);
  });

  it('exports a debug bundle', async () => {
    appendLog({
      level: 'info',
      scope: 'server',
      event: 'server.ready',
      message: 'Sweep ready',
    });

    const response = await fetch(`${baseUrl}/api/logs/export?format=text`);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('Sweep Debug Bundle');
    expect(text).toContain('server.ready');
  });

  it('clears logs on DELETE /api/logs', async () => {
    appendLog({
      level: 'info',
      scope: 'server',
      event: 'temp.event',
      message: 'temporary',
    });

    const cleared = await fetch(`${baseUrl}/api/logs`, { method: 'DELETE' });
    expect(cleared.status).toBe(200);

    const response = await fetch(`${baseUrl}/api/logs`);
    const data = await response.json();
    expect(data.logs).toHaveLength(0);
  });

  it('requires bearer token when SWEEP_LOGS_TOKEN is set', async () => {
    process.env.SWEEP_LOGS_TOKEN = 'secret-test-token';

    const denied = await fetch(`${baseUrl}/api/logs`);
    expect(denied.status).toBe(401);

    const allowed = await fetch(`${baseUrl}/api/logs`, {
      headers: { Authorization: 'Bearer secret-test-token' },
    });
    expect(allowed.status).toBe(200);
  });
});
