export type OutputFormat = 'raw' | 'json' | 'pretty';

export interface Message {
  type?: string;
  role?: string;
  content: string | ContentItem[];
  id?: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ContentItem {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
}

export interface ToolCall {
  id?: string;
  type?: string;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface TokenUsage {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

export interface Costs {
  prompt_cost: number | null;
  completion_cost: number | null;
  total_cost: number | null;
}

export interface RunMetadata {
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_ms: number | null;
  custom_metadata: Record<string, unknown>;
  token_usage: TokenUsage;
  costs: Costs;
  first_token_time: string | null;
  feedback_stats: Record<string, number>;
}

export interface Feedback {
  id: string | null;
  key: string | null;
  score: number | null;
  value: unknown;
  comment: string | null;
  correction: unknown;
  created_at: string | null;
}

export interface TraceData {
  trace_id: string;
  messages: Message[];
  metadata?: RunMetadata;
  feedback?: Feedback[];
}

export interface ThreadData {
  thread_id: string;
  messages: Message[];
  metadata?: RunMetadata;
  feedback?: Feedback[];
}

export interface RawRun {
  id: string;
  name?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  extra?: {
    metadata?: Record<string, unknown>;
  };
  inputs?: Record<string, unknown>;
  outputs?: {
    messages?: Message[];
  };
  messages?: Message[];
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cost?: number;
  completion_cost?: number;
  total_cost?: number;
  first_token_time?: string;
  feedback_stats?: Record<string, number>;
  session_id?: string;
}

export interface RunsQueryResponse {
  runs: RawRun[];
}

export interface RunQueryBody {
  session: string[];
  is_root: boolean;
  start_time?: string;
}

export interface ThreadPreviewResponse {
  previews: {
    all_messages: string;
  };
}

export interface LangSmithConfig {
  'api-key'?: string;
  'base-url'?: string;
  'project-uuid'?: string;
  'project-name'?: string;
  'default-format'?: OutputFormat;
}

export class LangSmithError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LangSmithError';
  }
}

export class ConfigError extends LangSmithError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class ApiError extends LangSmithError {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(message: string, statusCode: number, responseBody = '') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}
