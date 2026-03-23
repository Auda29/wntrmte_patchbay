'use client';

interface DiffViewerProps {
    content: string;
}

export function DiffViewer({ content }: DiffViewerProps) {
    const lines = content.split('\n');

    return (
        <div className="bg-surface-950 rounded-lg border border-surface-900 overflow-x-auto font-mono text-xs leading-relaxed">
            {lines.map((line, i) => {
                let className = 'diff-ctx';
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    className = 'diff-add';
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    className = 'diff-del';
                } else if (line.startsWith('@@')) {
                    className = 'diff-hunk';
                }

                return (
                    <div key={i} className={`px-4 py-0.5 ${className}`}>
                        <span className="inline-block w-10 text-right mr-4 text-surface-600 select-none">{i + 1}</span>
                        {line}
                    </div>
                );
            })}
        </div>
    );
}
