'use client';
import useSWR from 'swr';
import { Decision } from '@patchbay/core';
import { Network, Search, Plus } from 'lucide-react';
import { useState, useMemo } from 'react';
import { NewDecisionModal } from '@/components/NewDecisionModal';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function DecisionsLog() {
    const { data, error, isLoading, mutate } = useSWR('/api/state', fetcher, { refreshInterval: 2000 });
    const [showNewDecision, setShowNewDecision] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const decisions: Decision[] = useMemo(() => {
        const list: Decision[] = data?.decisions || [];
        return [...list].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [data]);

    const filteredDecisions = useMemo(() => {
        if (!searchQuery.trim()) return decisions;
        const q = searchQuery.toLowerCase();
        return decisions.filter(d =>
            d.title.toLowerCase().includes(q) ||
            d.rationale.toLowerCase().includes(q) ||
            d.id.toLowerCase().includes(q) ||
            d.proposedBy?.toLowerCase().includes(q)
        );
    }, [decisions, searchQuery]);

    if (isLoading) return <div className="p-8 text-surface-400">Loading decisions...</div>;
    if (error) return <div className="p-8 text-red-400">Error connecting to backend</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 h-full flex flex-col">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Decisions Log</h1>
                    <p className="text-surface-400">Record of technical decisions and architectural choices.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search decisions..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="bg-surface-900 border border-surface-800 text-sm text-surface-200 rounded-md pl-9 pr-4 py-2 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                        />
                    </div>
                    <button
                        onClick={() => setShowNewDecision(true)}
                        className="bg-brand-500 hover:bg-brand-600 text-white font-medium py-2 px-4 rounded-md transition-colors shadow-[0_0_15px_rgba(92,129,163,0.3)] flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        New Decision
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDecisions.length === 0 ? (
                    <div className="col-span-full glass-card rounded-xl border border-surface-800 p-12 flex flex-col items-center justify-center text-center">
                        <Network className="w-12 h-12 text-surface-700 mb-4" />
                        <h3 className="text-lg font-medium text-surface-300">
                            {searchQuery ? 'No matching decisions' : 'No decisions logged'}
                        </h3>
                        <p className="text-sm text-surface-500 mt-1">
                            {searchQuery ? 'Try a different search term.' : 'Document important architectural choices here.'}
                        </p>
                    </div>
                ) : (
                    filteredDecisions.map(decision => (
                        <div key={decision.id} className="glass-card rounded-xl border border-surface-800/50 p-6 flex flex-col group hover:border-surface-600 transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <span className="text-xs font-mono text-brand-400 bg-brand-950/50 px-2 py-0.5 rounded border border-brand-900/50">
                                    {decision.id}
                                </span>
                                <span className="text-xs text-surface-500">
                                    {new Date(decision.timestamp).toLocaleDateString()}
                                </span>
                            </div>
                            <h3 className="text-lg font-medium text-white mb-3">
                                {decision.title}
                            </h3>
                            <p className="text-sm text-surface-300 font-light leading-relaxed flex-1">
                                {decision.rationale}
                            </p>

                            <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-surface-800/50 text-xs text-surface-500">
                                {decision.proposedBy && (
                                    <div><span className="text-surface-600">Proposed:</span> {decision.proposedBy}</div>
                                )}
                                {decision.approvedBy && (
                                    <div><span className="text-surface-600">Approved:</span> {decision.approvedBy}</div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <NewDecisionModal
                open={showNewDecision}
                onClose={() => setShowNewDecision(false)}
                onCreated={() => mutate()}
            />
        </div>
    );
}
