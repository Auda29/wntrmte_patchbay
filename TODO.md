# Wintermute + Patchbay — Roadmap

## Legend

- `[w]` = wntrmte repo
- `[p]` = patchbay repo
- `[root]` = this repo (meta)

---

## Nächster Meilenstein: Phase L — Agent Connector Architecture

Das Herzstück der neuen Vision: Live Agent Interaction im Dashboard statt Batch-Runner mit Text-Heuristik. Provider-agnostisch — die Architektur ist generisch, Connectors sind austauschbar (Claude Code, Codex, Gemini, lokale Modelle, ...).

### L1: Core Types — Provider-agnostisches Connector-Interface

- [ ] `[p]` `AgentConnector`, `AgentSession`, `AgentEvent` Interfaces in `packages/core/src/connector.ts` — generisch, nicht an einen Provider gebunden
- [ ] `[p]` Event-Typen: `session:started`, `agent:message`, `agent:tool_use`, `agent:permission`, `agent:question`, `session:completed`, `session:failed`
- [ ] `[p]` `ConnectorRegistry` — dynamische Registrierung von Connectors, analog zur bestehenden Runner-Registry
- [ ] `[p]` `BaseConnector` abstrakte Klasse — gemeinsame Logik (Session-Lifecycle, Event-Emitting, Timeout-Handling) die alle Provider-Connectors erben

### L2: Provider Connectors

Jeder Provider bekommt seinen eigenen Connector. Claude Code zuerst (reichste API), dann Codex + Gemini parallel. Architektur erlaubt Community-Connectors für weitere Provider.

#### L2a: Claude Code Connector (erster Proof-of-Concept)

- [ ] `[p]` `ClaudeCodeConnector` in `packages/runners/claude-code/src/connector.ts` — spawnt `claude -p --output-format stream-json`
- [ ] `[p]` Stream-Parser in `packages/runners/claude-code/src/stream-parser.ts` — NDJSON → AgentEvent Mapping
- [ ] `[p]` Vorab klären: Welche Events liefert `stream-json` bei Permission-Requests? Ist stdin-basierte Approval möglich?

#### L2b: Codex Connector

- [ ] `[p]` `CodexConnector` in `packages/runners/codex/src/connector.ts` — evaluieren ob Codex CLI strukturierte Events unterstützt, Fallback auf stdout-Parsing
- [ ] `[p]` Codex-spezifische Event-Mappings (Noise-Filtering bereits vorhanden)

#### L2c: Gemini Connector

- [ ] `[p]` `GeminiConnector` in `packages/runners/gemini/src/connector.ts` — evaluieren ob Gemini CLI Streaming-Output bietet
- [ ] `[p]` Gemini-spezifische Event-Mappings

#### L2d: Connector-Erweiterbarkeit

- [ ] `[p]` Dokumentation: "How to build a custom Connector" — Interface-Contract, Event-Mapping, Beispiel-Implementierung
- [ ] `[p]` Perspektivisch: Connectors für lokale Modelle (Ollama, LM Studio), HTTP-basierte Agents (OpenRouter, eigene APIs)

### L3: Orchestrator

- [ ] `[p]` `registerConnector()`, `connectAgent()`, `sendInput()`, `approveSession()`, `cancelSession()` in `orchestrator.ts`
- [ ] `[p]` Session-Map für aktive AgentSessions; Event-Listener für Store-Updates bei Session-Events
- [ ] `[p]` `listConnectors()` — verfügbare Connectors mit Capabilities (streaming, approval, multi-turn) zurückgeben

### L4: Server Streaming Endpoints

- [ ] `[p]` `POST /connect` → startet interactive Session, gibt `sessionId` zurück (provider-agnostisch: `{ taskId, connectorId }`)
- [ ] `[p]` `GET /agent-events/:sessionId` → SSE-Stream von AgentEvents (gleiches Format unabhängig vom Provider)
- [ ] `[p]` `POST /agent-input/:sessionId` + `POST /agent-approve/:sessionId` + `POST /agent-cancel/:sessionId`
- [ ] `[p]` `GET /connectors` → Liste verfügbarer Connectors mit Capabilities
- [ ] `[p]` Dashboard API Routes als Next.js Proxies (`/api/connect`, `/api/agent-input`, `/api/connectors`)

### L5: Monorepo-Konsolidierung

Vor dem Dashboard-Umbau zusammenführen — ab hier arbeiten Dashboard (patchbay) und Extension (wintermute) auf denselben Types und Events. Zwei Repos erzeugen ab diesem Punkt nur noch Reibung.

- [ ] `[root]` wntrmte + patchbay in ein Monorepo zusammenführen: `packages/` (core, dashboard, cli, server, runners) + `ide/` (build, extensions, patches)
- [ ] `[root]` Shared Types: duplizierte Interfaces (`store/types.ts` in wntrmte) durch Imports aus `@patchbay/core` ersetzen
- [ ] `[root]` Ein `package.json` Root-Workspace, ein CI, ein Git-Log
- [ ] `[w]` `extension.ts` aufteilen (>1200 Zeilen) — `CliManager`, `AuthService`, `TerminalOrchestrator` extrahieren. Natürlicher Zeitpunkt im Rahmen des Merges.

### L6: Dashboard — Agent Chat (PRIMARY)

- [ ] `[p]` `AgentChat.tsx` Komponente — Streaming Messages, Tool-Use-Anzeige, Permission-Dialoge, inline Replies, Cancel. Provider-agnostisch: rendert AgentEvents unabhängig von der Quelle
- [ ] `[p]` `DispatchDialog.tsx` — Provider-Auswahl: zeigt verfügbare Connectors + Batch-Runner, User wählt bevorzugten Provider. "Interactive Session" vs "Start Run" je nach Connector-Verfügbarkeit
- [ ] `[p]` `tasks/page.tsx` — AgentChat als Sliding Panel in der Task-Ansicht integrieren
- [ ] Wintermute `DashboardPanel.ts` — postMessage-Relay für neue Commands (`wntrmte.connectAgent`, `wntrmte.sendAgentInput`, `wntrmte.approveAgent`, `wntrmte.cancelAgent`)

### L7: Backward Compatibility

- [ ] `/agents` Endpoint um `supportsConnector: boolean` und `connectorCapabilities` erweitern
- [ ] Bestehende Batch-Runner, `/dispatch`, `/reply` bleiben unverändert
- [ ] Provider ohne Connector fallen automatisch auf Batch-Runner zurück

---

## Danach: Erweiterungen (priorisiert)

### Features

- [ ] `[p]` Multi-Agent-Workflows — mehrere Agents parallel an einem Task, Cross-Verification
- [ ] `[p]` Agent-Sandboxing — isolierte Umgebungen pro Session (Git-Worktrees oder Container)
- [ ] `[p]` Workflow-Templates — vordefinierte Abläufe (Plan → Implement → Test → Review)
- [ ] `[p]` Community-Connectors — Ollama, LM Studio, OpenRouter, eigene HTTP-APIs

### Distribution

- [ ] `[p]` `@patchbay/cli` auf npm veröffentlichen — ~9 Packages, Versionsstrategie, `--access public`. Sinnvoll erst wenn API stabil (nach Phase L).

### Optional

- [ ] `[p]` Server von Node-`http` auf Fastify migrieren

---

## Dependency Graph

```
Phase A–K          ✅ done (Grundlagen: Schema, Orchestrator, Dashboard, Runner, Extension, Multi-Turn)
Phase L            ⬜ next (Agent Connector Architecture — Live Agent Interaction)
  L1 Core Types (provider-agnostisch)
    → L2a Claude Code Connector (erster PoC)
    → L2b Codex Connector        ─┐
    → L2c Gemini Connector        ├─ parallel nach L2a
    → L2d Connector-Docs          ─┘
      → L3 Orchestrator → L4 Server
        → L5 Monorepo-Konsolidierung (+ extension.ts Refactoring)
          → L6 Dashboard Agent Chat (+ Wintermute postMessage-Relay)
Multi-Agent          ⬜ nach Phase L
Community Connectors ⬜ nach Connector-Docs (Ollama, LM Studio, OpenRouter, ...)
npm Publish          ⬜ nach stabiler API
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
- [x] `[p]` Claude Code Runner: `detectQuestion()`, `--resume`, `buildPrompt()`
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

</details>
