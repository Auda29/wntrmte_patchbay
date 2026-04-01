'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Bot, Check, Send, Square, User, X } from 'lucide-react';
import type { SessionEventRecord, SessionRecord } from '@patchbay/core';
import { Markdown } from '@/components/Markdown';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ChatEvent =
  | (SessionEventRecord & { type: 'session:started'; connectorId: string })
  | (SessionEventRecord & { type: 'agent:message'; content: string; partial?: boolean })
  | (SessionEventRecord & { type: 'agent:tool_use'; toolName: string; status: 'started' | 'completed' | 'failed'; toolOutput?: string })
  | (SessionEventRecord & { type: 'agent:permission'; description: string; permissionId: string })
  | (SessionEventRecord & { type: 'agent:question'; question: string })
  | (SessionEventRecord & { type: 'session:completed'; summary?: string })
  | (SessionEventRecord & { type: 'session:failed'; error: string })
  | { id: string; type: 'stream:end'; sessionId: string; timestamp: string };

interface AgentChatProps {
  sessionId?: string | null;
  onClose?: () => void;
}

export function AgentChat({ sessionId, onClose }: AgentChatProps) {
  const [events, setEvents] = useState<ChatEvent[]>([]);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const isVsCodeWebview = typeof window !== 'undefined' && window.parent !== window;

  const { data: session, mutate: mutateSession } = useSWR<SessionRecord>(
    sessionId ? `/api/sessions/${encodeURIComponent(sessionId)}` : null,
    fetcher,
    { refreshInterval: sessionId ? 2000 : 0 },
  );
  const { data: storedEvents, mutate: mutateEvents } = useSWR<ChatEvent[]>(
    sessionId ? `/api/sessions/${encodeURIComponent(sessionId)}/events` : null,
    fetcher,
    { refreshInterval: session?.status === 'running' || session?.status === 'awaiting_input' ? 5000 : 0 },
  );

  useEffect(() => {
    setEvents(storedEvents ?? []);
  }, [storedEvents, sessionId]);

  const isSessionActive = session?.status === 'running' || session?.status === 'awaiting_input';
  const mutateSessionRef = useRef(mutateSession);
  const mutateEventsRef = useRef(mutateEvents);
  mutateSessionRef.current = mutateSession;
  mutateEventsRef.current = mutateEvents;

  const handleSseMessage = useCallback((message: MessageEvent, sid: string) => {
    try {
      const parsed = JSON.parse(message.data) as Record<string, unknown>;
      const parsedWithoutId = { ...parsed };
      delete parsedWithoutId.id;
      const eventPayload = parsedWithoutId as Omit<SessionEventRecord, 'id'>;
      const event: ChatEvent = parsed.type === 'stream:end'
        ? { id: `stream-end-${Date.now()}`, type: 'stream:end' as const, sessionId: sid, timestamp: new Date().toISOString() }
        : { id: `live-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, ...eventPayload } as ChatEvent;

      setEvents((current) => {
        if (event.type === 'agent:message' && event.partial && current.at(-1)?.type === 'agent:message') {
          const previous = current.at(-1);
          if (previous?.type === 'agent:message') {
            return [
              ...current.slice(0, -1),
              {
                ...previous,
                content: event.content,
                partial: true,
                timestamp: event.timestamp,
              },
            ];
          }
        }
        return [...current, event as ChatEvent];
      });

      if (event.type === 'session:completed' || event.type === 'session:failed' || event.type === 'stream:end') {
        void mutateSessionRef.current();
        void mutateEventsRef.current();
      }
    } catch {
      // Ignore malformed SSE payloads.
    }
  }, []);

  useEffect(() => {
    if (!sessionId || !isSessionActive) {
      return;
    }

    let disposed = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) {
        return;
      }

      source = new EventSource(`/api/agent-events/${encodeURIComponent(sessionId)}`);
      source.onmessage = (msg) => handleSseMessage(msg, sessionId);
      source.onerror = () => {
        source?.close();
        source = null;
        if (!disposed) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      source?.close();
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [handleSseMessage, isSessionActive, sessionId]);

  useEffect(() => {
    if (!scrollerRef.current) {
      return;
    }

    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [events]);

  const hasLiveSession = isSessionActive;

  const statusCopy = useMemo(() => {
    switch (session?.status) {
      case 'running':
        return 'Live session';
      case 'awaiting_input':
        return 'Awaiting reply';
      case 'completed':
        return 'Completed session';
      case 'failed':
        return 'Failed session';
      case 'cancelled':
        return 'Cancelled session';
      default:
        return 'Session';
    }
  }, [session?.status]);

  const sendAction = async (payload: { action: 'input' | 'approve' | 'deny' | 'cancel'; text?: string; permissionId?: string }) => {
    if (!sessionId) {
      return;
    }

    setSubmitting(true);
    try {
      if (isVsCodeWebview) {
        const command = payload.action === 'input'
          ? 'wntrmte.sendAgentInput'
          : payload.action === 'approve'
            ? 'wntrmte.approveAgent'
            : payload.action === 'deny'
              ? 'wntrmte.denyAgent'
              : 'wntrmte.cancelAgent';
        window.parent.postMessage({
          command,
          args: [{ sessionId, text: payload.text, permissionId: payload.permissionId }],
        }, '*');
      } else {
        const response = await fetch('/api/agent-input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            action: payload.action,
            text: payload.text,
            permissionId: payload.permissionId,
          }),
        });
        if (!response.ok) {
          throw new Error('Agent action failed');
        }
      }

      setInput('');
      await mutateSession();
      await mutateEvents();
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionId || !session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-surface-400">
        Select a session to inspect its full chat history.
      </div>
    );
  }

  return (
    <section className="flex h-full flex-col">
      <div ref={scrollerRef} className="flex-1 space-y-4 overflow-y-auto p-6">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-surface-500">
            Waiting for session events...
          </div>
        ) : (
          events.map((event) => {
            if (event.type === 'session:started') {
              return (
                <div key={event.id} className="text-center text-xs text-surface-500">
                  Session started via <span className="font-medium text-surface-400">{event.connectorId}</span>
                </div>
              );
            }

            if (event.type === 'agent:message') {
              return (
                <div key={event.id} className="flex gap-3">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-950/60 text-brand-400 ring-1 ring-brand-900/50">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 rounded-2xl rounded-tl-sm bg-surface-900/40 px-4 py-3 text-sm text-surface-100">
                    <Markdown>{event.content}</Markdown>
                  </div>
                </div>
              );
            }

            if (event.type === 'agent:tool_use') {
              return (
                <div key={event.id} className="ml-9 rounded-xl border border-surface-800/50 bg-surface-950/30 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-surface-300">{event.toolName}</span>
                    </div>
                    <span className={`flex items-center gap-1 text-xs ${
                      event.status === 'completed'
                        ? 'text-green-400'
                        : event.status === 'failed'
                          ? 'text-red-400'
                          : 'text-blue-400 animate-pulse'
                    }`}>
                      {event.status === 'completed' ? <Check className="h-3 w-3" /> : null}
                      {event.status === 'failed' ? <X className="h-3 w-3" /> : null}
                      {event.status}
                    </span>
                  </div>
                  {event.toolOutput ? (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[10px] text-surface-500">
                      {event.toolOutput}
                    </div>
                  ) : null}
                </div>
              );
            }

            if (event.type === 'agent:permission') {
              return (
                <div key={event.id} className="ml-9 rounded-xl border border-yellow-900/30 bg-yellow-950/10 p-4">
                  <p className="text-sm text-yellow-200/80">{event.description}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void sendAction({ action: 'approve', permissionId: event.permissionId })}
                      disabled={submitting || !hasLiveSession}
                      className="inline-flex items-center gap-1.5 rounded bg-brand-500/20 px-3 py-1.5 text-xs font-medium text-brand-300 transition-colors hover:bg-brand-500/30 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendAction({ action: 'deny', permissionId: event.permissionId })}
                      disabled={submitting || !hasLiveSession}
                      className="inline-flex items-center gap-1.5 rounded bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/40 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Deny
                    </button>
                  </div>
                </div>
              );
            }

            if (event.type === 'agent:question') {
              return (
                <div key={event.id} className="ml-9 rounded-xl border border-brand-900/30 bg-brand-950/10 p-4 text-sm text-brand-200/80">
                  {event.question}
                </div>
              );
            }

            if (event.type === 'session:completed') {
              return (
                <div key={event.id} className="text-center text-xs text-green-400/80">
                  <Markdown>{event.summary ?? 'Session completed.'}</Markdown>
                </div>
              );
            }

            if (event.type === 'session:failed') {
              return (
                <div key={event.id} className="text-center text-xs text-red-400/80">
                  {event.error}
                </div>
              );
            }

            return null;
          })
        )}
      </div>

      <div className="border-t border-surface-800/70 bg-surface-950/50 p-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <div className="relative flex items-end gap-2 rounded-xl border border-surface-700 bg-surface-900 p-1 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (sessionId && hasLiveSession && input.trim() && !submitting) {
                      void sendAction({ action: 'input', text: input });
                    }
                  }
                }}
                rows={1}
                placeholder={hasLiveSession ? "Reply to the agent... (Press Enter to send)" : "Session ended"}
                disabled={!hasLiveSession}
                className="max-h-32 min-h-[40px] w-full resize-none bg-transparent px-3 py-2.5 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none disabled:opacity-50"
              />
              <div className="flex shrink-0 items-center gap-1 p-1">
                {hasLiveSession && (
                  <button
                    type="button"
                    onClick={() => void sendAction({ action: 'cancel' })}
                    disabled={submitting}
                    title="Cancel Session"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-200 disabled:opacity-50"
                  >
                    <Square className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void sendAction({ action: 'input', text: input })}
                  disabled={!sessionId || !hasLiveSession || !input.trim() || submitting}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
