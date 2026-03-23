# Wintermute + Patchbay

> An open-source, IDE-native agent orchestration platform. Wintermute is the IDE. Patchbay is the app inside it.

---

## What is this?

Most developers working with AI agents today juggle multiple windows: Cursor, Claude.ai, a terminal, and a browser tab. **Wintermute + Patchbay** puts everything in one place.

- **[Wintermute](https://github.com/Auda29/wntrmte)** — a minimal VS Code distribution. The IDE you already know, stripped to essentials, with Patchbay built in.
- **[Patchbay](https://github.com/Auda29/patchbay)** — the agent orchestration app. Task management, live agent interaction, streaming, permission dialogs, run history — all in a web dashboard.

Together: write code on the left, orchestrate AI agents on the right. No app switching. No browser tabs. One window.

---

## How it compares

| | ZenFlow / T3 Code | Cursor | **Wintermute + Patchbay** |
|---|---|---|---|
| Agent Interaction | Separate desktop app | Baked-in AI | Dashboard panel in the IDE |
| Model choice | Provider-locked | Provider-locked | Model-agnostic (Claude, Codex, Gemini, local models) |
| Open Source | No | No | **Yes** |
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

All project state lives in `.project-agents/` — a git-versioned directory in your repo. No cloud backend required.

---

## Monorepo

| Path | Description |
|---|---|
| `packages/` | Patchbay packages: core, dashboard, cli, server, runners |
| `schema/` | Shared `.project-agents/` schema definitions |
| `docs/` | Shared docs such as the custom connector guide |
| `ide/` | Wintermute build pipeline, patches, icons, extensions, upstream metadata |

This repo is the canonical monorepo and holds the shared roadmap (`VISION.md`, `TODO.md`) plus both codebases in one workspace.

---

## Status

Active development. Core infrastructure is complete (schema, orchestrator, dashboard, 7 runner adapters, CLI, multi-turn conversations, project import). Next milestone: **Phase L — Agent Connector Architecture** (live streaming, structured permission dialogs, event-based agent interaction).

See [`VISION.md`](./VISION.md) for the full roadmap and [`TODO.md`](./TODO.md) for open items.

---

## Getting started

```bash
git clone https://github.com/Auda29/wntrmte_patchbay
cd wntrmte_patchbay
npm install
```

Then work from the unified workspace:
- Patchbay packages live under `packages/`
- Wintermute build assets live under `ide/`
- The custom connector guide lives at `docs/custom-connector.md`

---

## License

MIT — see [LICENSE](./LICENSE)
