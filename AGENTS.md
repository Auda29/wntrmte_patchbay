# Patchbay — Agent Context

## What is this project?

Patchbay is a lightweight control plane for AI-assisted software development. It orchestrates existing tools (Cursor, Claude Code, Codex, Bash, HTTP) as coordinated workers via a central dashboard.

## Companion: Wintermute

Wintermute (`wntrmte`) is a minimalist VS Code distribution and the native, first-class client for Patchbay. Its Phase 3 extension is designed as a Patchbay client from day one.

- wntrmte repo: `../wntrmte/`
- Shared vision: `../VISION.md`
- wntrmte plan: `../wntrmte/PLAN.md`

### Key rule

Patchbay **owns** the orchestration logic and the `.project-agents/` schema. The wntrmte extension (`../wntrmte/extensions/wntrmte-workflow/`) is a consumer of that schema — not a competing orchestrator.

## Project structure (planned)

```
patchbay/
├── schema/           # .project-agents/ JSON Schemas (Phase 1)
├── packages/
│   ├── core/         # Orchestrator, Store, Runner interface
│   ├── cli/          # patchbay init, task, run, status
│   ├── dashboard/    # Web dashboard
│   └── runners/      # Bash, HTTP, Cursor, Claude Code adapters
├── archive/          # Historical docs (brainstorming, etc.)
├── PLAN.md           # Implementation roadmap
└── README.md
```

## Principles

- **Dashboard-first** — the dashboard is the control center
- **Repo-first** — state in `.project-agents/`, git-versioned, no cloud required
- **CLI-first** — CLI as the robust integration layer
- **Tool-agnostic** — no lock-in to any specific AI tool

## Data model

Core objects: Project, Task, Run, Decision, Artifact, Agent/Runner Profile. All stored in `.project-agents/` as YAML/JSON/Markdown files.

## Current status

Early development. Schema definition (Phase 1) is the next milestone. See `PLAN.md` for the full roadmap.
