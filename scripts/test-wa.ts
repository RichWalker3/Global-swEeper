#!/usr/bin/env node
/**
 * Test script: Compare Global-swEep results against existing Jira WA tickets
 * Usage: npx tsx src/cli/test-wa.ts
 */

import { config } from 'dotenv';
import { scrape } from '../src/scraper/scraper.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

config();

interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  merchantUrl?: string;
}

interface TestResult {
  ticketKey: string;
  merchantName: string;
  merchantUrl: string | null;
  existingWA: string;
  scrapeSuccess: boolean;
  scrapeError?: string;
  scrapeResult?: {
    pagesVisited: number;
    platform: string | undefined;
    thirdParties: string[];
    redFlags: string[];
    policyInfo: unknown;
    checkoutInfo: unknown;
    catalogFeatures: unknown;
  };
  comparison: {
    issues: string[];
    matches: string[];
  };
}

const TICKETS_TO_TEST = [
  'SOPP-7163', // Venus
  'SOPP-7020', // Yonex - New Deal US
  'SOPP-7182', // Felina USA
  'SOPP-7055', // Smartpin/Band24
  'SOPP-7029', // Cuyana
  'SOPP-7067', // Sincerely Yours
  'SOPP-6989', // TheTubeStore
  'SOPP-6963', // Ivy City
  'SOPP-6926', // Elie Tahari
  'SOPP-6888', // La Canadienne
  'SOPP-6860', // HATCH Collection
];

const RESULTS_DIR = join(process.cwd(), 'test-results');

async function fetchJiraTicket(ticketKey: string): Promise<JiraTicket | null> {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = process.env.JIRA_BASE_URL;

  if (!email || !token || !baseUrl) {
    console.error('Missing Jira credentials');
    return null;
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const url = `${baseUrl}/rest/api/3/issue/${ticketKey}?expand=renderedFields`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${ticketKey}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    // Extract description (rendered HTML or plain text)
    const description = data.renderedFields?.description || 
                        (data.fields?.description?.content ? 
                          JSON.stringify(data.fields.description.content) : 
                          'No description');

    return {
      key: data.key,
      summary: data.fields?.summary || '',
      description,
    };
  } catch (error) {
    console.error(`Error fetching ${ticketKey}:`, error);
    return null;
  }
}

function extractMerchantUrl(description: string): string | null {
  // Look for URLs in the description
  // Common patterns: "Primary URL:", "Website:", "URL:", or just URLs
  
  const urlPatterns = [
    /Primary URL[:\s]+(?:<[^>]+>)*(https?:\/\/[^\s<"]+)/i,
    /Website[:\s]+(?:<[^>]+>)*(https?:\/\/[^\s<"]+)/i,
    /URL[:\s]+(?:<[^>]+>)*(https?:\/\/[^\s<"]+)/i,
    /href="(https?:\/\/[^"]+\.(com|co|net|io|shop|store)[^"]*)"/i,
    /(https?:\/\/(?:www\.)?[a-z0-9-]+\.(com|co|net|io|shop|store))/i,
  ];

  for (const pattern of urlPatterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      // Clean up the URL
      let url = match[1].replace(/<[^>]+>/g, '').trim();
      // Remove trailing punctuation
      url = url.replace(/[.,;:!?)]+$/, '');
      // Ensure it's a valid merchant URL (not Jira, not Global-e internal)
      if (!url.includes('atlassian') && !url.includes('global-e.') && !url.includes('jira')) {
        return url;
      }
    }
  }

  return null;
}

function extractKeyInfo(description: string): Record<string, string[]> {
  const info: Record<string, string[]> = {
    platforms: [],
    thirdParties: [],
    returnInfo: [],
    shippingInfo: [],
    checkoutInfo: [],
    redFlags: [],
  };

  const descLower = description.toLowerCase();

  // Platform detection
  if (descLower.includes('shopify')) info.platforms.push('Shopify');
  if (descLower.includes('sfcc') || descLower.includes('salesforce commerce')) info.platforms.push('SFCC');
  if (descLower.includes('magento')) info.platforms.push('Magento');
  if (descLower.includes('bigcommerce')) info.platforms.push('BigCommerce');

  // Third parties
  const thirdPartyPatterns = [
    'recharge', 'smile.io', 'loyaltylion', 'yotpo', 'klaviyo', 'attentive',
    'returngo', 'loop returns', 'narvar', 'afterpay', 'klarna', 'affirm',
    'shop pay', 'apple pay', 'google pay', 'paypal', 'gorgias', 'zendesk',
  ];
  for (const tp of thirdPartyPatterns) {
    if (descLower.includes(tp)) {
      info.thirdParties.push(tp);
    }
  }

  // Return info patterns
  const returnPatterns = [
    /(\d+)\s*day\s*return/gi,
    /return\s*window[:\s]*(\d+)/gi,
    /free\s*returns/gi,
    /final\s*sale/gi,
    /no\s*returns/gi,
  ];
  for (const pattern of returnPatterns) {
    const matches = description.match(pattern);
    if (matches) {
      info.returnInfo.push(...matches);
    }
  }

  // Red flags
  if (descLower.includes('smile.io')) info.redFlags.push('Smile.io (not supported)');
  if (descLower.includes('recharge')) info.redFlags.push('Recharge (OoS risk)');
  if (descLower.includes('dangerous goods') || descLower.includes('hazmat')) info.redFlags.push('Dangerous goods');
  if (descLower.includes('b2b') || descLower.includes('wholesale')) info.redFlags.push('B2B/Wholesale');

  return info;
}

function compareResults(existing: Record<string, string[]>, scraped: TestResult['scrapeResult']): TestResult['comparison'] {
  const issues: string[] = [];
  const matches: string[] = [];

  if (!scraped) {
    return { issues: ['Scrape failed - cannot compare'], matches: [] };
  }

  // Platform comparison
  const existingPlatform = existing.platforms[0]?.toLowerCase();
  const scrapedPlatform = scraped.platform?.toLowerCase();
  
  if (existingPlatform && scrapedPlatform) {
    if (existingPlatform === scrapedPlatform) {
      matches.push(`Platform: ${scraped.platform}`);
    } else {
      issues.push(`Platform mismatch: WA says "${existing.platforms[0]}", swEep found "${scraped.platform}"`);
    }
  } else if (scrapedPlatform && !existingPlatform) {
    matches.push(`Platform detected: ${scraped.platform} (not mentioned in WA)`);
  }

  // Third-party comparison
  for (const tp of existing.thirdParties) {
    const found = scraped.thirdParties.some(s => s.toLowerCase().includes(tp.toLowerCase()));
    if (found) {
      matches.push(`Third-party match: ${tp}`);
    } else {
      issues.push(`Missing third-party: WA mentions "${tp}" but swEep didn't detect it`);
    }
  }

  // Check for third-parties swEep found but WA didn't mention
  for (const tp of scraped.thirdParties) {
    const inExisting = existing.thirdParties.some(e => tp.toLowerCase().includes(e.toLowerCase()));
    if (!inExisting && ['recharge', 'smile', 'returngo', 'loyaltylion', 'afterpay', 'klarna'].some(k => tp.toLowerCase().includes(k))) {
      issues.push(`New finding: swEep found "${tp}" not in WA`);
    }
  }

  // Red flag comparison
  for (const flag of existing.redFlags) {
    const found = scraped.redFlags.some(f => f.toLowerCase().includes(flag.split(' ')[0].toLowerCase()));
    if (found) {
      matches.push(`Red flag confirmed: ${flag}`);
    }
  }

  // Policy info check
  const policyInfo = (scraped.policyInfo || {}) as Record<string, unknown>;
  if (policyInfo.returnWindow) {
    matches.push(`Return window extracted: ${policyInfo.returnWindow}`);
  }
  if (policyInfo.returnProvider) {
    matches.push(`Return provider detected: ${policyInfo.returnProvider}`);
  }

  // Checkout info check
  const checkoutInfo = (scraped.checkoutInfo || {}) as Record<string, unknown>;
  if (checkoutInfo.expressWallets && (checkoutInfo.expressWallets as string[]).length > 0) {
    matches.push(`Express wallets found: ${(checkoutInfo.expressWallets as string[]).join(', ')}`);
  }
  if (checkoutInfo.bnplOptions && (checkoutInfo.bnplOptions as string[]).length > 0) {
    matches.push(`BNPL found: ${(checkoutInfo.bnplOptions as string[]).join(', ')}`);
  }

  return { issues, matches };
}

async function runTest(): Promise<void> {
  console.log('\n🧪 Global-swEep Test Suite\n');
  console.log('=' .repeat(60));
  console.log(`Testing ${TICKETS_TO_TEST.length} WA tickets\n`);

  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const results: TestResult[] = [];
  const summary = {
    total: TICKETS_TO_TEST.length,
    fetched: 0,
    urlFound: 0,
    scraped: 0,
    failed: 0,
    totalIssues: 0,
    totalMatches: 0,
  };

  for (const ticketKey of TICKETS_TO_TEST) {
    console.log(`\n📋 Processing ${ticketKey}...`);

    // Fetch ticket
    const ticket = await fetchJiraTicket(ticketKey);
    if (!ticket) {
      console.log(`   ❌ Failed to fetch ticket`);
      results.push({
        ticketKey,
        merchantName: 'Unknown',
        merchantUrl: null,
        existingWA: '',
        scrapeSuccess: false,
        scrapeError: 'Failed to fetch Jira ticket',
        comparison: { issues: ['Could not fetch ticket'], matches: [] },
      });
      summary.failed++;
      continue;
    }
    summary.fetched++;

    const merchantName = ticket.summary.replace('Website Assessment - ', '').replace('Website Assessment', '').trim();
    console.log(`   Merchant: ${merchantName}`);

    // Save the raw ticket description for reference
    const ticketPath = join(RESULTS_DIR, `${ticketKey}-jira.html`);
    writeFileSync(ticketPath, ticket.description);

    // Extract merchant URL
    const merchantUrl = extractMerchantUrl(ticket.description);
    if (!merchantUrl) {
      console.log(`   ⚠️ Could not extract merchant URL from description`);
      results.push({
        ticketKey,
        merchantName,
        merchantUrl: null,
        existingWA: ticket.description.substring(0, 500),
        scrapeSuccess: false,
        scrapeError: 'Could not extract merchant URL from ticket',
        comparison: { issues: ['No merchant URL found in ticket'], matches: [] },
      });
      summary.failed++;
      continue;
    }
    summary.urlFound++;
    console.log(`   URL: ${merchantUrl}`);

    // Extract key info from existing WA
    const existingInfo = extractKeyInfo(ticket.description);
    console.log(`   Existing WA mentions: ${existingInfo.platforms.join(', ') || 'no platform'}, ${existingInfo.thirdParties.length} apps`);

    // Run swEep scraper
    console.log(`   🔄 Running swEep scraper...`);
    let scrapeResult;
    try {
      scrapeResult = await scrape(merchantUrl, {
        maxPages: 20,
        timeout: 15000,
        scrapeTimeout: 180000, // 3 minutes for slow sites
        takeScreenshots: false,
        verbose: true,
      });
      summary.scraped++;
      console.log(`   ✅ Scraped ${scrapeResult.summary.pagesVisited} pages`);

      // Save scrape result
      const scrapePath = join(RESULTS_DIR, `${ticketKey}-scrape.json`);
      writeFileSync(scrapePath, JSON.stringify(scrapeResult.summary, null, 2));

    } catch (error) {
      console.log(`   ❌ Scrape failed: ${error}`);
      results.push({
        ticketKey,
        merchantName,
        merchantUrl,
        existingWA: ticket.description.substring(0, 500),
        scrapeSuccess: false,
        scrapeError: String(error),
        comparison: { issues: [`Scrape failed: ${error}`], matches: [] },
      });
      summary.failed++;
      continue;
    }

    // Compare results
    const scraped = {
      pagesVisited: scrapeResult.summary.pagesVisited,
      platform: scrapeResult.summary.platformDetected,
      thirdParties: scrapeResult.summary.thirdPartiesDetected,
      redFlags: scrapeResult.summary.redFlags,
      policyInfo: scrapeResult.summary.policyInfo || {},
      checkoutInfo: scrapeResult.summary.checkoutInfo || {},
      catalogFeatures: scrapeResult.summary.catalogFeatures || {},
    };

    const comparison = compareResults(existingInfo, scraped);
    summary.totalIssues += comparison.issues.length;
    summary.totalMatches += comparison.matches.length;

    console.log(`   📊 ${comparison.matches.length} matches, ${comparison.issues.length} issues`);
    if (comparison.issues.length > 0) {
      comparison.issues.forEach(i => console.log(`      ⚠️ ${i}`));
    }

    results.push({
      ticketKey,
      merchantName,
      merchantUrl,
      existingWA: ticket.description.substring(0, 1000),
      scrapeSuccess: true,
      scrapeResult: scraped,
      comparison,
    });
  }

  // Generate summary report
  console.log('\n' + '=' .repeat(60));
  console.log('📊 TEST SUMMARY\n');
  console.log(`Total tickets: ${summary.total}`);
  console.log(`Successfully fetched: ${summary.fetched}`);
  console.log(`URL extracted: ${summary.urlFound}`);
  console.log(`Successfully scraped: ${summary.scraped}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`\nTotal matches: ${summary.totalMatches}`);
  console.log(`Total issues: ${summary.totalIssues}`);

  // Save full results
  const reportPath = join(RESULTS_DIR, 'test-report.json');
  writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2));
  console.log(`\n📁 Full report saved to: ${reportPath}`);

  // Generate markdown report
  const mdReport = generateMarkdownReport(summary, results);
  const mdPath = join(RESULTS_DIR, 'test-report.md');
  writeFileSync(mdPath, mdReport);
  console.log(`📝 Markdown report saved to: ${mdPath}`);
}

interface TestSummary {
  total: number;
  fetched: number;
  urlFound: number;
  scraped: number;
  failed: number;
  totalMatches: number;
  totalIssues: number;
}

function generateMarkdownReport(summary: TestSummary, results: TestResult[]): string {
  const lines: string[] = [
    '# Global-swEep Test Report',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Total tickets | ${summary.total} |`,
    `| Successfully fetched | ${summary.fetched} |`,
    `| URL extracted | ${summary.urlFound} |`,
    `| Successfully scraped | ${summary.scraped} |`,
    `| Failed | ${summary.failed} |`,
    `| **Total matches** | ${summary.totalMatches} |`,
    `| **Total issues** | ${summary.totalIssues} |`,
    '',
    '---',
    '',
    '## Issues Found',
    '',
  ];

  const allIssues: { ticket: string; merchant: string; issue: string }[] = [];
  for (const r of results) {
    for (const issue of r.comparison.issues) {
      allIssues.push({ ticket: r.ticketKey, merchant: r.merchantName, issue });
    }
  }

  if (allIssues.length === 0) {
    lines.push('_No issues found!_');
  } else {
    lines.push('| Ticket | Merchant | Issue |');
    lines.push('|--------|----------|-------|');
    for (const i of allIssues) {
      lines.push(`| ${i.ticket} | ${i.merchant} | ${i.issue} |`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Detailed Results');
  lines.push('');

  for (const r of results) {
    lines.push(`### ${r.ticketKey} - ${r.merchantName}`);
    lines.push('');
    lines.push(`**URL:** ${r.merchantUrl || 'Not found'}`);
    lines.push(`**Scrape Status:** ${r.scrapeSuccess ? '✅ Success' : '❌ Failed'}`);
    
    if (r.scrapeResult) {
      lines.push(`**Pages:** ${r.scrapeResult.pagesVisited}`);
      lines.push(`**Platform:** ${r.scrapeResult.platform || 'Unknown'}`);
      lines.push(`**Third-parties:** ${r.scrapeResult.thirdParties.join(', ') || 'None'}`);
      
      if (r.scrapeResult.redFlags.length > 0) {
        lines.push(`**Red Flags:** ${r.scrapeResult.redFlags.join(', ')}`);
      }
    }
    
    lines.push('');
    
    if (r.comparison.matches.length > 0) {
      lines.push('**Matches:**');
      for (const m of r.comparison.matches) {
        lines.push(`- ✅ ${m}`);
      }
    }
    
    if (r.comparison.issues.length > 0) {
      lines.push('');
      lines.push('**Issues:**');
      for (const i of r.comparison.issues) {
        lines.push(`- ⚠️ ${i}`);
      }
    }
    
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// Run the test
runTest().catch(console.error);
