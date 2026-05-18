import { SE_SCOPING_OUTPUT_FIELD_ID, type JiraConfig } from '../brd/jira.js';
import {
  clearJiraCredentialStoreConfig,
  readJiraCredentialStoreConfig,
  saveJiraCredentialStoreConfig,
} from './credentialStore.js';

const DEFAULT_JIRA_BASE_URL = 'https://global-e.atlassian.net';
const SE_OUTPUT_FIELD_NAME = 'SE Scoping Output';

export interface JiraSessionInput {
  email: unknown;
  apiToken: unknown;
  baseUrl?: unknown;
}

export interface JiraConnectionStatus {
  connected: boolean;
  source: 'session' | 'secure-store' | 'env' | 'none';
  baseUrl?: string;
  emailHint?: string;
  hasSeOutputFieldId: boolean;
  seOutputFieldName?: string;
}

let sessionConfig: JiraConfig | undefined;

export function setJiraSession(input: JiraSessionInput): JiraConfig {
  const email = readRequiredString(input.email, 'Jira email');
  const token = readRequiredString(input.apiToken, 'Jira API token');
  const baseUrl = normalizeBaseUrl(readOptionalString(input.baseUrl) || DEFAULT_JIRA_BASE_URL);

  sessionConfig = {
    baseUrl,
    email,
    token,
    seOutputFieldId: SE_SCOPING_OUTPUT_FIELD_ID,
    seOutputFieldName: SE_OUTPUT_FIELD_NAME,
  };
  return sessionConfig;
}

export function clearJiraSession(): void {
  sessionConfig = undefined;
}

export function rememberJiraSession(config: JiraConfig): void {
  saveJiraCredentialStoreConfig(config);
}

export function clearStoredJiraCredentials(): void {
  clearJiraSession();
  clearJiraCredentialStoreConfig();
}

export function getActiveJiraConfig(env: NodeJS.ProcessEnv = process.env): JiraConfig {
  return sessionConfig || readJiraCredentialStoreConfig() || getEnvJiraConfig(env);
}

export function hasActiveJiraConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(sessionConfig || readJiraCredentialStoreConfig() || readEnvJiraConfig(env));
}

export function getJiraConnectionStatus(env: NodeJS.ProcessEnv = process.env): JiraConnectionStatus {
  if (sessionConfig) {
    return statusFromConfig(sessionConfig, 'session');
  }

  const storedConfig = readJiraCredentialStoreConfig();
  if (storedConfig) {
    return statusFromConfig(storedConfig, 'secure-store');
  }

  const envConfig = readEnvJiraConfig(env);
  return envConfig
    ? statusFromConfig(envConfig, 'env')
    : { connected: false, source: 'none', hasSeOutputFieldId: false };
}

function statusFromConfig(config: JiraConfig, source: JiraConnectionStatus['source']): JiraConnectionStatus {
  return {
    connected: true,
    source,
    baseUrl: config.baseUrl,
    emailHint: maskEmail(config.email),
    hasSeOutputFieldId: Boolean(config.seOutputFieldId),
    seOutputFieldName: config.seOutputFieldName || SE_OUTPUT_FIELD_NAME,
  };
}

function getEnvJiraConfig(env: NodeJS.ProcessEnv): JiraConfig {
  const config = readEnvJiraConfig(env);
  if (!config) {
    throw new Error('Missing Jira credentials. Connect Jira in Sweep or set JIRA_EMAIL and JIRA_API_TOKEN locally.');
  }
  return config;
}

function readEnvJiraConfig(env: NodeJS.ProcessEnv): JiraConfig | undefined {
  const email = env.JIRA_EMAIL || env.ATLASSIAN_EMAIL;
  const token = env.JIRA_API_TOKEN || env.ATLASSIAN_KEY;
  if (!email || !token) return undefined;

  return {
    baseUrl: normalizeBaseUrl(env.JIRA_BASE_URL || DEFAULT_JIRA_BASE_URL),
    email,
    token,
    seOutputFieldId: SE_SCOPING_OUTPUT_FIELD_ID,
    seOutputFieldName: SE_OUTPUT_FIELD_NAME,
  };
}

function readRequiredString(value: unknown, label: string): string {
  const text = readOptionalString(value);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return 'configured';
  const visible = name.slice(0, 2);
  return `${visible}${name.length > 2 ? '***' : '*'}@${domain}`;
}
