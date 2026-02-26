import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import yaml from 'js-yaml';
import dotenv from 'dotenv';
import { ConfigError, ApiError } from './types.js';
import type { LangSmithConfig } from './types.js';

dotenv.config();

const CONFIG_DIR = join(homedir(), '.langsmith-cli');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');

let projectUuidCache: string | null = null;

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): LangSmithConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return (yaml.load(content) as LangSmithConfig) || {};
  } catch {
    return {};
  }
}

export function saveConfig(cfg: LangSmithConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, yaml.dump(cfg), 'utf-8');
}

function getConfigValue(key: string): string | undefined {
  const cfg = loadConfig();
  const hyphenKey = key.replace(/_/g, '-');
  const underscoreKey = key.replace(/-/g, '_');
  return (
    (cfg[hyphenKey as keyof LangSmithConfig] as string | undefined) ??
    (cfg[underscoreKey as keyof LangSmithConfig] as string | undefined)
  );
}

export function getApiKey(): string {
  const envKey = process.env.LANGSMITH_API_KEY;
  if (envKey) return envKey;

  const configKey = getConfigValue('api-key');
  if (configKey) return configKey;

  throw new ConfigError(
    'LANGSMITH_API_KEY not found in environment or config. ' +
      'Set the LANGSMITH_API_KEY environment variable or store it in ~/.langsmith-cli/config.yaml',
  );
}

export function getBaseUrl(): string {
  return (
    process.env.LANGSMITH_ENDPOINT ||
    getConfigValue('base-url') ||
    'https://api.smith.langchain.com'
  );
}

export function getDefaultFormat(): 'raw' | 'json' | 'pretty' {
  const fmt = getConfigValue('default-format');
  if (fmt === 'raw' || fmt === 'json' || fmt === 'pretty') return fmt;
  return 'pretty';
}

async function lookupProjectUuidByName(
  projectName: string,
  baseUrl: string,
  apiKey: string,
): Promise<string> {
  const url = `${baseUrl}/sessions?name=${encodeURIComponent(projectName)}`;
  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(
      `Failed to look up project "${projectName}": ${response.status}`,
      response.status,
      body,
    );
  }

  const data = (await response.json()) as Array<{ id: string; name: string }>;
  if (!data || data.length === 0) {
    throw new ConfigError(`Project "${projectName}" not found`);
  }
  return data[0].id;
}

export async function getProjectUuid(): Promise<string | undefined> {
  // 1. Explicit env var
  const envUuid = process.env.LANGSMITH_PROJECT_UUID;
  if (envUuid) return envUuid;

  // 2. Project name env var → lookup
  const envProject = process.env.LANGSMITH_PROJECT;
  if (envProject) {
    if (projectUuidCache) return projectUuidCache;
    const apiKey = getApiKey();
    const baseUrl = getBaseUrl();
    const uuid = await lookupProjectUuidByName(envProject, baseUrl, apiKey);
    projectUuidCache = uuid;
    return uuid;
  }

  // 3. Config file
  return getConfigValue('project-uuid');
}

export function showConfig(): void {
  const cfg = loadConfig();
  const hasConfig = Object.keys(cfg).length > 0;

  if (!hasConfig) {
    console.log('No configuration found');
    console.log(`Config file location: ${CONFIG_FILE}`);
    return;
  }

  console.log('Current configuration:');
  console.log(`Location: ${CONFIG_FILE}\n`);

  for (const [key, value] of Object.entries(cfg)) {
    let display = String(value);
    if (key === 'api-key' || key === 'api_key') {
      display = display.length > 10 ? display.slice(0, 10) + '...' : '(not set)';
    }
    console.log(`  ${key}: ${display}`);
  }
}
