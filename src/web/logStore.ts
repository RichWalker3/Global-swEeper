/**
 * Bounded in-memory structured log store for Sweep.
 * Redacts secrets before storage and exposes query/export helpers for the Logs API.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogScope = 'server' | 'scraper' | 'browser' | 'checkout';

export interface StructuredLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  scope: LogScope;
  event: string;
  runId?: string;
  clientId?: string;
  merchantUrl?: string;
  phase?: string;
  message: string;
  details?: Record<string, unknown>;
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'partial';

export interface RunSummary {
  runId: string;
  clientId?: string;
  merchantUrl: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  pagesScraped?: number;
  errorCount?: number;
  countsByLevel: Record<LogLevel, number>;
}

export interface LogQuery {
  merchantUrl?: string;
  runId?: string;
  level?: LogLevel;
  phase?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface AppendLogInput {
  level: LogLevel;
  scope: LogScope;
  event: string;
  runId?: string;
  clientId?: string;
  merchantUrl?: string;
  phase?: string;
  message: string;
  details?: Record<string, unknown>;
}

const MAX_ENTRIES = 2000;
const MAX_BYTES = 5 * 1024 * 1024;

const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /:\/\/[^:@\s]+:[^@\s]+@/gi, replacement: '://[REDACTED]:[REDACTED]@' },
  { pattern: /Bearer\s+[A-Za-z0-9._\-+/=]+/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /Basic\s+[A-Za-z0-9+/=]+/gi, replacement: 'Basic [REDACTED]' },
  {
    pattern: /(api[_-]?token|authorization|password|secret|proxy_url|jira_api_token|anthropic_api_key)\s*[:=]\s*\S+/gi,
    replacement: '$1=[REDACTED]',
  },
  { pattern: /\/checkouts\/cn\/[^/\s?]+/gi, replacement: '/checkouts/cn/[REDACTED]' },
  {
    pattern: /([?&](?:token|key|session|code|state|nonce|_r)=)[^&\s]+/gi,
    replacement: '$1[REDACTED]',
  },
];

const entries: StructuredLogEntry[] = [];
const runs = new Map<string, RunSummary>();
let approximateBytes = 0;

function createId(): string {
  return crypto.randomUUID();
}

export function redactString(input: string): string {
  let out = input;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('password') ||
        lower.includes('authorization') ||
        lower === 'proxyurl' ||
        lower === 'proxy_url'
      ) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactValue(val);
      }
    }
    return out;
  }
  return value;
}

function normalizeMerchantUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function merchantMatches(entryUrl: string | undefined, filterUrl: string): boolean {
  if (!entryUrl) return false;
  const a = normalizeMerchantUrl(entryUrl).toLowerCase();
  const b = normalizeMerchantUrl(filterUrl).toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

function estimateEntryBytes(entry: StructuredLogEntry): number {
  return JSON.stringify(entry).length;
}

function trimStore(): void {
  while (entries.length > MAX_ENTRIES || approximateBytes > MAX_BYTES) {
    const removed = entries.shift();
    if (!removed) break;
    approximateBytes -= estimateEntryBytes(removed);
  }
}

function bumpRunLevel(runId: string | undefined, level: LogLevel): void {
  if (!runId) return;
  const run = runs.get(runId);
  if (!run) return;
  run.countsByLevel[level] += 1;
}

export function startRun(runId: string, clientId: string | undefined, merchantUrl: string): void {
  runs.set(runId, {
    runId,
    clientId,
    merchantUrl,
    status: 'running',
    startedAt: new Date().toISOString(),
    countsByLevel: { debug: 0, info: 0, warn: 0, error: 0 },
  });
  appendLog({
    level: 'info',
    scope: 'server',
    event: 'run.started',
    runId,
    clientId,
    merchantUrl,
    message: `Assessment started for ${merchantUrl}`,
  });
}

export function endRun(
  runId: string,
  status: Exclude<RunStatus, 'running'>,
  meta?: { pagesScraped?: number; errorCount?: number }
): void {
  const run = runs.get(runId);
  if (!run) return;
  run.status = status;
  run.completedAt = new Date().toISOString();
  if (meta?.pagesScraped !== undefined) run.pagesScraped = meta.pagesScraped;
  if (meta?.errorCount !== undefined) run.errorCount = meta.errorCount;
  appendLog({
    level: status === 'failed' ? 'error' : status === 'partial' ? 'warn' : 'info',
    scope: 'server',
    event: 'run.completed',
    runId,
    clientId: run.clientId,
    merchantUrl: run.merchantUrl,
    message: `Assessment ${status}`,
    details: {
      pagesScraped: meta?.pagesScraped,
      errorCount: meta?.errorCount,
    },
  });
}

export function appendLog(input: AppendLogInput): StructuredLogEntry {
  const entry: StructuredLogEntry = {
    id: createId(),
    timestamp: new Date().toISOString(),
    level: input.level,
    scope: input.scope,
    event: input.event,
    runId: input.runId,
    clientId: input.clientId,
    merchantUrl: input.merchantUrl,
    phase: input.phase,
    message: redactString(input.message),
    details: input.details ? (redactValue(input.details) as Record<string, unknown>) : undefined,
  };

  entries.push(entry);
  approximateBytes += estimateEntryBytes(entry);
  bumpRunLevel(input.runId, input.level);
  trimStore();
  return entry;
}

export function queryLogs(query: LogQuery = {}): StructuredLogEntry[] {
  const limit = Math.min(Math.max(query.limit ?? 500, 1), MAX_ENTRIES);
  let results = [...entries];

  if (query.merchantUrl) {
    results = results.filter((e) => merchantMatches(e.merchantUrl, query.merchantUrl!));
  }
  if (query.runId) {
    results = results.filter((e) => e.runId === query.runId);
  }
  if (query.level) {
    results = results.filter((e) => e.level === query.level);
  }
  if (query.phase) {
    results = results.filter((e) => e.phase === query.phase);
  }
  if (query.from) {
    const fromTs = Date.parse(query.from);
    if (!Number.isNaN(fromTs)) {
      results = results.filter((e) => Date.parse(e.timestamp) >= fromTs);
    }
  }
  if (query.to) {
    const toTs = Date.parse(query.to);
    if (!Number.isNaN(toTs)) {
      results = results.filter((e) => Date.parse(e.timestamp) <= toTs);
    }
  }
  if (query.q) {
    const needle = query.q.toLowerCase();
    results = results.filter((e) => {
      const haystack = [
        e.message,
        e.event,
        e.phase ?? '',
        e.merchantUrl ?? '',
        JSON.stringify(e.details ?? {}),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }

  return results.slice(-limit);
}

export function listRuns(limit = 50): RunSummary[] {
  return [...runs.values()]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
}

export function clearLogs(): void {
  entries.length = 0;
  runs.clear();
  approximateBytes = 0;
}

export function getLogsToken(): string | undefined {
  const token = process.env.SWEEP_LOGS_TOKEN?.trim();
  return token || undefined;
}

export function isLogsAccessAllowed(authHeader: string | undefined): boolean {
  const required = getLogsToken();
  if (!required) return true;
  if (!authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] === required;
}

export function exportNdjson(query: LogQuery = {}): string {
  return queryLogs(query)
    .map((entry) => JSON.stringify(entry))
    .join('\n');
}

export function exportDebugBundle(query: LogQuery = {}): string {
  const logs = queryLogs(query);
  const runIds = [...new Set(logs.map((e) => e.runId).filter(Boolean))] as string[];
  const runSummaries = runIds
    .map((id) => runs.get(id))
    .filter((r): r is RunSummary => Boolean(r));

  const lines: string[] = [
    'Sweep Debug Bundle',
    '==================',
    `Generated: ${new Date().toISOString()}`,
    `Entries: ${logs.length}`,
    '',
    'Run Summary',
    '-----------',
  ];

  if (runSummaries.length === 0) {
    lines.push('(no run metadata)');
  } else {
    for (const run of runSummaries) {
      lines.push(
        `- runId=${run.runId} merchant=${run.merchantUrl} status=${run.status} started=${run.startedAt} completed=${run.completedAt ?? 'n/a'} pages=${run.pagesScraped ?? 0} errors=${run.errorCount ?? 0}`
      );
    }
  }

  lines.push('', 'Structured Events', '-----------------');
  for (const entry of logs) {
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : '';
    lines.push(
      `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.scope}/${entry.event}${entry.phase ? ` (${entry.phase})` : ''}: ${entry.message}${details}`
    );
  }

  return lines.join('\n');
}

export function createLogSink(context: {
  runId?: string;
  clientId?: string;
  merchantUrl?: string;
}) {
  return (input: Omit<AppendLogInput, 'runId' | 'clientId' | 'merchantUrl'> & {
    runId?: string;
    clientId?: string;
    merchantUrl?: string;
  }) => {
    appendLog({
      ...input,
      runId: input.runId ?? context.runId,
      clientId: input.clientId ?? context.clientId,
      merchantUrl: input.merchantUrl ?? context.merchantUrl,
    });
  };
}

export function getStoreStats(): { entryCount: number; runCount: number; approximateBytes: number } {
  return {
    entryCount: entries.length,
    runCount: runs.size,
    approximateBytes,
  };
}
