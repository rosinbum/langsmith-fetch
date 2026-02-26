import { describe, it, expect, vi, afterEach } from 'vitest';
import { sanitizeFilename, writeOutput, ensureDir } from './utils.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('sanitizeFilename', () => {
  it('keeps safe characters', () => {
    expect(sanitizeFilename('hello-world_v2.json')).toBe(
      'hello-world_v2.json',
    );
  });

  it('replaces unsafe characters with underscores', () => {
    expect(sanitizeFilename('file name/with:bad*chars')).toBe(
      'file_name_with_bad_chars',
    );
  });

  it('strips leading and trailing dots', () => {
    expect(sanitizeFilename('..hidden..')).toBe('hidden');
  });

  it('truncates to 255 characters', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long).length).toBe(255);
  });

  it('handles empty-ish input', () => {
    expect(sanitizeFilename('...')).toBe('');
  });

  it('handles UUID-based filenames', () => {
    expect(
      sanitizeFilename('3b0b15fe-1e3a-4aef-afa8-48df15879cfe.json'),
    ).toBe('3b0b15fe-1e3a-4aef-afa8-48df15879cfe.json');
  });
});

describe('writeOutput', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes to file when filePath provided', async () => {
    await writeOutput('hello', '/tmp/test.txt');
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/tmp/test.txt',
      'hello',
      'utf-8',
    );
  });

  it('writes to stdout when no filePath', async () => {
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockReturnValue(true);
    await writeOutput('hello');
    expect(spy).toHaveBeenCalledWith('hello');
    spy.mockRestore();
  });
});

describe('ensureDir', () => {
  it('calls mkdir with recursive option', async () => {
    await ensureDir('/tmp/test-dir');
    expect(fs.mkdir).toHaveBeenCalledWith('/tmp/test-dir', {
      recursive: true,
    });
  });
});
