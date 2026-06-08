# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install               # Install all dependencies
pnpm dev                   # Start all dev services (web + API + agent)
pnpm build                 # Build all packages and apps
pnpm build:packages        # Build shared packages only (contracts, shared, db, crawler-core, wiki-core)
pnpm typecheck             # TypeScript type check across all packages
pnpm lint                  # ESLint
pnpm test                  # Run all tests (vitest)
pnpm db:init               # Initialize SQLite database (create tables + seed tools)
pnpm db:generate           # Generate Drizzle migrations
pnpm db:migrate            # Apply Drizzle migrations
pnpm web:dev               # Web frontend only (http://localhost:3000)
pnpm api:dev               # REST API only (http://localhost:8000)
pnpm agent:dev             # LangGraph agent only (http://localhost:2024)

# Run a specific package's command
pnpm --filter @feedmind/web dev
pnpm --filter @feedmind/api build
```

## Architecture

Monorepo (pnpm workspaces). Three apps, five shared packages.

```
apps/
  web/        Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui + assistant-ui
  api/        Hono REST API (Wiki, crawler, model management)
  agent/      LangChain.js + LangGraph Agent service (LangGraph CLI)
packages/
  contracts/  Zod schemas + shared TypeScript types (single source of truth for API shapes)
  db/         Drizzle ORM schema definitions + SQLite init
  shared/     Crypto (AES encrypt/decrypt for API keys), env vars, helpers
  wiki-core/  Wiki file-system operations (file blocks, frontmatter, wikilinks, graph)
  crawler-core/ Multi-platform content crawler engine (xhs, douyin, bilibili, etc.)
data/
  wiki/       Wiki spaces as markdown files (runtime data, not in repo)
```

## Key Architecture Decisions

- **File-based Wiki**: Wiki pages are stored as plain Markdown files on disk, not in the database. Each Wiki "space" is a directory under `data/wiki/`. Pages use YAML frontmatter for metadata. The db only stores chat/crawler data.
- **Language**: All user-facing UI text and wiki content is in Chinese.
- **Wiki import pipeline** (`ingest-pipeline.ts`): Two-stage LLM pipeline — stage 1 analyzes source content into structured data (entities, concepts, arguments), stage 2 generates wiki page FILE blocks. The LLM client is resolved from `runtime_config` table at runtime.
- **Runtime Config** (`runtime_config` table): Stores per-scenario LLM config (temperature, max_tokens, system_prompt, etc.) for "session" (chat) and "wiki" (ingest) scenarios. Session scenario always syncs with the selected model from the `llm` table; wiki scenario has its own model selection.
- **Agent thread**: LangGraph SDK powers the chat agent. Messages are persisted to SQLite via the API (not LangGraph's native persistence).
- **Crawler**: Playwright-based, uses cookie authentication, stores results in SQLite.

## API Routes (Hono)

All routes under `/api/v1`:
- `health` — health check
- `llms` — CRUD + select LLM models
- `runtime-configs` — read/update per-scenario runtime config
- `chats` — chat session CRUD
- `tools` — tool config CRUD (web search, web fetch)
- `wiki/*` — wiki spaces, pages, sources, ingest, graph, review, lint
- `crawler/*` — crawl tasks and results

Pattern: Each route file defines a Hono router; routes are mounted in `routes/v1/index.ts`. Services live in `modules/<name>/`. Zod schemas from `@feedmind/contracts` validate request bodies.

## Model Config Pattern

LLM providers are stored in the `llm` table (supports any OpenAI-compatible API). Users add models via the settings modal. One model can be "selected" (`is_selected = true`) for chat usage. The wiki ingest model is stored separately via `runtime_config` with `scenario = 'wiki'`.

When adding a new scenario that needs LLM access, add a row to `runtime_config` and use `getScenarioRuntime(scenario)` from `config-service.ts` to resolve credentials.

## Web App Notes

- Uses TanStack Start (Vite-based), NOT the pages router. Routes in `src/routes/`.
- Uses TanStack Query for server state management. Hooks in `lib/hooks/`, API clients in `lib/api/`.
- Components in `components/` with subdirectories by domain (chat, wiki, settings, etc.).
- The chat page model selector persists to both localStorage and the server (`llm.is_selected`).
- `ProviderIcon` renders LLM provider logos via `@lobehub/icons`.
