# Patchbay — Agent Context

## What is this project?

Patchbay is the **agent orchestration app** inside Wintermute. It provides the dashboard UI, the orchestrator backend, and the provider connectors that let users interact with AI coding agents (Claude Code, Codex, Gemini, and others) from within the IDE.

Together with Wintermute, it forms an open-source, IDE-native, model-agnostic agent orchestration platform — comparable to ZenFlow or Codex App, but integrated into the editor. See `../VISION.md` for the full product vision.

## Companion: Wintermute

Wintermute (`wntrmte`) is a minimalist VS Code distribution that serves as the **host** for Patchbay. It embeds the Patchbay Dashboard as a Webview panel, provides the IDE context (workspace, terminal, file system), and relays commands via postMessage.

- wntrmte repo: `../wntrmte/`
- Shared vision: `../VISION.md`
- wntrmte plan: `../wntrmte/PLAN.md`

### Key rules

1. Patchbay **owns** the orchestration logic, the `.project-agents/` schema, and the Dashboard UI.
2. The Dashboard is the **primary app surface** — Agent Chat, Kanban, Dispatch, Streaming, Approvals all live here.
3. Wintermute embeds the Dashboard as an iframe. It does **not** build its own orchestration UI.
4. The `.project-agents/` file format is the integration contract between repos.

## Project structure

```text
patchbay/
├── schema/           # .project-agents/ JSON Schemas
├── packages/
│   ├── core/         # Orchestrator, Store (ajv-validated), Runner + AgentConnector interfaces, Types
│   ├── cli/          # patchbay init, task, run, reply, auth, serve
│   ├── dashboard/    # Next.js + Tailwind dashboard (THE APP)
│   │   └── src/app/api/  # API routes: state, dispatch, reply, agents, events (SSE)
│   ├── server/       # Standalone HTTP server (@patchbay/server)
│   │   └── src/      # createServer(), all routes including streaming endpoints
│   └── runners/
│       ├── bash/         # Shell command execution (batch)
│       ├── http/         # GET URL fetch (batch)
│       ├── cursor/       # File-based handoff (batch)
│       ├── cursor-cli/   # cursor agent wrapper (batch)
│       ├── claude-code/  # Claude Code runner (batch) + connector (streaming)
│       ├── codex/        # Codex runner (batch) + connector (streaming, planned)
│       └── gemini/       # Gemini runner (batch) + connector (streaming, planned)
├── PLAN.md           # Implementation roadmap
└── README.md
```

## Architecture: Two execution models

**Batch Runner** — `execute(): Promise<RunnerOutput>`. Fire-and-forget. For bash, http, cursor, simple one-shot tasks.

**Agent Connector** — `connect(): AgentSession`. Event-based, session-oriented. Streams messages, handles permissions, accepts replies in a live session. For Claude Code, Codex, Gemini and future providers. Provider-agnostic: the `AgentConnector` interface is generic, each provider implements its own connector.

## Principles

- **Dashboard-first** — the dashboard is the app, not decoration
- **Provider-agnostic** — any AI agent is an interchangeable worker, no vendor lock-in
- **Repo-first** — state in `.project-agents/`, git-versioned, no cloud required
- **Open source** — community can build custom connectors for any provider

## Current status

Phases A–K complete. Phase L (Agent Connector Architecture) is the next milestone — introduces live agent interaction with streaming events, permission dialogs, and provider-agnostic connector interface. Includes monorepo consolidation (L5) merging wntrmte + patchbay into one repository. See `PLAN.md` Phase L for details.
