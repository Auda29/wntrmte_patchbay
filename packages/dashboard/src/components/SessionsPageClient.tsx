'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquareMore, Clock3, AlertCircle, ArrowRight, Bot, PlayCircle, FolderKanban } from 'lucide-react';
import type { SessionRecord } from '@patchbay/core';
import { AgentChat } from '@/components/AgentChat';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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
  const { data, error, isLoading } = useSWR<SessionRecord[]>(query, fetcher, { refreshInterval: 2000 });
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
  const completedSessions = sessions.filter((session) => session.status === 'completed');

  const selectedStatusTone = selectedSession?.status === 'completed'
    ? 'border-green-900/60 bg-green-950/20 text-green-100'
    : selectedSession?.status === 'failed'
      ? 'border-red-900/60 bg-red-950/20 text-red-100'
      : selectedSession?.status === 'cancelled'
        ? 'border-surface-800 bg-surface-950/50 text-surface-300'
        : selectedSession?.status === 'awaiting_input'
          ? 'border-brand-900/60 bg-brand-950/30 text-brand-100'
          : 'border-blue-900/60 bg-blue-950/20 text-blue-100';

  if (isLoading) {
    return <div className="p-8 text-surface-400">Loading sessions...</div>;
  }

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
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-white">Sessions</h1>
        <p className="text-surface-400">
          Primary workspace for connector sessions, live agent transcripts, approvals, and resume points.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="glass-card rounded-2xl border border-surface-800/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-300">Live Workspace</p>
              <h2 className="mt-2 text-3xl font-semibold text-surface-50">{activeSessions.length}</h2>
            </div>
            <Bot className="h-5 w-5 text-brand-300" />
          </div>
          <p className="mt-3 text-sm text-surface-400">
            Active or waiting connector sessions that can be resumed right away.
          </p>
        </div>
        <div className="glass-card rounded-2xl border border-surface-800/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-surface-400">Completed</p>
              <h2 className="mt-2 text-3xl font-semibold text-surface-50">{completedSessions.length}</h2>
            </div>
            <PlayCircle className="h-5 w-5 text-surface-300" />
          </div>
          <p className="mt-3 text-sm text-surface-400">
            Finished sessions kept as durable chat history and review context.
          </p>
        </div>
        <div className="glass-card rounded-2xl border border-surface-800/70 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-surface-400">Preferred Flow</p>
              <h2 className="mt-2 text-lg font-semibold text-surface-50">Codex first</h2>
            </div>
            <FolderKanban className="h-5 w-5 text-surface-300" />
          </div>
          <p className="mt-3 text-sm text-surface-400">
            Start sessions from tasks, land here, then review in Runs only when you need execution history.
          </p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_280px]">
        <section className="glass-card rounded-2xl border border-surface-800/70 p-4">
          {sessions.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <MessageSquareMore className="mb-4 h-12 w-12 text-surface-700" />
              <h2 className="text-lg font-medium text-surface-200">No sessions yet</h2>
              <p className="mt-2 max-w-xs text-sm text-surface-500">
                Start an interactive connector session from the task board to see it here.
              </p>
              <Link
                href="/tasks"
                className="mt-5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-500"
              >
                Open Task Board
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-brand-300">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Active
                </div>
                <div className="space-y-2">
                  {activeSessions.length === 0 ? (
                    <p className="text-sm text-surface-500">No active sessions.</p>
                  ) : activeSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        const next = new URLSearchParams(searchParams.toString());
                        next.set('sessionId', session.id);
                        router.push(`/sessions?${next.toString()}`);
                      }}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                        selectedSession?.id === session.id
                          ? 'border-brand-500 bg-brand-950/35'
                          : 'border-surface-800/70 bg-surface-950/50 hover:border-surface-700'
                      }`}
                    >
                      <div className="text-sm font-medium text-surface-50">{session.title}</div>
                      <div className="mt-1 text-xs text-surface-400">{session.connectorId} • {session.taskId}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-surface-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  Past Sessions
                </div>
                <div className="space-y-2">
                  {pastSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => {
                        const next = new URLSearchParams(searchParams.toString());
                        next.set('sessionId', session.id);
                        router.push(`/sessions?${next.toString()}`);
                      }}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                        selectedSession?.id === session.id
                          ? 'border-brand-500 bg-brand-950/35'
                          : 'border-surface-800/70 bg-surface-950/50 hover:border-surface-700'
                      }`}
                    >
                      <div className="text-sm font-medium text-surface-50">{session.title}</div>
                      <div className="mt-1 text-xs text-surface-400">{session.connectorId} • {new Date(session.lastEventAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <AgentChat sessionId={selectedSession?.id} />

        <aside className="space-y-4">
          <section className="glass-card rounded-2xl border border-surface-800/70 p-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-300">Workspace Focus</p>
            {selectedSession ? (
              <>
                <h2 className="mt-2 text-lg font-semibold text-surface-50">{selectedSession.title}</h2>
                <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${selectedStatusTone}`}>
                  {selectedSession.status}
                </div>
                <div className="mt-4 space-y-3 text-sm text-surface-300">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-surface-500">Connector</p>
                    <p className="mt-1">{selectedSession.connectorId}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-surface-500">Task</p>
                    <p className="mt-1">{selectedSession.taskId}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-surface-500">Started</p>
                    <p className="mt-1">{new Date(selectedSession.startTime).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-surface-500">Last Activity</p>
                    <p className="mt-1">{new Date(selectedSession.lastEventAt).toLocaleString()}</p>
                  </div>
                  {selectedSession.providerSessionId ? (
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-surface-500">Provider Session</p>
                      <p className="mt-1 break-all font-mono text-xs text-surface-400">{selectedSession.providerSessionId}</p>
                    </div>
                  ) : null}
                  {selectedSession.summary ? (
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-surface-500">Summary</p>
                      <p className="mt-1 text-surface-400">{selectedSession.summary}</p>
                    </div>
                  ) : null}
                </div>
                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    onClick={() => void startFromSession('resume')}
                    disabled={actionBusy !== null || !selectedSession.providerSessionId}
                    className="inline-flex w-full items-center justify-between rounded-md border border-surface-800 bg-surface-950/50 px-3 py-2 text-sm text-surface-200 transition-colors hover:border-surface-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionBusy === 'resume' ? 'Reattaching...' : 'Reattach Session'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void startFromSession('fork')}
                    disabled={actionBusy !== null || !selectedSession.providerSessionId}
                    className="inline-flex w-full items-center justify-between rounded-md border border-surface-800 bg-surface-950/50 px-3 py-2 text-sm text-surface-200 transition-colors hover:border-surface-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionBusy === 'fork' ? 'Forking...' : 'Fork From Session'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  {actionError ? (
                    <p className="rounded-md border border-red-900/60 bg-red-950/20 px-3 py-2 text-xs text-red-200">
                      {actionError}
                    </p>
                  ) : null}
                  <Link
                    href={`/tasks`}
                    className="inline-flex w-full items-center justify-between rounded-md border border-surface-800 bg-surface-950/50 px-3 py-2 text-sm text-surface-200 transition-colors hover:border-surface-700 hover:text-white"
                  >
                    Open task board
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/sessions?taskId=${encodeURIComponent(selectedSession.taskId)}`}
                    className="inline-flex w-full items-center justify-between rounded-md border border-surface-800 bg-surface-950/50 px-3 py-2 text-sm text-surface-200 transition-colors hover:border-surface-700 hover:text-white"
                  >
                    View task sessions
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-surface-400">
                Pick a session to inspect its transcript, state, and connector metadata.
              </p>
            )}
          </section>

          <section className="glass-card rounded-2xl border border-surface-800/70 p-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-surface-400">Workflow</p>
            <ol className="mt-3 space-y-3 text-sm text-surface-300">
              <li>1. Start a connector session from the task board.</li>
              <li>2. Use this workspace for chat, approvals, tool activity, and resume.</li>
              <li>3. Check Runs only for execution history or batch fallback details.</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
