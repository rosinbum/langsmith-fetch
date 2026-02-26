import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs and yaml before importing config
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('js-yaml', () => ({
  default: {
    load: vi.fn(),
    dump: vi.fn().mockReturnValue(''),
  },
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';
import {
  loadConfig,
  getApiKey,
  getBaseUrl,
  getDefaultFormat,
} from './config.js';
import { ConfigError } from './types.js';

describe('config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env
    delete process.env.LANGSMITH_API_KEY;
    delete process.env.LANGSMITH_ENDPOINT;
    delete process.env.LANGSMITH_PROJECT_UUID;
    delete process.env.LANGSMITH_PROJECT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('loadConfig', () => {
    it('returns empty object when config file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(loadConfig()).toEqual({});
    });

    it('returns parsed config when file exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('api-key: test123');
      vi.mocked(yaml.load).mockReturnValue({ 'api-key': 'test123' });
      expect(loadConfig()).toEqual({ 'api-key': 'test123' });
    });

    it('returns empty object on parse error', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('read error');
      });
      expect(loadConfig()).toEqual({});
    });
  });

  describe('getApiKey', () => {
    it('returns env var when set', () => {
      process.env.LANGSMITH_API_KEY = 'env-key';
      expect(getApiKey()).toBe('env-key');
    });

    it('falls back to config file', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('');
      vi.mocked(yaml.load).mockReturnValue({ 'api-key': 'config-key' });
      expect(getApiKey()).toBe('config-key');
    });

    it('throws ConfigError when no key found', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(() => getApiKey()).toThrow(ConfigError);
    });
  });

  describe('getBaseUrl', () => {
    it('returns env var when set', () => {
      process.env.LANGSMITH_ENDPOINT = 'https://custom.api.com';
      expect(getBaseUrl()).toBe('https://custom.api.com');
    });

    it('returns default when nothing set', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(getBaseUrl()).toBe('https://api.smith.langchain.com');
    });
  });

  describe('getDefaultFormat', () => {
    it('returns config value when valid', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('');
      vi.mocked(yaml.load).mockReturnValue({ 'default-format': 'json' });
      expect(getDefaultFormat()).toBe('json');
    });

    it('defaults to pretty', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(getDefaultFormat()).toBe('pretty');
    });
  });
});
