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

```
patchbay/
├── schema/           # .project-agents/ JSON Schemas
├── packages/
│   ├── core/         # Orchestrator, Store (ajv-validated), Runner interface, Types
│   ├── cli/          # patchbay init, task create/list/status, run, status
│   ├── dashboard/    # Next.js + Tailwind + SWR dashboard
│   │   └── src/app/api/  # API routes: state, dispatch, artifacts, tasks, runs, agents, events (SSE)
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

All 6 phases complete: Schema, Orchestrator, Dashboard (Next.js + SWR + SSE), Runner-Adapters (bash, http, cursor, cursor-cli, claude-code, codex, gemini), wntrmte integration, and Auth-System (`patchbay auth` CLI, `RunnerAuth` with API key / subscription modes). See `PLAN.md` for details.
