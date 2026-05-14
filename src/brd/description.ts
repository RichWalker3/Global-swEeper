const SECTION_START = '<!-- SWEEP_BRD_START -->';
const SECTION_END = '<!-- SWEEP_BRD_END -->';
const SECTION_HEADING = 'Sweep BRD Notes';

interface AdfTextNode {
  type: 'text';
  text: string;
}

interface AdfBlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
}

type AdfNode = AdfTextNode | AdfBlockNode;

export interface AdfDocument {
  type: 'doc';
  version: number;
  content: AdfNode[];
}

export function adfToPlainText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return typeof raw === 'string' ? raw : '';
  const doc = raw as { content?: AdfNode[] };
  return (doc.content || [])
    .map((node) => nodeToText(node))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function applyManagedBrdSection(rawDescription: unknown, finalText: string): AdfDocument {
  const originalDoc = normalizeAdfDocument(rawDescription);
  const baseContent = removeManagedSection(originalDoc.content);
  const managedContent = buildManagedSection(finalText);
  const spacer = baseContent.length > 0 ? [paragraph('')] : [];

  return {
    type: 'doc',
    version: 1,
    content: [...baseContent, ...spacer, ...managedContent],
  };
}

export function previewManagedBrdSection(rawDescription: unknown, finalText: string): { beforeText: string; afterText: string } {
  const beforeText = adfToPlainText(rawDescription);
  const afterText = adfToPlainText(applyManagedBrdSection(rawDescription, finalText));
  return { beforeText, afterText };
}

function normalizeAdfDocument(raw: unknown): AdfDocument {
  if (raw && typeof raw === 'object' && (raw as { type?: unknown }).type === 'doc') {
    const doc = raw as { version?: unknown; content?: AdfNode[] };
    return {
      type: 'doc',
      version: typeof doc.version === 'number' ? doc.version : 1,
      content: Array.isArray(doc.content) ? doc.content : [],
    };
  }

  if (typeof raw === 'string' && raw.trim()) {
    return {
      type: 'doc',
      version: 1,
      content: raw.split(/\n{2,}/).map((line) => paragraph(line)),
    };
  }

  return { type: 'doc', version: 1, content: [] };
}

function removeManagedSection(content: AdfNode[]): AdfNode[] {
  const next: AdfNode[] = [];
  let insideManagedSection = false;

  for (const node of content) {
    const text = nodeToText(node).trim();
    if (text === SECTION_START) {
      insideManagedSection = true;
      continue;
    }
    if (text === SECTION_END) {
      insideManagedSection = false;
      continue;
    }
    if (!insideManagedSection) {
      next.push(node);
    }
  }

  return trimTrailingBlankParagraphs(next);
}

function buildManagedSection(finalText: string): AdfNode[] {
  const lines = finalText.trim().split('\n');
  const blocks: AdfNode[] = [
    paragraph(SECTION_START),
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: SECTION_HEADING }],
    },
  ];

  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push({
      type: 'bulletList',
      content: listItems.map((item) => ({
        type: 'listItem',
        content: [paragraph(item)],
      })),
    });
    listItems = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith('- ')) {
      listItems.push(trimmed.slice(2));
      continue;
    }

    flushList();
    blocks.push(paragraph(trimmed));
  }

  flushList();
  blocks.push(paragraph(SECTION_END));
  return blocks;
}

function paragraph(text: string): AdfBlockNode {
  return text
    ? { type: 'paragraph', content: [{ type: 'text', text }] }
    : { type: 'paragraph' };
}

function nodeToText(node: AdfNode): string {
  if ('text' in node) return node.text;
  const content = 'content' in node ? node.content || [] : [];
  const childText = content.map((child) => nodeToText(child)).join(node.type === 'paragraph' ? '' : '\n');

  if (node.type === 'heading') return childText;
  if (node.type === 'listItem') return `- ${childText.replace(/\n/g, ' ')}`;
  return childText;
}

function trimTrailingBlankParagraphs(content: AdfNode[]): AdfNode[] {
  const next = [...content];
  while (next.length > 0 && !nodeToText(next[next.length - 1]).trim()) {
    next.pop();
  }
  return next;
}
