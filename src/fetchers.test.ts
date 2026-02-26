import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config before importing fetchers
vi.mock('./config.js', () => ({
  getApiKey: vi.fn().mockReturnValue('test-api-key'),
  getBaseUrl: vi.fn().mockReturnValue('https://api.test.com'),
}));

import { fetchTrace, fetchThread, fetchTraces, fetchThreads } from './fetchers.js';
import { ApiError } from './types.js';

describe('fetchers', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchTrace', () => {
    it('fetches a trace and extracts messages', async () => {
      const mockMessages = [
        { type: 'human', content: 'Hello' },
        { type: 'ai', content: 'Hi there' },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: mockMessages }),
      });

      const result = await fetchTrace('trace-123');

      expect(result.trace_id).toBe('trace-123');
      expect(result.messages).toEqual(mockMessages);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/runs/trace-123?include_messages=true',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
          }),
        }),
      );
    });

    it('extracts messages from outputs when top-level messages absent', async () => {
      const mockMessages = [{ type: 'ai', content: 'Response' }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            outputs: { messages: mockMessages },
          }),
      });

      const result = await fetchTrace('trace-456');
      expect(result.messages).toEqual(mockMessages);
    });

    it('throws ApiError on non-2xx response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      });

      await expect(fetchTrace('bad-id')).rejects.toThrow(ApiError);
    });

    it('includes metadata when requested', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            messages: [{ type: 'ai', content: 'Hi' }],
            status: 'success',
            start_time: '2025-01-01T00:00:00Z',
            end_time: '2025-01-01T00:00:01Z',
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          }),
      });

      const result = await fetchTrace('trace-789', {
        includeMetadata: true,
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata!.status).toBe('success');
      expect(result.metadata!.token_usage.total_tokens).toBe(30);
      expect(result.metadata!.duration_ms).toBe(1000);
    });
  });

  describe('fetchThread', () => {
    it('fetches and parses thread messages', async () => {
      const msg1 = JSON.stringify({ type: 'human', content: 'Hello' });
      const msg2 = JSON.stringify({ type: 'ai', content: 'Hi' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            previews: { all_messages: `${msg1}\n\n${msg2}` },
          }),
      });

      const result = await fetchThread('thread-1', 'project-uuid');

      expect(result.thread_id).toBe('thread-1');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe('Hello');
      expect(result.messages[1].content).toBe('Hi');
    });

    it('includes project UUID in query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            previews: { all_messages: '' },
          }),
      });

      await fetchThread('thread-1', 'my-project-uuid');

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('session_id=my-project-uuid');
      expect(calledUrl).toContain('select=all_messages');
    });
  });

  describe('fetchTraces', () => {
    it('fetches multiple traces with concurrency control', async () => {
      // First call: runs query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            runs: [
              { id: 'trace-a', status: 'success' },
              { id: 'trace-b', status: 'success' },
            ],
          }),
      });

      // Second and third calls: individual trace fetches
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ type: 'ai', content: 'A' }],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              messages: [{ type: 'ai', content: 'B' }],
            }),
        });

      const results = await fetchTraces({
        limit: 2,
        projectUuid: 'proj-1',
        maxConcurrent: 2,
      });

      expect(results).toHaveLength(2);
    });

    it('passes time filters to query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ runs: [] }),
      });

      await fetchTraces({
        limit: 1,
        lastNMinutes: 30,
      });

      const body = JSON.parse(
        mockFetch.mock.calls[0][1]?.body as string,
      );
      expect(body.start_time).toBeDefined();
    });

    it('returns empty array when no runs found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ runs: [] }),
      });

      const results = await fetchTraces({ limit: 5 });
      expect(results).toEqual([]);
    });
  });

  describe('fetchThreads', () => {
    it('extracts unique thread_ids from runs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            runs: [
              {
                id: 'run-1',
                extra: { metadata: { thread_id: 'thread-a' } },
                start_time: '2025-01-01',
              },
              {
                id: 'run-2',
                extra: { metadata: { thread_id: 'thread-a' } },
                start_time: '2025-01-01',
              },
              {
                id: 'run-3',
                extra: { metadata: { thread_id: 'thread-b' } },
                start_time: '2025-01-01',
              },
            ],
          }),
      });

      // Thread fetches
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              previews: {
                all_messages: JSON.stringify({ type: 'ai', content: 'A' }),
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              previews: {
                all_messages: JSON.stringify({ type: 'ai', content: 'B' }),
              },
            }),
        });

      const results = await fetchThreads({
        projectUuid: 'proj-1',
        limit: 10,
      });

      expect(results).toHaveLength(2);
    });
  });
});
