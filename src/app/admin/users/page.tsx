'use client';

import { useEffect, useState, useCallback } from 'react';
import { UserCog, Loader2, Plus, X, KeyRound, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    active: boolean;
    clienteId: number | null;
    clienteName: string;
    createdAt: string;
}

interface ClienteOption {
    id: number;
    name: string;
    domain: string;
}

const roleMeta: Record<string, { label: string; className: string }> = {
    admin: { label: 'Administrativo', className: 'text-purple-300 border-purple-400/30 bg-purple-400/10' },
    gestor: { label: 'Gestor', className: 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10' },
    cliente: { label: 'Cliente', className: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10' },
    superadmin: { label: 'Super Admin', className: 'text-amber-300 border-amber-400/30 bg-amber-400/10' },
};

export default function AdminUsers() {
    const [users, setUsers] = useState<User[]>([]);
    const [clientes, setClientes] = useState<ClienteOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'gestor', clienteId: '' });
    const [msg, setMsg] = useState('');

    const load = useCallback(() => {
        fetch('/api/admin/users')
            .then((r) => r.json())
            .then((d) => setUsers(d.users || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
        fetch('/api/admin/clientes')
            .then((r) => r.json())
            .then((d) => setClientes(d.clientes || []))
            .catch(() => {});
    }, [load]);

    async function create(e: React.FormEvent) {
        e.preventDefault();
        setMsg('');
        const payload = {
            name: form.name,
            email: form.email,
            password: form.password,
            role: form.role,
            clienteId: form.role === 'cliente' && form.clienteId ? Number(form.clienteId) : null,
        };
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setMsg(data.error || 'Erro ao criar usuário');
            return;
        }
        setMsg('Usuário criado com sucesso.');
        setShowForm(false);
        setForm({ name: '', email: '', password: '', role: 'gestor', clienteId: '' });
        load();
    }

    async function toggleActive(u: User) {
        await fetch('/api/admin/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: u.id, active: !u.active }),
        });
        load();
    }

    async function resetPassword(u: User) {
        const password = prompt(`Nova senha para ${u.name} (mínimo 6 caracteres):`);
        if (!password || password.length < 6) return;
        await fetch('/api/admin/users', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: u.id, password }),
        });
        load();
    }

    async function remove(u: User) {
        if (!confirm(`Excluir o acesso de ${u.name}?`)) return;
        await fetch('/api/admin/users', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: u.id }),
        });
        load();
    }

    return (
        <div className="space-y-8">
            <header className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
                    <p className="text-gray-500 mt-1">
                        Crie e envie credenciais de acesso para equipe (Gestor) e Clientes.
                        O nível Cliente vê apenas os resultados do próprio cadastro.
                    </p>
                </div>
                <button
                    onClick={() => { setShowForm((v) => !v); setMsg(''); }}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-semibold shadow-lg shadow-cyan-500/25 hover:brightness-110 transition"
                >
                    {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showForm ? 'Cancelar' : 'Novo usuário'}
                </button>
            </header>

            {msg && (
                <div className={`rounded-xl border p-4 text-sm ${msg.includes('sucesso') ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-red-400/30 bg-red-400/10 text-red-300'}`}>
                    {msg}
                </div>
            )}

            {showForm && (
                <form onSubmit={create} className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6 grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="block text-xs uppercase tracking-widest text-gray-500">Nome completo</label>
                        <input
                            required
                            value={form.name}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-xs uppercase tracking-widest text-gray-500">E-mail (login)</label>
                        <input
                            required
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-xs uppercase tracking-widest text-gray-500">Senha provisória</label>
                        <input
                            required
                            type="text"
                            minLength={6}
                            value={form.password}
                            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-xs uppercase tracking-widest text-gray-500">Nível de acesso</label>
                        <select
                            value={form.role}
                            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                        >
                            <option value="gestor">Gestor (equipe)</option>
                            <option value="cliente">Cliente (próprio cadastro)</option>
                            <option value="admin">Administrativo</option>
                        </select>
                    </div>
                    {form.role === 'cliente' && (
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className="block text-xs uppercase tracking-widest text-gray-500">Vincular cliente</label>
                            <select
                                required
                                value={form.clienteId}
                                onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value }))}
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm outline-none focus:border-cyan-400/60 transition"
                            >
                                <option value="">Selecione o cliente...</option>
                                {clientes.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} {c.domain ? `· ${c.domain}` : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-600">O cliente enxergará somente os resultados deste cadastro.</p>
                        </div>
                    )}
                    <div className="sm:col-span-2 flex items-center justify-between">
                        <p className="text-xs text-gray-600">Envie a senha provisória ao usuário por canal seguro.</p>
                        <button type="submit" className="rounded-xl bg-cyan-400/15 border border-cyan-400/30 px-5 py-2.5 text-sm text-cyan-300 hover:bg-cyan-400/25 transition">
                            Criar acesso
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div>
            ) : users.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-gray-500">
                    <UserCog className="w-8 h-8 mx-auto mb-3 text-gray-600" />
                    Nenhum usuário ainda. Crie o primeiro acesso acima.
                </div>
            ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs uppercase tracking-widest text-gray-500 border-b border-white/10">
                                <th className="px-5 py-3">Usuário</th>
                                <th className="px-5 py-3">Nível</th>
                                <th className="px-5 py-3">Vínculo</th>
                                <th className="px-5 py-3">Criado em</th>
                                <th className="px-5 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {users.map((u) => {
                                const meta = roleMeta[u.role] || roleMeta.gestor;
                                return (
                                    <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                                        <td className="px-5 py-3.5">
                                            <div className="font-medium">{u.name}</div>
                                            <div className="text-xs text-gray-600">{u.email}</div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`px-2.5 py-1 rounded-lg text-xs border ${meta.className}`}>
                                                {meta.label}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-400">
                                            {u.role === 'cliente' ? (u.clienteName || '—') : '—'}
                                        </td>
                                        <td className="px-5 py-3.5 text-gray-400">
                                            {format(new Date(u.createdAt), 'dd/MM/yyyy', { locale: ptBR })}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => toggleActive(u)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs transition ${
                                                        u.active
                                                            ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/20 hover:bg-emerald-400/20'
                                                            : 'bg-gray-400/10 text-gray-400 border border-white/10 hover:bg-gray-400/20'
                                                    }`}
                                                >
                                                    {u.active ? 'Ativo' : 'Bloqueado'}
                                                </button>
                                                <button
                                                    onClick={() => resetPassword(u)}
                                                    title="Redefinir senha"
                                                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-cyan-300 hover:border-cyan-400/30 transition"
                                                >
                                                    <KeyRound className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => remove(u)}
                                                    title="Excluir"
                                                    className="p-2 rounded-lg bg-red-400/10 border border-red-400/20 text-red-400 hover:bg-red-400/20 transition"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}