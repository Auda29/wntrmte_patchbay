'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquareMore, Clock3, AlertCircle } from 'lucide-react';
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

export default function SessionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get('taskId') || undefined;
  const selectedSessionId = searchParams.get('sessionId');
  const query = taskId ? `/api/sessions?taskId=${encodeURIComponent(taskId)}` : '/api/sessions';
  const { data, error, isLoading } = useSWR<SessionRecord[]>(query, fetcher, { refreshInterval: 2000 });

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

  if (isLoading) {
    return <div className="p-8 text-surface-400">Loading sessions...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-400">Error connecting to backend</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-white">Sessions</h1>
        <p className="text-surface-400">
          Persistent connector chat history, live sessions, and resume points.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
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
      </div>
    </div>
  );
}
