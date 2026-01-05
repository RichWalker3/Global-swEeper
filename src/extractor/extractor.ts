/**
 * Claude-based extraction from scraped evidence
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ScrapeResult } from '../scraper/types.js';
import type { WebsiteAssessment } from '../schema/assessment.js';
import { WebsiteAssessmentSchema } from '../schema/assessment.js';
import { buildPrompt } from './prompt.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;

export interface ExtractOptions {
  model?: string;
  maxTokens?: number;
  verbose?: boolean;
}

export interface ExtractResult {
  assessment: WebsiteAssessment;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  rawResponse?: string;
}

export async function extract(
  scrapeResult: ScrapeResult,
  options: ExtractOptions = {}
): Promise<ExtractResult> {
  const model = options.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const maxTokens = options.maxTokens || Number(process.env.MAX_TOKENS) || DEFAULT_MAX_TOKENS;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not found in environment');
  }

  const client = new Anthropic({ apiKey });
  const { system, user } = buildPrompt(scrapeResult);

  if (options.verbose) {
    console.log(`  Using model: ${model}`);
    console.log(`  Prompt length: ~${Math.round((system.length + user.length) / 4)} tokens (est)`);
  }

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });

  // Extract text content from response
  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  const rawJson = textContent.text;

  // Try to parse and validate
  let parsed: unknown;
  try {
    // Handle potential markdown code block wrapper
    const jsonStr = rawJson.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse Claude response as JSON: ${e}`);
  }

  // Validate against schema
  const validated = WebsiteAssessmentSchema.safeParse(parsed);
  if (!validated.success) {
    if (options.verbose) {
      console.error('Schema validation errors:', validated.error.errors);
    }
    throw new Error(`Schema validation failed: ${validated.error.message}`);
  }

  return {
    assessment: validated.data,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    rawResponse: options.verbose ? rawJson : undefined,
  };
}

