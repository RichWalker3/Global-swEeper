/**
 * Local web server for Global-swEep UI
 * Provides real-time progress updates via Server-Sent Events
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { scrape } from '../scraper/scraper.js';
import { buildPrompt } from '../extractor/prompt.js';
import { extract } from '../extractor/extractor.js';
import { generateDna } from '../dna/generator.js';
import { formatMarkdown } from '../formatter/markdown.js';
import type { ScrapeResult } from '../scraper/types.js';

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

// Main server
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', BASE_URL);
  
  // CORS headers - check origin against allowed list
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes('*') 
    ? '*' 
    : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
      runSweep(targetUrl, clientId, options);

    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    }
    return;
  }

  // API: Extract with API key (from request or env)
  if (url.pathname === '/api/extract' && req.method === 'POST') {
    try {
      const body = JSON.parse(await parseBody(req));
      const { scrapeResult, clientId, apiKey } = body;

      // Use API key from request, fall back to env var
      const effectiveApiKey = apiKey || process.env.ANTHROPIC_API_KEY;

      if (!effectiveApiKey) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No API key provided. Enter your Anthropic API key in the header.' }));
        return;
      }

      if (!effectiveApiKey.startsWith('sk-ant-')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid API key format. Anthropic keys start with sk-ant-' }));
        return;
      }

      sendToClient(clientId, 'status', { step: 'extracting', message: 'Sending to Claude...' });

      const result = await extract(scrapeResult, { verbose: true, apiKey: effectiveApiKey });
      const markdown = formatMarkdown(result.assessment);

      sendToClient(clientId, 'complete', { 
        assessment: result.assessment,
        markdown,
        usage: result.usage,
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));

    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    }
    return;
  }

  // API: Check if API key is configured
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
      version: '0.1.0',
    }));
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

  // Health check endpoint (for container orchestration)
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
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
});

async function runSweep(targetUrl: string, clientId: string, options: SweepRequestOptions) {
  try {
    sendToClient(clientId, 'status', { 
      step: 'starting', 
      message: 'Initializing browser...',
      progress: 5,
    });

    // Create a custom scrape with progress updates
    const scrapeResult = await scrapeWithProgress(targetUrl, clientId, options);

    // Build prompt for Claude (or for manual copy)
    const { system, user } = buildPrompt(scrapeResult);

    const partialNote = scrapeResult.summary.scrapingCompletionWarning;
    sendToClient(clientId, 'scraped', { 
      scrapeResult,
      prompt: { system, user },
      message: partialNote
        ? `Partial result — ${partialNote}`
        : 'Scraping complete! Ready for extraction.',
      progress: 100,
    });

  } catch (error) {
    sendToClient(clientId, 'sweepError', { 
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function scrapeWithProgress(targetUrl: string, clientId: string, options: SweepRequestOptions): Promise<ScrapeResult> {
  sendToClient(clientId, 'status', { 
    step: 'scraping', 
    message: 'Launching browser...',
    progress: 5,
  });

  const result = await scrape(targetUrl, {
    takeScreenshots: options.screenshots !== false,
    verbose: true,
    maxPages: 25,
    // Full WA runs need more time for add-to-cart and checkout; quick scans keep the shorter budget.
    scrapeTimeout: options.skipCheckout === true ? 300000 : 420000,
    // Full WA runs include checkout unless the user explicitly chooses a faster quick scan.
    skipCheckout: options.skipCheckout === true,
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

server.listen(PORT, () => {
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

export { server };

