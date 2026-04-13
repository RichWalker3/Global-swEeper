import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AssessmentLogger } from './index.js';

function makeResult(domain: string) {
  return {
    summary: {
      seedUrl: `https://${domain}`,
      domain,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      pagesVisited: 1,
      pagesBlocked: 0,
      checkoutReached: false,
      errors: [],
      thirdPartiesDetected: [],
      technologies: [],
      redFlags: [],
      dangerousGoods: [],
      b2bIndicators: [],
      dropshipIndicators: [],
      productPagesScraped: 0,
    },
    pages: [
      {
        url: `https://${domain}`,
        title: domain,
        cleanedText: 'Example content',
        excerpt: 'Example content',
        evidenceText: 'Example content',
        matchedCategories: ['home'],
        keyPhrases: [],
        networkRequests: [],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('AssessmentLogger', () => {
  it('tolerates files disappearing during cleanup', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assessment-logger-'));
    tempDirs.push(tempDir);

    const logger = new AssessmentLogger(tempDir, 2);
    await logger.logAssessment(makeResult('first.example.com'));
    await logger.logAssessment(makeResult('second.example.com'));

    const jsonFiles = fs.readdirSync(tempDir).filter(file => file.endsWith('.json')).sort();
    expect(jsonFiles.length).toBeGreaterThan(1);

    const firstJsonPath = path.join(tempDir, jsonFiles[0]);
    const firstSummaryPath = firstJsonPath.replace('.json', '_summary.txt');
    fs.rmSync(firstJsonPath, { force: true });
    fs.rmSync(firstSummaryPath, { force: true });

    await expect(logger.logAssessment(makeResult('third.example.com'))).resolves.toBeTypeOf('string');
  });
});
