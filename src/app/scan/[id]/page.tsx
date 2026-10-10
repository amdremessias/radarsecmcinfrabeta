'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Navigation from '@/components/Navigation';
import { ExportPdfButton } from '@/components/ExportPdfButton';
import { DashboardButton } from '@/components/DashboardButton';

const GRADE_COLORS: Record<string, string> = {
    A: 'text-green-500',
    B: 'text-emerald-400',
    C: 'text-yellow-400',
    D: 'text-orange-400',
    E: 'text-red-400',
    F: 'text-red-600',
};

function getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    if (score >= 40) return 'E';
    return 'F';
}

export default function ScanResultPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [scan, setScan] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('headers');

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setInterval> | null = null;

        async function fetchScan() {
            try {
                const res = await fetch(`/api/scan/${params.id}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Scan não encontrado');
                if (cancelled) return;
                setScan(data);
                if (data.status === 'running' && !timer) {
                    timer = setInterval(fetchScan, 2500);
                } else if (data.status !== 'running' && timer) {
                    clearInterval(timer);
                    timer = null;
                }
            } catch (err: any) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetchScan();

        return () => {
            cancelled = true;
            if (timer) clearInterval(timer);
        };
    }, [params.id]);

    if (loading) {
        return (
            <div className="text-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
                <p className="text-gray-400">Carregando resultado do scan...</p>
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

    const headers = Array.isArray(scan.headers) ? scan.headers : [];
    const cookies = Array.isArray(scan.cookies) ? scan.cookies : [];
    const vulns = Array.isArray(scan.vulnerabilities) ? scan.vulnerabilities : [];
    const techs = Array.isArray(scan.technology) ? scan.technology : [];
    const dns = scan.dns || {};
    const subdomains = Array.isArray(dns.subdomains) ? dns.subdomains : [];

    return (
        <>
            <Navigation />
            <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
            <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 hover:text-white transition">
                <ChevronLeft className="w-4 h-4" />
                Voltar
            </button>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div>
                        <Link href="/" className="text-gray-500 text-sm hover:text-gray-300">Home</Link>
                        <span className="mx-2 text-gray-600">›</span>
                        <span className="text-gray-300 text-sm break-all">{scan.targetUrl}</span>
                        {scan.targetId && <span className="ml-2 text-xs text-gray-600">#{scan.id}</span>}
                    </div>
                    <div className="flex flex-col items-end gap-3">
                        {scan.status === 'completed' && (
                            <div className="flex items-center gap-2">
                                <DashboardButton scanId={scan.id} />
                                <ExportPdfButton scanId={scan.id} targetUrl={scan.targetUrl} />
                            </div>
                        )}
                        <div className="text-right">
                            <div className={`text-6xl font-bold ${GRADE_COLORS[scan.grade || getGrade(scan.score || 0)]}`}>
                                {scan.grade || getGrade(scan.score || 0)}
                            </div>
                            <div className="text-sm text-gray-400">{scan.score ?? '-'}/100 pontos</div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <ScoreCard icon={Shield} title="Headers" value={`${headers.filter((h: any) => h.present).length}/${headers.length}`} />
                    <ScoreCard icon={Cookie} title="Cookies" value={String(cookies.length)} />
                    <ScoreCard icon={Server} title="Tecnologias" value={String(techs.length)} />
                    <ScoreCard icon={Globe} title="Subdomínios" value={String(subdomains.length)} />
                </div>

                <div className="flex flex-wrap gap-2 border-t border-gray-700 pt-4">
                    {(['headers', 'cookies', 'tls', 'dns', 'tech', 'vulns'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-4 py-2 text-sm font-medium rounded-full transition ${
                                tab === t
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                        >
                            {TAB_LABELS[t]}
                        </button>
                    ))}
                </div>
            </div>

            {scan.status === 'running' && (
                <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
                    <p className="text-gray-400">Scan em andamento...</p>
                </div>
            )}

            {scan.status === 'failed' && (
                <div className="bg-red-900/30 border border-red-800 rounded-xl p-6 text-center">
                    <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                    <p className="text-red-300">{scan.error || 'Falha durante o scan'}</p>
                </div>
            )}

            {scan.status === 'cancelled' && (
                <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-6 text-center">
                    <XCircle className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-300">{scan.error || 'Este scan foi cancelado pelo administrador.'}</p>
                </div>
            )}

            {scan.status === 'completed' && (
                <>
                    {tab === 'headers' && <HeadersTab headers={headers} />}
                    {tab === 'cookies' && <CookiesTab cookies={cookies} />}
                    {tab === 'tls' && <TLSTab tls={scan.tls} />}
                    {tab === 'dns' && <DNSTab dns={dns} />}
                    {tab === 'tech' && <TechTab techs={techs} />}
                    {tab === 'vulns' && <VulnsTab vulns={vulns} />}

                    <div className="text-xs text-gray-600 pt-4">
                        {scan.completedAt && `Concluído em ${format(new Date(scan.completedAt), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })}`}
                        {scan.durationMs ? ` · Duracao: ${(scan.durationMs / 1000).toFixed(1)}s` : ''}
                    </div>
                </>
            )}
            </div>
        </>
    );
}

const TAB_LABELS: Record<string, string> = {
    headers: 'Cabeçalhos',
    cookies: 'Cookies',
    tls: 'TLS/SSL',
    dns: 'DNS',
    tech: 'Tecnologias',
    vulns: 'Vulnerabilidades',
};

function ScoreCard({ icon: Icon, title, value }: { icon: any; title: string; value: string }) {
    return (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">{title}</span>
            </div>
            <div className="mt-2 text-xl font-semibold">{value}</div>
        </div>
    );
}

function HeadersTab({ headers }: { headers: any[] }) {
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <h3 className="text-lg font-bold px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" /> Cabeçalhos de Segurança
            </h3>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-800/60 text-left text-gray-300">
                        <th className="px-4 py-2 font-medium">Header</th>
                        <th className="px-4 py-2 text-center font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Recomendação</th>
                    </tr>
                </thead>
                <tbody>
                    {headers.map((h, i) => (
                        <tr key={i} className="border-t border-gray-800 align-top">
                            <td className="px-4 py-3 font-mono text-[13px]">{h.header}</td>
                            <td className="px-4 py-3 text-center">
                                {h.present ? (
                                    <CheckCircle className="w-5 h-5 mx-auto text-green-500" />
                                ) : (
                                    <XCircle className="w-5 h-5 mx-auto text-red-400" />
                                )}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-[13px]">
                                {h.value ? (
                                    <span className="text-green-400 font-mono text-xs">{h.value}</span>
                                ) : (
                                    h.recommendation || '-'
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}

function CookiesTab({ cookies }: { cookies: any[] }) {
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <h3 className="text-lg font-bold px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <Cookie className="w-4 h-4 text-blue-400" /> Cookies ({cookies.length})
            </h3>
            {cookies.length === 0 ? (
                <p className="px-4 py-8 text-center text-gray-500">Nenhum cookie retornado.</p>
            ) : (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-800/60 text-left text-gray-300">
                            <th className="px-4 py-2 font-medium">Nome</th>
                            <th className="px-4 py-2 text-center font-medium">HttpOnly</th>
                            <th className="px-4 py-2 text-center font-medium">Secure</th>
                            <th className="px-4 py-2 text-center font-medium">SameSite</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cookies.map((c, i) => (
                            <tr key={i} className="border-t border-gray-800">
                                <td className="px-4 py-3 font-mono text-[13px]">{c.name}</td>
                                <td className="px-4 py-3 text-center">{c.httpOnly ? '✓' : '✗'}</td>
                                <td className="px-4 py-3 text-center">{c.secure ? '✓' : '✗'}</td>
                                <td className="px-4 py-3 text-center">{c.sameSite || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}

function TLSTab({ tls }: { tls: any }) {
    if (!tls) return <p className="text-gray-500">Sem dados TLS.</p>;
    const rows: [string, string][] = [
        ['Protocolo', tls.protocol || '-'],
        ['Cipher', tls.cipher || '-'],
        ['Emitente', tls.issuer || '-'],
        ['Válido de', tls.validFrom ? new Date(tls.validFrom).toLocaleDateString('pt-BR') : '-'],
        ['Válido até', tls.validTo ? new Date(tls.validTo).toLocaleDateString('pt-BR') : '-'],
        ['Dias restantes', tls.daysRemaining !== null ? String(tls.daysRemaining) : '-'],
    ];
    const issues: string[] = Array.isArray(tls.issues) ? tls.issues : [];
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-400" /> TLS / Certificado
            </h3>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rows.map(([k, v]) => (
                    <div key={k} className="bg-gray-800 rounded-lg px-4 py-3">
                        <dt className="text-xs text-gray-500">{k}</dt>
                        <dd className="text-sm text-gray-200 break-all">{v}</dd>
                    </div>
                ))}
            </dl>
            {issues.length > 0 && (
                <div className="mt-4 space-y-2">
                    {issues.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 text-amber-400 text-sm">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {m}
                        </div>
                    ))}
                </div>
            )}
            {tls.score !== undefined && (
                <div className="mt-4">
                    <p className="text-sm text-gray-400">Score TLS: <span className={tls.score >= 80 ? 'text-green-400' : 'text-amber-400'}>{tls.score}/100</span></p>
                </div>
            )}
        </section>
    );
}

function DNSTab({ dns }: { dns: any }) {
    const subdomains = Array.isArray(dns.subdomains) ? dns.subdomains : [];
    const records = Array.isArray(dns.records) ? dns.records : [];
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <h3 className="text-lg font-bold px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" /> Análise DNS — {dns.domain}
            </h3>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <dl>
                    <dt className="text-xs text-gray-500">MX</dt>
                    <dd className="text-sm text-gray-200">{dns.mx?.length ? dns.mx.join(', ') : '-'}</dd>
                </dl>
                <dl>
                    <dt className="text-xs text-gray-500">SPF (TXT)</dt>
                    <dd className="text-sm text-gray-200">{dns.txt?.some((t: string) => /v=spf1/.test(t.toLowerCase())) ? 'Presente ✓' : 'Ausente ✗'}</dd>
                </dl>
                <dl>
                    <dt className="text-xs text-gray-500">MTA-STS</dt>
                    <dd className="text-sm text-gray-200">{dns.mta_sts_policy ? 'Presente ✓' : 'Ausente ✗'}</dd>
                </dl>
            </div>
            {records.length > 0 && (
                <div className="px-4 pb-2">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Registros</h4>
                    <ul className="space-y-1 text-[13px] font-mono">
                        {records.map((r: any, i: number) => (
                            <li key={i} className="text-gray-400">
                                <span className="text-blue-400">{r.type}</span> {Array.isArray(r.data) ? r.data.join(', ') : r.data}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {subdomains.length > 0 && (
                <div className="p-4">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">
                        Subdomínios encontrados ({subdomains.length})
                    </h4>
                    <ul className="space-y-1">
                        {subdomains.map((s: any, i: number) => (
                            <li key={i} className="text-[13px] font-mono text-gray-400">
                                {s.subdomain} → {s.ip}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

function TechTab({ techs }: { techs: any[] }) {
    if (techs.length === 0) return <p className="text-gray-500">Nenhuma tecnologia detectada.</p>;
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <h3 className="text-lg font-bold px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" /> Detecção de Tecnologias
            </h3>
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-800/60 text-left text-gray-300">
                        <th className="px-4 py-2 font-medium">Tecnologia</th>
                        <th className="px-4 py-2 font-medium">Categoria</th>
                        <th className="px-4 py-2 font-medium">Confiança</th>
                    </tr>
                </thead>
                <tbody>
                    {techs.map((t, i) => (
                        <tr key={i} className="border-t border-gray-800">
                            <td className="px-4 py-3">{t.name}</td>
                            <td className="px-4 py-3 text-gray-400">{t.category}</td>
                            <td className="px-4 py-3">{t.confidence}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}

function VulnsTab({ vulns }: { vulns: string[] }) {
    if (vulns.length === 0) {
        return (
            <div className="bg-green-900/20 border border-green-800 rounded-xl p-6 text-center">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                <p className="text-green-300">Nenhuma vulnerabilidade identificada nos checks básicos.</p>
            </div>
        );
    }
    return (
        <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <h3 className="text-lg font-bold px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Pontos de atenção ({vulns.length})
            </h3>
            <ul className="divide-y divide-gray-800">
                {vulns.map((v, i) => (
                    <li key={i} className="px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {v}
                    </li>
                ))}
            </ul>
        </section>
    );
}