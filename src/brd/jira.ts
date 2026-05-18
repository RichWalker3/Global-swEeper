import type { BrdParentContext, BrdTableUpdateInputRow, BrdUpdateInputRow, BrdUpdatePreview } from './types.js';
import { adfToPlainText } from './description.js';

export const SE_SCOPING_OUTPUT_FIELD_ID = 'customfield_21538';

export interface JiraConfig {
  baseUrl: string;
  email: string;
  token: string;
  seOutputFieldId?: string;
  seOutputFieldName?: string;
}

interface JiraIssueResponse {
  key: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    priority?: { name?: string };
    subtasks?: JiraIssueResponse[];
    description?: unknown;
    [fieldId: string]: unknown;
  };
}

interface JiraTransition {
  id: string;
  name: string;
  to?: { name?: string };
}

export function getJiraConfig(env: NodeJS.ProcessEnv = process.env): JiraConfig {
  const email = env.JIRA_EMAIL || env.ATLASSIAN_EMAIL;
  const token = env.JIRA_API_TOKEN || env.ATLASSIAN_KEY;
  const baseUrl = env.JIRA_BASE_URL || 'https://global-e.atlassian.net';
  const seOutputFieldId = SE_SCOPING_OUTPUT_FIELD_ID;
  const seOutputFieldName = env.JIRA_SE_OUTPUT_FIELD_NAME;

  if (!email || !token) {
    throw new Error('Missing Jira credentials. Set JIRA_EMAIL and JIRA_API_TOKEN locally.');
  }

  return { baseUrl, email, token, seOutputFieldId, seOutputFieldName };
}

export async function loadBrdParent(parentKey: string, config = getJiraConfig()): Promise<BrdParentContext> {
  const seOutputFieldId = await resolveSeOutputFieldId(config);
  const parent = await fetchJiraIssue(parentKey, 'summary,status,priority,subtasks', config);
  const childKeys = (parent.fields?.subtasks || []).map((subtask) => subtask.key);
  const childFields = `summary,status,priority,description,${seOutputFieldId}`;
  const children = await Promise.all(childKeys.map((key) => fetchJiraIssue(key, childFields, config)));

  return {
    key: parent.key,
    summary: parent.fields?.summary || parent.key,
    status: parent.fields?.status?.name,
    subtasks: children.map((child) => ({
      key: child.key,
      summary: child.fields?.summary || child.key,
      status: child.fields?.status?.name,
      priority: child.fields?.priority?.name,
      description: child.fields?.description,
      descriptionText: adfToPlainText(child.fields?.description),
      seOutputField: child.fields?.[seOutputFieldId],
      seOutputText: jiraFieldValueToPlainText(child.fields?.[seOutputFieldId]),
    })),
  };
}

export function ensureRowsBelongToParent(parent: BrdParentContext, rows: BrdUpdateInputRow[]): void {
  const allowedKeys = new Set(parent.subtasks.map((subtask) => subtask.key));
  const rejected = rows.filter((row) => !allowedKeys.has(row.jiraKey));
  if (rejected.length > 0) {
    throw new Error(`Rejected Jira keys outside ${parent.key}: ${rejected.map((row) => row.jiraKey).join(', ')}`);
  }
}

export function previewSeOutputUpdates(parent: BrdParentContext, rows: BrdUpdateInputRow[]): BrdUpdatePreview[] {
  ensureRowsBelongToParent(parent, rows);
  const subtaskByKey = new Map(parent.subtasks.map((subtask) => [subtask.key, subtask]));

  return rows.map((row) => {
    const subtask = subtaskByKey.get(row.jiraKey);
    return {
      jiraKey: row.jiraKey,
      summary: subtask?.summary || row.jiraKey,
      beforeText: subtask?.seOutputText || '',
      afterText: row.finalText,
      finalText: row.finalText,
    };
  });
}

export async function applySeOutputUpdates(
  parent: BrdParentContext,
  rows: BrdUpdateInputRow[],
  config = getJiraConfig()
): Promise<BrdUpdatePreview[]> {
  const previews = previewSeOutputUpdates(parent, rows);
  const seOutputFieldId = await resolveSeOutputFieldId(config);

  for (const row of rows) {
    await updateJiraField(row.jiraKey, seOutputFieldId, row.finalText, config);
  }

  return previews;
}

export async function applyBrdTableUpdates(
  parent: BrdParentContext,
  rows: BrdTableUpdateInputRow[],
  config = getJiraConfig()
): Promise<BrdUpdatePreview[]> {
  const previews = previewSeOutputUpdates(parent, rows);
  const subtaskByKey = new Map(parent.subtasks.map((subtask) => [subtask.key, subtask]));
  ensureRowsBelongToParent(parent, rows);

  for (const row of rows) {
    await updateJiraField(row.jiraKey, SE_SCOPING_OUTPUT_FIELD_ID, row.finalText, config);
    const currentStatus = subtaskByKey.get(row.jiraKey)?.status?.toLowerCase();
    const transitionId = await transitionIdForAction(row.jiraKey, row.statusAction, currentStatus, config);
    if (transitionId) {
      await transitionJiraIssue(row.jiraKey, transitionId, config);
    }
  }

  return previews.map((preview, index) => ({
    ...preview,
    statusAction: rows[index]?.statusAction || 'unchanged',
  }));
}

export async function validateJiraConfig(config: JiraConfig): Promise<void> {
  const myselfUrl = `${config.baseUrl.replace(/\/$/, '')}/rest/api/3/myself`;
  const response = await fetch(myselfUrl, {
    headers: jiraHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`Jira credential validation failed: ${response.status} ${response.statusText}`);
  }

  await resolveSeOutputFieldId(config);
}

async function resolveSeOutputFieldId(_config: JiraConfig): Promise<string> {
  return SE_SCOPING_OUTPUT_FIELD_ID;
}

async function fetchJiraIssue(issueKey: string, fields: string, config: JiraConfig): Promise<JiraIssueResponse> {
  const issueUrl = `${config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${issueKey}?fields=${encodeURIComponent(fields)}`;
  const response = await fetch(issueUrl, {
    headers: jiraHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`Jira lookup failed for ${issueKey}: ${response.status} ${response.statusText}`);
  }

  return await response.json() as JiraIssueResponse;
}

async function updateJiraField(issueKey: string, fieldId: string, value: string, config: JiraConfig): Promise<void> {
  const issueUrl = `${config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${issueKey}`;
  const response = await fetch(issueUrl, {
    method: 'PUT',
    headers: {
      ...jiraHeaders(config),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: { [fieldId]: plainTextToAdf(value) } }),
  });

  if (!response.ok) {
    throw new Error(`Jira update failed for ${issueKey}: ${response.status} ${response.statusText}${await readJiraErrorDetail(response)}`);
  }
}

async function transitionJiraIssue(issueKey: string, transitionId: string, config: JiraConfig): Promise<void> {
  const transitionUrl = `${config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${issueKey}/transitions`;
  const response = await fetch(transitionUrl, {
    method: 'POST',
    headers: {
      ...jiraHeaders(config),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transition: { id: transitionId } }),
  });

  if (!response.ok) {
    throw new Error(`Jira transition failed for ${issueKey}: ${response.status} ${response.statusText}${await readJiraErrorDetail(response)}`);
  }
}

async function transitionIdForAction(
  issueKey: string,
  action: BrdTableUpdateInputRow['statusAction'],
  currentStatus: string | undefined,
  config: JiraConfig
): Promise<string | undefined> {
  if (!action || action === 'unchanged') return undefined;
  if (action === 'done' && currentStatus === 'done') return undefined;
  if (action === 'canceled' && (currentStatus === 'canceled' || currentStatus === 'cancelled')) return undefined;

  const transitions = await fetchJiraTransitions(issueKey, config);
  const targetNames = action === 'done' ? ['done'] : ['canceled', 'cancelled'];
  const transition = transitions.find((item) => {
    const name = item.name.toLowerCase();
    const toName = item.to?.name?.toLowerCase();
    return targetNames.includes(name) || (toName ? targetNames.includes(toName) : false);
  });

  if (!transition) {
    throw new Error(`Jira transition failed for ${issueKey}: no ${action} transition is available from ${currentStatus || 'current status'}.`);
  }

  return transition.id;
}

async function fetchJiraTransitions(issueKey: string, config: JiraConfig): Promise<JiraTransition[]> {
  const transitionUrl = `${config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${issueKey}/transitions`;
  const response = await fetch(transitionUrl, {
    headers: jiraHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`Jira transition lookup failed for ${issueKey}: ${response.status} ${response.statusText}${await readJiraErrorDetail(response)}`);
  }

  const data = await response.json() as { transitions?: JiraTransition[] };
  return data.transitions || [];
}

function plainTextToAdf(value: string): unknown {
  const content = value
    .split(/\n{2,}/)
    .map((paragraphText) => {
      const text = paragraphText.trim();
      return text
        ? { type: 'paragraph', content: [{ type: 'text', text }] }
        : { type: 'paragraph' };
    });

  return {
    type: 'doc',
    version: 1,
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}

async function readJiraErrorDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return '';
  return ` - ${text.slice(0, 500)}`;
}

function jiraFieldValueToPlainText(value: unknown): string {
  if (typeof value === 'string') return value;
  return adfToPlainText(value);
}

function jiraHeaders(config: JiraConfig): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${config.email}:${config.token}`).toString('base64')}`,
    Accept: 'application/json',
  };
}
