'use client';
import { useState } from 'react';
import { Modal } from './Modal';
import { Loader2 } from 'lucide-react';

interface NewDecisionModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

export function NewDecisionModal({ open, onClose, onCreated }: NewDecisionModalProps) {
    const [title, setTitle] = useState('');
    const [rationale, setRationale] = useState('');
    const [proposedBy, setProposedBy] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/decisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    rationale,
                    proposedBy: proposedBy.trim() || undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create decision');
            }

            setTitle('');
            setRationale('');
            setProposedBy('');
            onCreated();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="New Decision">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
                        Title *
                    </label>
                    <input
                        className="input"
                        placeholder="e.g. Use PostgreSQL over SQLite"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        required
                        autoFocus
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
                        Rationale *
                    </label>
                    <textarea
                        className="textarea"
                        placeholder="Why was this decision made?"
                        value={rationale}
                        onChange={e => setRationale(e.target.value)}
                        rows={4}
                        required
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
                        Proposed By
                    </label>
                    <input
                        className="input"
                        placeholder="Name or role"
                        value={proposedBy}
                        onChange={e => setProposedBy(e.target.value)}
                    />
                </div>

                {error && (
                    <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded-md px-3 py-2">
                        {error}
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
                        type="submit"
                        disabled={loading || !title.trim() || !rationale.trim()}
                        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-5 rounded-md transition-colors shadow-[0_0_15px_rgba(92,129,163,0.3)] flex items-center gap-2 text-sm"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Create Decision
                    </button>
                </div>
            </form>
        </Modal>
    );
}
