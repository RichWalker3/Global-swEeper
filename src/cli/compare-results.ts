#!/usr/bin/env node
/**
 * Compare scrape results to Jira ticket content
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const RESULTS_DIR = join(process.cwd(), 'test-results', 'batch-test');
const TICKETS_DIR = '/tmp/wa_tickets';

interface ComparisonResult {
  ticket: string;
  name: string;
  scrapeData: {
    platform: string | null;
    thirdPartyApps: string[];
    hasLoyalty: boolean;
    hasBNPL: boolean;
    hasSubscription: boolean;
    currencies: string[];
    checkoutWallets: string[];
    redFlags: string[];
  };
  jiraData: {
    platform: string | null;
    thirdPartyApps: string[];
    hasLoyalty: boolean;
    hasBNPL: boolean;
    hasSubscription: boolean;
  };
  matches: string[];
  mismatches: string[];
}

function extractTextFromADF(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(extractTextFromADF).join(' ');
  }
  if (content.text) return content.text;
  if (content.content) return extractTextFromADF(content.content);
  return '';
}

function parseJiraTicket(ticketPath: string): any {
  try {
    const data = JSON.parse(readFileSync(ticketPath, 'utf-8'));
    const description = data.fields?.description;
    if (!description) return null;
    
    const fullText = extractTextFromADF(description).toLowerCase();
    
    // Extract platform
    let platform: string | null = null;
    if (fullText.includes('shopify')) platform = 'Shopify';
    else if (fullText.includes('bigcommerce')) platform = 'BigCommerce';
    else if (fullText.includes('salesforce')) platform = 'Salesforce Commerce Cloud';
    else if (fullText.includes('magento')) platform = 'Magento';
    else if (fullText.includes('woocommerce')) platform = 'WooCommerce';
    
    // Extract third-party indicators (only WA-relevant apps)
    const thirdPartyApps: string[] = [];
    const appPatterns = [
      { name: 'Yotpo', pattern: /yotpo/i },
      { name: 'Recharge', pattern: /recharge/i },
      { name: 'Loop Returns', pattern: /loop returns/i },
      { name: 'Smile.io', pattern: /smile\.io|smile rewards/i },
      { name: 'Afterpay', pattern: /afterpay/i },
      { name: 'Klarna', pattern: /klarna/i },
      { name: 'Affirm', pattern: /affirm/i },
      { name: 'Shop Pay', pattern: /shop pay/i },
      { name: 'PayPal', pattern: /paypal/i },
      { name: 'Apple Pay', pattern: /apple pay/i },
      { name: 'Google Pay', pattern: /google pay/i },
      { name: 'Amazon Pay', pattern: /amazon pay/i },
      { name: 'Venmo', pattern: /venmo/i },
      { name: 'Bold Subscriptions', pattern: /bold subscriptions/i },
      { name: 'Skio', pattern: /skio/i },
      { name: 'Ordergroove', pattern: /ordergroove/i },
      { name: 'Global-e', pattern: /global-e|globale/i },
      { name: 'ReturnGO', pattern: /returngo/i },
    ];
    
    for (const app of appPatterns) {
      if (app.pattern.test(fullText)) {
        thirdPartyApps.push(app.name);
      }
    }
    
    return {
      platform,
      thirdPartyApps,
      hasLoyalty: /loyalty|rewards|points/i.test(fullText),
      hasBNPL: /afterpay|klarna|affirm|buy now pay later|bnpl|sezzle|zip/i.test(fullText),
      hasSubscription: /subscription|subscribe|recurring/i.test(fullText),
    };
  } catch {
    return null;
  }
}

// Apps that are irrelevant for WA comparison
const IRRELEVANT_APPS = [
  'Google Analytics', 'Hotjar', 'Segment', 'Impact',
  'Klaviyo', 'Attentive', 'Postscript', 'Mailchimp', 'Listrak',
  'Gorgias', 'Zendesk', 'Intercom', 'Gladly',
  'Nosto', 'Rebuy', 'Bold',
  'Boost Commerce', 'Searchanise',
];

function parseScrapeResult(scrapePath: string): any {
  try {
    const data = JSON.parse(readFileSync(scrapePath, 'utf-8'));
    const summary = data.summary || {};
    
    // Extract platform
    const platform = summary.platformDetected || null;
    
    // Extract third-party apps (filter out irrelevant ones)
    const allApps = summary.thirdPartiesDetected || [];
    const thirdPartyApps = allApps.filter((app: string) => 
      !IRRELEVANT_APPS.some(irrelevant => app.toLowerCase().includes(irrelevant.toLowerCase()))
    );
    
    // Check checkout data
    const checkout = summary.checkoutInfo || {};
    const wallets = checkout.expressWallets || [];
    const bnpl = checkout.bnplOptions || [];
    
    // Extract red flags
    const redFlags = summary.redFlags || [];
    
    // Check for loyalty
    const loyaltyProgram = summary.loyaltyProgram || {};
    const hasLoyalty = loyaltyProgram.detected || false;
    
    // Check for BNPL
    const hasBNPL = bnpl.length > 0;
    
    // Check for subscriptions
    const catalogFeatures = summary.catalogFeatures || {};
    const hasSubscription = catalogFeatures.subscriptionsDetected || false;
    
    // Policy info
    const policyInfo = summary.policyInfo || {};
    
    return {
      platform,
      thirdPartyApps,
      hasLoyalty,
      hasBNPL,
      hasSubscription,
      currencies: summary.localization?.currenciesDetected || [],
      checkoutWallets: wallets,
      bnplOptions: bnpl,
      redFlags,
      returnWindow: policyInfo.returnWindow,
      subscriptionProvider: catalogFeatures.subscriptionProvider,
      loyaltyProgramName: loyaltyProgram.programName,
    };
  } catch {
    return null;
  }
}

function compareResults(): void {
  console.log('\n🔍 Comparing Scrape Results to Jira Tickets\n');
  
  const comparisons: ComparisonResult[] = [];
  const scrapeFiles = readdirSync(RESULTS_DIR).filter(f => f.endsWith('_scrape.json'));
  
  for (const file of scrapeFiles) {
    const ticket = file.replace('_scrape.json', '');
    const ticketPath = join(TICKETS_DIR, `${ticket}.json`);
    const scrapePath = join(RESULTS_DIR, file);
    
    if (!existsSync(ticketPath)) {
      console.log(`⚠️ ${ticket}: No Jira ticket found`);
      continue;
    }
    
    const jiraData = parseJiraTicket(ticketPath);
    const scrapeData = parseScrapeResult(scrapePath);
    
    if (!jiraData || !scrapeData) {
      console.log(`⚠️ ${ticket}: Could not parse data`);
      continue;
    }
    
    // Compare
    const matches: string[] = [];
    const mismatches: string[] = [];
    
    // Platform comparison
    if (scrapeData.platform && jiraData.platform) {
      if (scrapeData.platform.toLowerCase() === jiraData.platform.toLowerCase()) {
        matches.push(`Platform: ${scrapeData.platform}`);
      } else {
        mismatches.push(`Platform: Scrape=${scrapeData.platform}, Jira=${jiraData.platform}`);
      }
    } else if (scrapeData.platform || jiraData.platform) {
      mismatches.push(`Platform: Scrape=${scrapeData.platform || 'unknown'}, Jira=${jiraData.platform || 'unknown'}`);
    }
    
    // Loyalty comparison
    if (scrapeData.hasLoyalty === jiraData.hasLoyalty) {
      matches.push(`Loyalty: ${scrapeData.hasLoyalty ? 'Yes' : 'No'}`);
    } else {
      mismatches.push(`Loyalty: Scrape=${scrapeData.hasLoyalty}, Jira=${jiraData.hasLoyalty}`);
    }
    
    // BNPL comparison
    if (scrapeData.hasBNPL === jiraData.hasBNPL) {
      matches.push(`BNPL: ${scrapeData.hasBNPL ? 'Yes' : 'No'}`);
    } else {
      mismatches.push(`BNPL: Scrape=${scrapeData.hasBNPL}, Jira=${jiraData.hasBNPL}`);
    }
    
    // Subscription comparison
    if (scrapeData.hasSubscription === jiraData.hasSubscription) {
      matches.push(`Subscriptions: ${scrapeData.hasSubscription ? 'Yes' : 'No'}`);
    } else {
      mismatches.push(`Subscriptions: Scrape=${scrapeData.hasSubscription}, Jira=${jiraData.hasSubscription}`);
    }
    
    // Third-party apps overlap
    const scrapeAppsLower = scrapeData.thirdPartyApps.map((a: string) => a.toLowerCase());
    const jiraAppsLower = jiraData.thirdPartyApps.map((a: string) => a.toLowerCase());
    const commonApps = scrapeAppsLower.filter((a: string) => 
      jiraAppsLower.some((j: string) => j.includes(a) || a.includes(j))
    );
    
    if (commonApps.length > 0) {
      matches.push(`Common Apps: ${commonApps.join(', ')}`);
    }
    
    const scrapeOnlyApps = scrapeData.thirdPartyApps.filter((a: string) => 
      !jiraAppsLower.some((j: string) => j.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(j.toLowerCase()))
    );
    
    const jiraOnlyApps = jiraData.thirdPartyApps.filter((a: string) => 
      !scrapeAppsLower.some((s: string) => s.includes(a.toLowerCase()) || a.toLowerCase().includes(s))
    );
    
    if (scrapeOnlyApps.length > 0) {
      mismatches.push(`Scrape-only apps: ${scrapeOnlyApps.join(', ')}`);
    }
    if (jiraOnlyApps.length > 0) {
      mismatches.push(`Jira-only apps: ${jiraOnlyApps.join(', ')}`);
    }
    
    comparisons.push({
      ticket,
      name: ticket,
      scrapeData,
      jiraData,
      matches,
      mismatches,
    });
    
    const status = mismatches.length === 0 ? '✅' : mismatches.length <= 2 ? '🟡' : '❌';
    console.log(`${status} ${ticket}: ${matches.length} matches, ${mismatches.length} mismatches`);
  }
  
  // Generate report
  let report = `# Batch Test Comparison Report\n\n`;
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += `## Summary\n\n`;
  report += `- **Total Compared**: ${comparisons.length}\n`;
  report += `- **Perfect Matches**: ${comparisons.filter(c => c.mismatches.length === 0).length}\n`;
  report += `- **Minor Mismatches (1-2)**: ${comparisons.filter(c => c.mismatches.length > 0 && c.mismatches.length <= 2).length}\n`;
  report += `- **Major Mismatches (3+)**: ${comparisons.filter(c => c.mismatches.length > 2).length}\n\n`;
  
  report += `## Detailed Results\n\n`;
  
  for (const comp of comparisons) {
    const status = comp.mismatches.length === 0 ? '✅' : comp.mismatches.length <= 2 ? '🟡' : '❌';
    report += `### ${status} ${comp.ticket}\n\n`;
    
    if (comp.matches.length > 0) {
      report += `**Matches:**\n`;
      for (const m of comp.matches) {
        report += `- ${m}\n`;
      }
      report += `\n`;
    }
    
    if (comp.mismatches.length > 0) {
      report += `**Mismatches:**\n`;
      for (const m of comp.mismatches) {
        report += `- ${m}\n`;
      }
      report += `\n`;
    }
    
    report += `**Scrape Details:**\n`;
    report += `- Platform: ${comp.scrapeData.platform || 'Unknown'}\n`;
    report += `- Third-party Apps: ${comp.scrapeData.thirdPartyApps.join(', ') || 'None detected'}\n`;
    report += `- Checkout Wallets: ${comp.scrapeData.checkoutWallets.join(', ') || 'None detected'}\n`;
    report += `- Red Flags: ${comp.scrapeData.redFlags.join(', ') || 'None'}\n\n`;
  }
  
  writeFileSync(join(RESULTS_DIR, 'comparison-report.md'), report);
  console.log(`\n📝 Report saved to: ${join(RESULTS_DIR, 'comparison-report.md')}\n`);
}

compareResults();
