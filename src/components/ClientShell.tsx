'use client';

import { signOut } from 'next-auth/react';
import { Radar, LogOut } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

export default function ClientShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[#05070f] text-white">
            <header className="border-b border-white/10 bg-black/30 sticky top-0 z-50 backdrop-blur">
                <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                            <Radar className="w-5 h-5" />
                        </div>
                        <div className="leading-tight">
                            <div className="font-semibold">MCinfraTI</div>
                            <div className="text-[10px] text-cyan-400 uppercase tracking-widest">Área do Cliente</div>
                        </div>
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className="flex items-center gap-2 text-sm text-red-400 hover:bg-red-400/10 px-3 py-2 rounded-xl transition"
                    >
                        <LogOut className="w-4 h-4" /> Sair
                    </button>
                </div>
            </header>
            <main className="max-w-4xl mx-auto px-6 py-10">{children}</main>
            <footer className="border-t border-white/10 py-5">
                <div className="max-w-4xl mx-auto px-6 flex items-center justify-center text-[10px] uppercase tracking-widest text-gray-600 select-none">
                    {APP_VERSION}
                </div>
            </footer>
        </div>
    );
}