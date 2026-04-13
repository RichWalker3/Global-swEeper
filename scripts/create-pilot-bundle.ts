import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const rootFiles = [
  'README.md',
  'SETUP_PROMPT.txt',
  'env.example',
];

const sourcePaths = [
  '.vscode/tasks.json',
  '.cursor/rules/sweep-commands.mdc',
  '.cursor/rules/wa.mdc',
  'src/dna',
  'src/extractor',
  'src/formatter',
  'src/logger',
  'src/prefilter',
  'src/schema',
  'src/scraper',
  'src/types',
  'src/web',
];

const docFiles = [
  'docs/DOMAIN_KNOWLEDGE.md',
  'docs/ONE_SHOT_SETUP_PROMPT.md',
  'docs/TEAM_SETUP.md',
  'docs/TEMPLATE.md',
];

function resolveFromRoot(relativePath: string): string {
  return path.join(repoRoot, relativePath);
}

async function ensureParentDirectory(targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
}

async function copyRelative(relativePath: string, outputDir: string): Promise<void> {
  const source = resolveFromRoot(relativePath);
  const destination = path.join(outputDir, relativePath);
  await ensureParentDirectory(destination);
  await cp(source, destination, { recursive: true });
}

async function writeBundledPackageJson(outputDir: string): Promise<void> {
  const source = await readFile(resolveFromRoot('package.json'), 'utf8');
  const packageJson = JSON.parse(source) as {
    name?: string;
    version?: string;
    type?: string;
    engines?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  const bundledPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    description: 'Global-sweep pilot bundle for teammate sharing',
    type: packageJson.type,
    private: true,
    engines: packageJson.engines,
    scripts: {
      web: 'PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers tsx src/web/server.ts',
      start: 'PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers tsx src/web/server.ts',
      'playwright:install': 'PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers playwright install chromium',
      postinstall: 'npm run playwright:install',
    },
    dependencies: {
      '@anthropic-ai/sdk': packageJson.dependencies?.['@anthropic-ai/sdk'],
      dotenv: packageJson.dependencies?.dotenv,
      marked: packageJson.dependencies?.marked,
      playwright: packageJson.dependencies?.playwright,
      'playwright-extra': packageJson.dependencies?.['playwright-extra'],
      'puppeteer-extra-plugin-stealth': packageJson.dependencies?.['puppeteer-extra-plugin-stealth'],
      'simple-wappalyzer': '^1.1.95',
      tsx: '^4.20.6',
      zod: packageJson.dependencies?.zod,
    },
  };

  await writeFile(
    path.join(outputDir, 'package.json'),
    `${JSON.stringify(bundledPackageJson, null, 2)}\n`,
    'utf8'
  );
}

async function writeBundledGitIgnore(outputDir: string): Promise<void> {
  const gitIgnore = `node_modules/
.playwright-browsers/
dist/
logs/
.env
.env.local
`;

  await writeFile(path.join(outputDir, '.gitignore'), gitIgnore, 'utf8');
}

async function writeBundledTsconfig(outputDir: string): Promise<void> {
  const source = await readFile(resolveFromRoot('tsconfig.json'), 'utf8');
  const tsconfig = JSON.parse(source) as {
    include?: string[];
    exclude?: string[];
  };

  tsconfig.include = [
    'src/dna/**/*',
    'src/extractor/**/*',
    'src/formatter/**/*',
    'src/logger/**/*',
    'src/prefilter/**/*',
    'src/schema/**/*',
    'src/scraper/**/*',
    'src/types/**/*',
    'src/web/**/*',
  ];
  tsconfig.exclude = ['node_modules', 'dist'];

  await writeFile(
    path.join(outputDir, 'tsconfig.json'),
    `${JSON.stringify(tsconfig, null, 2)}\n`,
    'utf8'
  );
}

async function writeStartHere(outputDir: string): Promise<void> {
  const startHere = `# Start Here

This folder is the teammate-facing Global-sweep pilot bundle.

## If You Just Want To Run Sweep

1. Open this folder in Cursor.
2. Run:

\`\`\`bash
npm install
npm run web
\`\`\`

3. Open \`http://localhost:3847\` in Cursor's Simple Browser.

## Files Most People Need

- \`README.md\`
- \`docs/TEAM_SETUP.md\`
- \`SETUP_PROMPT.txt\`

## Notes

- Playwright browsers install automatically during \`npm install\`.
- You do not need a committed \`.env\` for the default local run.
- This bundle intentionally excludes maintainer-only planning and admin utilities.
- Final WA output is still human-reviewed.
`;

  await writeFile(path.join(outputDir, 'START_HERE.md'), startHere, 'utf8');
}

async function writeBundleNote(outputDir: string): Promise<void> {
  const bundleNote = `# Pilot Bundle

This folder is a generated shareable bundle of Global-sweep.

It intentionally includes the app, the setup path, and the core WA docs while excluding:

- local env files and secrets
- maintainer-only planning docs
- Jira/Confluence admin helpers
- unused internal CLI entry points
- dev-only tooling that teammates do not need to run the app
- temporary files and scratch artifacts

Generated from the main repo with:

\`\`\`bash
npm run pilot:bundle
\`\`\`
`;

  await writeFile(path.join(outputDir, 'PILOT_BUNDLE.md'), bundleNote, 'utf8');
}

async function main(): Promise<void> {
  const outputArg = process.argv[2];
  const outputDir = outputArg
    ? path.resolve(repoRoot, outputArg)
    : path.join(repoRoot, 'tmp', 'pilot-share');

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  for (const relativePath of rootFiles) {
    await copyRelative(relativePath, outputDir);
  }

  for (const relativePath of sourcePaths) {
    await copyRelative(relativePath, outputDir);
  }

  for (const relativePath of docFiles) {
    await copyRelative(relativePath, outputDir);
  }

  await writeBundledPackageJson(outputDir);
  await writeBundledGitIgnore(outputDir);
  await writeBundledTsconfig(outputDir);
  await writeStartHere(outputDir);
  await writeBundleNote(outputDir);

  console.log(`Pilot bundle created at ${outputDir}`);
}

main().catch((error) => {
  console.error('Failed to create pilot bundle.');
  console.error(error);
  process.exit(1);
});
