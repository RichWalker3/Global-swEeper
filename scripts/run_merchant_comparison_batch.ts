import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { scrape } from '../src/scraper/scraper.js';
import { buildPrompt } from '../src/extractor/prompt.js';

type AdfNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: AdfNode[];
};

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: AdfNode;
  };
}

interface MerchantRunResult {
  key: string;
  merchantName: string;
  primaryUrl?: string;
  oldAssessmentPath?: string;
  promptPath?: string;
  scrapePath?: string;
  status: 'ok' | 'failed';
  error?: string;
  pagesVisited?: number;
  errors?: number;
  pagesBlocked?: number;
}

const DEFAULT_ISSUE_KEYS = [
  'SOPP-7132',
  'SOPP-7123',
  'SOPP-7067',
  'SOPP-7055',
  'SOPP-7029',
  'SOPP-7020',
  'SOPP-6989',
  'SOPP-6963',
  'SOPP-6926',
  'SOPP-6888',
  'SOPP-6860',
  'SOPP-6736',
  'SOPP-7997',
  'SOPP-7956',
  'SOPP-7677',
  'SOPP-7504',
  'SOPP-7418',
  'SOPP-7394',
  'SOPP-7346',
  'SOPP-7331',
  'SOPP-7284',
  'SOPP-7234',
  'SOPP-7182',
  'SOPP-7163',
];

function readEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8');
    return Object.fromEntries(
      content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const idx = line.indexOf('=');
          return [line.slice(0, idx), line.slice(idx + 1)];
        })
    );
  } catch {
    return {};
  }
}

function loadCredentials(): { email: string; token: string; baseUrl: string } {
  const env = {
    ...readEnvFile('/Users/richard.walker/Desktop/mcp-servers-master/.env'),
    ...readEnvFile('/Users/richard.walker/Desktop/global-sweep/.env'),
    ...process.env,
  };

  const email = env.JIRA_EMAIL || env.ATLASSIAN_EMAIL;
  const token = env.JIRA_API_TOKEN || env.ATLASSIAN_KEY;
  const baseUrl = env.JIRA_BASE_URL || 'https://global-e.atlassian.net';

  if (!email || !token || !baseUrl) {
    throw new Error('Missing Jira credentials');
  }

  return { email, token, baseUrl };
}

async function fetchIssues(keys: string[]): Promise<JiraIssue[]> {
  const { email, token, baseUrl } = loadCredentials();
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const jql = `key in (${keys.join(',')}) order by key asc`;
  const url = `${baseUrl}/rest/api/3/search/jql?fields=summary,description&maxResults=${keys.length}&jql=${encodeURIComponent(jql)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Jira fetch failed: HTTP ${response.status}`);
  }

  const data = await response.json() as { issues: JiraIssue[] };
  return data.issues || [];
}

function sanitizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function extractNodeText(node?: AdfNode): string {
  if (!node) return '';
  const pieces: string[] = [];
  if (node.text) pieces.push(node.text);
  if (node.content) {
    for (const child of node.content) {
      const childText = extractNodeText(child);
      if (childText) pieces.push(childText);
    }
  }
  return pieces.join('');
}

function extractUrls(node?: AdfNode): string[] {
  if (!node) return [];
  const urls: string[] = [];

  if (node.type === 'inlineCard' && typeof node.attrs?.url === 'string') {
    urls.push(node.attrs.url);
  }

  if (node.marks) {
    for (const mark of node.marks) {
      if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
        urls.push(mark.attrs.href);
      }
    }
  }

  if (node.content) {
    for (const child of node.content) {
      urls.push(...extractUrls(child));
    }
  }

  return urls;
}

function findPrimaryUrl(node?: AdfNode): string | undefined {
  if (!node) return undefined;

  const text = extractNodeText(node).replace(/\s+/g, ' ').trim();
  const urls = extractUrls(node);
  if (text.includes('Primary URL:') && urls.length > 0) {
    return urls[0];
  }

  if (node.content) {
    for (const child of node.content) {
      const match = findPrimaryUrl(child);
      if (match) return match;
    }
  }

  return urls[0];
}

function adfToPlainText(node?: AdfNode, depth = 0): string {
  if (!node) return '';

  if (node.type === 'text') {
    return node.text || '';
  }

  if (node.type === 'inlineCard' && typeof node.attrs?.url === 'string') {
    return String(node.attrs.url);
  }

  const childText = (node.content || []).map((child) => adfToPlainText(child, depth + 1)).join('');
  if (node.type === 'paragraph' || node.type === 'heading') {
    return `${childText}\n\n`;
  }
  if (node.type === 'listItem') {
    return `${'  '.repeat(Math.max(0, depth - 2))}- ${childText.trim()}\n`;
  }
  if (node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'doc') {
    return `${childText}${depth === 0 ? '\n' : ''}`;
  }

  return childText;
}

async function main(): Promise<void> {
  const keys = process.argv.slice(2);
  const issueKeys = keys.length > 0 ? keys : DEFAULT_ISSUE_KEYS;
  const startedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = join(process.cwd(), 'logs', 'comparison', `batch-${startedAt}-${process.pid}`);
  mkdirSync(outputDir, { recursive: true });

  const issues = await fetchIssues(issueKeys);
  const results: MerchantRunResult[] = [];

  for (const issue of issues) {
    const merchantName = issue.fields.summary.replace(/^Website Assessment\s*-\s*/i, '').trim();
    const safeName = sanitizeName(`${issue.key}-${merchantName}`);
    const merchantDir = join(outputDir, safeName);
    mkdirSync(merchantDir, { recursive: true });

    const oldAssessmentText = adfToPlainText(issue.fields.description).trim();
    const oldAssessmentPath = join(merchantDir, 'old-assessment.txt');
    writeFileSync(oldAssessmentPath, oldAssessmentText);

    const primaryUrl = findPrimaryUrl(issue.fields.description);
    if (!primaryUrl) {
      results.push({
        key: issue.key,
        merchantName,
        oldAssessmentPath,
        status: 'failed',
        error: 'Primary URL not found in Jira description',
      });
      continue;
    }

    console.log(`\n[${issue.key}] ${merchantName}`);
    console.log(`  URL: ${primaryUrl}`);

    try {
      const scrapeResult = await scrape(primaryUrl, {
        takeScreenshots: true,
        verbose: false,
        maxPages: 25,
        scrapeTimeout: 420000,
        skipCheckout: false,
      });
      const prompt = buildPrompt(scrapeResult);

      const scrapePath = join(merchantDir, 'scrape-result.json');
      const promptPath = join(merchantDir, 'prompt.txt');
      writeFileSync(scrapePath, JSON.stringify(scrapeResult, null, 2));
      writeFileSync(
        promptPath,
        `=== SYSTEM PROMPT ===\n\n${prompt.system}\n\n=== USER PROMPT ===\n\n${prompt.user}`
      );

      results.push({
        key: issue.key,
        merchantName,
        primaryUrl,
        oldAssessmentPath,
        promptPath,
        scrapePath,
        status: 'ok',
        pagesVisited: scrapeResult.summary.pagesVisited,
        errors: scrapeResult.summary.errors.length,
        pagesBlocked: scrapeResult.summary.pagesBlocked,
      });

      console.log(
        `  Done: ${scrapeResult.summary.pagesVisited} pages, ${scrapeResult.summary.errors.length} errors`
      );
    } catch (error) {
      results.push({
        key: issue.key,
        merchantName,
        primaryUrl,
        oldAssessmentPath,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown scrape error',
      });
      console.log(`  Failed: ${error instanceof Error ? error.message : 'Unknown scrape error'}`);
    }
  }

  const summaryPath = join(outputDir, 'summary.json');
  writeFileSync(summaryPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nSaved comparison batch to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
