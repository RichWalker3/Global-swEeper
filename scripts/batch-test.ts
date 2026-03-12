#!/usr/bin/env node
/**
 * Batch test runner for Website Assessments
 * Scrapes multiple sites and saves results for comparison
 */

import { scrape } from '../src/scraper/index.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const MERCHANTS: Record<string, { name: string; url: string }> = {
  'SOPP-5074': { name: 'Menē', url: 'https://mene.com' },
  'SOPP-6520': { name: 'Modern Gents Trading', url: 'https://moderngentstrading.com' },
  'SOPP-6484': { name: 'TNT', url: 'https://tntfireworks.com' },
  'SOPP-6462': { name: 'Gen-8', url: 'https://gen8golf.com' },
  'SOPP-6448': { name: 'Bellezza Group', url: 'https://bellezzagroup.com' },
  'SOPP-6425': { name: 'The Pause Life', url: 'https://thepauselife.com' },
  'SOPP-5302': { name: 'Gizmatic', url: 'https://gizmatic.com' },
  'SOPP-4985': { name: 'DAVIDsTEA', url: 'https://davidstea.com' },
  'SOPP-4949': { name: 'Alp N Rock', url: 'https://alpnrock.com' },
  'SOPP-4929': { name: 'Ardene', url: 'https://ardene.com' },
  'SOPP-4888': { name: 'Tibi', url: 'https://tibi.com' },
  'SOPP-4981': { name: 'Tim Hortons', url: 'https://timhortons.com' },
  'SOPP-6963': { name: 'Ivy City', url: 'https://ivycityco.com' },
  'SOPP-6926': { name: 'Elie Tahari', url: 'https://elietahari.com' },
  'SOPP-6888': { name: 'La Canadienne', url: 'https://lacanadienneshoes.com' },
  'SOPP-6860': { name: 'HATCH Collection', url: 'https://hatchcollection.com' },
  'SOPP-6736': { name: 'Rudis', url: 'https://rudis.com' },
  'SOPP-6723': { name: 'Durston Gear', url: 'https://durstongear.com' },
  'SOPP-5703': { name: 'Londontown', url: 'https://londontownusa.com' },
  'SOPP-6530': { name: 'Insomnia Visuals', url: 'https://insomniavisuals.com' },
  'SOPP-5608': { name: 'GradedGuard', url: 'https://gradedguard.com' },
  'SOPP-5098': { name: 'Nest Designs', url: 'https://nestdesigns.com' },
  'SOPP-5042': { name: 'Sivana', url: 'https://sivanaspirit.com' },
  'SOPP-5046': { name: 'Cabi', url: 'https://cabionline.com' },
};

const RESULTS_DIR = join(process.cwd(), 'test-results', 'batch-test');

async function runBatchTest() {
  console.log('\n🧹 Global-swEep Batch Test\n');
  console.log(`Testing ${Object.keys(MERCHANTS).length} merchants...\n`);

  // Ensure results directory exists
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const results: { ticket: string; name: string; success: boolean; pages?: number; error?: string; time?: number }[] = [];

  for (const [ticket, { name, url }] of Object.entries(MERCHANTS)) {
    console.log(`[${ticket}] ${name} - ${url}`);
    const startTime = Date.now();

    try {
      const scrapeResult = await scrape(url, { verbose: true, timeout: 90000 });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      // Save scrape result
      const filename = `${ticket}_scrape.json`;
      writeFileSync(join(RESULTS_DIR, filename), JSON.stringify(scrapeResult, null, 2));
      
      console.log(`  ✓ Success: ${scrapeResult.pages.length} pages (${elapsed}s)\n`);
      results.push({ ticket, name, success: true, pages: scrapeResult.pages.length, time: parseFloat(elapsed) });
    } catch (error: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ✗ Failed: ${error.message} (${elapsed}s)\n`);
      results.push({ ticket, name, success: false, error: error.message, time: parseFloat(elapsed) });
    }
  }

  // Save summary
  const summary = {
    timestamp: new Date().toISOString(),
    total: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  };
  
  writeFileSync(join(RESULTS_DIR, 'batch-summary.json'), JSON.stringify(summary, null, 2));
  
  console.log('\n📊 Summary:');
  console.log(`   Total: ${summary.total}`);
  console.log(`   Success: ${summary.successful}`);
  console.log(`   Failed: ${summary.failed}`);
  console.log(`\n   Results saved to: ${RESULTS_DIR}\n`);
}

runBatchTest().catch(console.error);
