'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { APP_VERSION } from '@/lib/version';
import {
    Radar,
    LayoutDashboard,
    Users,
    Building2,
    Activity,
    BarChart3,
    LifeBuoy,
    UserCog,
    LogOut,
    ArrowLeft,
    FileCode2,
    Search,
    Globe,
} from 'lucide-react';

const tabs = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/leads', label: 'Leads', icon: Users },
    { href: '/admin/clientes', label: 'Clientes', icon: Building2 },
    { href: '/admin/analises', label: 'Análises', icon: Activity },
    { href: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
    { href: '/admin/contingency', label: 'Contingência', icon: LifeBuoy },
    { href: '/admin/deep-analysis', label: 'Análise Profunda', icon: FileCode2 },
    { href: '/admin/osint', label: 'OSINT / Username Tracker', icon: Search },
    { href: '/admin/harvest', label: 'OSINT / Domain Recon', icon: Globe },
];

export default function AdminShell({
    children,
    role,
}: {
    children: React.ReactNode;
    role?: string;
}) {
    const pathname = usePathname();
    const canManageUsers = role === 'admin' || role === 'superadmin';
    const visibleTabs = canManageUsers
        ? [...tabs, { href: '/admin/users', label: 'Usuários', icon: UserCog }]
        : tabs;

    return (
        <div className="min-h-screen bg-[#05070f] text-white flex">
            <aside className="w-64 shrink-0 border-r border-white/10 bg-black/30 flex flex-col">
                <div className="px-5 py-6 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                            <Radar className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="font-semibold leading-tight">
                                MCinfraTI<span className="text-cyan-400"> · Radar Security</span>
                            </div>
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">
                                {canManageUsers ? 'Admin Console' : 'Painel da Equipe'}
                            </div>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-3 py-5 space-y-1">
                    {visibleTabs.map((tab) => {
                        const active = pathname === tab.href || pathname?.startsWith(tab.href + '/');
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                                    active
                                        ? 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/20'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                                }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                            </Link>
                        );
                    })}
                </nav>

                <div className="px-3 py-5 border-t border-white/10 space-y-1">
                    <Link
                        href="/"
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition"
                    >
                        <ArrowLeft className="w-4 h-4" /> Site público
                    </Link>
                    <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition"
                    >
                        <LogOut className="w-4 h-4" /> Sair
                    </button>
                    <div className="px-3 pt-3 text-[10px] uppercase tracking-widest text-gray-600 select-none">
                        {APP_VERSION}
                    </div>
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto px-8 py-10">{children}</div>
            </main>
        </div>
    );
}