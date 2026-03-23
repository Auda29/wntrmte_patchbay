import type { RunnerInput } from './runner';

// ---------------------------------------------------------------------------
// Agent Events — provider-agnostic event types emitted during a live session
// ---------------------------------------------------------------------------

export interface SessionStartedEvent {
    type: 'session:started';
    sessionId: string;
    connectorId: string;
    timestamp: string;
}

export interface AgentMessageEvent {
    type: 'agent:message';
    sessionId: string;
    content: string;
    /** true while the agent is still streaming this message */
    partial?: boolean;
    timestamp: string;
}

export interface AgentToolUseEvent {
    type: 'agent:tool_use';
    sessionId: string;
    toolName: string;
    toolInput?: Record<string, unknown>;
    /** Tool output once execution completes */
    toolOutput?: string;
    status: 'started' | 'completed' | 'failed';
    timestamp: string;
}

export interface AgentPermissionEvent {
    type: 'agent:permission';
    sessionId: string;
    /** Human-readable description of what is being requested */
    description: string;
    /** Provider-specific permission payload for approve/deny */
    permissionId: string;
    toolName?: string;
    timestamp: string;
}

export interface AgentQuestionEvent {
    type: 'agent:question';
    sessionId: string;
    question: string;
    timestamp: string;
}

export interface SessionCompletedEvent {
    type: 'session:completed';
    sessionId: string;
    summary?: string;
    changedFiles?: string[];
    timestamp: string;
}

export interface SessionFailedEvent {
    type: 'session:failed';
    sessionId: string;
    error: string;
    timestamp: string;
}

export type AgentEvent =
    | SessionStartedEvent
    | AgentMessageEvent
    | AgentToolUseEvent
    | AgentPermissionEvent
    | AgentQuestionEvent
    | SessionCompletedEvent
    | SessionFailedEvent;

// ---------------------------------------------------------------------------
// Agent Session — a live, interactive session with a provider agent
// ---------------------------------------------------------------------------

export type SessionStatus = 'connecting' | 'active' | 'awaiting_input' | 'awaiting_permission' | 'completed' | 'failed' | 'cancelled';

export interface AgentSession {
    readonly sessionId: string;
    readonly connectorId: string;
    readonly taskId: string;
    readonly status: SessionStatus;

    /** Send a text message / reply to the agent */
    sendInput(text: string): Promise<void>;

    /** Approve a pending permission request */
    approve(permissionId: string): Promise<void>;

    /** Deny a pending permission request */
    deny(permissionId: string): Promise<void>;

    /** Cancel / abort the session */
    cancel(): Promise<void>;

    /** Subscribe to session events */
    on(event: 'event', listener: (e: AgentEvent) => void): void;
    on(event: 'close', listener: () => void): void;

    /** Unsubscribe */
    off(event: 'event', listener: (e: AgentEvent) => void): void;
    off(event: 'close', listener: () => void): void;
}

// ---------------------------------------------------------------------------
// Connector Capabilities — declares what a connector supports
// ---------------------------------------------------------------------------

export interface ConnectorCapabilities {
    streaming: boolean;
    permissions: boolean;
    multiTurn: boolean;
    toolUseReporting: boolean;
}

// ---------------------------------------------------------------------------
// Agent Connector — interface each provider implements
// ---------------------------------------------------------------------------

export interface AgentConnector {
    readonly id: string;
    readonly name: string;
    readonly capabilities: ConnectorCapabilities;

    /** Start a new interactive session for the given input */
    connect(input: RunnerInput): Promise<AgentSession>;

    /** Check if the connector's backing tool/binary is available */
    isAvailable(): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Connector Registry — dynamic registration & lookup
// ---------------------------------------------------------------------------

export class ConnectorRegistry {
    private connectors = new Map<string, AgentConnector>();

    register(connector: AgentConnector): void {
        this.connectors.set(connector.id, connector);
    }

    unregister(id: string): void {
        this.connectors.delete(id);
    }

    get(id: string): AgentConnector | undefined {
        return this.connectors.get(id);
    }

    list(): AgentConnector[] {
        return Array.from(this.connectors.values());
    }

    has(id: string): boolean {
        return this.connectors.has(id);
    }
}

// ---------------------------------------------------------------------------
// BaseConnector — shared session lifecycle logic for implementors
// ---------------------------------------------------------------------------

type EventListeners = {
    event: Set<(e: AgentEvent) => void>;
    close: Set<() => void>;
};

export abstract class BaseSession implements AgentSession {
    abstract readonly sessionId: string;
    abstract readonly connectorId: string;
    abstract readonly taskId: string;

    private _status: SessionStatus = 'connecting';
    private listeners: EventListeners = { event: new Set(), close: new Set() };

    get status(): SessionStatus {
        return this._status;
    }

    protected setStatus(status: SessionStatus): void {
        this._status = status;
    }

    protected emit(event: AgentEvent): void {
        for (const listener of this.listeners.event) {
            listener(event);
        }
    }

    protected emitClose(): void {
        for (const listener of this.listeners.close) {
            listener();
        }
    }

    on(event: 'event', listener: (e: AgentEvent) => void): void;
    on(event: 'close', listener: () => void): void;
    on(event: string, listener: Function): void {
        (this.listeners[event as keyof EventListeners] as Set<Function>).add(listener);
    }

    off(event: 'event', listener: (e: AgentEvent) => void): void;
    off(event: 'close', listener: () => void): void;
    off(event: string, listener: Function): void {
        (this.listeners[event as keyof EventListeners] as Set<Function>).delete(listener);
    }

    abstract sendInput(text: string): Promise<void>;
    abstract approve(permissionId: string): Promise<void>;
    abstract deny(permissionId: string): Promise<void>;
    abstract cancel(): Promise<void>;
}

export abstract class BaseConnector implements AgentConnector {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly capabilities: ConnectorCapabilities;
    abstract connect(input: RunnerInput): Promise<AgentSession>;
    abstract isAvailable(): Promise<boolean>;
}
