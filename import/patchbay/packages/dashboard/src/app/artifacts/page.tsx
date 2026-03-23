'use client';
import useSWR from 'swr';
import { FileCode2, FolderOpen, ExternalLink, FileText } from 'lucide-react';
import { useState } from 'react';
import { DiffViewer } from '@/components/DiffViewer';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ArtifactsViewer() {
    const { data, error, isLoading } = useSWR('/api/artifacts', fetcher, { refreshInterval: 3000 });
    const [selectedFile, setSelectedFile] = useState<{ name: string; content: string } | null>(null);
    const [selectedDiff, setSelectedDiff] = useState<{ runId: string; taskId: string; diffRef: string } | null>(null);

    if (isLoading) return <div className="p-8 text-surface-400">Loading artifacts...</div>;
    if (error) return <div className="p-8 text-red-400">Error loading artifacts</div>;

    const contextFiles: { name: string; content: string }[] = data?.contextFiles || [];
    const runsWithDiffs: { runId: string; taskId: string; diffRef: string }[] = data?.runsWithDiffs || [];

    const isDiffContent = (content: string) => {
        return content.includes('@@') || content.split('\n').some(l => l.startsWith('+') || l.startsWith('-'));
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 h-full flex flex-col">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Artifacts</h1>
                    <p className="text-surface-400">Review context files, patches, diffs, and generated documents.</p>
                </div>
            </header>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
                {/* Sidebar: file list */}
                <div className="space-y-6 overflow-y-auto">
                    {/* Context Files */}
                    <section>
                        <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <FolderOpen className="w-4 h-4" />
                            Context Files
                        </h2>
                        {contextFiles.length === 0 ? (
                            <div className="glass-card rounded-lg border border-surface-800 p-4 text-center">
                                <p className="text-xs text-surface-600">No context files found</p>
                                <p className="text-xs text-surface-700 mt-1">Add files to <code className="text-brand-400">.project-agents/context/</code></p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {contextFiles.map(file => (
                                    <button
                                        key={file.name}
                                        onClick={() => { setSelectedFile(file); setSelectedDiff(null); }}
                                        className={`w-full text-left glass-card rounded-lg border p-3 flex items-center gap-3 transition-all group cursor-pointer ${selectedFile?.name === file.name && !selectedDiff
                                                ? 'border-brand-500 bg-brand-950/30'
                                                : 'border-surface-800/50 hover:border-surface-600'
                                            }`}
                                    >
                                        <FileText className={`w-4 h-4 flex-shrink-0 ${selectedFile?.name === file.name && !selectedDiff ? 'text-brand-400' : 'text-surface-500'
                                            }`} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-surface-200 truncate">{file.name}</p>
                                            <p className="text-xs text-surface-500 truncate">{file.content.substring(0, 60)}...</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Runs with Diffs */}
                    <section>
                        <h2 className="text-sm font-medium text-surface-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <ExternalLink className="w-4 h-4" />
                            Diff References
                        </h2>
                        {runsWithDiffs.length === 0 ? (
                            <div className="glass-card rounded-lg border border-surface-800 p-4 text-center">
                                <p className="text-xs text-surface-600">No diff references yet</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {runsWithDiffs.map(ref => (
                                    <button
                                        key={ref.runId}
                                        onClick={() => { setSelectedDiff(ref); setSelectedFile(null); }}
                                        className={`w-full text-left glass-card rounded-lg border p-3 transition-all cursor-pointer ${selectedDiff?.runId === ref.runId
                                                ? 'border-brand-500 bg-brand-950/30'
                                                : 'border-surface-800/50 hover:border-surface-600'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-mono text-brand-400 bg-brand-950/50 px-1.5 py-0.5 rounded">
                                                {ref.runId.substring(0, 20)}...
                                            </span>
                                        </div>
                                        <p className="text-xs text-surface-400">Task: {ref.taskId}</p>
                                        <p className="text-xs text-surface-500 font-mono mt-1 truncate">{ref.diffRef}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                {/* Main content: file preview / diff view */}
                <div className="lg:col-span-2 glass-card rounded-xl border border-surface-800 flex flex-col overflow-hidden min-h-[400px]">
                    {selectedFile ? (
                        <>
                            <div className="px-4 py-3 border-b border-surface-800 bg-surface-950/50 flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-brand-400" />
                                    <span className="text-sm font-medium text-white">{selectedFile.name}</span>
                                </div>
                                <span className="text-xs text-surface-500">
                                    {selectedFile.content.split('\n').length} lines
                                </span>
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                                {isDiffContent(selectedFile.content) ? (
                                    <DiffViewer content={selectedFile.content} />
                                ) : (
                                    <pre className="text-xs font-mono text-surface-300 whitespace-pre-wrap leading-relaxed">
                                        {selectedFile.content}
                                    </pre>
                                )}
                            </div>
                        </>
                    ) : selectedDiff ? (
                        <>
                            <div className="px-4 py-3 border-b border-surface-800 bg-surface-950/50 flex items-center justify-between flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <FileCode2 className="w-4 h-4 text-brand-400" />
                                    <span className="text-sm font-medium text-white">Diff: {selectedDiff.taskId}</span>
                                </div>
                                <span className="text-xs font-mono text-surface-500">{selectedDiff.runId.substring(0, 24)}...</span>
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                                <DiffViewer content={selectedDiff.diffRef} />
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                            <FileCode2 className="w-16 h-16 text-surface-800 mb-6" />
                            <h3 className="text-xl font-medium text-surface-300 mb-2">
                                {contextFiles.length > 0 || runsWithDiffs.length > 0 ? 'Select a file to preview' : 'No artifacts available'}
                            </h3>
                            <p className="text-surface-500 max-w-md">
                                {contextFiles.length > 0 || runsWithDiffs.length > 0
                                    ? 'Click on a context file or diff reference in the sidebar to view its contents.'
                                    : 'Context files and run diffs will appear here once you add files to .project-agents/context/ or complete agent runs.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
