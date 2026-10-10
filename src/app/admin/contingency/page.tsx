'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LifeBuoy, Loader2, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PlanItem {
    id: string;
    titulo: string;
    prioridade: 'alta' | 'media' | 'baixa';
    categoria: string;
    acoes: string[];
    status: 'pendente' | 'em_andamento' | 'concluida';
}

interface Plan {
    scanId: string;
    domain: string;
    score: number;
    grade: string;
    createdAt: string;
    plan: {
        dominio: string;
        score: number;
        nota: string;
        resumo: string;
        plano: PlanItem[];
    };
    ownerName: string;
    ownerCompany: string;
    clienteId: number;
}

const priorityColor: Record<string, string> = {
    alta: 'bg-red-400/10 text-red-300 border-red-400/20',
    media: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    baixa: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
};

const statusConfig: Record<string, { icon: any; className: string }> = {
    pendente: { icon: AlertCircle, className: 'text-gray-500 border-white/10 bg-white/5' },
    em_andamento: { icon: Clock, className: 'text-amber-300 border-amber-400/20 bg-amber-400/10' },
    concluida: { icon: CheckCircle2, className: 'text-emerald-300 border-emerald-400/20 bg-emerald-400/10' },
};

function ContingencyList() {
    const searchParams = useSearchParams();
    const domainFilter = searchParams.get('domain') || '';
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback((domain?: string) => {
        const q = domain ? `?domain=${encodeURIComponent(domain)}` : '';
        fetch('/api/admin/contingency' + q)
            .then((r) => r.json())
            .then((d) => setPlans(d.plans || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load(domainFilter || undefined);
    }, [load, domainFilter]);

    async function updateStatus(scanId: string, itemId: string, status: string) {
        await fetch('/api/admin/contingency', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scanId, itemId, status }),
        });
        load(domainFilter || undefined);
    }

    const uniqueDomains = Array.from(new Set(plans.map((p) => p.domain))).sort();
    const selectedDomain = domainFilter || '';

    if (loading) {
        return <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando planos...</div>;
    }

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Planos de Contingência</h1>
                <p className="text-gray-500 mt-1">Planos gerados automaticamente a partir de cada análise.</p>
            </header>

            {uniqueDomains.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    {uniqueDomains.map((d) => {
                        const active = d === selectedDomain;
                        return (
                            <button
                                key={d}
                                onClick={() => (window.location.href = active ? '/admin/contingency' : `/admin/contingency?domain=${encodeURIComponent(d)}`)}
                                className={`px-3.5 py-1.5 rounded-lg text-sm transition ${
                                    active
                                        ? 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/30'
                                        : 'text-gray-500 border border-white/10 hover:text-white'
                                }`}
                            >
                                {d}
                            </button>
                        );
                    })}
                </div>
            )}

            {plans.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-gray-500">
                    <LifeBuoy className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                    Nenhum plano de contingência gerado ainda.
                </div>
            ) : (
                <div className="space-y-5">
                    {plans.map((p) => {
                        const expandedPlan = expanded === p.domain;
                        const done = p.plan.plano.filter((i) => i.status === 'concluida').length;
                        return (
                            <div key={p.scanId} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                                <button
                                    onClick={() => setExpanded(expandedPlan ? null : p.domain)}
                                    className="w-full flex items-center gap-4 p-5 text-left hover:bg-white/[0.02] transition"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold">{p.domain}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {p.ownerName} {p.ownerCompany && `· ${p.ownerCompany}`}{' '}
                                            · {format(new Date(p.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                                        </div>
                                    </div>
                                    <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${
                                        p.grade === 'A' || p.grade === 'B'
                                            ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
                                            : p.grade === 'C' || p.grade === 'D'
                                              ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
                                              : 'text-red-400 border-red-400/40 bg-red-400/10'
                                    }`}>
                                        {p.grade} · {p.score}
                                    </span>
                                    <span className="text-xs text-gray-500 shrink-0">
                                        {done}/{p.plan.plano.length} concluídas
                                    </span>
                                </button>

                                {expandedPlan && (
                                    <div className="px-5 pb-5 space-y-4">
                                        <p className="text-sm text-gray-400 bg-black/20 rounded-xl p-4 border border-white/5">
                                            {p.plan.resumo}
                                        </p>
                                        <div className="grid md:grid-cols-2 gap-3">
                                            {p.plan.plano.map((item) => {
                                                const sc = statusConfig[item.status] || statusConfig.pendente;
                                                return (
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
                                                                <select
                                                                    value={item.status}
                                                                    onChange={(e) => updateStatus(p.scanId, item.id, e.target.value)}
                                                                    className={`px-2 py-1 rounded-lg text-xs outline-none border ${sc.className}`}
                                                                >
                                                                    <option value="pendente">Pendente</option>
                                                                    <option value="em_andamento">Em andamento</option>
                                                                    <option value="concluida">Concluída</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <ul className="space-y-1.5">
                                                            {item.acoes.map((a, i) => (
                                                                <li key={i} className="flex gap-2 text-xs text-gray-400">
                                                                    <span className="text-cyan-400 shrink-0">›</span>
                                                                    {a}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function AdminContingency() {
    return (
        <Suspense>
            <ContingencyList />
        </Suspense>
    );
}