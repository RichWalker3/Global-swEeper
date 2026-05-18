import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyBrdTableUpdates, ensureRowsBelongToParent, previewSeOutputUpdates, SE_SCOPING_OUTPUT_FIELD_ID } from './jira.js';
import type { BrdParentContext } from './types.js';

const parent: BrdParentContext = {
  key: 'SOPP-7431',
  summary: 'BRD Parent',
  subtasks: [
    {
      key: 'SOPP-7448',
      summary: 'BRD-014 - Loyalty & Reward',
      status: 'Reopen',
      descriptionText: 'Read-only Jira description context.',
      description: 'Read-only Jira description context.',
      seOutputText: 'HubSpot says no loyalty.',
      seOutputField: 'HubSpot says no loyalty.',
    },
  ],
};

describe('BRD Jira guards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects updates outside the validated parent subtasks', () => {
    expect(() => ensureRowsBelongToParent(parent, [
      { jiraKey: 'SOPP-9999', finalText: 'Bad update' },
    ])).toThrow('Rejected Jira keys outside SOPP-7431');
  });

  it('previews SE scoping output updates for allowed subtasks', () => {
    const previews = previewSeOutputUpdates(parent, [
      { jiraKey: 'SOPP-7448', finalText: 'Old loyalty script found, but no loyalty UI found.' },
    ]);

    expect(previews).toHaveLength(1);
    expect(previews[0].beforeText).toContain('HubSpot says no loyalty.');
    expect(previews[0].afterText).toContain('Old loyalty script found, but no loyalty UI found.');
  });

  it('updates SE scoping output field and transitions selected status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transitions: [
            { id: '31', name: 'Done', to: { name: 'Done' } },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

    await applyBrdTableUpdates(parent, [
      {
        jiraKey: 'SOPP-7448',
        finalText: 'Reviewed SE output.',
        statusAction: 'done',
      },
    ], {
      baseUrl: 'https://global-e.atlassian.net',
      email: 'user@example.com',
      token: 'token',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://global-e.atlassian.net/rest/api/3/issue/SOPP-7448',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          fields: {
            [SE_SCOPING_OUTPUT_FIELD_ID]: {
              type: 'doc',
              version: 1,
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Reviewed SE output.' }] },
              ],
            },
          },
        }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://global-e.atlassian.net/rest/api/3/issue/SOPP-7448/transitions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://global-e.atlassian.net/rest/api/3/issue/SOPP-7448/transitions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ transition: { id: '31' } }),
      })
    );
  });
});
