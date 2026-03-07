import { FileCode2 } from 'lucide-react';

export default function ArtifactsViewer() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500 h-full flex flex-col">
            <header>
                <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Artifacts</h1>
                <p className="text-surface-400">Review patches, diffs, and generated documents.</p>
            </header>

            <div className="flex-1 glass-card rounded-xl border border-surface-800 flex flex-col items-center justify-center text-center">
                <FileCode2 className="w-16 h-16 text-surface-800 mb-6" />
                <h3 className="text-xl font-medium text-surface-300 mb-2">Artifact Viewer Under Construction</h3>
                <p className="text-surface-500 max-w-md">
                    This feature will allow you to preview and review file diffs, patch snippets, and generated documentation side-by-side before applying them.
                </p>
            </div>
        </div>
    );
}
