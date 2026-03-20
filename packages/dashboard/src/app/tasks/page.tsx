'use client';
import useSWR from 'swr';
import { Task } from '@patchbay/core';
import { Play, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { NewTaskModal } from '@/components/NewTaskModal';
import { DispatchDialog } from '@/components/DispatchDialog';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function TasksBoard() {
    const { data, error, isLoading, mutate } = useSWR('/api/state', fetcher, { refreshInterval: 2000 });
    const [showNewTask, setShowNewTask] = useState(false);
    const [dispatchTarget, setDispatchTarget] = useState<{ id: string; title: string; status: string } | null>(null);
    const [statusMenu, setStatusMenu] = useState<string | null>(null);

    if (isLoading) return <div className="p-8 text-surface-400">Loading tasks...</div>;
    if (error) return <div className="p-8 text-red-400">Error connecting to backend</div>;

    const tasks: Task[] = data?.tasks || [];

    const columns = [
        { id: 'open', title: 'Open', color: 'border-surface-600' },
        { id: 'in_progress', title: 'In Progress', color: 'border-blue-500' },
        { id: 'awaiting_input', title: 'Awaiting Reply', color: 'border-purple-500' },
        { id: 'blocked', title: 'Blocked', color: 'border-red-500' },
        { id: 'review', title: 'Review', color: 'border-yellow-500' },
        { id: 'done', title: 'Done', color: 'border-green-500' },
    ];

    const changeStatus = async (taskId: string, newStatus: string) => {
        setStatusMenu(null);
        await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: taskId, status: newStatus }),
        });
        mutate();
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500 h-full flex flex-col">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Task Board</h1>
                    <p className="text-surface-400">Manage and orchestrate agent tasks.</p>
                </div>
                <button
                    onClick={() => setShowNewTask(true)}
                    className="bg-brand-500 hover:bg-brand-600 text-white font-medium py-2 px-4 rounded-md transition-colors shadow-[0_0_15px_rgba(92,129,163,0.3)]"
                >
                    New Task
                </button>
            </header>

            <div className="flex-1 flex gap-6 overflow-x-auto pb-4">
                {columns.map(col => {
                    const colTasks = tasks.filter(t => t.status === col.id);
                    return (
                        <div key={col.id} className="w-80 flex-shrink-0 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full border-2 ${col.color} bg-background`} />
                                    <h3 className="font-medium text-surface-200">{col.title}</h3>
                                </div>
                                <span className="text-xs font-medium text-surface-500 bg-surface-900 px-2 py-0.5 rounded-full">
                                    {colTasks.length}
                                </span>
                            </div>

                            <div className="flex-1 space-y-3">
                                {colTasks.map(task => (
                                    <div key={task.id} className="glass-card rounded-lg p-4 border border-surface-800/50 hover:border-surface-600 transition-colors group relative">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-brand-500/0 group-hover:bg-brand-500/50 transition-colors" />
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-mono text-surface-400 bg-surface-900/50 px-1.5 py-0.5 rounded">
                                                {task.id}
                                            </span>
                                            {task.owner && (
                                                <div className="w-5 h-5 rounded-full bg-brand-900 flex items-center justify-center text-[10px] text-brand-300 border border-brand-700" title={task.owner}>
                                                    {task.owner.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <h4 className="text-sm font-medium text-white mb-2 leading-relaxed">
                                            {task.title}
                                        </h4>
                                        {task.goal && (
                                            <p className="text-xs text-surface-400 line-clamp-2 mb-3">
                                                {task.goal}
                                            </p>
                                        )}
                                        <div className="flex justify-between items-center text-xs text-surface-500">
                                            <span>{task.affectedFiles?.length || 0} files</span>
                                            <div className="flex gap-1.5">
                                                {/* Dispatch/Reply button */}
                                                {(task.status === 'open' || task.status === 'blocked' || task.status === 'awaiting_input') && (
                                                    <button
                                                        onClick={() => setDispatchTarget({ id: task.id, title: task.title, status: task.status })}
                                                        className="p-1.5 rounded-md text-brand-400 hover:bg-brand-950/50 hover:text-brand-300 transition-colors"
                                                        title={task.status === 'awaiting_input' ? 'Reply to runner' : 'Run task'}
                                                    >
                                                        <Play className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {/* Status change menu */}
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setStatusMenu(statusMenu === task.id ? null : task.id)}
                                                        className="p-1.5 rounded-md text-surface-400 hover:bg-surface-800 hover:text-surface-200 transition-colors"
                                                        title="Change status"
                                                    >
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                    </button>
                                                    {statusMenu === task.id && (
                                                        <div className="absolute right-0 top-8 z-50 min-w-[140px] glass-card rounded-lg border border-surface-700 py-1 shadow-xl">
                                                            {columns
                                                                .filter(c => c.id !== task.status)
                                                                .map(c => (
                                                                    <button
                                                                        key={c.id}
                                                                        onClick={() => changeStatus(task.id, c.id)}
                                                                        className="w-full text-left px-3 py-1.5 text-xs text-surface-300 hover:bg-surface-800 hover:text-white transition-colors flex items-center gap-2"
                                                                    >
                                                                        <div className={`w-1.5 h-1.5 rounded-full border ${c.color}`} />
                                                                        {c.title}
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {colTasks.length === 0 && (
                                    <div className="border border-dashed border-surface-800 rounded-lg h-24 flex items-center justify-center">
                                        <p className="text-xs text-surface-600">No tasks</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <NewTaskModal
                open={showNewTask}
                onClose={() => setShowNewTask(false)}
                onCreated={() => mutate()}
            />

            {dispatchTarget && (
                <DispatchDialog
                    open={!!dispatchTarget}
                    onClose={() => setDispatchTarget(null)}
                    taskId={dispatchTarget.id}
                    taskTitle={dispatchTarget.title}
                    taskStatus={dispatchTarget.status}
                    onDispatched={() => mutate()}
                />
            )}
        </div>
    );
}
