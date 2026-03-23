'use client';
import useSWR from 'swr';
import { Run } from '@patchbay/core';
import { TerminalSquare, Clock, CheckCircle2, XCircle, AlertCircle, FileCode2, AlertTriangle, Lightbulb } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function RunsViewer() {
    const { data, error, isLoading } = useSWR('/api/state', fetcher, { refreshInterval: 2000 });

    if (isLoading) return <div className="p-8 text-surface-400">Loading runs...</div>;
    if (error) return <div className="p-8 text-red-400">Error connecting to backend</div>;

    const runs: Run[] = data?.runs || [];
    runs.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
            case 'failed': return <XCircle className="w-5 h-5 text-red-500" />;
            case 'running': return <Clock className="w-5 h-5 text-blue-500 animate-pulse" />;
            case 'awaiting_input': return <AlertCircle className="w-5 h-5 text-purple-400" />;
            default: return <AlertCircle className="w-5 h-5 text-yellow-500" />;
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Run History</h1>
                <p className="text-surface-400">Execution logs and metrics across all agents.</p>
            </header>

            <div className="space-y-4">
                {runs.length === 0 ? (
                    <div className="glass-card rounded-xl border border-surface-800 p-12 flex flex-col items-center justify-center text-center">
                        <TerminalSquare className="w-12 h-12 text-surface-700 mb-4" />
                        <h3 className="text-lg font-medium text-surface-300">No runs yet</h3>
                        <p className="text-sm text-surface-500 mt-1">Agent executions will appear here.</p>
                    </div>
                ) : (
                    runs.map(run => (
                        <details key={run.id} className="group glass-card rounded-xl border border-surface-800/50 overflow-hidden [&_summary::-webkit-details-marker]:hidden">
                            <summary className="cursor-pointer p-4 flex items-center justify-between hover:bg-surface-900/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    {getStatusIcon(run.status)}
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="font-medium text-white">{run.taskId}</h3>
                                            <span className="text-xs font-mono text-brand-400 bg-brand-950/50 px-2 py-0.5 rounded border border-brand-900/50">
                                                {run.runner}
                                            </span>
                                        </div>
                                        <p className="text-xs text-surface-400">
                                            Started: {new Date(run.startTime).toLocaleString()}
                                            {run.endTime && ` • Ended: ${new Date(run.endTime).toLocaleString()}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-surface-300 capitalize hidden sm:inline-block">
                                        {run.status === 'awaiting_input' ? 'awaiting reply' : run.status}
                                    </span>
                                    <div className="w-6 h-6 rounded-full bg-surface-800 flex items-center justify-center group-open:rotate-180 transition-transform">
                                        <svg className="w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </div>
                            </summary>

                            <div className="p-4 border-t border-surface-800/50 bg-black/20 space-y-4">
                                {run.summary && (
                                    <div>
                                        <h4 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-2">Summary</h4>
                                        <p className="text-sm text-surface-200 leading-relaxed">{run.summary}</p>
                                    </div>
                                )}

                                {run.status === 'awaiting_input' && run.question && (
                                    <div>
                                        <h4 className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-2">Runner Question</h4>
                                        <p className="text-sm text-purple-100 bg-purple-950/20 border border-purple-900/40 rounded-md px-3 py-2 leading-relaxed">
                                            {run.question}
                                        </p>
                                    </div>
                                )}

                                {run.logs && run.logs.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-2">Logs</h4>
                                        <div className="bg-surface-950 rounded-lg p-4 font-mono text-xs text-surface-300 overflow-x-auto border border-surface-900 max-h-96 overflow-y-auto">
                                            {run.logs.map((log, i) => (
                                                <div key={i} className="mb-2 whitespace-pre-wrap">{log}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Changed Files */}
                                {run.diffRef && (
                                    <div>
                                        <h4 className="text-xs font-medium text-surface-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <FileCode2 className="w-3.5 h-3.5" />
                                            Diff Reference
                                        </h4>
                                        <p className="text-xs font-mono text-brand-400 bg-brand-950/30 border border-brand-900/50 rounded-md px-3 py-2">{run.diffRef}</p>
                                    </div>
                                )}

                                {/* Blockers */}
                                {run.blockers && run.blockers.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-medium text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5" />
                                            Blockers
                                        </h4>
                                        <ul className="space-y-1.5">
                                            {run.blockers.map((b, i) => (
                                                <li key={i} className="text-sm text-red-300/80 bg-red-950/20 border border-red-900/30 rounded-md px-3 py-2">
                                                    {b}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Suggested Next Steps */}
                                {run.suggestedNextSteps && run.suggestedNextSteps.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <Lightbulb className="w-3.5 h-3.5" />
                                            Suggested Next Steps
                                        </h4>
                                        <ul className="space-y-1.5">
                                            {run.suggestedNextSteps.map((step, i) => (
                                                <li key={i} className="text-sm text-blue-300/80 bg-blue-950/20 border border-blue-900/30 rounded-md px-3 py-2 flex gap-2">
                                                    <span className="text-blue-500 flex-shrink-0">→</span>
                                                    {step}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </details>
                    ))
                )}
            </div>
        </div>
    );
}
