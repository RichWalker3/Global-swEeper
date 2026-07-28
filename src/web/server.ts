/**
 * Local web server for Global-swEep UI
 * Provides real-time progress updates via Server-Sent Events
 */

import 'dotenv/config';
import { ensurePlaywrightBrowsersPath, validateChromiumInstall } from '../playwright/paths.js';

ensurePlaywrightBrowsersPath();
const chromiumStatus = validateChromiumInstall();
if (!chromiumStatus.ok) {
  console.warn(`[sweep] ${chromiumStatus.error}`);
  console.warn('[sweep] Website assessments will fail until Chromium is installed. Run: npm run playwright:install');
}
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, extname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { scrape } from '../scraper/scraper.js';
import { buildPrompt } from '../extractor/prompt.js';
import { acquireSweepRunSlot } from './sweepRunGate.js';
import { generateDna } from '../dna/generator.js';
import { generateBrdDraft } from '../brd/generator.js';
import { composeBrdReview } from '../brd/composer.js';
import { requireSoppKey } from '../brd/guard.js';
import { BRD_REQUIREMENTS } from '../brd/requirements.js';
import type { BrdParentContext } from '../brd/types.js';
import {
  applyBrdTableUpdates,
  applySeOutputUpdates,
  loadBrdParent,
  previewSeOutputUpdates,
  validateJiraConfig,
} from '../brd/jira.js';
import {
  clearJiraSession,
  clearStoredJiraCredentials,
  getActiveJiraConfig,
  getJiraConnectionStatus,
  rememberJiraSession,
  setJiraSession,
} from '../jira/session.js';
import { formatMarkdown } from '../formatter/markdown.js';
import { loadReleaseNotes } from './releaseNotes.js';
import {
  appendLog,
  clearLogs,
  createLogSink,
  endRun,
  exportDebugBundle,
  exportNdjson,
  isLogsAccessAllowed,
  listRuns,
  queryLogs,
  startRun,
  type LogQuery,
} from './logStore.js';
import type { ScrapeResult, KnownPlatform } from '../scraper/types.js';
import type { BrdReviewResult } from '../brd/types.js';
import { normalizePlatform } from '../scraper/platforms/index.js';

function hostedMaxPages(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SWEEP_HOSTED_MAX_PAGES;
  if (raw !== undefined && raw !== '') {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) return Math.min(parsed, 50);
  }
  return 25;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3847;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

// Feedback counter config
const FEEDBACK_MONTHLY_LIMIT = 250;
const FEEDBACK_WARNING_THRESHOLD = 20;
const FEEDBACK_DATA_PATH = join(dirname(__dirname), '..', 'logs', 'feedback-count.json');

interface FeedbackCount {
  month: string;  // "2026-03"
  count: number;
  resetDay: number;  // Day of month to reset (1 = 1st)
}

function ensureLogsDir(): void {
  const logsDir = join(dirname(__dirname), '..', 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
}

function getFeedbackCount(): FeedbackCount {
  ensureLogsDir();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentDay = new Date().getDate();
  
  try {
    if (existsSync(FEEDBACK_DATA_PATH)) {
      const data: FeedbackCount = JSON.parse(readFileSync(FEEDBACK_DATA_PATH, 'utf-8'));
      
      // Check if we need to reset (new month or past reset day)
      if (data.month !== currentMonth) {
        // New month - reset if we're on or past the reset day
        if (currentDay >= (data.resetDay || 1)) {
          return { month: currentMonth, count: 0, resetDay: data.resetDay || 1 };
        }
      }
      return data;
    }
  } catch {
    // File doesn't exist or is invalid
  }
  
  return { month: currentMonth, count: 0, resetDay: 1 };
}

function incrementFeedbackCount(): FeedbackCount {
  const data = getFeedbackCount();
  data.count++;
  writeFileSync(FEEDBACK_DATA_PATH, JSON.stringify(data, null, 2));
  return data;
}

function getFeedbackStatus(): { remaining: number; warning: boolean; limit: number } {
  const data = getFeedbackCount();
  const remaining = FEEDBACK_MONTHLY_LIMIT - data.count;
  return {
    remaining: Math.max(0, remaining),
    warning: remaining <= FEEDBACK_WARNING_THRESHOLD,
    limit: FEEDBACK_MONTHLY_LIMIT,
  };
}

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Store for SSE connections
const clients = new Map<string, (data: string) => void>();

interface SweepRequestOptions {
  screenshots?: boolean;
  skipCheckout?: boolean;
  platform?: KnownPlatform;
  browserMode?: 'headless' | 'visible';
  persistentProfile?: boolean;
}

function parseLogQuery(url: URL): LogQuery {
  const level = url.searchParams.get('level');
  const limitRaw = url.searchParams.get('limit');
  return {
    merchantUrl: url.searchParams.get('merchantUrl') ?? undefined,
    runId: url.searchParams.get('runId') ?? undefined,
    level: level === 'debug' || level === 'info' || level === 'warn' || level === 'error' ? level : undefined,
    phase: url.searchParams.get('phase') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    limit: limitRaw ? Number(limitRaw) : undefined,
  };
}

function authorizeLogsRequest(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse
): boolean {
  if (isLogsAccessAllowed(req.headers.authorization)) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}

// Broadcast to a specific client
function sendToClient(clientId: string, event: string, data: unknown) {
  const sender = clients.get(clientId);
  if (sender) {
    sender(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// Parse request body
async function parseBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
  });
}

// Main server. The handler is wrapped so an exception in any route produces a
// single 500 response instead of an unhandled rejection that kills the process
// (which puts the hosted container into a crash loop).
const server = createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (error) {
    console.error(`Unhandled error handling ${req.method || 'GET'} ${req.url || '/'}:`, error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    } else {
      res.end();
    }
  }
});

async function handleRequest(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse
): Promise<void> {
  // Only pathname/searchParams are used; a fixed base keeps parsing independent
  // of BASE_URL (which can be a bare path like "/" under some environments).
  const url = new URL(req.url || '/', 'http://localhost');
  
  // CORS headers - check origin against allowed list
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes('*') 
    ? '*' 
    : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // SSE endpoint for real-time updates
  if (url.pathname === '/events') {
    const clientId = url.searchParams.get('clientId') || crypto.randomUUID();
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    clients.set(clientId, (data) => res.write(data));
    
    // Send heartbeat every 15 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      if (clients.has(clientId)) {
        res.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
      }
    }, 15000);
    
    req.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(clientId);
    });

    // Send initial connection confirmation
    sendToClient(clientId, 'connected', { clientId });
    return;
  }

  // API: Start assessment
  if (url.pathname === '/api/sweep' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const { url: targetUrl, clientId, options = {} } = body;

      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'URL is required' }));
        return;
      }

      // Send immediate response
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'started', clientId }));

      // Run the sweep in background
      runSweep(targetUrl, clientId, {
        ...options,
        platform: normalizePlatform(options.platform),
        browserMode: options.browserMode === 'visible' ? 'visible' : 'headless',
        persistentProfile: options.persistentProfile === true,
      });

    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    }
    return;
  }

  // API: Release notes for the "What's new" menu (parsed from CHANGELOG.md)
  if (url.pathname === '/api/release-notes' && req.method === 'GET') {
    // Build the full payload before touching the response: writing headers first
    // and then throwing caused a double-writeHead crash loop in v0.2.2.
    let status = 200;
    let payload: string;
    try {
      payload = JSON.stringify({ releases: loadReleaseNotes() });
    } catch (error) {
      status = 500;
      payload = JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to load release notes.' });
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
    return;
  }

  if (url.pathname === '/api/jira/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getJiraConnectionStatus()));
    return;
  }

  if (url.pathname === '/api/jira/session' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const config = setJiraSession({
        email: body.email,
        apiToken: body.apiToken,
        baseUrl: body.baseUrl,
      });
      await validateJiraConfig(config);
      if (body.remember === true) {
        rememberJiraSession(config);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getJiraConnectionStatus()));
    } catch (error) {
      clearJiraSession();
      const statusCode = getJiraErrorStatus(error);
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to connect Jira.' }));
    }
    return;
  }

  if (url.pathname === '/api/jira/session' && req.method === 'DELETE') {
    clearStoredJiraCredentials();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getJiraConnectionStatus()));
    return;
  }

  // API: Convert JSON to Markdown (no AI needed!)
  if (url.pathname === '/api/json-to-markdown' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const assessment = JSON.parse(body);
      const markdown = formatMarkdown(assessment);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ markdown }));
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Invalid JSON. Make sure you paste the complete assessment JSON.',
        details: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
    return;
  }

  // API: Generate DNA markdown from WA + context
  if (url.pathname === '/api/dna' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const {
        merchantName,
        websiteAssessmentMarkdown,
        websiteAssessmentJson,
        jiraContext,
        confluenceContext,
        additionalNotes,
        apiKey,
      } = body;

      if (!websiteAssessmentMarkdown && !websiteAssessmentJson) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Provide websiteAssessmentMarkdown or websiteAssessmentJson.',
        }));
        return;
      }

      const result = await generateDna({
        merchantName,
        websiteAssessmentMarkdown,
        websiteAssessmentJson,
        jiraContext,
        confluenceContext,
        additionalNotes,
        apiKey,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    }
    return;
  }

  // API: Validate/load a top-level SOPP issue and return detailed BRD subtasks
  if (url.pathname === '/api/brd/validate-parent' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const parentKey = requireSoppKey(body.parentKey);

      const parent = await loadBrdParent(parentKey, getActiveJiraConfig());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ parent }));
    } catch (error) {
      const statusCode = error instanceof Error && error.message.startsWith('Provide a top-level SOPP key') ? 400 : 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (url.pathname === '/api/brd/load' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const parentKey = requireSoppKey(body.parentKey);
      const parent = await loadBrdParent(parentKey, getActiveJiraConfig());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ parent }));
    } catch (error) {
      const statusCode = getBrdErrorStatus(error);
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (url.pathname === '/api/brd/compose' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const parentKey = requireSoppKey(body.parentKey);
      const parent = await loadBrdParent(parentKey, getActiveJiraConfig());
      const result = composeBrdReview({
        merchantName: body.merchantName,
        parent,
        websiteAssessmentMarkdown: body.websiteAssessmentMarkdown,
        websiteAssessmentJson: body.websiteAssessmentJson,
        additionalNotes: body.additionalNotes,
      });
      const auditPath = writeBrdAuditLog(result, 'compose');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...result, auditPath }));
    } catch (error) {
      const statusCode = getBrdErrorStatus(error);
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (url.pathname === '/api/brd/process' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const parentKey = requireSoppKey(body.parentKey);
      const parent = isManualBrdRequest(body)
        ? await loadBrdParentIfAvailable(parentKey)
        : await loadBrdParent(parentKey, getActiveJiraConfig());
      const result = composeBrdReview({
        parent,
        websiteAssessmentMarkdown: body.websiteAssessmentMarkdown,
        websiteAssessmentJson: body.websiteAssessmentJson,
        additionalNotes: body.additionalNotes,
      });
      const auditPath = writeBrdAuditLog(result, 'process');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...result, manualOnly: isManualOnlyParent(parent), auditPath }));
    } catch (error) {
      const statusCode = getBrdErrorStatus(error);
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (url.pathname === '/api/brd/send' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const parentKey = requireSoppKey(body.parentKey);
      const jiraConfig = getActiveJiraConfig();
      const parent = await loadBrdParent(parentKey, jiraConfig);
      const previews = await applyBrdTableUpdates(parent, body.rows || [], jiraConfig);
      const auditPath = writeBrdAuditLog({ parent, previews }, 'send');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ parent, previews, auditPath }));
    } catch (error) {
      const statusCode = getBrdErrorStatus(error);
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (url.pathname === '/api/brd/preview-updates' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const parentKey = requireSoppKey(body.parentKey);
      const parent = await loadBrdParent(parentKey, getActiveJiraConfig());
      const previews = previewSeOutputUpdates(parent, body.rows || []);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ parent, previews }));
    } catch (error) {
      const statusCode = getBrdErrorStatus(error);
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (url.pathname === '/api/brd/apply-updates' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const parentKey = requireSoppKey(body.parentKey);
      const jiraConfig = getActiveJiraConfig();
      const parent = await loadBrdParent(parentKey, jiraConfig);
      const previews = await applySeOutputUpdates(parent, body.rows || [], jiraConfig);
      const auditPath = writeBrdAuditLog({ parent, previews }, 'apply');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ parent, previews, auditPath }));
    } catch (error) {
      const statusCode = getBrdErrorStatus(error);
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  // API: Generate reviewable BRD outputs from WA evidence and a server-validated SOPP parent
  if (url.pathname === '/api/brd/draft' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const parentKey = requireSoppKey(body.parentKey);
      const parent = await loadBrdParent(parentKey, getActiveJiraConfig());
      const result = generateBrdDraft({
        merchantName: body.merchantName,
        parent,
        websiteAssessmentMarkdown: body.websiteAssessmentMarkdown,
        websiteAssessmentJson: body.websiteAssessmentJson,
        dealLink: body.dealLink,
        additionalNotes: body.additionalNotes,
      });

      const auditPath = writeBrdAuditLog(result, 'draft');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...result, auditPath }));
    } catch (error) {
      const statusCode = getBrdErrorStatus(error);
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  // Health check endpoint (for container orchestration)
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }

  if (url.pathname === '/api/logs/runs' && req.method === 'GET') {
    if (!authorizeLogsRequest(req, res)) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ runs: listRuns() }));
    return;
  }

  if (url.pathname === '/api/logs/export' && req.method === 'GET') {
    if (!authorizeLogsRequest(req, res)) return;
    const query = parseLogQuery(url);
    const format = url.searchParams.get('format') ?? 'text';
    if (format === 'ndjson') {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8' });
      res.end(exportNdjson(query));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(exportDebugBundle(query));
    return;
  }

  if (url.pathname === '/api/logs' && req.method === 'GET') {
    if (!authorizeLogsRequest(req, res)) return;
    const query = parseLogQuery(url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ logs: queryLogs(query) }));
    return;
  }

  if (url.pathname === '/api/logs' && req.method === 'DELETE') {
    if (!authorizeLogsRequest(req, res)) return;
    clearLogs();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // API: Get feedback status (remaining credits)
  if (url.pathname === '/api/feedback/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getFeedbackStatus()));
    return;
  }

  // API: Increment feedback count (called after successful submission)
  if (url.pathname === '/api/feedback/increment' && req.method === 'POST') {
    incrementFeedbackCount();
    const status = getFeedbackStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, ...status }));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `API route not found: ${req.method || 'GET'} ${url.pathname}` }));
    return;
  }

  // Serve static files
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  const fullPath = join(__dirname, 'public', filePath);

  if (existsSync(fullPath)) {
    const ext = extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = readFileSync(fullPath);
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

function getBrdErrorStatus(error: unknown): number {
  if (!(error instanceof Error)) return 500;
  if (error.message.startsWith('Provide a top-level SOPP key')) return 400;
  if (error.message.startsWith('Rejected Jira keys outside')) return 400;
  if (error.message.startsWith('Missing Jira credentials')) return 401;
  if (error.message.startsWith('Jira credential validation failed')) return 401;
  if (error.message.startsWith('Jira SE output field was not found')) return 400;
  return 500;
}

function getJiraErrorStatus(error: unknown): number {
  if (!(error instanceof Error)) return 500;
  if (error.message.endsWith('is required.')) return 400;
  if (error.message.startsWith('Jira credential validation failed')) return 401;
  if (error.message.startsWith('Jira SE output field was not found')) return 400;
  return 500;
}

async function loadBrdParentIfAvailable(parentKey: string): Promise<BrdParentContext> {
  try {
    return await loadBrdParent(parentKey, getActiveJiraConfig());
  } catch (error) {
    if (getBrdErrorStatus(error) !== 401) throw error;
    return createManualBrdParent(parentKey);
  }
}

function createManualBrdParent(parentKey: string): BrdParentContext {
  return {
    key: parentKey,
    summary: `${parentKey} manual BRD workspace`,
    status: 'Manual',
    subtasks: BRD_REQUIREMENTS.map((requirement) => ({
      key: `MANUAL-${requirement.id}`,
      summary: `${requirement.id}: ${requirement.requirement}`,
      status: 'Manual',
      descriptionText: '',
      seOutputText: '',
    })),
  };
}

function isManualOnlyParent(parent: BrdParentContext): boolean {
  return parent.subtasks.every((subtask) => subtask.key.startsWith('MANUAL-'));
}

function isManualBrdRequest(body: { websiteAssessmentMarkdown?: unknown; additionalNotes?: unknown; websiteAssessmentJson?: unknown }): boolean {
  return !hasBodyText(body.websiteAssessmentMarkdown)
    && !hasBodyText(body.additionalNotes)
    && !body.websiteAssessmentJson;
}

function hasBodyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function writeBrdAuditLog(result: ReturnType<typeof generateBrdDraft> | BrdReviewResult | unknown, action: string): string {
  const logsDir = join(dirname(__dirname), '..', 'logs', 'brd');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const maybeResult = result as { merchantName?: unknown; parent?: { key?: unknown } };
  const label = typeof maybeResult.merchantName === 'string'
    ? maybeResult.merchantName
    : typeof maybeResult.parent?.key === 'string'
      ? maybeResult.parent.key
      : 'merchant';
  const merchant = label.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 60) || 'merchant';
  const filePath = join(logsDir, `${timestamp}_${merchant}_brd_${action}.json`);
  writeFileSync(filePath, JSON.stringify(result, null, 2));
  return filePath;
}

async function runSweep(targetUrl: string, clientId: string, options: SweepRequestOptions) {
  const runId = crypto.randomUUID();
  startRun(runId, clientId, targetUrl);
  const log = createLogSink({ runId, clientId, merchantUrl: targetUrl });

  let slot: Awaited<ReturnType<typeof acquireSweepRunSlot>> | undefined;

  try {
    sendToClient(clientId, 'status', {
      step: 'starting',
      message: 'Waiting for an available assessment slot...',
      progress: 3,
      runId,
    });

    slot = await acquireSweepRunSlot();

    if (slot.waitedMs > 0) {
      log({
        level: 'info',
        scope: 'server',
        event: 'sweep.queued',
        message: `Assessment started after waiting ${Math.round(slot.waitedMs / 1000)}s in queue`,
        details: { waitedMs: slot.waitedMs, activeRuns: slot.activeAfterAcquire },
      });
    }

    sendToClient(clientId, 'status', { 
      step: 'starting', 
      message: 'Initializing browser...',
      progress: 5,
      runId,
    });

    log({
      level: 'info',
      scope: 'server',
      event: 'sweep.requested',
      message: `Sweep requested for ${targetUrl}`,
      details: { skipCheckout: options.skipCheckout === true, activeRuns: slot.activeAfterAcquire },
    });

    const scrapeResult = await scrapeWithProgress(targetUrl, clientId, options, runId, log);

    const { system, user } = buildPrompt(scrapeResult, {
      selectedPlatform: options.platform,
    });
    const partialNote = scrapeResult.summary.scrapingCompletionWarning;
    const status = partialNote ? 'partial' : 'completed';

    endRun(runId, status, {
      pagesScraped: scrapeResult.pages.length,
      errorCount: scrapeResult.summary.errors?.length ?? 0,
    });

    sendToClient(clientId, 'scraped', { 
      scrapeResult,
      runId,
      prompt: { system, user },
      message: partialNote
        ? `Partial result — ${partialNote}`
        : 'Scraping complete! Ready for extraction.',
      progress: 100,
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log({
      level: 'error',
      scope: 'server',
      event: 'sweep.failed',
      message,
    });
    endRun(runId, 'failed', { pagesScraped: 0, errorCount: 1 });
    sendToClient(clientId, 'sweepError', { 
      message,
      runId,
    });
  } finally {
    slot?.release();
  }
}

async function scrapeWithProgress(
  targetUrl: string,
  clientId: string,
  options: SweepRequestOptions,
  runId: string,
  log: ReturnType<typeof createLogSink>
): Promise<ScrapeResult> {
  sendToClient(clientId, 'status', { 
    step: 'scraping', 
    message: 'Launching browser...',
    progress: 5,
  });

  const result = await scrape(targetUrl, {
    takeScreenshots: options.screenshots !== false,
    verbose: true,
    maxPages: hostedMaxPages(),
    scrapeTimeout: options.skipCheckout === true ? 300000 : 420000,
    skipCheckout: options.skipCheckout === true,
    platform: options.platform,
    browserMode: options.browserMode,
    persistentProfile: options.persistentProfile,
    onLog: (entry) => log(entry),
    onProgress: (progress) => {
      // Map scraper phases to UI progress
      let progressPercent = 10;
      let message = progress.message;
      
      if (progress.phase === 'init') {
        progressPercent = 10;
      } else if (progress.phase === 'scraping') {
        if (progress.current && progress.total) {
          progressPercent = 15 + Math.round((progress.current / progress.total) * 60);
          message = `[${progress.current}/${progress.total}] ${progress.message}`;
          if (progress.url) {
            message += ` (${progress.url})`;
          }
        } else {
          progressPercent = 50;
        }
      } else if (progress.phase === 'checkout') {
        progressPercent = 80;
      } else if (progress.phase === 'analyzing') {
        progressPercent = 90;
      }
      
      sendToClient(clientId, 'status', { 
        step: progress.phase, 
        message,
        progress: progressPercent,
        remainingSeconds: progress.secondsRemaining,
        elapsedSeconds: progress.elapsedSeconds,
        runId,
      });
    },
  });

  // Send page results summary
  const totalPages = result.pages.length;
  for (let i = 0; i < totalPages; i++) {
    const page = result.pages[i];
    sendToClient(clientId, 'page', {
      url: page.url,
      title: page.title,
      categories: page.matchedCategories,
      current: i + 1,
      total: totalPages,
      progress: 90 + Math.round((i / totalPages) * 10),
    });
  }
  
  // Send error events for failed pages
  const errors = result.summary.errors || [];
  if (errors.length > 0) {
    sendToClient(clientId, 'scrapeErrors', {
      errors: errors.map(e => ({
        url: e.url,
        error: e.error,
        type: e.type,
      })),
      totalErrors: errors.length,
      totalPages: totalPages + errors.length,
    });
  }

  sendToClient(clientId, 'status', {
    step: 'analyzing',
    message: 'Analyzing collected data...',
    progress: 98,
  });

  return result;
}

// Listen only when launched directly (npm start / npm run web), so tests can
// import the server and bind it to an ephemeral port instead.
const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  server.listen(PORT, () => {
    appendLog({
      level: 'info',
      scope: 'server',
      event: 'server.started',
      message: `Sweep server listening on port ${PORT}`,
      details: { baseUrl: BASE_URL },
    });
    const displayUrl = BASE_URL.includes('localhost') ? `http://localhost:${PORT}` : BASE_URL;
    console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   🧹 Global-swEep is running!                            ║
  ║                                                          ║
  ║   Open: ${displayUrl.padEnd(45)}║
  ║                                                          ║
  ║   Press Ctrl+C to stop                                   ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
  `);
  });
}

export { server };

