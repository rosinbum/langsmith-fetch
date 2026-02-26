import { describe, it, expect } from 'vitest';
import { formatTrace, formatThread, formatMessages } from './formatters.js';
import type { TraceData, ThreadData, Message } from './types.js';

describe('formatters', () => {
  const sampleMessages: Message[] = [
    { type: 'human', content: 'Hello' },
    { type: 'ai', content: 'Hi there!' },
  ];

  describe('formatTrace', () => {
    it('formats as raw JSON (compact)', () => {
      const trace: TraceData = {
        trace_id: 'abc',
        messages: sampleMessages,
      };
      const result = formatTrace(trace, 'raw');
      expect(result).toBe(JSON.stringify(sampleMessages));
      expect(result).not.toContain('\n');
    });

    it('formats as pretty-printed JSON', () => {
      const trace: TraceData = {
        trace_id: 'abc',
        messages: sampleMessages,
      };
      const result = formatTrace(trace, 'json');
      expect(result).toBe(JSON.stringify(sampleMessages, null, 2));
      expect(result).toContain('\n');
    });

    it('formats as pretty text', () => {
      const trace: TraceData = {
        trace_id: 'abc',
        messages: sampleMessages,
      };
      const result = formatTrace(trace, 'pretty');
      expect(result).toContain('Message 1: human');
      expect(result).toContain('Hello');
      expect(result).toContain('Message 2: ai');
      expect(result).toContain('Hi there!');
    });

    it('includes metadata when present', () => {
      const trace: TraceData = {
        trace_id: 'abc',
        messages: sampleMessages,
        metadata: {
          status: 'success',
          start_time: '2025-01-01T00:00:00Z',
          end_time: '2025-01-01T00:00:01Z',
          duration_ms: 1000,
          custom_metadata: {},
          token_usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
          costs: {
            prompt_cost: 0.001,
            completion_cost: 0.002,
            total_cost: 0.003,
          },
          first_token_time: null,
          feedback_stats: {},
        },
        feedback: [],
      };

      const raw = formatTrace(trace, 'raw');
      const parsed = JSON.parse(raw);
      expect(parsed.trace_id).toBe('abc');
      expect(parsed.metadata.status).toBe('success');

      const pretty = formatTrace(trace, 'pretty');
      expect(pretty).toContain('RUN METADATA');
      expect(pretty).toContain('Status: success');
      expect(pretty).toContain('Duration: 1000ms');
      expect(pretty).toContain('Total: 30');
    });

    it('includes feedback section when present', () => {
      const trace: TraceData = {
        trace_id: 'abc',
        messages: sampleMessages,
        metadata: {
          status: 'success',
          start_time: null,
          end_time: null,
          duration_ms: null,
          custom_metadata: {},
          token_usage: {
            prompt_tokens: null,
            completion_tokens: null,
            total_tokens: null,
          },
          costs: {
            prompt_cost: null,
            completion_cost: null,
            total_cost: null,
          },
          first_token_time: null,
          feedback_stats: {},
        },
        feedback: [
          {
            id: 'fb-1',
            key: 'correctness',
            score: 1,
            value: 'correct',
            comment: 'Good answer',
            correction: null,
            created_at: '2025-01-01T00:00:00Z',
          },
        ],
      };

      const pretty = formatTrace(trace, 'pretty');
      expect(pretty).toContain('FEEDBACK');
      expect(pretty).toContain('correctness');
      expect(pretty).toContain('Good answer');
    });
  });

  describe('formatThread', () => {
    it('formats thread messages as raw', () => {
      const thread: ThreadData = {
        thread_id: 'th-1',
        messages: sampleMessages,
      };
      const result = formatThread(thread, 'raw');
      expect(result).toBe(JSON.stringify(sampleMessages));
    });
  });

  describe('formatMessages', () => {
    it('handles tool calls in pretty format', () => {
      const msgs: Message[] = [
        {
          type: 'ai',
          content: 'Let me search',
          tool_calls: [
            {
              id: 'tc-1',
              type: 'function',
              function: {
                name: 'search',
                arguments: '{"query": "test"}',
              },
            },
          ],
        },
      ];

      const result = formatMessages(msgs, 'pretty');
      expect(result).toContain('Tool Call: search');
      expect(result).toContain('Arguments:');
    });

    it('handles structured content arrays', () => {
      const msgs: Message[] = [
        {
          type: 'ai',
          content: [
            { type: 'text', text: 'Hello world' },
            { type: 'tool_use', name: 'calculator', input: { x: 1 } },
          ],
        },
      ];

      const result = formatMessages(msgs, 'pretty');
      expect(result).toContain('Hello world');
      expect(result).toContain('Tool Call: calculator');
    });

    it('handles tool response messages', () => {
      const msgs: Message[] = [
        {
          type: 'tool',
          content: '42',
          name: 'calculator',
        },
      ];

      const result = formatMessages(msgs, 'pretty');
      expect(result).toContain('Tool: calculator');
    });
  });
});
