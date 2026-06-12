/**
 * Release notes for the "What's new" menu in the web UI.
 * Parses CHANGELOG.md into structured releases so the frontend can render
 * a friendly, date-ordered history without duplicating the changelog.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The changelog lives at the repo root in dev, but container images ship only
 * `dist/` (see Dockerfile), where the build copies it to `dist/CHANGELOG.md`.
 */
const FALLBACK_CHANGELOG_PATHS = [
  join(__dirname, '..', '..', 'CHANGELOG.md'), // repo root (tsx dev / npm start from a checkout)
  join(__dirname, '..', 'CHANGELOG.md'), // dist/CHANGELOG.md (dist-only container runtime)
];

export function resolveChangelogPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SWEEP_CHANGELOG_PATH) return env.SWEEP_CHANGELOG_PATH;
  const found = FALLBACK_CHANGELOG_PATHS.find((path) => existsSync(path));
  // Fall through to the first candidate so readFileSync reports a clear ENOENT.
  return found ?? FALLBACK_CHANGELOG_PATHS[0];
}

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
  return parseChangelog(readFileSync(resolveChangelogPath(), 'utf-8'));
}
