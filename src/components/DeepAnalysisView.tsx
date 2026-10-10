'use client';

import { useCallback, useRef, useState } from 'react';
import {
    GitBranch,
    FolderArchive,
    Upload,
    Play,
    ShieldAlert,
    CheckCircle2,
    Download,
    Copy,
    Loader2,
    ChevronDown,
    Eye,
    EyeOff,
    FileText,
    Activity,
    Sparkles,
    Filter,
} from 'lucide-react';
import type { DeepAnalysisResult, DeepPillarId, DeepSeverity } from '@/types/deepAnalysis';
import { DEEP_PILLAR_LABEL } from '@/types/deepAnalysis';

const SEV_STYLE: Record<
    DeepSeverity,
    { label: string; badge: string; bar: string; chip: string; count: string; ring: string }
> = {
    CRITICA: {
        label: 'Crítica',
        badge: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        bar: 'bg-rose-500',
        chip: 'border-rose-500/40 text-rose-300',
        count: 'text-rose-400',
        ring: 'border-rose-500/40',
    },
    ALTA: {
        label: 'Alta',
        badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        bar: 'bg-orange-500',
        chip: 'border-orange-500/40 text-orange-300',
        count: 'text-orange-400',
        ring: 'border-orange-500/40',
    },
    MEDIA: {
        label: 'Média',
        badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        bar: 'bg-amber-500',
        chip: 'border-amber-500/40 text-amber-300',
        count: 'text-amber-400',
        ring: 'border-amber-500/40',
    },
    BAIXA: {
        label: 'Baixa',
        badge: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
        bar: 'bg-slate-400',
        chip: 'border-slate-500/40 text-slate-300',
        count: 'text-slate-400',
        ring: 'border-slate-500/40',
    },
    PONTO_FORTE: {
        label: 'Ponto forte',
        badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        bar: 'bg-emerald-500',
        chip: 'border-emerald-500/40 text-emerald-300',
        count: 'text-emerald-400',
        ring: 'border-emerald-500/40',
    },
};

const PILLAR_STYLE: Record<
    DeepPillarId,
    { bar: string; chip: string; iconBg: string }
> = {
    banco: { bar: 'bg-rose-500', chip: 'bg-rose-500/10 text-rose-300 border-rose-500/30', iconBg: 'bg-rose-500/15' },
    permissoes: { bar: 'bg-orange-500', chip: 'bg-orange-500/10 text-orange-300 border-orange-500/30', iconBg: 'bg-orange-500/15' },
    idor: { bar: 'bg-purple-500', chip: 'bg-purple-500/10 text-purple-300 border-purple-500/30', iconBg: 'bg-purple-500/15' },
    chaves: { bar: 'bg-yellow-500', chip: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30', iconBg: 'bg-yellow-500/15' },
    inputs: { bar: 'bg-sky-500', chip: 'bg-sky-500/10 text-sky-300 border-sky-500/30', iconBg: 'bg-sky-500/15' },
};

const STAGES = [
    'Preparação da origem (upload/clone)',
    'Detecção de stack',
    'Varredura SAST (5 pilares)',
    'Gerando o relatório',
];

export default function DeepAnalysisView() {
    const [tab, setTab] = useState<'git' | 'zip'>('git');
    const [gitUrl, setGitUrl] = useState('');
    const [branch, setBranch] = useState('');
    const [token, setToken] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [projectName, setProjectName] = useState('');
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [stage, setStage] = useState(0);
    const [error, setError] = useState('');
    const [result, setResult] = useState<DeepAnalysisResult | null>(null);
    const [pillarFilter, setPillarFilter] = useState<'todos' | DeepPillarId>('todos');
    const [sevFilter, setSevFilter] = useState<'todas' | DeepSeverity>('todas');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [copied, setCopied] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const toggleExpanded = useCallback((id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const runAnalysis = async () => {
        setError('');
        setResult(null);
        setAnalyzing(true);
        setStage(0);

        const timer = window.setInterval(() => {
            setStage((s) => Math.min(STAGES.length - 1, s + 1));
        }, 750);

        try {
            let res: Response;
            if (tab === 'git') {
                if (!gitUrl.trim()) throw new Error('Informe a URL do repositório Git.');
                res = await fetch('/api/admin/deep-analysis/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        repositoryUrl: gitUrl.trim(),
                        branch: branch.trim() || undefined,
                        apiToken: token.trim() || undefined,
                        projectName: projectName.trim() || undefined,
                    }),
                });
            } else {
                if (!zipFile) throw new Error('Selecione um arquivo .zip/.tar/.tar.gz/.tgz.');
                const fd = new FormData();
                fd.append('file', zipFile);
                fd.append(
                    'projectName',
                    projectName.trim() || zipFile.name.replace(/\.[^.]+$/, '') || 'Projeto enviado'
                );
                res = await fetch('/api/admin/deep-analysis/scan', { method: 'POST', body: fd });
            }

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || data.details || 'Falha ao executar a análise.');
            }
            setStage(STAGES.length - 1);
            await new Promise((r) => setTimeout(r, 450));
            setResult(data as DeepAnalysisResult);
        } catch (e: any) {
            setError(e?.message || 'Falha ao executar a análise.');
        } finally {
            window.clearInterval(timer);
            setAnalyzing(false);
        }
    };

    const copyIssue = async (id: string, md: string) => {
        try {
            await navigator.clipboard.writeText(md);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = md;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopied(id);
        window.setTimeout(() => setCopied(null), 1600);
    };

    const filteredFindings = (result?.findings || [])
        .filter((f) => (pillarFilter === 'todos' ? true : f.pillar === pillarFilter))
        .filter((f) => (sevFilter === 'todas' ? true : f.severity === sevFilter));

const severityOrder: DeepSeverity[] = ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'];
const SEV_SUMMARY_KEY: Record<DeepSeverity, 'critica' | 'alta' | 'media' | 'baixa' | 'strengths'> = {
    CRITICA: 'critica',
    ALTA: 'alta',
    MEDIA: 'media',
    BAIXA: 'baixa',
    PONTO_FORTE: 'strengths',
};
const summary = result?.summary;

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                            <FileText className="w-4 h-4" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight">Análise Profunda de Código</h2>
                    </div>
                    <p className="text-sm text-gray-400 mt-2 max-w-2xl">
                        Revise o código-fonte — via repositório Git ou arquivo ZIP — contra os 5 pilares: banco sem
                        tranca, permissões frouxas, IDOR, chave no código e inputs sem filtro.
                    </p>
                </div>
                {result?.id && (
                    <a
                        href={`/api/admin/deep-analysis/${result.id}/report/pdf`}
                        className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 text-[#05070f] text-sm font-semibold hover:bg-cyan-400 transition"
                    >
                        <Download className="w-4 h-4" /> Exportar PDF
                    </a>
                )}
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-1 border-b border-white/10 pb-4 mb-5">
                    {(
                        [
                            { id: 'git', label: 'Repositório Git', icon: GitBranch },
                            { id: 'zip', label: 'Envio de ZIP/TAR', icon: FolderArchive },
                        ] as const
                    ).map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
                                tab === t.id
                                    ? 'bg-cyan-400/10 text-cyan-300 border border-cyan-400/20'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            <t.icon className="w-4 h-4" /> {t.label}
                        </button>
                    ))}
                </div>

                {tab === 'git' ? (
                    <div className="grid md:grid-cols-2 gap-4">
                        <label className="md:col-span-2 block">
                            <span className="text-xs uppercase tracking-widest text-gray-500">URL do repositório *</span>
                            <input
                                value={gitUrl}
                                onChange={(e) => setGitUrl(e.target.value)}
                                placeholder="https://github.com/empresa/projeto.git"
                                className="mt-2 w-full rounded-xl bg-[#0b1220] border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs uppercase tracking-widest text-gray-500">Branch (opcional)</span>
                            <input
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                placeholder="main"
                                className="mt-2 w-full rounded-xl bg-[#0b1220] border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs uppercase tracking-widest text-gray-500">Token de acesso (repo privado)</span>
                            <div className="relative mt-2">
                                <input
                                    type={showToken ? 'text' : 'password'}
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="ghp_… / glpat-… "
                                    className="w-full rounded-xl bg-[#0b1220] border border-white/10 px-4 py-3 pr-11 text-sm text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                >
                                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </label>
                    </div>
                ) : (
                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            const f = e.dataTransfer.files?.[0];
                            if (f) setZipFile(f);
                        }}
                        onClick={() => fileRef.current?.click()}
                        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
                            dragOver
                                ? 'border-cyan-400/60 bg-cyan-400/5'
                                : zipFile
                                  ? 'border-emerald-500/40 bg-emerald-500/5'
                                  : 'border-white/10 hover:border-white/25'
                        }`}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".zip,.tar,.tar.gz,.tgz,application/zip,application/x-tar"
                            className="hidden"
                            onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                        />
                        <Upload className="w-9 h-9 text-cyan-400 mx-auto mb-3" />
                        {zipFile ? (
                            <p className="text-emerald-400 font-medium text-sm">{zipFile.name}</p>
                        ) : (
                            <p className="text-gray-300 text-sm">
                                Arraste um arquivo ou clique para selecionar
                                <span className="block text-gray-500 text-xs mt-1">
                                    .zip, .tar, .tar.gz ou .tgz · até 50MB
                                </span>
                            </p>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap items-end gap-4 mt-5">
                    <label className="flex-1 min-w-56 block">
                        <span className="text-xs uppercase tracking-widest text-gray-500">Nome do projeto</span>
                        <input
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            placeholder="app-convenio (opcional, auto-detectável)"
                            className="mt-2 w-full rounded-xl bg-[#0b1220] border border-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-cyan-400/50"
                        />
                    </label>
                    <button
                        onClick={runAnalysis}
                        disabled={analyzing}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-[#05070f] text-sm font-semibold shadow-lg shadow-cyan-500/30 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        {analyzing ? 'Analisando…' : 'Analisar código'}
                    </button>
                </div>

                {error && (
                    <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-300 text-sm">
                        {error}
                    </div>
                )}

                {analyzing && (
                    <div className="mt-6 space-y-3">
                        {STAGES.map((label, i) => {
                            const isActive = i === stage;
                            const isLast = i === STAGES.length - 1 && result !== null;
                            return (
                                <div
                                    key={label}
                                    className="flex items-center gap-3 text-sm"
                                >
                                    {i <= stage || isLast ? (
                                        isLast ? (
                                            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                                <CheckCircle2 className="w-4 h-4" />
                                            </span>
                                        ) : (
                                            <span className="w-5 h-5 rounded-full bg-cyan-400/20 text-cyan-300 flex items-center justify-center">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            </span>
                                        )
                                    ) : (
                                        <span className="w-5 h-5 rounded-full bg-white/10 text-gray-500 flex items-center justify-center text-[10px]">
                                            {i + 1}
                                        </span>
                                    )}
                                    <span className={isActive || isLast ? 'text-white' : 'text-gray-500'}>
                                        {label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {result && summary && (
                <>
                    <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {severityOrder.map((sev) => (
                            <div
                                key={sev}
                                className={`rounded-2xl border bg-white/[0.03] p-4 border-white/10 ${SEV_STYLE[sev].ring}`}
                            >
                                <div className={`h-1 w-10 rounded-full ${SEV_STYLE[sev].bar}`} />
                                <div className="text-[11px] uppercase tracking-widest text-gray-500 mt-3">
                                    {SEV_STYLE[sev].label}
                                </div>
                                <div className={`text-3xl font-bold mt-1 ${SEV_STYLE[sev].count}`}>
                                    {summary[SEV_SUMMARY_KEY[sev]]}
                                </div>
                                <div className="text-[11px] text-gray-500 mt-1">
                                    {summary.total > 0 ? `${Math.round((summary[SEV_SUMMARY_KEY[sev]] / summary.total) * 100)}% dos achados` : 'sem achados'}
                                </div>
                            </div>
                        ))}
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Sparkles className="w-4 h-4 text-cyan-400" />
                            <h3 className="font-semibold">Tecnologias detectadas</h3>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                            {[
                                ['Linguagem', result.stack.language || '—'],
                                ['Framework', result.stack.framework || '—'],
                                ['ORM', result.stack.orm || '—'],
                                ['Banco de dados', result.stack.database || '—'],
                                ['Autenticação', result.stack.auth || '—'],
                                ['Arquivos analisados', `${result.fileCount} (${summary.scannedFiles ?? result.fileCount} lidos)`],
                            ].map(([k, v]) => (
                                <div key={k} className="rounded-xl bg-[#0b1220] border border-white/10 px-4 py-3">
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500">{k}</div>
                                    <div className="text-white mt-1 font-medium truncate">{v}</div>
                                </div>
                            ))}
                            <div className="md:col-span-3 rounded-xl bg-[#0b1220] border border-white/10 px-4 py-3">
                                <div className="text-[10px] uppercase tracking-widest text-gray-500">Deploy / CI</div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {result.stack.deploy?.map((d) => (
                                        <span
                                            key={d}
                                            className="px-2.5 py-1 rounded-lg bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 text-xs"
                                        >
                                            {d}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldAlert className="w-4 h-4 text-rose-400" />
                            <h3 className="font-semibold">Achados ({result.findings.length})</h3>
                        </div>
                        <div className="grid md:grid-cols-5 gap-2 mb-4">
                            {(Object.keys(DEEP_PILLAR_LABEL) as DeepPillarId[]).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPillarFilter(pillarFilter === p ? 'todos' : p)}
                                    className={`rounded-xl border px-3 py-2 text-left transition ${
                                        pillarFilter === p
                                            ? PILLAR_STYLE[p].chip
                                            : 'border-white/10 bg-[#0b1220] text-gray-400 hover:text-white'
                                    }`}
                                >
                                    <div className="text-[11px] font-medium leading-tight">
                                        {DEEP_PILLAR_LABEL[p]}
                                    </div>
                                    <div className="mt-1 flex items-center justify-between">
                                        <span className="text-lg font-bold">{summary[p]}</span>
                                        <span className={`h-1.5 w-8 rounded-full ${PILLAR_STYLE[p].bar}`} />
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 mb-4">
                            <Filter className="w-4 h-4 text-gray-500" />
                            <select
                                value={pillarFilter}
                                onChange={(e) => setPillarFilter(e.target.value as typeof pillarFilter)}
                                className="rounded-xl bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                            >
                                <option value="todos">Todos os pilares</option>
                                {(Object.keys(DEEP_PILLAR_LABEL) as DeepPillarId[]).map((p) => (
                                    <option key={p} value={p}>
                                        {DEEP_PILLAR_LABEL[p]}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={sevFilter}
                                onChange={(e) => setSevFilter(e.target.value as typeof sevFilter)}
                                className="rounded-xl bg-[#0b1220] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                            >
                                <option value="todas">Todas as severidades</option>
                                {severityOrder.map((s) => (
                                    <option key={s} value={s}>
                                        {SEV_STYLE[s].label}
                                    </option>
                                ))}
                            </select>
                            <span className="ml-auto text-xs text-gray-500">
                                {filteredFindings.length} exibidos
                            </span>
                        </div>

                        {filteredFindings.length === 0 && (
                            <div className="rounded-xl border border-white/10 bg-[#0b1220] p-8 text-center text-gray-400 text-sm">
                                Nenhum achado para os filtros atuais.
                            </div>
                        )}

                        <div className="space-y-3">
                            {filteredFindings.map((f) => {
                                const open = expanded.has(f.id);
                                return (
                                    <div
                                        key={f.id}
                                        className="rounded-2xl border border-white/10 bg-[#0b1220] overflow-hidden"
                                    >
                                        <button
                                            onClick={() => toggleExpanded(f.id)}
                                            className="w-full flex items-start gap-3 px-4 py-3.5 text-left"
                                        >
                                            <span className={`h-full w-1 self-stretch rounded-full ${SEV_STYLE[f.severity].bar} mt-1`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide ${SEV_STYLE[f.severity].badge}`}>
                                                        {SEV_STYLE[f.severity].label}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-medium ${PILLAR_STYLE[f.pillar].chip}`}>
                                                        {DEEP_PILLAR_LABEL[f.pillar]}
                                                    </span>
                                                    <span className="text-gray-500 font-mono text-xs">{f.filePath}:{f.line}</span>
                                                </div>
                                                <div className="text-sm text-white mt-1.5 font-medium">{f.title}</div>
                                            </div>
                                            <ChevronDown
                                                className={`w-4 h-4 mt-1 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
                                            />
                                        </button>
                                        {open && (
                                            <div className="px-4 pb-4 pl-8 space-y-3">
                                                <div className="rounded-xl bg-black/40 border border-white/10 p-3 font-mono text-[11px] leading-5 text-cyan-200 break-all whitespace-pre-wrap">
                                                    {f.code}
                                                </div>
                                                <div className="text-xs text-gray-400 leading-5">
                                                    <span className="text-gray-500">Por que é explorável → </span>
                                                    {f.why}
                                                </div>
                                                <div className="text-xs text-emerald-300 leading-5">
                                                    <span className="text-emerald-600">Correção → </span>
                                                    {f.fix}
                                                </div>
                                                {f.snippet && f.snippet.length > 0 && (
                                                    <div className="grid gap-1">
                                                        {f.snippet.map((s, i) => (
                                                            <div key={i} className="font-mono text-[11px] text-gray-500 bg-[#05070f] border border-white/5 rounded px-2 py-1">
                                                                {s}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => copyIssue(f.id, f.githubMd)}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-300 hover:border-cyan-400/40 hover:text-cyan-300 transition"
                                                >
                                                    {copied === f.id ? (
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                                    ) : (
                                                        <Copy className="w-3.5 h-3.5" />
                                                    )}
                                                    {copied === f.id ? 'Issue copiada' : 'Copiar issue Markdown (GitHub)'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {result.strengths.length > 0 && (
                        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                            <div className="flex items-center gap-2 mb-1">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <h3 className="font-semibold text-emerald-300">
                                    Práticas positivas detectadas ({result.strengths.length})
                                </h3>
                            </div>
                            <p className="text-xs text-gray-500 mb-4">
                                Sinais de boas práticas encontrados no código — mantenha e estenda.
                            </p>
                            <div className="grid md:grid-cols-2 gap-3">
                                {result.strengths.map((s) => (
                                    <div key={s.id} className="rounded-xl bg-[#0b1220] border border-white/10 p-4">
                                        <div className="flex items-start gap-2">
                                            <Sparkles className="w-4 h-4 text-emerald-400 mt-0.5" />
                                            <div>
                                                <div className="text-sm text-emerald-200 font-medium">{s.title}</div>
                                                <div className="text-[11px] font-mono text-gray-500 mt-1">
                                                    {s.filePath}:{s.line}
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-2 leading-5">{s.why}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <div className="flex items-center gap-2 text-[11px] text-gray-600 pb-2">
                        <Activity className="w-3.5 h-3.5" />
                        {summary.sastModel} · {result.durationMs}ms
                        {result.sourceType === 'git' && result.repositoryUrl ? (
                            <span>
                                · {result.repositoryUrl} {result.branch ? `(@${result.branch})` : ''}
                            </span>
                        ) : (
                            <span>· código enviado (ZIP/TAR)</span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}