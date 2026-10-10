'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    Gauge,
    Loader2,
    LifeBuoy,
    Activity,
    ShieldCheck,
    AlertTriangle,
    Building2,
    Globe,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClienteData {
    cliente: {
        id: number;
        name: string;
        email: string;
        company: string;
        domain: string;
        plan: string;
        status: string;
    } | null;
    scans: {
        id: number;
        targetUrl: string;
        domain: string;
        status: string;
        score: number;
        grade: string;
        durationMs: number;
        createdAt: string;
    }[];
    latestScan: any;
    contingency: {
        scanId: string;
        score: number;
        grade: string;
        createdAt: string;
        plan: any;
    } | null;
}

const gradeBadge: Record<string, string> = {
    A: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
    B: 'text-sky-400 border-sky-400/40 bg-sky-400/10',
    C: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
    D: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
    E: 'text-red-400 border-red-400/40 bg-red-400/10',
    F: 'text-red-400 border-red-400/40 bg-red-400/10',
};

const priorityColor: Record<string, string> = {
    alta: 'bg-red-400/10 text-red-300 border-red-400/20',
    media: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    baixa: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
};

export default function ClienteDashboard() {
    const [data, setData] = useState<ClienteData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('/api/cliente')
            .then((r) => {
                if (r.status === 401 || r.status === 400) {
                    throw new Error('Sessão sem vínculo de cliente.');
                }
                return r.json();
            })
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando seus resultados...</div>;
    }
    if (error || !data) {
        return <div className="text-red-400">{error || 'Dados indisponíveis.'}</div>;
    }

    const done = data.contingency?.plan?.plano?.filter((i: any) => i.status === 'concluida').length ?? 0;
    const total = data.contingency?.plan?.plano?.length ?? 0;

    return (
        <div className="space-y-8">
            <header>
                <div className="flex items-center gap-2 text-cyan-400 text-sm mb-2">
                    <Building2 className="w-4 h-4" />
                    {data.cliente?.company || data.cliente?.name || 'Cliente'}
                </div>
                <h1 className="text-3xl font-bold tracking-tight">Resultados de segurança</h1>
                <p className="text-gray-500 mt-1">
                    {data.cliente?.domain || 'Domínio'} · plano {data.cliente?.plan}
                </p>
            </header>

            {/* score atual */}
            {data.latestScan?.score != null ? (
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex items-center gap-6">
                    <div className="relative w-28 h-28 rounded-full flex items-center justify-center shrink-0"
                        style={{
                            background: `conic-gradient(${
                                data.latestScan.score >= 80 ? '#34d399' : data.latestScan.score >= 60 ? '#38bdf8' : data.latestScan.score >= 40 ? '#fbbf24' : '#f87171'
                            } ${data.latestScan.score}%, rgba(255,255,255,0.08) 0)`,
                        }}
                    >
                        <div className="absolute inset-2 rounded-full bg-[#0a1120] flex flex-col items-center justify-center">
                            <span className="text-3xl font-bold">{data.latestScan.score}</span>
                            <span className="text-[10px] uppercase tracking-widest text-gray-500">score</span>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full border text-lg font-bold ${gradeBadge[data.latestScan.grade] || 'text-white border-white/20 bg-white/10'}`}>
                                Nota {data.latestScan.grade}
                            </span>
                            {data.latestScan.score < 60 && (
                                <span className="px-3 py-1 rounded-full border border-red-400/40 bg-red-400/10 text-red-300 text-sm flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4" /> Atenção prioritária
                                </span>
                            )}
                        </div>
                        <div className="text-sm text-gray-500">
                            Última análise em {format(new Date(data.latestScan.createdAt), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}
                        </div>
                    </div>
                </section>
            ) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-gray-500">
                    <Gauge className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                    Nenhuma análise registrada para o seu cadastro.
                </div>
            )}

            {/* plano de contingência */}
            {data.contingency && (
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="font-semibold flex items-center gap-2">
                            <LifeBuoy className="w-4 h-4 text-cyan-400" /> Plano de contingência
                        </h2>
                        <span className="text-xs text-gray-500">{done}/{total} concluídas</span>
                    </div>
                    <p className="text-sm text-gray-400 mb-5 bg-black/20 rounded-xl p-4 border border-white/5">
                        {data.contingency.plan?.resumo}
                    </p>
                    <div className="grid md:grid-cols-2 gap-3">
                        {(data.contingency.plan?.plano ?? []).map((item: any) => (
                            <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="font-medium text-sm">{item.titulo}</div>
                                        <div className="text-xs text-gray-500 capitalize mt-0.5">{item.categoria}</div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide border ${priorityColor[item.prioridade] || ''}`}>
                                            {item.prioridade}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide border ${
                                            item.status === 'concluida'
                                                ? 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
                                                : item.status === 'em_andamento'
                                                  ? 'text-amber-300 border-amber-400/30 bg-amber-400/10'
                                                  : 'text-gray-400 border-white/10 bg-white/5'
                                        }`}>
                                            {item.status}
                                        </span>
                                    </div>
                                </div>
                                <ul className="space-y-1.5">
                                    {item.acoes.map((a: string, i: number) => (
                                        <li key={i} className="flex gap-2 text-xs text-gray-400">
                                            <span className="text-cyan-400 shrink-0">›</span>
                                            {a}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* histórico dos próprios scans */}
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                <h2 className="font-semibold px-6 pt-5 pb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan-400" /> Antecedentes de análises
                </h2>
                {data.scans.length === 0 ? (
                    <div className="px-6 pb-6 text-sm text-gray-500">Nenhuma análise.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-widest text-gray-500 border-t border-white/10">
                                <th className="px-6 py-3">Domínio</th>
                                <th className="px-6 py-3">Data</th>
                                <th className="px-6 py-3 text-center">Score</th>
                                <th className="px-6 py-3 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {data.scans.map((s) => (
                                <tr key={s.id} className="hover:bg-white/[0.02]">
                                    <td className="px-6 py-3.5">
                                        <div className="flex items-center gap-2">
                                            <Globe className="w-3.5 h-3.5 text-gray-600" />
                                            {s.domain}
                                        </div>
                                    </td>
                                    <td className="px-6 py-3.5 text-gray-400">
                                        {format(new Date(s.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                                    </td>
                                    <td className="px-6 py-3.5 text-center font-bold">
                                        {s.status === 'completed' ? `${s.grade} · ${s.score}` : <span className="text-gray-500 capitalize">{s.status}</span>}
                                    </td>
                                    <td className="px-6 py-3.5 text-right">
                                        <Link href={`/scan/${s.id}`} className="text-cyan-300 hover:underline transition">
                                            Detalhes →
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-5 text-sm text-gray-400">
                <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                <p>
                    Monitoramento contínuo pela equipe MCinfraTI. Dúvidas sobre correções ou evolução do score,
                    fale com seu gestor de conta.
                </p>
            </div>
        </div>
    );
}