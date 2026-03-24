import Link from 'next/link';
import { LayoutDashboard, CheckCircle2, PlayCircle, GitMerge, FileCode2, History, MessageSquareMore } from 'lucide-react';

export function Sidebar() {
    const navItems = [
        { label: 'Overview', icon: LayoutDashboard, href: '/' },
        { label: 'Tasks', icon: CheckCircle2, href: '/tasks' },
        { label: 'Sessions', icon: MessageSquareMore, href: '/sessions' },
        { label: 'Runs', icon: PlayCircle, href: '/runs' },
        { label: 'Artifacts', icon: FileCode2, href: '/artifacts' },
        { label: 'Decisions', icon: GitMerge, href: '/decisions' },
        { label: 'History', icon: History, href: '/history' },
    ];

    return (
        <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-surface-800/90 bg-[linear-gradient(180deg,rgba(8,11,16,0.96)_0%,rgba(13,17,23,0.92)_100%)] shadow-[16px_0_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="p-6 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-300 via-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30 ring-1 ring-brand-200/10">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                </div>
                <div>
                    <h1 className="text-lg font-semibold tracking-tight text-surface-50">Patchbay</h1>
                    <p className="text-xs text-brand-200">Control Plane</p>
                </div>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-1">
                {navItems.map((item) => (
                    <Link
                        key={item.label}
                        href={item.href}
                        className="group relative flex items-center gap-3 overflow-hidden rounded-md px-3 py-2.5 text-sm font-medium text-surface-400 transition-all duration-200 hover:bg-brand-950/45 hover:text-surface-50"
                    >
                        <div className="absolute inset-y-0 left-0 w-1 bg-brand-400 transform -translate-x-full group-hover:translate-x-0 group-hover:shadow-[0_0_12px_rgba(76,196,234,0.45)] transition-transform duration-300" />
                        <item.icon className="w-4 h-4" />
                        {item.label}
                    </Link>
                ))}
            </nav>

            <div className="p-4 border-t border-surface-900/50">
                <div className="glass-card rounded-lg p-4 space-y-2">
                    <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">Status</p>
                    <div className="flex items-center gap-2">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-brand-400 shadow-[0_0_10px_rgba(72,214,255,0.7)]" />
                        <span className="text-sm text-surface-200">System Online</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
