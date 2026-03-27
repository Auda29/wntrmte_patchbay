# TwinCAT als Vertikal für Patchbay/Wintermute

## Ausgangslage

Patchbay und Wintermute adressieren heute ein generelles Problem im Agentic Coding: mehrere Agenten, mehrere Interfaces, wenig Transparenz und kein sauberer, git-versionierter Arbeitszustand.

Die bestehende Produktvision bleibt dabei unverändert:

- **Patchbay** ist die Agent-Orchestrationsplattform
- **Wintermute** ist der IDE-Host
- **`.project-agents/`** ist der transparente Integrationsvertrag im Repo

Das TwinCAT-Thema ist in diesem Kontext **kein zweites Hauptprodukt neben Patchbay**, sondern ein möglicher Vertikal-Case mit besonders hohem strategischem Fit.

---

## Strategische These

TwinCAT ist eine starke Vertikalisierung für Patchbay, weil hier drei Eigenschaften zusammenkommen:

- der Code ist textuell editierbar, aber semantisch stark projektgebunden
- Änderungen können lokal plausibel wirken und trotzdem systemisch riskant sein
- generische AI-Workflows sehen meist nur Dateien, nicht Engineering-Struktur

Genau dort spielt Patchbay seine Stärken aus:

- strukturierte Kontexte statt blinder Repo-Prompts
- kontrollierte Agent-Runs statt ungebremster Automation
- nachvollziehbare Approvals, Historie und Zuständigkeiten im Repo

Die TwinCAT-Richtung ist deshalb nicht interessant, obwohl sie speziell ist, sondern **weil sie die Kernthese von Patchbay besonders klar beweist**: Agenten werden wertvoll, wenn Domänenkontext, Edit-Grenzen und Review-Flows systematisch modelliert werden.

---

## Warum TwinCAT als Vertikal

TwinCAT ist kein Fall für eine generische „AI coding assistant“-Schicht.

Die eigentliche Schwierigkeit liegt nicht nur in Structured Text, sondern in der Kombination aus:

- TwinCAT-Projektstruktur
- PLC-Objekten und ihren Beziehungen
- Beckhoff-spezifischen Konventionen
- XML- und Metadatenartefakten rund um den eigentlichen Logikcode
- hohem Risiko bei scheinbar kleinen Strukturänderungen

Daraus ergibt sich ein klarer Produktansatz:

- Nicht nur ST lesbar machen
- Sondern TwinCAT-Projekte als **Engineering-System** modellieren
- Und diese Struktur dann in Patchbay-Runs, Review-Flows und Safe-Edit-Regeln einspeisen

Der strategische Wert liegt damit in zwei Richtungen:

- **Für Nutzer:** besseres Verständnis, gezieltere Änderungen, weniger Blindflug bei AI-Unterstützung
- **Für Patchbay:** ein überzeugender vertikaler Beweis, dass die Plattform in komplexen Domänen mehr sein kann als ein generischer Chat-Wrapper

---

## Beziehung zu Patchbay und Wintermute

Die Verantwortlichkeiten müssen klar getrennt bleiben.

### Patchbay bleibt plattformgenerisch

Patchbay verantwortet weiterhin die generischen Orchestrationsfunktionen:

- Tasks, Runs und Sessions
- Connector-Dispatch und Live-Agent-Interaktion
- Approvals, Decisions und Run-Historie
- Speicherung und Nachvollziehbarkeit in `.project-agents/`

Patchbay weiß dabei grundsätzlich nicht, was ein PLC-Objekt, ein DUT oder eine GVL fachlich bedeutet. Die Plattform orchestriert Arbeit, aber sie modelliert nicht die TwinCAT-Domäne im Kern.

### Wintermute bleibt Host und Integrationsschicht

Wintermute bleibt die IDE-native Laufzeit- und Host-Schicht:

- Einbettung des Dashboards
- Workspace-, Terminal- und Filesystem-Kontext
- Relay zwischen UI und Orchestrator
- ergänzende editornahe UX

Auch Wintermute wird dadurch nicht zu einer TwinCAT-spezifischen Engineering-Suite.

### TwinCAT ist die domänenspezifische Vertikalschicht

Die TwinCAT-Schicht liefert, was Patchbay selbst nicht generisch wissen kann:

- TwinCAT-Projekterkennung
- Objektmodell für PLC-Artefakte
- Symbol- und Abhängigkeitskontext
- Safe-Edit-Grenzen für TwinCAT-nahe Änderungen
- fokussierte Review- und Impact-Hinweise

Im Ergebnis gilt:

- **Patchbay orchestriert**
- **Wintermute hostet**
- **TwinCAT liefert Domänenverständnis**

Das ist die entscheidende Produkt-Hierarchie.

---

## Produktgrenzen

Die TwinCAT-Vertikalisierung ist bewusst **kein** Versuch, Beckhoff TwinCAT XAE vollständig zu ersetzen.

Sie ist im ersten Schritt auch **keine** allgemeine PLC-Komplettlösung und **kein** unkontrollierter Autopilot für Repo-weite Refactors.

Der sinnvolle Produktkern ist enger:

- TwinCAT-Projekte verständlich machen
- relevante PLC-Objekte strukturiert navigierbar machen
- ST-zentrierte Änderungen sicherer machen
- Agenten mit TwinCAT-spezifischem Kontext und klaren Grenzen versorgen
- Reviews stärker an Engineering-Risiken ausrichten

Nicht Teil des frühen Produktkerns sind:

- vollständige XAE-Parität
- allgemeine Projektdatei-Manipulation ohne Guardrails
- tiefe Runtime- oder Online-Steuerung
- ungeprüfte Multi-Datei-Autonomie
- erzwungene Abhängigkeit von Wintermute

Die Basis muss auch außerhalb von Wintermute nützlich sein. Wintermute und Patchbay verstärken den Workflow, sie begründen ihn nicht erst.

---

## MVP-Definition

Das MVP soll eine klare, enge Aussage erfüllen:

> TwinCAT-Projekte gut genug lesen und strukturieren, um intelligente Navigation, begrenzte ST-nahe Änderungen und kontextreiche Agent-Runs sicher zu ermöglichen.

### Was das MVP leisten soll

- TwinCAT-Workspace erkennen
- wichtige PLC-Artefakte parsen und als Objekte darstellen
- eine navigierbare Objektstruktur im Editor bereitstellen
- Methoden, Actions und Properties fokussiert sichtbar machen
- einfache Symbol- und Abhängigkeitsbezüge aufzeigen
- methodennahe Änderungen als vergleichsweise sichere Bearbeitungszone behandeln
- Agenten einen strukturierten TwinCAT-Kontext statt bloßer Dateiauszüge geben
- einfache Impact- und Review-Hinweise erzeugen

### Was ausdrücklich nicht zum MVP gehört

- vollständige TwinCAT-/XAE-Kompatibilität
- Build-, Compile- oder Deploy-Automation als Kernfeature
- tiefe Windows-/XAE-Integration
- freie XML-Umbauten ohne explizite Schutzmechanismen
- autonome großflächige Refactors über viele Projektbereiche

---

## Spätere Ausbauphasen

Nach dem MVP gibt es zwei sinnvolle Ausbaurichtungen.

### Phase 2: stärkeres Engineering-Verständnis

Hier geht es um mehr Präzision innerhalb der Dateiwelt:

- bessere Referenz- und Rename-Logik
- reichere TwinCAT-Semantik
- Vererbungs-, Interface- und DUT-Zusammenhänge
- stärkere Impact-Analysen
- vorsichtig erweiterte Multi-Datei-Operationen mit klaren Guardrails

### Phase 3: tiefere Beckhoff-Integration

Erst danach sollte tiefere Tooling-Integration betrachtet werden:

- Windows-Companion oder Bridge-Komponenten
- Build- und Validierungs-Hooks
- XAE-nahe Prüfungen
- Synchronisation mit weiterem Projekt-Metadatakontext

Diese Phase ist wertvoll, aber nicht notwendig, um den eigentlichen Patchbay-Fit des TwinCAT-Vertikals zu beweisen.

---

## Entscheidungssätze

- TwinCAT ist für Patchbay **eine Vertikalisierung, kein Parallelprodukt**.
- Der Kernwert liegt **nicht** in allgemeiner ST-Unterstützung, sondern in **TwinCAT-aware Kontextmodellierung**.
- Patchbay bleibt der generische Orchestrator; TwinCAT liefert die Domänenlogik.
- Wintermute bleibt Host und Verstärker, nicht Voraussetzung für den Basisnutzen.
- Das MVP fokussiert auf **Verstehen, Navigieren, begrenztes sicheres Editieren und kontextreiche Agent-Runs**.

---

## Ein-Satz-Version

> **TwinCAT für Patchbay/Wintermute ist ein domänenspezifischer Vertikal-Case: eine TwinCAT-aware Arbeits- und Review-Schicht, die strukturierte Engineering-Kontexte und Safe-Edit-Grenzen in die bestehende Agent-Orchestrationsplattform einspeist.**
