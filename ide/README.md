# Wintermute

A minimalist AI-agent IDE built on VS Code. Inspired by Zed's clean aesthetics, with deep agent/subagent workflow integration via Patchbay.

> *"Wintermute was hive mind, decision maker, effecting change in the world outside."*
> — William Gibson, Neuromancer

## What is this?

Wintermute is a custom VS Code distribution (VSCodium-style: build scripts + patches, no hard fork) that ships with:

- **Minimalist UI** — no activity bar, no tabs, no minimap, no breadcrumbs by default
- **Built-in Patchbay client** — task tree, connector sessions, run diagnostics, and dashboard webview as a first-class feature
- **Open VSX** marketplace instead of Microsoft's proprietary extension gallery
- **Zero telemetry** — all data collection disabled by default
- **No Copilot** — GitHub Copilot AI features hidden by default

Binary: `wntrmte` | Data folder: `.wntrmte`

## Quickstart

Wintermute is most useful in a workspace that already contains a Patchbay-compatible `.project-agents/` directory.

### 1. Build Wintermute

```bash
fnm use
cd ide
bash build.sh
```

Launch the resulting binary from `VSCode-{platform}-{arch}/`.

### 2. Open a Patchbay workspace

Open any project that contains `.project-agents/`. Wintermute will automatically activate the built-in Patchbay client extension and show:

- a task tree in the Explorer
- session-first workflows in the embedded dashboard
- Patchbay-aware task status controls

### 3. Choose your mode

**Offline mode** — no backend required. Wintermute reads `.project-agents/` directly from disk.

**Connected mode** — run the Patchbay dashboard, then open the same workspace in Wintermute:

```bash
cd ..
fnm use
npm install
npm run dev
```

By default, Wintermute probes `http://localhost:3000` and switches into connected mode when the dashboard is available. If the dashboard is offline, the Patchbay panel can start it via `Start Dashboard`.

### 4. Start work through Patchbay

If you want to run tasks from inside Wintermute, install the Patchbay CLI first. The built-in `CLI Install` flow offers:

- `Install via npm` — `npm install -g @patchbay/cli` (fastest path once the package is published)
- `Use existing checkout` — build/install from a nearby local Patchbay repo
- `Clone Patchbay nearby` — clone the official Patchbay repo and install from there
- `Show manual steps` — open the companion repo if you want to run the setup yourself

Manual install from source:

```bash
cd ..
npm install
npm run build --workspace=@patchbay/cli
npm install -g ./packages/cli
```

Then use `Wintermute: Dispatch Task to Runner` to select a task and a runner. Wintermute opens an integrated terminal and runs `patchbay run <taskId> <runnerId>` with live output. `Ctrl+C` cancels the runner process.

For the primary workflow, open the embedded dashboard and start a connector session from **Tasks** with **Start Session** (Codex preferred, then Claude Code, then other available connectors). One-off runner dispatch remains available as fallback/automation path.

## Architecture

Wintermute never forks VS Code directly. Instead, it clones a pinned upstream commit at build time and applies a curated set of patches. This keeps upstream updates cheap — bump a version tag, check patches, rebuild.

```
ide/
├── upstream/stable.json          # Pinned VS Code commit + tag
├── patches/                      # Curated diffs applied at build time
│   ├── binary-name.patch         # Binary 'code' → 'wntrmte'
│   ├── brand.patch               # "Visual Studio Code" → "Wintermute"
│   ├── ui-defaults.patch         # Minimalist UI defaults
│   ├── telemetry.patch           # Disable all telemetry
│   └── disable-copilot.patch     # Hide GitHub Copilot features
├── icons/                        # App icons (ico, png, icns)
├── extensions/wntrmte-workflow/  # Built-in Patchbay client extension
├── product.json                  # Branding + Open VSX marketplace
├── utils.sh                      # Shared functions (apply_patch, replace)
├── get_repo.sh                   # Shallow clone by pinned commit
├── prepare_vscode.sh             # product.json merge, icons, patches, npm ci
├── build.sh                      # Full build orchestration
└── .github/workflows/            # CI: Linux + Windows + macOS
```

`vscode/` is never committed — it is cloned fresh on every build.

## Patchbay Client Extension

The bundled `wntrmte-workflow` extension is a native [Patchbay](https://github.com/Auda29/patchbay) client. It works in two modes:

**Offline mode** — reads `.project-agents/` directly from the workspace. No backend required.

**Connected mode** — connects to the Patchbay dashboard via HTTP/SSE for real-time updates, run submission, and an embedded dashboard webview.

Mode is auto-detected (probes `localhost:3000`), or configurable via `wntrmte.workflow.mode`.

### Features

| Feature | Description |
|---------|------------|
| **Task Tree** | Tasks grouped by status in the Explorer sidebar |
| **Session Workspace** | Connector-first task work via embedded dashboard sessions |
| **Run Logs** | Secondary diagnostics for one-off/fallback executions |
| **Status Bar** | Live count of running/blocked/open tasks |
| **Agent Dispatch** | One-off fallback dispatch to any Patchbay runner via `patchbay run` CLI |
| **Dashboard Webview** | Embedded Patchbay dashboard panel with setup state, auto-refresh, and `Start Dashboard` action |

### Commands

- `Wintermute: Dispatch Task to Runner` — select a task and runner, opens an integrated terminal with live `patchbay run` output (`Ctrl+C` cancels)
- `Wintermute: Open Patchbay Dashboard` — open the dashboard as a webview
- `Wintermute: Set Task Status` — change task status from the tree view
- `Wintermute: Switch Connection Mode` — toggle auto/offline/connected
- `Wintermute: Initialize Patchbay Workspace` — delegates to `patchbay init` CLI when available, falls back to local bootstrap
- `Wintermute: Set Default Runner` — choose the default fallback runner for one-off dispatch
- `Wintermute: Configure Runner Auth` — QuickPick missing Patchbay-managed connector auth runners, then choose `Subscription` or `API Key`
- `Wintermute: Open Claude Code CLI` — opens a terminal so Claude login stays inside the official Claude Code CLI

`Subscription` stores the auth mode in Patchbay and assumes the underlying runner CLI already has a valid login context. It does not open an OAuth or browser sign-in flow by itself. Claude Code is the exception: Wintermute/Patchbay do not store Claude auth and rely on the user's local Claude Code CLI session directly.

## Prerequisites

- Node.js 22 via [fnm](https://github.com/Schniz/fnm) (recommended) or nvm
- Python 3.11+
- [jq](https://jqlang.github.io/jq/)
- Git
- Windows: Git Bash (or another Bash environment that can run the build scripts)
- Linux: `krb5` (`libkrb5-dev` on Debian/Ubuntu)

## Build

Activate Node 22 first, then run the build:

```bash
fnm use        # picks up .nvmrc automatically
bash build.sh
```

Or specify OS/arch explicitly:

```bash
OS_NAME=linux VSCODE_ARCH=x64 bash build.sh
```

Windows example:

```bash
OS_NAME=windows VSCODE_ARCH=x64 bash build.sh
```

Output will be in `VSCode-{platform}-{arch}/`. Build takes ~30–50 minutes (clone + npm ci + Gulp).

## Upstream Updates

```bash
# Edit upstream/stable.json with new tag + commit
bash get_repo.sh
cd vscode
for p in ../patches/*.patch; do
  git apply --check "$p" || echo "CONFLICT: $p"
done
cd ..
bash build.sh
```

## Development

### Running extension unit tests

```bash
cd extensions/wntrmte-workflow
npm ci
npm run test:unit   # vitest, no display server required
npm run test:watch  # watch mode
```

## Roadmap

- [x] Phase 1: Build pipeline (clone → patch → compile → binary)
- [x] Phase 2: Branding + minimalist UI defaults
- [x] Phase 3: Patchbay client extension (offline + connected + PatchbayRunner)
- [x] Phase 4: Source-level polish (custom theme, compact chrome, font defaults)
- [x] Phase 5: Patchbay Start Panel (auto-open, setup inspector, embedded dashboard, workspace setup flow, auth-status UX)
- [x] Phase C: Unit test infrastructure (Vitest, vscode mock, FileStore + SetupInspector tests, CI)
- [x] Phase D: Terminal feedback for dispatch — `wntrmte.dispatchInTerminal` opens integrated terminal with live runner output; postMessage relay bridges embedded dashboard → extension host
- [x] Phase E: Dashboard startup via `runTerminalPlanInBackground` — no separate OS window
- [x] Phase H: `schedulePostRunCheck()` — after dispatch, detects missing runner binary (error dialog + "Install in Terminal") and `awaiting_input` status (InputBox reply prompt + `patchbay reply` terminal)
- [x] Phase J: Multi-turn conversation support — `awaiting_input` in TaskStatus, `comment-discussion` icon in sidebar, reply flow via InputBox + terminal, provider setup commands (`configureClaude`, `configureCodex`, `configureGemini`), "Open Patchbay Output" button, `toggleTerminalPanel` status bar item
- [x] Phase K: Project import — `wntrmte.initializePatchbay` command initializes `.project-agents/` for existing repos via `patchbay init --yes` with auto-detected metadata; "Initialize Patchbay Workflow" button in Start Panel

## Companion: Patchbay

Wintermute is the native, first-class client for [Patchbay](https://github.com/Auda29/patchbay) — a lightweight orchestration dashboard for AI-assisted development. Patchbay thinks from the outside in (dashboard control), Wintermute from the inside out (IDE integration). Together they form a coherent abstraction layer.

## License

[MIT](LICENSE)
