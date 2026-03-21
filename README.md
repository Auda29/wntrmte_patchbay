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

## Repositories

| Repo | Description |
|---|---|
| [`Auda29/patchbay`](https://github.com/Auda29/patchbay) | Orchestrator, Dashboard (Next.js), CLI, Runners, Agent Connectors |
| [`Auda29/wntrmte`](https://github.com/Auda29/wntrmte) | VS Code build pipeline, Wintermute extension, Patchbay host |

This repo is the meta-workspace. It contains both as git submodules and holds the shared roadmap (`VISION.md`, `TODO.md`).

---

## Status

Active development. Core infrastructure is complete (schema, orchestrator, dashboard, 7 runner adapters, CLI, multi-turn conversations, project import). Next milestone: **Phase L — Agent Connector Architecture** (live streaming, structured permission dialogs, event-based agent interaction).

See [`VISION.md`](./VISION.md) for the full roadmap and [`TODO.md`](./TODO.md) for open items.

---

## Getting started

```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/Auda29/wntrmte_patchbay

# Or if already cloned
git submodule update --init --recursive
```

Then follow the setup instructions in the individual repos:
- [patchbay setup](https://github.com/Auda29/patchbay#readme)
- [wntrmte setup](https://github.com/Auda29/wntrmte#readme)

---

## License

MIT — see [LICENSE](./LICENSE)
