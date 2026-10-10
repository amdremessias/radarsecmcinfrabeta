'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Activity, Loader2, Search, LifeBuoy, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ExportPdfButton } from '@/components/ExportPdfButton';
import { DashboardButton } from '@/components/DashboardButton';

interface Scan {
    id: number;
    targetUrl: string;
    domain: string;
    status: string;
    score: number;
    grade: string;
    durationMs: number;
    error: string;
    createdAt: string;
    ownerName: string;
    clienteId: number;
}

export default function AdminAnalises() {
    const [scans, setScans] = useState<Scan[]>([]);
    const [loading, setLoading] = useState(true);
    const [domain, setDomain] = useState('');
    const [status, setStatus] = useState('todos');
    const [stopping, setStopping] = useState<number | null>(null);

    const [clientes, setClientes] = useState<{ id: number; name: string }[]>([]);
    const [clienteId, setClienteId] = useState('');

    useEffect(() => {
        fetch('/api/admin/clientes')
            .then((r) => r.json())
            .then((d) => setClientes(d.clientes || []))
            .catch(() => {});
    }, []);

    const load = useCallback((cid?: string) => {
        const q = cid ? `?clienteId=${cid}` : '';
        fetch('/api/admin/analises' + q)
            .then((r) => r.json())
            .then((d) => setScans(d.scans || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function onClienteChange(cid: string) {
        setClienteId(cid);
        load(cid);
    }

    async function stopScan(id: number) {
        if (!window.confirm('Deseja realmente parar esta análise? O scan será marcado como cancelado e a fila será liberada.')) return;
        setStopping(id);
        try {
            await fetch(`/api/admin/scans/${id}/stop`, { method: 'POST' });
            load(clienteId || undefined);
        } finally {
            setStopping(null);
        }
    }

    const filtered = scans.filter(
        (s) =>
            (clienteId === '' || s.clienteId === Number(clienteId)) &&
            (domain === '' || s.domain.toLowerCase().includes(domain.toLowerCase())) &&
            (status === 'todos' || s.status === status)
    );

    const domains = Array.from(new Set(scans.map((s) => s.domain).filter(Boolean))).sort();

    return (
        <div className="space-y-8">
            <header className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Análises</h1>
                    <p className="text-gray-500 mt-1">Selecione o cliente e o domínio para detalhar o resultado.</p>
                </div>
                <span className="text-sm text-gray-500">{filtered.length} de {scans.length}</span>
            </header>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                    <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">Cliente</label>
                    <select
                        value={clienteId}
                        onChange={(e) => onClienteChange(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                    >
                        <option value="">Todos os clientes</option>
                        {clientes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">Domínio</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                        <input
                            list="domains"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="Filtrar domínio"
                            className="w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                        />
                        <datalist id="domains">
                            {domains.map((d) => <option key={d} value={d} />)}
                        </datalist>
                    </div>
                </div>
                <div>
                    <label className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">Status</label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                    >
                        <option value="todos">Todos</option>
                        <option value="completed">Concluído</option>
                        <option value="failed">Falhou</option>
                        <option value="cancelled">Cancelado</option>
                        <option value="running">Em execução</option>
                    </select>
                </div>
                <div className="flex items-end">
                    {domain && (
                        <Link
                            href={`/admin/contingency?domain=${encodeURIComponent(domain)}`}
                            className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm text-cyan-300 hover:bg-cyan-400/20 transition"
                        >
                            <LifeBuoy className="w-4 h-4" /> Contingência
                        </Link>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-gray-500">
                    <Activity className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                    Nenhuma análise encontrada com os filtros atuais.
                </div>
            ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-widest text-gray-500 border-b border-white/10">
                                <th className="px-5 py-3">Domínio</th>
                                <th className="px-5 py-3">Cliente</th>
                                <th className="px-5 py-3">Data</th>
                                <th className="px-5 py-3 text-center">Score</th>
                                <th className="px-5 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filtered.map((s) => (
                                <tr key={s.id} className="hover:bg-white/[0.02]">
                                    <td className="px-5 py-3.5">
                                        <div className="font-medium">{s.domain}</div>
                                        <div className="text-xs text-gray-600">{(s.durationMs / 1000).toFixed(1)}s</div>
                                    </td>
                                    <td className="px-5 py-3.5 text-gray-400">{s.ownerName}</td>
                                    <td className="px-5 py-3.5 text-gray-400">{format(new Date(s.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</td>
                                    <td className="px-5 py-3.5 text-center">
                                        {s.status === 'completed' ? (
                                            <span className={`font-bold ${s.score >= 60 ? 'text-emerald-400' : s.score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                                                {s.grade} · {s.score}
                                            </span>
                                        ) : (
                                            <span className={`text-xs capitalize ${s.status === 'cancelled' ? 'text-gray-500' : 'text-red-400'}`}>
                                                {s.status === 'cancelled' ? `cancelado${s.error ? ' · ' + s.error : ''}` : s.status}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            {s.status === 'completed' && (
                                                <>
                                                    <DashboardButton scanId={s.id} />
                                                    <ExportPdfButton scanId={s.id} targetUrl={s.targetUrl} />
                                                </>
                                            )}
                                            {s.status === 'running' && (
                                                <button
                                                    onClick={() => stopScan(s.id)}
                                                    disabled={stopping === s.id}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {stopping === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                                                    Stop
                                                </button>
                                            )}
                                            <Link
                                                href={`/scan/${s.id}`}
                                                className="text-cyan-300 hover:underline transition"
                                            >
                                                Detalhes →
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}