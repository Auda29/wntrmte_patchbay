# Patchbay — Agent Context

## What is this project?

Patchbay is a lightweight control plane for AI-assisted software development. It orchestrates existing tools (Cursor, Claude Code, Codex, Bash, HTTP) as coordinated workers via a central dashboard.

## Companion: Wintermute

Wintermute (`wntrmte`) is a minimalist VS Code distribution and the native, first-class client for Patchbay. Its extension is designed as a Patchbay client from day one.

- wntrmte repo: `../wntrmte/`
- Shared vision: `../VISION.md`
- wntrmte plan: `../wntrmte/PLAN.md`

### Key rule

Patchbay **owns** the orchestration logic and the `.project-agents/` schema. The wntrmte extension (`../wntrmte/extensions/wntrmte-workflow/`) is a consumer of that schema — not a competing orchestrator.

## Project structure

```text
patchbay/
├── schema/           # .project-agents/ JSON Schemas
├── packages/
│   ├── core/         # Orchestrator, Store (ajv-validated), Runner interface, Types
│   ├── cli/          # patchbay init (interactive + --yes), task create/list/status, run, status, auth, serve
│   ├── dashboard/    # Next.js + Tailwind + SWR dashboard
│   │   └── src/app/api/  # API routes: state, dispatch, artifacts, tasks, runs, agents, events (SSE)
│   ├── server/       # Standalone HTTP server (@patchbay/server, patchbay serve) — DONE
│   │   └── src/      # createServer(), all routes: GET/POST/PATCH + dispatch + SSE + EventBus
│   └── runners/
│       ├── bash/         # Shell command execution
│       ├── http/         # GET URL fetch
│       ├── cursor/       # File-based handoff (Stage 1)
│       ├── cursor-cli/   # cursor agent -p wrapper
│       ├── claude-code/  # claude -p wrapper
│       ├── codex/        # codex exec wrapper
│       └── gemini/       # gemini -p wrapper
├── PLAN.md           # Implementation roadmap
└── README.md
```

## Principles

- **Dashboard-first** — the dashboard is the control center
- **Repo-first** — state in `.project-agents/`, git-versioned, no cloud required
- **CLI-first** — CLI as the robust integration layer
- **Tool-agnostic** — no lock-in to any specific AI tool

## Data model

Core objects: Project, Task, Run, Decision, Artifact, Agent/Runner Profile. All stored in `.project-agents/` as YAML/JSON/Markdown files. Validated via ajv against JSON Schemas in `packages/core/schema/`.

## Current status

Phases 1–7b + C + D + E + F + G + H complete. Schema, Orchestrator, Dashboard (Next.js + SWR + SSE), Runner-Adapters (bash, http, cursor, cursor-cli, claude-code, codex, gemini), wntrmte integration, Auth-System, non-interactive `patchbay init --yes`, Standalone server (`@patchbay/server`) with all endpoints and centralized runner-bootstrap, non-blocking `dispatchTaskAsync` (HTTP 202), History page, Test infrastructure (Vitest 31 unit tests + Playwright 11 E2E tests), live runner output streaming via `spawn` in all 5 CLI runners, Windows-compat (platform-aware `.cmd` suffix in all CLI runners — no `shell: true`), 5-minute timeout with `settled`-flag in all CLI runners, URL validation in HTTP runner, hint messages in Bash runner, cursor-cli returns immediate error (not headless), `installHint` in `RunnerOutput`/`Run` + binary check in claude-code/codex/gemini runners, Dashboard Run-Viewer + DispatchDialog show `installHint`, agents endpoint returns `available: boolean` + `installHint` (Dashboard + Standalone Server). See `PLAN.md` for details.
