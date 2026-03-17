# Plan: Patchbay — Lightweight Control Plane für AI-assisted Development

## Context

Viele Entwickler arbeiten parallel mit Cursor, Claude Code, Codex, Bash und weiteren Tools. Das Problem ist nicht die Qualität dieser Tools, sondern dass Kontext verloren geht, Aufgaben über Chats und Terminals verstreut sind, Entscheidungen undokumentiert bleiben und unklar ist, welches Tool was geändert hat.

**Patchbay** ist kein Ersatz für bestehende Tools, sondern eine leichte Orchestrierungs- und Kontrollschicht:

> Ein zentrales Dashboard, das bestehende Tools wie Cursor, Claude Code, Codex, Bash und HTTP-Runner über CLI oder standardisierte Adapter als koordinierte Worker steuert.

**Zielgruppe:** Solo-Developer, kleine Teams, OSS-Maintainer, Side Projects.

**Leitprinzipien:**
- Dashboard-first — das Dashboard ist die Zentrale, nicht Deko
- Repo-first — Zustand im Repo, git-versioniert, transparent
- CLI-first — CLI als robuste, logbare Integrationsschicht
- Tool-agnostisch — kein Lock-in auf ein bestimmtes AI-Tool

**Zusammenspiel mit wntrmte:** Patchbay denkt von außen nach innen (externes Dashboard), wntrmte von innen nach außen (native IDE). Zusammen bilden sie einen kohärenten Abstraktions-Layer. wntrmte ist der First-Class-Client, nicht der einzige. Siehe `VISION.md`.

---

## Repo-Struktur (Endstand)

```
patchbay/
├── schema/                          # .project-agents/ Schema-Definition
│   ├── project.schema.json
│   ├── task.schema.json
│   ├── run.schema.json
│   ├── decision.schema.json
│   └── agent-profile.schema.json
├── packages/
│   ├── core/                        # Orchestrator-Kern
│   │   ├── src/
│   │   │   ├── orchestrator.ts      # Task-State, Runner-Dispatch
│   │   │   ├── runner.ts            # Runner-Interface & Registry
│   │   │   ├── store.ts             # File-basierter State (.project-agents/)
│   │   │   └── types.ts             # Shared Types (Project, Task, Run, ...)
│   │   └── package.json
│   ├── cli/                         # CLI-Tool
│   │   ├── src/
│   │   │   └── index.ts             # patchbay init, task, run, status, ...
│   │   └── package.json
│   ├── dashboard/                   # Web-Dashboard
│   │   ├── src/
│   │   │   ├── app/                 # Next.js / SvelteKit App
│   │   │   └── components/          # Projects, Tasks, Runs, Artifacts, Decisions
│   │   └── package.json
│   └── runners/                     # Runner-Adapter
│       ├── bash/
│       ├── http/
│       ├── cursor/
│       ├── cursor-cli/
│       ├── claude-code/
│       ├── codex/
│       └── gemini/
├── PLAN.md
├── CLAUDE.md
├── LICENSE
└── package.json                     # Workspace Root
```

---

## Phase 1: Schema & Datenmodell

**Ziel:** Das `.project-agents/`-Format definieren — die gemeinsame Sprache zwischen Patchbay, wntrmte und allen Runnern.

### 1.1 `.project-agents/`-Verzeichnisstruktur festlegen

```
.project-agents/
  project.yml                        # Projektbeschreibung
  agents/
    cursor-builder.yml               # Runner-Profile
    reviewer.yml
  tasks/
    TASK-001.md                      # Tasks als Markdown
    TASK-002.md
  decisions/
    DEC-001-use-open-vsx.md          # Technische Entscheidungen
  runs/
    2026-03-06-task-001-cursor.json  # Run-Logs als JSON
  context/
    architecture.md                  # Projektkontext für Agenten
    conventions.md
    current-focus.md
```

### 1.2 Kernobjekte definieren

**Project:**
- name, repo path, goal, rules, tech stack

**Agent / Runner Profile:**
- role, tool type, model/provider, allowed tools, prompt/profile, scope

**Task:**
- id, title, description, goal, status (`open` | `in_progress` | `blocked` | `review` | `done`), owner, affected files, acceptance criteria, result

**Run:**
- task reference, runner, start time, end time, status (`running` | `completed` | `failed` | `cancelled`), logs, summary, diff reference, blockers, suggested next steps

**Decision:**
- id, title, rationale, proposed by, approved by, timestamp

**Artifact:**
- Patch, Diff, Markdown-Summary, Changelog-Entwurf, Fehlerbericht

### 1.3 JSON-Schemas erstellen

Für jedes Kernobjekt ein JSON-Schema in `schema/` — validierbar, dokumentiert, versioniert.

### Verifikation:
- `patchbay init` in einem Test-Repo erstellt eine valide `.project-agents/`-Struktur
- Schema-Validierung gegen Beispieldateien erfolgreich
- Dateien sind mit normalen Tools (cat, jq, Editor) lesbar

---

## Phase 2: Orchestrator (Core)

**Ziel:** Der Kern des Systems — verwaltet Tasks, dispatcht Runner, sammelt Ergebnisse.

### 2.1 Store — File-basierter State

Liest und schreibt `.project-agents/`-Dateien. Kein externer DB-Zwang.

- `listTasks()`, `getTask(id)`, `createTask(...)`, `updateTask(id, ...)`
- `listRuns(taskId)`, `createRun(...)`, `updateRun(id, ...)`
- `listDecisions()`, `createDecision(...)`
- File-Watcher für externe Änderungen (optional)

### 2.2 Runner-Interface

Gemeinsamer Minimalvertrag für alle Runner:

```typescript
interface RunnerInput {
  taskId: string
  repoPath: string
  branch: string
  affectedFiles: string[]
  contextFiles: string[]
  projectRules: string
  goal: string
  outputFormat: string
}

interface RunnerOutput {
  status: 'completed' | 'failed' | 'blocked'
  summary: string
  changedFiles: string[]
  diffRef?: string
  logs: string[]
  blockers?: string[]
  suggestedNextSteps?: string[]
}

interface Runner {
  name: string
  execute(input: RunnerInput): Promise<RunnerOutput>
}
```

### 2.3 Orchestrator

- Task-State verwalten (Zustandsübergänge validieren)
- Projektkontext zusammensetzen (aus `context/`-Dateien)
- Runner laden und starten
- Run-Logs und Ergebnisse speichern
- Status aktualisieren

### Verifikation:
- Orchestrator kann einen Task erstellen, einen Bash-Runner dispatchen, Run-Log schreiben
- `.project-agents/`-Dateien werden korrekt geschrieben und sind valide gegen Schema
- State-Übergänge werden validiert (kein Sprung von `open` zu `done`)

---

## Phase 3: Dashboard (Web-UI) — DONE

**Ziel:** Zentrales Web-Dashboard als Control Panel + Dispatch + Review Station.

### 3.1 Hauptbereiche

| Bereich | Funktion |
|---------|----------|
| **Projects** | Repo, Ziel, Status, letzte Aktivität |
| **Tasks** | Anlegen, Status-Board (open → in_progress → review → done), Blocker |
| **Runs** | Runner, Startzeit, Dauer, Status, Logs, Summary |
| **Artifacts** | Diffs, Patches, generierte Dokumente, Run-Summaries |
| **Decisions** | Technische Entscheidungen, Begründungen, Bestätigungsstatus |

### 3.2 Dashboard-Aktionen

- Tasks anlegen und verwalten
- Runner auswählen
- Runs starten, stoppen, neu starten
- Logs und Status live verfolgen
- Diffs und Artefakte reviewen
- Entscheidungen dokumentieren und bestätigen
- Blockierte Tasks sichtbar machen und neu zuweisen

### 3.3 Technische Entscheidungen

- Lokal oder self-hosted (kein Cloud-Zwang)
- Kommuniziert mit Orchestrator via API (HTTP/WebSocket)
- Ein Projekt pro Repo als Startpunkt

### Verifikation:
- Dashboard zeigt Tasks, Runs, Artifacts eines Test-Projekts an
- Task kann über Dashboard angelegt und einem Runner zugewiesen werden
- Run-Logs werden live angezeigt
- Diff-Viewer zeigt Änderungen eines abgeschlossenen Runs

---

## Phase 4: Runner-Adapter

**Ziel:** Externe Tools über standardisierte Adapter anbinden.

### 4.1 Bash Runner

Erster und wichtigster Runner. Führt Shell-Befehle aus, sammelt Output.

- Input: Befehl(e) aus Task-Goal ableiten oder explizit angeben
- Output: stdout/stderr als Logs, Exit-Code als Status, Diff aus Git
- Anwendung: Build, Tests, Git-Operationen, Skripte

### 4.2 HTTP Runner

Ruft externe APIs oder Dokumentation ab.

- Input: URL(s), erwartetes Format
- Output: Response-Body, Status
- Anwendung: Doku abrufen, APIs testen, externe Kontexte einbinden

### 4.3 Cursor Runner (Stufe 1: pragmatisch)

- Strukturierte Task-Dateien im Repo bereitstellen
- Kontextdateien vorbereiten
- Ergebnisse aus Diffs, Logs, Artefakten zurücklesen
- Kein direkter API-Zugriff nötig — rein dateibasiert

### 4.4 Claude Code Runner

- CLI-Wrapper um `claude -p` falls CLI verfügbar
- Prompt aus Task-Goal + Kontext zusammensetzen
- Output parsen und als RunnerOutput zurückgeben
- Graceful fallback wenn `claude` nicht im PATH

### 4.5 Cursor CLI Runner

- CLI-Wrapper um `cursor agent -p` (Headless-Modus)
- Identisches Prompt-Modell wie Claude Code Runner
- `--output-format text` für maschinenlesbaren Output
- Graceful fallback wenn `cursor` nicht im PATH

### 4.6 Codex Runner

- CLI-Wrapper um `codex exec "<prompt>"`
- Prompt aus Task-Goal + Kontext zusammensetzen (shared `buildPrompt()`)
- Env Var `OPENAI_API_KEY` bei apiKey-Auth injizieren
- Graceful fallback wenn `codex` nicht im PATH

### 4.7 Gemini Runner

- CLI-Wrapper um `gemini -p "<prompt>"`
- Prompt aus Task-Goal + Kontext zusammensetzen (shared `buildPrompt()`)
- Env Var `GEMINI_API_KEY` bei apiKey-Auth injizieren
- Graceful fallback wenn `gemini` nicht im PATH

### Verifikation:
- Bash Runner: `echo "hello"` → Run mit Status completed, Log enthält "hello"
- HTTP Runner: Fetch einer URL → Run mit Response-Body als Artifact
- Cursor Runner: Task-Datei wird erstellt, nach manuellem Cursor-Run wird Diff eingesammelt
- Claude Code Runner: `claude -p "<prompt>"` → Run mit Output als Log
- Cursor CLI Runner: `cursor agent -p "<prompt>"` → Run mit Output als Log
- Codex Runner: `codex exec "<prompt>"` → Run mit Output als Log
- Gemini Runner: `gemini -p "<prompt>"` → Run mit Output als Log

---

## Phase 5: wntrmte-Integration

**Ziel:** wntrmte Phase 3 Extension als nativer Patchbay-Client.

### 5.1 Offline-Modus (file-based)

- Extension liest `.project-agents/` direkt aus dem Workspace
- Tasks, Runs, Decisions im Editor sichtbar — ohne laufendes Patchbay-Backend
- Nützlich ab Day 1, auch ohne Dashboard

### 5.2 Connected-Modus

- Verbindung zu Patchbay-Backend via WebSocket/HTTP
- Live-Updates: Task-Status, Run-Logs, neue Artifacts
- Patchbay-Dashboard als Webview-Panel innerhalb von wntrmte

### 5.3 Agent Dispatch (PatchbayRunner)

- wntrmte delegiert Task-Ausführung an Patchbay CLI (`patchbay run <taskId> <runnerId>`)
- Runner-Picker mit konfigurierbarem `defaultRunner` Setting
- Live-Output-Streaming in VS Code Output Channel "Patchbay"
- CancellationToken-Support (proc.kill() bei Abbruch)

### Verifikation:
- Extension zeigt Tasks aus `.project-agents/` im Tree View
- Bei laufendem Patchbay-Backend: Live-Status-Updates im Editor
- `wntrmte.dispatch` → Task-Picker → Runner-Picker → `patchbay run` spawnt und streamt Output

---

## Kommunikationsmodell

Keine freie Agent-zu-Agent-Kommunikation. Stattdessen strukturiert über:

- **Tasks** — Arbeitsaufträge
- **Run-Kommentare** — Ergebnisse und Blocker
- **Reviews** — Feedback und Nacharbeit
- **Decisions** — Bestätigte technische Entscheidungen

Ablauf: Builder liefert Ergebnis → Reviewer kommentiert → Mensch bestätigt → Task-Status ändert sich.

---

## v1-Scope

### Im Fokus
- Dashboard (lokal/self-hosted)
- Task-Modell + Run-Modell
- CLI-Dispatch
- Run-Historie
- Diffs / Artefakte
- Review-Flow
- Decision-Log
- Bash & HTTP Runner
- Cursor als dateibasierter Runner
- Claude Code Runner (CLI)
- Cursor CLI Runner (Headless)
- Codex Runner (CLI)
- Gemini Runner (CLI)
- Auth-System (API Key + Subscription Mode)

### Bewusst nicht in v1
- Komplexe Multi-User-Organisation
- Cloud-Zwang
- Agenten-Hierarchien / autonome Schwärme
- Budgets / Kostenstellen
- Zu frühe tiefe IDE-Plugins (über file-based hinaus)
- Überladene Governance

---

## Status

### Phase 1: Schema & Datenmodell — DONE
- [x] `.project-agents/`-Verzeichnisstruktur festgelegt
- [x] Kernobjekte (Project, Task, Run, Decision, Agent Profile) definiert
- [x] JSON-Schemas in `schema/` erstellt
- [x] `patchbay init` erstellt valide Struktur

### Phase 2: Orchestrator (Core) — DONE
- [x] File-basierter Store implementiert
- [x] Runner-Interface definiert
- [x] Orchestrator: Task-State + Runner-Dispatch
- [x] Run-Logs werden korrekt geschrieben

### Phase 3: Dashboard (Web-UI) — DONE
- [x] Projekt-Übersicht
- [x] Task-Board (Kanban-Stil)
- [x] Run-Viewer mit Logs
- [x] Diff/Artifact-Viewer
- [x] Decision-Log
- [x] Interaktive Aktionen (Task/Decision anlegen, Dispatch starten)
- [x] Dashboard-Polish aus Wintermute-Embedding-Tests
  - Next.js Dev-Indicator standardmäßig auf `bottom-right`
  - Dev-Server läuft derzeit bewusst über `next dev --webpack` statt Turbopack
  - Task-Status-Dropdown nicht mehr durch Card-Overflow abgeschnitten
  - Dispatch-Dialog zeigt neben Kurzfehler auch `hint` + aufklappbare technische Details
  - Dispatch-Route nutzt denselben `REPO_ROOT` wie das restliche Dashboard statt implizit `process.cwd()`
  - Projektdaten (`goal`, `rules`, `techStack`) direkt im Dashboard editierbar

### Phase 4: Runner-Adapter — DONE
- [x] Bash Runner
- [x] HTTP Runner
- [x] Cursor Runner (Stufe 1: dateibasiert)
- [x] Claude Code Runner (`claude -p`)
- [x] Cursor CLI Runner (`cursor agent -p`)
- [x] Codex Runner (`codex exec`)
- [x] Gemini Runner (`gemini -p`)

### Phase 5: wntrmte-Integration — DONE
- [x] Phase 5.1 — Offline-Modus: Extension liest `.project-agents/` direkt (FileStore, TaskTreeProvider, StatusBarItem, RunLogProvider, setStatus command)
- [x] Phase 5.2 — Connected-Modus: SSE EventBus, ApiStore via HTTP, StoreFactory (auto/offline/connected), Runs-Endpoint (GET/POST), Dashboard Webview-Panel (iframe)
- [x] Phase 5.3 — ~~AgentRunner (vscode.lm LLM-Loop)~~ → replaced by PatchbayRunner (CLI delegation via `patchbay run`)

### Phase 6: Auth-System + Neue Runner — DONE
- [x] `RunnerAuth` type (`subscription` | `apiKey`) in `packages/core/src/auth.ts`
- [x] `loadConfig()` / `saveConfig()` — reads/writes `~/.patchbay/config.json` (chmod 600)
- [x] `patchbay auth set/list/clear` CLI commands
- [x] Claude Code + Cursor CLI runners accept `RunnerAuth` constructor param
- [x] Codex Runner (`codex exec`) — new package `@patchbay/runner-codex`
- [x] Gemini Runner (`gemini -p`) — new package `@patchbay/runner-gemini`
- [x] All 7 runners registered with auth in CLI, Dashboard dispatch + agents routes
- [x] wntrmte extension: PatchbayRunner replaces AgentRunner/ToolRegistry/ApprovalGate

### Phase 7a: Non-Interactive Init — DONE
- [x] `patchbay init` Optionen: `--name <name>`, `--goal <goal>`, `--tech-stack <stack>`, `-y/--yes`
- [x] Wenn `--yes`: Prompts überspringen, defaults oder übergebene Werte nutzen
- [x] Bestehende interaktive Nutzung bleibt unverändert
- Ermöglicht CLI-Delegation aus wntrmte Extension (kein TTY bei `child_process.spawn`)

### Phase 7b: Standalone HTTP Server (`@patchbay/server`) — DONE

**Ziel:** Orchestrator-API als leichtgewichtiger Server ohne Next.js-Abhängigkeit.

**Umgesetzt:**

- `packages/server/` mit allen Route-Handlern in `src/handlers/`
- `createConfiguredOrchestrator()` als gemeinsame Runtime-Factory — von CLI, Dashboard und Standalone-Server genutzt
- `createServer(opts)` registriert alle Endpoints inkl. Write-Endpunkte und SSE
- `eventBus.ts` — Filesystem-Watcher mit Debounce
- `utils.ts` — `sendJson`, `readBody`, `parseQueryString`
- Dashboard `dispatch/route.ts` nutzt `createConfiguredOrchestrator` aus `@patchbay/server` — Runner-Bootstrap nicht mehr dupliziert
- CLI-Command `patchbay serve` integriert
- Build erfolgreich

**Package-Struktur:**
```
packages/server/
  src/
    index.ts            # Exporte
    server.ts           # createServer(opts) — Node HTTP server, alle Routen
    runtime.ts          # createConfiguredOrchestrator()
    eventBus.ts         # Filesystem-Watcher (Singleton, Debounce)
    utils.ts            # sendJson, readBody, parseQueryString
    handlers/
      state.ts          # GET /state
      tasks.ts          # GET /tasks, GET /tasks/:id, POST /tasks, PATCH /tasks/:id
      runs.ts           # GET /runs, POST /runs
      decisions.ts      # GET /decisions, POST /decisions
      agents.ts         # GET /agents
      artifacts.ts      # GET /artifacts
      dispatch.ts       # POST /dispatch
      events.ts         # GET /events (SSE)
```

**Implementierte Routen:**

- `GET /health` — Liveness-Check
- `GET /state` — Projekt, Tasks, Runs, Decisions
- `GET /tasks` / `POST /tasks` — listen / anlegen
- `GET /tasks/:id` / `PATCH /tasks/:id` — einzeln lesen / Status ändern
- `GET /runs?taskId=` / `POST /runs` — listen / persistieren
- `GET /decisions` / `POST /decisions` — listen / anlegen
- `GET /agents` — Agent-Profile aus `.project-agents/agents/`
- `GET /artifacts` — Context-Dateien + Run-Diff-Referenzen
- `POST /dispatch` — Task über registrierten Runner ausführen
- `GET /events` — SSE `change`-Events bei Store-Änderungen

**Offen (explizit optional):**

- [ ] Server von Node-`http` auf Fastify migrieren

**Abgrenzung:** Dashboard bleibt unverändert. Standalone-Server ist für Clients ohne Dashboard (wntrmte Extension, CI, externe Tools).

---

### npm-Publish (`@patchbay/cli` + Dependencies) — ausstehend

**Ziel:** `npm install -g @patchbay/cli` funktioniert ohne Repo-Clone (wird vom Wintermute Install-QuickPick als erste Option angeboten).

**Voraussetzungen (müssen alle erfüllt sein):**

- [ ] Alle internen Packages einzeln auf npm veröffentlichen — `@patchbay/core`, `@patchbay/server`, `@patchbay/runner-bash`, `@patchbay/runner-http`, `@patchbay/runner-cursor`, `@patchbay/runner-cursor-cli`, `@patchbay/runner-claude-code`, `@patchbay/runner-codex`, `@patchbay/runner-gemini` (~9 Packages vor `@patchbay/cli`)
- [ ] Interne `"*"`-Versionen in allen `package.json` durch konkrete Versionsnummern ersetzen
- [ ] Alle `package.json` um Pflichtfelder ergänzen: `"files"`, `"description"`, `"license"`, `"repository"`, `"engines"`
- [ ] Versionsstrategie festlegen (manuell koordiniert oder Tool wie `changesets`)
- [ ] Ersten Publish aller scoped Packages mit `--access public`

**Hinweis:** Sinnvoll erst wenn die API stabil ist. Der Clone/Build-Fallback in Wintermute funktioniert bis dahin.

---

## Phase D: Dispatch UX + History Page — ausstehend

Gefunden beim manuellen Testen des ersten Windows-Builds.

### D1: Non-blocking Dispatch

**Problem:** `POST /dispatch` blockiert bis der Runner fertig ist (Minuten bei claude-code). Der Dispatch-Dialog in der UI bleibt während dieser Zeit offen.

**Lösung:** `dispatchTaskAsync()` im Orchestrator — gibt sofort einen `running`-Run zurück, Runner läuft in detached floating Promise.

- [ ] `packages/core/src/orchestrator.ts` — `dispatchTaskAsync(taskId, runnerId): Promise<Run>` neben bestehendem `dispatchTask()`. Pre-flight (validate, task auf `in_progress`, Run anlegen) synchron, `runner.execute()` in detached `.then(finalize).catch(setFailed)`. `dispatchTask()` bleibt unverändert (Tests + CLI).
- [ ] `packages/dashboard/src/app/api/dispatch/route.ts` — `dispatchTaskAsync` nutzen, `NextResponse.json(run, { status: 202 })` zurückgeben
- [ ] `packages/server/src/handlers/dispatch.ts` — `dispatchTaskAsync` + `sendJson(response, 202, run)`
- [ ] `packages/core/src/orchestrator.test.ts` — Tests für `dispatchTaskAsync`: sofortiger `running`-Run, task `in_progress` synchron, Run finalisiert nach Runner-Ende

### D2: History Page

**Problem:** Sidebar-Link "History" existiert im Dashboard, die Route `/history` fehlt → 404.

- [ ] `packages/dashboard/src/app/history/page.tsx` (neu) — listet alle vergangenen Runs aus `/api/runs`, sortiert nach Datum (neueste zuerst). Spalten: Run ID, Task, Runner, Status, Gestartet, Dauer. Nutzt bestehenden `useSWR`-Pattern aus anderen Seiten (z.B. `runs/page.tsx`), keine neuen Komponenten.

---

## Phase C: Test-Infrastruktur — DONE

### Schicht 1: Patchbay Core + CLI (Vitest) — 31 Tests

- [x] `vitest` als Root-devDependency + `"test": "vitest run"` Script in `patchbay/package.json`
- [x] `vitest.config.ts` im Patchbay-Root (include: `packages/*/src/**/*.test.ts`)
- [x] `packages/core/src/store.test.ts` — Store CRUD gegen `os.tmpdir()` Fixture (14 Tests)
- [x] `packages/core/src/orchestrator.test.ts` — Task-State-Transitions (9 Tests)
- [x] `packages/cli/src/init.test.ts` — `patchbay init --yes` via `execSync`, prüft alle 5 Subdirs (3 Tests)
- [x] `packages/runners/bash/src/runner.test.ts` — BashRunner mit fixture command (5 Tests)
- [x] CI: `npm test` Step in `.github/workflows/build.yml` (nach build)

### Schicht 2: Dashboard E2E (Playwright)

- [x] `@playwright/test` in `packages/dashboard/` + `playwright.config.ts` (webServer: Next.js gegen Fixture, via `env`)
- [x] `e2e/fixtures/.project-agents/` — Seeded Fixture-Workspace (project.yml + TASK-001.yml)
- [x] `e2e/tests/board.spec.ts` — Kanban-Board rendert Tasks, Dispatch-Button sichtbar (6 Tests)
- [x] `e2e/tests/dispatch.spec.ts` — Dispatch-Dialog: öffnen, Felder prüfen, schließen (5 Tests)
- [x] CI: Playwright-Install + `npm run test:e2e` in `build.yml` (nur Chromium)
