'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LayoutDashboard, CheckCircle2, PlayCircle, GitMerge, FileCode2, History, MessageSquareMore, ChevronRight } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

interface NavItem {
    label: string;
    icon: typeof LayoutDashboard;
    href: string;
}

const primaryNav: NavItem[] = [
    { label: 'Overview', icon: LayoutDashboard, href: '/' },
    { label: 'Task Board', icon: CheckCircle2, href: '/tasks' },
    { label: 'Sessions', icon: MessageSquareMore, href: '/sessions' },
];

const knowledgeNav: NavItem[] = [
    { label: 'Artifacts', icon: FileCode2, href: '/artifacts' },
    { label: 'Decisions', icon: GitMerge, href: '/decisions' },
];

const diagnosticNav: NavItem[] = [
    { label: 'Run Details', icon: PlayCircle, href: '/runs' },
    { label: 'Run Timeline', icon: History, href: '/history' },
];

function NavGroup({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
    return (
        <div className="mb-6">
            <h3 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wider text-surface-500">{title}</h3>
            <div className="space-y-1">
                {items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`group relative flex items-center justify-between overflow-hidden rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ${
                                isActive
                                    ? 'bg-brand-950/45 text-brand-100'
                                    : 'text-surface-400 hover:bg-surface-900/50 hover:text-surface-100'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`absolute inset-y-0 left-0 w-1 bg-brand-400 transform transition-transform duration-300 ${isActive ? 'translate-x-0 shadow-[0_0_12px_rgba(76,196,234,0.45)]' : '-translate-x-full group-hover:translate-x-0 group-hover:bg-surface-600'}`} />
                                <item.icon className={`h-4 w-4 ${isActive ? 'text-brand-400' : 'text-surface-500 group-hover:text-surface-300'}`} />
                                {item.label}
                            </div>
                            {isActive ? <ChevronRight className="h-3.5 w-3.5 text-brand-500/50" /> : null}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        for (const item of [...primaryNav, ...knowledgeNav, ...diagnosticNav]) {
            router.prefetch(item.href);
        }
    }, [router]);

    return (
        <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-surface-800/90 bg-[linear-gradient(180deg,rgba(8,11,16,0.96)_0%,rgba(13,17,23,0.92)_100%)] shadow-[16px_0_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <div className="p-6 flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-300 via-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30 ring-1 ring-brand-200/10">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                </div>
                <div>
                    <h1 className="text-lg font-semibold tracking-tight text-surface-50">Patchbay</h1>
                    <p className="text-xs text-brand-200">Agent Orchestration</p>
                </div>
            </div>

            <nav className="flex-1 px-3 overflow-y-auto">
                <NavGroup title="Workflow" items={primaryNav} pathname={pathname} />
                <NavGroup title="Knowledge Base" items={knowledgeNav} pathname={pathname} />
                <NavGroup title="Diagnostics" items={diagnosticNav} pathname={pathname} />
            </nav>

            <div className="p-4 border-t border-surface-900/50 bg-surface-950/30">
                <div className="flex items-center gap-3 px-2 py-1">
                    <div className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500"></span>
                    </div>
                    <span className="text-xs font-medium text-surface-300">System Online</span>
                </div>
            </div>
        </aside>
    );
}
