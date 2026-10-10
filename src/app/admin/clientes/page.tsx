'use client';

import { useEffect, useState, useCallback } from 'react';
import { Building2, Loader2, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Cliente {
    id: number;
    name: string;
    email: string;
    phone: string;
    company: string;
    domain: string;
    plan: string;
    status: string;
    notes: string;
    createdAt: string;
    score: number;
    grade: string;
    scanCount: number;
}

export default function AdminClientes() {
    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', domain: '', plan: 'essencial' });

    const load = useCallback(() => {
        fetch('/api/admin/clientes')
            .then((r) => r.json())
            .then((d) => setClientes(d.clientes || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    async function create(e: React.FormEvent) {
        e.preventDefault();
        await fetch('/api/admin/clientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
        });
        setShowForm(false);
        setForm({ name: '', email: '', phone: '', company: '', domain: '', plan: 'essencial' });
        load();
    }

    async function toggleStatus(c: Cliente) {
        await fetch('/api/admin/clientes', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: c.id, status: c.status === 'ativo' ? 'inativo' : 'ativo' }),
        });
        load();
    }

    const active = clientes.filter((c) => c.status === 'ativo');
    const inactive = clientes.filter((c) => c.status !== 'ativo');

    return (
        <div className="space-y-8">
            <header className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
                    <p className="text-gray-500 mt-1">Contas com monitoramento contínuo e plano de contingência.</p>
                </div>
                <button
                    onClick={() => setShowForm((v) => !v)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-semibold shadow-lg shadow-cyan-500/25 hover:brightness-110 transition"
                >
                    {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showForm ? 'Cancelar' : 'Novo cliente'}
                </button>
            </header>

            {showForm && (
                <form onSubmit={create} className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {([
                        ['name', 'Nome'],
                        ['email', 'E-mail'],
                        ['phone', 'Telefone'],
                        ['company', 'Empresa'],
                        ['domain', 'Domínio'],
                    ] as const).map(([key, label]) => (
                        <div key={key} className="space-y-1.5">
                            <label className="block text-xs uppercase tracking-widest text-gray-500">{label}</label>
                            <input
                                value={form[key]}
                                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                            />
                        </div>
                    ))}
                    <div className="space-y-1.5">
                        <label className="block text-xs uppercase tracking-widest text-gray-500">Plano</label>
                        <select
                            value={form.plan}
                            onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                        >
                            <option value="essencial">Essencial</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3 flex items-end">
                        <button type="submit" className="rounded-xl bg-cyan-400/15 border border-cyan-400/30 px-5 py-2.5 text-sm text-cyan-300 hover:bg-cyan-400/25 transition">
                            Criar cliente
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : clientes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-gray-500">
                    <Building2 className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                    Nenhum cliente cadastrado ainda.
                </div>
            ) : (
                <>
                    <section>
                        <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-4">Ativos ({active.length})</h2>
                        <div className="grid md:grid-cols-2 gap-4">
                            {active.map((c) => (
                                <ClienteCard key={c.id} c={c} onToggle={() => toggleStatus(c)} />
                            ))}
                        </div>
                    </section>
                    {inactive.length > 0 && (
                        <section>
                            <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-4">Inativos ({inactive.length})</h2>
                            <div className="grid md:grid-cols-2 gap-4">
                                {inactive.map((c) => (
                                    <ClienteCard key={c.id} c={c} onToggle={() => toggleStatus(c)} />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}

function ClienteCard({ c, onToggle }: { c: Cliente; onToggle: () => void }) {
    const domain = c.domain || c.company || c.name;
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-sm text-gray-500 truncate">{domain}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1 rounded-lg text-[11px] uppercase tracking-wide border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                        {c.plan}
                    </span>
                    <button onClick={onToggle} className={`w-9 h-5 rounded-full relative transition ${c.status === 'ativo' ? 'bg-emerald-500/60' : 'bg-gray-600'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${c.status === 'ativo' ? 'left-4' : 'left-0.5'}`} />
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-lg text-sm font-bold border ${
                    c.grade === 'A' || c.grade === 'B'
                        ? 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10'
                        : c.grade === 'C' || c.grade === 'D'
                          ? 'text-amber-400 border-amber-400/40 bg-amber-400/10'
                          : 'text-red-400 border-red-400/40 bg-red-400/10'
                }`}>
                    {c.grade} · {c.score}
                </span>
                <span className="text-xs text-gray-500">{c.scanCount} análises</span>
                <span className="ml-auto text-xs text-gray-600">
                    {format(new Date(c.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                </span>
            </div>
        </div>
    );
}