# Patchbay — Agent Context

## What is this project?

Patchbay is the **agent orchestration app** inside Wintermute. It provides the dashboard UI, the orchestrator backend, and the provider connectors that let users interact with AI coding agents (Claude Code, Codex, Gemini, and others) from within the IDE.

Together with Wintermute, it forms an open-source, IDE-native, model-agnostic agent orchestration platform — comparable to ZenFlow or Codex App, but integrated into the editor. See `./docs/VISION.md` for the full product vision.

## Companion: Wintermute

Wintermute (`wntrmte`) is a minimalist VS Code distribution that serves as the **host** for Patchbay. It embeds the Patchbay Dashboard as a Webview panel, provides the IDE context (workspace, terminal, file system), and relays commands via postMessage.

- Wintermute IDE code: `./ide/`
- Shared vision: `./docs/VISION.md`
- Wintermute plan: `./ide/PLAN.md`

### Key rules

1. Patchbay **owns** the orchestration logic, the `.project-agents/` schema, and the Dashboard UI.
2. The Dashboard is the **primary app surface** — Agent Chat, Kanban, Dispatch, Streaming, Approvals all live here.
3. Wintermute embeds the Dashboard as an iframe. It does **not** build its own orchestration UI.
4. The `.project-agents/` file format is the integration contract between `packages/` and `ide/`.

## Project structure

```text
patchbay/
├── schema/           # .project-agents/ JSON Schemas
├── docs/
│   └── custom-connector.md  # How to build a custom Connector
├── packages/
│   ├── core/         # Orchestrator, Store (ajv-validated), Runner + AgentConnector interfaces, Types
│   │   └── src/
│   │       ├── runner.ts     # Runner types + shared `buildPrompt()` (CLI runners + connectors)
│   │       ├── connector.ts  # AgentConnector, AgentSession, AgentEvent, ConnectorRegistry, BaseSession
│   │       └── ...
│   ├── cli/          # patchbay init, task, run, reply, auth, serve
│   ├── dashboard/    # Next.js + Tailwind dashboard (THE APP)
│   │   └── src/app/api/  # API routes: state, dispatch, reply, agents, events (SSE), connect, agent-input, connectors
│   ├── server/       # Standalone HTTP server (@patchbay/server)
│   │   └── src/      # createServer(), all routes including streaming + connector endpoints
│   └── runners/
│       ├── bash/         # Shell command execution (batch)
│       ├── http/         # GET URL fetch (batch) + HttpConnector (OpenAI-compatible APIs)
│       ├── cursor/       # File-based handoff (batch)
│       ├── cursor-cli/   # Batch runner (immediate fail) + CursorAcpConnector (ACP JSON-RPC/stdio)
│       ├── claude-code/  # Batch runner + ClaudeCodeConnector (streaming, CLI stream-json)
│       ├── codex/        # Batch runner + CodexConnector (streaming, codex app-server JSON-RPC)
│       └── gemini/       # Batch runner + GeminiConnector (streaming, Headless/JSON)
├── docs/
│   ├── README.md
│   ├── PLAN.md
│   └── VISION.md
└── AGENTS.md
```

## Architecture: Two execution models

**Batch Runner** — `execute(): Promise<RunnerOutput>`. Fire-and-forget. For bash, http, cursor, simple one-shot tasks.

**Agent Connector** — `connect(): AgentSession`. Event-based, session-oriented. Streams messages, handles permissions, accepts replies in a live session. Implementations differ per vendor (e.g. Claude Code stream-json, **Codex `app-server`** JSON-RPC, Gemini Headless, **Cursor `CursorAcpConnector` / generic `AcpConnector`** for [ACP](https://agentclientprotocol.com), HTTP for local routers). Provider-agnostic: the `AgentConnector` interface is generic; each provider maps its best available layer. See `./docs/VISION.md` (Provider-Schichten) and `docs/custom-connector.md` (ACP section).

## Principles

- **Dashboard-first** — the dashboard is the app, not decoration
- **Provider-agnostic** — any AI agent is an interchangeable worker, no vendor lock-in
- **Repo-first** — state in `.project-agents/`, git-versioned, no cloud required
- **Open source** — community can build custom connectors for any provider

## Current status

Phases A–K complete. **Phase L1–L7 done** — core connector types, all provider connectors, orchestrator incl. approve/deny, server + dashboard API routes, Agent Chat UI, Wintermute relay, `/agents` capabilities, and monorepo consolidation with shared types from `@patchbay/core`. **Open:** L8 Vision Alignment (persistent chat history, connector-first UX, cleaner connector contract in the UI, doc discipline). See `./docs/PLAN.md` Phase L.
