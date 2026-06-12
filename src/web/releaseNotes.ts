/**
 * Release notes for the "What's new" menu in the web UI.
 * Parses CHANGELOG.md into structured releases so the frontend can render
 * a friendly, date-ordered history without duplicating the changelog.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANGELOG_PATH = join(__dirname, '..', '..', 'CHANGELOG.md');

export interface ReleaseSection {
  /** Heading like "Added", "Changed", "Fixed", "Verified". */
  title: string;
  items: string[];
}

export interface ReleaseNote {
  version: string;
  /** ISO date (YYYY-MM-DD) from the changelog heading; empty when missing. */
  date: string;
  /** Short friendly description paragraph under the version heading. */
  summary: string;
  sections: ReleaseSection[];
}

const VERSION_HEADING = /^## v?(\S+)(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const SECTION_HEADING = /^### (.+?)\s*$/;
const LIST_ITEM = /^[-*] (.+)$/;

/** Parse changelog markdown into releases, newest date first. */
export function parseChangelog(markdown: string): ReleaseNote[] {
  const releases: ReleaseNote[] = [];
  let current: ReleaseNote | null = null;
  let currentSection: ReleaseSection | null = null;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();

    const versionMatch = line.match(VERSION_HEADING);
    if (versionMatch) {
      current = { version: `v${versionMatch[1]}`, date: versionMatch[2] || '', summary: '', sections: [] };
      currentSection = null;
      releases.push(current);
      continue;
    }
    if (!current) continue;

    const sectionMatch = line.match(SECTION_HEADING);
    if (sectionMatch) {
      currentSection = { title: sectionMatch[1], items: [] };
      current.sections.push(currentSection);
      continue;
    }

    const itemMatch = line.match(LIST_ITEM);
    if (itemMatch && currentSection) {
      currentSection.items.push(itemMatch[1]);
      continue;
    }

    // Plain paragraph lines before the first section form the summary.
    if (!currentSection && line.trim() && !line.startsWith('#')) {
      current.summary = current.summary ? `${current.summary} ${line.trim()}` : line.trim();
    }
  }

  return releases.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/** Read and parse the project changelog. Throws if the file is missing. */
export function loadReleaseNotes(): ReleaseNote[] {
  return parseChangelog(readFileSync(CHANGELOG_PATH, 'utf-8'));
}
