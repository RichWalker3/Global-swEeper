import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PHASE_FIELD_ID,
  SE_SCOPING_OUTPUT_FIELD_ID,
  applyBrdTableUpdates,
  previewSeOutputUpdates,
} from './jira.js';
import type { BrdParentContext } from './types.js';

const config = {
  baseUrl: 'https://example.atlassian.net',
  email: 'test@example.com',
  token: 'token',
};

const parent: BrdParentContext = {
  key: 'SOPP-1',
  summary: 'Test',
  subtasks: [
    {
      key: 'SOPP-2',
      summary: 'BRD-025 Pre-orders',
      status: 'Open',
      phaseText: '',
      seOutputText: 'Existing note',
    },
  ],
};

describe('previewSeOutputUpdates', () => {
  it('previews phase changes without requiring status transitions', () => {
    const previews = previewSeOutputUpdates(parent, [
      {
        jiraKey: 'SOPP-2',
        finalText: 'Updated note',
        phaseAction: 'out_of_scope',
      },
    ]);

    expect(previews[0]?.afterPhase).toBe('Out Of Scope');
    expect(previews[0]?.afterText).toBe('Updated note');
  });
});

describe('applyBrdTableUpdates', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes phase Out Of Scope without requesting a Canceled transition', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.includes('/transitions') && method === 'GET') {
        return new Response(JSON.stringify({ transitions: [{ id: '31', name: 'Done', to: { name: 'Done' } }] }), { status: 200 });
      }
      if (method === 'PUT') {
        return new Response('', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    });

    await applyBrdTableUpdates(
      parent,
      [
        {
          jiraKey: 'SOPP-2',
          finalText: 'Updated note',
          phaseAction: 'out_of_scope',
        },
      ],
      config
    );

    const putBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PUT')
      .map(([, init]) => JSON.parse(String(init?.body)));

    expect(putBodies.some((body) => body.fields?.[SE_SCOPING_OUTPUT_FIELD_ID])).toBe(true);
    expect(putBodies.some((body) => body.fields?.[PHASE_FIELD_ID]?.id === '23610')).toBe(true);

    const transitionPosts = fetchMock.mock.calls.filter(
      ([, init]) => String(init?.method) === 'POST' && String(init?.body || '').includes('transition')
    );
    expect(transitionPosts).toHaveLength(0);
  });

  it('transitions to Done when statusAction is done', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';
      if (url.includes('/transitions') && method === 'GET') {
        return new Response(JSON.stringify({ transitions: [{ id: '31', name: 'Done', to: { name: 'Done' } }] }), { status: 200 });
      }
      if (method === 'POST') {
        return new Response('', { status: 200 });
      }
      if (method === 'PUT') {
        return new Response('', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    });

    await applyBrdTableUpdates(
      parent,
      [
        {
          jiraKey: 'SOPP-2',
          finalText: 'Done note',
          statusAction: 'done',
          phaseAction: 'in_scope',
        },
      ],
      config
    );

    const transitionPosts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'POST' && String(init?.body || '').includes('"transition"')
    );
    expect(transitionPosts).toHaveLength(1);
  });
});
