import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function readPackageVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, 'package.json'), 'utf8')
  ) as { version?: string };

  return packageJson.version || '0.1.0';
}

async function main(): Promise<void> {
  const version = await readPackageVersion();
  const releaseRoot = path.join(repoRoot, 'tmp', 'pilot-release');
  const bundleDir = path.join(releaseRoot, `global-sweep-pilot-v${version}`);
  const archiveName = `global-sweep-pilot-v${version}.tar.gz`;
  const archivePath = path.join(releaseRoot, archiveName);

  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(releaseRoot, { recursive: true });

  await execFileAsync(
    npmCommand(),
    ['run', 'pilot:bundle', '--', bundleDir],
    { cwd: repoRoot }
  );

  await execFileAsync(
    'tar',
    ['-czf', archivePath, '-C', releaseRoot, path.basename(bundleDir)],
    { cwd: repoRoot }
  );

  console.log(`Pilot release folder created at ${releaseRoot}`);
  console.log(`Bundle directory: ${bundleDir}`);
  console.log(`Archive created: ${archivePath}`);
}

main().catch((error) => {
  console.error('Failed to package pilot bundle.');
  console.error(error);
  process.exit(1);
});
