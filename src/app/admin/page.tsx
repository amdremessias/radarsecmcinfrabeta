'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Globe, Gauge, AlertTriangle, TrendingUp, Bug, CalendarDays, CheckCircle2, Timer } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashData {
    totals: {
        totalScans: number;
        totalDomains: number;
        failedScans: number;
        completedScans: number;
        avgScore: number;
        criticalScans: number;
        weekScans: number;
        vulnerabilityCount: number;
        avgDurationMs: number;
        successRate: number;
    };
    byGrade: { grade: string; count: number }[];
    topClientes: { name: string; domain: string; score: number; grade: string }[];
    recent: { id: number; targetUrl: string; domain: string; score: number; grade: string; createdAt: string; ownerName: string }[];
}

const gradeBar: Record<string, string> = {
    A: 'bg-emerald-400',
    B: 'bg-sky-400',
    C: 'bg-amber-400',
    D: 'bg-orange-400',
    E: 'bg-red-400',
    F: 'bg-red-500',
};

export default function AdminDashboard() {
    const [data, setData] = useState<DashData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/dashboard')
            .then((r) => r.json())
            .then(setData)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className="text-gray-500">Carregando dashboard...</div>;
    }

    const totals = data?.totals;
    const maxGrade = Math.max(1, ...(data?.byGrade.map((g) => g.count) ?? [1]));

    return (
        <div className="space-y-10">
            <header className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-gray-500 mt-1">Visão geral da plataforma de análise</p>
                </div>
                <Link
                    href="/admin/analises"
                    className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-400/20 transition"
                >
                    Ver análises
                </Link>
            </header>

            <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { icon: Activity, label: 'Análises realizadas', value: totals?.totalScans ?? 0 },
                    { icon: Globe, label: 'Domínios únicos', value: totals?.totalDomains ?? 0 },
                    { icon: Gauge, label: 'Score médio geral', value: totals?.avgScore ?? 0, suffix: '/100' },
                    { icon: AlertTriangle, label: 'Análises críticas (<40)', value: totals?.criticalScans ?? 0 },
                    { icon: Bug, label: 'Vulnerabilidades detectadas', value: totals?.vulnerabilityCount ?? 0 },
                    { icon: CalendarDays, label: 'Análises nos últimos 7 dias', value: totals?.weekScans ?? 0 },
                    { icon: CheckCircle2, label: 'Taxa de sucesso', value: totals?.successRate ?? 0, suffix: '%' },
                    {
                        icon: Timer,
                        label: 'Tempo médio por análise',
                        value: totals?.avgDurationMs != null ? ((totals.avgDurationMs / 1000).toFixed(1) + 's') : '—',
                    },
                ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-cyan-400/30 transition">
                        <s.icon className="w-5 h-5 text-cyan-400 mb-3" />
                        <div className="text-3xl font-bold tracking-tight">
                            {s.value}
                            {s.suffix && <span className="text-base text-gray-500 font-normal"> {s.suffix}</span>}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">{s.label}</div>
                    </div>
                ))}
            </section>

            <section className="grid lg:grid-cols-2 gap-6">
                {/* distribuição de notas */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h2 className="font-semibold mb-5 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-cyan-400" /> Distribuição por nota
                    </h2>
                    <div className="space-y-3">
                        {['A', 'B', 'C', 'D', 'E', 'F'].map((g) => {
                            const item = data?.byGrade.find((x) => x.grade === g);
                            const count = item?.count ?? 0;
                            return (
                                <div key={g} className="flex items-center gap-3">
                                    <span className="w-6 text-sm font-semibold text-gray-400">{g}</span>
                                    <div className="flex-1 h-2.5 rounded-full bg-white/5 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${gradeBar[g] || 'bg-white/20'} transition-all`}
                                            style={{ width: `${(count / maxGrade) * 100}%` }}
                                        />
                                    </div>
                                    <span className="w-8 text-right text-sm text-gray-500">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* top clientes */}
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <h2 className="font-semibold mb-5">Clientes analisados</h2>
                    {data?.topClientes.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhum cliente com análise ainda.</p>
                    ) : (
                        <div className="space-y-3">
                            {data?.topClientes.map((c) => (
                                <div key={c.domain} className="flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{c.name}</div>
                                        <div className="text-xs text-gray-500 truncate">{c.domain}</div>
                                    </div>
                                    <span
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                            c.grade === 'A' || c.grade === 'B'
                                                ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
                                                : c.grade === 'C' || c.grade === 'D'
                                                  ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
                                                  : 'text-red-400 border-red-400/40 bg-red-400/10'
                                        }`}
                                    >
                                        {c.grade} · {c.score}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* recentes */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="font-semibold mb-5">Análises recentes</h2>
                {data?.recent.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma análise registrada.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-widest text-gray-500">
                                    <th className="pb-3">Domínio</th>
                                    <th className="pb-3">Cliente</th>
                                    <th className="pb-3">Data</th>
                                    <th className="pb-3 text-right">Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {data?.recent.map((s) => (
                                    <tr key={s.id}>
                                        <td className="py-2.5"><Link href={`/scan/${s.id}`} className="hover:text-cyan-300 transition">{s.domain}</Link></td>
                                        <td className="py-2.5 text-gray-400">{s.ownerName}</td>
                                        <td className="py-2.5 text-gray-400">{format(new Date(s.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</td>
                                        <td className="py-2.5 text-right font-semibold">{s.score ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}