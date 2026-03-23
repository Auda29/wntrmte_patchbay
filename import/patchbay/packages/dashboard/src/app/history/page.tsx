'use client';
import useSWR from 'swr';
import { Run } from '@patchbay/core';
import { History, CheckCircle2, XCircle, Clock, AlertCircle, Download } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

function formatDuration(start: string, end?: string): string {
    if (!end) return 'Running...';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}m ${remaining}s`;
}

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'awaiting_input':
            return (
                <span className="flex items-center gap-1.5 text-purple-400">
                    <AlertCircle className="w-4 h-4" />
                    awaiting reply
                </span>
            );
        case 'completed':
            return (
                <span className="flex items-center gap-1.5 text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    completed
                </span>
            );
        case 'failed':
            return (
                <span className="flex items-center gap-1.5 text-red-400">
                    <XCircle className="w-4 h-4" />
                    failed
                </span>
            );
        case 'running':
            return (
                <span className="flex items-center gap-1.5 text-blue-400">
                    <Clock className="w-4 h-4 animate-pulse" />
                    running
                </span>
            );
        default:
            return (
                <span className="flex items-center gap-1.5 text-yellow-400">
                    <AlertCircle className="w-4 h-4" />
                    {status}
                </span>
            );
    }
}

export default function HistoryPage() {
    const { data, error, isLoading } = useSWR('/api/runs', fetcher, { refreshInterval: 3000 });

    if (isLoading) return <div className="p-8 text-surface-400">Loading history...</div>;
    if (error) return <div className="p-8 text-red-400">Error connecting to backend</div>;

    const runs: Run[] = [...(data || [])].sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">History</h1>
                <p className="text-surface-400">All dispatch runs across every task and runner.</p>
            </header>

            <div className="glass-card rounded-xl border border-surface-800 overflow-hidden">
                {runs.length === 0 ? (
                    <div className="p-12 flex flex-col items-center justify-center text-center">
                        <History className="w-12 h-12 text-surface-700 mb-4" />
                        <h3 className="text-lg font-medium text-surface-300">No runs recorded yet</h3>
                        <p className="text-sm text-surface-500 mt-1">Dispatch a task to see execution history here.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-surface-800 text-left">
                                <th className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Run ID</th>
                                <th className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Task</th>
                                <th className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Runner</th>
                                <th className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Started</th>
                                <th className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Duration</th>
                                <th className="px-4 py-3 text-xs font-medium text-surface-500 uppercase tracking-wider">Info</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-800/50">
                            {runs.map(run => (
                                <tr key={run.id} className="hover:bg-surface-900/30 transition-colors">
                                    <td className="px-4 py-3 font-mono text-xs text-surface-400 max-w-[160px] truncate" title={run.id}>
                                        {run.id.length > 24 ? `${run.id.slice(0, 24)}…` : run.id}
                                    </td>
                                    <td className="px-4 py-3 text-white font-medium">{run.taskId}</td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-mono text-brand-400 bg-brand-950/50 px-2 py-0.5 rounded border border-brand-900/50">
                                            {run.runner}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={run.status} />
                                    </td>
                                    <td className="px-4 py-3 text-surface-400 whitespace-nowrap">
                                        {new Date(run.startTime).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-surface-400 whitespace-nowrap">
                                        {run.status === 'running'
                                            ? <span className="text-blue-400 animate-pulse">Running...</span>
                                            : formatDuration(run.startTime, run.endTime)
                                        }
                                    </td>
                                    <td className="px-4 py-3">
                                        {run.status === 'awaiting_input' && run.question && (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-purple-300" title={run.question}>
                                                <AlertCircle className="w-3.5 h-3.5" />
                                                {run.question.length > 72 ? `${run.question.slice(0, 72)}…` : run.question}
                                            </span>
                                        )}
                                        {run.status === 'failed' && run.installHint && (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-yellow-400" title={`Install: ${run.installHint}`}>
                                                <Download className="w-3.5 h-3.5" />
                                                <code className="px-1.5 py-0.5 bg-yellow-950/30 border border-yellow-900/50 rounded select-all">{run.installHint}</code>
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
