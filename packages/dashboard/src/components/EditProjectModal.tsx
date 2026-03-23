'use client';
import { useEffect, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { Modal } from './Modal';
import { Project } from '@patchbay/core';

interface EditProjectModalProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    project?: Project;
}

export function EditProjectModal({ open, onClose, onSaved, project }: EditProjectModalProps) {
    const [goal, setGoal] = useState('');
    const [rules, setRules] = useState('');
    const [techStack, setTechStack] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!open) {
            return;
        }

        setGoal(project?.goal ?? '');
        setRules((project?.rules ?? []).join('\n'));
        setTechStack((project?.techStack ?? []).join(', '));
        setError('');
    }, [open, project]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('/api/project', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    goal,
                    rules: rules.split('\n').map((entry) => entry.trim()).filter(Boolean),
                    techStack: techStack.split(',').map((entry) => entry.trim()).filter(Boolean),
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update project');
            }

            onSaved();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Edit Project">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
                        Goal
                    </label>
                    <textarea
                        className="textarea"
                        placeholder="What should this project achieve?"
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        rows={4}
                        autoFocus
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
                        Rules
                    </label>
                    <textarea
                        className="textarea"
                        placeholder="One rule per line"
                        value={rules}
                        onChange={(e) => setRules(e.target.value)}
                        rows={5}
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5">
                        Tech Stack
                    </label>
                    <input
                        className="input"
                        placeholder="Node.js, TypeScript, Next.js"
                        value={techStack}
                        onChange={(e) => setTechStack(e.target.value)}
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
                        disabled={loading}
                        className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-5 rounded-md transition-colors shadow-[0_0_15px_rgba(92,129,163,0.3)] flex items-center gap-2 text-sm"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </form>
        </Modal>
    );
}
