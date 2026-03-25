'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const components: Components = {
  table: ({ children, ...props }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-surface-800/70">
      <table className="min-w-full text-sm" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="border-b border-surface-800/70 bg-surface-950/60" {...props}>{children}</thead>
  ),
  th: ({ children, ...props }) => (
    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-400" {...props}>{children}</th>
  ),
  td: ({ children, ...props }) => (
    <td className="border-t border-surface-800/40 px-3 py-2 text-surface-200" {...props}>{children}</td>
  ),
  code: ({ children, className, ...props }) => {
    const isBlock = className?.startsWith('language-');
    if (isBlock) {
      return (
        <pre className="my-2 overflow-x-auto rounded-lg border border-surface-800/70 bg-surface-950/80 p-3 text-xs text-surface-200">
          <code {...props}>{children}</code>
        </pre>
      );
    }
    return (
      <code className="rounded bg-surface-800/60 px-1.5 py-0.5 text-xs text-brand-300" {...props}>{children}</code>
    );
  },
  pre: ({ children }) => <>{children}</>,
  p: ({ children, ...props }) => (
    <p className="my-1 leading-relaxed" {...props}>{children}</p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-1 list-disc space-y-0.5 pl-5" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-1 list-decimal space-y-0.5 pl-5" {...props}>{children}</ol>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-surface-50" {...props}>{children}</strong>
  ),
  h1: ({ children, ...props }) => <h1 className="mb-1 mt-3 text-lg font-semibold text-surface-50" {...props}>{children}</h1>,
  h2: ({ children, ...props }) => <h2 className="mb-1 mt-3 text-base font-semibold text-surface-50" {...props}>{children}</h2>,
  h3: ({ children, ...props }) => <h3 className="mb-1 mt-2 text-sm font-semibold text-surface-50" {...props}>{children}</h3>,
  blockquote: ({ children, ...props }) => (
    <blockquote className="my-2 border-l-2 border-brand-500/50 pl-3 text-surface-300" {...props}>{children}</blockquote>
  ),
};

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
