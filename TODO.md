# Wintermute + Patchbay — Roadmap

## Legend

- `[w]` = wntrmte repo
- `[p]` = patchbay repo
- `[root]` = this repo (meta)

---

## Phase L — Agent Connector Architecture

**Stand:** Die L1–L4-Connector-Architektur ist umgesetzt (Core-Types, alle Provider-Connectors inkl. `HttpConnector` und **Cursor ACP** (`CursorAcpConnector` / `AcpConnector`), Orchestrator inkl. `denySession` / Session-Liste, Server + Dashboard-APIs). **L5** ist jetzt als Monorepo-Struktur angelegt (`packages/`, `schema/`, `docs/`, `ide/`), inklusive Shared-Type-Importen aus `@patchbay/core` in der Wintermute-Extension. **Offen:** L6–L7, Agent-Chat-UI + **Wintermute** postMessage. Details: `PLAN.md` Phase L.

Das Herzstück der Vision: Live Agent Interaction im Dashboard statt Batch-Runner mit Text-Heuristik. Provider-agnostisch — Connectors sind austauschbar (Claude Code, Codex, Gemini, HTTP, lokale Modelle, …).

### Provider-Integrations-Referenz (für L2)

Connectors mappen die **jeweils beste verfügbare** Anbieter-Schicht auf einheitliche `AgentEvent`s (Details auch in `VISION.md`):

| Provider | Bevorzugte Schicht | Kurz |
|----------|---------------------|------|
| **OpenAI Codex** | `codex app-server` (JSON-RPC, stdio/JSONL, Threads, serverinitiierte Approvals, gestreamte Events) | Deep-Integration wie VS-Code-Extension; [App Server](https://developers.openai.com/codex/app-server) |
| **Anthropic Claude Code** | CLI `--input-format stream-json` / `--output-format stream-json` (NDJSON) | Kein vollständiges Codex-App-Server-Äquivalent in einem Paket; Multi-Turn zusätzlich Agent SDK |
| **Google Gemini CLI** | Headless, JSON/Text, stdin ([Headless](https://google-gemini.github.io/gemini-cli/docs/cli/headless.html)) | Open Source; kein JSON-RPC-App-Server wie Codex |
| **Lokal (Ollama, …)** | HTTP (`/api/chat` u. a.) | In patchbay: `HttpConnector` (`packages/runners/http`) + Capabilities |
| **HTTP / kompatible APIs** | OpenAI: eher **Responses API** für Neues; Chat Completions weiter möglich | Kein fertiger Agent-/Approval-Loop — ggf. selbst bauen |
| **Cursor / ACP** | [Agent Client Protocol](https://agentclientprotocol.com) — JSON-RPC/stdio (`cursor agent acp`); `session/request_permission`, … | In patchbay: `CursorAcpConnector`, generisch `AcpConnector` (`@patchbay/runner-cursor-cli`); Cursor-Produkt bleibt proprietär |

**Hinweis Kosten:** OSS-CLIs ≠ kostenlose Modellnutzung — API/Abos bleiben beim Nutzer.

### L1: Core Types — Provider-agnostisches Connector-Interface — done `[p]`

- [x] `[p]` `AgentConnector`, `AgentSession`, `AgentEvent` in `packages/core/src/connector.ts`
- [x] `[p]` Event-Typen u. a. `session:started`, `agent:message`, `agent:tool_use`, `agent:permission`, `agent:question`, `session:completed`, `session:failed`
- [x] `[p]` `ConnectorRegistry` + `BaseConnector` / `BaseSession` (gemeinsame Session-/Lifecycle-Logik)
- [x] `[p]` Re-export in `packages/core/src/index.ts`

### L2: Provider Connectors — done `[p]`

#### L2a: Claude Code Connector

- [x] `[p]` `packages/runners/claude-code/src/connector.ts` + `stream-parser.ts` — NDJSON stream-json → `AgentEvent`

#### L2b: Codex Connector

- [x] `[p]` `CodexConnector` + `codex app-server` (JSON-RPC), `stream-parser.ts`; Batch-Runner bleibt Fallback

#### L2c: Gemini Connector

- [x] `[p]` `GeminiConnector` + `stream-parser.ts` — Headless/JSON

#### L2d: Connector-Erweiterbarkeit

- [x] `[p]` `docs/custom-connector.md` — Custom Connector Guide (inkl. **ACP**-Abschnitt, Mapping & Lifecycle)
- [x] `[p]` `packages/runners/http/src/connector.ts` — `HttpConnector` (OpenAI-kompatible APIs, Ollama, OpenRouter, …)
- [x] `[p]` `packages/runners/cursor-cli/src/connector.ts` + `acp-parser.ts` — **`CursorAcpConnector`** / **`AcpConnector`** ([ACP](https://agentclientprotocol.com)); Server registriert `CursorAcpConnector` in `runtime.ts`

### L3: Orchestrator — done `[p]`

- [x] `[p]` `registerConnector()`, `connectAgent()`, `sendInput()`, `approveSession()`, `denySession()`, `cancelSession()`, `listConnectors()`, `getSession()`, `listSessions()`, …
- [x] `[p]` `activeSessions` + `bridgeSessionEvents()` für Store-Updates

### L4: Server Streaming Endpoints — done `[p]`

- [x] `[p]` `POST /connect`, `GET /agent-events/:sessionId` (SSE), `POST /agent-input|approve|deny|cancel/:sessionId`, `GET /connectors`
- [x] `[p]` Dashboard: `/api/connect`, `/api/agent-input` (unified), `/api/connectors`

### L5: Monorepo-Konsolidierung

Vor dem Dashboard-Umbau zusammenführen — ab hier arbeiten Dashboard (patchbay) und Extension (wintermute) auf denselben Types und Events. Zwei Repos erzeugen ab diesem Punkt nur noch Reibung.

- [x] `[root]` wntrmte + patchbay in ein Monorepo zusammenführen: `packages/` (core, dashboard, cli, server, runners) + `ide/` (build, extensions, patches)
- [x] `[root]` Shared Types: duplizierte Interfaces (`store/types.ts` in wntrmte) durch Imports aus `@patchbay/core` ersetzen
- [ ] `[root]` Ein `package.json` Root-Workspace, ein CI, ein Git-Log
- [x] `[w]` `extension.ts` aufteilen — `CliManager`, `AuthService`, `TerminalOrchestrator` in `extensions/wntrmte-workflow/src/services/` (Monorepo-Merge steht weiterhin aus)

### L6: Dashboard — Agent Chat (PRIMARY)

- [ ] `[p]` `AgentChat.tsx` Komponente — Streaming Messages, Tool-Use-Anzeige, Permission-Dialoge, inline Replies, Cancel. Provider-agnostisch: rendert AgentEvents unabhängig von der Quelle
- [ ] `[p]` `DispatchDialog.tsx` — Provider-Auswahl: zeigt verfügbare Connectors + Batch-Runner, User wählt bevorzugten Provider. "Interactive Session" vs "Start Run" je nach Connector-Verfügbarkeit
- [ ] `[p]` `tasks/page.tsx` — AgentChat als Sliding Panel in der Task-Ansicht integrieren
- [ ] `[w]` Wintermute `DashboardPanel.ts` — postMessage-Relay: `wntrmte.connectAgent`, `sendAgentInput`, `approveAgent`, `denyAgent`, `cancelAgent` (Backend unterstützt Deny bereits)

### L7: Backward Compatibility

- [ ] `[p]` `/agents` Endpoint um `supportsConnector: boolean` und `connectorCapabilities` erweitern
- [ ] `[p]` Bestehende Batch-Runner, `/dispatch`, `/reply` bleiben unverändert
- [ ] `[p]` Provider ohne Connector fallen automatisch auf Batch-Runner zurück

---

## Danach: Erweiterungen (priorisiert)

### Features

- [ ] `[p]` Multi-Agent-Workflows — mehrere Agents parallel an einem Task, Cross-Verification
- [ ] `[p]` Agent-Sandboxing — isolierte Umgebungen pro Session (Git-Worktrees oder Container)
- [ ] `[p]` Workflow-Templates — vordefinierte Abläufe (Plan → Implement → Test → Review)
- [ ] `[p]` Community-Connectors — Ollama/LM Studio (HTTP), OpenRouter & eigene APIs (OpenAI-kompatibel, ggf. Responses API); weitere ACP-Agents via `AcpConnector`

### Distribution

- [ ] `[p]` `@patchbay/cli` auf npm veröffentlichen — ~9 Packages, Versionsstrategie, `--access public`. Sinnvoll erst wenn API stabil (nach Phase L).

### Optional

- [ ] `[p]` Server von Node-`http` auf Fastify migrieren

---

## Dependency Graph

```
Phase A–K          ✅ done
Phase L (patchbay) ✅ L1–L4 (Core, Connectors inkl. Http + Cursor ACP, Orchestrator, Server + Dashboard APIs)
Phase L (rest)     ⬜ L6 Agent Chat UI + Wintermute Relay (inkl. denyAgent) → L7 /agents Capabilities
Multi-Agent        ⬜ nach Phase L
npm Publish        ⬜ nach stabiler API (L6/L7)
```

---

## Abgeschlossen (Phase A–K)

<details>
<summary>Alle erledigten Tasks anzeigen</summary>

### Meta / Root

- [x] `[root]` Create `wintermute-patchbay.code-workspace`
- [x] `[w]` Create `AGENTS.md` with Patchbay cross-reference
- [x] `[p]` Create `AGENTS.md` with wntrmte cross-reference

### Patchbay Phase 1: Schema & Datenmodell

- [x] `[p]` Define `.project-agents/` directory structure spec
- [x] `[p]` Define core object schemas: Project, Task, Run, Decision, Agent Profile
- [x] `[p]` Create JSON Schemas in `schema/` (5 schemas)
- [x] `[p]` Implement `patchbay init` CLI command (basic, hardcoded defaults)
- [x] `[p]` Interactive `patchbay init` — prompts for name/goal/techStack via enquirer
- [x] `[p]` Copy JSON Schemas into `packages/core/schema/` for runtime validation

### Patchbay Phase 2: Orchestrator (Core)

- [x] `[p]` Implement file-based Store (read/write `.project-agents/`)
- [x] `[p]` Wire up `ajv` schema validation in Store
- [x] `[p]` Define Runner interface (TypeScript)
- [x] `[p]` Implement Orchestrator — task state, runner dispatch, run logs
- [x] `[p]` Add context file assembly in Orchestrator
- [x] `[p]` Fix Orchestrator `repoPath` — reads from stored `project.repoPath`, falls back to `cwd()`
- [x] `[p]` Add missing Store CRUD: `createTask` with auto-ID, `createDecision`
- [x] `[p]` Add `listDecisions()` to Core Store

### Patchbay Phase 3: Dashboard

- [x] `[p]` Scaffold Dashboard (Next.js + Tailwind)
- [x] `[p]` Build Dashboard UI — Sidebar, Overview, Tasks, Runs, Decisions pages
- [x] `[p]` Wire Dashboard to live data via API routes
- [x] `[p]` Dashboard pages converted to SWR client components (2s polling)
- [x] `[p]` Implement Artifact viewer, Kanban, DispatchDialog, Modals, DiffViewer
- [x] `[p]` SSE Event Bus, `/api/agents`, `/api/tasks` PATCH, `/api/runs` GET/POST

### Patchbay Phase 4: Runner-Adapter

- [x] `[p]` Implement Bash, HTTP, Cursor, Cursor CLI, Claude Code Runners
- [x] `[p]` Build runner dist files (bash/http/cursor compiled)

### Patchbay Phase 5 / wntrmte Phase 3: Extension

- [x] `[w]` Scaffold `extensions/wntrmte-workflow/`
- [x] `[w]` Implement FileStore, TaskTreeProvider, RunLogProvider, StatusBarItem
- [x] `[w]` Implement ApiStore (connected mode — SSE + polling), StoreFactory, DashboardPanel

### wntrmte Phase 1–2: Build + Branding

- [x] `[w]` Fix `serverDataFolderName`, extend disable-copilot patch, auto-generate macOS `.icns`

### wntrmte Phase 4: Source-Level Polish

- [x] `[w]` Custom Wintermute Dark theme, font defaults, compact chrome (title bar, sidebar, panel headers)
- [x] `[w]` Build integration, CI fix (`GITHUB_TOKEN` für `@vscode/ripgrep`), Patch fix für VS Code 1.110.0

### Phase 6 / wntrmte: Auth-System + Neue Runner + PatchbayRunner

- [x] `[p]` Auth-System (`RunnerAuth`, `loadConfig`/`saveConfig`), CLI auth commands
- [x] `[p]` Codex Runner, Gemini Runner, Claude Code + Cursor CLI accept `RunnerAuth`
- [x] `[p]` Dashboard + CLI register all 7 runners with auth
- [x] `[w]` Replace AgentRunner with PatchbayRunner (CLI delegation), runner picker QuickPick, CLI availability check

### Phase A: Workspace-Setup-Flow + Auth-Status UX

- [x] `[p]` `patchbay init` non-interactive (`--name`, `--goal`, `--tech-stack`, `-y/--yes`)
- [x] `[w]` `initViaCli()`, `setupWorkspace` Command, Fallback `createPatchbayWorkspace()`
- [x] `[w]` `checkPatchbayAuth()`, Auth-Badge, Auth-Card, `wntrmte.configureAuth` Command

### Phase B: Standalone HTTP Server (`@patchbay/server`)

- [x] `[p]` Package scaffolden, `createServer()`, alle Route-Handler (GET/POST/PATCH + dispatch + SSE)
- [x] `[p]` Runner-Bootstrap zentralisieren, `patchbay serve` CLI Command
- [x] `[w]` `dashboardUrl` Setting-Beschreibung aktualisiert

### Phase C: Test-Infrastruktur

- [x] `[p]` Vitest: 31 Tests (Store 14, Orchestrator 9, CLI 3, BashRunner 5) + CI
- [x] `[w]` Vitest + vscode-Mock: 21 Tests (FileStore 12, SetupInspector 9) + CI
- [x] `[p]` Playwright E2E: 11 Tests (board 6, dispatch 5) + CI

### Phase D: Dispatch UX + History Page

- [x] `[p]` `dispatchTaskAsync()` (HTTP 202), History-Seite
- [x] `[w]` postMessage-Relay in DashboardPanel, `wntrmte.dispatchInTerminal`
- [x] `[p]` DispatchDialog erkennt VS Code Webview-Kontext

### wntrmte Phase 5: Start Panel (MVP)

- [x] `[w]` Auto-open, DashboardPanel (Setup-State / Connected-State), SetupInspector
- [x] `[w]` Panel-Aktionen, Embedded Dashboard, Build + CI

### Phase E–I: Runner Robustness + Windows-Compat

- [x] `[p]` Runner Streaming (`exec` → `spawn`), shell-Compat, Timeout, Regression-Fixes
- [x] `[p]` `installHint` + Binary-Check, Dashboard Install-Button
- [x] `[w]` `scheduleInstallHintCheck()`, `runInTerminal`, `.yml` FileStore Support

### Phase J: Multi-Turn Runner Conversations

- [x] `[p]` Core: `ConversationTurn`, `awaiting_input`, Konversations-Felder
- [x] `[p]` Claude Code Runner: `detectQuestion()`, `--resume`, `buildPrompt()` (seit Refactor: `buildPrompt` in `@patchbay/core` / `runner.ts`, von allen CLI-Runners/Connectors genutzt)
- [x] `[p]` Orchestrator: `continueConversation()`, `buildConversationHistory()`
- [x] `[p]` CLI: `patchbay reply`, interaktive Follow-up-Loop
- [x] `[w]` Extension: `schedulePostRunCheck` Reply-Flow, "Awaiting Reply"-Icon
- [x] `[p]` Dashboard + Server: `/api/reply`, Reply-Modus, Kanban-Spalte

### Phase K: Projekt-Import

- [x] `[p]` `patchbay init` Auto-Detect (`detectProjectMeta`) + Context-Bootstrap
- [x] `[w]` `wntrmte.initializePatchbay` Command, Start Panel Button

### Extension Polish

- [x] `[w]` Auth-Commands (`configureClaude/Codex/Gemini`), Output-Button, `test-electron`
- [x] `[w]` Terminal-Toggle StatusBar, DashboardPanel async, Hero entfernt

### Housekeeping

- [x] `[p]` CLI Shebang fix, Slug-IDs, Codex Noise-Filter, DispatchDialog Sortierung
- [x] `[root]` VISION.md, TODO.md, PLAN.md, AGENTS.md aktualisiert

### Patchbay Phase L — L1–L4 (Connector-Backend)

- [x] `[p]` Core `connector.ts`, alle Provider-Connectors (claude-code, codex app-server, gemini, http, **cursor-cli ACP**), Orchestrator-Session-API, Server-Routes + Dashboard-Proxies, `docs/custom-connector.md` (inkl. ACP)

</details>
