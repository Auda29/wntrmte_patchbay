'use client';
import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Play, Terminal } from 'lucide-react';

interface AgentInfo {
    id: string;
    role: string;
    toolType: string;
    available?: boolean;
    installHint?: string;
}

interface DispatchDialogProps {
    open: boolean;
    onClose: () => void;
    taskId: string;
    taskTitle: string;
    taskStatus?: string;
    onDispatched: () => void;
}

const preferredRunnerOrder = ['claude-code', 'codex', 'gemini', 'cursor-cli', 'cursor'];

function sortAgentsByPreference(items: AgentInfo[]): AgentInfo[] {
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

export function DispatchDialog({ open, onClose, taskId, taskTitle, taskStatus, onDispatched }: DispatchDialogProps) {
    const isAwaitingInput = taskStatus === 'awaiting_input';
    const [runnerId, setRunnerId] = useState('bash');
    const [agents, setAgents] = useState<AgentInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [errorHint, setErrorHint] = useState('');
    const [errorDetails, setErrorDetails] = useState('');
    const [showErrorDetails, setShowErrorDetails] = useState(false);
    const [installCopied, setInstallCopied] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [runnerQuestion, setRunnerQuestion] = useState('');

    const selectedAgent = agents.find(a => a.id === runnerId);

    useEffect(() => {
        if (open) {
            setError('');
            setErrorHint('');
            setErrorDetails('');
            setShowErrorDetails(false);
            setReplyText('');
            fetch('/api/agents')
                .then(r => r.json())
                .then(data => {
                    if (data.agents?.length) {
                        const sortedAgents = sortAgentsByPreference(data.agents);
                        setAgents(sortedAgents);
                        const firstAvailable = sortedAgents.find((a: AgentInfo) => a.available !== false);
                        setRunnerId((firstAvailable ?? sortedAgents[0]).id);
                    }
                })
                .catch(() => {});

            // For awaiting_input tasks, fetch the latest run to get the question and conversationId
            if (isAwaitingInput) {
                fetch(`/api/runs?taskId=${encodeURIComponent(taskId)}`)
                    .then(r => r.json())
                    .then(data => {
                        const runs: Array<{ conversationId?: string; summary?: string; question?: string; turnIndex?: number; runner?: string }> = data.runs ?? data ?? [];
                        const threadRuns = runs.filter(r => r.conversationId);
                        if (threadRuns.length === 0) { return; }
                        const latest = threadRuns.sort((a, b) => (b.turnIndex ?? 0) - (a.turnIndex ?? 0))[0];
                        setConversationId(latest.conversationId ?? null);
                        setRunnerQuestion(latest.question ?? latest.summary ?? 'The runner is asking for more information.');
                        if (latest.runner) { setRunnerId(latest.runner); }
                    })
                    .catch(() => {});
            }
        }
    }, [open, isAwaitingInput, taskId]);

    // Detect whether we are running inside a VS Code webview (embedded iframe).
    // In that context we relay dispatch to the Extension Host via postMessage
    // instead of making an HTTP call.
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
        if (!conversationId || !replyText.trim()) { return; }
        setError('');
        setLoading(true);

        if (isVsCodeWebview) {
            // In VS Code: open terminal with patchbay reply command
            const escaped = replyText.replace(/"/g, '\\"');
            window.parent.postMessage(
                { command: 'wntrmte.runInTerminal', args: [`patchbay reply ${conversationId} "${escaped}"`] },
                '*',
            );
            onDispatched();
            onClose();
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId, message: replyText, runnerId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(typeof data.error === 'string' ? data.error : 'Reply failed');
            }
            onDispatched();
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

        if (isVsCodeWebview) {
            window.parent.postMessage(
                { command: 'wntrmte.dispatchInTerminal', args: [taskId, runnerId] },
                '*',
            );
            onDispatched();
            onClose();
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, runnerId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const details = data.details
                    ? JSON.stringify(data.details, null, 2)
                    : '';
                setErrorHint(typeof data.hint === 'string' ? data.hint : '');
                setErrorDetails(details);
                throw new Error(typeof data.error === 'string' ? data.error : 'Dispatch failed');
            }
            onDispatched();
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
                    <p className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">Task</p>
                    <div className="glass-card rounded-lg p-3 border border-surface-800/50">
                        <span className="text-xs font-mono text-brand-400 bg-brand-950/50 px-1.5 py-0.5 rounded mr-2">{taskId}</span>
                        <span className="text-sm text-surface-200">{taskTitle}</span>
                    </div>
                </div>

                {isAwaitingInput ? (
                    <div>
                        {runnerQuestion && (
                            <div className="mb-3 p-3 rounded-md bg-blue-950/30 border border-blue-900/50 text-sm text-blue-200">
                                <p className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-1">Runner Question</p>
                                {runnerQuestion}
                            </div>
                        )}
                        <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
                            Your Reply
                        </label>
                        <textarea
                            className="w-full rounded-md bg-surface-900 border border-surface-700 text-sm text-surface-100 px-3 py-2 focus:outline-none focus:border-brand-500 resize-none"
                            rows={3}
                            placeholder="Type your reply…"
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            autoFocus
                        />
                    </div>
                ) : (
                    <div>
                        <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
                            Runner
                        </label>
                        <select
                            className="select"
                            value={runnerId}
                            onChange={e => setRunnerId(e.target.value)}
                        >
                            {agents.map(a => (
                                <option key={a.id} value={a.id}>
                                    {a.id} — {a.role}{a.available === false ? ' (not installed)' : ''}
                                </option>
                            ))}
                        </select>
                        {selectedAgent?.available === false && selectedAgent.installHint && (
                            <div className="mt-2 flex items-start gap-2 text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-900/50 rounded-md px-3 py-2">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <span className="font-medium">{selectedAgent.id}</span> is not installed.
                                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                        <code className="px-1.5 py-0.5 bg-black/30 rounded text-yellow-200 select-all break-all">{selectedAgent.installHint}</code>
                                        <button
                                            type="button"
                                            onClick={() => handleInstall(selectedAgent.installHint!)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-yellow-900/40 hover:bg-yellow-800/50 text-yellow-200 hover:text-white transition-colors shrink-0"
                                        >
                                            <Terminal className="w-3 h-3" />
                                            {isVsCodeWebview
                                                ? 'Install in Terminal'
                                                : installCopied ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-md px-3 py-2 space-y-2">
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
                                    className="inline-flex items-center gap-1 text-xs text-red-200 hover:text-white transition-colors"
                                >
                                    {showErrorDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    {showErrorDetails ? 'Hide details' : 'Show details'}
                                </button>
                                {showErrorDetails && (
                                    <pre className="mt-2 overflow-x-auto rounded-md border border-red-900/60 bg-black/30 p-3 text-[11px] leading-relaxed text-red-100 whitespace-pre-wrap break-all">
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
                        className="px-4 py-2 text-sm font-medium text-surface-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    {isAwaitingInput ? (
                        <button
                            onClick={handleReply}
                            disabled={loading || !replyText.trim()}
                            className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-5 rounded-md transition-colors shadow-[0_0_15px_rgba(92,129,163,0.3)] flex items-center gap-2 text-sm"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Send Reply
                        </button>
                    ) : (
                        <button
                            onClick={handleDispatch}
                            disabled={loading || selectedAgent?.available === false}
                            className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-5 rounded-md transition-colors shadow-[0_0_15px_rgba(92,129,163,0.3)] flex items-center gap-2 text-sm"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Start Run
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
