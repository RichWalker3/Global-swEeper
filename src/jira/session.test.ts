import { describe, expect, it, afterEach } from 'vitest';
import {
  clearJiraSession,
  getActiveJiraConfig,
  getJiraConnectionStatus,
  setJiraSession,
} from './session.js';

describe('Jira session credentials', () => {
  afterEach(() => {
    clearJiraSession();
  });

  it('stores credentials in memory and returns safe status', () => {
    setJiraSession({
      email: 'sales.engineer@example.com',
      apiToken: 'secret-token',
      baseUrl: 'https://global-e.atlassian.net/',
    });

    const config = getActiveJiraConfig({});
    expect(config).toMatchObject({
      email: 'sales.engineer@example.com',
      token: 'secret-token',
      baseUrl: 'https://global-e.atlassian.net',
      seOutputFieldId: 'customfield_21538',
    });

    expect(getJiraConnectionStatus({})).toMatchObject({
      connected: true,
      source: 'session',
      emailHint: 'sa***@example.com',
      hasSeOutputFieldId: true,
    });
    expect(JSON.stringify(getJiraConnectionStatus({}))).not.toContain('secret-token');
  });

  it('falls back to environment credentials when no session exists', () => {
    const env = {
      JIRA_EMAIL: 'env.user@example.com',
      JIRA_API_TOKEN: 'env-token',
      JIRA_BASE_URL: 'https://jira.example.com/',
    };

    expect(getActiveJiraConfig(env)).toMatchObject({
      email: 'env.user@example.com',
      token: 'env-token',
      baseUrl: 'https://jira.example.com',
      seOutputFieldId: 'customfield_21538',
      seOutputFieldName: 'SE Scoping Output',
    });
    expect(getJiraConnectionStatus(env)).toMatchObject({
      connected: true,
      source: 'env',
      hasSeOutputFieldId: true,
    });
  });

  it('reports disconnected without session or environment credentials', () => {
    expect(getJiraConnectionStatus({})).toEqual({
      connected: false,
      source: 'none',
      hasSeOutputFieldId: false,
    });
  });
});
