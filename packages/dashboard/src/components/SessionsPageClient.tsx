'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquareMore } from 'lucide-react';
import type { SessionRecord } from '@patchbay/core';
import { AgentChat } from '@/components/AgentChat';

function sortSessions(items: SessionRecord[]): SessionRecord[] {
  return [...items].sort((a, b) => {
    const aActive = a.status === 'running' || a.status === 'awaiting_input';
    const bActive = b.status === 'running' || b.status === 'awaiting_input';
    if (aActive !== bActive) {
      return aActive ? -1 : 1;
    }

    return new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime();
  });
}

export function SessionsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get('taskId') || undefined;
  const selectedSessionId = searchParams.get('sessionId');
  const query = taskId ? `/api/sessions?taskId=${encodeURIComponent(taskId)}` : '/api/sessions';
  const { data, error } = useSWR<SessionRecord[]>(query);
  const [actionBusy, setActionBusy] = useState<'resume' | 'fork' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sessions = useMemo(() => sortSessions(data ?? []), [data]);
  const selectedSession = useMemo(() => {
    if (selectedSessionId) {
      return sessions.find((session) => session.id === selectedSessionId) ?? null;
    }
    if (taskId) {
      return sessions.find((session) => session.taskId === taskId) ?? null;
    }
    return sessions[0] ?? null;
  }, [selectedSessionId, sessions, taskId]);

  useEffect(() => {
    if (!selectedSession && !selectedSessionId) {
      return;
    }

    if (!selectedSession) {
      return;
    }

    if (selectedSession.id === selectedSessionId) {
      return;
    }

    const next = new URLSearchParams(searchParams.toString());
    next.set('sessionId', selectedSession.id);
    router.replace(`/sessions?${next.toString()}`);
  }, [router, searchParams, selectedSession, selectedSessionId]);

  const activeSessions = sessions.filter((session) => session.status === 'running' || session.status === 'awaiting_input');
  const pastSessions = sessions.filter((session) => session.status !== 'running' && session.status !== 'awaiting_input');

  const selectedStatusTone = selectedSession?.status === 'completed'
    ? 'border-green-900/60 bg-green-950/20 text-green-100'
    : selectedSession?.status === 'failed'
      ? 'border-red-900/60 bg-red-950/20 text-red-100'
      : selectedSession?.status === 'cancelled'
        ? 'border-surface-800 bg-surface-950/50 text-surface-300'
        : selectedSession?.status === 'awaiting_input'
          ? 'border-brand-900/60 bg-brand-950/30 text-brand-100'
          : 'border-blue-900/60 bg-blue-950/20 text-blue-100';

  if (error) {
    return <div className="p-8 text-red-400">Error connecting to backend</div>;
  }

  const startFromSession = async (mode: 'resume' | 'fork') => {
    if (!selectedSession) {
      return;
    }

    setActionBusy(mode);
    setActionError(null);
    try {
      const response = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedSession.taskId,
          connectorId: selectedSession.connectorId,
          mode,
          sessionId: selectedSession.id,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === 'string' ? payload.error : `Failed to ${mode} session`);
      }

      const payload = await response.json() as { sessionId?: string };
      if (payload.sessionId) {
        const next = new URLSearchParams(searchParams.toString());
        next.set('sessionId', payload.sessionId);
        next.delete('taskId');
        router.push(`/sessions?${next.toString()}`);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${mode} session`);
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col animate-in fade-in duration-500">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-white">Sessions</h1>
          <p className="text-surface-400">
            Interactive workspaces for live agent sessions and transcripts.
          </p>
        </div>
      </header>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Left Sidebar: Session List */}
        <aside className="flex w-80 flex-col overflow-hidden rounded-2xl border border-surface-800/70 bg-surface-950/30 shadow-lg">
          <div className="border-b border-surface-800/70 bg-surface-950/50 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">All Sessions</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-6">
            {sessions.length === 0 ? (
              <div className="p-4 text-center text-sm text-surface-500">No sessions yet.</div>
            ) : (
              <>
                {activeSessions.length > 0 && (
                  <div>
                    <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-brand-400">Active</div>
                    <div className="space-y-1">
                      {activeSessions.map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => {
                            const next = new URLSearchParams(searchParams.toString());
                            next.set('sessionId', session.id);
                            router.push(`/sessions?${next.toString()}`);
                          }}
                          className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                            selectedSession?.id === session.id
                              ? 'bg-brand-950/40 border border-brand-500/50 shadow-sm'
                              : 'border border-transparent hover:bg-surface-900/50'
                          }`}
                        >
                          <div className="truncate text-sm font-medium text-surface-100">{session.title}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-surface-500">
                            <span className="truncate">{session.connectorId}</span>
                            <span>•</span>
                            <span className="truncate">{session.taskId}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {pastSessions.length > 0 && (
                  <div>
                    <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-surface-500">Past</div>
                    <div className="space-y-1">
                      {pastSessions.map((session) => (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => {
                            const next = new URLSearchParams(searchParams.toString());
                            next.set('sessionId', session.id);
                            router.push(`/sessions?${next.toString()}`);
                          }}
                          className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                            selectedSession?.id === session.id
                              ? 'bg-brand-950/40 border border-brand-500/50 shadow-sm'
                              : 'border border-transparent hover:bg-surface-900/50'
                          }`}
                        >
                          <div className="truncate text-sm font-medium text-surface-100">{session.title}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-surface-500">
                            <span className="truncate">{session.connectorId}</span>
                            <span>•</span>
                            <span className="truncate">{new Date(session.lastEventAt).toLocaleDateString()}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Main Content: Active Session */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {selectedSession ? (
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-surface-800/70 bg-[linear-gradient(180deg,rgba(10,14,20,0.98)_0%,rgba(13,17,23,0.96)_100%)] shadow-xl">
              {/* Session Header */}
              <div className="flex items-center justify-between border-b border-surface-800/70 bg-surface-950/50 px-6 py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-surface-50">{selectedSession.title}</h2>
                    <div className="mt-1 flex items-center gap-3 text-xs text-surface-400">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${selectedStatusTone}`}>
                        {selectedSession.status}
                      </span>
                      <span className="font-mono text-brand-400">{selectedSession.connectorId}</span>
                      <span>Task: {selectedSession.taskId}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedSession.providerSessionId && (
                    <>
                      <button
                        type="button"
                        onClick={() => void startFromSession('resume')}
                        disabled={actionBusy !== null}
                        className="inline-flex items-center gap-1.5 rounded-md border border-surface-700 bg-surface-900 px-3 py-1.5 text-xs font-medium text-surface-200 transition-colors hover:bg-surface-800 hover:text-white disabled:opacity-50"
                      >
                        {actionBusy === 'resume' ? 'Reattaching...' : 'Reattach'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void startFromSession('fork')}
                        disabled={actionBusy !== null}
                        className="inline-flex items-center gap-1.5 rounded-md border border-surface-700 bg-surface-900 px-3 py-1.5 text-xs font-medium text-surface-200 transition-colors hover:bg-surface-800 hover:text-white disabled:opacity-50"
                      >
                        {actionBusy === 'fork' ? 'Forking...' : 'Fork'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {actionError && (
                <div className="border-b border-red-900/30 bg-red-950/20 px-6 py-2 text-xs text-red-400">
                  {actionError}
                </div>
              )}

              {/* Chat Area */}
              <div className="flex-1 overflow-hidden">
                <AgentChat sessionId={selectedSession.id} />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-surface-800/50 bg-surface-950/20">
              <div className="text-center">
                <MessageSquareMore className="mx-auto mb-4 h-12 w-12 text-surface-700" />
                <h3 className="text-lg font-medium text-surface-300">No session selected</h3>
                <p className="mt-2 text-sm text-surface-500">Choose a session from the sidebar or start a new one from a task.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
