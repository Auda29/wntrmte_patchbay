# Patchbay — Brainstorming & Konzeptzusammenfassung

## Ausgangspunkt

Die Idee entstand aus der Frage, ob man ein System wie **Paperclip** auch für kleinere Softwareprojekte nutzen könnte — nicht als Feature des eigentlichen Produkts, sondern **für die Entwicklung des Projekts selbst**.

Paperclip ist interessant, weil es mehrere Agents und Tools zentral über ein Dashboard orchestriert. Besonders stark ist dabei das **Dashboard als Kontroll- und Steueroberfläche**. Unsere Weiterentwicklung zielt auf eine **leichtere, pragmatischere Variante** für Solo-Developer, kleine Teams und OSS-Projekte.

---

## Kernidee

Viele Entwickler arbeiten parallel mit:

- Cursor
- Claude Code
- Codex
- Bash
- HTTP/API-basierten Agenten
- weiteren lokalen oder entfernten Tools

Das Problem ist oft nicht die Qualität dieser Tools, sondern dass:

- Kontext verloren geht
- Aufgaben über mehrere Chats und Terminals verstreut sind
- Entscheidungen nicht sauber dokumentiert werden
- unklar bleibt, welches Tool was geändert hat
- es keinen einheitlichen Überblick über Tasks, Runs und Ergebnisse gibt

### Lösung

**Patchbay** soll keine neue IDE und kein neuer Coding-Agent sein, sondern eine **leichte Orchestrierungs- und Kontrollschicht**:

> Ein zentrales Dashboard, das bestehende Tools wie Cursor, Claude Code, Codex, Bash und HTTP-Runner über CLI oder standardisierte Adapter steuert.

Also:

- **kein Ersatz für Cursor**
- **kein eigener Coding-Agent**
- **keine überkomplexe Agentenfirma**
- sondern ein **Command Center für AI-gestützte Softwareentwicklung**

---

## Produktvision

### Kurzbeschreibung

**Patchbay** ist eine lightweight control plane für AI-assisted software development.

Auf Deutsch:

> Eine schlanke Zentrale zur Steuerung von Aufgaben, Kontext, Runs und Entscheidungen über mehrere AI-Tools und IDEs hinweg.

### Zielgruppe

- Solo-Developer
- Maintainer kleiner OSS-Projekte
- kleine Entwicklerteams
- Side Projects
- Prototyping-Setups
- AI-unterstützte Repo-Wartung

---

## Leitprinzipien

### 1. Dashboard-first

Das Dashboard ist eines der Hauptfeatures und nicht nur Deko.

Von dort aus soll man:

- Tasks anlegen
- Runner auswählen
- Runs starten
- Logs verfolgen
- Ergebnisse prüfen
- Diffs reviewen
- Entscheidungen bestätigen
- blockierte Tasks neu zuweisen

Das Dashboard ist also:

> **Control Panel + Dispatch + Review Station**

### 2. IDEs bleiben Werkzeuge, nicht die Zentrale

- **Dashboard** = Planung, Dispatch, Monitoring, Review
- **Cursor** = Werkstatt zum Implementieren
- **Claude Code** = Refactor, Architektur, Planung
- **Codex** = fokussierte Coding-Aufgaben
- **Bash** = Build, Tests, Git, Skripte
- **HTTP** = Doku, APIs, externe Kontexte

### 3. CLI als Integrationsschicht

Die erste sinnvolle Integrationsstrategie ist:

> **Dashboard -> Orchestrator -> Runner -> CLI-Tool**

Vorteile:

- einfacher umzusetzen
- robuster
- lokal nutzbar
- reproduzierbar
- gut logbar
- tool-agnostisch
- später erweiterbar

### 4. Repo-first statt Blackbox

Für kleine Projekte sollte möglichst viel Zustand im Repo oder lokal nachvollziehbar gespeichert werden.

Das bringt:

- Transparenz
- Git-Historie
- Nachvollziehbarkeit
- Offline-Tauglichkeit
- OSS-Freundlichkeit
- keinen harten Lock-in

### 5. Wenig Overhead, hohe Nützlichkeit

Bewusst **nicht** Ziel:

- komplexe Hierarchien
- Org-Charts
- Budgets und Kostenstellen
- Management-Theater
- chaotische Agent-zu-Agent-Kommunikation

Fokus stattdessen auf:

- Tasks
- Runs
- Diffs
- Reviews
- Entscheidungen
- Kontext

---

## Produktdefinition

> **Patchbay ist ein zentrales Dashboard, das Cursor, Claude Code, Codex, Bash und andere CLI-/Agent-Tools als koordinierte Worker für ein Softwareprojekt steuert.**

---

## Hauptkomponenten

### 1. Dashboard

Die Web-Oberfläche ist die zentrale Schaltzentrale.

#### Aufgaben des Dashboards

- Projekte anzeigen
- Tasks verwalten
- Runner auswählen
- Runs starten, stoppen, neu starten
- Logs und Status anzeigen
- Diffs und Artefakte prüfen
- Review-Flows steuern
- Entscheidungen dokumentieren
- Blocker sichtbar machen

#### Hauptbereiche im Dashboard

##### Projects
- Repo
- Ziel
- Status
- letzte Aktivität

##### Tasks
- offen
- in Arbeit
- blockiert
- Review
- done

##### Runs
- verwendeter Runner
- Startzeit
- Dauer
- Status
- Logs
- Zusammenfassung

##### Artifacts
- Diffs
- Patch-Dateien
- generierte Dokumente
- Run-Summaries

##### Decisions
- technische Entscheidungen
- Begründungen
- vorgeschlagen von Agent oder Mensch
- bestätigter Status

### 2. Orchestrator

Der Orchestrator ist der Kern des Systems.

#### Aufgaben des Orchestrators

- Task-State verwalten
- Projektkontext zusammensetzen
- Agent-/Runner-Profile laden
- Adapter oder Runner starten
- Run-Logs speichern
- Ergebnisse einsammeln
- Status aktualisieren
- Review- und Entscheidungsfluss koordinieren

### 3. Runner / Adapter

Jedes externe Tool wird über einen Runner angebunden.

#### Denkbare Runner

- Cursor Runner
- Claude Code Runner
- Codex Runner
- Bash Runner
- HTTP Runner
- später evtl. GitHub Runner oder weitere Tools

#### Gemeinsamer Minimalvertrag eines Runners

##### Input
- task id
- repo path
- branch
- betroffene Dateien
- Kontextdateien
- Projektregeln
- Zielbeschreibung
- gewünschtes Ausgabeformat

##### Output
- status
- summary
- changed files
- diff / patch reference
- logs
- blockers
- vorgeschlagene nächste Schritte

---

## Warum Cursor besonders wichtig ist

Cursor ist einer der wichtigsten Kandidaten, weil dort oft die eigentliche Implementierung passiert.

### Zielbild für Cursor

- Task wird zentral im Dashboard angelegt
- Cursor wird als Runner ausgewählt
- Task-Kontext wird an Cursor übergeben
- Cursor bearbeitet den Task im Repo oder Workspace
- Ergebnis, Diff und Summary kommen zurück ins System
- Review und Decision laufen wieder zentral über das Dashboard

Damit wird Cursor nicht ersetzt, sondern in einen größeren sauberen Workflow eingebunden.

---

## Geplante Cursor-Integrationsstrategie

### Stufe 1: pragmatisch und repo-/CLI-nah

- strukturierte Task-Dateien
- CLI- oder Wrapper-basierter Aufruf
- vorbereitete Kontextdateien
- Ergebnisse werden aus Diffs, Logs, Artefakten oder Dateien zurückgelesen

### Stufe 2: Companion / semantische Integration

- Tasks im lokalen Tool sichtbar
- Statusänderungen
- Kontextdateien automatisch verwaltet
- gezielteres Öffnen relevanter Dateien

### Stufe 3: tiefe Integration

- Task-Panel direkt in Cursor
- Live-Run-Status
- Review-Requests
- Decision-Sync
- strukturierte Rückkanäle

---

## Datenmodell / Kernobjekte

### Project
Beschreibt das Projekt.

Mögliche Felder:
- name
- repo path
- goal
- rules
- tech stack

### Agent / Runner Profile
Beschreibt, wie ein Tool als Worker eingesetzt wird.

Mögliche Felder:
- role
- tool type
- model/provider
- allowed tools
- prompt/profile
- scope

### Task
Die wichtigste Arbeitseinheit.

Mögliche Felder:
- id
- title
- description
- goal
- status
- owner
- affected files
- acceptance criteria
- result

### Run
Ein einzelner Ausführungsversuch eines Tasks.

Mögliche Felder:
- task reference
- runner
- start time
- end time
- status
- logs
- summary
- diff reference
- blockers

### Decision
Dokumentiert technische Entscheidungen.

Mögliche Felder:
- id
- title
- rationale
- proposed by
- approved by
- timestamp

### Artifact
Ergebnisse eines Runs.

Beispiele:
- Patch
- Diff
- Markdown-Zusammenfassung
- Changelog-Entwurf
- Fehlerbericht
- Analysebericht

---

## Speicherung / Repo-Struktur

```text
.project-agents/
  project.yml
  agents/
    cursor-builder.yml
    reviewer.yml
    docs.yml
  tasks/
    TASK-001.md
    TASK-002.md
  decisions/
    DEC-001-use-open-vsx.md
  runs/
    2026-03-06-task-001-cursor-run.json
  context/
    architecture.md
    conventions.md
    current-focus.md
```

### Vorteile

- git-versioniert
- transparent
- mit normalen Tools lesbar
- kein Cloud-Zwang
- ideal für OSS und kleine Teams
- kompatibel mit lokaler CLI-Logik
- gute Grundlage für ein Dashboard

---

## Kommunikationsmodell zwischen Agenten

Freie Agent-zu-Agent-Kommunikation sollte bewusst vermieden werden.

### Warum?

Sonst wird es schnell:

- schwer nachvollziehbar
- unklar in den Verantwortlichkeiten
- schwer reproduzierbar
- unnötig komplex

### Bessere Alternative

Kommunikation läuft strukturiert über:

- Tasks
- Run-Kommentare
- Reviews
- Decisions

Also z. B.:

- Builder liefert ein Ergebnis
- Reviewer kommentiert
- Mensch oder Lead bestätigt die Entscheidung
- Task-Status wird geändert

---

## Beispielworkflow

### Beispiel: Upstream-Bump in einem Projekt wie `wntrmte`

#### Task
**Bump upstream VS Code to version X.Y.Z**

#### Ablauf

##### Lead / Dashboard
- erstellt Task
- definiert Ziel
- hängt relevante Dateien an
- setzt Erfolgskriterien

##### Cursor Runner
- bearbeitet Task im Repo
- passt Versionen oder Patches an
- dokumentiert Konflikte
- erstellt Summary
- liefert Diff / Änderungen zurück

##### Reviewer Runner
- prüft Auswirkungen
- markiert Risiken
- fordert ggf. Nacharbeit

##### Docs Runner
- aktualisiert Changelog, README oder Notes

##### Mensch
- prüft Diffs
- bestätigt Entscheidungen
- markiert Task als done oder gibt Rework frei

---

## Was bewusst nicht Teil von v1 sein sollte

### Nicht priorisieren in v1

- komplexe Multi-User-Organisation
- Cloud-Zwang
- Agenten-Hierarchien
- Budgets / Kostenpolitik
- autonome Agentenschwärme
- Unternehmenssimulation
- zu viele Spezialrollen
- zu frühe tiefe IDE-Plugins
- überladene Governance

### Fokus in v1

- Dashboard
- Task-Modell
- Runner-Modell
- CLI-Dispatch
- Run-Historie
- Diffs / Artefakte
- Review-Flow
- Decision-Log
- Cursor als wichtiger Runner

---

## V1-Vorschlag

### Zielbild für v1

Eine erste Version sollte bereits nutzbar und pragmatisch sein:

- lokales oder selbstgehostetes Dashboard
- ein Projekt pro Repo
- Tasks anlegen und verwalten
- Runner auswählen
- Runs starten
- Logs und Ergebnisse sehen
- Diffs prüfen
- Entscheidungen dokumentieren
- Runs historisch nachvollziehen

### Unterstützte Runner in v1

- Cursor
- Bash
- HTTP
- optional Claude Code / Codex, sofern CLI-fähig oder per Wrapper anbindbar

### Technische Philosophie

- dashboard-first
- repo-first
- CLI-first
- auditierbar
- lokal oder self-hosted
- tool-agnostisch
- kleine klare Datenmodelle

---

## Zentrale Erkenntnis

Die eigentliche Produktchance liegt nicht darin, ein neues Modell oder eine neue IDE zu bauen.

Sie liegt in:

> **der Orchestrierung bereits guter Tools über ein gemeinsames Task-, Kontext-, Run- und Decision-System**

Also nicht:
- ein besserer Agent

sondern:
- **eine bessere Arbeitssteuerung über mehrere Agenten und IDEs hinweg**

---

## Finales Fazit

**Patchbay** ist ein schlankes, dashboard-gesteuertes Orchestrierungssystem für kleine Softwareprojekte, das Cursor, Claude Code, Codex, Bash und weitere Tools über CLI oder Adapter als koordinierte Worker einsetzt.

### Zentrale Stärken

- echtes zentrales Dashboard
- klare Task- und Run-Struktur
- gute Nachvollziehbarkeit
- Diffs, Reviews und Decisions im selben System
- repo-nahe Speicherung
- Cursor als besonders wichtiger Worker
- modularer Ausbau statt Overengineering

Das System soll nicht wie eine KI-Firma wirken, sondern wie ein:

> **Mission Control Center für ein Repo**

---

## Ein-Satz-Version

**Patchbay ist ein leichtgewichtiges Dashboard zur Steuerung von Cursor, Claude Code, Codex, Bash und anderen AI-/CLI-Workern für kleine Softwareprojekte — mit Fokus auf Tasks, Kontext, Runs, Diffs und Entscheidungen.**
