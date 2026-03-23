# Wintermute + Patchbay

> An open-source, IDE-native agent orchestration platform.
> Wintermute is the IDE. Patchbay is the app inside it.

---

## What is this?

Most developers working with AI agents today juggle multiple windows: Cursor, Claude.ai, a terminal, and a browser tab. **Wintermute + Patchbay** puts everything in one place.

- **Wintermute** — a minimalist VS Code distribution. The IDE you already know, stripped to essentials, with Patchbay built in.
- **Patchbay** — the agent orchestration app. Task management, live agent interaction, streaming, permission dialogs, run history — all in a web dashboard.

Together: write code on the left, orchestrate AI agents on the right. No app switching. No browser tabs. One window.

---

## How it compares

| | ZenFlow / T3 Code | Cursor | **Wintermute + Patchbay** |
|---|---|---|---|
| Agent interaction | Separate desktop app | Baked-in AI | Dashboard panel in the IDE |
| Model choice | Provider-locked | Provider-locked | Model-agnostic (Claude, Codex, Gemini, local models) |
| Open source | No | No | **Yes** |
| Project state | Cloud | Proprietary | Git-versioned `.project-agents/` in your repo |
| IDE integration | None | Full | Full (VS Code base) |

---

## Architecture

```
┌─────────────────────────────────────────┐
│         Patchbay Dashboard              │  Task management, agent chat,
│  (embedded as webview in Wintermute,    │  streaming, approvals, history
│   or standalone in the browser)         │
├─────────────────────────────────────────┤
│         Patchbay Orchestrator           │  Task state, runner dispatch,
│                                         │  agent connectors, session mgmt
├─────────────────────────────────────────┤
│    Wintermute — Host + Glue Layer       │  Webview panel, terminal relay,
│         (built-in extension)            │  auth, file-based store, setup
├─────────────────────────────────────────┤
│         Wintermute IDE Core             │  VS Code build, patches,
│                                         │  minimal branding
├─────────────────────────────────────────┤
│  Batch Runner:   Bash │ HTTP │ Cursor   │
│  Agent Connector: Claude │ Codex │ ...  │  Streaming, approvals, multi-turn
└─────────────────────────────────────────┘
```

### Two execution models

**Batch Runner** (Bash, HTTP, Cursor) — fire-and-forget. Input in, output out.

**Agent Connector** (Claude Code, Codex, Gemini, HTTP, Cursor ACP) — event-based, session-oriented. Streams messages, handles permissions, accepts replies in a live session. Provider-agnostic: each connector maps the vendor's best available layer to a unified `AgentEvent` stream.

| Provider | Integration layer |
|---|---|
| **Claude Code** | CLI `--input-format stream-json` / `--output-format stream-json` (NDJSON) |
| **OpenAI Codex** | `codex app-server` (JSON-RPC, stdio, Threads, server-side approvals) |
| **Google Gemini** | CLI Headless mode (JSON/stdin) |
| **Cursor / ACP** | Agent Client Protocol (JSON-RPC/stdio) |
| **HTTP / local** | OpenAI-compatible APIs (Ollama, LM Studio, OpenRouter, vLLM) |

All project state lives in `.project-agents/` — a git-versioned directory in your repo. No cloud backend required.

---

## Monorepo structure

```
wintermute-patchbay/
├── packages/
│   ├── core/              # Orchestrator, Store, Runner + Connector interfaces, Types
│   ├── cli/               # patchbay init, task, run, reply, auth, serve
│   ├── dashboard/         # Next.js + Tailwind dashboard (the primary app surface)
│   ├── server/            # Standalone HTTP server (@patchbay/server)
│   └── runners/
│       ├── bash/          # Shell command execution (batch)
│       ├── http/          # URL fetch (batch) + HttpConnector (OpenAI-compatible)
│       ├── cursor/        # File-based handoff (batch)
│       ├── cursor-cli/    # CursorAcpConnector (ACP JSON-RPC/stdio)
│       ├── claude-code/   # Batch runner + ClaudeCodeConnector (streaming)
│       ├── codex/         # Batch runner + CodexConnector (streaming)
│       └── gemini/        # Batch runner + GeminiConnector (streaming)
├── schema/                # .project-agents/ JSON Schema definitions
├── docs/
│   └── custom-connector.md   # How to build a custom Connector (incl. ACP)
├── ide/                   # Wintermute: build pipeline, patches, icons, extensions
│   ├── upstream/          # Pinned VS Code commit + tag
│   ├── patches/           # Curated diffs (branding, UI, telemetry, copilot)
│   ├── icons/             # App icons (ico, png, icns)
│   ├── extensions/
│   │   └── wntrmte-workflow/  # Built-in Patchbay client extension
│   ├── product.json       # Branding + Open VSX marketplace
│   ├── build.sh           # Full build orchestration
│   └── PLAN.md            # Wintermute build roadmap
├── PLAN.md                # Patchbay implementation roadmap
├── VISION.md              # Product vision + market positioning
├── AGENTS.md              # AI agent context
├── vitest.config.ts       # Shared test config
└── package.json           # npm workspaces root
```

---

## Getting started

### Prerequisites

- **Node.js 22** via [fnm](https://github.com/Schniz/fnm) (recommended) or nvm
- **Git**
- For building Wintermute IDE additionally: Python 3.11+, [jq](https://jqlang.github.io/jq/), Git Bash on Windows

### Install dependencies

```bash
git clone https://github.com/Auda29/wntrmte_patchbay
cd wntrmte_patchbay
npm install
```

### Run the Patchbay dashboard

```bash
PATCHBAY_REPO_ROOT=/path/to/your/repo npm run dev --workspace=dashboard
# → http://localhost:3000
```

`PATCHBAY_REPO_ROOT` must point to a repo with a `.project-agents/` directory. Initialize one with:

```bash
npx patchbay init
```

### Run the standalone server

```bash
npx patchbay serve
```

### Build Wintermute IDE

```bash
cd ide
fnm use
bash build.sh
```

Output will be in `VSCode-{platform}-{arch}/`. Build takes ~30-50 minutes.

### Run tests

```bash
npm test              # unit + e2e
npm run test:unit     # unit tests only (vitest)
npm run test:e2e      # Playwright e2e (dashboard)
```

---

## Wintermute

Wintermute is a minimalist VS Code distribution (VSCodium-style: build scripts + patches, no hard fork) that ships with:

- **Minimalist UI** — no activity bar, no tabs, no minimap by default
- **Built-in Patchbay client** — task tree, agent dispatch, run logs, dashboard webview
- **Open VSX** marketplace instead of Microsoft's extension gallery
- **Zero telemetry** — all data collection disabled
- **No Copilot** — GitHub Copilot features hidden by default

Binary: `wntrmte` | Data folder: `.wntrmte`

### Two modes

**Offline mode** — reads `.project-agents/` directly from disk. No backend required.

**Connected mode** — connects to the Patchbay dashboard via HTTP/SSE. Auto-detected (probes `localhost:3000`).

### Extension commands

| Command | Description |
|---|---|
| `Wintermute: Dispatch Task to Runner` | Select task + runner, opens integrated terminal |
| `Wintermute: Open Patchbay Dashboard` | Open dashboard as webview panel |
| `Wintermute: Initialize Patchbay Workspace` | Run `patchbay init` for the current repo |
| `Wintermute: Configure Runner Auth` | Set up authentication for Claude, Codex, Gemini |
| `Wintermute: Set Task Status` | Change task status from tree view |
| `Wintermute: Switch Connection Mode` | Toggle auto/offline/connected |

See [`ide/README.md`](./ide/README.md) for full build instructions and extension details.

---

## Patchbay

Patchbay is the orchestration backend and dashboard. It manages tasks, dispatches runners, streams agent sessions, and persists everything in `.project-agents/`.

### Dashboard pages

| Route | Description |
|---|---|
| `/` | Project overview — stats, goal, tech stack, recent runs |
| `/tasks` | Kanban board with dispatch and status controls |
| `/runs` | Run history — logs, summaries, diffs, suggested next steps |
| `/artifacts` | File browser — context files + diff references |
| `/decisions` | Decision log with search and creation |

### CLI commands

```bash
patchbay init           # Initialize .project-agents/ in the current repo
patchbay task create    # Create a new task
patchbay run <task> <runner>   # Dispatch a task to a runner
patchbay reply <task>   # Continue a multi-turn conversation
patchbay auth           # Configure runner authentication
patchbay serve          # Start the standalone HTTP server
```

### The `.project-agents/` data model

```
.project-agents/
  project.yml              # Project name, goal, tech stack
  agents/
    claude-builder.yml     # Agent profiles
  tasks/
    TASK-auth-flow-a1b2.md # Task with YAML frontmatter + Markdown body
  decisions/
    DEC-001.md             # Architecture decisions
  runs/
    2026-03-21-run.json    # Who did what, when, with what result
  context/
    architecture.md        # Project context for agents
    conventions.md
```

Git-versioned. Human-readable. No cloud required.

See [`PLAN.md`](./PLAN.md) for the full Patchbay implementation roadmap.

---

## Status

**Phases A-K complete** — schema, orchestrator, dashboard, 7 runner adapters, CLI, extension, multi-turn conversations, project import.

**Phase L1-L5 complete** — agent connector architecture (core types, all provider connectors, orchestrator with approve/deny, server streaming endpoints, dashboard API routes), monorepo consolidation with shared types from `@patchbay/core`.

**Next: L6-L7** — Agent Chat UI in the dashboard + Wintermute postMessage relay (L6), `/agents` endpoint with connector capabilities (L7).

See [`VISION.md`](./VISION.md) for the full product vision and market positioning.

---

## License

MIT — see [LICENSE](./LICENSE)
