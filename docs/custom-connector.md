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
| `CodexConnector`      | OpenAI Codex    | `codex app-server` (JSON-RPC/stdio, `initialize` handshake, `thread/*`, `turn/*`, server-request approvals) |
| `GeminiConnector`     | Google Gemini   | Headless mode (`--json`, stdin)               |
| `HttpConnector`       | Any OpenAI-compatible API | `POST /chat/completions` (SSE)   |
| `AcpConnector`        | Any ACP-compliant agent | [Agent Client Protocol](https://agentclientprotocol.com) (JSON-RPC/stdio) |

## Tips

- **Set `capabilities` honestly** — the Dashboard uses these to show/hide UI elements (e.g. no approval button if `permissions: false`).
- **Always emit `session:completed` or `session:failed`** — the orchestrator relies on these to finalize runs.
- **Call `emitClose()`** after the terminal event so listeners can clean up.
- **Use `setStatus()`** to keep session status in sync — the orchestrator reads this.
- **Permissions**: If your provider doesn't support granular permissions, implement `approve()`/`deny()` as no-ops or plain text stdin fallbacks.

## JSON-RPC Connector Notes

For JSON-RPC based providers, don't assume "one request starts the whole session". Codex is the reference example here:

- Send the transport handshake first if the provider requires it. For Codex App Server this means `initialize`, then `initialized`.
- Separate "conversation identity" from "user input". With Codex, `thread/start`, `thread/resume`, or `thread/fork` establishes the thread, while `turn/start` or `turn/steer` sends the actual user message.
- Distinguish server notifications from server-initiated requests. Codex approvals arrive as JSON-RPC requests that the client must answer with a JSON-RPC response payload, not as fire-and-forget notifications.
- Treat item lifecycle events as the source of truth for streaming state. Codex emits `item/started`, `item/agentMessage/delta`, `item/completed`, and `turn/completed`; map those into `agent:message`, `agent:tool_use`, `agent:permission`, `session:completed`, and `session:failed`.

## ACP (Agent Client Protocol)

The `AcpConnector` implements the [Agent Client Protocol](https://agentclientprotocol.com) — an open standard for IDE-to-agent communication. ACP uses **JSON-RPC 2.0 over stdio** and defines a structured session lifecycle with built-in permission flows.

Any ACP-compliant agent works with a single configuration:

```typescript
import { AcpConnector } from '@patchbay/runner-cursor-cli';

// Cursor (pre-configured as CursorAcpConnector)
new AcpConnector({
    id: 'cursor-acp',
    name: 'Cursor (ACP)',
    command: 'cursor',
    args: ['agent', 'acp'],
    versionCommand: 'cursor --version',
});

// Any other ACP-compliant agent
new AcpConnector({
    id: 'my-agent',
    name: 'My ACP Agent',
    command: 'my-agent',
    args: ['--acp'],
    versionCommand: 'my-agent --version',
    env: { MY_API_KEY: '...' },
});
```

### ACP → AgentEvent Mapping

| ACP Method/Notification | Direction | Patchbay AgentEvent |
|-------------------------|-----------|---------------------|
| `initialize` (response) | Agent → Client | `session:started` |
| `session/update` (content) | Agent → Client | `agent:message` |
| `session/update` (tool_call, status: pending/in_progress) | Agent → Client | `agent:tool_use` (started) |
| `session/update` (tool_call, status: completed) | Agent → Client | `agent:tool_use` (completed) |
| `session/request_permission` | Agent → Client | `agent:permission` |
| `session/update` (stop_reason: end_turn) | Agent → Client | `session:completed` |
| `session/update` (stop_reason: refusal/error) | Agent → Client | `session:failed` |
| `session/prompt` | Client → Agent | `sendInput()` |
| Permission grant/deny (response) | Client → Agent | `approve()` / `deny()` |
| `session/cancel` | Client → Agent | `cancel()` |

### ACP Session Lifecycle

```
Client                          Agent
  │                               │
  │──── initialize ──────────────►│
  │◄─── initialize (response) ───│  → session:started
  │                               │
  │──── session/new ─────────────►│
  │◄─── session/new (response) ──│
  │                               │
  │──── session/prompt ──────────►│  (user message)
  │◄─── session/update ──────────│  → agent:message (streaming)
  │◄─── session/update (tool) ───│  → agent:tool_use
  │◄─── session/request_permission│  → agent:permission
  │──── permission response ─────►│  (approve/deny)
  │◄─── session/update (done) ───│  → session:completed
  │                               │
  │──── session/cancel ──────────►│  (notification, no response)
```

### Key Differences from Other Connectors

- **Capability negotiation**: ACP starts with an `initialize` handshake where client and agent declare supported features (file system, terminal, image/audio content).
- **Structured permissions**: Permission requests use `session/request_permission` as a proper JSON-RPC method (request/response), not a notification — the agent blocks until the client responds.
- **Content blocks**: Messages use typed content blocks (text, resource, image) rather than plain strings.
- **Stop reasons**: Sessions end with explicit reasons (`end_turn`, `max_tokens`, `cancelled`, `refusal`) mapped to `session:completed` or `session:failed`.
- **Session persistence**: ACP supports `session/load` for resuming previous sessions (if the agent advertises `loadSession` capability).
