import Link from 'next/link';
import { Radar, ShieldCheck, ArrowLeft } from 'lucide-react';
import CookieConsent from '@/components/CookieConsent';

export default function PolicyShell({
    title,
    subtitle,
    updatedAt,
    children,
}: {
    title: string;
    subtitle: string;
    updatedAt: string;
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#05070f] text-white relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-500/15 blur-[130px] rounded-full" />
                <div className="absolute bottom-0 -right-40 w-[400px] h-[400px] bg-blue-600/15 blur-[120px] rounded-full" />
            </div>

            <div className="relative max-w-3xl mx-auto px-6">
                <nav className="pt-8 pb-10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                            <Radar className="w-5 h-5 text-white" />
                        </div>
                        <div className="leading-tight">
                            <div className="font-semibold">MCinfraTI</div>
                            <div className="text-[10px] text-cyan-400 uppercase tracking-widest">Radar Security</div>
                        </div>
                    </div>
                    <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition">
                        <ArrowLeft className="w-4 h-4" /> Voltar ao início
                    </Link>
                </nav>

                <header className="mb-12">
                    <div className="flex items-center gap-2 text-cyan-400 text-sm mb-3">
                        <ShieldCheck className="w-4 h-4" /> Conformidade · Lei nº 13.709/2018 (LGPD)
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
                    <p className="text-gray-500 mt-2">{subtitle}</p>
                    <p className="text-xs text-gray-600 mt-3">Última atualização: {updatedAt}</p>
                </header>

                <article className="space-y-8 pb-20">{children}</article>

                <footer className="border-t border-white/5 py-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-500">
                    <Link href="/privacidade" className="hover:text-cyan-300 transition">Política de Privacidade</Link>
                    <Link href="/cookies" className="hover:text-cyan-300 transition">Política de Cookies</Link>
                    <Link href="/termos" className="hover:text-cyan-300 transition">Termos de Uso</Link>
                    <span className="text-gray-600">MCinfraTI · Radar Security © 2026</span>
                </footer>
            </div>
            <CookieConsent />
        </div>
    );
}