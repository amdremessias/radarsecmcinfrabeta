'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Radar, Loader2, Lock, Mail, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const callbackUrl = searchParams.get('callbackUrl') || '/admin';

    // Usuário com nível 'cliente' é direcionado à sua área pelo middleware;
    // este fallback cobre acesso direto.
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });
            if (res?.error) {
                throw new Error('Credenciais inválidas ou usuário inativo.');
            }
            router.push(callbackUrl);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#05070f] text-white relative overflow-hidden flex items-center justify-center px-6">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-cyan-500/20 blur-[130px] rounded-full" />
                <div className="absolute bottom-0 -right-40 w-[400px] h-[400px] bg-blue-600/20 blur-[120px] rounded-full" />
            </div>

            <div className="relative w-full max-w-md">
                <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white mb-6 transition">
                    <ArrowLeft className="w-4 h-4" /> Voltar ao início
                </Link>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-8 shadow-2xl shadow-black/40 relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 mb-4">
                            <Radar className="w-7 h-7" />
                        </div>
                        <h1 className="text-2xl font-bold">MCinfraTI</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Radar Security · Acesso Restrito
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="block text-xs uppercase tracking-widest text-gray-500">E-mail</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="admin@radar.local"
                                    className="w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 py-3 text-sm outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-xs uppercase tracking-widest text-gray-500">Senha</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••••"
                                    className="w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 py-3 text-sm outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                />
                            </div>
                        </div>

                        {error && (
                            <p className="text-sm text-red-400 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3.5 font-semibold shadow-lg shadow-cyan-500/25 hover:brightness-110 disabled:opacity-50 transition flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-4 h-4" />}
                            Entrar no painel
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}