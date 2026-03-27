# Vision

## Working Title

**TwinCAT Workspace for VS Code**

with **Wintermute / Patchbay Mode** as an extension, not a requirement.

The goal is not to build a niche plugin only for a single agentic IDE. The goal is to create the **best open environment to understand, edit, review, and agentically evolve Beckhoff TwinCAT 3 PLC projects**, with a strong focus on **Structured Text (ST)**.

VS Code is the broad, practical base platform. Wintermute becomes the high-end mode where Patchbay can unlock deeper agent workflows, context orchestration, approvals, and project-native run tracking.

---

## Vision Statement

Build an open, TwinCAT-aware engineering workspace that bridges the gap between:

- classic Beckhoff / TwinCAT project structures
- modern code editor workflows
- safe, context-aware agentic development

This workspace should make TwinCAT projects feel less like scattered XML and file fragments, and more like a structured, navigable software system that both humans and agents can work with safely.

---

## What This Product Is

This product is:

- a **TwinCAT-aware VS Code extension**
- a **structured project model** for TwinCAT PLC code
- a **safe editing and review layer** for ST-centric workflows
- a **context compiler for agents**
- optionally, a **Wintermute / Patchbay enhanced experience**

This product is **not**:

- a full replacement for TwinCAT XAE
- a complete clone of Beckhoff engineering tools
- just another generic Structured Text syntax extension

---

## Core Problem

TwinCAT projects are hard to use in modern agentic development workflows.

Typical issues:

- project structure is spread across many files
- ST logic is visible, but project semantics are only partially obvious
- file-based editing alone is risky for refactors
- generic LLM workflows lack TwinCAT-specific understanding
- current AI coding tools often see text, not engineering structure

As a result, agents can produce plausible-looking code changes without understanding the actual PLC project context.

---

## Core Goal

Make TwinCAT projects **readable, navigable, and safely editable** in a modern editor.

The extension should help both humans and agents answer questions like:

- What PLC objects exist in this project?
- Which GVLs, DUTs, methods, and interfaces are related?
- What files are actually relevant for this change?
- What is safe to modify automatically?
- What requires review or approval?
- What might break if this symbol changes?

---

## Product Principles

### 1. TwinCAT-aware, not just ST-aware
Structured Text support alone is not enough. The real value comes from understanding:

- TwinCAT project layout
- PLC object relationships
- Beckhoff-specific structure and conventions
- project-level risk and change impact

### 2. Safe agentic coding over blind automation
Agents should not operate with unrestricted repo-wide freedom.

The system should provide:

- scoped context
- explicit edit boundaries
- risk classification
- approval hooks for dangerous changes

### 3. Editor-first, not XAE-replacement-first
The extension should complement existing TwinCAT workflows, not try to replace Beckhoff engineering from day one.

### 4. Useful without Wintermute
The base VS Code experience must already be valuable on its own.

Wintermute / Patchbay should amplify the experience, not be required for basic usefulness.

### 5. Modular architecture
The product should be designed so that:

- the TwinCAT core model is reusable
- the VS Code UI is a delivery layer
- Wintermute / Patchbay integration is an optional power layer
- future Windows bridge components can be added cleanly

---

## Product Vision

### Base Layer: VS Code TwinCAT Workspace
The extension turns VS Code into a practical workspace for TwinCAT PLC projects.

It should provide:

- TwinCAT workspace detection
- structured project tree for PLC objects
- ST-oriented navigation and outline
- symbol lookup and dependency exploration
- safer editing workflows
- engineering-aware review support

### Power Layer: Wintermute / Patchbay Mode
Inside Wintermute, the same workspace becomes an agentic control surface.

Additional capabilities may include:

- structured context feeds for agents
- agent runs tied to specific PLC objects or tasks
- approval-based edit execution
- run history, decisions, and context traceability in repo state
- multi-agent task separation (analysis, refactor, review, validation)

This turns the extension from a code tool into a controlled engineering orchestration layer.

---

## Target Users

### Primary Users
- Beckhoff TwinCAT developers
- PLC / ST engineers working in Git-based repos
- engineers who want modern editor workflows around TwinCAT code
- developers experimenting with AI-assisted or agentic PLC development

### Secondary Users
- reviewers who need better insight into TwinCAT code changes
- automation teams standardizing code review and refactor workflows
- developers who do not always want to open full XAE just to inspect logic

---

## Key Product Capabilities

### 1. TwinCAT Project Model
The system should parse and model relevant TwinCAT project files and expose them as engineering objects rather than raw files.

Examples:

- PLC projects
- POUs
- methods
- actions
- properties
- DUTs
- GVLs
- interfaces
- inheritance / implementation relationships
- library references

### 2. ST Intelligence Layer
The workspace should provide meaningful language intelligence for ST-heavy development.

Examples:

- object outline
- symbol navigation
- references
- rename support
- basic diagnostics
- cross-file context
- semantic highlighting

### 3. Safe Edit Engine
The system must distinguish between:

**safe**
- method body edits
- comments
- local logic changes

**caution**
- signature changes
- DUT edits
- interface contract changes

**approval required or blocked**
- structural project manipulation
- uncontrolled XML/project file rewrites
- high-risk rename / delete operations
- library or dependency changes

### 4. Context Compiler for Agents
The agent should receive a structured engineering context instead of raw file dumps.

Example context package:

- target PLC object
- surrounding methods / symbols
- referenced GVLs and DUTs
- related interfaces
- dependency hints
- edit policy
- risk notes
- expected output constraints

### 5. Impact and Review Assistance
Before or after a change, the system should help assess impact.

Examples:

- affected symbols
- potentially related files
- interface or DUT ripple effects
- review hotspots
- suggested validation focus

---

## Suggested Architecture

### A. Core Engine
Editor-independent logic.

Responsibilities:

- TwinCAT project scanning
- object graph construction
- symbol indexing
- dependency mapping
- risk classification
- context packaging for agent workflows

### B. VS Code Extension Layer
User-facing integration for the broad platform.

Responsibilities:

- Explorer views
- commands
- tree views
- hover / navigation integration
- side panels
- code actions
- review and analysis UI

### C. Wintermute / Patchbay Integration Layer
Optional advanced orchestration layer.

Responsibilities:

- push structured project context into agent runs
- connect tasks to PLC objects
- approval workflow integration
- run / decision / history synchronization
- multi-agent collaboration hooks

### D. Future Windows Companion / TwinCAT Bridge
Optional later-stage integration for real TwinCAT/XAE operations.

Responsibilities may include:

- build or validation triggers
- interaction with installed TwinCAT / XAE tooling
- engineering checks beyond pure file editing

This is explicitly **not required for MVP**.

---

## Strategic Role of truST / trust-platform

`trust-platform` is valuable as a **springboard**, not necessarily as a hard dependency.

Possible roles:

- reference implementation for ST tooling behavior
- benchmark for LSP features and UX
- inspiration for runtime / debug architecture
- interoperability candidate later on
- testbed for evaluating structured ST workflows

But the actual differentiation of this product should remain:

- TwinCAT project understanding
- Beckhoff-aware context modeling
- safe agentic workflow design
- Patchbay integration for controlled engineering operations

In short:

- **truST can help with the language layer**
- **this product must own the TwinCAT layer**

---

## User Experience Vision

### Flow 1: Understand a Project
A user opens a TwinCAT repository.

The extension detects project structures and presents PLC objects as a navigable engineering tree.

The user can inspect:

- FBs and methods
- GVL usage
- DUT definitions
- interface implementations
- symbol relationships
- likely impact zones

### Flow 2: Safe Agent-Assisted Edit
A user selects a method or PLC object and requests a change.

The system provides a constrained context package to the agent:

- what the target is
- what related context matters
- what files are in scope
- what is not allowed to change

The result is more controlled than a generic “edit the repo” AI prompt.

### Flow 3: Review and Impact Check
Before accepting a change, the user sees a focused impact view:

- what changed
- what might be affected
- what should be reviewed carefully
- whether the change crossed a safe boundary

### Flow 4: Wintermute Power Workflow
In Wintermute, the same action becomes a first-class Patchbay run with:

- explicit run scope
- task binding
- approval checkpoints
- run history
- possible multi-agent execution

---

## MVP Definition

The MVP should aim for one thing only:

**Read TwinCAT projects well enough to navigate them intelligently and perform constrained ST-level agentic edits safely.**

### MVP Feature Set

- TwinCAT workspace detection
- basic parsing of important TwinCAT PLC files
- PLC object tree view
- method / action / property outline
- simple symbol index
- basic dependency exploration
- method-level safe edit actions
- lightweight impact summary
- optional agent context export / integration hooks

### MVP Non-Goals

- full TwinCAT XAE replacement
- complete engineering configuration editing
- full build / compile integration
- online / runtime TwinCAT control
- unrestricted autonomous multi-file refactors

---

## Phase 2 Vision

After MVP, the next level should focus on stronger engineering understanding.

Examples:

- better cross-file symbol intelligence
- richer rename / reference handling
- stronger TwinCAT-specific semantics
- attribute / pragma awareness
- inheritance and interface visualizations
- GVL / DUT impact propagation
- guarded multi-file refactor support

---

## Phase 3 Vision

Only later should the project explore deeper Beckhoff-specific integration.

Possible areas:

- Windows companion service
- build / validation hooks
- XAE-aware workflows
- external engineering checks
- stronger synchronization with project metadata

---

## Positioning

This product should be positioned as:

**an open, TwinCAT-aware engineering workspace for modern code and agent workflows**

not as:

- a generic ST plugin
- a Beckhoff replacement suite
- an AI toy for PLC code generation

The strongest differentiation is the combination of:

- TwinCAT project understanding
- structured engineering context
- safe edit boundaries
- modern editor UX
- optional Patchbay-powered agent orchestration

---

## Long-Term Outcome

If successful, the extension becomes:

- the best open way to inspect and reason about TwinCAT code outside XAE
- a safer foundation for AI-assisted PLC development
- a reusable platform layer for TwinCAT-aware automation tooling
- a natural bridge between classic industrial engineering and modern agentic development environments

The real ambition is not to rebuild TwinCAT.

The real ambition is to make TwinCAT projects **intelligible, navigable, and controllable** in modern development workflows.

That is the actual product vision.

