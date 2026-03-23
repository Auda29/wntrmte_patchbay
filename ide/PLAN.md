# Plan: Wintermute — Minimalist AI-Agent IDE auf VS Code Basis

## Context

Ziel ist eine eigene IDE, die minimalistisch wie Zed aussieht, aber AI-Agent-Workflows direkt integriert hat. Zwei-Personen-Team → VSCodium-Ansatz (Build-Scripts + Patches, kein echter Fork), um Upstream-Updates einfach nachziehen zu können.

**Name:** Wintermute (Neuromancer-Referenz)
- Anzeigename: **Wintermute**
- Binary/CLI: `wntrmte`
- Datenordner: `.wntrmte`
- Konfigurierbar über `APP_NAME` / `BINARY_NAME` in `utils.sh`

**Zusammenspiel mit Patchbay:** wntrmte ist der native, tiefst-integrierte Client für Patchbay — das externe Orchestrierungs-Dashboard. wntrmte denkt von innen nach außen (IDE-Integration), Patchbay von außen nach innen (Dashboard-Steuerung). Die Phase-3-Extension wird von Anfang an als Patchbay-Client designed. Patchbay bleibt tool-agnostisch — wntrmte ist der First-Class-Client, nicht der einzige. Siehe `VISION.md` und `patchbay/PLAN.md`.

---

## Repo-Struktur (Endstand)

```
wintermute/
├── upstream/stable.json          # Gepinnter VS Code Commit + Tag
├── patches/
│   ├── binary-name.patch         # Binary 'code' → 'wntrmte'
│   ├── brand.patch               # Strings in Source ersetzen
│   ├── ui-defaults.patch         # Minimalistische UI-Defaults
│   ├── disable-copilot.patch     # Copilot UI entfernen (von VSCodium)
│   ├── telemetry.patch           # Telemetrie aus
│   └── user/                     # Lokale Patches (gitignored)
├── extensions/
│   └── wntrmte-workflow/         # Patchbay-Client Extension (Phase 3)
├── icons/                        # Eigene App-Icons
├── product.json                  # Wird über VS Codes product.json gemerged
├── utils.sh                      # Placeholder-Tokens + apply_patch()
├── get_repo.sh                   # VS Code klonen am gepinnten Commit
├── prepare_vscode.sh             # Patches + product.json + npm ci
├── build.sh                      # Steuert den gesamten Build
├── update_upstream.sh            # Upstream-Version bumpen
└── .github/workflows/build.yml   # CI: Linux + Windows + macOS
```

`vscode/` wird nie committed — es wird bei jedem Build frisch geklont.

---

## Phase 1: Build-Pipeline aufsetzen

**Ziel:** Repo klont VS Code, baut es unverändert, produziert ein lauffähiges Binary.

### Dateien erstellen:

1. **`upstream/stable.json`** — Pinnt exakten VS Code Commit:
   ```json
   { "tag": "1.110.0", "commit": "0870c2a..." }
   ```

2. **`utils.sh`** — Definiert `APP_NAME=Wintermute`, `BINARY_NAME=wntrmte`, die `apply_patch()` Funktion mit `!!PLACEHOLDER!!`-Ersetzung (exakt wie VSCodium)

3. **`get_repo.sh`** — Shallow-Clone von VS Code am gepinnten Commit (`git fetch --depth 1`)

4. **`prepare_vscode.sh`** — Skeleton: product.json Merge, Patch-Loop, `npm ci`

5. **`build.sh`** — Ruft get_repo → prepare → compile + minify + package

6. **`product.json`** — Branding, Open VSX und plattformspezifische Produkt-Metadaten

7. **`.github/workflows/build.yml`** — Matrix-Build für 3 Plattformen

### Verifikation:
```bash
OS_NAME=linux VSCODE_ARCH=x64 bash build.sh
./VSCode-linux-x64/wntrmte  # Startet Wintermute unter Linux
```

```bash
OS_NAME=windows VSCODE_ARCH=x64 bash build.sh
./VSCode-win32-x64/Wintermute.exe  # Startet Wintermute unter Windows
```

---

## Phase 2: Branding + Minimale UI

**Ziel:** Binary heißt `wntrmte`, UI zeigt `Wintermute`, UI startet Zed-ähnlich minimalistisch.

### 2.1 `product.json` (vollständig)
Alle Branding-Felder: `nameShort: "Wintermute"`, `nameLong: "Wintermute"`, `applicationName: "wntrmte"`, `dataFolderName: ".wntrmte"`, `darwinBundleIdentifier`, `win32AppId`, `win32x64AppId`, `win32arm64AppId`, `win32ContextMenu`, Marketplace → Open VSX.

**Wichtige Beobachtung aus dem lokalen Windows-Build auf VS Code 1.110:**
Das Win32-Packaging erwartet zusätzliche `win32*`-Metadaten in `product.json`, insbesondere `win32ContextMenu[arch].clsid`. Ohne diese Felder bricht `vscode-win32-x64-min-ci` im finalen Packaging ab.

### 2.2 Patches erstellen

| Patch | Was er tut | Konflikt-Risiko |
|-------|-----------|-----------------|
| `binary-name.patch` | `bin/code` → `bin/wntrmte` in Gulpfile | Sehr niedrig |
| `brand.patch` | Hardcoded "Visual Studio Code" Strings | Niedrig |
| `ui-defaults.patch` | Defaults in `workbench.contribution.ts` ändern | Niedrig |
| `telemetry.patch` | Telemetrie abschalten | Niedrig |
| `disable-copilot.patch` | GitHub Copilot UI/Flächen verstecken | Mittel |

**`ui-defaults.patch`** — Das Herzstück der Minimalisierung. Ändert Defaults in `src/vs/workbench/browser/workbench.contribution.ts`:

| Setting | Default → Neu |
|---------|--------------|
| `workbench.activityBar.location` | `"default"` → `"hidden"` |
| `workbench.editor.showTabs` | `"multiple"` → `"none"` |
| `window.commandCenter` | `true` → `false` |
| `editor.minimap.enabled` | `true` → `false` |
| `breadcrumbs.enabled` | `true` → `false` |

Status Bar bleibt sichtbar.

### 2.3 Icons
Eigene Icons in `icons/` erstellen → `prepare_vscode.sh` kopiert sie in `resources/darwin/`, `resources/win32/`, `resources/linux/`.

### Verifikation:
- Title Bar zeigt `Wintermute`
- Kein Activity Bar, keine Tabs, kein Minimap, keine Breadcrumbs
- CLI/Binary heißt `wntrmte`
- Windows-Paket erzeugt `VSCode-win32-x64/` mit `Wintermute.exe`
- `bin/wntrmte` und `bin/wntrmte.cmd` sind vorhanden
- `Ctrl+Shift+P` funktioniert

*(Bereits erledigt: `serverDataFolderName` → `.wntrmte-server` in `product.json` gesetzt. `disableAIFeatures: true` als top-level Property in `product.json` gesetzt — CHAT-Panel ist damit standardmäßig deaktiviert.)*

---

## Phase 3: Patchbay-Client Extension (MVP)

**Ziel:** Die wntrmte Extension wird von Anfang an als nativer Patchbay-Client designed — nicht als eigenständiger Orchestrator. Patchbay ist das Orchestrierungsgehirn, wntrmte ist der First-Class-Client.

### Warum Extension zuerst (nicht Source-Patch):
- Kein Patch-Wartungsaufwand — reiner TypeScript-Code
- Voller Zugriff auf VS Code Extension API (Language Model, Webview, Workspace)
- Kann unabhängig getestet werden
- Später in Phase 4 zu Source-Level promovierbar

### Strategie: Zwei Modi

**Offline-Modus (file-based):**
- Extension liest `.project-agents/` direkt aus dem Workspace
- Tasks, Runs, Decisions im Editor sichtbar — ohne laufendes Patchbay-Backend
- Nützlich ab Day 1, auch bevor Patchbay als Backend fertig ist

**Connected-Modus:**
- Verbindung zu Patchbay-Backend via WebSocket/HTTP wenn vorhanden
- Live-Updates: Task-Status, Run-Logs, neue Artifacts
- Patchbay-Dashboard als Webview-Panel innerhalb von wntrmte

**Vorteil:** Phase 3 kann beginnen, bevor Patchbay als Backend fertig ist. Die Extension ist sofort nützlich und wird automatisch mächtiger, sobald Patchbay dazukommt.

### Architektur

```
[Patchbay Dashboard Webview]       ← Dashboard-Panel oder standalone Browser
    ↕ postMessage / WebSocket
[Extension Host]
    PatchbayStore                   ← Liest .project-agents/ (offline) oder API (connected)
      → TaskTreeProvider            ← Tree View: Tasks + Status
      → RunLogProvider              ← Run-Logs + Artifacts anzeigen
      → PatchbayRunner              ← Delegiert an `patchbay run` CLI
```

### Extension-Struktur: `extensions/wntrmte-workflow/`

```
├── package.json                   # Views, Commands, Configuration
├── src/
│   ├── extension.ts               # Aktivierung, Modus-Erkennung (offline/connected)
│   ├── store/
│   │   ├── PatchbayStore.ts       # Abstraction: file-based oder API-backed
│   │   ├── FileStore.ts           # Liest/schreibt .project-agents/ direkt
│   │   └── ApiStore.ts            # HTTP/WebSocket zu Patchbay-Backend
│   ├── agent/
│   │   └── PatchbayRunner.ts      # Delegiert an `patchbay run` CLI (spawn, live output)
│   ├── providers/
│   │   ├── TaskTreeProvider.ts    # Tree View: Tasks mit Status aus .project-agents/
│   │   ├── RunLogProvider.ts      # Run-Logs + Summaries anzeigen
│   │   └── StatusBarItem.ts       # Status Bar: "Patchbay: 2 Tasks running"
│   └── webview/
│       └── DashboardPanel.ts      # Patchbay-Dashboard als Webview (connected mode)
```

### Kern-Komponenten:

**PatchbayStore** — Dual-Mode Datenzugriff:
- `FileStore`: Liest `.project-agents/` (project.yml, tasks/, runs/, decisions/)
- `ApiStore`: Kommuniziert mit Patchbay-Backend (HTTP/WebSocket)
- Automatische Modus-Erkennung: `.project-agents/` vorhanden → offline, Backend erreichbar → connected
- Nutzt das gemeinsame `.project-agents/`-Schema (definiert in `patchbay/schema/`)

**TaskTreeProvider** — Task-Übersicht im Editor:
- Zeigt Tasks nach Status gruppiert (open, in_progress, blocked, review, done)
- Context-Aktion: Status ändern (Set Task Status)
- Dispatch als View-Title-Action (öffnet Task-Picker → Runner-Picker)

**PatchbayRunner** — CLI-Delegation:
- Spawnt `patchbay run <taskId> <runnerId>` als Subprocess
- Streamt stdout/stderr live in VS Code Output Channel "Patchbay"
- Unterstützt CancellationToken (proc.kill() bei Abbruch)
- Ergebnis basiert auf Exit-Code: 0 = completed, sonst failed
- Runner-Picker mit konfigurierbarem `defaultRunner` Setting

### Integration in Build:
`prepare_vscode.sh` baut die Extension (`npm ci && npm run package`) und kopiert sie nach `vscode/extensions/wntrmte-workflow/` — wird als Built-in Extension gebundlet.

### Abhängigkeit zu Patchbay:
- **Schema:** Extension nutzt das `.project-agents/`-Format, definiert in `patchbay/schema/`
- **Kein harter Backend-Zwang:** Offline-Modus funktioniert ohne Patchbay-Backend
- **Schema-Owner ist Patchbay** — wntrmte implementiert eigene kompatible Interfaces, keine harte Code-Dependency

### Verifikation:
1. Workspace mit `.project-agents/`-Ordner öffnen → Tasks erscheinen im Tree View
2. Task-Status kann über Tree View geändert werden → `.project-agents/tasks/` wird aktualisiert
3. "Wintermute: New Agent Task" → Run wird gestartet, Log in `.project-agents/runs/` geschrieben
4. Bei `shell.execute` erscheint Approval-Dialog im Editor
5. (Connected) Patchbay-Backend starten → Live-Updates im Tree View
6. (Connected) Dashboard als Webview-Panel öffnen

---

## Phase 4: Source-Level Polish

- **Hidden Secondary Sidebar by default** — `ui-defaults.patch` setzt den 1.110.0-Default für die Secondary Sidebar auf hidden, damit die leere Auxiliary Bar nicht sichtbar ist.
- **Custom Wintermute Theme** — Built-in Extension `extensions/wntrmte-theme/` liefert `Wintermute Dark` als Default-Theme mit kalten Blau-/Cyan-Tönen.
- **Theme + Font Defaults** — `product.json` setzt `Wintermute Dark`, JetBrains Mono/Fira Code/Consolas-Fallback und Ligatures per `configurationDefaults`.
- **Compact Window Chrome** — `ui-defaults.patch` reduziert Custom Title Bar und Sidebar-/Panel-Header von 35px/30px auf 28px.
- **Build Integration** — `prepare_vscode.sh` bundelt die Theme-Extension ohne Compile-Schritt zusammen mit `wntrmte-workflow`.

---

## Phase 5: Patchbay Start Panel

**Ziel:** Beim Öffnen eines Patchbay-Workspaces erscheint rechts direkt ein nützliches Patchbay-Panel. Es zeigt entweder das eingebettete Dashboard oder eine lokale Setup-/Konfigurationsfläche.

### Produktziel

- Patchbay soll beim Start in wntrmte präsent sein, nicht erst nach manuellem Command
- Das Panel soll Setup-Probleme sichtbar machen statt nur ein leeres/kaputtes iframe zu zeigen
- Wintermute bleibt **Patchbay-Client**, nicht zweite Orchestrierungszentrale

### Zustände des Panels

**Setup-State:**
- Dashboard nicht erreichbar
- `patchbay` CLI fehlt
- `.project-agents/` fehlt oder Workspace ist nicht vorbereitet
- Panel zeigt Setup-Status + direkte Aktionen

**Connected-State:**
- Patchbay-Dashboard erreichbar
- Dashboard wird im rechten Editor-Bereich eingebettet
- Kleine lokale Kopfzeile mit Status und Schnellaktionen bleibt erhalten

### MVP (empfohlene erste Umsetzung)

1. **Auto-Open beim Start** ✅
   - Neues Setting: `wntrmte.workflow.openDashboardOnStartup` (Default: `true`)
   - Öffnet das Panel automatisch beim Aktivieren der Extension
   - Aktuell in Workspaces mit `.project-agents/`

2. **DashboardPanel zu echter Startfläche ausbauen** ✅
   - `DashboardPanel.ts` bekommt State-Logik statt reinem `iframe`
   - Webview kann zwischen Setup-State und Connected-State umschalten
   - Panel öffnet bevorzugt in der rechten Editor-Spalte

3. **Setup-Status sichtbar machen** ✅
   - Prüfen: Dashboard erreichbar?
   - Prüfen: `patchbay --version` erfolgreich?
   - Prüfen: `.project-agents/` vorhanden?
   - Anzeigen: aktueller Mode (`auto` / `offline` / `connected`)
   - Anzeigen: aktueller `defaultRunner`

4. **Direkte Setup-Aktionen im Panel** ✅
   - `Check Patchbay CLI`
   - `Show Patchbay CLI install command`
   - `Open Patchbay Dashboard` / `Open in Browser`
   - `Switch Mode`
   - `Set Default Runner`

5. **Iframe nur wenn sinnvoll** ✅
   - Bei erreichbarem Dashboard: `iframe` laden
   - Bei nicht erreichbarem Dashboard: Setup-Ansicht statt kaputter Fallback-Seite

### Aktueller Stand

- MVP ist in der Extension implementiert
- `DashboardPanel` ist jetzt eine zustandsfähige Webview mit Setup-State und Connected-State
- Ein lokaler `SetupInspector` bündelt CLI-, Dashboard- und Workspace-Prüfungen
- Das Panel aktualisiert sich bei relevanten Konfigurationsänderungen
- `defaultRunner` und `mode` lassen sich direkt aus dem Panel heraus ändern
- Der Build war erfolgreich; der Phase-5-MVP läuft durch die bestehende Build-/CI-Pipeline

### Erweiterung nach MVP

**Workspace Setup:** ✅ (implementiert in 5a)
- [x] Aktion `Initialize Patchbay Workspace` — `wntrmte.setupWorkspace` mit CLI-Delegation + lokalem Fallback
- [x] CLI-Erkennung → `initViaCli()`, ohne CLI → `createPatchbayWorkspace()`

**Runner-/Provider-Konfiguration:** größtenteils erledigt
- [x] `defaultRunner` im Panel auswählbar — `Set Default Runner` Button + Command
- [x] Auth-Konfiguration über Patchbay-CLI — `wntrmte.configureAuth` delegiert generisch
- [x] Provider-spezifische Einstiege: `wntrmte.configureClaude`, `wntrmte.configureCodex`, `wntrmte.configureGemini` etc. als eigene Commands in `contributes.commands` registrieren, jeweils direkt `patchbay auth set <runner>` im Terminal öffnen — aktuell nur generischer QuickPick über `configureAuth`

**Panel-Polish:** größtenteils erledigt
- [x] Refresh Button — im Panel-Header
- [x] `Open in Browser` — Button + `wntrmte.openPatchbayDashboardExternal`
- [x] Kompakte Statusleiste über dem eingebetteten Dashboard — Header mit Badges im Connected-State
- [x] `Open Patchbay Output`-Button im Start Panel — Button im DashboardPanel Webview (Setup-State), der `wntrmte.showOutput` auslöst und den Patchbay Output Channel öffnet; erleichtert Debugging wenn CLI-Ausgaben nicht im Terminal sichtbar sind

### Technische Tasks

1. `DashboardPanel.ts` refactoren:
   - Webview-State statt statischem HTML
   - Message-Bridge Webview ↔ Extension Host
   - Render-Pfade für Setup-State und Connected-State

2. `extension.ts` erweitern:
   - Auto-Open beim Start
   - neues Startup-Setting lesen
   - Panel bei Mode-/Status-Änderungen aktualisieren

3. Setup-Inspektor einführen:
   - lokaler Service für CLI-, Dashboard- und Workspace-Checks
   - Ergebnis als strukturiertes Statusmodell ins Webview geben

4. Commands ergänzen:
   - `wntrmte.checkPatchbayCli`
   - `wntrmte.showPatchbayCliInstall`
   - `wntrmte.openPatchbayDashboardExternal`
   - `wntrmte.setDefaultRunner`
   - `wntrmte.refreshDashboardPanel`
   - optional später `wntrmte.setupWorkspace`

5. Konfiguration erweitern:
   - `wntrmte.workflow.openDashboardOnStartup`
   - optional später `wntrmte.workflow.dashboardLocation`

### Abgrenzung / Architekturregel

- Wintermute zeigt Setup, Status und Einstiege
- Patchbay bleibt Owner für Orchestrierung, Runner-Registry und `.project-agents`-Schema
- Provider/Auth-Daten sollten nach Möglichkeit in Patchbay/CLI leben, nicht doppelt in der Extension

### Verifikation

1. Patchbay-Workspace öffnen → Panel erscheint automatisch rechts
2. Ohne laufendes Dashboard → Setup-State mit klaren Aktionen sichtbar
3. Mit laufendem Dashboard auf `http://localhost:3000` → Embedded Dashboard sichtbar
4. Fehlende CLI → Panel zeigt Install-Hinweis statt Dispatch-Fehler erst beim Klick
5. `defaultRunner` im Panel ändern → Dispatch nutzt den neuen Default

---

## Monatlicher Upstream-Update Prozess

```bash
bash update_upstream.sh              # stable.json bumpen
bash get_repo.sh                     # Neues VS Code klonen
cd vscode
for p in ../patches/*.patch; do      # Patches testen
  git apply --check "$p" || echo "CONFLICT: $p"
done
# Konflikte fixen, Patches regenerieren
bash build.sh                        # Full Build
# Smoke Test → Commit
```

**Patches mit niedrigem Konflikt-Risiko:** binary-name, CSS-Patches, telemetry
**Patches mit höherem Risiko:** disable-copilot (ändert sich oft bei MS), ui-defaults und neue Win32-Produktmetadaten bei Packaging-Änderungen

---

## Status

### Phase 1: Build-Pipeline ✅
- [x] Git-Repo initialisiert + GitHub Remote
- [x] `upstream/stable.json` — VS Code 1.110.0 gepinnt
- [x] `utils.sh`, `get_repo.sh`, `prepare_vscode.sh`, `build.sh` erstellt
- [x] `product.json` — Open VSX + Branding
- [x] `.github/workflows/build.yml` — CI für Linux, macOS, Windows
- [x] Lokaler Linux-Build erfolgreich — `VSCode-linux-x64/wntrmte` startet
- [x] Lokaler Windows-x64-Build erfolgreich — `VSCode-win32-x64/Wintermute.exe` startet

### Phase 2: Branding + Minimale UI ✅
- [x] `product.json` vollständig inkl. Win32-Packaging-Metadaten
- [x] `patches/binary-name.patch` — Binary `code` → `wntrmte`
- [x] `patches/brand.patch` — "Visual Studio Code" → "Wintermute"
- [x] `patches/ui-defaults.patch` — Activity Bar, Tabs, Minimap, Breadcrumbs, Command Center aus
- [x] `patches/telemetry.patch` — Telemetrie, Diagnostics, Crash Reporting aus
- [x] `patches/disable-copilot.patch` — GitHub Copilot/AI Features ausblenden
- [x] Icons generiert (ico, png) + Copy-Logik in `prepare_vscode.sh`
- [x] macOS `.icns` — Auto-Generierung via `iconutil` + `sips` in `prepare_vscode.sh`
- [x] CHAT-/AI-Panels — Erweiterter Patch: Agent Plugins, MCP Commands, Inline Chat, Installed MCP View
- [x] `serverDataFolderName` → `.wntrmte-server` in `product.json`

### Phase 3: Patchbay-Client Extension ✅
- [x] `PatchbayStore` mit `FileStore` (offline, `.project-agents/`-basiert)
- [x] `TaskTreeProvider` — Tasks im Tree View anzeigen
- [x] `RunLogProvider` — Run-Logs und Artifacts anzeigen
- [x] `StatusBarItem` — "Patchbay: X Tasks running"
- [x] `ApiStore` (connected mode, SSE zu Patchbay-Backend)
- [x] `StoreFactory` — Auto-Erkennung offline/connected mit Probe
- [x] `DashboardPanel` — Patchbay-Dashboard als Webview (iframe)
- [x] ~~`AgentRunner` / `ToolRegistry` / `ApprovalGate`~~ → replaced by `PatchbayRunner` (CLI delegation via `patchbay run`)
- [x] Build-Integration: Extension wird als Built-in gebundlet (`prepare_vscode.sh` Zeilen 63-71)

### Phase 4: Source-Level Polish — Done
- [x] Secondary Sidebar / Auxiliary Bar per Default hidden
- [x] Built-in Theme `extensions/wntrmte-theme/` mit `Wintermute Dark`
- [x] `product.json` configuration defaults für Theme + Editor-Font
- [x] Title Bar Höhe auf 28px reduziert
- [x] Sidebar-/Panel-Header auf 28px reduziert

> **Hinweis:** Wenn in anderen Dokumenten von „all core features implemented“ die Rede ist, bezieht sich das auf Phasen 1–4. Phase 5 ist bewusst als zusätzliches UX-/Onboarding-Polish geplant und nicht Teil des Kern-Scopes.

### Phase 5: Patchbay Start Panel — Done
- [x] Auto-Open Patchbay-Panel beim Start (`openDashboardOnStartup`)
- [x] DashboardPanel von `iframe`-Wrapper zu zustandsfähiger Webview umbauen
- [x] Setup-State für CLI, Dashboard und Workspace-Status
- [x] Panel-Aktionen: CLI prüfen, Install-Hinweis, Dashboard öffnen, Mode wechseln, Default Runner setzen
- [x] Embedded Dashboard nur bei erreichbarem Backend anzeigen
- [x] Compile-/Smoke-Check der Extension über die Build-/CI-Pipeline erfolgreich

#### 5a: Workspace-Setup-Flow — DONE

CLI-Delegation wenn verfügbar, erweiterter lokaler Fallback wenn nicht.

**Abhängigkeit:** `patchbay init --yes` Flag (siehe `patchbay/PLAN.md` Phase 7a) — implementiert

- [x] `initViaCli(workspaceRoot, name, goal, techStack): Promise<boolean>` in `src/services/SetupInspector.ts`
  - Spawnt `patchbay init --name "..." --goal "..." --tech-stack "..." --yes` im Workspace-Root
  - Gibt `true` bei Erfolg, `false` bei Fehler zurück
- [x] `setupWorkspace` Command in `src/extension.ts` überarbeiten:
  - `checkPatchbayCli()` → wenn CLI da: Name/Goal/TechStack via `showInputBox()` abfragen → `initViaCli()`
  - Wenn CLI fehlt: Fallback auf `createPatchbayWorkspace()` + Notification "CLI empfohlen"
- [x] `createPatchbayWorkspace()` in `src/services/SetupInspector.ts` erweitern:
  - Zusätzlich `agents/`, `decisions/`, `context/` Dirs erstellen (nur mkdir, kein Core-Import)
- [x] DashboardPanel `src/providers/DashboardPanel.ts`: Init-Vollständigkeit prüfen
  - `isWorkspaceComplete()` checkt ob `agents/`, `decisions/`, `context/` existieren
  - Workspace-Card und Next-Steps zeigen Hinweis falls unvollständig

#### 5b: Auth-Status UX — IMPLEMENTED

Auth-Status im DashboardPanel anzeigen. Konfiguration bleibt in Patchbay CLI.

- [x] `AuthStatus` Interface + `checkPatchbayAuth()` in `src/services/SetupInspector.ts`
  - Parst den aktuellen `patchbay auth list`-Output tolerant
  - `SetupStatus` enthält jetzt `auth: AuthStatus`
  - Auth-Check läuft parallel zu CLI- und Dashboard-Checks
- [x] `AVAILABLE_RUNNERS` in `src/services/constants.ts` auf Patchbay-Runner erweitert
  - Hinzugefügt: `cursor`, `http`
  - Separate `AUTH_RUNNERS`-Liste für tatsächlich auth-relevante Runner
- [x] DashboardPanel `src/providers/DashboardPanel.ts`
  - Header-Badge für Auth-Status (`Auth x/y`)
  - Setup-State mit eigener Auth-Card
  - Connected-State zeigt Auth weiter in der Kopfzeile
  - "Recommended Next Steps" berücksichtigt fehlende Auth-Konfiguration
- [x] `wntrmte.configureAuth` Command in `src/extension.ts` + `package.json`
  - QuickPick für fehlende Runner
  - Führt `patchbay auth set <runner>` direkt aus der Extension aus
  - Unterstützt `Subscription` und `API Key`
  - Fällt bei fehlender CLI sauber auf Install-Hinweis zurück
- [x] `dashboardUrl` Setting-Beschreibung in `package.json` aktualisiert
  - Hinweis auf Dashboard (`3000`) oder Standalone-Server (`3001`)

**Architekturentscheidung**

- Wintermute zeigt Auth-Status und startet den CLI-Flow
- Patchbay CLI bleibt Source of Truth für Auth
- Keine Secret-Eingabe oder lokale Auth-Speicherung im Webview

**Bekannter Restpunkt — RESOLVED**

- `npm run compile` läuft auf Windows nativ einwandfrei (esbuild 17ms, 175 KB).
- WSL-Ursache: Windows-npm-ci installiert `@esbuild/win32-x64`; WSL kann diese Binary nicht ausführen. Fix: `npm run compile:fresh` führt `npm ci` in der aktuellen Shell-Umgebung aus und holt dabei die plattformkorrekte esbuild-Binary nach.
- [x] Lokale WSL-/Node-Umgebung: `compile:fresh`-Script in `package.json` ergänzt — WSL-Nutzer führen `npm run compile:fresh` statt `npm run compile` aus.

**Verifikation**

1. Ohne Patchbay CLI: Panel zeigt Auth als nicht verfügbar, ohne zu crashen
2. Mit CLI, aber ohne konfigurierte Runner: Auth-Badge zeigt Defizit, QuickPick listet fehlende Runner
3. Nach `patchbay auth set <runner>` und Refresh: Badge/Card aktualisieren sich korrekt
4. Bei vollständig konfigurierten auth-relevanten Runnern: Badge wechselt auf `ok`
5. Connected-State mit laufendem Dashboard zeigt weiterhin Auth-Status in der Kopfzeile

#### 5c: Setup Panel Polish + Windows CLI Robustness — IMPLEMENTED

Mehrere UX- und Plattform-Fixes aus realem Test-Workspace-Feedback.

- [x] `CLI Install` führt nicht mehr nur einen Copy-Flow aus
  - Bietet `Use existing checkout`, `Clone Patchbay nearby` und `Show manual steps`
  - Führt Build + globale CLI-Installation im integrierten Terminal aus
- [x] Fehlerhafter npm-Hinweis `npm install -g @patchbay/cli` entfernt
  - Wintermute und README verweisen jetzt auf lokalen Build-/Install-Flow aus dem Companion-Repo
- [x] Doppelter `Refresh`-Button im Setup-Panel entfernt
- [x] `Configure Auth` verbessert
  - Auswahl zwischen `Subscription` und `API Key`
  - API-Key-Eingabe direkt in Wintermute
  - CLI-Ausführung nicht mehr nur als halber Terminal-Handoff
- [x] Windows-CLI-Aufrufe robust gemacht
  - Plattformabhängige Auflösung `patchbay.cmd` statt blindem `patchbay`
  - Betrifft Auth-Konfiguration, Dispatch und Standalone-Server-Start
- [x] `Start Dashboard`-Aktion ergänzt
  - Als eigener Panel-Button wenn das Dashboard offline ist
  - Startet Dashboard/Server im Hintergrund statt mit Terminal-Fokus
- [x] Reachability-Check robuster gemacht
  - Probing gegen `localhost` und `127.0.0.1`
  - Bessere Fehlermeldungen aus dem internen Fetch
- [x] Panel aktualisiert sich automatisch
  - Periodischer Auto-Refresh solange das Panel offen ist
  - Zusätzliche verzögerte Refreshes nach `Start Dashboard`
  - Webview rendert nur bei echtem HTML-Änderungsfall neu, um unnötige iframe-Resets zu vermeiden
- [x] Webview-Refresh weiter beruhigt
  - Stabile CSP-Nonce pro Panel verhindert unnötige komplette HTML-Resets
  - Eingebettetes Dashboard pollt Daten selbst, ohne dass Wintermute die UI jedes Mal spürbar neu aufbaut
- [x] Windows-Startmenü-Branding korrigiert
  - `build.sh` post-processiert die erzeugte `*.VisualElementsManifest.xml`
  - `ShortDisplayName` wird auf `Wintermute` gesetzt statt `Code - OSS`

**Architekturentscheidung**

- Wintermute bleibt Patchbay-Client und startet lokale Flows nur als Convenience
- Patchbay CLI bleibt Source of Truth für Auth und Dispatch
- Das Setup-Panel soll Statusänderungen automatisch widerspiegeln statt den Nutzer auf manuelle Refreshes zu zwingen
- [x] Endnutzer-CLI-Installer ohne Repo-Clone — npm-Option als erste Wahl im Install-QuickPick (`npm install -g @patchbay/cli`). Greift automatisch, sobald `@patchbay/cli` auf dem npm-Registry veröffentlicht wird. Fallback auf bestehende Clone-/Checkout-Flows bleibt erhalten.

**npm-Publish Voraussetzungen** (liegt in `patchbay/PLAN.md`):
~9 interne Packages müssen zuerst veröffentlicht werden, `"*"`-Versionen durch konkrete Nummern ersetzen, `package.json`-Pflichtfelder ergänzen, Versionsstrategie festlegen, ersten Publish mit `--access public`. Sinnvoll erst wenn API stabil — siehe `patchbay/PLAN.md`.

**Bekannter Restpunkt**

- Lokaler Compile-/Smoke-Check der Extension bleibt in der aktuellen WSL-/Node-Umgebung eingeschränkt

**Verifikation**

1. `CLI Install` startet Build/Install aus lokalem `patchbay/`-Repo statt nur Clipboard-Text zu zeigen
2. `Configure Auth` funktioniert auf Windows ohne `spawn patchbay ENOENT`
3. `Start Dashboard` startet den Prozess im Hintergrund und das Panel springt automatisch auf `Dashboard online`
4. Eingebettetes Dashboard bleibt bei Auto-Refresh stabil geöffnet und verliert offene UI nicht durch unnötige Webview-Resets

---

## Phase H: Runner Install-on-Demand — IMPLEMENTED

**Kontext:** Patchbay Phase H führt einen strukturierten `installHint` im `RunnerOutput` ein, wenn ein CLI-Binary nicht auf dem Host vorhanden ist. Wintermute wertet diesen Hint aus und bietet eine direkte Install-Option im integrierten Terminal an.

**Abhängigkeit:** `installHint?: string` in `RunnerOutput` (patchbay `packages/core/src/runner.ts`) — implementiert.

**Umsetzung:**

- [x] `RunnerOutput` in `@patchbay/core` um `installHint?: string` erweitert
- [x] `Run`-Typ in `@patchbay/core` um `installHint?: string` erweitert
- [x] `run.schema.json` um `installHint`-Feld erweitert
- [x] `Orchestrator.finalize()` propagiert `installHint` von `RunnerOutput` nach `Run`
- [x] Runner `claude-code`, `codex`, `gemini` geben `installHint` bei fehlendem CLI zurück
- [x] Wintermute `Run`-Typ (`store/types.ts`) um `installHint` erweitert
- [x] `FileStore.getRuns()` bewahrt `installHint` beim Lesen von Run-JSONs
- [x] `scheduleInstallHintCheck()` in `extension.ts` — liest nach Dispatch das neueste Run-JSON und zeigt bei `installHint` einen Error-Dialog mit Install-Button
- [x] `dispatchInTerminal` ruft `scheduleInstallHintCheck()` nach dem Dispatch auf

**Verifikation:**

1. Task an `claude-code`-Runner dispatchen wenn `claude` nicht installiert — Error-Message mit Install-Button erscheint
2. Klick auf Button öffnet Terminal mit `npm install -g @anthropic-ai/claude-code`
3. Nach erfolgreicher Installation: erneuter Dispatch läuft ohne Fehlermeldung durch

---

## Phase D: Terminal Feedback für Runner-Dispatch — Done

Gefunden beim manuellen Testen: nach dem Dispatch-Dialog gibt es kein Live-Feedback. Der Nutzer sieht nicht, was der Runner macht.

**Ziel:** Beim Dispatch aus dem eingebetteten Dashboard öffnet sich ein integrierter VS Code Terminal mit Live-Output von `patchbay run <taskId> <runnerId>`. `Ctrl+C` bricht den Prozess ab.

**Technische Umsetzung:**

- [x] `src/providers/DashboardPanel.ts` — postMessage-Relay im `<script nonce>`-Block: `window.addEventListener('message', ...)` leitet iframe-Messages mit `wntrmte.*`-Prefix über `vscode.postMessage` an Extension-Host weiter (→ bestehende `onDidReceiveMessage`-Bridge)
- [x] `src/extension.ts` — neues Command `wntrmte.dispatchInTerminal(taskId, runnerId)`: nutzt bestehendes `runTerminalPlan()` + `getPatchbayCliExecutable()`, ruft `treeProvider?.refresh()` und `scheduleDelayedPanelRefresh()` auf. `wntrmte.dispatch` (Command Palette) delegiert jetzt an `wntrmte.dispatchInTerminal` statt OutputChannel.
- [x] `package.json` (`extensions/wntrmte-workflow/`) — `wntrmte.dispatchInTerminal` in `contributes.commands` eingetragen
- [x] `packages/dashboard/src/components/DispatchDialog.tsx` — VS Code Webview-Kontext erkannt (`window.parent !== window`), sendet `window.parent.postMessage({ command: 'wntrmte.dispatchInTerminal', args: [taskId, runnerId] }, '*')` statt HTTP-Aufruf; Browser-Pfad bleibt unverändert

**Abhängigkeit zu Patchbay Phase D1:** `DispatchDialog.tsx`-Änderung setzt voraus, dass der Dashboard-Dispatch non-blocking ist (HTTP 202), damit der Dialog in beiden Kontexten korrekt schließt.

---

## Phase E: Server-Terminal in Wintermute — Done

**Umgesetzt:** Dashboard-Startup auf VS Code Terminal API umgestellt. `runTerminalPlanInBackground()` erstellt ein integriertes Terminal mit `terminal.show(true)` (zeigt den Terminal-Tab, stiehlt keinen Editor-Fokus). Dashboard-Server erscheint jetzt als benannter Terminal-Tab in Wintermutes Terminal-Panel — kein separates OS-Fenster mehr.

- [x] `src/extension.ts` — `runTerminalPlanInBackground(plan: TerminalPlan): vscode.Terminal` hinzufügen: erstellt `vscode.window.createTerminal`, ruft `terminal.show(true)` (preserveFocus), sendet Kommando
- [x] `src/extension.ts` — `wntrmte.startPatchbayDashboard`: `startBackgroundProcess(startPlan)` → `runTerminalPlanInBackground(startPlan)`
- [x] `src/extension.ts` — `wntrmte.openPatchbayDashboardExternal` ("Start Dashboard"-Branch): gleiche Umstellung

---

## Phase C: Test-Infrastruktur — Done

### Schicht 1: Extension Unit Tests (Vitest + vscode-Mock)

- [x] `vitest` + `vitest.config.ts` in `extensions/wntrmte-workflow/` (alias: `vscode` → `__mocks__/vscode.ts`)
- [x] `src/__mocks__/vscode.ts` — minimaler Mock für workspace, window, Uri, EventEmitter, RelativePattern
- [x] `src/store/FileStore.test.ts` — 12 Tests: getTasks (parse, sort, filter), getRuns (filter, skip malformed), updateTaskStatus, saveRun, getProject gegen tmp-dir
- [x] `src/services/SetupInspector.test.ts` — 9 Tests: `isWorkspaceComplete()` (3 Cases), `checkPatchbayCli()` (6 Cases inkl. stdout/stderr/fallback/cwd); Mock via `util.promisify.custom`-Symbol
- [x] CI: `test`-Job in `.github/workflows/build.yml` (ubuntu-22.04, kein Display-Server); `build`-Jobs haben `needs: test`
- [x] *(optional)* `@vscode/test-electron` für Extension-Aktivierung + Command-Handler — nur lokal, noch ausstehend

---

## Phase J: Multi-Turn Runner Conversations — DONE

**Kontext:** Wenn ein CLI-Runner (z.B. `claude-code`) eine Rückfrage stellt, wechselt der Task in den Status `awaiting_input`. Wintermute erkennt diesen Zustand und ermöglicht dem Nutzer, direkt aus der IDE zu antworten.

**Abhängigkeit:** Phase J in `patchbay` (Core-Typen, Claude-Code-Runner, Orchestrator, CLI) — implementiert.

**Umsetzung:**

- [x] `extensions/wntrmte-workflow/src/store/types.ts` — `awaiting_input` in `TaskStatus`-Enum ergänzt; `conversationId`, `sessionId`, `turnIndex` in `Run`-Interface ergänzt
- [x] `extensions/wntrmte-workflow/src/store/FileStore.ts` — bewahrt neue Konversations-Felder (`conversationId`, `sessionId`, `turnIndex`) beim Lesen von Run-JSONs
- [x] `extensions/wntrmte-workflow/src/providers/TaskTreeProvider.ts` — `awaiting_input` mit Icon `comment-discussion` und Label "Awaiting Reply" in Sidebar; sortiert vor anderen Status
- [x] `extensions/wntrmte-workflow/src/extension.ts` — `scheduleInstallHintCheck` → `schedulePostRunCheck`: prüft nach Dispatch sowohl `installHint` (Fall 1: Runner nicht installiert) als auch `awaiting_input`-Task-Status (Fall 2: Runner stellt Frage). Bei Frage: `vscode.window.showInputBox` mit Fragentext, Antwort öffnet Terminal mit `patchbay reply <conversationId> "<reply>"`, kaskadiert weiteren Check für Folge-Runs

**Verifikation:**

1. Task an `claude-code` dispatchen mit einem Ziel, das eine Rückfrage auslöst → Task wechselt zu `awaiting_input`, Sidebar zeigt `comment-discussion`-Icon
2. Wintermute zeigt InputBox mit der Frage des Runners → Nutzer tippt Antwort → Terminal öffnet sich mit `patchbay reply`
3. Nach Antwort: Task wechselt zurück zu `in_progress` → nach Abschluss `done`
4. Dashboard: "Awaiting Reply"-Spalte im Kanban sichtbar; Dispatch-Dialog zeigt Reply-Modus mit Frage + Textarea

### Post-J: Qualitätsverbesserungen

- [x] `extensions/wntrmte-workflow/src/extension.ts` + `src/providers/DashboardPanel.ts` — `DashboardPanel.show()` und `toggle()` zu `async` refactored; `wntrmte.toggleTerminalPanel`-Command ersetzt `workbench.action.terminal.toggleTerminal` für bessere Extension-Integration
- [x] `extensions/wntrmte-workflow/src/extension.ts` — Status-Bar-Item für Terminal-Toggle (`$(terminal)` Icon) ergänzt
- [x] `extensions/wntrmte-workflow/src/providers/DashboardPanel.ts` — Hero-Section entfernt (Cleanup)

---

## Phase K: Projekt-Import für bestehende Repos — DONE

**Abhängigkeit:** Phase K in `patchbay` (`detectProjectMeta`, `bootstrapContextFiles`) — implementiert.

**Umsetzung:**

- [x] `src/extension.ts` — `wntrmte.initializePatchbay` Command: Guard wenn `.project-agents/` schon vorhanden; startet `patchbay init --yes` im integrierten Terminal; "Initialize Patchbay Workflow"-Button im Start Panel sichtbar

---

## Phase L: Agent Connector Architecture — Wintermute-Anteil

**Abhängigkeit:** Phase **L1–L5** sind im Monorepo umgesetzt (`packages/` Connector-Backend, **L5** Root-Workspace + `@patchbay/core` in der Extension). **Offen:** Agent-Chat-UI + Relay (L6), `/agents`-Erweiterung (L7). Siehe `../PLAN.md` Phase L.

**Kontext:** Das Patchbay Dashboard wird zur vollwertigen Agent-Orchestration-App (Agent Chat, Streaming, Approvals). Wintermute bettet es als Webview-Panel ein. Die Dashboard-Funktionalität wird unter `packages/dashboard` gebaut — Wintermute stellt den Host und das postMessage-Relay.

**Provider-Schichten:** Die konkrete Anbindung pro Anbieter liegt in **`packages/`** (Runners/Connectors) — siehe `../VISION.md` / `../TODO.md` (Provider-Referenz). Wintermute ändert daran nichts; es leitet nur Commands weiter.

### L5: Monorepo-Konsolidierung — DONE

- [x] Monorepo: Root-`package.json` Workspaces, `packages/` + `ide/` + `schema/`
- [x] `store/types.ts` — Imports aus `@patchbay/core`
- [x] `extension.ts` aufgeteilt — `CliManager`, `AuthService`, `TerminalOrchestrator` in `ide/extensions/wntrmte-workflow/src/services/`

### L6: Dashboard Agent Chat — Wintermute-Integration

- [ ] `DashboardPanel.ts` — postMessage-Relay für: `wntrmte.connectAgent`, `wntrmte.sendAgentInput`, `wntrmte.approveAgent`, `wntrmte.denyAgent`, `wntrmte.cancelAgent` (Patchbay-Backend unterstützt Approve/Deny/Cancel bereits)
- [ ] Agent Chat läuft im eingebetteten Dashboard-iframe — keine eigene Webview-UI in der Extension nötig
- [ ] `schedulePostRunCheck` bleibt für Batch-Runner; Connector-Sessions werden live über Dashboard/SSE gehandelt
