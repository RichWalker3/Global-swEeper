import Anthropic from '@anthropic-ai/sdk';

import { buildDnaPrompt, type BuildDnaPromptInput } from './prompt.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;

export interface GenerateDnaOptions extends BuildDnaPromptInput {
  model?: string;
  maxTokens?: number;
  apiKey?: string;
}

export interface GenerateDnaResult {
  dnaMarkdown: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export async function generateDna(options: GenerateDnaOptions): Promise<GenerateDnaResult> {
  const model = options.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const maxTokens = options.maxTokens || Number(process.env.MAX_TOKENS) || DEFAULT_MAX_TOKENS;
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('No API key provided. Set ANTHROPIC_API_KEY or pass apiKey in the request.');
  }

  const client = new Anthropic({ apiKey });
  const { system, user } = buildDnaPrompt(options);

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });

  const textContent = response.content.find((content) => content.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  return {
    dnaMarkdown: textContent.text.trim(),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
