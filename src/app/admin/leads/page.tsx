'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Filter, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Lead {
    id: number;
    name: string;
    email: string;
    phone: string;
    company: string;
    targetUrl: string;
    status: string;
    notes: string;
    consultingAt: string;
    createdAt: string;
    score: number;
    grade: string;
    scanAt: string;
}

const statuses = ['todos', 'novo', 'contato', 'negocio', 'cliente', 'consultoria', 'descartado'];

const statusColor: Record<string, string> = {
    novo: 'bg-cyan-400/10 text-cyan-300 border-cyan-400/20',
    contato: 'bg-blue-400/10 text-blue-300 border-blue-400/20',
    negocio: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    cliente: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20',
    descartado: 'bg-gray-400/10 text-gray-400 border-white/10',
};

export default function AdminLeads() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('todos');
    const [updating, setUpdating] = useState<number | null>(null);

    const load = useCallback(() => {
        fetch('/api/admin/leads')
            .then((r) => r.json())
            .then((d) => setLeads(d.leads || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function changeStatus(id: number, status: string) {
        setUpdating(id);
        try {
            await fetch('/api/admin/leads', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status }),
            });
            load();
        } finally {
            setUpdating(null);
        }
    }

    async function remove(id: number) {
        if (!confirm('Excluir este lead?')) return;
        await fetch('/api/admin/leads', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        load();
    }

    const filtered = filter === 'todos'
        ? leads
        : filter === 'consultoria'
          ? leads.filter((l) => l.consultingAt)
          : leads.filter((l) => l.status === filter);

    return (
        <div className="space-y-8">
            <header>
                <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
                <p className="text-gray-500 mt-1">Cada lead registrado no site captura uma análise automática.</p>
            </header>

            <div className="flex items-center gap-3 flex-wrap">
                <Filter className="w-4 h-4 text-gray-500" />
                {statuses.map((s) => (
                    <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={`px-3 py-1.5 rounded-lg text-sm capitalize transition ${
                            filter === s
                                ? 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/30'
                                : 'text-gray-500 border border-white/10 hover:text-white'
                        }`}
                    >
                        {s}
                    </button>
                ))}
                <span className="ml-auto text-sm text-gray-500">{filtered.length} leads</span>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-gray-500">
                    <Users className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                    Nenhum lead {filter !== 'todos' && `com status "${filter}"`}.
                </div>
            ) : (
                <div className="grid md:grid-cols-2 gap-4">
                    {filtered.map((lead) => (
                        <div key={lead.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="font-semibold truncate">{lead.name}</div>
                                    <div className="text-sm text-gray-500 truncate">{lead.email}</div>
                                    {lead.company && <div className="text-xs text-gray-600 truncate">{lead.company}</div>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`px-2.5 py-1 rounded-lg text-xs capitalize border ${statusColor[lead.status] || 'bg-white/10 text-gray-400 border-white/10'}`}>
                                        {lead.status}
                                    </span>
                                    {lead.consultingAt && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs border border-amber-400/30 bg-amber-400/10 text-amber-300" title={`Consultoria solicitada em ${format(new Date(lead.consultingAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`}>
                                            Consultoria
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                                <button
                                    onClick={() => window.open(lead.targetUrl, '_blank')}
                                    className="text-cyan-300 hover:underline truncate mr-3"
                                >
                                    {lead.targetUrl.replace(/^https?:\/\//, '')}
                                </button>
                                {lead.score > 0 ? (
                                    <span className={`shrink-0 font-bold text-xs px-2 py-1 rounded-lg border ${
                                        lead.grade === 'A' || lead.grade === 'B'
                                            ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
                                            : lead.grade === 'C' || lead.grade === 'D'
                                              ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
                                              : 'text-red-400 border-red-400/40 bg-red-400/10'
                                    }`}>
                                        {lead.grade} · {lead.score}
                                    </span>
                                ) : (
                                    <span className="shrink-0 text-xs text-gray-600">sem análise</span>
                                )}
                            </div>

                            <div className="text-xs text-gray-600">
                                {lead.scanAt ? `Análise em ${format(new Date(lead.scanAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}` : `Recebido em ${format(new Date(lead.createdAt), 'dd/MM/yyyy', { locale: ptBR })}`}
                                {lead.phone && <> · {lead.phone}</>}
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                {['contato', 'negocio', 'cliente'].map((s) => (
                                    <button
                                        key={s}
                                        disabled={updating === lead.id}
                                        onClick={() => changeStatus(lead.id, s)}
                                        className={`px-3 py-1.5 rounded-lg text-xs capitalize transition disabled:opacity-40 ${
                                            lead.status === s
                                                ? 'bg-cyan-400/15 text-cyan-300 border border-cyan-400/30'
                                                : 'bg-white/5 text-gray-400 border border-white/10 hover:text-white'
                                        }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                                <button
                                    onClick={() => remove(lead.id)}
                                    className="ml-auto px-3 py-1.5 rounded-lg text-xs text-red-400 bg-red-400/10 border border-red-400/20 hover:bg-red-400/20 transition"
                                >
                                    Excluir
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}