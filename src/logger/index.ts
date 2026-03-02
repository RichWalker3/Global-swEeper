/**
 * Assessment logging module
 * Stores crawl data for the last N assessments for debugging and audit purposes
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ScrapeResult, PageData } from '../scraper/types.js';

export interface AssessmentLog {
  id: string;
  timestamp: string;
  seedUrl: string;
  domain: string;
  summary: ScrapeResult['summary'];
  pages: PageLogEntry[];
  errors: string[];
  debugInfo: DebugInfo;
}

export interface PageLogEntry {
  url: string;
  finalUrl: string; // URL after any redirects
  title: string;
  statusCode?: number;
  categories: string[];
  contentLength: number;
  contentPreview: string; // First 500 chars
  thirdPartiesDetected: string[];
  timestamp: string;
}

export interface DebugInfo {
  browserVersion?: string;
  userAgent: string;
  viewportSize: { width: number; height: number };
  totalRequestsIntercepted: number;
  redirectsDetected: string[];
  blockedRequests: string[];
  consoleErrors: string[];
}

const DEFAULT_LOG_DIR = path.join(process.cwd(), 'logs', 'assessments');
const MAX_ASSESSMENTS = 5;

export class AssessmentLogger {
  private logDir: string;
  private maxAssessments: number;

  constructor(logDir?: string, maxAssessments: number = MAX_ASSESSMENTS) {
    this.logDir = logDir || DEFAULT_LOG_DIR;
    this.maxAssessments = maxAssessments;
    this.ensureLogDir();
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Generate a unique ID for an assessment log
   */
  private generateId(domain: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedDomain = domain.replace(/[^a-zA-Z0-9-]/g, '_');
    return `${timestamp}_${sanitizedDomain}`;
  }

  /**
   * Convert ScrapeResult pages to log entries
   */
  private pagesToLogEntries(pages: PageData[]): PageLogEntry[] {
    return pages.map(page => ({
      url: page.url,
      finalUrl: page.url, // Will be updated if redirect detected
      title: page.title,
      statusCode: page.statusCode,
      categories: page.matchedCategories,
      contentLength: page.cleanedText?.length || 0,
      contentPreview: (page.cleanedText || '').slice(0, 500),
      thirdPartiesDetected: page.networkRequests
        .filter(r => r.thirdParty)
        .map(r => r.thirdParty!)
        .filter((v, i, a) => a.indexOf(v) === i), // unique
      timestamp: page.timestamp,
    }));
  }

  /**
   * Log an assessment result
   */
  async logAssessment(
    result: ScrapeResult,
    debugInfo: Partial<DebugInfo> = {}
  ): Promise<string> {
    const id = this.generateId(result.summary.domain);
    
    const log: AssessmentLog = {
      id,
      timestamp: new Date().toISOString(),
      seedUrl: result.summary.seedUrl,
      domain: result.summary.domain,
      summary: result.summary,
      pages: this.pagesToLogEntries(result.pages),
      errors: result.summary.errors.map(e => `${e.url}: ${e.error}`),
      debugInfo: {
        userAgent: debugInfo.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        viewportSize: debugInfo.viewportSize || { width: 1440, height: 900 },
        totalRequestsIntercepted: debugInfo.totalRequestsIntercepted || 0,
        redirectsDetected: debugInfo.redirectsDetected || [],
        blockedRequests: debugInfo.blockedRequests || [],
        consoleErrors: debugInfo.consoleErrors || [],
        ...debugInfo,
      },
    };

    // Write the log file
    const logPath = path.join(this.logDir, `${id}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));

    // Also write a summary file for quick lookup
    const summaryPath = path.join(this.logDir, `${id}_summary.txt`);
    const summaryContent = this.generateSummaryText(log);
    fs.writeFileSync(summaryPath, summaryContent);

    // Clean up old logs
    await this.cleanupOldLogs();

    console.log(`📝 Assessment logged: ${logPath}`);
    return id;
  }

  /**
   * Generate a human-readable summary
   */
  private generateSummaryText(log: AssessmentLog): string {
    const lines = [
      `Assessment Log: ${log.id}`,
      `=====================================`,
      ``,
      `Seed URL: ${log.seedUrl}`,
      `Domain: ${log.domain}`,
      `Timestamp: ${log.timestamp}`,
      ``,
      `--- Summary ---`,
      `Pages Visited: ${log.summary.pagesVisited}`,
      `Pages Blocked: ${log.summary.pagesBlocked}`,
      `Platform Detected: ${log.summary.platformDetected || 'Unknown'}`,
      `Checkout Reached: ${log.summary.checkoutReached}`,
      `Global-e Detected: ${log.summary.globalEDetected}`,
      ``,
      `--- Third Parties ---`,
      ...log.summary.thirdPartiesDetected.map(tp => `  - ${tp}`),
      ``,
      `--- Red Flags ---`,
      ...(log.summary.redFlags.length > 0 
        ? log.summary.redFlags.map(rf => `  🚩 ${rf}`)
        : ['  None']),
      ``,
      `--- Pages Crawled ---`,
    ];

    for (const page of log.pages) {
      lines.push(`  ${page.url}`);
      lines.push(`    Title: ${page.title}`);
      lines.push(`    Status: ${page.statusCode || 'N/A'}`);
      lines.push(`    Categories: ${page.categories.join(', ') || 'none'}`);
      lines.push(`    Content Length: ${page.contentLength} chars`);
      lines.push(`    Preview: ${page.contentPreview.slice(0, 100)}...`);
      lines.push(``);
    }

    if (log.errors.length > 0) {
      lines.push(`--- Errors ---`);
      for (const error of log.errors) {
        lines.push(`  ❌ ${error}`);
      }
    }

    if (log.debugInfo.redirectsDetected.length > 0) {
      lines.push(``, `--- Redirects Detected ---`);
      for (const redirect of log.debugInfo.redirectsDetected) {
        lines.push(`  → ${redirect}`);
      }
    }

    if (log.debugInfo.consoleErrors.length > 0) {
      lines.push(``, `--- Console Errors ---`);
      for (const error of log.debugInfo.consoleErrors) {
        lines.push(`  ⚠ ${error}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Remove old logs beyond the max limit
   */
  private async cleanupOldLogs(): Promise<void> {
    const files = fs.readdirSync(this.logDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(this.logDir, f),
        time: fs.statSync(path.join(this.logDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time); // Newest first

    // Remove files beyond the limit
    const toRemove = files.slice(this.maxAssessments);
    for (const file of toRemove) {
      fs.unlinkSync(file.path);
      // Also remove the summary file if it exists
      const summaryPath = file.path.replace('.json', '_summary.txt');
      if (fs.existsSync(summaryPath)) {
        fs.unlinkSync(summaryPath);
      }
    }

    if (toRemove.length > 0) {
      console.log(`🧹 Cleaned up ${toRemove.length} old assessment log(s)`);
    }
  }

  /**
   * Get all recent assessment logs
   */
  listLogs(): { id: string; domain: string; timestamp: string; path: string }[] {
    if (!fs.existsSync(this.logDir)) {
      return [];
    }

    return fs.readdirSync(this.logDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const logPath = path.join(this.logDir, f);
        try {
          const content = JSON.parse(fs.readFileSync(logPath, 'utf-8')) as AssessmentLog;
          return {
            id: content.id,
            domain: content.domain,
            timestamp: content.timestamp,
            path: logPath,
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Get a specific assessment log
   */
  getLog(id: string): AssessmentLog | null {
    const logPath = path.join(this.logDir, `${id}.json`);
    if (!fs.existsSync(logPath)) {
      // Try to find by partial match
      const files = fs.readdirSync(this.logDir).filter(f => f.includes(id) && f.endsWith('.json'));
      if (files.length === 0) return null;
      const fullPath = path.join(this.logDir, files[0]);
      return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
    }
    return JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  }

  /**
   * Get the log directory path
   */
  getLogDir(): string {
    return this.logDir;
  }
}

// Default singleton instance
export const logger = new AssessmentLogger();

/**
 * Quick helper to log an assessment
 */
export async function logAssessment(
  result: ScrapeResult,
  debugInfo?: Partial<DebugInfo>
): Promise<string> {
  return logger.logAssessment(result, debugInfo);
}

/**
 * List recent assessment logs
 */
export function listAssessmentLogs() {
  return logger.listLogs();
}

/**
 * Get a specific log by ID
 */
export function getAssessmentLog(id: string) {
  return logger.getLog(id);
}


