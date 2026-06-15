/**
 * Deploy-parity smoke test. Runs the compiled server from a temp directory that
 * mirrors the container filesystem (package.json + node_modules + dist ONLY) and
 * exercises the routes a real visitor hits.
 *
 * This is the check that would have caught the v0.2.2 production crash: the app
 * worked from a full checkout but broke in the dist-only container because
 * CHANGELOG.md wasn't shipped. Run via: npm run verify:dist
 */

import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const PORT = 3900 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

async function waitForHealth(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return;
    } catch {
      // Server not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not become healthy on ${BASE} within ${timeoutMs / 1000}s`);
}

async function expectOk(path, validate) {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} returned HTTP ${response.status}`);
  }
  if (validate) await validate(response);
  console.log(`✓ GET ${path}`);
}

const stageDir = mkdtempSync(join(tmpdir(), 'sweep-dist-verify-'));
let child;

try {
  // Mirror the container: only package.json, node_modules, and dist.
  cpSync(join(rootDir, 'package.json'), join(stageDir, 'package.json'));
  cpSync(join(rootDir, 'dist'), join(stageDir, 'dist'), { recursive: true });
  symlinkSync(join(rootDir, 'node_modules'), join(stageDir, 'node_modules'), 'dir');

  child = spawn(process.execPath, ['dist/web/server.js'], {
    cwd: stageDir,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  let startupSettled = false;
  child.stdout.on('data', (chunk) => { serverOutput += chunk; });
  child.stderr.on('data', (chunk) => { serverOutput += chunk; });
  const exitEarly = new Promise((_, reject) => {
    child.on('exit', (code) => {
      if (!startupSettled) reject(new Error(`Server exited early (code ${code}).\n${serverOutput}`));
    });
  });
  exitEarly.catch(() => {}); // settled via Promise.race below; avoid unhandled rejection on shutdown

  await Promise.race([waitForHealth(), exitEarly]);
  startupSettled = true;

  await expectOk('/health');
  await expectOk('/', async (response) => {
    const html = await response.text();
    if (!html.includes('Global-sw')) throw new Error('Frontend HTML missing expected content');
  });
  await expectOk('/api/release-notes', async (response) => {
    const data = await response.json();
    if (!Array.isArray(data.releases) || data.releases.length === 0) {
      throw new Error('Release notes payload is empty — is CHANGELOG.md shipped in dist?');
    }
  });
  await expectOk('/api/feedback/status');
  await expectOk('/api/logs', async (response) => {
    const data = await response.json();
    if (!Array.isArray(data.logs)) {
      throw new Error('Logs payload missing logs array');
    }
  });
  await expectOk('/api/logs/runs', async (response) => {
    const data = await response.json();
    if (!Array.isArray(data.runs)) {
      throw new Error('Logs runs payload missing runs array');
    }
  });

  // The crash-loop scenario: hit the app like a browser does, twice, and make
  // sure the process is still alive afterwards.
  await expectOk('/api/release-notes');
  if (child.exitCode !== null) {
    throw new Error('Server process died while serving requests');
  }

  console.log('\n✓ dist runtime verified — safe to deploy');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  rmSync(stageDir, { recursive: true, force: true });
}
