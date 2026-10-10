'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Series {
    day: string;
    scans: number;
    avgScore: number;
    avgDurationMs: number;
    failures: number;
    domains: number;
}

interface Totals {
    totalScans: number;
    totalDomains: number;
    uniqueLeads: number;
    avgScore: number;
    failures: number;
}

export default function AdminRelatorios() {
    const [series, setSeries] = useState<Series[]>([]);
    const [totals, setTotals] = useState<Totals | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/relatorios')
            .then((r) => r.json())
            .then((d) => {
                setSeries(d.series || []);
                setTotals(d.totals);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const maxScans = Math.max(1, ...series.map((s) => s.scans));
    const chart = [...series].reverse();

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
                <p className="text-gray-500 mt-1">Volume de análises, evolução de score e falhas por dia.</p>
            </header>

            {loading ? (
                <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : (
                <>
                    <section className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {[
                            { label: 'Total de análises', value: totals?.totalScans ?? 0 },
                            { label: 'Domínios únicos', value: totals?.totalDomains ?? 0 },
                            { label: 'Leads únicos', value: totals?.uniqueLeads ?? 0 },
                            { label: 'Score médio', value: totals?.avgScore ?? 0, suffix: '/100' },
                            { label: 'Falhas', value: totals?.failures ?? 0 },
                        ].map((s) => (
                            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                                <div className="text-2xl font-bold">{s.value}{s.suffix && <span className="text-sm text-gray-500 font-normal"> {s.suffix}</span>}</div>
                                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                            </div>
                        ))}
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                        <h2 className="font-semibold mb-6 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-cyan-400" /> Análises por dia
                        </h2>
                        {chart.length === 0 ? (
                            <p className="text-sm text-gray-500">Sem dados para exibir.</p>
                        ) : (
                            <div className="flex items-end gap-2 h-48">
                                {chart.map((d) => (
                                    <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group">
                                        <div className="relative w-full flex-1 flex items-end">
                                            <div
                                                className="w-full rounded-t-lg bg-gradient-to-t from-cyan-600/40 to-cyan-400/80 group-hover:from-cyan-600/60 group-hover:to-cyan-300 transition-all"
                                                style={{ height: `${(d.scans / maxScans) * 100}%` }}
                                                title={`${d.scans} análises`}
                                            />
                                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/80 text-[10px] text-cyan-300 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                                                {d.scans} · score {d.avgScore}
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-gray-600">
                                            {format(new Date(d.day), 'dd/MM', { locale: ptBR })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-widest text-gray-500 border-b border-white/10">
                                    <th className="px-5 py-3">Dia</th>
                                    <th className="px-5 py-3">Domínios</th>
                                    <th className="px-5 py-3 text-center">Análises</th>
                                    <th className="px-5 py-3 text-center">Score médio</th>
                                    <th className="px-5 py-3 text-center">Tempo médio</th>
                                    <th className="px-5 py-3 text-center">Falhas</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {series.map((d) => (
                                    <tr key={d.day}>
                                        <td className="px-5 py-3">{format(new Date(d.day), 'dd/MM/yyyy', { locale: ptBR })}</td>
                                        <td className="px-5 py-3 text-gray-400">{d.domains}</td>
                                        <td className="px-5 py-3 text-center font-semibold">{d.scans}</td>
                                        <td className="px-5 py-3 text-center">{d.avgScore}</td>
                                        <td className="px-5 py-3 text-center">{(d.avgDurationMs / 1000).toFixed(1)}s</td>
                                        <td className="px-5 py-3 text-center text-red-400">{d.failures}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </>
            )}
        </div>
    );
}