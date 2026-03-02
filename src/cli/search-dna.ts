#!/usr/bin/env npx tsx
import { searchDNAByMerchant } from '../confluence/index.js';

async function main() {
  const merchants = process.argv.slice(2);
  
  if (merchants.length === 0) {
    console.log('Usage: npx tsx src/cli/search-dna.ts <merchant1> [merchant2] ...');
    process.exit(1);
  }
  
  console.log('\nSearching Confluence for DNA documents...\n');
  
  for (const merchant of merchants) {
    console.log(`--- ${merchant} ---`);
    try {
      const results = await searchDNAByMerchant(merchant);
      if (results.length === 0) {
        console.log(`No DNA found for "${merchant}"`);
      } else {
        results.forEach((r) => {
          console.log(r.title);
          console.log(`  ${r.url}`);
          if (r.modified) console.log(`  Modified: ${new Date(r.modified).toLocaleString()}`);
        });
      }
    } catch (e: any) {
      console.log(`Error searching: ${e.message}`);
    }
    console.log('');
  }
}

main();
