#!/usr/bin/env npx tsx
import { getLastDNALinks, ConfluenceClient } from '../confluence/index.js';

async function main() {
  const count = parseInt(process.argv[2] || '3', 10);
  
  console.log('\nTesting Confluence connection...');
  
  try {
    const client = new ConfluenceClient();
    const connectionTest = await client.testConnection();
    
    if (!connectionTest.success) {
      console.error(`Connection failed: ${connectionTest.message}`);
      console.log('\nPlease verify your credentials in .env:');
      console.log('  - JIRA_EMAIL: Your Atlassian account email');
      console.log('  - JIRA_API_TOKEN: Generate at https://id.atlassian.com/manage-profile/security/api-tokens');
      console.log('  - JIRA_BASE_URL: Your Atlassian instance URL (e.g., https://yourcompany.atlassian.net)');
      process.exit(1);
    }
    
    console.log(`${connectionTest.message}\n`);
    console.log(`Fetching last ${count} DNA pages...\n`);
    
    const links = await getLastDNALinks(count);
    
    if (links.length === 0) {
      console.log('No DNA pages found.');
      return;
    }
    
    console.log('Recent DNA Documents:');
    console.log('='.repeat(60));
    
    links.forEach((link, i) => {
      console.log(`\n${i + 1}. ${link.title}`);
      if (link.modified) {
        console.log(`   Modified: ${new Date(link.modified).toLocaleString()}`);
      }
      console.log(`   URL: ${link.url}`);
    });
    
    console.log('\n');
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error);
    }
    process.exit(1);
  }
}

main();
