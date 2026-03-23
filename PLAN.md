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
- Prompt aus Task-Goal + Kontext zusammensetzen (shared `buildPrompt()` in `@patchbay/core` / `runner.ts`)
- Output parsen und als RunnerOutput zurückgeben
- Graceful fallback wenn `claude` nicht im PATH

### 4.5 Cursor CLI Runner

- CLI-Wrapper um `cursor agent -p` (Headless-Modus)
- Identisches Prompt-Modell wie Claude Code Runner
- `--output-format text` für maschinenlesbaren Output
- Graceful fallback wenn `cursor` nicht im PATH

### 4.6 Codex Runner

- CLI-Wrapper um `codex exec "<prompt>"`
- Prompt aus Task-Goal + Kontext zusammensetzen (shared `buildPrompt()` in `@patchbay/core` / `runner.ts`)
- Env Var `OPENAI_API_KEY` bei apiKey-Auth injizieren
- Graceful fallback wenn `codex` nicht im PATH

### 4.7 Gemini Runner

- CLI-Wrapper um `gemini -p "<prompt>"`
- Prompt aus Task-Goal + Kontext zusammensetzen (shared `buildPrompt()` in `@patchbay/core` / `runner.ts`)
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
      reply.ts          # POST /reply
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
- `POST /reply` — bestehende Runner-Konversation fortsetzen
- `GET /events` — SSE `change`-Events bei Store-Änderungen

**Offen:**

- [ ] *(optional)* Server von Node-`http` auf Fastify migrieren

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

## Phase D: Dispatch UX + History Page — DONE

Gefunden beim manuellen Testen des ersten Windows-Builds.

### D1: Non-blocking Dispatch

**Problem:** `POST /dispatch` blockiert bis der Runner fertig ist (Minuten bei claude-code). Der Dispatch-Dialog in der UI bleibt während dieser Zeit offen.

**Lösung:** `dispatchTaskAsync()` im Orchestrator — gibt sofort einen `running`-Run zurück, Runner läuft in detached floating Promise.

- [x] `packages/core/src/orchestrator.ts` — `dispatchTaskAsync(taskId, runnerId): Promise<Run>` neben bestehendem `dispatchTask()`. Pre-flight (validate, task auf `in_progress`, Run anlegen) synchron, `runner.execute()` in detached `.then(finalize).catch(setFailed)`. `dispatchTask()` bleibt unverändert (Tests + CLI).
- [x] `packages/dashboard/src/app/api/dispatch/route.ts` — `dispatchTaskAsync` nutzen, `NextResponse.json(run, { status: 202 })` zurückgeben
- [x] `packages/server/src/handlers/dispatch.ts` — `dispatchTaskAsync` + `sendJson(response, 202, run)`

### D2: History Page

**Problem:** Sidebar-Link "History" existiert im Dashboard, die Route `/history` fehlt → 404.

- [x] `packages/dashboard/src/app/history/page.tsx` (neu) — listet alle vergangenen Runs aus `/api/runs`, sortiert nach Datum (neueste zuerst). Spalten: Run ID, Task, Runner, Status, Gestartet, Dauer. 3s Auto-Refresh.

---

## Phase I: Windows Runner Spawn Fix — DONE

`spawn EINVAL` on Windows when dispatching to CLI runners. Root cause: newer Node.js versions (DEP0190) reject `spawn('foo.cmd')` without `shell: true` — `.cmd` files are batch scripts and cannot be executed by `CreateProcess` directly. Additionally, passing the prompt as a CLI argument with `shell: true` causes cmd.exe to word-split the prompt on spaces.

**Fix:** Use `shell: true` on Windows only, pass prompt via stdin instead of as a CLI argument (stdin avoids cmd.exe word-splitting), and drop the `.cmd` suffix (cmd.exe resolves extensions automatically).

```typescript
const isWin = process.platform === 'win32';
// shell:true on Windows: cmd.exe resolves 'claude' → 'claude.cmd' automatically.
// Prompt via stdin: avoids cmd.exe word-splitting when passed as an argument.
const child = spawn('claude', ['-p'], {
    cwd: input.repoPath, env,
    shell: isWin,
    stdio: ['pipe', 'pipe', 'pipe'],
});
child.stdin!.write(prompt);
child.stdin!.end();
```

- [x] `packages/runners/claude-code/src/index.ts` — `shell: isWin`, bin `'claude'`, prompt via stdin
- [x] `packages/runners/codex/src/index.ts` — `shell: isWin`, bin `'codex'`, prompt via stdin
- [x] `packages/runners/gemini/src/index.ts` — `shell: isWin`, bin `'gemini'`, prompt via stdin

---

## Phase H: Runner Install-on-Demand — DONE

Wenn ein CLI-Runner nicht auf dem Host installiert ist (z.B. `claude`, `codex`, `gemini` nicht im PATH), soll nicht nur eine generische Fehlermeldung erscheinen — sondern ein strukturierter `installHint` zurückgegeben werden, den Wintermute und das Dashboard nutzen um eine direkte Install-Option anzubieten.

### H1: Binary-Check + `installHint` in CLI-Runnern

**Problem:** Aktuell schlägt `spawn` mit `ENOENT` fehl wenn das Binary nicht gefunden wird. Die Fehlermeldung gibt keinen Hinweis wie man das Tool installiert.

**Fix:** Vor `spawn` prüfen ob das Binary vorhanden ist (`which`/`where`). Bei fehlendem Binary sofort `status: 'failed'` mit `installHint` zurückgeben — kein `spawn`-Versuch.

```typescript
const bin = process.platform === 'win32' ? 'claude.cmd' : 'claude';
const available = await checkBinary(bin); // which/where
if (!available) {
  return {
    status: 'failed',
    logs: ['claude-code is not installed'],
    installHint: 'npm install -g @anthropic-ai/claude-code',
  };
}
```

- [x] `packages/core/src/runner.ts` — `RunnerOutput` um optionales `installHint?: string`-Feld erweitern
- [x] `packages/runners/claude-code/src/index.ts` — Binary-Check; `installHint: 'npm install -g @anthropic-ai/claude-code'`
- [x] `packages/runners/codex/src/index.ts` — Binary-Check; `installHint: 'npm install -g @openai/codex'`
- [x] `packages/runners/gemini/src/index.ts` — Binary-Check; `installHint: 'npm install -g @google/gemini-cli'`
- [x] `packages/runners/cursor-cli/src/index.ts` — Binary-Check; `installHint: 'https://cursor.com/download'` (kein npm-Package)

### H2: Install-Prompt in Wintermute

**Problem:** `dispatchInTerminal` zeigt bei fehlgeschlagenem Run nur den Exit-Code im Terminal — kein Hinweis auf fehlende Installation.

**Fix:** Run-Result auf `installHint` prüfen; bei Treffer `window.showErrorMessage` mit Button "In Terminal installieren" anzeigen.

- [x] `extensions/wntrmte-workflow/src/extension.ts` — nach `patchbay run` Abschluss: Run-JSON aus `.project-agents/runs/` lesen, `installHint` auswerten
- [x] Bei `installHint`: `window.showErrorMessage('<runner> ist nicht installiert', 'In Terminal installieren')` — Klick öffnet Terminal mit `installHint`-Kommando

### H3: Install-Hinweis im Dashboard

**Problem:** Run-Viewer zeigt bei `status: 'failed'` nur die Logs — `installHint` wird nicht gesondert hervorgehoben.

- [x] `packages/dashboard/src/app/runs/[id]/page.tsx` (oder Run-Viewer Komponente) — `installHint` als hervorgehobenen Code-Block mit Copy-Button rendern wenn vorhanden
- [x] `packages/dashboard/src/app/api/agents/route.ts` — Availability-Check pro Runner (`which`/`where`) in den Response einbauen (`available: boolean`)
- [x] `packages/dashboard/src/components/DispatchDialog.tsx` — Runner mit `available: false` als deaktiviert + Warnung mit `installHint` anzeigen

---

## Phase G: Runner `shell: true` Regression Fix — DONE

Phase F's `shell: true` introduced three regressions: DEP0190 deprecation warnings (Node.js flags passing args array to shell as security concern), prompt word-splitting in codex ("unexpected argument 'Project' found" — cmd.exe splits the joined prompt on spaces), and cursor-cli opening Cursor interactively instead of running headlessly.

### G1: Remove `shell: true` — use `.cmd` suffix on Windows

**Correct fix for Windows `.cmd` files:** Use explicit `.cmd` suffix in the binary name without `shell: true`. Node.js handles `.cmd` files internally by routing through `cmd.exe /d /s /c` while correctly passing individual arguments — no word-splitting, no DEP0190.

```typescript
const bin = process.platform === 'win32' ? 'claude.cmd' : 'claude';
const child = spawn(bin, args, { cwd, env }); // no shell: true
```

- [x] `packages/runners/claude-code/src/index.ts` — `claude.cmd` on Windows
- [x] `packages/runners/codex/src/index.ts` — `codex.cmd` on Windows
- [x] `packages/runners/gemini/src/index.ts` — `gemini.cmd` on Windows

### G2: cursor-cli — Immediate error (not headless)

`cursor agent -p` opens Cursor interactively — there is no headless CLI mode. The runner now returns `status: 'failed'` immediately with a clear message instead of spawning a process.

- [x] `packages/runners/cursor-cli/src/index.ts` — returns immediate `status: 'failed'` with hint to use `cursor` (file-based) or `claude-code` runner instead

---

## Phase F: Runner Windows-Compat + Robustness — DONE

Gefunden beim manuellen Testen auf Windows: CLI-Runner schlagen mit `spawn ENOENT` fehl, obwohl das Tool installiert ist (Node.js `spawn` ohne `shell: true` findet keine `.cmd`-Dateien). Außerdem kein Timeout bei hängenden Prozessen und unklare Fehlermeldungen bei falscher goal-Nutzung.

### F1: Windows-Compat — `shell: true` in CLI-Runner-Spawns

**Problem:** `spawn('cursor', args)` ohne `shell: true` findet `cursor.cmd` nicht, obwohl `exec('cursor --version')` (default: shell) es findet. Inkonsistenz führt zu ENOENT nach bestandenem Version-Check.

**Fix:** `shell: true` zu den spawn-Optionen hinzufügen — identisch wie der Bash-Runner, der das bereits hat.

- [x] `packages/runners/cursor-cli/src/index.ts` — `spawn('cursor', args, { cwd, env })` → `{ cwd, env, shell: true }`
- [x] `packages/runners/codex/src/index.ts` — gleiche Ergänzung
- [x] `packages/runners/gemini/src/index.ts` — gleiche Ergänzung
- [x] `packages/runners/claude-code/src/index.ts` — gleiche Ergänzung

### F2: Timeout in CLI-Runnern

**Problem:** Hängt der Prozess (z.B. claude wartet auf Auth-Setup), resolved das Promise nie — Terminal blockiert unbegrenzt.

**Fix:** `setTimeout(300_000)` + `child.kill()` im Timeout-Handler; `clearTimeout` in close/error-Handlern. `settled`-Flag verhindert doppeltes Resolven.

- [x] `packages/runners/claude-code/src/index.ts` — Timeout hinzufügen
- [x] `packages/runners/cursor-cli/src/index.ts` — Timeout hinzufügen
- [x] `packages/runners/codex/src/index.ts` — Timeout hinzufügen
- [x] `packages/runners/gemini/src/index.ts` — Timeout hinzufügen

### F3: Klarere Fehlermeldungen

**Problem:** HTTP-Runner gibt kryptisches `Failed to parse URL from <natural language goal>`. Bash-Runner gibt nur "Command failed with code 1" ohne Hinweis.

- [x] `packages/runners/http/src/index.ts` — `new URL(goal)` Validierung vor `fetch()`; bei Fehler: `status: 'failed'` + Meldung dass goal eine gültige URL sein muss
- [x] `packages/runners/bash/src/index.ts` — HINT-Log im close-Handler bei `code !== 0`: goal muss ein Shell-Kommando sein, keine natural language

---

## Phase E: Runner Streaming + Server-Terminal — DONE

### E1: Runner-Output live streamen

**Umgesetzt:** `exec` → `spawn` mit direktem `process.stdout/stderr`-Piping in allen Runnern. Output fließt gleichzeitig in die Terminal-Ausgabe und in den `logs`-Puffer für die Run-Persistenz.

- [x] `packages/runners/claude-code/src/index.ts` — `exec` → `spawn(['-p', prompt])`, `child.stdout.on('data', chunk => { process.stdout.write(chunk); logs.push(chunk.toString()); })`
- [x] `packages/runners/bash/src/index.ts` — gleiche Umstellung: `spawn('bash', ['-c', goal])`
- [x] `packages/runners/cursor-cli/src/index.ts` — gleiche Umstellung
- [x] `packages/runners/codex/src/index.ts` — gleiche Umstellung
- [x] `packages/runners/gemini/src/index.ts` — gleiche Umstellung

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

---

## Phase J: Multi-Turn Runner Conversations — DONE

Wenn ein CLI-Runner eine Rückfrage stellt, endete der Run bisher sofort — der Nutzer hatte keine Möglichkeit zu antworten. Phase J ermöglicht mehrstufige Konversationen zwischen Nutzer und Agenten über alle Eingabekanäle (CLI, Wintermute, Dashboard).

### J1: Core Data Model

- [x] `packages/core/src/runner.ts` — `ConversationTurn`-Interface (`role`, `content`, `timestamp`); `RunnerInput` um `conversationId`, `resumeSessionId`, `previousTurns` erweitert; `RunnerOutput` um `awaiting_input`-Status, `sessionId`, `question` erweitert
- [x] `packages/core/src/types.ts` — `Run` um `conversationId`, `sessionId`, `turnIndex` erweitert; Task-Status-Enum um `awaiting_input` ergänzt
- [x] `schema/run.schema.json` + `packages/core/schema/run.schema.json` — `conversationId`, `sessionId`, `turnIndex`-Felder ergänzt
- [x] `schema/task.schema.json` + `packages/core/schema/task.schema.json` — `awaiting_input` im Status-Enum ergänzt

### J2: Claude Code Runner — Session Resume + Fragen-Erkennung

- [x] `packages/runners/claude-code/src/index.ts` — `detectQuestion(output)`-Heuristik (Länge, Fragezeichen, Keywords); `--resume <sessionId>` bei `input.resumeSessionId`; `--session-id <uuid>` für neue Runs; Prompt via stdin; Konversations-Kontext via `buildPrompt()` aus `@patchbay/core`
- [x] `packages/runners/codex/src/index.ts` — `previousTurns` über `buildPrompt()` aus `@patchbay/core` (wie Claude Code)
- [x] `packages/runners/gemini/src/index.ts` — gleiche `buildPrompt()`-Nutzung aus `@patchbay/core`

### J3: Orchestrator — Konversations-Threading

- [x] `packages/core/src/orchestrator.ts` — `continueConversation(conversationId, userReply, runnerId)`: findet Thread-Runs, baut `RunnerInput` mit `resumeSessionId` + `previousTurns`, führt Runner aus, persistiert
- [x] `packages/core/src/orchestrator.ts` — `buildConversationHistory(runs)`: baut `ConversationTurn[]` aus Run-History
- [x] `packages/core/src/orchestrator.ts` — `preflight()` erlaubt `awaiting_input`-Status; `dispatchTask()` generiert `conversationId` + `turnIndex: 0`; `finalize()` setzt `task.status = 'awaiting_input'` bei `output.status === 'awaiting_input'`

### J4: CLI — `patchbay reply` + Interaktive Follow-up-Loop

- [x] `packages/cli/src/index.ts` — `patchbay reply <conversationId> "<message>"` Command; interaktive Follow-up-Loop in `patchbay run` (TTY-Check, `askReply()` Helper, Loop bis `completed`/`failed` oder Nutzer skippt)

### J5: Wintermute Extension — Reply UX

- [x] `extensions/wntrmte-workflow/src/store/types.ts` — `awaiting_input` in `TaskStatus`; `conversationId`, `sessionId`, `turnIndex` in `Run`
- [x] `extensions/wntrmte-workflow/src/store/FileStore.ts` — bewahrt neue Felder beim Lesen von Run-JSONs
- [x] `extensions/wntrmte-workflow/src/providers/TaskTreeProvider.ts` — `awaiting_input` mit Icon `comment-discussion` und Label "Awaiting Reply"
- [x] `extensions/wntrmte-workflow/src/extension.ts` — `scheduleInstallHintCheck` → `schedulePostRunCheck`: erkennt auch `awaiting_input`-Runs, zeigt `showInputBox` mit Frage des Runners, öffnet Terminal mit `patchbay reply <conversationId> "<reply>"`, kettet weiteren Check für Folge-Runs

### J6: Dashboard — Reply-Modus + Kanban-Spalte

- [x] `packages/dashboard/src/app/api/reply/route.ts` — neuer Endpoint `POST /api/reply`: ruft `orchestrator.continueConversation()` auf
- [x] `packages/dashboard/src/components/DispatchDialog.tsx` — Reply-Modus wenn `taskStatus === 'awaiting_input'`: zeigt Frage des Runners, Textarea für Antwort, "Send Reply"-Button; ruft `/api/reply` auf (oder sendet postMessage im VS Code Webview-Kontext)
- [x] `packages/dashboard/src/app/tasks/page.tsx` — neue Kanban-Spalte "Awaiting Reply" (lila); Dispatch-Button auch für `awaiting_input`-Tasks sichtbar; `taskStatus` an `DispatchDialog` übergeben

### Post-J: Qualitätsverbesserungen

- [x] `packages/core/src/store.ts` — `createTask()` generiert IDs als Slug aus Titel + UUID-Suffix (`my-task-abc123`) statt reiner UUID — lesbar, git-diff-freundlich
- [x] `packages/runners/codex/src/index.ts` — Noise-Filtering: irrelevante Zeilen aus Codex-Output herausfiltern; `extractSummary()` extrahiert sinnvollen Summary aus Rohausgabe
- [x] `packages/runners/codex/src/index.ts` — `--full-auto` Flag ergänzt (neben `--skip-git-repo-check`)
- [x] `packages/dashboard/src/components/DispatchDialog.tsx` — Agents nach Präferenz sortiert; dynamische Menüplatzierung je nach verfügbarem Bildschirmplatz
- [x] `packages/dashboard/src/app/tasks/page.tsx` — Status-Menü mit dynamischer Positionierung + z-index-Verwaltung

---

## Phase K: Projekt-Import für bestehende Repos — DONE

Bestehende Projekte können aktuell nur manuell per `patchbay init` initialisiert werden — ohne Bezug zum vorhandenen Code. Phase K macht den Onboarding-Flow intelligent: Auto-Erkennung des Projekts + Context-Bootstrap aus README und CI-Config, plus eine "Initialize Patchbay Workflow"-Option direkt im Wintermute Start Panel.

### K1: Auto-Detect in `patchbay init`

- [x] `packages/cli/src/init-meta.ts` — `detectProjectMeta()`: liest `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` für Projektname + Tech-Stack; `.git/config` für Repo-URL
- [x] `packages/cli/src/index.ts` — `patchbay init`: erkannte Werte als Defaults vorausfüllen; `--yes` übernimmt erkannte Werte ohne Prompts

### K2: Context-Bootstrap

- [x] `packages/cli/src/init-meta.ts` — `bootstrapContextFiles()`: `README.md` → `context/architecture.md`; CI-Config + Test-Setup → `context/conventions.md`
- [x] `packages/cli/src/index.ts` — `bootstrapContextFiles()` nach `init` aufgerufen

### K3: Wintermute — "Initialize"-Command im Start Panel

- [x] `extensions/wntrmte-workflow/src/extension.ts` — `wntrmte.initializePatchbay` Command: Guard wenn `.project-agents/` schon vorhanden; startet `patchbay init --yes` mit auto-detected Werten im integrierten Terminal; "Initialize Patchbay Workflow"-Button im Start Panel

---

## Phase L: Agent Connector Architecture — Live Agent Interaction

Das Herzstück der neuen Produktvision (vgl. `VISION.md`): Live Agent Interaction im Dashboard statt Batch-Runner mit Text-Heuristik. Provider-agnostisch — die Architektur ist generisch, Connectors sind austauschbar.

**Vorbild:** ZenFlow, Codex App, T3 Code — eigenständige Coding-Orchestration mit Streaming, Approvals, Multi-Turn. Aber: IDE-nativ, open-source, model-agnostisch.

**Strategie:** Das Patchbay Dashboard ist die primäre App-UI. Wintermute bettet es als Webview-Panel ein — Agent Chat, Streaming, Approvals laufen im Dashboard und sind automatisch in Wintermute verfügbar.

**Provider-Integrations-Referenz** (Details: `VISION.md`, `../TODO.md`): Connectors mappen die jeweils beste Anbieter-Schicht auf einheitliche `AgentEvent`s — **Codex:** `codex app-server` (JSON-RPC, stdio, Threads, serverseitige Approvals); **Claude Code:** CLI `--input-format stream-json` / `--output-format stream-json` (NDJSON), ergänzend Anthropic Agent SDK wo sinnvoll; **Gemini CLI:** Headless/JSON; **lokal:** HTTP (z. B. Ollama); **HTTP APIs:** OpenAI-kompatible Integrationen eher **Responses API**; **Cursor:** perspektivisch **ACP** (`agent acp`, stdio JSON-RPC) — proprietär, aber offizielle Schnittstelle.

### L1: Core Types — Provider-agnostisches Connector-Interface — DONE

- [x] `packages/core/src/connector.ts` — `AgentConnector`, `AgentSession`, `AgentEvent` Interfaces (generisch, nicht an Provider gebunden)
- [x] `packages/core/src/connector.ts` — Event-Typen: `session:started`, `agent:message`, `agent:tool_use`, `agent:permission`, `agent:question`, `session:completed`, `session:failed`
- [x] `packages/core/src/connector.ts` — `ConnectorRegistry` (dynamische Registrierung) + `BaseConnector` + `BaseSession` (gemeinsame Session-Lifecycle-Logik)
- [x] `packages/core/src/index.ts` — re-export Connector-Types

### L2: Provider Connectors — DONE

Reihenfolge: **L2a** Claude Code (PoC), **L2b** Codex bevorzugt **`codex app-server`**, **L2c** Gemini Headless, **L2d** Doku + HTTP/lokal/Cursor.

#### L2a: Claude Code Connector — DONE

- [x] `packages/runners/claude-code/src/connector.ts` — `ClaudeCodeConnector` — CLI mit `--input-format stream-json` / `--output-format stream-json` (NDJSON-Workflow)
- [x] `packages/runners/claude-code/src/stream-parser.ts` — NDJSON → AgentEvent Mapping (system/init → started, assistant/text → message, assistant/tool_use → tool_use, result/tool_result → tool_use completed, result → completed)

#### L2b: Codex Connector — DONE

- [x] `packages/runners/codex/src/connector.ts` — `CodexConnector` an **`codex app-server`** (JSON-RPC über stdio/JSONL, Thread-APIs, serverinitiierte Approvals → `AgentEvent`)
- [x] `packages/runners/codex/src/stream-parser.ts` — JSON-RPC Notifications → AgentEvent Mapping
- [x] Bestehender Batch-Runner (`codex exec` + Noise-Filter) bleibt als Fallback

#### L2c: Gemini Connector — DONE

- [x] `packages/runners/gemini/src/connector.ts` — `GeminiConnector` — **Headless**-Modus (`--json`, stdin); flexibles Event-Mapping auf `AgentEvent`
- [x] `packages/runners/gemini/src/stream-parser.ts` — JSON/Plain-Text → AgentEvent Mapping (nicht-JSON-Output als message durchgereicht)

#### L2d: Connector-Erweiterbarkeit — DONE

- [x] `docs/custom-connector.md` — Dokumentation: "How to build a custom Connector" — Interface-Contract, Event-Mapping, Step-by-Step mit Beispielen
- [x] `packages/runners/http/src/connector.ts` — `HttpConnector` für OpenAI-kompatible APIs (Ollama, LM Studio, OpenRouter, vLLM) — SSE-Streaming + Non-Streaming, Multi-Turn, konfigurierbar via `HttpConnectorConfig`
- [x] `packages/runners/cursor-cli/src/connector.ts` — `CursorAcpConnector` für **Cursor ACP** (Agent Client Protocol, JSON-RPC/stdio) — `initialize` Handshake, `session/new`, `session/prompt`, `session/request_permission` (approve/deny), `session/cancel`, `fs/read_text_file`/`fs/write_text_file` Auto-Handling
- [x] `packages/runners/cursor-cli/src/acp-parser.ts` — ACP JSON-RPC → AgentEvent Mapping (`session/update` → message/tool_use/completed, `session/request_permission` → permission)
- [x] `docs/custom-connector.md` — ACP-Protokoll-Mapping-Referenz (Lifecycle-Diagramm, Event-Tabelle, Key Differences)

### L3: Orchestrator — Connector-Support — DONE

- [x] `packages/core/src/orchestrator.ts` — `registerConnector()`, `connectAgent()`, `sendInput()`, `approveSession()`, `denySession()`, `cancelSession()`, `listConnectors()`, `getSession()`, `listSessions()`
- [x] `activeSessions` Map für aktive AgentSessions; `bridgeSessionEvents()` für automatische Store-Updates bei Session-Events
- [x] Bestehende `dispatchTask()`, `continueConversation()` bleiben für Batch-Runner unverändert

### L4: Server — Streaming Endpoints — DONE

- [x] `packages/server/src/handlers/connect.ts` — `POST /connect { taskId, connectorId }` → `{ sessionId }` (202)
- [x] `packages/server/src/handlers/agent-events.ts` — `GET /agent-events/:sessionId` → SSE-Stream (gleiches Format für alle Provider)
- [x] `packages/server/src/handlers/agent-input.ts` — `POST /agent-input/:sessionId`, `POST /agent-approve/:sessionId`, `POST /agent-deny/:sessionId`, `POST /agent-cancel/:sessionId`
- [x] `packages/server/src/handlers/connectors.ts` — `GET /connectors` → Liste verfügbarer Connectors mit Capabilities + Availability
- [x] `packages/server/src/runtime.ts` — `ClaudeCodeConnector`, `CodexConnector`, `GeminiConnector` registriert
- [x] Dashboard API Routes: `/api/connect`, `/api/agent-input` (unified: input/approve/deny/cancel), `/api/connectors`

### L5: Monorepo-Konsolidierung

Vor dem Dashboard-Umbau: wntrmte + patchbay in ein Repository zusammenführen. Ab hier arbeiten Dashboard und Extension auf denselben Types.

- [ ] Monorepo-Struktur: `packages/` (core, dashboard, cli, server, runners) + `ide/` (build, extensions, patches)
- [ ] Shared Types: duplizierte Interfaces durch Imports aus `@patchbay/core` ersetzen
- [ ] `extension.ts` aufteilen: `CliManager`, `AuthService`, `TerminalOrchestrator` extrahieren

### L6: Dashboard — Agent Chat

- [ ] `packages/dashboard/src/components/AgentChat.tsx` — Streaming Messages, Tool-Use-Anzeige, Permission-Dialoge, inline Replies, Cancel. Provider-agnostisch.
- [ ] `packages/dashboard/src/components/DispatchDialog.tsx` — Provider-Auswahl: Connectors + Batch-Runner, "Interactive Session" vs "Start Run"
- [ ] `packages/dashboard/src/app/tasks/page.tsx` — AgentChat als Sliding Panel
- [ ] Wintermute `DashboardPanel.ts` — postMessage-Relay für `wntrmte.connectAgent`, `wntrmte.sendAgentInput`, `wntrmte.approveAgent`, `wntrmte.denyAgent`, `wntrmte.cancelAgent`

### L7: Backward Compatibility

- [ ] `/agents` Endpoint um `supportsConnector: boolean` und `connectorCapabilities` erweitern
- [ ] Bestehende Batch-Runner, `/dispatch`, `/reply` bleiben unverändert
- [ ] Provider ohne Connector fallen automatisch auf Batch-Runner zurück
