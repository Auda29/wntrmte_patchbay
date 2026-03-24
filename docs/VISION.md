# Wintermute + Patchbay — Vision

## Das Problem

Wer heute mit KI-Agenten entwickelt, sitzt zwischen den Stühlen: Cursor in einem Fenster, Claude Code im Terminal, Codex in einer App, Browser-Tabs für Docs und Dashboards. Jeder Agent hat seine eigene Oberfläche, seinen eigenen State, seine eigene Interaktionslogik. Kontext geht verloren, Aufgaben sind verstreut, und niemand weiß welcher Agent was geändert hat.

Die bestehenden Lösungen adressieren Teile des Problems, aber keine löst es vollständig:

- **ZenFlow, Codex App, T3 Code** — eigenständige Orchestrations-Apps. Man verlässt den Editor.
- **Cursor, Windsurf** — AI-enhanced Editoren. Locked-in auf ein Modell, kein Task-Management, keine Transparenz.
- **Continue, Roo Code, Cline** — IDE-Extensions. Einzelagent-Assistenten, keine Orchestration.
- **Vibe Kanban, Emdash, Dorothy** — Multi-Agent-Orchestratoren. Standalone-Apps, kein IDE-Embedding.

Keines dieser Tools kombiniert alle drei Eigenschaften, die es braucht:

1. **IDE-nativ** — kein separates Fenster, keine Electron-App, sondern der Editor selbst
2. **Model-agnostisch** — jeder AI-Agent ist ein austauschbarer Worker, kein Vendor-Lock-in
3. **Transparenter State** — alles git-versioniert, menschenlesbar, kein Black-Box-Backend

---

## Die Lösung

> **Wintermute ist die IDE. Patchbay ist die Agent-Orchestration-App darin. Zusammen sind sie eine open-source Plattform für Agentic Coding — vergleichbar mit ZenFlow oder Codex App, aber nativ im Editor integriert.**

### Was der User sieht

Du öffnest Wintermute. Es sieht aus wie ein schlanker, fokussierter Code-Editor. Im Seitenpanel ist das Patchbay Dashboard — deine Kommandozentrale.

Du siehst deine Tasks als Kanban. Du klickst auf einen, wählst "Start Session mit Claude Code". Ein Chat-Panel öffnet sich. Claude arbeitet, du siehst live was passiert: welche Files er editiert, welche Tools er nutzt. Er fragt "Darf ich `src/auth.ts` ändern?" — du klickst Approve. Er fragt "Soll ich auch Tests schreiben?" — du tippst "Ja, mit Vitest". Er arbeitet weiter. Fertig. Der Task wandert ins Review.

Daneben läuft parallel ein zweiter Agent (Codex) an einem anderen Task. Du wechselst zwischen den Sessions wie zwischen Tabs. Alles in einem Fenster, neben deinem Code.

Alles was passiert ist — Tasks, Runs, Decisions, Sessions, Event-Historien — liegt in `.project-agents/` im Repo. Git-versioniert, menschenlesbar, jederzeit nachvollziehbar. Kein Cloud-Backend, keine Datenbank, keine Telemetrie.

### Warum diese Architektur?

| Standalone-App (ZenFlow) | AI-Editor (Cursor) | **Wintermute + Patchbay** |
|---|---|---|
| Eigenes Fenster, eigener Editor | Locked-in auf ein AI-Modell | Voller Editor + model-agnostisch |
| Muss eigenen Editor bauen | Keine Transparenz über AI-Aktionen | Git-versionierter State |
| App-Switch nötig | Alles im Editor, aber Vendor-Lock-in | Alles im Editor, kein Lock-in |
| Closed Source | Closed Source | **Open Source** |

Man hat die Freiheit einer eigenständigen App (Dashboard = beliebige Web-UI) mit der Tiefe einer IDE-Integration (Terminal, File-System, Extensions, Debugging). Und alles ist open source.

---

## Architektur

```
┌─────────────────────────────────────────────────┐
│           PATCHBAY DASHBOARD (die App)          │  ← Agent Chat, Kanban, Dispatch,
│   (eingebettet als Webview in Wintermute oder   │    Live Streaming, Approvals,
│    standalone im Browser)                       │    Run-Historie, Decisions
├─────────────────────────────────────────────────┤
│           PATCHBAY ORCHESTRATOR                 │  ← Task-State, Runner-Dispatch,
│                                                 │    AgentConnector (streaming),
│                                                 │    Runner (batch), Session-Mgmt
├─────────────────────────────────────────────────┤
│     WNTRMTE — HOST + GLUE LAYER                │  ← DashboardPanel (Webview iframe),
│            (built-in Extension)                 │    postMessage-Relay, Terminal,
│                                                 │    FileStore/ApiStore, Auth, Setup
├─────────────────────────────────────────────────┤
│            WNTRMTE IDE CORE                     │  ← VS Code Build, Patches,
│                                                 │    minimalistisches Branding
├─────────────────────────────────────────────────┤
│  BATCH RUNNER:   Bash │ HTTP │ Cursor           │  ← Fire-and-forget Worker
│  AGENT CONNECTOR: Claude Code │ Codex │ Gemini  │  ← Streaming, Approvals, Multi-Turn
└─────────────────────────────────────────────────┘
```

### Drei Rollen, klar getrennt

**Patchbay Dashboard** = die App. Hier passiert die Interaktion: Tasks anlegen, Agents starten, Live-Chat mit Agents, Permissions genehmigen, Ergebnisse reviewen. Gebaut als Next.js Web-App — läuft im Browser oder als eingebettetes iframe in Wintermute. Das Dashboard ist die primäre Oberfläche, nicht Deko.

**Patchbay Orchestrator** = das Backend. Managed Sessions, Runner, Connectors, State. Stellt API-Endpoints bereit (REST + SSE). Das Dashboard kommuniziert ausschließlich über diese API.

**Wintermute** = der Host. Bettet das Dashboard als Webview-Panel ein, stellt den IDE-Kontext bereit (Workspace-Root, Terminal, File-System), leitet Commands weiter (postMessage-Relay), und bietet ergänzende IDE-native Features (TreeView, StatusBar, Setup-Flow). Wintermute baut keine eigene Orchestrations-UI — das ist Patchbays Job.

### Runner vs. Connector

Zwei Execution-Modelle für zwei Arten von Tools:

**Batch-Runner** (Bash, HTTP, Cursor) — `execute(): Promise<RunnerOutput>`. Fire-and-forget. Input rein, Output raus, fertig. Gut für Skripte, API-Calls, einfache One-Shot-Tasks.

**Agent-Connectors** (Claude Code, perspektivisch Codex, Gemini) — `connect(): AgentSession`. Event-basiert, session-orientiert. Streamen Messages, fragen nach Permissions, akzeptieren Replies — alles in einer laufenden Session. Kein Regex-Raten, keine Heuristik, sondern strukturierte Events.

```typescript
// Batch (bestehend)
interface Runner {
  execute(input: RunnerInput): Promise<RunnerOutput>
}

// Streaming (neu — Phase L)
interface AgentConnector {
  connect(input: RunnerInput): AgentSession
}

interface AgentSession {
  on(event: 'event', listener: (e: AgentEvent) => void): this
  sendInput(message: string): void
  approve(): void
  cancel(): void
}
```

### Provider-Schichten (Referenz)

Patchbay bleibt **transport- und anbieter-agnostisch**: Connectors übersetzen jeweils die **beste verfügbare** Schicht des Anbieters in einheitliche `AgentEvent`s. Kurzüberblick (Stand Doku/Landschaft):

| Anbieter | Typische „reichste“ Schicht für Live/Struktur | Hinweis |
|----------|-----------------------------------------------|---------|
| **OpenAI Codex** | `codex app-server` — JSON-RPC-ähnlich, stdio/JSONL (optional WebSocket), Auth, Threads (`thread/start`, `thread/resume`, `thread/fork`), **serverseitige Approvals**, gestreamte Agent-Events | Offiziell die Deep-Integration-Klasse ([Codex App Server](https://developers.openai.com/codex/app-server)); Implementierung offen im [Codex-Repo](https://github.com/openai/codex). |
| **Anthropic Claude Code** | CLI: **`--input-format stream-json`**, **`--output-format stream-json`** — NDJSON/stream-json für Maschinenintegration; **kein** einzelnes Paket wie der gesamte Codex-App-Server | Auth immer über die **offizielle lokale Claude-Code-CLI-Session** des Users, nicht über eine Patchbay-eigene Anthropic-Auth oder API-Key-Injektion. Multi-Turn/Sessions zusätzlich über **Anthropic Agent SDK**-Konzepte ergänzen; nicht 1:1 mit Codex-Thread-Semantik. |
| **Google Gemini CLI** | **Headless**-Modus — Text/JSON, stdin/Piping, stabile Exit-Codes; Projekt **Open Source** | Eher CLI/Headless als JSON-RPC-App-Server ([Headless](https://google-gemini.github.io/gemini-cli/docs/cli/headless.html), [Repo](https://github.com/google-gemini/gemini-cli)). |
| **Lokal (Ollama, LM Studio, …)** | **HTTP/REST** (z. B. Ollama `/api/chat`) | Kein eingebauter Codex-artiger Agent-Server — **Adapter + dokumentierte Capabilities**. |
| **HTTP / OpenAI-kompatible APIs** | Für neue Integrationen oft **Responses API**; klassisch auch Chat-Completions | Reine Chat-/Tool-HTTP ersetzt **nicht** automatisch einen vorgefertigten Agent-/Approval-Loop — den baut man oder nutzt App-Server-ähnliche Schichten. |
| **Cursor / ACP** | **ACP** ([Agent Client Protocol](https://agentclientprotocol.com)) — JSON-RPC über **stdio** (z. B. `cursor agent acp`); u. a. **`session/request_permission`** | In Patchbay: **`CursorAcpConnector`** / generischer **`AcpConnector`** (`runner-cursor-cli`). Protokoll ist offen dokumentiert; **Cursor** als Produkt bleibt proprietär. |

**Kosten/Lizenzen:** Connector-Code kann auf **Open-Source-CLIs** (z. B. Codex, Gemini CLI) aufsetzen; **Modell- und Kontonutzung** (OpenAI, Anthropic, Google, …) bleibt Sache des Nutzers — das ist keine „Patchbay-Lizenz“, aber oft **nicht kostenlos** im Betrieb.

---

## Das Datenmodell — `.project-agents/`

Das Datenformat ist ein zentraler Differentiator. Wo andere Tools State in SQLite-Datenbanken, proprietären Cloud-Backends oder flüchtigen Sessions speichern, lebt bei Patchbay alles im Repo:

```
.project-agents/
  project.yml              ← Projektname, Ziel, Tech-Stack
  agents/
    claude-builder.yml     ← Agent-Profile
    reviewer.yml
  tasks/
    TASK-auth-flow-a1b2.md ← Aufgabe mit YAML-Frontmatter + Markdown-Body
  decisions/
    DEC-001.md             ← Architektur-Entscheidung
  runs/
    2026-03-21-auth-run.json ← Wer hat was wann gemacht, mit welchem Ergebnis
  sessions/
    SESSION-abc123.json       ← Session-Metadaten
    SESSION-abc123.events.jsonl ← append-only Event-Historie
  context/
    architecture.md        ← Projekt-Kontext für Agents
    conventions.md
    current-focus.md
```

**Warum das wichtig ist:**
- **Git-versioniert** — jede Änderung nachvollziehbar, jeder Stand wiederherstellbar
- **Menschenlesbar** — YAML + Markdown, kein proprietäres Format
- **Tool-agnostisch** — jedes Tool kann `.project-agents/` lesen und schreiben
- **Kein Cloud-Zwang** — funktioniert komplett offline, lokal, privat
- **Integrationsvertrag** — Patchbay und Wintermute teilen keinen Code, nur dieses Dateiformat

---

## Zwei Modi

**Offline-Modus (file-based):**
- Extension liest `.project-agents/` direkt via FileStore
- Tasks, Runs, Decisions im Editor sichtbar — ohne laufendes Backend
- FileSystemWatcher reagiert auf externe Änderungen
- Funktioniert ohne Internet, ohne Server, ohne Setup

**Connected-Modus:**
- ApiStore verbindet sich mit Patchbay-Server via SSE
- Dashboard als Webview-Panel mit voller Funktionalität
- Agent-Chat, Streaming, Approvals, Live-Updates
- StoreFactory erkennt den Modus automatisch

---

## Positionierung im Markt

### Die Landschaft (Stand März 2026)

Die AI-Coding-Landschaft teilt sich in zwei Lager, die jeweils etwas fehlt:

**IDE-native Tools** (Continue, Roo Code, Cline) — sind Einzelagent-Assistenten innerhalb des Editors. Kein Task-Management, keine Multi-Agent-Orchestration, kein persistenter State.

**Multi-Agent-Orchestratoren** (ZenFlow, Emdash, Vibe Kanban, Dorothy) — sind eigenständige Apps mit voller Orchestration. Man verlässt den Editor, State lebt in proprietären Datenbanken.

**Niemand kombiniert beides.** IDE-nativ UND vollwertige Orchestration-Plattform existiert nicht.

### Differenzierung

| | IDE-nativ | Model-agnostisch | Git-State | Multi-Agent | Open Source |
|---|---|---|---|---|---|
| Continue.dev | Ja | Ja | Nein | Nein | Ja |
| Roo Code / Cline | Ja | Ja | Nein | Nein | Ja |
| ZenFlow | Nein | Ja | Nein | Ja | Nein |
| Emdash (YC W26) | Nein | Ja | Nein | Ja | Ja |
| Vibe Kanban | Nein | Ja | Teilw. | Ja | Ja |
| Cursor | Ja | Nein | Nein | Nein | Nein |
| VS Code 1.109 | Ja | Teilw. | Nein | Ja | Ja |
| **Wintermute+Patchbay** | **Ja** | **Ja** | **Ja** | **Ja** | **Ja** |

### Die Nische

**Open-source, IDE-native, model-agnostische Agent-Orchestration mit transparentem Git-State.**

Diese Kombination ist unbesetzt. Die nächsten Konkurrenten sind:
- **Emdash** — am ambitioniertesten (YC-funded, ~20 Providers), aber: standalone Electron-App, SQLite-State
- **Vibe Kanban** — Kanban + Git-Worktrees (9.4k Stars), aber: standalone Web-UI, kein IDE-Embedding
- **VS Code Multi-Agent** (1.109+) — Microsoft baut Multi-Agent nativ ein, aber: Copilot-Lock-in, kein transparenter State

---

## Open Source — Warum es entscheidend ist

Fast alle Konkurrenten sind closed source (ZenFlow, Cursor, T3 Code, Codex App) oder an ein Ökosystem gebunden (VS Code + Copilot). Das schafft eine klare Lücke:

**Für Entwickler:**
- Volle Kontrolle über die AI-Toolchain — kein Vendor-Lock-in
- Selbst-hostbar, kein Cloud-Zwang, keine Telemetrie
- Community kann eigene Runner/Connectors bauen (lokale Modelle, Ollama, eigene APIs)
- `.project-agents/` als offenes Format — andere Tools können es konsumieren

**Für das Projekt:**
- Community-Contributions (Runner für neue AI-Tools, Dashboard-Themes, Workflow-Templates)
- Transparenz schafft Vertrauen (besonders bei AI-Tools die Code schreiben)
- Forkbar — wer es anders braucht, baut es um

---

## Roadmap

### Aktueller Stand

**Phasen A–K (abgeschlossen):** Schema, Orchestrator, Dashboard, Runner, Extension, Multi-Turn (J), Projekt-Import (K) — siehe jeweilige `./PLAN.md`.

**Phase L (L1–L7, umgesetzt):** `AgentConnector` / `AgentEvent`, Connectors für **Claude Code** (stream-json), **Codex** (`app-server`), **Gemini** (Headless), **`HttpConnector`**, **Cursor ACP** (`CursorAcpConnector` / `AcpConnector`), Orchestrator inkl. **approve/deny**, Server (`/connect`, SSE, `/agent-*`, `/connectors`), Dashboard-API-Routen, Agent Chat im Dashboard, Wintermute postMessage-Relay und `/agents`-Capabilities. Die Dashboard-Connector-Routen teilen sich eine Runtime-Orchestrator-Instanz, damit Live-Sessions über `/connect`, `/agent-input` und `/agent-events` konsistent bleiben.

**Phase L8 (im ersten Schnitt umgesetzt):** Vision-Alignment nach dem ersten End-to-End-Live-Chat-Stand. Persistente Sessions unter `.project-agents/sessions/`, eigene `/sessions`-Fläche im Dashboard und connector-first Datenfluss im UI.

Details: `./PLAN.md` Phase L, Provider-Tabelle oben.

### Nächster Schritt (Phase L8)

- **Persistenter Agent Chat** — Konversationen und strukturierte Events leben jetzt als eigenes Session-/Chat-Modell unter `.project-agents/sessions/`, nicht als primäre Historie in `Run.logs`.
- **Connector-first UX** — Connector-Sessions haben mit `/sessions` eine eigene chat-zentrierte Hauptfläche im Dashboard.
- **Klarerer Connector-Vertrag im UI** — Connector-Auswahl und Capabilities laufen primär über einen Connector-Layer statt über angereicherte Runner-Metadaten.
- **Doku-Disziplin** — Vision, Pläne und Implementierung wurden für den ersten L8-Schnitt gemeinsam nachgezogen.

### Darüber hinaus (Evaluierung)

- **Multi-Agent-Workflows** — mehrere Agents parallel an einem Task, Cross-Verification (ZenFlow-Stil)
- **Agent-Sandboxing** — isolierte Umgebungen pro Agent-Session (Git-Worktrees oder Container)
- **Workflow-Templates** — vordefinierte Abläufe (Plan → Implement → Test → Review)
- **Weitere Connectors** — weitere ACP-kompatible Agents (`AcpConnector`), Community-HTTP, lokale Modelle (siehe Provider-Schichten)
- **npm-Publish** — `@patchbay/cli` öffentlich verfügbar machen

---

## Repo-Strategie

**Aktuell: Ein Monorepo** — mit `.project-agents/` als Integrationsvertrag und gemeinsamer Package-/IDE-Struktur.

```
repo-root/
├── packages/                 ← Orchestrator, Dashboard, CLI, Runner, Connectors
├── schema/                   ← .project-agents Schema-Definitionen
├── docs/                     ← gemeinsame Dokumentation
│   ├── README.md
│   ├── PLAN.md
│   ├── VISION.md
│   └── custom-connector.md
├── ide/                      ← VS Code Build-Pipeline, Host-Extensions, Patches
├── AGENTS.md                 ← Repo-Instruktionen für Agents
└── wintermute-patchbay.code-workspace
```

Patchbay bleibt der Schema-Owner. `.project-agents/`-Struktur, JSON-Schemas und Domain-Types werden im Monorepo unter `schema/` und `packages/core` definiert. Wintermute konsumiert diese Shared Types direkt über `@patchbay/core`.

---

## Ein-Satz-Version

> **Wintermute + Patchbay ist die open-source, IDE-native Agent-Orchestration-Plattform — wie ZenFlow oder Codex App, aber im Editor integriert, model-agnostisch, und mit transparentem Git-State.**
