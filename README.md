# LangSmith Fetch (TypeScript)

TypeScript/Node.js port of [langchain-ai/langsmith-fetch](https://github.com/langchain-ai/langsmith-fetch) — a CLI tool for retrieving threads and traces from LangSmith projects. Designed for both human users and code agents conducting testing and debugging work.

## Installation

```bash
# Run directly with npx (no install needed)
npx langsmith-fetch --help

# Or install globally
npm install -g langsmith-fetch
```

Requires Node.js >= 18.

## Setup

Set your LangSmith API key as an environment variable:

```bash
export LANGSMITH_API_KEY=lsv2_pt_...
```

Optional environment variables:

- `LANGSMITH_PROJECT` — Project name (auto-discovers the UUID)
- `LANGSMITH_PROJECT_UUID` — Project UUID (skips lookup)
- `LANGSMITH_ENDPOINT` — Only needed for self-hosted LangSmith instances

Alternatively, store configuration in `~/.langsmith-cli/config.yaml`:

```yaml
api-key: lsv2_pt_...
project-uuid: 867da8a9-4f31-4ef1-8333-03117ea98f32
default-format: pretty
```

## Commands

LangSmith organizes data into three levels: **Runs** (individual LLM calls), **Traces** (collections of runs), and **Threads** (collections of traces representing conversations).

### Fetch a single trace

```bash
langsmith-fetch trace <trace-id>
langsmith-fetch trace <trace-id> --format json
langsmith-fetch trace <trace-id> --include-metadata
langsmith-fetch trace <trace-id> --include-metadata --include-feedback
langsmith-fetch trace <trace-id> --file output.json
```

### Fetch a single thread

```bash
langsmith-fetch thread <thread-id> --project-uuid <uuid>
langsmith-fetch thread <thread-id> --format json
```

### Bulk fetch traces

```bash
# Save to directory (recommended)
langsmith-fetch traces ./my-traces --project-uuid <uuid> --limit 10

# Print to stdout
langsmith-fetch traces --project-uuid <uuid> --limit 5 --format json

# With time filtering
langsmith-fetch traces ./dir --project-uuid <uuid> --last-n-minutes 60
langsmith-fetch traces ./dir --project-uuid <uuid> --since 2025-12-09T10:00:00Z

# With metadata and custom filenames
langsmith-fetch traces ./dir --project-uuid <uuid> --limit 10 --include-metadata --filename-pattern "trace_{index}.json"
```

### Bulk fetch threads

```bash
# Save to directory (recommended)
langsmith-fetch threads ./my-threads --project-uuid <uuid> --limit 10

# Print to stdout
langsmith-fetch threads --project-uuid <uuid> --limit 5 --format json

# With time filtering
langsmith-fetch threads ./dir --project-uuid <uuid> --last-n-minutes 30
```

### View configuration

```bash
langsmith-fetch config show
```

## Output Formats

| Format | Flag | Description |
|--------|------|-------------|
| Pretty | `--format pretty` | Human-readable with section headers (default) |
| JSON | `--format json` | Pretty-printed JSON |
| Raw | `--format raw` | Compact single-line JSON for piping |

## Common Options

| Option | Description |
|--------|-------------|
| `--format <format>` | Output format: `pretty`, `json`, `raw` |
| `--file <path>` | Save output to file instead of stdout |
| `-n, --limit <n>` | Maximum number of items to fetch |
| `--last-n-minutes <n>` | Only fetch items from the last N minutes |
| `--since <timestamp>` | Only fetch items since ISO timestamp |
| `--project-uuid <uuid>` | LangSmith project UUID |
| `--include-metadata` | Include run metadata (status, timing, tokens, costs) |
| `--include-feedback` | Include feedback data |
| `--no-progress` | Disable progress bar |
| `--max-concurrent <n>` | Maximum concurrent fetches (default: 5) |
| `--filename-pattern <p>` | Custom filename pattern for directory mode |

## Development

```bash
pnpm install          # install dependencies
pnpm build            # compile TypeScript
pnpm test             # run tests (vitest)
pnpm lint             # lint with eslint
pnpm format           # format with prettier
```

## License

MIT
