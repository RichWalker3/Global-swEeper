/**
 * Local web server for Global-swEep UI
 * Provides real-time progress updates via Server-Sent Events
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { scrape } from '../scraper/scraper.js';
import { buildPrompt } from '../extractor/prompt.js';
import { extract } from '../extractor/extractor.js';
import { formatMarkdown } from '../formatter/markdown.js';
import type { ScrapeResult } from '../scraper/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3847;

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
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    
    req.on('close', () => {
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

  // Health check endpoint (for container orchestration)
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
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

async function runSweep(targetUrl: string, clientId: string, options: Record<string, boolean>) {
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

    sendToClient(clientId, 'scraped', { 
      scrapeResult,
      prompt: { system, user },
      message: 'Scraping complete! Ready for extraction.',
      progress: 100,
    });

  } catch (error) {
    sendToClient(clientId, 'error', { 
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function scrapeWithProgress(targetUrl: string, clientId: string, options: Record<string, boolean>): Promise<ScrapeResult> {
  sendToClient(clientId, 'status', { 
    step: 'scraping', 
    message: 'Launching browser...',
    progress: 5,
  });

  const result = await scrape(targetUrl, {
    takeScreenshots: options.screenshots !== false,
    verbose: true,
    maxPages: 25,
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
  console.log(`
  ╔══════════════════════════════════════════════════════════╗
  ║                                                          ║
  ║   🧹 Global-swEep is running!                            ║
  ║                                                          ║
  ║   Open: http://localhost:${PORT}                           ║
  ║                                                          ║
  ║   Press Ctrl+C to stop                                   ║
  ║                                                          ║
  ╚══════════════════════════════════════════════════════════╝
  `);
});

export { server };

