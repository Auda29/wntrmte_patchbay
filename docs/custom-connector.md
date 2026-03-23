# How to Build a Custom Connector

This guide explains how to implement a custom `AgentConnector` for Patchbay — the interface that connects the orchestrator to any AI coding agent or API.

## Architecture Overview

```
┌─────────────┐      AgentEvent stream       ┌─────────────────┐
│  Dashboard   │ ◄──────────────────────────── │  AgentConnector  │
│  / Server    │ ──── sendInput / approve ───► │  (your code)     │
└─────────────┘                               └────────┬────────┘
                                                       │
                                              CLI / API / stdio
                                                       │
                                              ┌────────▼────────┐
                                              │   AI Provider    │
                                              └─────────────────┘
```

A Connector translates between a specific provider's protocol and Patchbay's provider-agnostic `AgentEvent` stream.

## The Interface Contract

### `AgentConnector`

```typescript
interface AgentConnector {
    readonly id: string;          // unique identifier, e.g. "my-provider"
    readonly name: string;        // display name, e.g. "My Provider"
    readonly capabilities: ConnectorCapabilities;

    connect(input: RunnerInput): Promise<AgentSession>;
    isAvailable(): Promise<boolean>;
}

interface ConnectorCapabilities {
    streaming: boolean;       // emits partial messages
    permissions: boolean;     // supports approve/deny flows
    multiTurn: boolean;       // supports sendInput() follow-ups
    toolUseReporting: boolean; // emits agent:tool_use events
}
```

### `AgentSession`

```typescript
interface AgentSession {
    readonly sessionId: string;
    readonly connectorId: string;
    readonly taskId: string;
    readonly status: SessionStatus;

    sendInput(text: string): Promise<void>;
    approve(permissionId: string): Promise<void>;
    deny(permissionId: string): Promise<void>;
    cancel(): Promise<void>;

    on(event: 'event', listener: (e: AgentEvent) => void): void;
    on(event: 'close', listener: () => void): void;
    off(event: 'event', listener: (e: AgentEvent) => void): void;
    off(event: 'close', listener: () => void): void;
}
```

### `AgentEvent` Types

| Event Type           | When to Emit                                    |
|----------------------|-------------------------------------------------|
| `session:started`    | Connection established, agent ready              |
| `agent:message`      | Agent produces text (set `partial: true` while streaming) |
| `agent:tool_use`     | Agent calls a tool (`status: started/completed/failed`)   |
| `agent:permission`   | Agent requests approval for an action            |
| `agent:question`     | Agent asks a clarifying question                 |
| `session:completed`  | Agent finished successfully                      |
| `session:failed`     | Agent errored out                                |

## Step-by-Step Implementation

### 1. Extend `BaseConnector` and `BaseSession`

The base classes handle event emitter boilerplate and status tracking.

```typescript
import {
    BaseConnector,
    BaseSession,
    RunnerInput,
    AgentSession,
    ConnectorCapabilities,
} from '@patchbay/core';

class MySession extends BaseSession {
    readonly sessionId: string;
    readonly connectorId: string;
    readonly taskId: string;

    constructor(sessionId: string, connectorId: string, taskId: string) {
        super();
        this.sessionId = sessionId;
        this.connectorId = connectorId;
        this.taskId = taskId;
    }

    async sendInput(text: string): Promise<void> {
        // Send text to your provider
    }

    async approve(permissionId: string): Promise<void> {
        // Approve a pending permission request
    }

    async deny(permissionId: string): Promise<void> {
        // Deny a pending permission request
    }

    async cancel(): Promise<void> {
        this.setStatus('cancelled');
        // Clean up resources
        this.emitClose();
    }
}
```

### 2. Emit Events from Your Provider's Output

Map your provider's native events to `AgentEvent` objects:

```typescript
// Inside your session, when you receive provider output:

// Text streaming
this.emit({
    type: 'agent:message',
    sessionId: this.sessionId,
    content: chunk,
    partial: true,
    timestamp: new Date().toISOString(),
});

// Tool use
this.emit({
    type: 'agent:tool_use',
    sessionId: this.sessionId,
    toolName: 'file_edit',
    toolInput: { path: 'src/foo.ts' },
    status: 'started',
    timestamp: new Date().toISOString(),
});

// Session complete
this.setStatus('completed');
this.emit({
    type: 'session:completed',
    sessionId: this.sessionId,
    summary: 'Task done.',
    timestamp: new Date().toISOString(),
});
this.emitClose();
```

### 3. Implement the Connector

```typescript
export class MyConnector extends BaseConnector {
    readonly id = 'my-provider';
    readonly name = 'My Provider';
    readonly capabilities: ConnectorCapabilities = {
        streaming: true,
        permissions: false,
        multiTurn: true,
        toolUseReporting: false,
    };

    async isAvailable(): Promise<boolean> {
        // Check if the provider CLI/API is reachable
        return true;
    }

    async connect(input: RunnerInput): Promise<AgentSession> {
        const sessionId = randomUUID();
        const session = new MySession(sessionId, this.id, input.taskId);

        // Start your provider process / API call
        // Wire provider output → session.emit()

        return session;
    }
}
```

### 4. Register the Connector

```typescript
import { ConnectorRegistry } from '@patchbay/core';
import { MyConnector } from './my-connector';

const registry = new ConnectorRegistry();
registry.register(new MyConnector());
```

## Built-in Connectors

| Connector          | Provider          | Protocol                          |
|--------------------|-------------------|-----------------------------------|
| `ClaudeCodeConnector` | Claude Code CLI | `--input/output-format stream-json` (NDJSON) |
| `CodexConnector`      | OpenAI Codex    | `codex app-server` (JSON-RPC/stdio)          |
| `GeminiConnector`     | Google Gemini   | Headless mode (`--json`, stdin)               |
| `HttpConnector`       | Any OpenAI-compatible API | `POST /chat/completions` (SSE)   |

## Tips

- **Set `capabilities` honestly** — the Dashboard uses these to show/hide UI elements (e.g. no approval button if `permissions: false`).
- **Always emit `session:completed` or `session:failed`** — the orchestrator relies on these to finalize runs.
- **Call `emitClose()`** after the terminal event so listeners can clean up.
- **Use `setStatus()`** to keep session status in sync — the orchestrator reads this.
- **Permissions**: If your provider doesn't support granular permissions, implement `approve()`/`deny()` as no-ops or plain text stdin fallbacks.

## Future: Cursor ACP

Cursor is developing **ACP** (Agent Communication Protocol) — a stdio-based JSON-RPC interface (`cursor agent acp`). Once stable, a `CursorAcpConnector` will follow the same pattern: spawn the process, parse JSON-RPC notifications into `AgentEvent`s, send responses via stdin. The interface contract is identical.
