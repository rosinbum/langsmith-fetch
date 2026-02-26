import pLimit from 'p-limit';
import {
  ApiError,
  type Message,
  type RawRun,
  type RunMetadata,
  type Feedback,
  type TraceData,
  type ThreadData,
  type RunsQueryResponse,
  type ThreadPreviewResponse,
} from './types.js';
import { getApiKey, getBaseUrl } from './config.js';

interface ApiRequestOptions {
  method?: string;
  body?: string;
  params?: Record<string, string>;
}

async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();
  const { method = 'GET', body, params } = options;

  let url = `${baseUrl}${path}`;
  if (params) {
    const search = new URLSearchParams(params);
    url += `?${search.toString()}`;
  }

  const headers: Record<string, string> = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method,
    headers,
    ...(body ? { body } : {}),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new ApiError(
      `API request failed: ${method} ${path} → ${response.status}`,
      response.status,
      responseBody,
    );
  }

  return response.json() as Promise<T>;
}

function extractRunMetadata(run: RawRun): RunMetadata {
  const extra = run.extra || {};
  const customMetadata = extra.metadata || {};

  let durationMs: number | null = null;
  if (run.start_time && run.end_time) {
    try {
      const start = new Date(run.start_time).getTime();
      const end = new Date(run.end_time).getTime();
      durationMs = end - start;
    } catch {
      // ignore parse errors
    }
  }

  return {
    status: run.status ?? null,
    start_time: run.start_time ?? null,
    end_time: run.end_time ?? null,
    duration_ms: durationMs,
    custom_metadata: customMetadata as Record<string, unknown>,
    token_usage: {
      prompt_tokens: run.prompt_tokens ?? null,
      completion_tokens: run.completion_tokens ?? null,
      total_tokens: run.total_tokens ?? null,
    },
    costs: {
      prompt_cost: run.prompt_cost ?? null,
      completion_cost: run.completion_cost ?? null,
      total_cost: run.total_cost ?? null,
    },
    first_token_time: run.first_token_time ?? null,
    feedback_stats: run.feedback_stats ?? {},
  };
}

function hasFeedback(metadata: RunMetadata): boolean {
  const stats = metadata.feedback_stats;
  if (!stats) return false;
  return Object.values(stats).some(
    (v) => typeof v === 'number' && v > 0,
  );
}

export async function fetchFeedback(runId: string): Promise<Feedback[]> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  const url = `${baseUrl}/feedback?run_id=${encodeURIComponent(runId)}`;
  const response = await fetch(url, {
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`Warning: Failed to fetch feedback for run ${runId}: ${response.status}`);
    return [];
  }

  const data = (await response.json()) as Feedback[] | { feedback: Feedback[] };
  if (Array.isArray(data)) return data;
  if ('feedback' in data) return data.feedback;
  return [];
}

export async function fetchTrace(
  traceId: string,
  options?: { includeMetadata?: boolean; includeFeedback?: boolean },
): Promise<TraceData> {
  const includeMetadata = options?.includeMetadata ?? false;
  const includeFeedback = options?.includeFeedback ?? false;

  const run = await apiRequest<RawRun>(
    `/runs/${traceId}`,
    { params: { include_messages: 'true' } },
  );

  const messages: Message[] =
    run.messages || run.outputs?.messages || [];

  const result: TraceData = {
    trace_id: traceId,
    messages,
  };

  if (includeMetadata || includeFeedback) {
    result.metadata = extractRunMetadata(run);

    if (includeFeedback && hasFeedback(result.metadata)) {
      result.feedback = await fetchFeedback(traceId);
    } else {
      result.feedback = [];
    }
  }

  return result;
}

export async function fetchThread(
  threadId: string,
  projectUuid: string,
): Promise<ThreadData> {
  const data = await apiRequest<ThreadPreviewResponse>(
    `/runs/threads/${threadId}`,
    { params: { select: 'all_messages', session_id: projectUuid } },
  );

  const messagesText = data.previews.all_messages;
  const messages: Message[] = [];

  for (const line of messagesText.split('\n\n')) {
    const trimmed = line.trim();
    if (trimmed) {
      try {
        messages.push(JSON.parse(trimmed) as Message);
      } catch {
        // skip unparseable lines
      }
    }
  }

  return {
    thread_id: threadId,
    messages,
  };
}

export interface FetchTracesOptions {
  limit?: number;
  projectUuid?: string;
  lastNMinutes?: number;
  since?: string;
  maxConcurrent?: number;
  showProgress?: boolean;
  includeMetadata?: boolean;
  includeFeedback?: boolean;
  onProgress?: (completed: number, total: number) => void;
}

export async function fetchTraces(opts: FetchTracesOptions): Promise<TraceData[]> {
  const {
    limit = 1,
    projectUuid,
    lastNMinutes,
    since,
    maxConcurrent = 5,
    includeMetadata = false,
    includeFeedback = false,
    onProgress,
  } = opts;

  // Query for root runs
  const body: Record<string, unknown> = {
    is_root: true,
    filter: 'and(eq(is_root, true), neq(status, "pending"))',
    limit,
  };

  if (projectUuid) {
    body.session = [projectUuid];
  }

  if (lastNMinutes != null) {
    const startTime = new Date(Date.now() - lastNMinutes * 60 * 1000);
    body.start_time = startTime.toISOString();
  } else if (since) {
    const cleanSince = since.replace('Z', '+00:00');
    body.start_time = new Date(cleanSince).toISOString();
  }

  const data = await apiRequest<RunsQueryResponse>('/runs/query', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const runs = data.runs || [];
  if (runs.length === 0) return [];

  const concurrencyLimit = pLimit(maxConcurrent);
  let completed = 0;

  const tasks = runs.map((run) =>
    concurrencyLimit(async () => {
      try {
        const trace = await fetchTrace(run.id, {
          includeMetadata,
          includeFeedback,
        });

        // If we have metadata from the query response, merge it in
        if (includeMetadata && !trace.metadata) {
          trace.metadata = extractRunMetadata(run);
        }

        completed++;
        onProgress?.(completed, runs.length);
        return trace;
      } catch (e) {
        console.error(`Warning: Failed to fetch trace ${run.id}: ${e}`);
        completed++;
        onProgress?.(completed, runs.length);
        return null;
      }
    }),
  );

  const results = await Promise.all(tasks);
  return results.filter((r): r is TraceData => r !== null);
}

export interface FetchThreadsOptions {
  projectUuid: string;
  limit?: number;
  lastNMinutes?: number;
  since?: string;
  maxConcurrent?: number;
  showProgress?: boolean;
  onProgress?: (completed: number, total: number) => void;
}

export async function fetchThreads(opts: FetchThreadsOptions): Promise<ThreadData[]> {
  const {
    projectUuid,
    limit = 10,
    lastNMinutes,
    since,
    maxConcurrent = 5,
    onProgress,
  } = opts;

  // Query for root runs to find thread IDs
  const body: Record<string, unknown> = {
    session: [projectUuid],
    is_root: true,
  };

  if (lastNMinutes != null) {
    const startTime = new Date(Date.now() - lastNMinutes * 60 * 1000);
    body.start_time = startTime.toISOString();
  } else if (since) {
    const cleanSince = since.replace('Z', '+00:00');
    body.start_time = new Date(cleanSince).toISOString();
  }

  const data = await apiRequest<RunsQueryResponse>('/runs/query', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const runs = data.runs || [];

  // Extract unique thread_ids maintaining order (most recent first)
  // Check both thread_id and session_id in metadata (LangGraph uses session_id)
  const threadIds = new Map<string, string | undefined>();
  for (const run of runs) {
    const meta = run.extra?.metadata ?? {};
    const threadId = (meta.thread_id ?? meta.session_id) as string | undefined;
    if (threadId && !threadIds.has(threadId)) {
      threadIds.set(threadId, run.start_time);
      if (threadIds.size >= limit) break;
    }
  }

  if (threadIds.size === 0) return [];

  const concurrencyLimit = pLimit(maxConcurrent);
  let completed = 0;
  const total = threadIds.size;

  const tasks = Array.from(threadIds.keys()).map((threadId) =>
    concurrencyLimit(async () => {
      try {
        const thread = await fetchThread(threadId, projectUuid);
        completed++;
        onProgress?.(completed, total);
        return thread;
      } catch (e) {
        console.error(`Warning: Failed to fetch thread ${threadId}: ${e}`);
        completed++;
        onProgress?.(completed, total);
        return null;
      }
    }),
  );

  const results = await Promise.all(tasks);
  return results.filter((r): r is ThreadData => r !== null);
}
