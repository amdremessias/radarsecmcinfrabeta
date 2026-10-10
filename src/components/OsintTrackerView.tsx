'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import {
    Search,
    Loader2,
    Download,
    ExternalLink,
    Copy,
    CheckCircle2,
    Clock,
    BarChart3,
    Target,
    ChevronDown,
    SlidersHorizontal,
} from 'lucide-react';
import { getPreset, SITE_PRESETS } from '@/lib/osint/sites';

type OsintOptions = {
    engine?: 'sherlock' | 'maigret';
    variations?: boolean;
    nsfw?: boolean;
    preset?: string;
    sites?: string[] | null;
    requestTimeoutSec?: number;
    printAll?: boolean;
    allSites?: boolean;
    topSites?: number;
};

type OsintScan = {
    id: number;
    username: string;
    status: string;
    sitesTotal: number;
    sitesFound: number;
    successRate: number;
    executionTimeMs?: number;
    createdAt: string;
    completedAt?: string;
    ownerName: string;
    options?: OsintOptions | null;
};

type OsintResult = {
    id: number;
    siteName: string;
    url?: string | null;
    found: boolean;
    status: string;
    message?: string | null;
    matchedUsername?: string | null;
    data?: Record<string, string> | null;
};

function progressFor(status?: string): number {
    switch (status) {
        case 'pending':
            return 10;
        case 'running':
            return 65;
        case 'completed':
        case 'failed':
        case 'timeout':
            return 100;
        default:
            return 0;
    }
}

function describeOptions(opts?: OsintOptions | null): string[] {
    if (!opts) return [];
    const chips: string[] = [];
    if (opts.engine === 'maigret') chips.push('Maigret');
    if (opts.preset) {
        if (opts.engine === 'maigret') {
            chips.push(
                opts.preset === 'all'
                    ? 'Todos os sites'
                    : opts.preset === 'custom'
                      ? `Sites: ${opts.sites?.length ?? 0}`
                      : `Top ${opts.topSites || 500}`
            );
        } else if (opts.preset === 'custom') {
            chips.push(opts.sites?.length ? `Sites: ${opts.sites.length}` : 'Sites: personalizado');
        } else if (opts.preset !== 'all') {
            chips.push(getPreset(opts.preset)?.label || opts.preset);
        }
    }
    if (opts.variations) chips.push('Variações');
    if (opts.nsfw) chips.push('NSFW');
    if (opts.printAll === false) chips.push('Só encontrados');
    return chips;
}

export default function OsintTrackerView() {
    const [username, setUsername] = useState('');
    const [scans, setScans] = useState<OsintScan[]>([]);
    const [loading, setLoading] = useState(false);
    const [polling, setPolling] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [results, setResults] = useState<OsintResult[]>([]);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [engine, setEngine] = useState<'sherlock' | 'maigret'>('sherlock');
    const [variations, setVariations] = useState(false);
    const [nsfw, setNsfw] = useState(false);
    const [preset, setPreset] = useState('all');
    const [maigretScope, setMaigretScope] = useState<'default' | 'all' | 'custom'>('default');
    const [topSites, setTopSites] = useState(500);
    const [customSites, setCustomSites] = useState('');
    const [requestTimeoutSec, setRequestTimeoutSec] = useState(30);
    const [printAll, setPrintAll] = useState(true);
    const [expandedDataId, setExpandedDataId] = useState<number | null>(null);

    const fetchScans = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/osint?limit=30');
            if (res.ok) {
                const data = await res.json();
                setScans(data.scans || []);
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    const loadResults = useCallback(async (id: number) => {
        setResultsLoading(true);
        try {
            const res = await fetch(`/api/admin/osint/${id}/results?limit=5000`);
            if (res.ok) {
                const data = await res.json();
                setResults(data.results || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setResultsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchScans();
    }, [fetchScans]);

    useEffect(() => {
        if (selectedId) loadResults(selectedId);
    }, [selectedId, loadResults]);

    useEffect(() => {
        if (scans.some(s => s.status === 'pending' || s.status === 'running')) {
            setPolling(true);
        } else {
            setPolling(false);
        }
    }, [scans]);

    useEffect(() => {
        if (!polling) return;
        const id = setInterval(() => {
            fetchScans();
            if (selectedId) loadResults(selectedId);
        }, 3000);
        return () => clearInterval(id);
    }, [polling, fetchScans, selectedId, loadResults]);

    const runScan = async () => {
        if (!username.trim()) return;
        setLoading(true);
        try {
            const res = await fetch('/api/admin/osint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username.trim(),
                    engine,
                    variations: engine === 'sherlock' ? variations : false,
                    nsfw: engine === 'sherlock' ? nsfw : false,
                    preset: engine === 'maigret' ? maigretScope : preset,
                    sites:
                        engine === 'maigret'
                            ? maigretScope === 'custom'
                                ? customSites.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
                                : undefined
                            : preset === 'custom'
                              ? customSites.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
                              : undefined,
                    requestTimeoutSec,
                    printAll,
                    topSites: engine === 'maigret' ? topSites : undefined,
                }),
            });
            if (res.ok) {
                setUsername('');
                await fetchScans();
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const selectedScan = scans.find(s => s.id === selectedId);

    const exportCsv = () => {
        if (results.length === 0) return;
        const headers = [
            'siteName', 'url', 'found', 'status', 'matchedUsername', 'message',
            'fullname', 'bio', 'location', 'image', 'extras',
        ];
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [headers.join(',')].concat(
            results.map(r => {
                const d = r.data || {};
                const consumed = new Set([
                    'fullname', 'name', 'bio', 'description', 'location',
                    'image', 'avatar', 'avatar_url', 'image_url', 'photo', 'profile_pic_url',
                ]);
                const extras = Object.entries(d)
                    .filter(([k]) => !consumed.has(k))
                    .map(([k, v]) => `${k}=${v}`)
                    .join('; ');
                const line = [
                    esc(r.siteName),
                    esc(r.url),
                    r.found ? 'true' : 'false',
                    esc(r.status),
                    esc(r.matchedUsername),
                    esc(r.message),
                    esc(d.fullname || d.name || ''),
                    esc(d.bio || d.description || ''),
                    esc(d.location || ''),
                    esc(d.image || d.image_url || d.avatar || d.avatar_url || d.photo || ''),
                    esc(extras),
                ];
                return line.join(',');
            })
        );
        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const engine = selectedScan?.options?.engine === 'maigret' ? 'maigret' : 'sherlock';
        a.download = `osint-${engine}-${selectedScan?.username}-${selectedId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const copyMarkdown = async () => {
        if (!selectedScan) return;
        const found = results.filter(r => r.found);
        const md = `## OSINT / Username Tracker - Radar Security

**Username:** ${selectedScan.username}
**Total Sites:** ${selectedScan.sitesTotal}
**Sites Encontrados:** ${selectedScan.sitesFound}
**Taxa de Sucesso:** ${selectedScan.successRate}%
**Tempo de Execução:** ${selectedScan.executionTimeMs || 0}ms
**Status:** ${selectedScan.status}
**Criado em:** ${new Date(selectedScan.createdAt).toLocaleString()}

### Perfis Encontrados
${found.length === 0 ? '_Nenhum perfil encontrado_' : found.map(f => `- [${f.siteName}](${f.url || '#'})`).join('\n')}
`;
        await navigator.clipboard.writeText(md);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const metrics = selectedScan ? [
        { label: 'Total Encontrado', value: selectedScan.sitesFound, icon: Target, color: 'text-emerald-400' },
        { label: 'Taxa de Sucesso', value: `${selectedScan.successRate}%`, icon: BarChart3, color: 'text-cyan-400' },
        { label: 'Tempo de Execução', value: `${selectedScan.executionTimeMs || 0}ms`, icon: Clock, color: 'text-amber-400' },
        { label: 'Total Verificados', value: selectedScan.sitesTotal, icon: Search, color: 'text-slate-300' },
    ] : [];

    const foundResults = results.filter(r => r.found);
    const hasVariants = results.some(r => r.matchedUsername);
    const hasDetails = results.some(r => r.data && Object.keys(r.data).length > 0);
    const detailColspan = 4 + (hasVariants ? 1 : 0) + (hasDetails ? 1 : 0);
    const counts = {
        found: foundResults.length,
        notFound: results.filter(r => !r.found && r.status === 'not_found').length,
        error: results.filter(r => r.status === 'error').length,
    };
    const totalResults = results.length || 1;
    const activeScan = scans.find(s => s.status === 'pending' || s.status === 'running');

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                            <Search className="w-4 h-4" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">OSINT / Username Tracker</h2>
                    </div>
                    <p className="text-sm text-gray-400 mt-2 max-w-2xl">
                        Busca e correlação de usernames em fontes abertas via Docker — Sherlock (presença em ~413
                        sites) ou Maigret (dossier detalhado com nome, bio, foto e IDs em ~8K sites).
                        Processamento assíncrono com recursos limitados (--memory=512m, --cpus=1.0).
                    </p>
                </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex gap-3">
                    <input
                        type="text"
                        placeholder="Digite o username a pesquisar (ex.: johndoe)"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="flex-1 rounded-xl bg-[#0b1220] border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                    />
                    <button
                        onClick={runScan}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-[#05070f] text-sm font-semibold shadow-lg shadow-cyan-500/30 hover:brightness-110 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {loading ? 'Iniciando...' : 'Iniciar Busca'}
                    </button>
                </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <button
                    onClick={() => setShowAdvanced(v => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-cyan-300"
                >
                    <SlidersHorizontal className="w-4 h-4" />
                    Opções avançadas
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>

                {showAdvanced && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2 rounded-xl border border-white/10 bg-[#0b1220] p-3">
                            <span className="text-xs uppercase tracking-widest text-gray-500">Engine de busca</span>
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEngine('sherlock')}
                                    className={`px-4 py-2 rounded-lg text-sm border ${engine === 'sherlock' ? 'border-cyan-400/50 text-cyan-300 bg-cyan-400/10' : 'border-white/10 text-gray-400'}`}
                                >
                                    Sherlock
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEngine('maigret')}
                                    className={`px-4 py-2 rounded-lg text-sm border ${engine === 'maigret' ? 'border-cyan-400/50 text-cyan-300 bg-cyan-400/10' : 'border-white/10 text-gray-400'}`}
                                >
                                    Maigret
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                {engine === 'sherlock'
                                    ? 'Verificação rápida de presença em ~413 sites, com variações de username ({?}).'
                                    : 'Coleta dossier detalhado (nome completo, bio, foto, seguidores, IDs) em sites e APIs — base com ~8K sites.'}
                            </p>
                        </div>

                        <label className="block md:col-span-2">
                            <span className="text-xs uppercase tracking-widest text-gray-500">Escopo de sites</span>
                            {engine === 'sherlock' ? (
                                <>
                                    <select
                                        value={preset}
                                        onChange={(e) => setPreset(e.target.value)}
                                        className="mt-1 w-full rounded-xl bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                                    >
                                        {SITE_PRESETS.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.label} ({p.sites.length || 'todos'})
                                            </option>
                                        ))}
                                        <option value="custom">Personalizado…</option>
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {preset === 'custom'
                                            ? 'Informe os nomes dos sites do Sherlock separados por vírgula.'
                                            : getPreset(preset)?.description}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <select
                                        value={maigretScope}
                                        onChange={(e) => setMaigretScope(e.target.value as 'default' | 'all' | 'custom')}
                                        className="mt-1 w-full rounded-xl bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                                    >
                                        <option value="default">Padrão (top sites)</option>
                                        <option value="all">Todos os sites (-a)</option>
                                        <option value="custom">Personalizado…</option>
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {maigretScope === 'custom'
                                            ? 'Nomes dos sites da base do Maigret separados por vírgula (ex.: GitHub, Reddit, Twitter).'
                                            : maigretScope === 'all'
                                              ? 'Verifica todos os sites da base do Maigret (~8K sites) — mais demorado.'
                                              : 'Verifica os sites de maior tráfego, conforme o campo abaixo.'}
                                    </p>
                                </>
                            )}
                        </label>

                        {engine === 'maigret' && maigretScope === 'default' && (
                            <label className="block rounded-xl border border-white/10 bg-[#0b1220] p-3">
                                <span className="text-sm text-white">Top sites (Nº)</span>
                                <input
                                    type="number"
                                    min={10}
                                    max={2000}
                                    value={topSites}
                                    onChange={(e) => setTopSites(Number(e.target.value))}
                                    className="mt-1 w-full rounded-lg bg-[#05070f] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                                />
                                <span className="block text-xs text-gray-500 mt-1">Quantidade de sites de maior tráfego (10–2000).</span>
                            </label>
                        )}

                        {((engine === 'sherlock' && preset === 'custom') || (engine === 'maigret' && maigretScope === 'custom')) && (
                            <label className="block md:col-span-2">
                                <span className="text-xs uppercase tracking-widest text-gray-500">Sites (separados por vírgula)</span>
                                <input
                                    type="text"
                                    value={customSites}
                                    onChange={(e) => setCustomSites(e.target.value)}
                                    placeholder="GitHub, GitLab, Reddit, Instagram"
                                    className="mt-1 w-full rounded-xl bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                                />
                            </label>
                        )}

                        {engine === 'sherlock' && (
                            <>
                                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0b1220] p-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={variations}
                                        onChange={(e) => setVariations(e.target.checked)}
                                        className="mt-0.5 accent-cyan-400"
                                    />
                                    <span>
                                        <span className="text-sm text-white">Buscar variações do username</span>
                                        <span className="block text-xs text-gray-500">
                                            Testa trocando separadores por <code>_</code>, <code>-</code> e <code>.</code>{' '}
                                            (ex.: joao.silva → joao_silva, joao-silva).
                                        </span>
                                    </span>
                                </label>

                                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0b1220] p-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={nsfw || preset === 'adult'}
                                        disabled={preset === 'adult'}
                                        onChange={(e) => setNsfw(e.target.checked)}
                                        className="mt-0.5 accent-cyan-400"
                                    />
                                    <span>
                                        <span className="text-sm text-white">Incluir sites NSFW</span>
                                        <span className="block text-xs text-gray-500">Adiciona a lista de conteúdo adulto (flag --nsfw).</span>
                                    </span>
                                </label>
                            </>
                        )}

                        <label className="block rounded-xl border border-white/10 bg-[#0b1220] p-3">
                            <span className="text-sm text-white">Timeout por site (s)</span>
                            <input
                                type="number"
                                min={5}
                                max={120}
                                value={requestTimeoutSec}
                                onChange={(e) => setRequestTimeoutSec(Number(e.target.value))}
                                className="mt-1 w-full rounded-lg bg-[#05070f] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                            />
                            <span className="block text-xs text-gray-500 mt-1">Tempo de espera por requisição (5–120s).</span>
                        </label>

                        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-3">
                            <span className="text-sm text-white">Modo de saída</span>
                            <div className="mt-2 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPrintAll(true)}
                                    className={`px-3 py-1.5 rounded-lg text-xs border ${printAll ? 'border-cyan-400/50 text-cyan-300 bg-cyan-400/10' : 'border-white/10 text-gray-400'}`}
                                >
                                    Todos os sites
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPrintAll(false)}
                                    className={`px-3 py-1.5 rounded-lg text-xs border ${!printAll ? 'border-cyan-400/50 text-cyan-300 bg-cyan-400/10' : 'border-white/10 text-gray-400'}`}
                                >
                                    Só encontrados
                                </button>
                            </div>
                            <span className="block text-xs text-gray-500 mt-1">“Só encontrados” reduz o volume armazenado.</span>
                        </div>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Buscas Recentes</h3>
                    {polling && <div className="text-xs text-amber-400 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> Atualizando...</div>}
                </div>
                {activeScan && (
                    <div className="mb-4">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span>Processando #{activeScan.id} • {activeScan.username}</span>
                            <span>{progressFor(activeScan.status)}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-400 to-blue-600 transition-all duration-700"
                                style={{ width: `${progressFor(activeScan.status)}%` }}
                            />
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-500 border-b border-white/10">
                                <th className="text-left py-2 px-2">ID</th>
                                <th className="text-left py-2 px-2">Username</th>
                                <th className="text-left py-2 px-2">Status</th>
                                <th className="text-left py-2 px-2">Encontrados</th>
                                <th className="text-left py-2 px-2">Taxa</th>
                                <th className="text-left py-2 px-2">Tempo</th>
                                <th className="text-left py-2 px-2">Criado em</th>
                                <th className="text-left py-2 px-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {scans.map(s => (
                                <tr key={s.id} className={`border-b border-white/5 hover:bg-white/5 ${selectedId === s.id ? 'bg-cyan-400/5' : ''}`}>
                                    <td className="py-2 px-2 text-gray-500">{s.id}</td>
                                    <td className="py-2 px-2">
                                        <div className="text-white font-medium">{s.username}</div>
                                        {describeOptions(s.options).length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {describeOptions(s.options).map(c => (
                                                    <span key={c} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-gray-400">
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-2 px-2">
                                        <span className={`px-2 py-0.5 rounded text-xs border ${
                                            s.status === 'completed' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                                            s.status === 'running' ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' :
                                            s.status === 'failed' ? 'border-rose-500/30 text-rose-400 bg-rose-500/10' :
                                            'border-slate-500/30 text-slate-400 bg-slate-500/10'
                                        }`}>
                                            {s.status}
                                        </span>
                                    </td>
                                    <td className="py-2 px-2 text-emerald-400">{s.sitesFound}/{s.sitesTotal}</td>
                                    <td className="py-2 px-2 text-cyan-400">{s.successRate}%</td>
                                    <td className="py-2 px-2 text-gray-400">{s.executionTimeMs || 0}ms</td>
                                    <td className="py-2 px-2 text-gray-400">{new Date(s.createdAt).toLocaleString()}</td>
                                    <td className="py-2 px-2">
                                        <button
                                            onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
                                            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                                        >
                                            {selectedId === s.id ? 'Fechar' : 'Ver resultados'} <ChevronDown className={`w-3 h-3 transition-transform ${selectedId === s.id ? 'rotate-180' : ''}`}/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {selectedScan && (
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold">Dashboard - {selectedScan.username}</h3>
                            <p className="text-xs text-gray-500 mt-1">ID #{selectedScan.id} • {selectedScan.status}</p>
                            {describeOptions(selectedScan.options).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {describeOptions(selectedScan.options).map(c => (
                                        <span key={c} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-gray-300">
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={copyMarkdown} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:border-cyan-400/40 hover:text-cyan-300">
                                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400"/> : <Copy className="w-4 h-4"/>}
                                {copied ? 'Copiado!' : 'Copiar relatório (Markdown)'}
                            </button>
                            <a
                                href={`/api/admin/osint/${selectedScan.id}/report/pdf`}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:border-cyan-400/40 hover:text-cyan-300"
                            >
                                <Download className="w-4 h-4"/> Exportar PDF
                            </a>
                            <button onClick={exportCsv} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:border-cyan-400/40 hover:text-cyan-300">
                                <Download className="w-4 h-4"/> Exportar CSV
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {metrics.map(m => (
                            <div key={m.label} className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs uppercase tracking-widest text-gray-500">{m.label}</div>
                                    <m.icon className={`w-4 h-4 ${m.color}`}/>
                                </div>
                                <div className="text-2xl font-bold mt-1">{m.value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                            <div className="text-xs text-gray-500">Encontrados</div>
                            <div className="text-xl font-semibold text-emerald-400 mt-1">{counts.found}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                            <div className="text-xs text-gray-500">Não encontrados</div>
                            <div className="text-xl font-semibold text-slate-400 mt-1">{counts.notFound}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                            <div className="text-xs text-gray-500">Erros</div>
                            <div className="text-xl font-semibold text-rose-400 mt-1">{counts.error}</div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4 space-y-3">
                        <div className="text-xs uppercase tracking-widest text-gray-500">Distribuição por categoria</div>
                        {[
                            { label: 'Perfis encontrados', value: counts.found, color: 'from-emerald-400 to-emerald-600' },
                            { label: 'Não encontrados', value: counts.notFound, color: 'from-slate-400 to-slate-600' },
                            { label: 'Erros', value: counts.error, color: 'from-rose-400 to-rose-600' },
                        ].map(row => (
                            <div key={row.label}>
                                <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                                    <span>{row.label}</span>
                                    <span>{row.value} ({Math.round((row.value / totalResults) * 100)}%)</span>
                                </div>
                                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                                    <div
                                        className={`h-full bg-gradient-to-r ${row.color} transition-all duration-700`}
                                        style={{ width: `${(row.value / totalResults) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div>
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                            Tabela de Resultados ({foundResults.length} encontrados / {results.length} total)
                        </h4>
                        {resultsLoading ? (
                            <div className="flex items-center justify-center py-8 text-gray-400">
                                <Loader2 className="w-4 h-4 animate-spin mr-2"/> Carregando...
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-white/10">
                                <table className="w-full text-sm bg-[#0b1220]">
                                    <thead>
                                        <tr className="text-gray-500 border-b border-white/10">
                                            <th className="text-left py-2 px-3">Site</th>
                                            <th className="text-left py-2 px-3">Status</th>
                                            {hasVariants && <th className="text-left py-2 px-3">Variante</th>}
                                            <th className="text-left py-2 px-3">URL</th>
                                            <th className="text-left py-2 px-3">Mensagem</th>
                                            {hasDetails && <th className="text-left py-2 px-3">Dados</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map(r => {
                                            const rowData = r.data && Object.keys(r.data).length > 0 ? r.data : null;
                                            const isExpanded = expandedDataId === r.id;
                                            return (
                                                <Fragment key={r.id}>
                                                    <tr className="border-b border-white/5 hover:bg-white/5">
                                                        <td className="py-2 px-3 text-white font-medium">{r.siteName}</td>
                                                        <td className="py-2 px-3">
                                                            <span className={`px-2 py-0.5 rounded text-xs border ${
                                                                r.found ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                                                                r.status === 'error' ? 'border-rose-500/30 text-rose-400 bg-rose-500/10' :
                                                                'border-slate-500/30 text-slate-400 bg-slate-500/10'
                                                            }`}>
                                                                {r.found ? 'FOUND' : r.status?.toUpperCase()}
                                                            </span>
                                                        </td>
                                                        {hasVariants && (
                                                            <td className="py-2 px-3 text-xs text-cyan-300 font-mono">{r.matchedUsername || '—'}</td>
                                                        )}
                                                        <td className="py-2 px-3">
                                                            {r.url ? (
                                                                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                                                                    {r.url.length > 40 ? r.url.slice(0, 37) + '...' : r.url} <ExternalLink className="w-3 h-3"/>
                                                                </a>
                                                            ) : (
                                                                <span className="text-gray-600">—</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3 text-xs text-gray-400">{r.message || '—'}</td>
                                                        {hasDetails && (
                                                            <td className="py-2 px-3">
                                                                {rowData ? (
                                                                    <button
                                                                        onClick={() => setExpandedDataId(isExpanded ? null : r.id)}
                                                                        className="text-xs text-cyan-400 hover:text-cyan-300"
                                                                    >
                                                                        {isExpanded ? 'Ocultar' : 'Detalhes'}
                                                                    </button>
                                                                ) : (
                                                                    <span className="text-gray-700">—</span>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                    {isExpanded && rowData && (
                                                        <tr className="border-b border-white/5 bg-[#05070f]/60">
                                                            <td colSpan={detailColspan} className="py-3 px-3">
                                                                <div className="flex gap-4">
                                                                    {rowData.image && (
                                                                        // eslint-disable-next-line @next/next/no-img-element
                                                                        <img
                                                                            src={rowData.image}
                                                                            alt=""
                                                                            referrerPolicy="no-referrer"
                                                                            className="w-14 h-14 rounded-lg object-cover border border-white/10 shrink-0"
                                                                        />
                                                                    )}
                                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 flex-1">
                                                                        {Object.entries(rowData)
                                                                            .filter(([k]) => k !== 'image')
                                                                            .map(([k, v]) => (
                                                                                <div key={k} className="text-xs">
                                                                                    <span className="text-gray-500">{k}: </span>
                                                                                    <span className="text-gray-300 break-words">
                                                                                        {String(v).length > 80 ? String(v).slice(0, 77) + '...' : v}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}
