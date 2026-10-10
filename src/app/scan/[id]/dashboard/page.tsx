'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    Shield,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Globe,
    Lock,
    Cookie,
    ChevronLeft,
    Loader2,
    Server,
    Activity,
    ShieldCheck,
    ShieldAlert,
    LifeBuoy,
    ListChecks,
    FileWarning,
    HardDrive,
    Gauge,
    Archive,
    ArchiveRestore,
    Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Navigation from '@/components/Navigation';
import { ExportPdfButton } from '@/components/ExportPdfButton';

const GRADE_HEX: Record<string, string> = {
    A: '#22c55e',
    B: '#34d399',
    C: '#eab308',
    D: '#fb923c',
    E: '#f87171',
    F: '#dc2626',
};

const GRADE_LABEL: Record<string, string> = {
    A: 'EXCELENTE',
    B: 'BOM',
    C: 'REGULAR',
    D: 'FRACO',
    E: 'CRÍTICO',
    F: 'CRÍTICO',
};

const SEV_COLORS: Record<string, string> = {
    critical: '#B91C1C',
    high: '#EA580C',
    medium: '#D97706',
    low: '#2563EB',
    info: '#64748b',
};

const SEV_LABELS: Record<string, string> = {
    critical: 'CRÍTICA',
    high: 'ALTA',
    medium: 'MÉDIA',
    low: 'BAIXA',
    info: 'INFO',
};

function getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    if (score >= 40) return 'E';
    return 'F';
}

function severityOf(text: string): keyof typeof SEV_COLORS {
    const lower = String(text).toLowerCase();
    if (lower.includes('critical') || lower.includes('crítica') || lower.includes('grave')) return 'critical';
    if (lower.includes('high') || lower.includes('alta')) return 'high';
    if (lower.includes('medium') || lower.includes('média')) return 'medium';
    if (lower.includes('low') || lower.includes('baixa')) return 'low';
    if (lower.includes('hsts') || lower.includes('content-security') || lower.includes('spf') || lower.includes('dmarc')) return 'medium';
    return 'info';
}

export default function ScanDashboardPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [scan, setScan] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/scan/${params.id}`)
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return;
                if (data.error) setError(data.error);
                else setScan(data);
            })
            .catch(() => !cancelled && setError('Erro ao carregar dados'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [params.id]);

    if (loading) {
        return (
            <div className="text-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
                <p className="text-gray-400">Carregando dashboard...</p>
            </div>
        );
    }

    if (error || !scan) {
        return (
            <div className="text-center py-24">
                <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">Erro</h3>
                <p className="text-gray-400">{error || 'Scan não encontrado'}</p>
                <button onClick={() => router.push('/')} className="mt-4 text-blue-400 hover:text-blue-300">
                    Voltar à Home
                </button>
            </div>
        );
    }

    const grade = scan.grade || getGrade(Number(scan.score) || 0);
    const score = Number(scan.score) || 0;
    const gradeColor = GRADE_HEX[grade] || '#94a3b8';

    const headers = Array.isArray(scan.headers) ? scan.headers : [];
    const cookies = Array.isArray(scan.cookies) ? scan.cookies : [];
    const vulns = Array.isArray(scan.vulnerabilities) ? scan.vulnerabilities : [];
    const techs = Array.isArray(scan.technology) ? scan.technology : [];
    const cves = Array.isArray(scan.cveMatches) ? scan.cveMatches : [];
    const dns = scan.dns || {};
    const records = Array.isArray(dns.records) ? dns.records : [];
    const subdomains = Array.isArray(dns.subdomains) ? dns.subdomains : [];
    const tls = scan.tls || {};
    const plan = scan.contingencyPlan || null;
    const planItems = plan && Array.isArray(plan.plano) ? plan.plano : [];

    const exposure = scan.exposure || {};
    const exposedFiles = Array.isArray(exposure.exposed_files) ? exposure.exposed_files : [];
    const exposureSubdomains = Array.isArray(exposure.subdomains) ? exposure.subdomains : [];
    const exposurePenalty = Number(exposure.metrics?.calculated_penalty) || 0;

    const lgpd = scan.lgpd || {};
    const lgpdChecks = Array.isArray(lgpd.checks) ? lgpd.checks : [];
    const lgpdScore = Number(lgpd.metrics?.compliance_score) || 0;
    const lgpdFailed = lgpdChecks.filter((c: any) => !c.passed);

    const headersPassed = headers.filter((h: any) => h.present).length;
    const cookiesSecure = cookies.filter((c: any) => c.httpOnly && c.secure && ['strict', 'lax'].includes(String(c.sameSite || '').toLowerCase())).length;
    const dnsScore = Number(dns.score) || 0;

    const hasVulnerabilities = vulns.length > 0 || cves.length > 0;

    const sevCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    vulns.forEach((v: string) => {
        const s = severityOf(v);
        sevCounts[s] = (sevCounts[s] || 0) + 1;
    });
    cves.forEach((c: any) => {
        const sev = String(c.severity || 'info').toLowerCase();
        const key = sev === 'critical' ? 'critical' : sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : sev === 'low' ? 'low' : 'info';
        sevCounts[key] = (sevCounts[key] || 0) + 1;
    });
    exposedFiles.forEach((f: any) => {
        const sev = String(f.severity || 'info').toLowerCase();
        const key = sev === 'critical' ? 'critical' : sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : sev === 'low' ? 'low' : 'info';
        sevCounts[key] = (sevCounts[key] || 0) + 1;
    });
    if (!dns.hasSpf && dns.hasSpf !== undefined) sevCounts.medium = (sevCounts.medium || 0) + 1;
    if (!dns.hasDmarc && dns.hasDmarc !== undefined) sevCounts.medium = (sevCounts.medium || 0) + 1;
    const missingHsts = headers.some((h: any) => String(h.header).toLowerCase().includes('strict-transport') && !h.present);
    const missingCsp = headers.some((h: any) => String(h.header).toLowerCase().includes('content-security') && !h.present);
    if (missingHsts) sevCounts.medium = (sevCounts.medium || 0) + 1;
    if (missingCsp) sevCounts.medium = (sevCounts.medium || 0) + 1;
    const displayFindings = Object.values(sevCounts).reduce((a, b) => a + b, 0);

    const sevOrder: Array<keyof typeof SEV_COLORS> = ['critical', 'high', 'medium', 'low', 'info'];

    const coverage = [
        { label: 'Headers HTTP', pct: headers.length > 0 ? (headersPassed / headers.length) * 100 : null, color: '#38bdf8' },
        { label: 'TLS / Transporte', pct: tls.status === 'ok' ? 100 : tls.status === 'alert' ? 60 : 10, color: '#818cf8' },
        { label: 'Cookies', pct: cookies.length > 0 ? (cookiesSecure / cookies.length) * 100 : cookies.length === 0 ? 100 : null, color: '#34d399' },
        { label: 'DNS / E-mail', pct: dnsScore, color: '#eab308' },
    ];

    return (
        <>
            <Navigation />
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
                {/* Header / Nav */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <button onClick={() => router.push('/admin/analises')} className="flex items-center gap-2 text-gray-400 hover:text-white transition">
                        <ChevronLeft className="w-4 h-4" /> Voltar à Área Administrativa
                    </button>
                    <div className="flex items-center gap-2">
                        <ExportPdfButton scanId={scan.id} targetUrl={scan.targetUrl} />
                        <button
                            onClick={async () => {
                                if (!confirm('Arquivar esta análise?')) return;
                                setActionLoading(true);
                                setActionError('');
                                try {
                                    const res = await fetch(`/api/scan/${scan.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: scan.archivedAt ? 'unarchive' : 'archive' }),
                                    });
                                    if (!res.ok) throw new Error('Falha ao arquivar.');
                                    setScan((prev: any) => ({ ...prev, archivedAt: prev.archivedAt ? null : new Date().toISOString() }));
                                } catch (e: any) {
                                    setActionError(e.message);
                                } finally {
                                    setActionLoading(false);
                                }
                            }}
                            disabled={actionLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition text-sm disabled:opacity-50"
                        >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : scan.archivedAt ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                            {scan.archivedAt ? 'Desarquivar' : 'Arquivar'}
                        </button>
                        <button
                            onClick={async () => {
                                if (!confirm('Excluir esta análise permanentemente? Esta ação não pode ser desfeita.')) return;
                                setActionLoading(true);
                                setActionError('');
                                try {
                                    const res = await fetch(`/api/scan/${scan.id}`, { method: 'DELETE' });
                                    if (!res.ok) throw new Error('Falha ao excluir.');
                                    router.push('/admin/analises');
                                } catch (e: any) {
                                    setActionError(e.message);
                                } finally {
                                    setActionLoading(false);
                                }
                            }}
                            disabled={actionLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-900 text-red-400 hover:text-red-300 hover:border-red-700 transition text-sm disabled:opacity-50"
                        >
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            Excluir
                        </button>
                        {actionError && <span className="text-xs text-red-400">{actionError}</span>}
                    </div>
                </div>

                {/* Título */}
                <div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Link href="/" className="hover:text-gray-200">Home</Link>
                        <span>›</span>
                        <span className="text-gray-200 break-all">{scan.targetUrl}</span>
                        {scan.id && <span className="text-xs text-gray-600">#{scan.id}</span>}
                    </div>
                    <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
                        <Activity className="w-6 h-6 text-blue-400" />
                        Dashboard de Segurança
                    </h1>
                    <p className="text-sm text-gray-500">
                       {scan.completedAt && `Concluído em ${format(new Date(scan.completedAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}`}
                        {scan.durationMs ? ` · Duração: ${(scan.durationMs / 1000).toFixed(1)}s` : ''}
                    </p>
                </div>

                {/* ===== Resumo Score + Grade ===== */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <div className="flex flex-wrap items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                            <ScoreGauge value={score} color={gradeColor} label="SEGURANÇA" />
                            <div>
                                <div className="flex items-center gap-3">
                                    <span className="text-6xl font-black" style={{ color: gradeColor }}>{grade}</span>
                                    <div>
                                        <div className="text-xl font-bold">{GRADE_LABEL[grade] || 'INDEFINIDO'}</div>
                                        <div className="text-sm text-gray-400">{score}/100 pontos</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                            <div><span className="text-gray-500">Domínio:</span> <span className="text-gray-200">{dns.domain || scan.domain || '-'}</span></div>
                            <div><span className="text-gray-500">Alvo:</span> <span className="text-gray-200 break-all">{scan.targetUrl}</span></div>
                            <div><span className="text-gray-500">ID Scan:</span> <span className="text-gray-200">#{scan.id}</span></div>
                            <div><span className="text-gray-500">Status:</span> <span className="text-green-400 capitalize">{scan.status}</span></div>
                        </div>
                    </div>

                    {/* Cards de métricas */}
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mt-6">
                        <MetricCard icon={Shield} label="Headers" value={`${headersPassed}`} sub={`de ${headers.length} testados`} color="#38bdf8" />
                        <MetricCard icon={Cookie} label="Cookies" value={`${cookiesSecure}`} sub={`de ${cookies.length} seguros`} color="#818cf8" />
                        <MetricCard icon={Server} label="Tecnologias" value={String(techs.length)} sub="componentes" color="#a78bfa" />
                        <MetricCard icon={Globe} label="Subdomínios" value={String(subdomains.length)} sub="hosts mapeados" color="#34d399" />
                        <MetricCard icon={FileWarning} label="Arquivos Expostos" value={String(exposedFiles.length)} sub={exposurePenalty ? `penalidade −${exposurePenalty}` : 'superfície limpa'} color="#fb923c" />
                        <MetricCard icon={Gauge} label="Score base" value={String(score + exposurePenalty)} sub={exposurePenalty > 0 ? `final ${score} (−${exposurePenalty})` : 'sem penalidade'} color={exposurePenalty > 0 ? '#fb923c' : '#34d399'} />
                        <MetricCard icon={ShieldCheck} label="LGPD" value={`${lgpdScore}%`} sub={lgpdFailed.length > 0 ? `${lgpdFailed.length} falha(s)` : 'conformidade OK'} color={lgpdScore >= 80 ? '#34d399' : lgpdScore >= 50 ? '#eab308' : '#f87171'} />
                    </div>
                </section>

                {/* ===== Distribuição + Matriz ===== */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Donut sev */}
                    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-400" /> Distribuição por Severidade</h3>
                        <div className="flex items-center gap-6">
                            <Donut counts={sevCounts} order={sevOrder} total={displayFindings} />
                            <div className="flex-1 space-y-2">
                                {sevOrder.map((k) => (
                                    <div key={k} className="flex items-center justify-between text-sm">
                                        <span className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: SEV_COLORS[k] }} />
                                            {SEV_LABELS[k]}
                                        </span>
                                        <span className="text-gray-300 font-semibold">{sevCounts[k] || 0}</span>
                                    </div>
                                ))}
                                <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-800">
                                    <span className="text-gray-400">Total de achados</span>
                                    <span className="text-white font-bold">{displayFindings}</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Cobertura */}
                    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-400" /> Cobertura de Controles</h3>
                        <div className="space-y-4">
                            {coverage.map((c) => (
                                <div key={c.label}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-300">{c.label}</span>
                                        <span className="text-gray-500">{c.pct !== null ? `${Math.round(c.pct)}%` : 'N/A'}</span>
                                    </div>
                                    <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                                        {c.pct !== null && (
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{ width: `${c.pct}%`, background: c.pct >= 80 ? '#34d399' : c.pct >= 50 ? '#eab308' : c.pct >= 25 ? '#fb923c' : '#f87171' }}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-5 pt-4 border-t border-gray-800">
                            <h4 className="text-sm font-semibold text-gray-300 mb-2">Registros de segurança</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <FlagRow label="SPF" ok={!!dns.hasSpf} />
                                <FlagRow label="DMARC" ok={!!dns.hasDmarc} />
                                <FlagRow label="DKIM" ok={!!dns.hasDkim} />
                                <FlagRow label="MTA-STS" ok={!!dns.hasMtaSts} />
                            </div>
                        </div>
                    </section>
                </div>

                {/* ===== Cabeçalhos HTTP ===== */}
                <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <h3 className="text-lg font-bold px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                        <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-blue-400" /> Cabeçalhos de Segurança</span>
                        <span className="text-sm font-normal text-gray-400">{headersPassed}/{headers.length} implementados</span>
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-800/60 text-left text-gray-300">
                                    <th className="px-5 py-2 font-medium">Header</th>
                                    <th className="px-5 py-2 text-center font-medium">Status</th>
                                    <th className="px-5 py-2 font-medium">Valor / Recomendação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {headers.map((h: any, i: number) => (
                                    <tr key={i} className="border-t border-gray-800 align-top">
                                        <td className="px-5 py-3 font-mono text-[13px]">{h.header}</td>
                                        <td className="px-5 py-3 text-center">
                                            {h.present ? (
                                                <span className="inline-flex items-center gap-1 text-green-400 text-xs font-semibold"><CheckCircle className="w-4 h-4" />OK</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-red-400 text-xs font-semibold"><XCircle className="w-4 h-4" />FALHA</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-gray-400 text-[13px] break-all">
                                            {h.present ? <span className="text-green-400 font-mono text-xs">{h.value}</span> : (h.recommendation || '-')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ===== TLS + DNS ===== */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-blue-400" /> Transporte TLS / SSL</h3>
                        <dl className="grid grid-cols-1 gap-2 text-sm">
                            <Row label="Protocolo" value={tls.protocol || '-'} />
                            <Row label="Cipher" value={tls.cipher || '-'} />
                            <Row label="Emitente" value={tls.issuer || '-'} />
                            <Row label="Válido até" value={tls.validTo ? new Date(tls.validTo).toLocaleDateString('pt-BR') : '-'} />
                            <Row label="Dias restantes" value={tls.daysRemaining !== null && tls.daysRemaining !== undefined ? String(tls.daysRemaining) : '-'} />
                        </dl>
                        {Array.isArray(tls.issues) && tls.issues.length > 0 && (
                            <div className="mt-4 space-y-1">
                                {tls.issues.map((m: string, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-amber-400 text-sm"><AlertTriangle className="w-4 h-4 flex-shrink-0" />{m}</div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><Globe className="w-4 h-4 text-blue-400" /> DNS & Subdomínios</h3>
                        <dl className="grid grid-cols-1 gap-2 text-sm">
                            <Row label="Domínio" value={dns.domain || scan.domain || '-'} />
                            <Row label="Registros" value={String(records.length)} />
                            <Row label="Subdomínios" value={String(subdomains.length)} />
                            <Row label="Score DNS" value={`${dnsScore}/100`} />
                        </dl>
                        {records.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-xs font-semibold text-gray-400 mb-1">Registros</h4>
                                <ul className="space-y-1 text-[13px] font-mono text-gray-400">
                                    {records.map((r: any, i: number) => (
                                        <li key={i}><span className="text-blue-400">{r.type}</span> {Array.isArray(r.data) ? r.data.join(', ') : r.data}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <div className="mt-4">
                            <h4 className="text-xs font-semibold text-gray-400 mb-1">Subdomínios</h4>
                            <div className="flex flex-wrap gap-2">
                                {subdomains.length === 0 ? <span className="text-gray-500 text-sm">Nenhum subdomínio mapeado</span> : subdomains.map((s: any, i: number) => (
                                    <span key={i} className="bg-gray-800 rounded-full px-3 py-1 text-[13px] font-mono"><span className={s.alive !== false ? 'text-green-400' : 'text-amber-400'}>●</span> {s.subdomain}</span>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-gray-800">
                            <h4 className="text-xs font-semibold text-gray-400 mb-1">
                                Subdomínios Ativos e Registrados <span className="text-gray-600 font-normal">· transparência de certificados (crt.sh)</span>
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {exposureSubdomains.length === 0 ? (
                                    <span className="text-gray-500 text-sm">Nenhum subdomínio registrado encontrado</span>
                                ) : exposureSubdomains.map((s: string, i: number) => (
                                    <span key={i} className="bg-gray-800/70 rounded-full px-3 py-1 text-[13px] font-mono text-blue-300">{s}</span>
                                ))}
                            </div>
                        </div>
                    </section>
                </div>

                {/* ===== Tecnologias + Vulnerabilidades ===== */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><Server className="w-4 h-4 text-purple-400" /> Tecnologias Detectadas</h3>
                        {techs.length === 0 ? (
                            <p className="text-gray-500 text-sm">Nenhuma tecnologia detectada.</p>
                        ) : (
                            <ul className="space-y-2 text-sm">
                                {techs.map((t: any, i: number) => (
                                    <li key={i} className="flex items-center justify-between py-1 border-b border-gray-800 last:border-0">
                                        <span className="text-gray-200">{t.name}</span>
                                        <span className="flex items-center gap-2 text-gray-500">
                                            <span className="text-xs">{t.category}</span>
                                            <span className="inline-flex items-center gap-1">
                                                <span className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden inline-block">
                                                    <span className="block h-full bg-blue-500" style={{ width: `${t.confidence || 0}%` }} />
                                                </span>
                                                {t.confidence}%
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Vulnerabilidades & Observações</h3>
                        {!hasVulnerabilities ? (
                            <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 text-center text-green-300 text-sm">
                                <CheckCircle className="w-8 h-8 mx-auto mb-2" /> Nenhuma vulnerabilidade identificada.
                            </div>
                        ) : (
                            <ul className="space-y-2 text-sm">
                                {cves.map((c: any, i: number) => (
                                    <li key={`c-${i}`} className="flex items-start gap-2 py-1 border-b border-gray-800">
                                        <span className="w-2.5 h-2.5 mt-1.5 rounded-sm flex-shrink-0" style={{ background: SEV_COLORS[severityOf(c.cve_id || '')] }} />
                                        <div>
                                            <span className="text-blue-300 font-mono text-xs">{c.cve_id || 'CVE'}</span>
                                            <span className="text-gray-300 ml-2">{c.affected_component || c.description || ''}</span>
                                        </div>
                                    </li>
                                ))}
                                {vulns.map((v: string, i: number) => (
                                    <li key={`v-${i}`} className="flex items-start gap-2 py-1 border-b border-gray-800 last:border-0">
                                        <span className="w-2.5 h-2.5 mt-1.5 rounded-sm flex-shrink-0" style={{ background: SEV_COLORS[severityOf(v)] }} />
                                        <span className="text-amber-200">{v}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>

                {/* ===== Exposição de Arquivos Sensíveis ===== */}
                {(exposedFiles.length > 0 || exposureSubdomains.length > 0) && (
                    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><FileWarning className="w-4 h-4 text-orange-400" /> Exposição de Arquivos Sensíveis & Superfície</h3>
                        {exposedFiles.length === 0 ? (
                            <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 text-center text-green-300 text-sm">
                                <CheckCircle className="w-8 h-8 mx-auto mb-2" /> Nenhum arquivo sensível ou configuração exposta foi encontrado na superfície observada.
                            </div>
                        ) : (
                            <>
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {exposedFiles.map((f: any, i: number) => {
                                        const sevKey = String(f.severity || 'info').toLowerCase();
                                        return (
                                            <div key={i} className="rounded-xl border border-gray-800 bg-gray-800/40 p-4 space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <span
                                                        className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wide font-semibold text-white shrink-0"
                                                        style={{ background: SEV_COLORS[sevKey] || '#64748b' }}
                                                    >
                                                        {f.severity || 'INFO'}
                                                    </span>
                                                    <HardDrive className="w-4 h-4 text-gray-600" />
                                                </div>
                                                <div className="font-mono text-[13px] text-gray-200 break-all">{f.path}</div>
                                                <div className="text-xs text-gray-500">{f.type}</div>
                                                <div className="flex items-center justify-between text-[11px] text-gray-500">
                                                    <span>{f.size_bytes ? `${(f.size_bytes / 1024).toFixed(1)} kB` : '—'}</span>
                                                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline break-all text-right">{f.url.replace(/^https?:\/\//, '')}</a>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {exposurePenalty > 0 && (
                                    <div className="mt-4 flex items-center gap-2 text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-xl px-4 py-3">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        Penalidade aplicada ao score geral: <span className="font-semibold">−{exposurePenalty} pontos</span>.
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                )}

                {/* ===== Conformidade LGPD (Lei 13.709/2018) ===== */}
                {lgpdChecks.length > 0 && (
                    <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <h3 className="font-bold mb-4 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-green-400" />
                            Conformidade LGPD (Lei 13.709/2018)
                            <span className={`ml-2 px-2 py-0.5 rounded text-xs font-bold text-white`} style={{ background: lgpdScore >= 80 ? '#16a34a' : lgpdScore >= 50 ? '#eab308' : '#dc2626' }}>
                                {lgpdScore}% conformidade
                            </span>
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {lgpdChecks.map((check: any, i: number) => (
                                <div key={i} className={`rounded-xl border p-3 ${check.passed ? 'border-green-900/50 bg-green-900/10' : 'border-red-900/50 bg-red-900/10'}`}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${check.passed ? 'bg-green-700 text-green-200' : 'bg-red-700 text-red-200'}`}>
                                            {check.passed ? 'PASS' : 'FAIL'}
                                        </span>
                                        <span className="text-[10px] text-gray-500 uppercase">{check.category}</span>
                                    </div>
                                    <div className={`text-xs font-semibold mb-1 ${check.passed ? 'text-green-300' : 'text-red-300'}`}>{check.title}</div>
                                    {check.lgpd_article && <div className="text-[10px] text-gray-500 font-mono mb-1">{check.lgpd_article}</div>}
                                    {!check.passed && check.recommendation && (
                                        <div className="text-[11px] text-gray-400 mt-1 leading-tight">{check.recommendation}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                        {lgpdFailed.length > 0 && (
                            <div className="mt-4 flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {lgpdFailed.length} item(s) de não-conformidade com a LGPD — {lgpdFailed.filter((c: any) => c.severity === 'critical' || c.severity === 'high').length} de alta/crítica severidade.
                            </div>
                        )}
                    </section>
                )}

                {/* ===== Plano de Mitigação e Contingência ===== */}
                {plan && planItems.length > 0 && (
                    <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <h3 className="text-lg font-bold px-5 py-3 border-b border-gray-800 flex items-center gap-2">
                            <LifeBuoy className="w-4 h-4 text-cyan-400" /> Plano de Mitigação e Contingência
                        </h3>
                        <div className="p-5 space-y-5">
                            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm text-gray-300 leading-relaxed">
                                {plan.resumo}
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                {planItems.map((item: any, i: number) => (
                                    <div key={item.id || i} className="rounded-xl border border-gray-800 bg-gray-800/40 p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-200 text-sm">{item.titulo}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">{PLAN_CATEGORIA[item.categoria] || item.categoria}</div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide border ${PLAN_PRIO[item.prioridade] || PLAN_PRIO.baixa}`}>
                                                    {item.prioridade}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide border ${PLAN_STATUS[item.status] || PLAN_STATUS.pendente}`}>
                                                    {PLAN_STATUS_LABEL[item.status] || item.status}
                                                </span>
                                            </div>
                                        </div>
                                        <ul className="space-y-1.5">
                                            {Array.isArray(item.acoes) && item.acoes.map((a: string, j: number) => (
                                                <li key={j} className="flex gap-2 text-xs text-gray-400">
                                                    <span className="text-cyan-400 shrink-0">›</span>
                                                    {ptAcao(a)}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 border-t border-gray-800 pt-4">
                                <span className="flex items-center gap-1.5"><ListChecks className="w-4 h-4 text-gray-600" /> Gere o plano completo em <Link href={`/admin/contingency?domain=${encodeURIComponent(scan.domain || dns.domain || '')}`} className="text-cyan-300 hover:underline">Contingência</Link></span>
                                <span>{planItems.filter((p: any) => p.status === 'concluida').length}/{planItems.length} ações concluídas</span>
                            </div>
                        </div>
                    </section>
                )}

                {/* Rodapé */}
                <div className="text-xs text-gray-600 pt-4 flex items-center justify-between">
                    <span>MCinfraTI Radar Security · Dashboard interativo · Documento Confidencial</span>
                    <button onClick={() => router.push(`/scan/${scan.id}/report/pdf`)} className="hidden">PDF</button>
                </div>
            </div>
        </>
    );
}

function ScoreGauge({ value, color, label }: { value: number; color: string; label: string }) {
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div className="relative w-28 h-28">
            <div
                className="w-28 h-28 rounded-full"
                style={{ background: `conic-gradient(${color} ${pct}%, #1e293b ${pct}%)` }}
            />
            <div className="absolute inset-2.5 bg-gray-900 rounded-full flex flex-col items-center justify-center">
                <span className="text-3xl font-black" style={{ color }}>{value}</span>
                <span className="text-[10px] text-gray-400">{label}</span>
            </div>
        </div>
    );
}

function Donut({ counts, order, total }: { counts: Record<string, number>; order: Array<keyof typeof SEV_COLORS>; total: number }) {
    if (total <= 0) {
        return (
            <div className="relative w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center">
                <span className="text-lg font-bold text-gray-500">0</span>
            </div>
        );
    }
    const segments: { color: string; start: number; end: number }[] = [];
    let running = 0;
    order
        .filter((k) => counts[k] > 0)
        .forEach((k) => {
            const start = (running / total) * 100;
            running += counts[k];
            segments.push({ color: SEV_COLORS[k], start, end: (running / total) * 100 });
        });
    return (
        <div className="relative w-32 h-32" title={`${total} achados`}>
            <div
                className="w-32 h-32 rounded-full"
                style={{ background: `conic-gradient(${segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(', ')})` }}
            />
            <div className="absolute inset-2.5 bg-gray-900 rounded-full flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-white">{total}</span>
                <span className="text-[10px] text-gray-400">ACHADOS</span>
            </div>
        </div>
    );
}

function MetricCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub: string; color: string }) {
    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" style={{ color }} />
                <span className="text-sm text-gray-400">{label}</span>
            </div>
            <div className="mt-2 text-3xl font-bold">{value}</div>
            <div className="text-xs text-gray-500 mt-1">{sub}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 py-1 border-b border-gray-800 last:border-0">
            <dt className="text-gray-500">{label}</dt>
            <dd className="text-gray-200 text-right break-all">{value}</dd>
        </div>
    );
}

function FlagRow({ label, ok }: { label: string; ok: boolean }) {
    return (
        <div className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
            <span className="text-gray-300 text-xs">{label}</span>
            {ok ? (
                <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle className="w-3.5 h-3.5" />Sim</span>
            ) : (
                <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle className="w-3.5 h-3.5" />Não</span>
            )}
        </div>
    );
}

const PLAN_CATEGORIA: Record<string, string> = {
    headers: 'Cabeçalhos HTTP',
    tls: 'TLS / Certificado',
    dns: 'DNS / E-mail',
    infra: 'Infraestrutura',
    processo: 'Processo',
};

const PLAN_PRIO: Record<string, string> = {
    alta: 'text-red-300 border-red-400/30 bg-red-400/10',
    media: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
    baixa: 'text-sky-300 border-sky-400/30 bg-sky-400/10',
};

const PLAN_STATUS: Record<string, string> = {
    pendente: 'text-gray-400 border-white/10 bg-white/5',
    em_andamento: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
    concluida: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
};

const PLAN_STATUS_LABEL: Record<string, string> = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
};

function ptAcao(a: string): string {
    const l = String(a || '').toLowerCase();
    if (l.includes('hsts') || l.includes('strict-transport')) return 'Habilite o cabeçalho HSTS para forçar HTTPS (ex: max-age=31536000; includeSubDomains)';
    if (l.includes('content-security') || l.includes('csp')) return 'Adicione o cabeçalho Content-Security-Policy para prevenir ataques de XSS e injeção de dados';
    if (l.includes('x-frame')) return 'Implemente o cabeçalho X-Frame-Options para prevenir clickjacking';
    if (l.includes('x-content-type')) return 'Reforce o cabeçalho X-Content-Type-Options (nosniff) para evitar MIME sniffing';
    if (l.includes('referrer-policy')) return 'Configure o cabeçalho Referrer-Policy (ex: strict-origin-when-cross-origin)';
    if (l.includes('permissions-policy')) return 'Defina o cabeçalho Permissions-Policy para limitar recursos do navegador';
    if (l.includes('spf')) return 'Publique registro SPF para proteger o envio de e-mail';
    if (l.includes('dmarc')) return 'Publique política DMARC para reduzir falsificação de e-mail';
    if (l.includes('dkim')) return 'Configure assinatura DKIM para validar e-mails enviados';
    if (l.includes('mta-sts')) return 'Habilite política MTA-STS para forçar TLS no envio de e-mail';
    if (l.includes('tls 1.0')) return 'Desative TLS 1.0/1.1 e mantenha apenas versões seguras (1.2+)';
    if (l.includes('certificate')) return 'Renove o certificado e mantenha a validade dentro do prazo';
    return String(a || '');
}
