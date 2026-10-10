'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';

const CONSENT_KEY = 'mcinfrati_radar_consent';

export default function CookieConsent() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        try {
            if (localStorage.getItem(CONSENT_KEY)) return;
        } catch {}

        const t = setTimeout(() => setVisible(true), 1200);
        return () => clearTimeout(t);
    }, []);

    function decide(choice: 'todos' | 'essenciais') {
        try {
            localStorage.setItem(CONSENT_KEY, choice);
        } catch {}
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div
            role="dialog"
            aria-live="polite"
            aria-label="Consentimento de cookies"
            className="fixed bottom-0 inset-x-0 z-[100] p-4"
        >
            <div className="max-w-4xl mx-auto rounded-2xl border border-white/10 bg-[#0a1120]/95 backdrop-blur-xl p-5 sm:p-6 shadow-2xl shadow-black/50">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center shrink-0">
                        <Cookie className="w-5 h-5 text-cyan-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="font-semibold text-white">Privacidade e Cookies</h2>
                            <button
                                onClick={() => decide('essenciais')}
                                className="text-gray-500 hover:text-white transition"
                                aria-label="Fechar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">
                            A MCinfraTI utiliza cookies essenciais para o funcionamento da plataforma e o registro
                            do seu consentimento em conformidade com a <strong className="text-gray-300">LGPD</strong>.
                            Dados informados no formulário são usados apenas para análise e contato comercial.
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-4">
                            <button
                                onClick={() => decide('todos')}
                                className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 hover:brightness-110 transition"
                            >
                                Aceitar todos
                            </button>
                            <button
                                onClick={() => decide('essenciais')}
                                className="rounded-xl border border-white/15 px-5 py-2.5 text-sm text-gray-300 hover:bg-white/5 transition"
                            >
                                Apenas essenciais
                            </button>
                            <div className="flex items-center gap-3 text-xs text-cyan-300/80">
                                <Link href="/privacidade" className="hover:text-cyan-200 underline underline-offset-2">
                                    Política de Privacidade
                                </Link>
                                <span className="text-gray-600">·</span>
                                <Link href="/cookies" className="hover:text-cyan-200 underline underline-offset-2">
                                    Política de Cookies
                                </Link>
                                <span className="text-gray-600">·</span>
                                <Link href="/termos" className="hover:text-cyan-200 underline underline-offset-2">
                                    Termos de Uso
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}