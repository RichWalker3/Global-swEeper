import { describe, expect, it } from 'vitest';
import { parseChangelog, loadReleaseNotes } from './releaseNotes.js';

const SAMPLE = `# Changelog

Global-sweep uses major.minor.patch versioning.

## v0.2.1 - 2026-06-10

Hosted deployment fix.

### Fixed

- Routed frontend API calls through the base path.

### Added

- Regression coverage for base-path routing.

## v0.2.0 - 2026-05-18

First pilot baseline.
Spans two lines.

### Added

- BRD Workspace flow.
`;

describe('parseChangelog', () => {
  it('parses versions, dates, summaries, and sections', () => {
    const releases = parseChangelog(SAMPLE);
    expect(releases).toHaveLength(2);

    const [latest, previous] = releases;
    expect(latest.version).toBe('v0.2.1');
    expect(latest.date).toBe('2026-06-10');
    expect(latest.summary).toBe('Hosted deployment fix.');
    expect(latest.sections.map(s => s.title)).toEqual(['Fixed', 'Added']);
    expect(latest.sections[0].items).toEqual(['Routed frontend API calls through the base path.']);

    expect(previous.version).toBe('v0.2.0');
    expect(previous.summary).toBe('First pilot baseline. Spans two lines.');
  });

  it('orders releases newest first regardless of file order', () => {
    const reversed = parseChangelog(`## v0.1.0 - 2026-01-01\n\nOld.\n\n## v0.2.0 - 2026-02-01\n\nNew.\n`);
    expect(reversed.map(r => r.version)).toEqual(['v0.2.0', 'v0.1.0']);
  });

  it('ignores prose before the first version heading', () => {
    const releases = parseChangelog('Intro text\n\n## v1.0.0 - 2026-03-01\n\nSummary.\n');
    expect(releases).toHaveLength(1);
    expect(releases[0].summary).toBe('Summary.');
  });
});

describe('loadReleaseNotes', () => {
  it('parses the real CHANGELOG.md with at least one dated release', () => {
    const releases = loadReleaseNotes();
    expect(releases.length).toBeGreaterThan(0);
    expect(releases[0].version).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(releases[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
