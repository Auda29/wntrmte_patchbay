# Patchbay

A lightweight control plane for AI-assisted software development.

> A central dashboard that coordinates existing tools like Cursor, Claude Code, Codex, Bash, and HTTP runners as managed workers via CLI or standardized adapters.

## What is Patchbay?

Patchbay is **not** a new IDE or coding agent. It's a **command center** that orchestrates your existing AI tools:

- **Dashboard** — Plan, dispatch, monitor, and review tasks
- **Orchestrator** — Manage task state, dispatch runners, collect results
- **Runners** — Bash, HTTP, Cursor (file-based), Cursor CLI, Claude Code via standardized adapters
- **`.project-agents/`** — Git-versioned, file-based project state (no cloud required)

## Principles

- **Dashboard-first** — The dashboard is the control center, not decoration
- **Repo-first** — State lives in git, transparent and auditable
- **CLI-first** — CLI as the robust, loggable integration layer
- **Tool-agnostic** — No lock-in to any specific AI tool

## Companion: Wintermute

Patchbay works standalone with any editor, but has first-class integration with [Wintermute](https://github.com/Auda29/wntrmte) — a minimalist VS Code distribution with a built-in Patchbay client extension. See [VISION.md](../VISION.md) for the shared architecture.

Phases 1–4 are complete: Schema & Data Model, Orchestrator Core, Dashboard UI, and all Runner Adapters (Bash, HTTP, Cursor file-based, Cursor CLI, Claude Code). Next up: Phase 5 (wntrmte-Integration).
See [PLAN.md](PLAN.md) for the detailed roadmap.

## License

MIT
