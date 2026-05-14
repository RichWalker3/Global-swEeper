import { describe, expect, it } from 'vitest';
import { adfToPlainText, applyManagedBrdSection, previewManagedBrdSection } from './description.js';

describe('BRD managed description section', () => {
  it('appends a managed section without removing existing description text', () => {
    const original = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'HubSpot says no loyalty.' }] },
      ],
    };

    const updated = applyManagedBrdSection(original, 'Old loyalty script found, but no loyalty UI found.');
    const text = adfToPlainText(updated);

    expect(text).toContain('HubSpot says no loyalty.');
    expect(text).toContain('Sweep BRD Notes');
    expect(text).toContain('Old loyalty script found, but no loyalty UI found.');
  });

  it('replaces only the existing managed section on rerun', () => {
    const first = applyManagedBrdSection('Existing scoped value.', 'First generated note.');
    const second = applyManagedBrdSection(first, 'Updated generated note.');
    const text = adfToPlainText(second);

    expect(text).toContain('Existing scoped value.');
    expect(text).not.toContain('First generated note.');
    expect(text).toContain('Updated generated note.');
  });

  it('previews before and after text', () => {
    const preview = previewManagedBrdSection('Original text.', 'Reviewed text.');
    expect(preview.beforeText).toBe('Original text.');
    expect(preview.afterText).toContain('Reviewed text.');
  });
});
