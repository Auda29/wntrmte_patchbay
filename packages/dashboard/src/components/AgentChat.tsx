'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Bot, Check, Send, Square, User, X } from 'lucide-react';
import type { SessionEventRecord, SessionRecord } from '@patchbay/core';

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
  );

  useEffect(() => {
    setEvents(storedEvents ?? []);
  }, [storedEvents, sessionId]);

  useEffect(() => {
    if (!sessionId || !session) {
      return;
    }

    if (session.status !== 'running' && session.status !== 'awaiting_input') {
      return;
    }

    const source = new EventSource(`/api/agent-events/${encodeURIComponent(sessionId)}`);
    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as Record<string, unknown>;
        const event: ChatEvent = parsed.type === 'stream:end'
          ? { id: `stream-end-${Date.now()}`, type: 'stream:end' as const, sessionId, timestamp: new Date().toISOString() }
          : { id: `live-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, ...(parsed as SessionEventRecord) } as ChatEvent;

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
          void mutateSession();
          void mutateEvents();
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [mutateEvents, mutateSession, session, sessionId]);

  useEffect(() => {
    if (!scrollerRef.current) {
      return;
    }

    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [events]);

  const hasLiveSession = session?.status === 'running' || session?.status === 'awaiting_input';

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
      <div className="glass-card flex min-h-[420px] items-center justify-center rounded-2xl border border-surface-800/70 p-8 text-sm text-surface-400">
        Select a session to inspect its full chat history.
      </div>
    );
  }

  return (
    <section className="flex min-h-[720px] flex-col overflow-hidden rounded-2xl border border-surface-800/80 bg-[linear-gradient(180deg,rgba(10,14,20,0.98)_0%,rgba(13,17,23,0.96)_100%)] shadow-[-20px_0_48px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4 border-b border-surface-800/70 px-6 py-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-300">Agent Session</p>
          <h2 className="mt-1 text-xl font-semibold text-surface-50">{session.title}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-surface-400">
            <span className="rounded-full border border-surface-800 bg-surface-950/60 px-2 py-1">{statusCopy}</span>
            <span className="rounded-full border border-surface-800 bg-surface-950/60 px-2 py-1">{session.connectorId}</span>
            <span className="rounded-full border border-surface-800 bg-surface-950/60 px-2 py-1">{session.taskId}</span>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-surface-800 bg-surface-950/50 px-3 py-2 text-sm text-surface-300 transition-colors hover:border-surface-700 hover:text-surface-50"
          >
            Close
          </button>
        ) : null}
      </div>

      <div className="border-b border-surface-800/60 px-6 py-3 text-sm text-surface-400">
        {hasLiveSession
          ? `Live session ${session.id}`
          : `Session ${session.id} • last activity ${new Date(session.lastEventAt).toLocaleString()}`}
      </div>

      <div ref={scrollerRef} className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {events.length === 0 ? (
          <div className="glass-card rounded-xl border border-surface-800/70 p-5 text-sm text-surface-400">
            Waiting for session events...
          </div>
        ) : (
          events.map((event) => {
            if (event.type === 'session:started') {
              return (
                <div key={event.id} className="rounded-xl border border-surface-800/70 bg-surface-950/50 px-4 py-3 text-sm text-surface-300">
                  Session started via <span className="font-medium text-surface-100">{event.connectorId}</span>.
                </div>
              );
            }

            if (event.type === 'agent:message') {
              return (
                <div key={event.id} className="flex gap-3">
                  <div className="mt-1 rounded-full bg-brand-950/60 p-2 text-brand-300">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="glass-card flex-1 rounded-xl border border-surface-800/70 p-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-surface-100">{event.content}</p>
                  </div>
                </div>
              );
            }

            if (event.type === 'agent:tool_use') {
              return (
                <div key={event.id} className="rounded-xl border border-surface-800/70 bg-surface-950/50 px-4 py-3 text-sm text-surface-300">
                  <span className="font-medium text-surface-100">{event.toolName}</span> {event.status}
                  {event.toolOutput ? <pre className="mt-2 whitespace-pre-wrap text-xs text-surface-400">{event.toolOutput}</pre> : null}
                </div>
              );
            }

            if (event.type === 'agent:permission') {
              return (
                <div key={event.id} className="rounded-xl border border-yellow-900/50 bg-yellow-950/20 px-4 py-4">
                  <p className="text-sm font-medium text-yellow-200">{event.description}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void sendAction({ action: 'approve', permissionId: event.permissionId })}
                      disabled={submitting || !hasLiveSession}
                      className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendAction({ action: 'deny', permissionId: event.permissionId })}
                      disabled={submitting || !hasLiveSession}
                      className="inline-flex items-center gap-2 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-950/50 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      Deny
                    </button>
                  </div>
                </div>
              );
            }

            if (event.type === 'agent:question') {
              return (
                <div key={event.id} className="rounded-xl border border-brand-900/50 bg-brand-950/20 px-4 py-4 text-sm text-brand-100">
                  {event.question}
                </div>
              );
            }

            if (event.type === 'session:completed') {
              return (
                <div key={event.id} className="rounded-xl border border-green-900/50 bg-green-950/20 px-4 py-4 text-sm text-green-100">
                  {event.summary ?? 'Session completed.'}
                </div>
              );
            }

            if (event.type === 'session:failed') {
              return (
                <div key={event.id} className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-4 text-sm text-red-100">
                  {event.error}
                </div>
              );
            }

            return null;
          })
        )}
      </div>

      <div className="border-t border-surface-800/70 px-6 py-4">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => void sendAction({ action: 'cancel' })}
            disabled={!sessionId || !hasLiveSession || submitting}
            className="inline-flex items-center gap-2 rounded-md border border-surface-800 bg-surface-950/40 px-3 py-2 text-sm text-surface-300 transition-colors hover:border-surface-700 hover:text-surface-50 disabled:opacity-50"
          >
            <Square className="h-4 w-4" />
            Cancel Session
          </button>
        </div>
        <div className="flex gap-3">
          <div className="mt-2 rounded-full bg-surface-900/70 p-2 text-surface-300">
            <User className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              placeholder="Reply to the agent..."
              className="textarea"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void sendAction({ action: 'input', text: input })}
                disabled={!sessionId || !hasLiveSession || !input.trim() || submitting}
                className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
