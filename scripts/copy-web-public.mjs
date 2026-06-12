import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const sourceDir = join(rootDir, 'src', 'web', 'public');
const targetDir = join(rootDir, 'dist', 'web', 'public');

if (!existsSync(sourceDir)) {
  throw new Error(`Static web assets were not found at ${sourceDir}`);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

// The container image ships only dist/, so runtime data files must live inside it.
// /api/release-notes reads the changelog; without this copy the hosted app 500s.
const changelogSource = join(rootDir, 'CHANGELOG.md');
if (!existsSync(changelogSource)) {
  throw new Error(`CHANGELOG.md was not found at ${changelogSource}`);
}
cpSync(changelogSource, join(rootDir, 'dist', 'CHANGELOG.md'));
