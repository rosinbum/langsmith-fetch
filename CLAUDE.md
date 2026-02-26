# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript/Node.js port of [langsmith-fetch](https://github.com/langchain-ai/langsmith-fetch) — a CLI tool for fetching traces and threads from LangSmith projects. Intended for humans and code agents to programmatically retrieve LangSmith data for testing and debugging.

## Commands

```bash
pnpm install                              # install dependencies
pnpm build                                # compile TypeScript
pnpm test                                 # run tests (vitest)
pnpm test -- --run src/fetchers.test.ts   # run a single test file
pnpm test -- --coverage                   # run tests with coverage report
pnpm lint                                 # lint with eslint
pnpm lint --fix                           # auto-fix lint issues
pnpm format                               # format with prettier
pnpm format --check                       # check formatting without writing
```

## Architecture

Port of the Python package `langsmith_cli` (src/langsmith_cli/). Mirror the original's module boundaries:

| Python module    | TypeScript equivalent | Responsibility |
|------------------|-----------------------|----------------|
| `cli.py`         | `src/cli.ts`          | Commander command definitions, entry point |
| `config.py`      | `src/config.ts`       | Env vars (`LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, `LANGSMITH_ENDPOINT`), YAML config cache at `~/.langsmith-cli/config.yaml`, project UUID lookup |
| `fetchers.py`    | `src/fetchers.ts`     | LangSmith API calls — fetch trace/thread by ID, bulk fetch with concurrency control |
| `formatters.py`  | `src/formatters.ts`   | Output formatting: JSON, raw (single-line for piping), pretty-printed |

Entry point: `src/index.ts` → CLI binary via `bin` field in package.json.

## CLI Commands

- `trace <id>` — fetch a single trace
- `thread <id>` — fetch a single thread
- `traces [dir]` — bulk fetch recent traces (prefer directory output)
- `threads [dir]` — bulk fetch recent threads (prefer directory output)

Key flags: `--limit`, `--last-n-minutes`, `--since`, `--format {pretty,json,raw}`, `--include-metadata`, `--include-feedback`, `--max-concurrent`

## Key Dependencies

- **commander** — CLI framework (equivalent to Python's click)
- **vitest** — test framework (equivalent to pytest)
- Native `fetch` (Node >=18) for HTTP requests (equivalent to Python's requests)
- **js-yaml** — YAML config parsing (equivalent to pyyaml)
- **dotenv** — env var loading (equivalent to python-dotenv)
- **prettier** — code formatting
- **eslint** — linting

## TypeScript Conventions

- Target Node.js >=18 (native fetch available)
- ESM modules (`"type": "module"` in package.json)
- Strict TypeScript (`strict: true` in tsconfig)
- Format all code with Prettier before committing
- Define explicit interfaces/types for all API responses and domain objects (traces, threads, runs)
- Prefer `unknown` over `any`; narrow types with type guards
- Use `readonly` for data that should not be mutated
- Prefer named exports over default exports
- Handle errors with typed custom error classes, not bare strings
- Use `async`/`await` consistently; never mix with raw `.then()` chains

## Testing

- Tests live alongside source as `*.test.ts` (e.g., `src/fetchers.test.ts`)
- Test coverage is required — maintain high coverage across all modules
- Mock HTTP calls in tests; never make real API requests
- Test both success paths and error/edge cases
