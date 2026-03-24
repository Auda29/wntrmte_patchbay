'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Play, Terminal } from 'lucide-react';
import type { ConnectorCapabilities } from '@patchbay/core';

interface RunnerInfo {
  id: string;
  role: string;
  toolType: string;
  available?: boolean;
  installHint?: string;
}

interface ConnectorInfo {
  id: string;
  name: string;
  available: boolean;
  installHint?: string;
  capabilities: ConnectorCapabilities;
}

interface DispatchDialogProps {
  open: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle: string;
  taskStatus?: string;
  onDispatched: (meta?: { interactive?: boolean; sessionId?: string }) => void;
}

const preferredRunnerOrder = ['claude-code', 'codex', 'gemini', 'cursor-cli', 'cursor'];

function sortByPreference<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aIndex = preferredRunnerOrder.indexOf(a.id);
    const bIndex = preferredRunnerOrder.indexOf(b.id);
    const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;

    if (normalizedA !== normalizedB) {
      return normalizedA - normalizedB;
    }

    return a.id.localeCompare(b.id);
  });
}

export function DispatchDialog({
  open,
  onClose,
  taskId,
  taskTitle,
  taskStatus,
  onDispatched,
}: DispatchDialogProps) {
  const isAwaitingInput = taskStatus === 'awaiting_input';
  const [selectedRunnerId, setSelectedRunnerId] = useState('bash');
  const [selectedConnectorId, setSelectedConnectorId] = useState('');
  const [dispatchMode, setDispatchMode] = useState<'run' | 'interactive'>('run');
  const [runners, setRunners] = useState<RunnerInfo[]>([]);
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorHint, setErrorHint] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [installCopied, setInstallCopied] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [runnerQuestion, setRunnerQuestion] = useState('');

  const selectedRunner = runners.find((runner) => runner.id === selectedRunnerId);
  const selectedConnector = connectors.find((connector) => connector.id === selectedConnectorId);
  const selectedInstallTarget = dispatchMode === 'interactive' ? selectedConnector : selectedRunner;
  const canStartInteractiveSession = !isAwaitingInput
    && !!selectedConnector
    && selectedConnector.available !== false;

  useEffect(() => {
    if (!open) {
      return;
    }

    setError('');
    setErrorHint('');
    setErrorDetails('');
    setShowErrorDetails(false);
    setReplyText('');
    setDispatchMode('run');

    fetch('/api/agents')
      .then((response) => response.json())
      .then((data) => {
        const nextRunners = sortByPreference((data.agents ?? []) as RunnerInfo[]);
        setRunners(nextRunners);
        if (nextRunners.length > 0) {
          const firstAvailable = nextRunners.find((runner) => runner.available !== false);
          setSelectedRunnerId((firstAvailable ?? nextRunners[0]).id);
        }
      })
      .catch(() => {});

    fetch('/api/connectors')
      .then((response) => response.json())
      .then((data) => {
        const nextConnectors = sortByPreference((data ?? []) as ConnectorInfo[]);
        setConnectors(nextConnectors);
        if (nextConnectors.length > 0) {
          const firstAvailable = nextConnectors.find((connector) => connector.available !== false);
          setSelectedConnectorId((firstAvailable ?? nextConnectors[0]).id);
        }
      })
      .catch(() => {});

    if (isAwaitingInput) {
      fetch(`/api/runs?taskId=${encodeURIComponent(taskId)}`)
        .then((response) => response.json())
        .then((data) => {
          const runs: Array<{ conversationId?: string; summary?: string; question?: string; turnIndex?: number; runner?: string }> = data.runs ?? data ?? [];
          const threadRuns = runs.filter((run) => run.conversationId);
          if (threadRuns.length === 0) {
            return;
          }

          const latest = threadRuns.sort((a, b) => (b.turnIndex ?? 0) - (a.turnIndex ?? 0))[0];
          setConversationId(latest.conversationId ?? null);
          setRunnerQuestion(latest.question ?? latest.summary ?? 'The runner is asking for more information.');
          if (latest.runner) {
            setSelectedRunnerId(latest.runner);
          }
        })
        .catch(() => {});
    }
  }, [open, isAwaitingInput, taskId]);

  const isVsCodeWebview = typeof window !== 'undefined' && window.parent !== window;

  const handleInstall = (hint: string) => {
    if (isVsCodeWebview) {
      window.parent.postMessage({ command: 'wntrmte.runInTerminal', args: [hint] }, '*');
    } else {
      navigator.clipboard.writeText(hint).then(() => {
        setInstallCopied(true);
        setTimeout(() => setInstallCopied(false), 2000);
      }).catch(() => {});
    }
  };

  const handleReply = async () => {
    if (!conversationId || !replyText.trim()) {
      return;
    }

    setError('');
    setLoading(true);

    if (isVsCodeWebview) {
      const escaped = replyText.replace(/"/g, '\\"');
      window.parent.postMessage(
        { command: 'wntrmte.runInTerminal', args: [`patchbay reply ${conversationId} "${escaped}"`] },
        '*',
      );
      onDispatched({ interactive: false });
      onClose();
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: replyText, runnerId: selectedRunnerId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : 'Reply failed');
      }

      onDispatched({ interactive: false });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reply failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDispatch = async () => {
    setError('');
    setErrorHint('');
    setErrorDetails('');
    setShowErrorDetails(false);

    if (dispatchMode === 'interactive') {
      if (!selectedConnectorId) {
        setError('No connector selected.');
        return;
      }

      if (isVsCodeWebview) {
        window.parent.postMessage(
          { command: 'wntrmte.connectAgent', args: [taskId, selectedConnectorId] },
          '*',
        );
        onDispatched({ interactive: true });
        onClose();
        return;
      }

      setLoading(true);
      try {
        const response = await fetch('/api/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, connectorId: selectedConnectorId }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(typeof data.error === 'string' ? data.error : 'Interactive session failed');
        }

        const payload = await response.json() as { sessionId?: string };
        onDispatched({ interactive: true, sessionId: payload.sessionId });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Interactive session failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isVsCodeWebview) {
      window.parent.postMessage(
        { command: 'wntrmte.dispatchInTerminal', args: [taskId, selectedRunnerId] },
        '*',
      );
      onDispatched({ interactive: false });
      onClose();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, runnerId: selectedRunnerId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const details = data.details ? JSON.stringify(data.details, null, 2) : '';
        setErrorHint(typeof data.hint === 'string' ? data.hint : '');
        setErrorDetails(details);
        throw new Error(typeof data.error === 'string' ? data.error : 'Dispatch failed');
      }

      onDispatched({ interactive: false });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispatch failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isAwaitingInput ? 'Reply to Runner' : 'Dispatch Run'}>
      <div className="space-y-5">
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-surface-400">Task</p>
          <div className="glass-card rounded-lg border border-surface-800/50 p-3">
            <span className="mr-2 rounded bg-brand-950/50 px-1.5 py-0.5 text-xs font-mono text-brand-400">{taskId}</span>
            <span className="text-sm text-surface-200">{taskTitle}</span>
          </div>
        </div>

        {isAwaitingInput ? (
          <div>
            {runnerQuestion && (
              <div className="mb-3 rounded-md border border-blue-900/50 bg-blue-950/30 p-3 text-sm text-blue-200">
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-blue-400">Runner Question</p>
                {runnerQuestion}
              </div>
            )}
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-surface-400">
              Your Reply
            </label>
            <textarea
              className="w-full resize-none rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-100 focus:border-brand-500 focus:outline-none"
              rows={3}
              placeholder="Type your reply..."
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              autoFocus
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDispatchMode('run')}
                className={`rounded-md border px-3 py-2 text-left transition-colors ${
                  dispatchMode === 'run'
                    ? 'border-brand-500 bg-brand-950/40 text-surface-50'
                    : 'border-surface-800 bg-surface-950/40 text-surface-300 hover:border-surface-700'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Play className="h-4 w-4" />
                  Batch Run
                </div>
                <p className="mt-1 text-xs text-surface-400">
                  Batch execution via `patchbay run`.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDispatchMode('interactive')}
                disabled={connectors.length === 0}
                className={`rounded-md border px-3 py-2 text-left transition-colors ${
                  dispatchMode === 'interactive'
                    ? 'border-brand-500 bg-brand-950/40 text-surface-50'
                    : 'border-surface-800 bg-surface-950/40 text-surface-300 hover:border-surface-700'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Terminal className="h-4 w-4" />
                  Interactive Session
                </div>
                <p className="mt-1 text-xs text-surface-400">
                  Connector-backed live session for chat, approvals, and resume.
                </p>
              </button>
            </div>

            {dispatchMode === 'interactive' ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-surface-400">
                  Connector
                </label>
                <select
                  className="select"
                  value={selectedConnectorId}
                  onChange={(event) => setSelectedConnectorId(event.target.value)}
                >
                  {connectors.map((connector) => (
                    <option key={connector.id} value={connector.id}>
                      {connector.id} — {connector.name}{connector.available === false ? ' (not installed)' : ''}
                    </option>
                  ))}
                </select>
                {selectedConnector?.capabilities && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-surface-800 bg-surface-950/50 px-2 py-1 text-surface-300">
                      Streaming {selectedConnector.capabilities.streaming ? 'yes' : 'no'}
                    </span>
                    <span className="rounded-full border border-surface-800 bg-surface-950/50 px-2 py-1 text-surface-300">
                      Permissions {selectedConnector.capabilities.permissions ? 'yes' : 'no'}
                    </span>
                    <span className="rounded-full border border-surface-800 bg-surface-950/50 px-2 py-1 text-surface-300">
                      Multi-turn {selectedConnector.capabilities.multiTurn ? 'yes' : 'no'}
                    </span>
                    <span className="rounded-full border border-surface-800 bg-surface-950/50 px-2 py-1 text-surface-300">
                      Tool use {selectedConnector.capabilities.toolUseReporting ? 'yes' : 'no'}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-surface-400">
                  Runner
                </label>
                <select
                  className="select"
                  value={selectedRunnerId}
                  onChange={(event) => setSelectedRunnerId(event.target.value)}
                >
                  {runners.map((runner) => (
                    <option key={runner.id} value={runner.id}>
                      {runner.id} — {runner.role}{runner.available === false ? ' (not installed)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedInstallTarget?.available === false && selectedInstallTarget.installHint && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-yellow-900/50 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{selectedInstallTarget.id}</span> is not installed.
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <code className="select-all break-all rounded bg-black/30 px-1.5 py-0.5 text-yellow-200">{selectedInstallTarget.installHint}</code>
                    <button
                      type="button"
                      onClick={() => handleInstall(selectedInstallTarget.installHint!)}
                      className="inline-flex shrink-0 items-center gap-1 rounded bg-yellow-900/40 px-2 py-1 text-yellow-200 transition-colors hover:bg-yellow-800/50 hover:text-white"
                    >
                      <Terminal className="h-3 w-3" />
                      {isVsCodeWebview ? 'Install in Terminal' : installCopied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="space-y-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-400">
            <div>{error}</div>
            {errorHint && (
              <div className="text-xs text-red-200/80">
                {errorHint}
              </div>
            )}
            {errorDetails && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowErrorDetails((value) => !value)}
                  className="inline-flex items-center gap-1 text-xs text-red-200 transition-colors hover:text-white"
                >
                  {showErrorDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {showErrorDetails ? 'Hide details' : 'Show details'}
                </button>
                {showErrorDetails && (
                  <pre className="mt-2 whitespace-pre-wrap break-all rounded-md border border-red-900/60 bg-black/30 p-3 text-[11px] leading-relaxed text-red-100">
                    {errorDetails}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-surface-400 transition-colors hover:text-white"
          >
            Cancel
          </button>
          {isAwaitingInput ? (
            <button
              onClick={handleReply}
              disabled={loading || !replyText.trim()}
              className="flex items-center gap-2 rounded-md bg-brand-500 px-5 py-2 text-sm font-medium text-white shadow-[0_0_15px_rgba(92,129,163,0.3)] transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Send Reply
            </button>
          ) : (
            <button
              onClick={handleDispatch}
              disabled={loading || selectedInstallTarget?.available === false || (dispatchMode === 'interactive' && !canStartInteractiveSession)}
              className="flex items-center gap-2 rounded-md bg-brand-500 px-5 py-2 text-sm font-medium text-white shadow-[0_0_15px_rgba(92,129,163,0.3)] transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : dispatchMode === 'interactive' ? (
                <Terminal className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {dispatchMode === 'interactive' ? 'Start Session' : 'Start Run'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
