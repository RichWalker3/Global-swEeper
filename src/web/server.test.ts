/**
 * HTTP integration tests against the real server.
 * Regression coverage for the v0.2.2 production crash loop: a throwing route
 * handler must answer with a single error response, never kill the process.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'net';
import { server } from './server.js';

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
