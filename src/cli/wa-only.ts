/**
 * Wappalyzer-only analysis script
 * Runs just the technology detection without the AI assessment
 */

import { chromium } from 'playwright';
import { initWappalyzer, analyzeWithWappalyzer, filterEcommerceRelevant } from '../scraper/wappalyzer.js';
import { detectThirdParty } from '../scraper/detectors.js';

const url = process.argv[2];
if (!url) {
  console.error('Usage: npm run wa -- <url>');
  process.exit(1);
}

const seedUrl = url.startsWith('http') ? url : `https://${url}`;

async function main() {
  console.log(`\n🔍 Wappalyzer Analysis: ${seedUrl}\n`);
  
  // Initialize
  const wapReady = await initWappalyzer();
  if (!wapReady) {
    console.error('Failed to initialize Wappalyzer');
    process.exit(1);
  }
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });
  
  const thirdParties = new Set<string>();
  const page = await context.newPage();
  
  // Track network requests
  page.on('request', (request) => {
    const reqUrl = request.url();
    const detected = detectThirdParty(reqUrl);
    if (detected) {
      thirdParties.add(detected);
    }
  });
  
  try {
    // Navigate to homepage
    console.log('Scanning homepage...');
    await page.goto(seedUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    const html = await page.content();
    const headers = {};
    
    // Run Wappalyzer
    const allResults = await analyzeWithWappalyzer(seedUrl, html, headers);
    // Filter to e-commerce relevant results
    filterEcommerceRelevant(allResults);
    
    // Also check a collection page
    console.log('Scanning collection page...');
    try {
      await page.goto(`${seedUrl.replace(/\/$/, '')}/collections/all`, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const collectionHtml = await page.content();
      const collectionResults = await analyzeWithWappalyzer(page.url(), collectionHtml, {});
      for (const r of collectionResults) {
        if (!allResults.find(ar => ar.name.toLowerCase() === r.name.toLowerCase())) {
          allResults.push(r);
        }
      }
    } catch (e) {
      console.log('  (collection page not accessible)');
    }
    
    // Check product page
    console.log('Scanning product page...');
    try {
      const productLink = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/products/"]'));
        for (const link of links) {
          const href = (link as HTMLAnchorElement).href;
          if (!href.includes('?variant=')) return href;
        }
        return null;
      });
      
      if (productLink) {
        await page.goto(productLink, { timeout: 15000, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        const pdpHtml = await page.content();
        const pdpResults = await analyzeWithWappalyzer(page.url(), pdpHtml, {});
        for (const r of pdpResults) {
          if (!allResults.find(ar => ar.name.toLowerCase() === r.name.toLowerCase())) {
            allResults.push(r);
          }
        }
      }
    } catch (e) {
      console.log('  (product page not accessible)');
    }
    
    // Check checkout/cart
    console.log('Scanning cart...');
    try {
      await page.goto(`${seedUrl.replace(/\/$/, '')}/cart`, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const cartHtml = await page.content();
      const cartResults = await analyzeWithWappalyzer(page.url(), cartHtml, {});
      for (const r of cartResults) {
        if (!allResults.find(ar => ar.name.toLowerCase() === r.name.toLowerCase())) {
          allResults.push(r);
        }
      }
    } catch (e) {
      console.log('  (cart not accessible)');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('WAPPALYZER RESULTS (All Technologies)');
    console.log('='.repeat(60));
    
    // Group by category
    const byCategory = new Map<string, typeof allResults>();
    for (const tech of allResults) {
      for (const cat of tech.categories) {
        const catName = cat.name;
        if (!byCategory.has(catName)) {
          byCategory.set(catName, []);
        }
        byCategory.get(catName)!.push(tech);
      }
    }
    
    // Sort categories
    const sortedCategories = Array.from(byCategory.keys()).sort();
    for (const cat of sortedCategories) {
      console.log(`\n📦 ${cat}:`);
      const techs = byCategory.get(cat)!;
      for (const tech of techs) {
        const version = tech.version ? ` v${tech.version}` : '';
        const conf = tech.confidence < 100 ? ` (${tech.confidence}%)` : '';
        console.log(`   • ${tech.name}${version}${conf}`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('E-COMMERCE RELEVANT (Filtered)');
    console.log('='.repeat(60));
    
    const ecomFiltered = filterEcommerceRelevant(allResults);
    if (ecomFiltered.length === 0) {
      console.log('\n   (None detected by Wappalyzer filter)');
    } else {
      for (const tech of ecomFiltered) {
        const cats = tech.categories.map(c => c.name).join(', ');
        console.log(`   • ${tech.name} [${cats}]`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('NETWORK-DETECTED THIRD PARTIES');
    console.log('='.repeat(60));
    
    const sortedThirdParties = Array.from(thirdParties).sort();
    for (const tp of sortedThirdParties) {
      console.log(`   • ${tp}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`Total: ${allResults.length} technologies, ${thirdParties.size} third parties`);
    console.log('='.repeat(60) + '\n');
    
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
