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
});
