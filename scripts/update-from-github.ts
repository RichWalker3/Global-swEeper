import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_URL = 'https://github.com/RichWalker3/Global-swEeper.git';
const BRANCH = 'pilot/team-handoff';
const PORT = process.env.PORT || '3847';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function run(command: string, args: string[], options: { allowFailure?: boolean } = {}): string {
  const label = [command, ...args].join(' ');
  console.log(`\n> ${label}`);
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (options.allowFailure) return '';
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Command failed: ${label}\n${detail}`);
  }
}

function stopSweepServer(): void {
  console.log(`Stopping any Sweep server on port ${PORT}...`);
  if (process.platform === 'win32') {
    run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }`,
    ], { allowFailure: true });
    return;
  }

  const pids = run('lsof', ['-ti', `:${PORT}`], { allowFailure: true })
    .split(/\s+/)
    .filter(Boolean);

  for (const pid of pids) {
    process.kill(Number(pid), 'SIGTERM');
  }
}

function assertProjectRoot(): void {
  const packagePath = join(root, 'package.json');
  if (!existsSync(packagePath)) {
    throw new Error('Could not find package.json. Run this from the global-sweep project folder.');
  }

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: string };
  if (packageJson.name !== 'global-sweep') {
    throw new Error('This does not look like the global-sweep project folder.');
  }
}

function backupLocalChanges(): void {
  const status = run('git', ['status', '--porcelain'], { allowFailure: true });
  if (!status) return;

  const backupDir = join(root, 'tmp', 'update-backups');
  mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(backupDir, `${timestamp}-status.txt`), status);
  writeFileSync(join(backupDir, `${timestamp}-diff.patch`), run('git', ['diff', 'HEAD'], { allowFailure: true }));
  console.log(`Local changes were detected. A best-effort backup was written to ${backupDir}.`);
}

function updateFromGithub(): void {
  if (!existsSync(join(root, '.git'))) {
    throw new Error([
      'This folder is not a Git clone, so it cannot update itself with git pull/reset.',
      `Ask Cursor to clone ${REPO_URL} branch ${BRANCH} into a fresh global-sweep folder, then run npm install.`,
    ].join('\n'));
  }

  backupLocalChanges();
  run('git', ['fetch', 'origin', BRANCH]);
  run('git', ['checkout', BRANCH]);
  run('git', ['reset', '--hard', `origin/${BRANCH}`]);
}

function installDependencies(): void {
  run('npm', ['install']);
  run('npm', ['run', 'playwright:install']);
}

function main(): void {
  assertProjectRoot();
  stopSweepServer();
  updateFromGithub();
  installDependencies();
  console.log('\nSweep is updated. Run npm run web, then open http://localhost:3847.');
}

main();
