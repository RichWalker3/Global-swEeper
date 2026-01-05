#!/usr/bin/env node
/**
 * CLI entry point for Global-swEep
 * Usage: npm run sweep -- --url https://example.com
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';

// Load environment variables
config();

const program = new Command();

program
  .name('sweep')
  .description('Run a Website Assessment on a merchant site')
  .version('0.1.0')
  .requiredOption('-u, --url <url>', 'Merchant website URL to assess')
  .option('-o, --output <path>', 'Output file path (default: stdout)')
  .option('--json', 'Output raw JSON instead of Markdown')
  .option('--no-screenshots', 'Skip taking screenshots')
  .option('-v, --verbose', 'Verbose output for debugging')
  .action(async (options: { url: string; output?: string; json?: boolean; screenshots?: boolean; verbose?: boolean }) => {
    console.log(chalk.cyan.bold('\n🧹 Global-swEep\n'));
    console.log(chalk.gray(`Target: ${options.url}`));
    console.log(chalk.gray(`Output: ${options.output || 'stdout'}`));
    console.log(chalk.gray(`Format: ${options.json ? 'JSON' : 'Markdown'}\n`));

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(chalk.red('❌ Missing ANTHROPIC_API_KEY in environment'));
      console.error(chalk.gray('   Copy .env.example to .env and add your key'));
      process.exit(1);
    }

    console.log(chalk.yellow('⏳ Starting assessment...\n'));

    // TODO: Implement the actual sweep pipeline
    // 1. Scrape the site with Playwright
    // 2. Pre-filter and tag pages
    // 3. Send to Claude for extraction
    // 4. Validate with Zod
    // 5. Format as Markdown

    console.log(chalk.green('✅ Pipeline scaffolding ready!'));
    console.log(chalk.gray('   Next: Implement scraper, extractor, formatter\n'));
  });

program.parse();

