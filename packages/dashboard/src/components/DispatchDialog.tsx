'use client';
import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { ChevronDown, ChevronUp, Loader2, Play } from 'lucide-react';

interface DispatchDialogProps {
    open: boolean;
    onClose: () => void;
    taskId: string;
    taskTitle: string;
    onDispatched: () => void;
}

export function DispatchDialog({ open, onClose, taskId, taskTitle, onDispatched }: DispatchDialogProps) {
    const [runnerId, setRunnerId] = useState('bash');
    const [agents, setAgents] = useState<{ id: string; role: string; toolType: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [errorHint, setErrorHint] = useState('');
    const [errorDetails, setErrorDetails] = useState('');
    const [showErrorDetails, setShowErrorDetails] = useState(false);

    useEffect(() => {
        if (open) {
            setError('');
            setErrorHint('');
            setErrorDetails('');
            setShowErrorDetails(false);
            fetch('/api/agents')
                .then(r => r.json())
                .then(data => {
                    if (data.agents?.length) {
                        setAgents(data.agents);
                        setRunnerId(data.agents[0].id);
                    }
                })
                .catch(() => {});
        }
    }, [open]);

    // Detect whether we are running inside a VS Code webview (embedded iframe).
    // In that context we relay dispatch to the Extension Host via postMessage
    // instead of making an HTTP call.
    const isVsCodeWebview = typeof window !== 'undefined' && window.parent !== window;

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
        <Modal open={open} onClose={onClose} title="Dispatch Run">
            <div className="space-y-5">
                <div>
                    <p className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">Task</p>
                    <div className="glass-card rounded-lg p-3 border border-surface-800/50">
                        <span className="text-xs font-mono text-brand-400 bg-brand-950/50 px-1.5 py-0.5 rounded mr-2">{taskId}</span>
                        <span className="text-sm text-surface-200">{taskTitle}</span>
                    </div>
                </div>

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
                                {a.id} — {a.role}
                            </option>
                        ))}
                    </select>
                </div>

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
                    <button
                        onClick={handleDispatch}
                        disabled={loading}
                        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-5 rounded-md transition-colors shadow-[0_0_15px_rgba(92,129,163,0.3)] flex items-center gap-2 text-sm"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        Start Run
                    </button>
                </div>
            </div>
        </Modal>
    );
}
