import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SingleBar, Presets } from 'cli-progress';
import * as config from './config.js';
import {
  fetchTrace,
  fetchThread,
  fetchTraces,
  fetchThreads,
} from './fetchers.js';
import { formatTrace, formatThread } from './formatters.js';
import { sanitizeFilename, writeOutput, ensureDir } from './utils.js';
import { ConfigError, ApiError } from './types.js';
import type { OutputFormat } from './types.js';

function handleError(err: unknown): never {
  if (err instanceof ConfigError) {
    console.error(`Configuration error: ${err.message}`);
  } else if (err instanceof ApiError) {
    console.error(
      `API error (${err.statusCode}): ${err.message}`,
    );
    if (err.responseBody) {
      console.error(`Response: ${err.responseBody.slice(0, 500)}`);
    }
  } else if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error(`Error: ${err}`);
  }
  process.exit(1);
}

interface ProgressHandle {
  bar: SingleBar;
  update: (completed: number, total: number) => void;
}

function createProgressBar(total: number): ProgressHandle {
  const bar = new SingleBar(
    {
      format: 'Fetching [{bar}] {percentage}% | {value}/{total}',
      stream: process.stderr,
    },
    Presets.shades_classic,
  );
  bar.start(total, 0);
  return {
    bar,
    update: (completed: number) => bar.update(completed),
  };
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('langsmith-fetch')
    .description(
      'Fetch and display LangSmith threads and traces',
    )
    .version('0.1.1');

  // ── trace ────────────────────────────────────────────────
  program
    .command('trace')
    .argument('<id>', 'LangSmith trace UUID')
    .option(
      '--format <format>',
      'Output format: raw, json, pretty',
    )
    .option('--file <path>', 'Save output to file')
    .option(
      '--include-metadata',
      'Include run metadata (status, timing, tokens, costs)',
    )
    .option(
      '--include-feedback',
      'Include feedback data',
    )
    .description('Fetch messages for a single trace by trace ID')
    .action(
      async (
        id: string,
        opts: {
          format?: string;
          file?: string;
          includeMetadata?: boolean;
          includeFeedback?: boolean;
        },
      ) => {
        try {
          const format = (opts.format ||
            config.getDefaultFormat()) as OutputFormat;
          const trace = await fetchTrace(id, {
            includeMetadata: opts.includeMetadata,
            includeFeedback: opts.includeFeedback,
          });
          const output = formatTrace(trace, format);
          await writeOutput(output + '\n', opts.file);
        } catch (err) {
          handleError(err);
        }
      },
    );

  // ── thread ───────────────────────────────────────────────
  program
    .command('thread')
    .argument('<id>', 'LangGraph thread identifier')
    .option(
      '--project-uuid <uuid>',
      'LangSmith project UUID (overrides config)',
    )
    .option(
      '--format <format>',
      'Output format: raw, json, pretty',
    )
    .option('--file <path>', 'Save output to file')
    .description('Fetch messages for a LangGraph thread by thread_id')
    .action(
      async (
        id: string,
        opts: {
          projectUuid?: string;
          format?: string;
          file?: string;
        },
      ) => {
        try {
          const projectUuid =
            opts.projectUuid || (await config.getProjectUuid());
          if (!projectUuid) {
            console.error(
              'Error: project-uuid required. Pass --project-uuid <uuid> flag or set via config.',
            );
            process.exit(1);
          }

          const format = (opts.format ||
            config.getDefaultFormat()) as OutputFormat;
          const thread = await fetchThread(id, projectUuid);
          const output = formatThread(thread, format);
          await writeOutput(output + '\n', opts.file);
        } catch (err) {
          handleError(err);
        }
      },
    );

  // ── traces ───────────────────────────────────────────────
  program
    .command('traces')
    .argument('[dir]', 'Output directory (directory mode)')
    .option(
      '-n, --limit <n>',
      'Maximum number of traces to fetch',
      '1',
    )
    .option(
      '--last-n-minutes <n>',
      'Only fetch traces from the last N minutes',
    )
    .option(
      '--since <timestamp>',
      'Only fetch traces since ISO timestamp',
    )
    .option(
      '--filename-pattern <pattern>',
      'Filename pattern for directory mode',
      '{trace_id}.json',
    )
    .option(
      '--format <format>',
      'Output format: raw, json, pretty',
    )
    .option('--file <path>', 'Save output to file (stdout mode)')
    .option('--no-progress', 'Disable progress bar')
    .option(
      '--max-concurrent <n>',
      'Maximum concurrent fetches',
      '5',
    )
    .option(
      '--include-metadata',
      'Include run metadata',
    )
    .option(
      '--include-feedback',
      'Include feedback data',
    )
    .option(
      '--project-uuid <uuid>',
      'LangSmith project UUID',
    )
    .description('Fetch recent traces from LangSmith')
    .action(
      async (
        dir: string | undefined,
        opts: {
          limit: string;
          lastNMinutes?: string;
          since?: string;
          filenamePattern: string;
          format?: string;
          file?: string;
          progress: boolean;
          maxConcurrent: string;
          includeMetadata?: boolean;
          includeFeedback?: boolean;
          projectUuid?: string;
        },
      ) => {
        try {
          const limit = parseInt(opts.limit, 10);
          const maxConcurrent = parseInt(opts.maxConcurrent, 10);
          const lastNMinutes = opts.lastNMinutes
            ? parseInt(opts.lastNMinutes, 10)
            : undefined;

          if (lastNMinutes != null && opts.since) {
            console.error(
              'Error: --last-n-minutes and --since are mutually exclusive',
            );
            process.exit(1);
          }

          const projectUuid =
            opts.projectUuid || (await config.getProjectUuid());

          // DIRECTORY MODE
          if (dir) {
            if (isUuid(dir)) {
              console.error(
                `Error: '${dir}' looks like a trace ID, not a directory path.`,
              );
              console.error(
                'To fetch a specific trace by ID, use: langsmith-fetch trace <trace-id>',
              );
              process.exit(1);
            }

            if (opts.format) {
              console.error(
                'Warning: --format ignored in directory mode (files are always JSON)',
              );
            }

            const outputPath = resolve(dir);
            await ensureDir(outputPath);

            console.error(`Fetching up to ${limit} recent trace(s)...`);

            const progressState: { handle: ProgressHandle | null } = { handle: null };

            const traces = await fetchTraces({
              limit,
              projectUuid,
              lastNMinutes,
              since: opts.since,
              maxConcurrent,
              includeMetadata: opts.includeMetadata,
              includeFeedback: opts.includeFeedback,
              onProgress: opts.progress
                ? (completed, total) => {
                    if (!progressState.handle) {
                      progressState.handle = createProgressBar(total);
                    }
                    progressState.handle.update(completed, total);
                  }
                : undefined,
            });

            progressState.handle?.bar.stop();

            if (traces.length === 0) {
              console.error('No traces found.');
              process.exit(1);
            }

            console.error(
              `Found ${traces.length} trace(s). Saving to ${outputPath}/`,
            );

            for (let i = 0; i < traces.length; i++) {
              const trace = traces[i];
              const filename = opts.filenamePattern
                .replace(/\{trace_id[^}]*\}/g, trace.trace_id)
                .replace(/\{index[^}]*\}/g, String(i + 1))
                .replace(/\{idx[^}]*\}/g, String(i + 1));

              let safeFilename = sanitizeFilename(filename);
              if (!safeFilename.endsWith('.json')) {
                safeFilename += '.json';
              }

              const fullPath = resolve(outputPath, safeFilename);
              const data = trace.metadata ? trace : trace.messages;
              writeFileSync(
                fullPath,
                JSON.stringify(data, null, 2),
                'utf-8',
              );

              const msgCount = trace.messages.length;
              const status = trace.metadata?.status || 'unknown';
              const fbCount = trace.feedback?.length || 0;
              let summary = `${msgCount} messages`;
              if (trace.metadata) summary += `, status: ${status}`;
              if (fbCount > 0) summary += `, ${fbCount} feedback`;

              console.error(
                `  Saved ${trace.trace_id} to ${safeFilename} (${summary})`,
              );
            }

            console.error(
              `\nSuccessfully saved ${traces.length} trace(s) to ${outputPath}/`,
            );
          }
          // STDOUT MODE
          else {
            const format = (opts.format ||
              config.getDefaultFormat()) as OutputFormat;

            const progressState: { handle: ProgressHandle | null } = { handle: null };

            const traces = await fetchTraces({
              limit,
              projectUuid,
              lastNMinutes,
              since: opts.since,
              maxConcurrent,
              includeMetadata: opts.includeMetadata,
              includeFeedback: opts.includeFeedback,
              onProgress: opts.progress
                ? (completed, total) => {
                    if (!progressState.handle) {
                      progressState.handle = createProgressBar(total);
                    }
                    progressState.handle.update(completed, total);
                  }
                : undefined,
            });

            progressState.handle?.bar.stop();

            if (traces.length === 0) {
              console.error('No traces found.');
              process.exit(1);
            }

            if (limit === 1 && traces.length === 1) {
              const output = formatTrace(traces[0], format);
              await writeOutput(output + '\n', opts.file);
            } else {
              const outputData = traces.map((t) =>
                t.metadata ? t : t.messages,
              );
              const content =
                format === 'raw'
                  ? JSON.stringify(outputData)
                  : JSON.stringify(outputData, null, 2);
              await writeOutput(content + '\n', opts.file);
            }
          }
        } catch (err) {
          handleError(err);
        }
      },
    );

  // ── threads ──────────────────────────────────────────────
  program
    .command('threads')
    .argument('[dir]', 'Output directory (directory mode)')
    .option(
      '--project-uuid <uuid>',
      'LangSmith project UUID (required)',
    )
    .option(
      '-n, --limit <n>',
      'Maximum number of threads to fetch',
      '1',
    )
    .option(
      '--last-n-minutes <n>',
      'Only fetch threads from the last N minutes',
    )
    .option(
      '--since <timestamp>',
      'Only fetch threads since ISO timestamp',
    )
    .option(
      '--filename-pattern <pattern>',
      'Filename pattern for directory mode',
      '{thread_id}.json',
    )
    .option(
      '--format <format>',
      'Output format: raw, json, pretty',
    )
    .option('--no-progress', 'Disable progress bar')
    .option(
      '--max-concurrent <n>',
      'Maximum concurrent fetches',
      '5',
    )
    .description('Fetch recent threads from LangSmith')
    .action(
      async (
        dir: string | undefined,
        opts: {
          projectUuid?: string;
          limit: string;
          lastNMinutes?: string;
          since?: string;
          filenamePattern: string;
          format?: string;
          progress: boolean;
          maxConcurrent: string;
        },
      ) => {
        try {
          const limit = parseInt(opts.limit, 10);
          const maxConcurrent = parseInt(opts.maxConcurrent, 10);
          const lastNMinutes = opts.lastNMinutes
            ? parseInt(opts.lastNMinutes, 10)
            : undefined;

          if (lastNMinutes != null && opts.since) {
            console.error(
              'Error: --last-n-minutes and --since are mutually exclusive',
            );
            process.exit(1);
          }

          const projectUuid =
            opts.projectUuid || (await config.getProjectUuid());
          if (!projectUuid) {
            console.error(
              'Error: project-uuid required. Pass --project-uuid <uuid> flag or set via config.',
            );
            process.exit(1);
          }

          // DIRECTORY MODE
          if (dir) {
            if (isUuid(dir)) {
              console.error(
                `Error: '${dir}' looks like a UUID, not a directory path.`,
              );
              console.error(
                'To fetch a specific thread by ID, use: langsmith-fetch thread <thread-id>',
              );
              process.exit(1);
            }

            if (opts.format) {
              console.error(
                'Warning: --format ignored in directory mode (files are always JSON)',
              );
            }

            const outputPath = resolve(dir);
            await ensureDir(outputPath);

            console.error(`Fetching up to ${limit} recent thread(s)...`);

            const progressState: { handle: ProgressHandle | null } = { handle: null };

            const threads = await fetchThreads({
              projectUuid,
              limit,
              lastNMinutes,
              since: opts.since,
              maxConcurrent,
              onProgress: opts.progress
                ? (completed, total) => {
                    if (!progressState.handle) {
                      progressState.handle = createProgressBar(total);
                    }
                    progressState.handle.update(completed, total);
                  }
                : undefined,
            });

            progressState.handle?.bar.stop();

            if (threads.length === 0) {
              console.error('No threads found.');
              process.exit(1);
            }

            console.error(
              `Found ${threads.length} thread(s). Saving to ${outputPath}/`,
            );

            for (let i = 0; i < threads.length; i++) {
              const thread = threads[i];
              const filename = opts.filenamePattern
                .replace(/\{thread_id[^}]*\}/g, thread.thread_id)
                .replace(/\{index[^}]*\}/g, String(i + 1))
                .replace(/\{idx[^}]*\}/g, String(i + 1));

              let safeFilename = sanitizeFilename(filename);
              if (!safeFilename.endsWith('.json')) {
                safeFilename += '.json';
              }

              const fullPath = resolve(outputPath, safeFilename);
              writeFileSync(
                fullPath,
                JSON.stringify(thread.messages, null, 2),
                'utf-8',
              );

              console.error(
                `  Saved ${thread.thread_id} to ${safeFilename} (${thread.messages.length} messages)`,
              );
            }

            console.error(
              `\nSuccessfully saved ${threads.length} thread(s) to ${outputPath}/`,
            );
          }
          // STDOUT MODE
          else {
            const format = (opts.format ||
              config.getDefaultFormat()) as OutputFormat;

            const progressState: { handle: ProgressHandle | null } = { handle: null };

            const threads = await fetchThreads({
              projectUuid,
              limit,
              lastNMinutes,
              since: opts.since,
              maxConcurrent,
              onProgress: opts.progress
                ? (completed, total) => {
                    if (!progressState.handle) {
                      progressState.handle = createProgressBar(total);
                    }
                    progressState.handle.update(completed, total);
                  }
                : undefined,
            });

            progressState.handle?.bar.stop();

            if (threads.length === 0) {
              console.error('No threads found.');
              process.exit(1);
            }

            if (limit === 1 && threads.length === 1) {
              const output = formatThread(threads[0], format);
              process.stdout.write(output + '\n');
            } else {
              const outputData = threads.map((t) => ({
                thread_id: t.thread_id,
                messages: t.messages,
              }));
              const content =
                format === 'raw'
                  ? JSON.stringify(outputData)
                  : JSON.stringify(outputData, null, 2);
              process.stdout.write(content + '\n');
            }
          }
        } catch (err) {
          handleError(err);
        }
      },
    );

  // ── config ───────────────────────────────────────────────
  const configCmd = program
    .command('config')
    .description('Manage configuration settings');

  configCmd
    .command('show')
    .description('Show current configuration')
    .action(() => {
      config.showConfig();
    });

  return program;
}
