import { describe, it, expect } from 'vitest';
import {
  LangSmithError,
  ConfigError,
  ApiError,
} from './types.js';

describe('Error classes', () => {
  it('LangSmithError is an instance of Error', () => {
    const err = new LangSmithError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LangSmithError);
    expect(err.name).toBe('LangSmithError');
    expect(err.message).toBe('test');
  });

  it('ConfigError extends LangSmithError', () => {
    const err = new ConfigError('bad config');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LangSmithError);
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.name).toBe('ConfigError');
  });

  it('ApiError extends LangSmithError and has statusCode', () => {
    const err = new ApiError('not found', 404, '{"detail":"not found"}');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LangSmithError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiError');
    expect(err.statusCode).toBe(404);
    expect(err.responseBody).toBe('{"detail":"not found"}');
  });

  it('ApiError defaults responseBody to empty string', () => {
    const err = new ApiError('server error', 500);
    expect(err.responseBody).toBe('');
  });
});
