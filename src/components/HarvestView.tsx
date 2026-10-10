'use client';

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import {
    Globe,
    Loader2,
    Download,
    Copy,
    CheckCircle2,
    Target,
    Mail,
    Server,
    Link2,
    Users,
    ShieldAlert,
    ChevronDown,
    SlidersHorizontal,
    Search,
    KeyRound,
    Trash2,
    Plus,
    ShieldCheck,
    FileText,
    Power,
} from 'lucide-react';
import { HARVEST_PRESETS, getHarvestPreset, presetRequiresApi } from '@/lib/harvest/sources';

type KeyProvider = {
    id: string;
    label: string;
    source?: string;
    fields: { name: string; label: string }[];
};

type ApiKeyMeta = {
    provider: string;
    label: string;
    enabled: boolean;
    updatedAt: string | null;
    fields: Record<string, string>;
};

type HarvestApiConfig = {
    apiEnabled: boolean;
    canManage: boolean;
    providers: KeyProvider[];
    keys: ApiKeyMeta[];
};

type HarvestOptions = {
    preset?: string;
    sources?: string[];
    limit?: number;
    sourceWorkers?: number;
    noHosts?: boolean;
    quiet?: boolean;
    useApi?: boolean;
};

type HarvestScan = {
    id: number;
    target: string;
    status: string;
    sources?: string | null;
    resultCount: number;
    counts?: Record<string, number> | null;
    evidenceStatus?: string | null;
    executionTimeMs?: number;
    createdAt: string;
    completedAt?: string;
    ownerName: string;
    options?: HarvestOptions | null;
};

type HarvestResult = {
    id: number;
    resultType: string;
    value: string;
    sources?: string[] | null;
    details?: unknown;
};

type SourceExecution = {
    source: string;
    status: string;
    resultCount: number;
    errorType?: string | null;
    stopReason?: string | null;
    durationMs?: number | null;
};

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
    hostname: { label: 'Hosts', icon: Server, color: 'text-cyan-400' },
    email: { label: 'E-mails', icon: Mail, color: 'text-emerald-400' },
    ip: { label: 'IPs', icon: Target, color: 'text-amber-400' },
    url: { label: 'URLs', icon: Link2, color: 'text-blue-400' },
    person: { label: 'Pessoas', icon: Users, color: 'text-fuchsia-400' },
    breach: { label: 'Vazamentos', icon: ShieldAlert, color: 'text-rose-400' },
    asn: { label: 'ASNs', icon: Globe, color: 'text-slate-300' },
};

function typeLabel(type: string): string {
    return TYPE_META[type]?.label || type;
}

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

function describeOptions(opts?: HarvestOptions | null): string[] {
    if (!opts) return [];
    const chips: string[] = [];
    if (opts.preset) {
        chips.push(opts.preset === 'custom' ? `Fontes: ${opts.sources?.length ?? 0}` : getHarvestPreset(opts.preset)?.label || opts.preset);
    }
    if (opts.limit !== undefined) chips.push(`Limite ${opts.limit}`);
    if (opts.noHosts) chips.push('Sem hosts');
    if (opts.useApi) chips.push('Com API');
    return chips;
}

function statusBadge(status: string): string {
    switch (status) {
        case 'completed':
            return 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10';
        case 'running':
            return 'border-amber-500/30 text-amber-400 bg-amber-500/10';
        case 'failed':
            return 'border-rose-500/30 text-rose-400 bg-rose-500/10';
        case 'timeout':
            return 'border-orange-500/30 text-orange-400 bg-orange-500/10';
        default:
            return 'border-slate-500/30 text-slate-400 bg-slate-500/10';
    }
}

export default function HarvestView() {
    const [target, setTarget] = useState('');
    const [scans, setScans] = useState<HarvestScan[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [results, setResults] = useState<HarvestResult[]>([]);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [sourceStatus, setSourceStatus] = useState<SourceExecution[]>([]);
    const [typeFilter, setTypeFilter] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [preset, setPreset] = useState('keyless');
    const [customSources, setCustomSources] = useState('');
    const [limit, setLimit] = useState(500);
    const [sourceWorkers, setSourceWorkers] = useState(3);
    const [noHosts, setNoHosts] = useState(false);
    const [quiet, setQuiet] = useState(true);

    // Integração de API (fontes keyed)
    const [apiConfig, setApiConfig] = useState<HarvestApiConfig>({
        apiEnabled: false,
        canManage: false,
        providers: [],
        keys: [],
    });
    const canManageKeys = apiConfig.canManage;
    const [useApi, setUseApi] = useState(false);
    const [showKeys, setShowKeys] = useState(false);
    const [keyProvider, setKeyProvider] = useState('');
    const [keyFields, setKeyFields] = useState<Record<string, string>>({});
    const [savingKey, setSavingKey] = useState(false);
    const [keyMsg, setKeyMsg] = useState<string | null>(null);
    const [keyErr, setKeyErr] = useState<string | null>(null);

    // Filtros client-side dos resultados
    const [resultQuery, setResultQuery] = useState('');
    const [sourceFilter, setSourceFilter] = useState<string | null>(null);

    const fetchConfig = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/harvest/config');
            if (!res.ok) return;
            const data = await res.json();
            setApiConfig({
                apiEnabled: Boolean(data.apiEnabled),
                canManage: Boolean(data.canManage),
                providers: Array.isArray(data.providers) ? data.providers : [],
                keys: Array.isArray(data.keys) ? data.keys : [],
            });
        } catch {
            // silencioso
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega a config de API uma vez
        fetchConfig();
    }, [fetchConfig]);

    const activeKeyCount = useMemo(() => apiConfig.keys.filter((k) => k.enabled).length, [apiConfig.keys]);
    const selectedKeyProvider = useMemo(
        () => apiConfig.providers.find((p) => p.id === keyProvider) || null,
        [apiConfig.providers, keyProvider]
    );

    const handleApiToggle = (enabled: boolean) => {
        setUseApi(enabled);
        if (!enabled && presetRequiresApi(preset)) setPreset('keyless');
    };

    const saveKey = async () => {
        if (!keyProvider) return;
        setSavingKey(true);
        setKeyErr(null);
        setKeyMsg(null);
        try {
            const res = await fetch('/api/admin/harvest/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: keyProvider, fields: keyFields }),
            });
            const data = await res.json();
            if (!res.ok) {
                setKeyErr(data.error || 'Falha ao salvar a chave.');
                return;
            }
            setApiConfig((c) => ({ ...c, keys: data.keys || c.keys }));
            setKeyFields({});
            setKeyMsg('Chave salva com sucesso.');
        } catch (e: any) {
            setKeyErr(e?.message || 'Falha de rede.');
        } finally {
            setSavingKey(false);
        }
    };

    const toggleKeyEnabled = async (provider: string, enabled: boolean) => {
        setKeyErr(null);
        try {
            const res = await fetch('/api/admin/harvest/config', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, enabled }),
            });
            const data = await res.json();
            if (!res.ok) {
                setKeyErr(data.error || 'Falha ao atualizar.');
                return;
            }
            setApiConfig((c) => ({ ...c, keys: data.keys || c.keys }));
        } catch (e: any) {
            setKeyErr(e?.message || 'Falha de rede.');
        }
    };

    const deleteKey = async (provider: string) => {
        if (!window.confirm(`Remover a chave do provedor "${provider}"?`)) return;
        setKeyErr(null);
        try {
            const res = await fetch(`/api/admin/harvest/config?provider=${encodeURIComponent(provider)}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (!res.ok) {
                setKeyErr(data.error || 'Falha ao remover.');
                return;
            }
            setApiConfig((c) => ({ ...c, keys: data.keys || c.keys }));
            if (keyProvider === provider) {
                setKeyProvider('');
                setKeyFields({});
            }
        } catch (e: any) {
            setKeyErr(e?.message || 'Falha de rede.');
        }
    };

    const fetchScans = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/harvest?limit=30');
            if (!res.ok) return;
            const data = await res.json();
            setScans(data.scans || []);
        } catch {
            // silencioso durante o polling
        }
    }, []);

    const fetchResults = useCallback(async (id: number, type: string | null) => {
        setResultsLoading(true);
        try {
            const url = `/api/admin/harvest/${id}/results?limit=5000${type ? `&type=${encodeURIComponent(type)}` : ''}`;
            const res = await fetch(url);
            const data = await res.json();
            setResults(data.results || []);
        } catch {
            setResults([]);
        } finally {
            setResultsLoading(false);
        }
    }, []);

    const fetchDetail = useCallback(async (id: number) => {
        try {
            const res = await fetch(`/api/admin/harvest/${id}`);
            if (!res.ok) return;
            const data = await res.json();
            setSourceStatus(Array.isArray(data.scan?.sourceStatus) ? data.scan.sourceStatus : []);
        } catch {
            setSourceStatus([]);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- carregamento inicial da lista de recons
        fetchScans();
    }, [fetchScans]);

    useEffect(() => {
        if (selectedId == null) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega resultados ao selecionar um recon
        fetchResults(selectedId, typeFilter);
        fetchDetail(selectedId);
    }, [selectedId, typeFilter, fetchResults, fetchDetail]);

    const hasActive = scans.some((s) => s.status === 'pending' || s.status === 'running');
    useEffect(() => {
        if (!hasActive) return;
        const timer = setInterval(() => {
            fetchScans();
            if (selectedId != null) {
                fetchResults(selectedId, typeFilter);
                fetchDetail(selectedId);
            }
        }, 3000);
        return () => clearInterval(timer);
    }, [hasActive, selectedId, typeFilter, fetchScans, fetchResults, fetchDetail]);

    const runScan = async () => {
        const trimmed = target.trim();
        if (!trimmed) return;
        setLoading(true);
        setError(null);
        try {
            const custom = customSources
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const res = await fetch('/api/admin/harvest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target: trimmed,
                    preset,
                    sources: custom,
                    limit,
                    sourceWorkers,
                    noHosts,
                    quiet,
                    useApi,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Falha ao iniciar recon.');
                return;
            }
            if (data.scanId) setSelectedId(data.scanId);
            await fetchScans();
        } catch (e: any) {
            setError(e?.message || 'Falha de rede.');
        } finally {
            setLoading(false);
        }
    };

    const selectedScan = useMemo(() => scans.find((s) => s.id === selectedId) || null, [scans, selectedId]);

    const counts = useMemo(() => {
        if (selectedScan?.counts && typeof selectedScan.counts === 'object') return selectedScan.counts;
        const c: Record<string, number> = {};
        for (const r of results) c[r.resultType] = (c[r.resultType] || 0) + 1;
        return c;
    }, [selectedScan, results]);

    const typeOptions = useMemo(() => {
        const set = new Set<string>();
        for (const r of results) set.add(r.resultType);
        for (const k of Object.keys(counts)) set.add(k);
        return Array.from(set).sort();
    }, [results, counts]);

    const availableSources = useMemo(() => {
        const set = new Set<string>();
        for (const r of results) for (const s of r.sources || []) set.add(s);
        return Array.from(set).sort();
    }, [results]);

    const visibleResults = useMemo(() => {
        const q = resultQuery.trim().toLowerCase();
        return results.filter((r) => {
            if (sourceFilter && !(r.sources || []).includes(sourceFilter)) return false;
            if (!q) return true;
            if (String(r.value).toLowerCase().includes(q)) return true;
            return (r.sources || []).some((s) => s.toLowerCase().includes(q));
        });
    }, [results, resultQuery, sourceFilter]);

    const copyMarkdown = async () => {
        if (!selectedScan) return;
        const lines: string[] = [
            `## OSINT / Domain Recon - Radar Security`,
            `**Alvo:** ${selectedScan.target}`,
            `**Status:** ${selectedScan.status} • **Resultados:** ${selectedScan.resultCount}`,
            `**Fontes:** ${selectedScan.sources || '—'}`,
            '',
            '### Contagem por tipo',
        ];
        for (const [k, v] of Object.entries(counts)) lines.push(`- ${typeLabel(k)}: ${v}`);
        lines.push('', '### Resultados');
        for (const r of results) lines.push(`- [${r.resultType}] ${r.value}${r.sources?.length ? ` (${r.sources.join(', ')})` : ''}`);
        await navigator.clipboard.writeText(lines.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const exportCsv = () => {
        if (!selectedScan) return;
        const header = 'type,value,sources,details';
        const rows = results.map((r) => {
            const sources = (r.sources || []).join('|');
            const details = r.details ? JSON.stringify(r.details).replace(/"/g, '""') : '';
            return `${r.resultType},"${String(r.value).replace(/"/g, '""')}","${sources}","${details}"`;
        });
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `domain-recon-${selectedScan.target}-${selectedScan.id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportPdf = () => {
        if (!selectedScan) return;
        window.open(`/api/admin/harvest/${selectedScan.id}/report/pdf`, '_blank');
    };

    const activeScan = scans.find((s) => s.status === 'pending' || s.status === 'running');

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                            <Globe className="w-4 h-4" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">OSINT / Domain Recon</h2>
                    </div>
                    <p className="text-sm text-gray-400 mt-2 max-w-2xl">
                        Reconhecimento passivo de domínio com o theHarvester: subdomínios/hosts, e-mails, IPs, URLs,
                        pessoas e vazamentos a partir de fontes abertas (Certificate Transparency, indexadores, DNS
                        datasets). Processamento assíncrono com recursos limitados.
                    </p>
                </div>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex gap-3">
                    <input
                        type="text"
                        placeholder="Digite o domínio (ex.: example.com)"
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !loading && runScan()}
                        className="flex-1 rounded-xl bg-[#0b1220] border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                    />
                    <button
                        onClick={runScan}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-[#05070f] text-sm font-semibold shadow-lg shadow-cyan-500/30 hover:brightness-110 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {loading ? 'Iniciando...' : 'Iniciar Recon'}
                    </button>
                </div>
                {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <button
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-cyan-300"
                >
                    <SlidersHorizontal className="w-4 h-4" />
                    Opções avançadas
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>

                {showAdvanced && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label
                            className={`flex items-start gap-3 rounded-xl border p-3 md:col-span-2 ${
                                apiConfig.apiEnabled
                                    ? 'border-white/10 bg-[#0b1220] cursor-pointer'
                                    : 'border-white/5 bg-white/[0.02] opacity-70'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={useApi}
                                disabled={!apiConfig.apiEnabled}
                                onChange={(e) => handleApiToggle(e.target.checked)}
                                className="mt-0.5 accent-cyan-400"
                            />
                            <span>
                                <span className="text-sm text-white flex items-center gap-2">
                                    <KeyRound className="w-3.5 h-3.5 text-cyan-400" /> Usar fontes com API (keyed)
                                </span>
                                <span className="block text-xs text-gray-500">
                                    {apiConfig.apiEnabled
                                        ? `Habilita fontes que exigem chave (${
                                              activeKeyCount
                                          } ativa(s) de ${apiConfig.keys.length} cadastrada(s)). Sem isso, o recon roda só com fontes keyless.`
                                        : 'Integração desabilitada neste deploy (defina HARVESTER_API_ENABLED=true no .env e reinicie).'}
                                </span>
                            </span>
                        </label>

                        <label className="block md:col-span-2">
                            <span className="text-xs uppercase tracking-widest text-gray-500">Conjunto de fontes</span>
                            <select
                                value={preset}
                                onChange={(e) => setPreset(e.target.value)}
                                className="mt-1 w-full rounded-xl bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                            >
                                {HARVEST_PRESETS.map((p) => (
                                    <option key={p.id} value={p.id} disabled={Boolean(p.requiresApi) && !useApi}>
                                        {p.label} ({p.sources.length}){p.requiresApi ? ' — requer API' : ''}
                                    </option>
                                ))}
                                <option value="custom">Personalizado…</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                {preset === 'custom'
                                    ? 'Informe nomes de fontes/capacidades separados por vírgula (ex.: crtsh, certspotter, duckduckgo).'
                                    : getHarvestPreset(preset)?.description}
                            </p>
                        </label>

                        {preset === 'custom' && (
                            <label className="block md:col-span-2">
                                <span className="text-xs uppercase tracking-widest text-gray-500">Fontes (separadas por vírgula)</span>
                                <input
                                    type="text"
                                    value={customSources}
                                    onChange={(e) => setCustomSources(e.target.value)}
                                    placeholder="crtsh, certspotter, duckduckgo, rapiddns"
                                    className="mt-1 w-full rounded-xl bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                                />
                            </label>
                        )}

                        <label className="block rounded-xl border border-white/10 bg-[#0b1220] p-3">
                            <span className="text-sm text-white">Limite de resultados (-l)</span>
                            <input
                                type="number"
                                min={0}
                                max={5000}
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                                className="mt-1 w-full rounded-lg bg-[#05070f] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                            />
                            <span className="block text-xs text-gray-500 mt-1">Limite de resultados de busca por fonte (0 = sem limite). Nem toda fonte respeita.</span>
                        </label>

                        <label className="block rounded-xl border border-white/10 bg-[#0b1220] p-3">
                            <span className="text-sm text-white">Fontes em paralelo</span>
                            <input
                                type="number"
                                min={1}
                                max={10}
                                value={sourceWorkers}
                                onChange={(e) => setSourceWorkers(Number(e.target.value))}
                                className="mt-1 w-full rounded-lg bg-[#05070f] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                            />
                            <span className="block text-xs text-gray-500 mt-1">Workers de coleta (1–10).</span>
                        </label>

                        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0b1220] p-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={noHosts}
                                onChange={(e) => setNoHosts(e.target.checked)}
                                className="mt-0.5 accent-cyan-400"
                            />
                            <span>
                                <span className="text-sm text-white">Ocultar hosts/subdomínios</span>
                                <span className="block text-xs text-gray-500">Ignora hostnames e foca nos demais tipos (--no-hosts).</span>
                            </span>
                        </label>

                        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0b1220] p-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={quiet}
                                onChange={(e) => setQuiet(e.target.checked)}
                                className="mt-0.5 accent-cyan-400"
                            />
                            <span>
                                <span className="text-sm text-white">Modo silencioso</span>
                                <span className="block text-xs text-gray-500">Suprime avisos de chave de API ausente (-q).</span>
                            </span>
                        </label>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <button
                    onClick={() => setShowKeys((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-cyan-300"
                >
                    <KeyRound className="w-4 h-4" />
                    Integração de API — chaves dos provedores
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showKeys ? 'rotate-180' : ''}`} />
                    <span
                        className={`ml-2 px-2 py-0.5 rounded text-[10px] border ${
                            apiConfig.apiEnabled
                                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                                : 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                        }`}
                    >
                        {apiConfig.apiEnabled ? `habilitada · ${activeKeyCount} ativa(s)` : 'integração desabilitada'}
                    </span>
                </button>

                {showKeys && (
                    <div className="mt-4 space-y-4">
                        {!apiConfig.apiEnabled && (
                            <p className="text-xs text-amber-400">
                                A integração de API está desligada no deploy. Defina <code>HARVESTER_API_ENABLED=true</code> no{' '}
                                <code>.env</code> e reinicie os serviços para usá-la. As chaves abaixo continuam guardadas.
                            </p>
                        )}
                        {!canManageKeys && (
                            <p className="text-xs text-gray-500">
                                Somente administradores podem cadastrar, editar ou remover chaves.
                            </p>
                        )}

                        {canManageKeys && (
                            <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">
                                    Adicionar / atualizar chave
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="block">
                                        <span className="text-xs text-gray-400">Provedor</span>
                                        <select
                                            value={keyProvider}
                                            onChange={(e) => {
                                                setKeyProvider(e.target.value);
                                                setKeyFields({});
                                                setKeyErr(null);
                                                setKeyMsg(null);
                                            }}
                                            className="mt-1 w-full rounded-lg bg-[#05070f] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                                        >
                                            <option value="">Selecione…</option>
                                            {apiConfig.providers.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    {selectedKeyProvider?.fields.map((f) => (
                                        <label key={f.name} className="block">
                                            <span className="text-xs text-gray-400">{f.label}</span>
                                            <input
                                                type="password"
                                                autoComplete="off"
                                                value={keyFields[f.name] || ''}
                                                onChange={(e) =>
                                                    setKeyFields((prev) => ({ ...prev, [f.name]: e.target.value }))
                                                }
                                                placeholder={f.name}
                                                className="mt-1 w-full rounded-lg bg-[#05070f] border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                                            />
                                        </label>
                                    ))}
                                </div>
                                <div className="flex items-center gap-3 mt-3 flex-wrap">
                                    <button
                                        onClick={saveKey}
                                        disabled={savingKey || !keyProvider}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-[#05070f] text-sm font-semibold disabled:opacity-50"
                                    >
                                        {savingKey ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Plus className="w-4 h-4" />
                                        )}
                                        Salvar chave
                                    </button>
                                    {keyMsg && <span className="text-xs text-emerald-400">{keyMsg}</span>}
                                    {keyErr && <span className="text-xs text-rose-400">{keyErr}</span>}
                                </div>
                            </div>
                        )}

                        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Chaves cadastradas</div>
                            {apiConfig.keys.length === 0 ? (
                                <p className="text-xs text-gray-500">Nenhuma chave cadastrada.</p>
                            ) : (
                                <div className="space-y-2">
                                    {apiConfig.keys.map((k) => (
                                        <div
                                            key={k.provider}
                                            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2"
                                        >
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <ShieldCheck
                                                        className={`w-3.5 h-3.5 ${k.enabled ? 'text-emerald-400' : 'text-gray-600'}`}
                                                    />
                                                    <span className="text-sm text-white">{k.label}</span>
                                                    {!k.enabled && (
                                                        <span className="text-[10px] text-gray-500">(desativada)</span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-gray-500 truncate">
                                                    {Object.entries(k.fields)
                                                        .map(([f, v]) => `${f}: ${v}`)
                                                        .join(' · ') || '—'}
                                                </div>
                                            </div>
                                            {canManageKeys && (
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        onClick={() => toggleKeyEnabled(k.provider, !k.enabled)}
                                                        title={k.enabled ? 'Desativar' : 'Ativar'}
                                                        className={`p-1.5 rounded-lg border ${
                                                            k.enabled
                                                                ? 'border-emerald-500/30 text-emerald-400'
                                                                : 'border-white/10 text-gray-500'
                                                        } hover:border-cyan-400/40`}
                                                    >
                                                        <Power className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteKey(k.provider)}
                                                        title="Remover"
                                                        className="p-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:border-rose-400/60"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Recons Recentes</h3>
                    {hasActive && (
                        <div className="text-xs text-amber-400 flex items-center gap-2">
                            <Loader2 className="w-3 h-3 animate-spin" /> Atualizando...
                        </div>
                    )}
                </div>
                {activeScan && (
                    <div className="mb-4">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                            <span>
                                Processando #{activeScan.id} • {activeScan.target}
                            </span>
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
                                <th className="text-left py-2 px-2">Alvo</th>
                                <th className="text-left py-2 px-2">Status</th>
                                <th className="text-left py-2 px-2">Resultados</th>
                                <th className="text-left py-2 px-2">Tempo</th>
                                <th className="text-left py-2 px-2">Criado em</th>
                                <th className="text-left py-2 px-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {scans.map((s) => (
                                <tr key={s.id} className={`border-b border-white/5 hover:bg-white/5 ${selectedId === s.id ? 'bg-cyan-400/5' : ''}`}>
                                    <td className="py-2 px-2 text-gray-500">{s.id}</td>
                                    <td className="py-2 px-2">
                                        <div className="text-white font-medium">{s.target}</div>
                                        {describeOptions(s.options).length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {describeOptions(s.options).map((c) => (
                                                    <span key={c} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-gray-400">
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-2 px-2">
                                        <span className={`px-2 py-0.5 rounded text-xs border ${statusBadge(s.status)}`}>{s.status}</span>
                                    </td>
                                    <td className="py-2 px-2 text-cyan-400">{s.resultCount}</td>
                                    <td className="py-2 px-2 text-gray-400">{s.executionTimeMs || 0}ms</td>
                                    <td className="py-2 px-2 text-gray-400">{new Date(s.createdAt).toLocaleString()}</td>
                                    <td className="py-2 px-2">
                                        <button
                                            onClick={() => {
                                                setSelectedId(selectedId === s.id ? null : s.id);
                                                setTypeFilter(null);
                                            }}
                                            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                                        >
                                            {selectedId === s.id ? 'Fechar' : 'Ver resultados'}{' '}
                                            <ChevronDown className={`w-3 h-3 transition-transform ${selectedId === s.id ? 'rotate-180' : ''}`} />
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
                            <h3 className="font-semibold">Dashboard - {selectedScan.target}</h3>
                            <p className="text-xs text-gray-500 mt-1">
                                ID #{selectedScan.id} • {selectedScan.status}
                                {selectedScan.evidenceStatus ? ` • evidência: ${selectedScan.evidenceStatus}` : ''}
                            </p>
                            {describeOptions(selectedScan.options).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {describeOptions(selectedScan.options).map((c) => (
                                        <span key={c} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-gray-300">
                                            {c}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={copyMarkdown}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:border-cyan-400/40 hover:text-cyan-300"
                            >
                                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                {copied ? 'Copiado!' : 'Copiar (Markdown)'}
                            </button>
                            <button
                                onClick={exportCsv}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:border-cyan-400/40 hover:text-cyan-300"
                            >
                                <Download className="w-4 h-4" /> Exportar CSV
                            </button>
                            <button
                                onClick={exportPdf}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-sm text-gray-300 hover:border-cyan-400/40 hover:text-cyan-300"
                            >
                                <FileText className="w-4 h-4" /> Exportar PDF
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.keys(counts)
                            .filter((k) => counts[k] > 0)
                            .map((k) => {
                                const meta = TYPE_META[k] || { label: k, icon: Globe, color: 'text-slate-300' };
                                const Icon = meta.icon;
                                return (
                                    <div key={k} className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs uppercase tracking-widest text-gray-500">{meta.label}</div>
                                            <Icon className={`w-4 h-4 ${meta.color}`} />
                                        </div>
                                        <div className="text-2xl font-bold mt-1">{counts[k]}</div>
                                    </div>
                                );
                            })}
                        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                            <div className="flex items-center justify-between">
                                <div className="text-xs uppercase tracking-widest text-gray-500">Total</div>
                                <Target className="w-4 h-4 text-cyan-400" />
                            </div>
                            <div className="text-2xl font-bold mt-1">{selectedScan.resultCount}</div>
                        </div>
                    </div>

                    {sourceStatus.length > 0 && (
                        <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4">
                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Fontes consultadas</div>
                            <div className="flex flex-wrap gap-2">
                                {sourceStatus.map((se) => (
                                    <span
                                        key={se.source}
                                        title={`${se.status} • ${se.resultCount} resultado(s)${se.errorType ? ` • erro: ${se.errorType}` : ''}`}
                                        className={`px-2 py-1 rounded-lg border text-[11px] ${
                                            se.status === 'completed'
                                                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                                                : se.status === 'failed'
                                                  ? 'border-rose-500/30 text-rose-400 bg-rose-500/10'
                                                  : 'border-white/10 text-gray-400 bg-white/5'
                                        }`}
                                    >
                                        {se.source} · {se.resultCount}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="rounded-xl border border-white/10 bg-[#0b1220] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setTypeFilter(null)}
                                    className={`px-2.5 py-1 rounded-lg text-xs border ${typeFilter === null ? 'border-cyan-400/50 text-cyan-300 bg-cyan-400/10' : 'border-white/10 text-gray-400'}`}
                                >
                                    Todos
                                </button>
                                {typeOptions.map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setTypeFilter(t)}
                                        className={`px-2.5 py-1 rounded-lg text-xs border ${typeFilter === t ? 'border-cyan-400/50 text-cyan-300 bg-cyan-400/10' : 'border-white/10 text-gray-400'}`}
                                    >
                                        {typeLabel(t)} ({counts[t] ?? 0})
                                    </button>
                                ))}
                            </div>
                            {resultsLoading && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    value={resultQuery}
                                    onChange={(e) => setResultQuery(e.target.value)}
                                    placeholder="Filtrar por valor ou fonte..."
                                    className="w-full rounded-lg bg-[#05070f] border border-white/10 pl-9 pr-3 py-2 text-xs text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                                />
                            </div>
                            <select
                                value={sourceFilter || ''}
                                onChange={(e) => setSourceFilter(e.target.value || null)}
                                className="rounded-lg bg-[#05070f] border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400/50"
                            >
                                <option value="">Todas as fontes</option>
                                {availableSources.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                            <span className="text-[11px] text-gray-500">
                                {visibleResults.length} de {results.length}
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-gray-500 border-b border-white/10">
                                        <th className="text-left py-2 px-2">Tipo</th>
                                        <th className="text-left py-2 px-2">Valor</th>
                                        <th className="text-left py-2 px-2">Fontes</th>
                                        <th className="text-left py-2 px-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleResults.map((r) => (
                                        <Fragment key={r.id}>
                                            <tr className="border-b border-white/5 hover:bg-white/5">
                                                <td className="py-2 px-2">
                                                    <span className="px-2 py-0.5 rounded text-[11px] border border-white/10 text-gray-300">
                                                        {typeLabel(r.resultType)}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-2 text-white break-all">
                                                    {r.resultType === 'url' ? (
                                                        <a
                                                            href={r.value}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-cyan-400 hover:text-cyan-300"
                                                        >
                                                            {r.value}
                                                        </a>
                                                    ) : (
                                                        r.value
                                                    )}
                                                </td>
                                                <td className="py-2 px-2">
                                                    <div className="flex flex-wrap gap-1">
                                                        {(r.sources || []).map((src) => (
                                                            <span key={src} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-gray-400">
                                                                {src}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="py-2 px-2">
                                                    {r.details ? (
                                                        <button
                                                            onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                                                            className="text-xs text-cyan-400 hover:text-cyan-300"
                                                        >
                                                            {expandedId === r.id ? 'Ocultar' : 'Detalhes'}
                                                        </button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                            {expandedId === r.id && r.details ? (
                                                <tr className="border-b border-white/5 bg-black/20">
                                                    <td colSpan={4} className="py-2 px-2">
                                                        <pre className="text-[11px] text-gray-300 whitespace-pre-wrap break-all max-h-64 overflow-auto">
                                                            {JSON.stringify(r.details, null, 2)}
                                                        </pre>
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </Fragment>
                                    ))}
                                    {visibleResults.length === 0 && !resultsLoading && (
                                        <tr>
                                            <td colSpan={4} className="py-6 text-center text-gray-500 text-sm">
                                                Nenhum resultado para exibir.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}
