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
│       └── claude-code/
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

### Verifikation:
- Bash Runner: `echo "hello"` → Run mit Status completed, Log enthält "hello"
- HTTP Runner: Fetch einer URL → Run mit Response-Body als Artifact
- Cursor Runner: Task-Datei wird erstellt, nach manuellem Cursor-Run wird Diff eingesammelt
- Claude Code Runner: `claude -p "<prompt>"` → Run mit Output als Log
- Cursor CLI Runner: `cursor agent -p "<prompt>"` → Run mit Output als Log

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

### 5.3 Approval Gates

- Tool-Calls die Genehmigung brauchen lösen Approval-Dialog im Editor aus
- Mensch bestätigt direkt in wntrmte, nicht im Browser

### Verifikation:
- Extension zeigt Tasks aus `.project-agents/` im Tree View
- Bei laufendem Patchbay-Backend: Live-Status-Updates im Editor
- Approval Gate funktioniert für `shell.execute`-Aufrufe

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

### Phase 4: Runner-Adapter — DONE
- [x] Bash Runner
- [x] HTTP Runner
- [x] Cursor Runner (Stufe 1: dateibasiert)
- [x] Claude Code Runner (`claude -p`)
- [x] Cursor CLI Runner (`cursor agent -p`)

### Phase 5: wntrmte-Integration — TODO
- [ ] Extension liest `.project-agents/` (offline)
- [ ] WebSocket-Verbindung zum Backend (connected)
- [ ] Dashboard als Webview-Panel
- [ ] Approval Gates im Editor
