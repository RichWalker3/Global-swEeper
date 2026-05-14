export function normalizeSoppKey(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return `SOPP-${trimmed}`;
  }

  const match = raw.toUpperCase().match(/\b[A-Z][A-Z0-9]+-\d+\b/);
  const issueKey = match?.[0];
  return issueKey?.startsWith('SOPP-') ? issueKey : undefined;
}

export function requireSoppKey(raw: unknown): string {
  const issueKey = normalizeSoppKey(raw);
  if (!issueKey) {
    throw new Error('Provide a top-level SOPP key, for example SOPP-7431.');
  }
  return issueKey;
}
