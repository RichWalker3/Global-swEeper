import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, 'index.html'), 'utf8');

describe('hosted base path routing', () => {
  it('routes app-owned API and event calls through the deployment base path helper', () => {
    expect(html).toContain('function appUrl(path)');
    expect(html).not.toMatch(/(?:fetch|EventSource)\(\s*(?:`|['"])\/(?:api|events)/);
  });

  it('routes logs API calls through appUrl', () => {
    expect(html).toContain("fetchLogsApi('/api/logs/runs')");
    expect(html).toContain("fetchLogsApi(`/api/logs?");
    expect(html).not.toMatch(/fetch\(\s*['"]\/api\/logs/);
  });

  it('offers an Add warning checkbox that prefixes SE Output with a warning symbol', () => {
    expect(html).toContain('Add warning');
    expect(html).toContain('data-brd-warning-index');
    expect(html).toContain('withSeOutputWarning');
    expect(html).toContain('brdWarningHoverTip');
    expect(html).toContain('data-brd-warning-tip');
    expect(html).toContain('Check this box to add a warning symbol');
    expect(html).toContain('\\u26A0\\uFE0F');
  });
});
