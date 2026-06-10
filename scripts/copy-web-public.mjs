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
