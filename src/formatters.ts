import chalk from 'chalk';
import type {
  Message,
  OutputFormat,
  TraceData,
  ThreadData,
  RunMetadata,
  Feedback,
} from './types.js';

function formatRaw(data: unknown): string {
  return JSON.stringify(data, null, 0);
}

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatPrettyMessages(messages: Message[]): string {
  const parts: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const msgType = msg.type || msg.role || 'unknown';

    parts.push('='.repeat(60));
    parts.push(`Message ${i + 1}: ${msgType}`);
    parts.push('-'.repeat(60));

    const content = msg.content;
    if (typeof content === 'string') {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const item of content) {
        if (typeof item === 'object' && item !== null) {
          if ('text' in item && item.text) {
            parts.push(item.text as string);
          } else if ('type' in item && item.type === 'tool_use') {
            parts.push(
              `\nTool Call: ${(item as { name?: string }).name || 'unknown'}`,
            );
            if ('input' in item) {
              parts.push(`Input: ${JSON.stringify(item.input, null, 2)}`);
            }
          }
        } else {
          parts.push(String(item));
        }
      }
    } else {
      parts.push(String(content));
    }

    if (msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        if (typeof toolCall === 'object' && toolCall !== null) {
          const func = toolCall.function;
          if (func) {
            parts.push(`\nTool Call: ${func.name || 'unknown'}`);
            if (func.arguments) {
              parts.push(`Arguments: ${func.arguments}`);
            }
          }
        }
      }
    }

    if (msgType === 'tool' || msg.name) {
      parts.push(`Tool: ${msg.name || 'unknown'}`);
    }

    parts.push('');
  }

  return parts.join('\n');
}

function formatMetadataSection(metadata: RunMetadata): string {
  const lines: string[] = [
    '='.repeat(60),
    chalk.bold('RUN METADATA'),
    '='.repeat(60),
  ];

  if (metadata.status) {
    lines.push(`Status: ${metadata.status}`);
  }
  if (metadata.start_time) {
    lines.push(`Start Time: ${metadata.start_time}`);
  }
  if (metadata.end_time) {
    lines.push(`End Time: ${metadata.end_time}`);
  }
  if (metadata.duration_ms != null) {
    lines.push(`Duration: ${metadata.duration_ms}ms`);
  }

  const usage = metadata.token_usage;
  if (usage && Object.values(usage).some((v) => v != null)) {
    lines.push('\nToken Usage:');
    if (usage.prompt_tokens != null) lines.push(`  Prompt: ${usage.prompt_tokens}`);
    if (usage.completion_tokens != null) lines.push(`  Completion: ${usage.completion_tokens}`);
    if (usage.total_tokens != null) lines.push(`  Total: ${usage.total_tokens}`);
  }

  const costs = metadata.costs;
  if (costs && Object.values(costs).some((v) => v != null)) {
    lines.push('\nCosts:');
    if (costs.total_cost != null) lines.push(`  Total: $${costs.total_cost.toFixed(5)}`);
    if (costs.prompt_cost != null) lines.push(`  Prompt: $${costs.prompt_cost.toFixed(5)}`);
    if (costs.completion_cost != null)
      lines.push(`  Completion: $${costs.completion_cost.toFixed(5)}`);
  }

  const custom = metadata.custom_metadata;
  if (custom && Object.keys(custom).length > 0) {
    lines.push('\nCustom Metadata:');
    for (const [key, value] of Object.entries(custom)) {
      if (typeof value === 'object') {
        lines.push(`  ${key}: ${JSON.stringify(value, null, 4)}`);
      } else {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }

  const fbStats = metadata.feedback_stats;
  if (fbStats && Object.keys(fbStats).length > 0) {
    lines.push('\nFeedback Stats:');
    for (const [key, count] of Object.entries(fbStats)) {
      lines.push(`  ${key}: ${count}`);
    }
  }

  return lines.join('\n');
}

function formatFeedbackSection(feedback: Feedback[]): string {
  const lines: string[] = [
    '='.repeat(60),
    chalk.bold('FEEDBACK'),
    '='.repeat(60),
  ];

  for (let i = 0; i < feedback.length; i++) {
    const fb = feedback[i];
    lines.push(`\nFeedback ${i + 1}:`);
    lines.push(`  Key: ${fb.key}`);
    if (fb.score != null) lines.push(`  Score: ${fb.score}`);
    if (fb.value != null) lines.push(`  Value: ${fb.value}`);
    if (fb.comment) lines.push(`  Comment: ${fb.comment}`);
    if (fb.correction) {
      if (typeof fb.correction === 'string') {
        lines.push(`  Correction: ${fb.correction}`);
      } else {
        lines.push(`  Correction: ${JSON.stringify(fb.correction, null, 4)}`);
      }
    }
    if (fb.created_at) lines.push(`  Created: ${fb.created_at}`);
  }

  return lines.join('\n');
}

function formatPrettyWithMetadata(data: TraceData | ThreadData): string {
  const parts: string[] = [];

  if (data.metadata) {
    parts.push(formatMetadataSection(data.metadata));
  }

  if (data.feedback && data.feedback.length > 0) {
    parts.push(formatFeedbackSection(data.feedback));
  }

  if (parts.length > 0) {
    parts.push('='.repeat(60));
    parts.push(chalk.bold('MESSAGES'));
    parts.push('='.repeat(60));
  }

  parts.push(formatPrettyMessages(data.messages));

  return parts.join('\n\n');
}

export function formatTrace(
  trace: TraceData,
  format: OutputFormat,
): string {
  if (format === 'raw') {
    return trace.metadata
      ? formatRaw(trace)
      : formatRaw(trace.messages);
  }
  if (format === 'json') {
    return trace.metadata
      ? formatJson(trace)
      : formatJson(trace.messages);
  }
  // pretty
  return trace.metadata
    ? formatPrettyWithMetadata(trace)
    : formatPrettyMessages(trace.messages);
}

export function formatThread(
  thread: ThreadData,
  format: OutputFormat,
): string {
  if (format === 'raw') {
    return thread.metadata
      ? formatRaw(thread)
      : formatRaw(thread.messages);
  }
  if (format === 'json') {
    return thread.metadata
      ? formatJson(thread)
      : formatJson(thread.messages);
  }
  // pretty
  return thread.metadata
    ? formatPrettyWithMetadata(thread)
    : formatPrettyMessages(thread.messages);
}

export function formatMessages(
  messages: Message[],
  format: OutputFormat,
): string {
  if (format === 'raw') return formatRaw(messages);
  if (format === 'json') return formatJson(messages);
  return formatPrettyMessages(messages);
}
