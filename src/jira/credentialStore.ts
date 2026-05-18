import { execFileSync } from 'node:child_process';
import { SE_SCOPING_OUTPUT_FIELD_ID, type JiraConfig } from '../brd/jira.js';

const SERVICE_NAME = 'global-sweep-jira';
const ACCOUNT_NAME = 'jira-credentials';
const SE_OUTPUT_FIELD_NAME = 'SE Scoping Output';

interface StoredJiraCredentials {
  baseUrl: string;
  email: string;
  token: string;
}

export function readJiraCredentialStoreConfig(): JiraConfig | undefined {
  try {
    const raw = readStoredPayload();
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredJiraCredentials>;
    if (!parsed.baseUrl || !parsed.email || !parsed.token) return undefined;

    return {
      baseUrl: parsed.baseUrl,
      email: parsed.email,
      token: parsed.token,
      seOutputFieldId: SE_SCOPING_OUTPUT_FIELD_ID,
      seOutputFieldName: SE_OUTPUT_FIELD_NAME,
    };
  } catch {
    return undefined;
  }
}

export function saveJiraCredentialStoreConfig(config: JiraConfig): void {
  const payload = JSON.stringify({
    baseUrl: config.baseUrl,
    email: config.email,
    token: config.token,
  } satisfies StoredJiraCredentials);

  writeStoredPayload(payload);
}

export function clearJiraCredentialStoreConfig(): void {
  try {
    deleteStoredPayload();
  } catch {
    // The credential may not exist yet.
  }
}

function readStoredPayload(): string | undefined {
  if (process.platform === 'darwin') {
    return execFileSync('security', [
      'find-generic-password',
      '-a',
      ACCOUNT_NAME,
      '-s',
      SERVICE_NAME,
      '-w',
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  }

  if (process.platform === 'win32') {
    const output = runPowerShell(`
      $ErrorActionPreference = 'Stop'
      [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] > $null
      $vault = [Windows.Security.Credentials.PasswordVault]::new()
      try {
        $credential = $vault.Retrieve(${JSON.stringify(SERVICE_NAME)}, ${JSON.stringify(ACCOUNT_NAME)})
        $credential.RetrievePassword()
        [Console]::Out.Write($credential.Password)
      } catch {}
    `);
    return output.trim() || undefined;
  }

  return undefined;
}

function writeStoredPayload(payload: string): void {
  if (process.platform === 'darwin') {
    execFileSync('security', [
      'add-generic-password',
      '-a',
      ACCOUNT_NAME,
      '-s',
      SERVICE_NAME,
      '-w',
      payload,
      '-U',
    ], { stdio: 'ignore' });
    return;
  }

  if (process.platform === 'win32') {
    runPowerShell(`
      $ErrorActionPreference = 'Stop'
      [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] > $null
      $vault = [Windows.Security.Credentials.PasswordVault]::new()
      try {
        $existing = $vault.Retrieve(${JSON.stringify(SERVICE_NAME)}, ${JSON.stringify(ACCOUNT_NAME)})
        $vault.Remove($existing)
      } catch {}
      $payload = [Console]::In.ReadToEnd()
      $credential = [Windows.Security.Credentials.PasswordCredential]::new(${JSON.stringify(SERVICE_NAME)}, ${JSON.stringify(ACCOUNT_NAME)}, $payload)
      $vault.Add($credential)
    `, payload);
    return;
  }

  throw new Error('Persistent Jira credential storage is only supported on macOS and Windows for this local build.');
}

function deleteStoredPayload(): void {
  if (process.platform === 'darwin') {
    execFileSync('security', [
      'delete-generic-password',
      '-a',
      ACCOUNT_NAME,
      '-s',
      SERVICE_NAME,
    ], { stdio: 'ignore' });
    return;
  }

  if (process.platform === 'win32') {
    runPowerShell(`
      $ErrorActionPreference = 'Stop'
      [Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] > $null
      $vault = [Windows.Security.Credentials.PasswordVault]::new()
      try {
        $credential = $vault.Retrieve(${JSON.stringify(SERVICE_NAME)}, ${JSON.stringify(ACCOUNT_NAME)})
        $vault.Remove($credential)
      } catch {}
    `);
  }
}

function runPowerShell(script: string, input?: string): string {
  return execFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ], {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
}
