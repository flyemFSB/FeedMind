<div align="center">
  <img src="./apps/web/public/FeedMind-logo-text.png" alt="FeedMind" width="360" />
  <p><strong>Local-first AI conversation & knowledge management platform with multi-platform content crawling.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen" alt="Node" />
    <img src="https://img.shields.io/badge/pnpm-%3E%3D11.0.0-orange" alt="pnpm" />
    <img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  </p>
  <p>
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#project-structure">Structure</a> •
    <a href="#api-overview">API</a>
  </p>
</div>

---

## 👋 Overview

FeedMind is a **monorepo** application that brings together AI chat, a file-based Wiki knowledge base, and multi-platform content crawling into one unified workflow — all running locally on your machine.

```
Information Collection (Crawler) → AI Research (Chat) → Knowledge Base (Wiki)
```

The platform completes a closed-loop workflow: collect content from the web, discuss and analyze it with AI, and organize findings into a durable Wiki knowledge base.

---

## ✨ Features <a name="features"></a>

<details open>
<summary><strong>🤖 AI Chat</strong></summary>

- **Multi-model support** — OpenAI, Anthropic, DeepSeek, Gemini, Grok, Qwen, and any OpenAI-compatible provider
- **Streaming responses** — Real-time token streaming via LangGraph SDK
- **Tool calling** — Built-in tools: web search, web fetch, Wiki search/read
- **Thread management** — Persistent conversation history with branching and checkpoints
- **Reasoning display** — Native rendering of thinking/reasoning tokens (DeepSeek, etc.)
</details>

<details open>
<summary><strong>📚 Wiki Knowledge Base</strong></summary>

- **File-based storage** — Pages are plain Markdown files with YAML frontmatter, stored on disk — no vendor lock-in, fully git-trackable
- **Spaces** — Multiple independent knowledge bases organized as directories
- **Cross-references** — `[[wikilink]]` syntax with automatic backlink resolution
- **Knowledge graph** — Visual graph with Louvain community detection
- **Search** — Keyword search with CJK bigram support
- **Source management** — Attach URLs or upload files (PDF, DOCX, images) as page sources
- **AI ingest pipeline** — Two-stage LLM pipeline: analyze source → generate structured pages
- **Lint & Review** — Built-in link checker and AI-driven quality review (contradiction detection, duplicate finding, improvement suggestions)
</details>

<details open>
<summary><strong>🔍 Content Crawler</strong></summary>

- **Multi-platform** — 小红书, 抖音, B站, 微博, 知乎, 快手, 贴吧
- **Pluggable architecture** — Template Method pattern; add new platforms via a single class
- **Cookie-based auth** — Task-based crawling with progress tracking
- **Rich results** — Structured content, creator info, engagement metrics persisted to SQLite
</details>

<details open>
<summary><strong>🔐 Privacy & Security</strong></summary>

- **Local-first** — All data stays on your machine (SQLite + filesystem)
- **Encrypted API keys** — Fernet-compatible AES-128-CBC + HMAC-SHA256
- **SSRF-safe proxy** — Proxy utilities prevent server-side request forgery
- **No cloud dependency** — Fully offline-capable
</details>

---

## 🏗️ Architecture <a name="architecture"></a>

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER                                    │
├──────────────────────────────────────────────────────────────────┤
│  apps/web (TanStack Start + React 19 + Tailwind CSS 4)           │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Routes: /chat, /wiki, /                                   │   │
│  │  Components: assistant-ui, shadcn/ui, Wiki components       │   │
│  │  State: TanStack Query + Zustand + localStorage             │   │
│  └────────────────────────────────────────────────────────────┘   │
│         │                                             │            │
│         │ /api/v1/*                                    │ /api/agent/*│
│         ▼                                             ▼            │
├─────────┬──────────────────────────────┬──────────────────────────┤
│  apps/api (Hono)   :8000               │  apps/agent (LangGraph)  │
│  ┌──────────────────────────────┐      │  ┌─────────────────────┐│
│  │  Routes:                     │      │  │  Tools:             ││
│  │  ├─ /health                  │      │  │  ├─ web_search      ││
│  │  ├─ /llms                    │      │  │  ├─ web_fetch       ││
│  │  ├─ /chats                   │      │  │  ├─ wiki_search     ││
│  │  ├─ /tools                   │      │  │  ├─ wiki_read       ││
│  │  ├─ /runtime-configs         │      │  │  └─ ask_clarification││
│  │  ├─ /wiki/*                  │      │  └─────────────────────┘│
│  │  └─ /crawler/*               │      └──────────────────────────┘
│  │                              │
│  │  Modules:                    │
│  │  Service → Repository        │
│  └──────────────┬───────────────┘
│                 │
└─────────────────┼────────────────────────────────────────────────┘
                  │
     ┌────────────┴────────────┐                ┌──────────────────┐
     │  SQLite (libSQL/Turso)  │                │  File System     │
     │  ┌──────────────────┐   │                │  ┌─────────────┐ │
     │  │ chat_sessions    │   │                │  │ data/wiki/  │ │
     │  │ chat_messages    │   │                │  │ ├─ space1/  │ │
     │  │ llm              │   │                │  │ │ ├─ index  │ │
     │  │ runtime_config   │   │                │  │ │ ├─ *.md   │ │
     │  │ tools            │   │                │  │ │ ├─ raw    │ │
     │  │ crawler_tasks    │   │                │  │ └─ space2/ │ │
     │  │ crawler_contents │   │                │  └─────────────┘ │
     │  │ crawler_creators │   │                └──────────────────┘
     │  └──────────────────┘   │
     └─────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [TanStack Start](https://tanstack.com/start) (Vite) + [TanStack Router](https://tanstack.com/router) |
| **UI** | React 19, Tailwind CSS 4, shadcn/ui (base-nova), assistant-ui |
| **State** | TanStack Query, Zustand |
| **Icons** | lucide-react, @lobehub/icons |
| **Backend API** | Hono 4 |
| **Agent Framework** | LangChain.js + LangGraph |
| **ORM** | Drizzle ORM (SQLite) |
| **Database** | libSQL/Turso (embedded SQLite) |
| **Validation** | Zod (contract-first design) |
| **Crawler** | Custom multi-platform engine (Playwright-based) |
| **Search** | Tavily, Exa, AnySearch (cascading fallback) |
| **Web Fetch** | Firecrawl, Mozilla Readability, JSDOM, Turndown |
| **Graph** | graphology + louvain community detection |
| **Encryption** | Fernet (AES-128-CBC + HMAC-SHA256) |
| **Testing** | Vitest |
| **Linting** | ESLint + Prettier |
| **Monorepo** | pnpm workspaces |
| **Runtime** | Node.js ≥ 24 |

### Design Patterns

- **Monorepo** — 3 apps + 5 shared packages, all strict TypeScript
- **Contract-First** — All API schemas defined as Zod objects in `contracts`, shared across frontend and backend
- **Proxy Pattern** — Frontend server routes proxy `/api/v1/*` and `/api/agent/*` to backend services (SSRF-safe)
- **Template Method** — `AbstractCrawler` base class with lifecycle hooks for platform-specific implementations
- **Factory Pattern** — `createCrawler()` factory resolves platform crawlers dynamically
- **Strategy Pattern** — Web search cascade (Tavily → Exa → AnySearch) with graceful fallback
- **Repository/Service Pattern** — API routes are thin; business logic lives in `modules/*/service.ts`
- **Middleware Pattern** — LangGraph middleware for dynamic model runtime resolution
- **Event-Driven** — CustomEvent-based preview panel and agent status broadcasting

---

## 🚀 Getting Started <a name="getting-started"></a>

### Prerequisites

- **Node.js** ≥ 24.0.0
- **pnpm** ≥ 11.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/feedmind.git
cd feedmind

# Copy environment variables
cp .env.example .env
# Edit .env — ENCRYPTION_KEY is required for API key encryption

# Install dependencies
pnpm install

# Build shared packages (contracts, db, shared, crawler-core, wiki-core)
pnpm build:packages

# Initialize SQLite database
pnpm db:init
```

### Development

```bash
# Start all three services in parallel
pnpm dev
```

| Service | URL |
|---------|-----|
| Web Frontend | http://localhost:3000 |
| REST API | http://localhost:8000/api/v1/health |
| LangGraph Agent | http://localhost:2024/docs |

#### Windows

Run `.\start-dev.ps1` — automates install, build packages, DB init, and opens 3 terminal windows.

#### Manual startup

```bash
pnpm web:dev     # TanStack Start dev server
pnpm api:dev     # Hono API server
pnpm agent:dev   # LangGraph agent server
```

---

## 📁 Project Structure <a name="project-structure"></a>

```
feedmind/
├── apps/
│   ├── web/                      # TanStack Start frontend (React 19)
│   │   ├── src/routes/           # Route definitions (/, /chat, /wiki, API proxies)
│   │   ├── components/
│   │   │   ├── app-shell/        # Layout: sidebar, topbar, error boundary
│   │   │   ├── assistant-ui/     # Chat: thread, message, composer, thread-list
│   │   │   ├── chat/             # Preview panel
│   │   │   ├── settings/         # Model, tool, runtime config panels
│   │   │   ├── ui/               # shadcn/ui components (24 primitives)
│   │   │   └── wiki/             # Wiki pages, editor, graph, lint, review
│   │   ├── lib/api/              # API client modules (chats, llms, wiki, tools, etc.)
│   │   ├── lib/hooks/            # TanStack Query hooks
│   │   └── lib/assistant-runtime/ # LangGraph integration provider
│   │
│   ├── api/                      # Hono REST API backend
│   │   ├── src/routes/v1/        # Route groups: health, llms, chats, wiki, crawler, tools, runtime-config
│   │   └── src/modules/          # Business logic services
│   │       ├── wiki/             # Space registry, page store, source store, ingest pipeline, graph, search, lint, review
│   │       ├── crawler/          # Task management, data queries
│   │       ├── llms/             # Model CRUD with encryption
│   │       ├── chats/            # Session persistence
│   │       ├── models/           # Runtime config
│   │       └── tools/            # Tool config CRUD
│   │
│   └── agent/                    # LangGraph AI Agent
│       ├── src/agent.ts          # LangGraph graph definition
│       ├── src/tools/            # Tool implementations (web-search, web-fetch, wiki-search, wiki-read, ask-clarification)
│       ├── src/middlewares/      # Dynamic model runtime injection
│       └── src/prompts/          # System prompt builder
│
├── packages/
│   ├── contracts/                # Zod schemas shared across apps
│   ├── db/                       # Drizzle schema + migrations + init
│   ├── shared/                   # Env config, Fernet encryption, date utils
│   ├── crawler-core/             # Abstract crawler, factory, platform implementations
│   └── wiki-core/                # Wiki filesystem ops, frontmatter, wikilinks, graph, search, lint
│
├── data/
│   ├── feedmind.db               # SQLite database
│   └── wiki/                     # Wiki Markdown files organized by space
│
└── docs/                         # Design documentation & migration notes
```

---

## 🔌 API Overview <a name="api-overview"></a>

All REST endpoints are served at `/api/v1`.

### Health
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Health check |

### LLM Models
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/llms` | List all models |
| `POST` | `/api/v1/llms` | Create a model |
| `PUT` | `/api/v1/llms/selected` | Set selected model |
| `GET` | `/api/v1/llms/selected` | Get selected model ID |
| `PUT` | `/api/v1/llms/:id` | Update model |
| `DELETE` | `/api/v1/llms/:id` | Delete model |

### Chat Sessions
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/chats` | List sessions |
| `GET` | `/api/v1/chats/:id` | Get session with messages |
| `PUT` | `/api/v1/chats/:id` | Save session snapshot |
| `DELETE` | `/api/v1/chats/:id` | Delete session |

### Wiki
| Method | Path | Description |
|--------|------|-------------|
| `GET` / `POST` | `/api/v1/wiki/spaces` | List / create spaces |
| `GET` / `POST` | `/api/v1/wiki/spaces/:id/pages` | List / create pages |
| `GET` / `PUT` / `DELETE` | `/api/v1/wiki/spaces/:id/pages/:pageId` | Read / update / delete |
| `POST` | `/api/v1/wiki/spaces/:id/ingest` | Trigger AI ingest pipeline |
| `POST` | `/api/v1/wiki/spaces/:id/search` | Full-text search |
| `GET` | `/api/v1/wiki/spaces/:id/graph` | Knowledge graph data |
| `POST` | `/api/v1/wiki/spaces/:id/lint` | Run link linter |

### Crawler
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/crawler/platforms` | List supported platforms |
| `POST` | `/api/v1/crawler/tasks` | Create crawl task |
| `GET` | `/api/v1/crawler/tasks` | List tasks (paginated) |
| `GET` | `/api/v1/crawler/contents` | List crawled content |
| `GET` | `/api/v1/crawler/creators` | List crawled creators |

### Tools & Runtime Config
| Method | Path | Description |
|--------|------|-------------|
| `GET` / `PUT` | `/api/v1/tools` | List / update tool configs |
| `GET` / `PUT` | `/api/v1/runtime-configs/:scenario` | Get / update runtime config |

### Agent
The LangGraph agent runs on port `2024` and provides:
- Streaming chat completions via LangGraph SDK
- 5 tools: `web_search`, `web_fetch`, `wiki_search`, `wiki_read`, `ask_clarification`
- Dynamic model resolution at runtime (picks the user's selected model)

---

## 🧩 Packages

| Package | Description |
|---------|-------------|
| `@feedmind/contracts` | Zod validation schemas and TypeScript types shared across all apps |
| `@feedmind/db` | Drizzle ORM schema definitions, SQLite client, migrations, and seed data |
| `@feedmind/shared` | Environment variable loader, date utilities, Fernet encryption |
| `@feedmind/crawler-core` | Abstract crawler base class, factory, and platform-specific implementations |
| `@feedmind/wiki-core` | Wiki filesystem operations, frontmatter parsing, wikilink resolution, graph construction, search, linting |

---

## 📋 Common Commands

```bash
pnpm install            # Install all dependencies
pnpm dev                # Start all dev services (web + api + agent)
pnpm build              # Build all apps and packages
pnpm build:packages     # Build shared packages only
pnpm typecheck          # TypeScript type checking
pnpm lint               # ESLint code linting
pnpm test               # Run tests (Vitest)
pnpm db:init            # Initialize SQLite database
pnpm db:migrate         # Run Drizzle migrations
pnpm web:dev            # Start frontend only
pnpm api:dev            # Start API server only
pnpm agent:dev          # Start LangGraph agent only
```

---

## 🔐 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_KEY` | **Yes** | `feedmind` (dev) | Key for encrypting LLM API keys |
| `OPENAI_API_KEY` | Agent mode | — | OpenAI-compatible API key |
| `ANTHROPIC_API_KEY` | Claude models | — | Anthropic API key |
| `TAVILY_API_KEY` | Web search | — | Tavily search API key |
| `BACKEND_API_URL` | No | `http://localhost:8000` | Backend API URL |
| `AGENT_API_URL` | No | `http://localhost:2024` | Agent service URL |
| `DATABASE_PATH` | No | `./data/feedmind.db` | SQLite database path |
| `APP_ENV` | No | `development` | Environment mode |
| `DISABLE_INGEST_WORKER` | No | `0` | Disable background ingest worker |

> **Important:** In production, set a strong `ENCRYPTION_KEY`. The dev default `"feedmind"` is insecure.

---

## 📄 License

[MIT](./LICENSE)

---

<div align="center">
  <p>
    Built with React, TanStack, Hono, LangChain, and ❤️
  </p>
</div>
