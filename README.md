# Patchbay

A lightweight control plane for AI-assisted software development.

> Ein zentrales Dashboard, das bestehende Tools wie Cursor, Claude Code, Codex, Bash und HTTP-Runner über CLI oder standardisierte Adapter als koordinierte Worker steuert.

## What is Patchbay?

Patchbay is **not** a new IDE or coding agent. It's a **command center** that orchestrates your existing AI tools:

- **Dashboard** — Plan, dispatch, monitor, and review tasks
- **Orchestrator** — Manage task state, dispatch runners, collect results
- **Runners** — Bash, HTTP, Cursor, Claude Code, and more via standardized adapters
- **`.project-agents/`** — Git-versioned, file-based project state (no cloud required)

## Principles

- **Dashboard-first** — The dashboard is the control center, not decoration
- **Repo-first** — State lives in git, transparent and auditable
- **CLI-first** — CLI as the robust, loggable integration layer
- **Tool-agnostic** — No lock-in to any specific AI tool

## Companion: Wintermute

Patchbay works standalone with any editor, but has first-class integration with [Wintermute](https://github.com/Auda29/wntrmte) — a minimalist VS Code distribution with a built-in Patchbay client extension. See [VISION.md](../VISION.md) for the shared architecture.

## Status

Early development. See [PLAN.md](PLAN.md) for the roadmap.

## License

MIT
