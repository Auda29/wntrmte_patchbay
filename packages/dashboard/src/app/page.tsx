'use client';
import useSWR from 'swr';
import { Project, Task, Run } from '@patchbay/core';
import { Activity, GitMerge, FileCode2, CheckCircle2, Clock } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function DashboardHome() {
  const { data, error, isLoading } = useSWR('/api/state', fetcher, { refreshInterval: 2000 });

  if (isLoading) return <div className="p-8 text-surface-400">Loading live data...</div>;
  if (error) return <div className="p-8 text-red-400">Error connecting to Patchbay backend</div>;

  const projectOptions: Project | undefined = data?.project;
  const tasks: Task[] = data?.tasks || [];
  const runs: Run[] = data?.runs || [];

  const activeTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'review');
  const openTasks = tasks.filter(t => t.status === 'open');
  const blockedTasks = tasks.filter(t => t.status === 'blocked');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">Dashboard</h1>
        <p className="text-surface-400">
          {data?.project
            ? `Connected to ${projectOptions?.name || 'Project'}`
            : 'Patchbay is not initialized in the target repository.'}
        </p>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Active Tasks"
          value={activeTasks.length.toString()}
          icon={Activity}
          trend="+2 since yesterday"
          color="text-blue-400"
        />
        <StatCard
          title="Open Tasks"
          value={openTasks.length.toString()}
          icon={CheckCircle2}
          color="text-surface-300"
        />
        <StatCard
          title="Blocked"
          value={blockedTasks.length.toString()}
          icon={Clock}
          color="text-red-400"
        />
        <StatCard
          title="Total Runs"
          value={runs.length.toString()}
          icon={GitMerge}
          color="text-brand-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Project Details */}
        <div className="lg:col-span-2 space-y-6">
          <section className="glass-card rounded-xl p-6 border border-surface-900/50 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all duration-500 group-hover:bg-brand-500/20" />
            <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <FileCode2 className="w-5 h-5 text-brand-400" />
              Project Goal
            </h2>
            <p className="text-surface-300 leading-relaxed font-light">
              {projectOptions?.goal || 'No goal defined.'}
            </p>

            {projectOptions?.techStack && (
              <div className="mt-6 flex flex-wrap gap-2">
                {projectOptions.techStack.map(tech => (
                  <span key={tech} className="px-2.5 py-1 rounded-md bg-surface-900/50 border border-surface-800 text-xs font-medium text-surface-300">
                    {tech}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-4">Recent Runs</h2>
            <div className="space-y-3">
              {runs.length === 0 ? (
                <div className="glass-card rounded-xl p-8 text-center border border-surface-900/50">
                  <p className="text-surface-500 text-sm">No task runs recorded yet.</p>
                </div>
              ) : (
                runs.slice(0, 5).map(run => (
                  <div key={run.id} className="glass border border-surface-900/50 rounded-lg p-4 flex items-center justify-between group hover:bg-surface-900/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${run.status === 'completed' ? 'bg-green-500' : run.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'}`} />
                      <div>
                        <h4 className="text-sm font-medium text-surface-200">{run.taskId}</h4>
                        <p className="text-xs text-surface-500">{new Date(run.startTime).toLocaleString()}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-brand-400 bg-brand-950/50 px-2 py-1 rounded border border-brand-900/50">
                      {run.runner}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Sidebar / Rules */}
        <div className="space-y-6">
          <section className="glass rounded-xl p-6 border border-surface-900/50">
            <h2 className="text-lg font-medium text-white mb-4">Project Rules</h2>
            <ul className="space-y-3">
              {projectOptions?.rules?.length ? projectOptions.rules.map((rule, idx) => (
                <li key={idx} className="text-sm text-surface-300 flex gap-3">
                  <span className="text-brand-500 mt-0.5">•</span>
                  <span className="font-light leading-relaxed">{rule}</span>
                </li>
              )) : (
                <p className="text-surface-500 text-sm">No rules defined.</p>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color }: any) {
  return (
    <div className="glass-card rounded-xl p-6 border border-surface-900/50 relative overflow-hidden group hover:border-surface-700 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <p className="text-sm font-medium text-surface-400">{title}</p>
        <div className={`p-2 rounded-md bg-surface-900/50 ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <h3 className="text-3xl font-semibold text-white tracking-tight">{value}</h3>
      {trend && (
        <p className="text-xs text-surface-500 mt-2 font-medium">{trend}</p>
      )}
      <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-transparent via-surface-800 to-transparent transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
    </div>
  );
}
