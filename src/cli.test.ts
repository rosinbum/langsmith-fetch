import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('./config.js', () => ({
  getApiKey: vi.fn().mockReturnValue('test-key'),
  getBaseUrl: vi.fn().mockReturnValue('https://api.test.com'),
  getDefaultFormat: vi.fn().mockReturnValue('pretty'),
  getProjectUuid: vi.fn().mockResolvedValue('proj-uuid'),
  showConfig: vi.fn(),
}));

vi.mock('./fetchers.js', () => ({
  fetchTrace: vi.fn(),
  fetchThread: vi.fn(),
  fetchTraces: vi.fn(),
  fetchThreads: vi.fn(),
}));

vi.mock('./formatters.js', () => ({
  formatTrace: vi.fn().mockReturnValue('formatted trace'),
  formatThread: vi.fn().mockReturnValue('formatted thread'),
}));

import { createProgram } from './cli.js';
import { fetchTrace, fetchThread } from './fetchers.js';
import { formatTrace, formatThread } from './formatters.js';

describe('CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  it('creates a program with all commands', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('trace');
    expect(commandNames).toContain('thread');
    expect(commandNames).toContain('traces');
    expect(commandNames).toContain('threads');
    expect(commandNames).toContain('config');
  });

  it('trace command fetches and formats a trace', async () => {
    vi.mocked(fetchTrace).mockResolvedValue({
      trace_id: 'test-id',
      messages: [{ type: 'ai', content: 'hello' }],
    });

    const program = createProgram();
    await program.parseAsync([
      'node',
      'langsmith-fetch',
      'trace',
      'test-id',
      '--format',
      'json',
    ]);

    expect(fetchTrace).toHaveBeenCalledWith('test-id', {
      includeMetadata: undefined,
      includeFeedback: undefined,
    });
    expect(formatTrace).toHaveBeenCalled();
  });

  it('thread command requires project UUID', async () => {
    const { getProjectUuid } = await import('./config.js');
    vi.mocked(getProjectUuid).mockResolvedValue(undefined);

    vi.mocked(fetchThread).mockResolvedValue({
      thread_id: 'thread-1',
      messages: [],
    });

    const program = createProgram();
    await expect(
      program.parseAsync([
        'node',
        'langsmith-fetch',
        'thread',
        'thread-1',
      ]),
    ).rejects.toThrow('process.exit');
  });

  it('thread command works with --project-uuid', async () => {
    vi.mocked(fetchThread).mockResolvedValue({
      thread_id: 'thread-1',
      messages: [{ type: 'ai', content: 'hi' }],
    });

    const program = createProgram();
    await program.parseAsync([
      'node',
      'langsmith-fetch',
      'thread',
      'thread-1',
      '--project-uuid',
      'my-uuid',
      '--format',
      'raw',
    ]);

    expect(fetchThread).toHaveBeenCalledWith('thread-1', 'my-uuid');
    expect(formatThread).toHaveBeenCalled();
  });

  it('config show command calls showConfig', async () => {
    const { showConfig } = await import('./config.js');
    const program = createProgram();
    await program.parseAsync([
      'node',
      'langsmith-fetch',
      'config',
      'show',
    ]);
    expect(showConfig).toHaveBeenCalled();
  });
});
