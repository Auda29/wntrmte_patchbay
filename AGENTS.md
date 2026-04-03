# Patchbay — Agent Context

## What this repo is

Patchbay is the agent orchestration app inside Wintermute. It owns the dashboard UI, the orchestrator, session state, and the provider connectors for Codex, Claude Code, Gemini, ACP/Cursor, and HTTP-compatible backends.

Together, Wintermute + Patchbay form an open-source, IDE-native, model-agnostic agent workspace. Wintermute is the host editor; Patchbay is the app inside it.

## Source of truth

- Product vision: `docs/VISION.md`
- Current overview and setup: `docs/README.md`
- Implementation roadmap: `docs/PLAN.md`
- Connector implementation details: `docs/custom-connector.md`
- Wintermute host code: `ide/`

## Non-negotiables

1. Patchbay owns the orchestration UX and logic. Wintermute should host and relay it, not reimplement it.
2. The dashboard is the primary surface. Agent chat, sessions, approvals, task flow, and history belong there.
3. `.project-agents/` is the persistence and integration contract. Keep it git-versioned and human-readable.
4. The product is connector-first. Interactive sessions are the preferred path; batch runners are secondary fallback/automation tools.
5. Extensibility matters: the long-term platform direction includes user-addable MCP servers that agents can use in a controlled way.

## Monorepo map

```text
patchbay/
├── packages/
│   ├── core/         # Orchestrator, store, runner/connector interfaces, shared types
│   ├── cli/          # patchbay init, task, run, reply, auth, serve
│   ├── dashboard/    # Next.js dashboard UI and API routes
│   ├── server/       # Standalone HTTP server wrapper around the orchestrator
│   └── runners/
│       ├── bash/         # Batch runner
│       ├── http/         # Batch HTTP runner + HTTP connector
│       ├── cursor/       # File-based batch handoff
│       ├── cursor-cli/   # ACP-based Cursor connector
│       ├── claude-code/  # Claude Code runner + connector
│       ├── codex/        # Codex runner + app-server connector
│       └── gemini/       # Gemini runner + connector
├── ide/              # Wintermute host/editor integration
├── docs/             # README, PLAN, VISION, connector docs
├── schema/           # .project-agents schemas
└── AGENTS.md
```

## Execution model

### Agent connectors

Use `connect(): AgentSession` when the provider supports a real session model with streaming, approvals, and follow-up input.

- Codex: `codex app-server` over JSON-RPC/stdio with `initialize`, `thread/start|resume|fork`, `turn/start|steer`, item events, and server-side approvals
- Claude Code: CLI `stream-json` input/output
- Gemini: headless JSON/stdio flow
- Cursor/ACP: ACP over JSON-RPC/stdio
- HTTP/local: adapter-based, capability-dependent

Implementation note:
- Codex app-server payloads may omit the explicit `jsonrpc` field on stdout even when the payload still matches the expected request/notification shape; connector parsing should be tolerant of that wire-level variation.

### Batch runners

Use `execute(): Promise<RunnerOutput>` for fire-and-forget jobs, scripts, fetches, or fallback execution when no suitable connector is available.

## Product shape

- Session-first workflow: task -> session -> review
- `/sessions` is the primary live workspace
- `/runs` remains history and diagnostics
- Codex via `codex app-server` is the preferred default connector path
- One-off runs stay available, but as a secondary path
- User-added MCP servers are a planned future capability for expanding what agents can do inside a workspace

## Current status

Phases A-K are complete. Phase L is substantially complete through the connector-first/session-first product direction, including persistent sessions, provider session IDs, resume/fork flows, dashboard session UX, and Wintermute embedding/relay behavior.

Recent post-L10 polish shipped:
- Wintermute keeps the embedded dashboard webview stable during routine status polling instead of forcing a full HTML reset each time.
- `/sessions` is more reliable immediately after `Start Session` because the page tolerates the new session record appearing a moment later.
- Codex connector parsing was hardened against real app-server payloads that omit `jsonrpc`.

The active focus is post-L10 polish: diagnostics UX, build/test hardening, and tightening docs so they match the shipped connector behavior.
