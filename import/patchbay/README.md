# Patchbay

A lightweight control plane for AI-assisted software development.

> A central dashboard that coordinates existing tools like Cursor, Claude Code, Codex, Bash, and HTTP runners as managed workers via CLI or standardized adapters.

## The Problem

Many developers work in parallel with Cursor, Claude Code, Codex, terminals, and other AI tools. The problem isn't the quality of these tools — it's that **context gets lost**, tasks are scattered across chat windows and terminals, decisions go undocumented, and it's unclear which tool changed what.

## What is Patchbay?

Patchbay is **not** a new IDE or coding agent. It's a **command center** that sits on top of your existing tools and provides:

- **Structured task management** — tasks, runs, decisions, and artifacts in a single place
- **Runner dispatch** — send tasks to Bash, HTTP, Cursor, Cursor CLI, Claude Code, Codex, or Gemini runners from one dashboard
- **Run history** — every execution is logged with status, output, diffs, and blockers
- **Decision log** — document and track technical decisions with rationale and approvals
- **File-based state** — everything lives in `.project-agents/` inside your repo, git-versioned and transparent

**Target audience:** solo developers, small teams, OSS maintainers, side projects.

## Principles

| Principle | What it means |
|-----------|--------------|
| **Dashboard-first** | The dashboard is the control center, not decoration |
| **Repo-first** | State lives in `.project-agents/`, git-versioned, no cloud required |
| **CLI-first** | CLI as the robust, loggable integration layer |
| **Tool-agnostic** | No lock-in — Bash, Cursor, Claude Code, HTTP, or custom runners |

## Architecture

Patchbay is a monorepo with four package groups:

```
patchbay/
├── schema/                        # JSON Schema definitions for .project-agents/
├── docs/                          # Developer documentation
│   └── custom-connector.md        #   How to build a custom Connector
├── packages/
│   ├── core/                      # Orchestrator, Store, Runner + Connector interfaces, Types
│   ├── cli/                       # CLI tool (patchbay init, task, run, status, serve)
│   ├── dashboard/                 # Next.js web dashboard
│   ├── server/                    # Standalone HTTP server (@patchbay/server)
│   └── runners/                   # Runner adapters + Connectors
│       ├── bash/                  #   Shell command execution (batch)
│       ├── http/                  #   HTTP/API requests (batch) + HttpConnector (OpenAI-compatible)
│       ├── cursor/                #   Cursor file-based (manual handoff)
│       ├── cursor-cli/            #   Batch runner + CursorAcpConnector (ACP JSON-RPC)
│       ├── claude-code/           #   Batch runner + ClaudeCodeConnector (stream-json)
│       ├── codex/                 #   Batch runner + CodexConnector (app-server JSON-RPC)
│       └── gemini/                #   Batch runner + GeminiConnector (headless/JSON)
└── package.json                   # npm workspaces root
```

### Core Concepts

**`.project-agents/` directory** — the shared contract between Patchbay, its runners, and any client (like Wintermute):

```
.project-agents/
├── project.yml                    # Project name, goal, rules, tech stack
├── agents/                        # Runner/agent profiles (YAML)
├── tasks/                         # Task definitions (Markdown with YAML frontmatter)
├── runs/                          # Execution logs (JSON)
├── decisions/                     # Technical decisions (JSON)
└── context/                       # Shared context files for agents
```

**Task lifecycle:**
`open` → `in_progress` → `review` → `done` (or `blocked` / `awaiting_input` at any point)

**Run lifecycle:**
`running` → `completed` | `failed` | `cancelled`

### Packages

**`@patchbay/core`** — the orchestration engine:
- `Store` — file-based state management with AJV schema validation
- `Orchestrator` — task state transitions, runner dispatch, connector sessions, result collection
- `Runner` interface — minimal contract (`execute(input) → output`) for batch runners
- `AgentConnector` interface — event-based, session-oriented contract (`connect(input) → AgentSession`) for live streaming interaction
- `ConnectorRegistry` — dynamic registration and lookup of connectors
- `BaseSession` / `BaseConnector` — shared lifecycle logic for connector implementations

**`@patchbay/cli`** — command-line interface:
- `patchbay init` — project setup (interactive or `--yes` for non-interactive), creates `.project-agents/` structure
- `patchbay task create|list|status` — task management
- `patchbay run <taskId> <runnerId>` — dispatch a task to a runner
- `patchbay reply <conversationId> <message>` — continue a multi-turn runner conversation
- `patchbay auth set|list|clear` — manage runner authentication (API keys or subscription mode)
- `patchbay serve [--port 3001] [--repo-root .]` — start standalone HTTP server (all endpoints incl. reply + SSE)

**Dashboard** — Next.js web application:
- Project overview with stats and recent activity
- Inline editing for project goal, rules, and tech stack
- Kanban task board (open → in_progress → review → done)
- Run viewer with expandable logs, blockers, and suggested next steps
- Diff/artifact viewer
- Decision log
- History page — all past runs sorted newest-first with status, runner, and duration
- Interactive dispatch: select a task and runner; returns immediately (HTTP 202) — no waiting for the runner to finish

**Runners (batch):**

| Runner | How it works |
|--------|-------------|
| **Bash** | Executes shell commands, captures stdout/stderr |
| **HTTP** | Makes HTTP requests, returns response body |
| **Cursor** | Writes context to `current-focus.md`, returns `blocked` (manual handoff) |
| **Cursor CLI** | Returns immediate error — `cursor agent -p` is interactive only; use `cursor` (file-based) or `claude-code` runner instead |
| **Claude Code** | Runs `claude -p <prompt>` with project context |
| **Codex** | Runs `codex exec <prompt>` with project context |
| **Gemini** | Runs `gemini -p <prompt>` with project context |

**Connectors (streaming):**

| Connector | Protocol | Capabilities |
|-----------|----------|-------------|
| **ClaudeCodeConnector** | CLI `--input/output-format stream-json` (NDJSON) | Streaming, Permissions, Multi-Turn, Tool Use |
| **CodexConnector** | `codex app-server` (JSON-RPC over stdio) | Streaming, Permissions, Multi-Turn, Tool Use |
| **GeminiConnector** | Headless mode (`--json`, stdin) | Streaming, Multi-Turn, Tool Use |
| **HttpConnector** | OpenAI-compatible `POST /chat/completions` (SSE) | Streaming, Multi-Turn |
| **AcpConnector** | [Agent Client Protocol](https://agentclientprotocol.com) (JSON-RPC/stdio) | Streaming, Permissions, Multi-Turn, Tool Use |

See [docs/custom-connector.md](docs/custom-connector.md) for how to build your own connector.

### API

The dashboard exposes REST endpoints (Next.js API routes):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/state` | GET | Full project state (project, tasks, runs, decisions) |
| `/api/tasks` | POST | Create a new task |
| `/api/tasks` | PATCH | Update task status |
| `/api/runs` | GET | List runs (optional `?taskId=` filter) |
| `/api/runs` | POST | Save a run (for external clients like wntrmte) |
| `/api/dispatch` | POST | Dispatch a task to a runner |
| `/api/agents` | GET | List available runners |
| `/api/decisions` | POST | Create a technical decision |
| `/api/artifacts` | GET | List context files and diff references |
| `/api/events` | GET | SSE stream — real-time change notifications |
| `/api/connectors` | GET | List available streaming connectors with capabilities |
| `/api/connect` | POST | Start a live agent session (returns `sessionId`) |
| `/api/agent-input` | POST | Send input/approve/deny/cancel to an active session |

## Quickstart

### Patchbay Standalone

```bash
# Install dependencies
npm install

# Initialize a project
cd /path/to/your/repo
npx patchbay init

# Start the dashboard
cd packages/dashboard
PATCHBAY_REPO_ROOT=/path/to/your/repo npm run dev
# → http://localhost:3000

# Or use the CLI
npx patchbay task create
npx patchbay run TASK-001 bash
npx patchbay status
```

`npm run dev` currently starts the dashboard in webpack-based dev mode. That is intentional for now because it is more reliable than Turbopack in the embedded Wintermute workflow, especially on Windows.

### Patchbay + Wintermute

1. Initialize Patchbay in your repo:

```bash
cd /path/to/your/repo
npx patchbay init
```

2. Open the same repo in Wintermute.
3. Use Wintermute in offline mode to browse `.project-agents/` tasks, runs, and decisions directly from the editor.
4. Optionally start the Patchbay dashboard for connected mode and live updates:

```bash
cd /path/to/patchbay/packages/dashboard
PATCHBAY_REPO_ROOT=/path/to/your/repo npm run dev
```

5. Dispatch a task from Wintermute via the runner picker. Wintermute opens an integrated terminal and runs:

```bash
patchbay run <taskId> <runnerId>
```

The terminal shows live output. `Ctrl+C` cancels the runner. The dispatch dialog closes immediately — the runner continues in the background.

### Runner Auth

For CLI-based runners, you can configure auth once via `patchbay auth`:

```bash
# API key mode
npx patchbay auth set claude-code --api-key <key>
npx patchbay auth set codex --api-key <key>
npx patchbay auth set gemini --api-key <key>

# Or subscription/login mode where supported
npx patchbay auth set claude-code --subscription

# Inspect configured auth
npx patchbay auth list
```

`--subscription` stores the auth mode for that runner and assumes the underlying CLI already has a valid login context. It does not trigger a browser sign-in flow by itself.

## Companion: Wintermute

Patchbay works standalone with any editor, but has first-class integration with [Wintermute](https://github.com/Auda29/wntrmte) — a minimalist VS Code distribution with a built-in Patchbay client extension.

Patchbay thinks from the outside in (external dashboard). Wintermute thinks from the inside out (native IDE integration). Together they form a coherent abstraction layer:

- **Offline:** Wintermute reads `.project-agents/` directly — no Patchbay backend needed
- **Connected:** Wintermute connects via HTTP/SSE for real-time updates, run submission, and an embedded dashboard webview
- **Agent dispatch:** Wintermute delegates to Patchbay CLI (`patchbay run`) for task execution, with runner picker and live output streaming

## Roadmap

- [x] Phase 1: Schema & data model (`.project-agents/` format, JSON Schemas)
- [x] Phase 2: Orchestrator core (Store, Runner interface, task dispatch)
- [x] Phase 3: Dashboard (Next.js, Kanban board, run viewer, dispatch)
- [x] Phase 4: Runner adapters (Bash, HTTP, Cursor, Cursor CLI, Claude Code)
- [x] Phase 5: Wintermute integration (SSE events, runs API, connected mode)
- [x] Phase 6: Auth system + Codex/Gemini runners + PatchbayRunner (CLI delegation)
- [x] Phase 7a: Non-interactive `patchbay init --yes` for CLI delegation from wntrmte extension
- [x] Phase 7b: Standalone HTTP server (`@patchbay/server`) — all endpoints (GET + write + dispatch + SSE), runner-bootstrap centralized
- [x] Phase C: Test infrastructure — Vitest (31 unit tests: Store, Orchestrator, CLI, BashRunner) + Playwright E2E (11 tests: board + dispatch dialog)
- [x] Phase D: Non-blocking dispatch (`dispatchTaskAsync`, HTTP 202 — dialog closes immediately) + History page
- [x] Phase E: Live runner output streaming — all 5 CLI runners migrated from `exec` to `spawn` with real-time stdout/stderr piping; Wintermute starts Patchbay dashboard in integrated terminal (no separate OS window)
- [x] Phase F: Windows compatibility — `shell: true` in all CLI runner spawns (resolves `ENOENT` for `.cmd` files); 5-minute timeout with `settled`-flag in all CLI runners; URL validation in HTTP runner; hint messages in Bash runner
- [x] Phase G: Runner regression fix — replaced `shell: true` with explicit `.cmd` suffix on Windows (eliminates DEP0190 warnings and prompt word-splitting); cursor-cli returns immediate `status: 'failed'` (no headless CLI mode exists)
- [x] Phase H: Runner install-on-demand — `installHint` in all CLI runners, binary availability check, "Install in Terminal" in DispatchDialog and Wintermute error dialog
- [x] Phase I: Windows runner spawn fix — `shell: true` + stdin piping on Windows (no `.cmd` suffix, cmd.exe resolves automatically); `.yml` task file support in Wintermute FileStore
- [x] Phase J: Multi-turn runner conversations — `awaiting_input` status, `continueConversation()` in Orchestrator, `--resume` session in claude-code runner, `patchbay reply` CLI command, reply UX in Wintermute (InputBox) and Dashboard (DispatchDialog reply mode, "Awaiting Reply" Kanban column), `/api/reply` endpoint
- [x] Post-J: Task IDs as readable slugs (`my-task-abc123`), Codex noise filtering + summary extraction, Codex `--full-auto` flag, DispatchDialog agent sorting + dynamic menu placement
- [x] Phase K: Project import — `patchbay init` auto-detects project name/tech-stack from `package.json`/`pyproject.toml`/`Cargo.toml`/`go.mod`, bootstraps `context/architecture.md` from README and `context/conventions.md` from CI config
- [ ] Phase L: Agent Connector Architecture — live agent interaction with streaming events, permission dialogs, and provider-agnostic connector interface
  - [x] L1: Core types (`AgentConnector`, `AgentSession`, `AgentEvent`, `ConnectorRegistry`, `BaseSession`)
  - [x] L2: Provider connectors (Claude Code, Codex, Gemini, HTTP/OpenAI-compatible) + extensibility docs
  - [x] L3: Orchestrator connector support (`connectAgent`, `sendInput`, `approveSession`, `cancelSession`)
  - [x] L4: Server streaming endpoints (`/connect`, `/agent-events/:id` SSE, `/agent-input/:id`, `/connectors`) + Dashboard API routes
  - [ ] L5: Monorepo consolidation (merge wntrmte + patchbay, shared types from `@patchbay/core`; Wintermute `extension.ts` split into `CliManager` / `AuthService` / `TerminalOrchestrator` is already done)
  - [ ] L6: Dashboard Agent Chat UI (streaming messages, tool use, permissions, inline replies)
  - [ ] L7: Backward compatibility (batch runner fallback, `/agents` enrichment)

See [PLAN.md](PLAN.md) for the detailed technical roadmap.

## License

MIT
