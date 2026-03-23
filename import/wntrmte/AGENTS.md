# Wintermute — Agent Context

## What is this project?

Wintermute (`wntrmte`) is a minimalist VS Code distribution that serves as the **host** for the Patchbay agent orchestration app. It is **not** a hard fork — it clones a pinned VS Code commit and applies curated patches at build time.

Together with Patchbay, it forms an open-source, IDE-native, model-agnostic agent orchestration platform — comparable to ZenFlow or Codex App, but integrated into the editor. See `../VISION.md` for the full product vision.

## Companion: Patchbay

Patchbay is the **agent orchestration app** that lives inside Wintermute. It provides the Dashboard UI, the Orchestrator backend, and the provider Connectors.

- Patchbay repo: `../patchbay/`
- Shared vision: `../VISION.md`
- Patchbay plan: `../patchbay/PLAN.md`

### Key rules

1. Wintermute is the **host**, Patchbay is the **app**. The Dashboard (Agent Chat, Kanban, Dispatch, Approvals) is built in Patchbay and embedded as an iframe in Wintermute.
2. The extension (`extensions/wntrmte-workflow/`) is a **host + glue layer** — it embeds the Dashboard, relays postMessage commands, provides IDE context (terminal, file system, auth), and offers complementary IDE-native features (TreeView, StatusBar, Setup).
3. Wintermute does **not** build its own orchestration UI — that is Patchbay's job.
4. Patchbay owns the `.project-agents/` schema. The extension consumes it via compatible interfaces.

## Project structure

- `build.sh` — Main build orchestration
- `get_repo.sh` — Clone pinned VS Code version
- `prepare_vscode.sh` — Apply patches, merge product.json, npm ci, build extension
- `utils.sh` — Shared utilities (APP_NAME, BINARY_NAME, apply_patch)
- `patches/` — Curated diffs applied at build time
- `product.json` — Branding, Open VSX marketplace, Windows metadata
- `upstream/stable.json` — Pinned VS Code version (tag + commit)
- `extensions/wntrmte-workflow/` — Patchbay host extension (built-in bundled)
  - `src/store/` — FileStore (offline) + ApiStore (connected, SSE)
  - `src/store/StoreFactory.ts` — Auto-detect offline/connected mode
  - `src/providers/` — TaskTreeProvider, RunLogProvider, StatusBarItem, DashboardPanel
  - `src/agent/` — PatchbayRunner (delegates to `patchbay run` CLI)
  - `src/services/` — SetupInspector, constants, `CliManager`, `AuthService`, `TerminalOrchestrator` (split aus `extension.ts`)

## Wintermute's role in the architecture

```
Patchbay Dashboard (the app, embedded as iframe)
  ↕ postMessage relay
Wintermute Extension (host + glue)
  ↕ terminal, file system, auth, IDE context
Wintermute IDE Core (VS Code build + branding)
```

The extension's job:
- **Embed** the Dashboard as a Webview panel
- **Relay** commands from Dashboard iframe to VS Code (postMessage → `vscode.commands.executeCommand`)
- **Provide** IDE context: workspace root, integrated terminal, file system watcher
- **Complement** with IDE-native features: TreeView sidebar, StatusBar, Setup flow, Auth commands

## Build

```bash
fnm use          # Node 22
bash build.sh    # auto-detects OS/arch
```

## Conventions

- Patches use `!!PLACEHOLDER!!` tokens replaced at build time via `utils.sh`
- `vscode/` is never committed — cloned fresh each build
- All branding uses APP_NAME=Wintermute, BINARY_NAME=wntrmte
- The `.project-agents/` schema is defined in the Patchbay repo (`../patchbay/schema/`)

## Current status

Phases 1–5 + C + D + E + H + J + K complete. **Patchbay** has implemented Phase **L1–L4** (connector types, provider connectors including `HttpConnector` and **Cursor ACP** (`CursorAcpConnector` / `AcpConnector`), orchestrator session API with approve/deny, server routes and dashboard API proxies). **Wintermute:** Phase **L5** `extension.ts` split is **done** (`services/CliManager`, `AuthService`, `TerminalOrchestrator`); **L5** monorepo merge + shared types from `@patchbay/core` remain. Still needs **L6** — postMessage relay for `connectAgent`, `sendAgentInput`, `approveAgent`, **`denyAgent`**, `cancelAgent` — and **L7** `/agents` capabilities (see `../patchbay/PLAN.md`, `../VISION.md`, `../TODO.md`).

## Planned: Monorepo consolidation

Phase L5 will merge wntrmte + patchbay into a single repository. Wintermute's extension will import types directly from `@patchbay/core` instead of maintaining duplicate interfaces. The build pipeline (`build.sh`, patches, `product.json`) moves to `ide/`. The **`extension.ts` refactor** (extracting `CliManager`, `AuthService`, `TerminalOrchestrator`) is already done.

## Running tests

```bash
cd extensions/wntrmte-workflow
npm ci
npm run test:unit
```
