'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ScanSearch,
    Rss,
    ShieldCheck,
    Radar,
    Loader2,
    ChevronRight,
    CheckCircle2,
    AlertTriangle,
    Lock,
    Globe,
    Gauge,
    PhoneCall,
    FileSearch,
    Braces,
    Server,
    KeyRound,
    Cookie,
    Zap,
    Check,
    TrendingDown,
    Users,
    Scale,
    Compass,
    ArrowRight,
    CircleDot,
} from 'lucide-react';
import CookieConsent from '@/components/CookieConsent';

interface LeadResult {
    ok: boolean;
    lead?: { id: number; name: string; email: string; targetUrl: string };
    analysis?: {
        domain: string;
        score: number;
        grade: string;
        duration_ms: number;
        vulnerabilityCount: number;
        missingHeaders: string[];
    };
    message?: string;
}

const gradeColors: Record<string, string> = {
    A: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
    B: 'text-sky-400 border-sky-400/40 bg-sky-400/10',
    C: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
    D: 'text-orange-400 border-orange-400/40 bg-orange-400/10',
    E: 'text-red-400 border-red-400/40 bg-red-400/10',
    F: 'text-red-400 border-red-400/40 bg-red-400/10',
};

const scoreColor = (score: number) =>
    score >= 80 ? '#34d399' : score >= 60 ? '#38bdf8' : score >= 40 ? '#fbbf24' : '#f87171';

export default function Landing() {
    const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', url: '' });
    const [consent, setConsent] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState<LeadResult | null>(null);
    const [consultingRequested, setConsultingRequested] = useState(false);

    function update(field: keyof typeof form) {
        return (e: React.ChangeEvent<HTMLInputElement>) =>
            setForm((f) => ({ ...f, [field]: e.target.value }));
    }

    function updatePhone(e: React.ChangeEvent<HTMLInputElement>) {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 15);
        setForm((f) => ({ ...f, phone: digits }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setResult(null);

        let url = form.url.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

        if (!form.name.trim() || !form.email.trim() || !form.url.trim()) {
            setError('Preencha nome, e-mail e URL.');
            return;
        }
        if (!consent) {
            setError('Para continuar, aceite a Política de Privacidade e os Termos de Uso (LGPD).');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, url, consent }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Falha ao registrar');
            }
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function requestConsulting() {
        if (!result?.lead?.email) return;
        try {
            await fetch('/api/leads/consulting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: result.lead.email }),
            });
            setConsultingRequested(true);
        } catch {
            setError('Não foi possível registrar a solicitação. Tente novamente.');
        }
    }

    const analysis = result?.analysis;
    const score = analysis?.score ?? 0;
    const grade = analysis?.grade ?? '—';

    return (
        <div className="min-h-screen bg-[#05070f] text-white relative overflow-hidden">
            {/* ambiente futurista */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-cyan-500/20 blur-[130px] rounded-full" />
                <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-blue-600/20 blur-[120px] rounded-full" />
                <div className="absolute bottom-0 -left-40 w-[500px] h-[400px] bg-emerald-500/10 blur-[120px] rounded-full" />
                <div
                    className="absolute inset-0 opacity-[0.15]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(56,189,248,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.4) 1px, transparent 1px)',
                        backgroundSize: '56px 56px',
                        maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
                        WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
                    }}
                />
            </div>

            <div className="relative">
                {/* navegação */}
                <nav className="max-w-6xl mx-auto px-6 pt-8 flex items-center justify-between gap-6">
                    <a href="#inicio" className="flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/icon.svg" alt="Radar Security" className="w-9 h-9 rounded-xl shadow-lg shadow-cyan-500/30" />
                        <div className="leading-tight">
                            <div className="font-semibold tracking-tight">MCinfraTI</div>
                            <div className="text-[11px] text-cyan-400 tracking-widest uppercase">Radar Security</div>
                        </div>
                    </a>
                    <div className="hidden md:flex items-center gap-7 text-sm text-gray-400">
                        <a href="#como-funciona" className="hover:text-white transition">Como funciona</a>
                        <a href="#o-que-analisamos" className="hover:text-white transition">O que analisamos</a>
                        <a href="#diferenciais" className="hover:text-white transition">Diferenciais</a>
                        <a href="#para-quem" className="hover:text-white transition">Para quem</a>
                    </div>
                    <a href="/login" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition">
                        Painel <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                </nav>

                {/* hero */}
                <header id="inicio" className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-400/30 bg-cyan-400/5 text-cyan-300 text-xs uppercase tracking-widest mb-8">
                        <Rss className="w-3.5 h-3.5 animate-pulse" />
                        MCinfraTI · Radar Security
                    </div>
                    <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.05]">
                        Seu site está
                        <span className="block bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
                            protegido de verdade?
                        </span>
                    </h1>
                    <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto">
                        Verificamos cabeçalhos de segurança, TLS, DNS e exposição de informações.
                        Receba um score e o plano de contingência do seu domínio em segundos.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-cyan-400" /> Monitoramento contínuo</span>
                        <span className="flex items-center gap-1.5"><Lock className="w-4 h-4 text-cyan-400" /> Criptografia do certificado</span>
                        <span className="flex items-center gap-1.5"><Gauge className="w-4 h-4 text-cyan-400" /> Score 0–100</span>
                    </div>
                </header>

                {/* formulário de captura */}
                <section id="analise" className="max-w-2xl mx-auto px-6 pb-24">
                    <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/40">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />
                        <div className="p-8 sm:p-10">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
                                    <ScanSearch className="w-5 h-5 text-cyan-300" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold">Análise gratuita do seu domínio</h2>
                                    <p className="text-sm text-gray-500">Sem cadastro. Resultado imediato.</p>
                                </div>
                            </div>

                            {!result && (
                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div className="grid sm:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="block text-xs uppercase tracking-widest text-gray-500">Seu nome</label>
                                            <input
                                                type="text"
                                                value={form.name}
                                                onChange={update('name')}
                                                placeholder="Maria Silva"
                                                maxLength={160}
                                                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-xs uppercase tracking-widest text-gray-500">E-mail corporativo</label>
                                            <input
                                                type="email"
                                                value={form.email}
                                                onChange={update('email')}
                                                placeholder="maria@empresa.com"
                                                maxLength={160}
                                                autoComplete="email"
                                                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-xs uppercase tracking-widest text-gray-500">Telefone</label>
                                            <input
                                                type="tel"
                                                value={form.phone}
                                                onChange={updatePhone}
                                                placeholder="(11) 99999-0000"
                                                inputMode="tel"
                                                autoComplete="tel"
                                                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-xs uppercase tracking-widest text-gray-500">Empresa</label>
                                            <input
                                                type="text"
                                                value={form.company}
                                                onChange={update('company')}
                                                placeholder="Minha Empresa LTDA"
                                                maxLength={160}
                                                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2">
                                        <label className="block text-xs uppercase tracking-widest text-gray-500">URL do site</label>
                                        <div className="relative">
                                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                            <input
                                                type="text"
                                                value={form.url}
                                                onChange={update('url')}
                                                placeholder="https://www.empresa.com.br"
                                                className="w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 py-3.5 text-sm outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20 transition"
                                            />
                                        </div>
                                    </div>

                                    {error && (
                                        <p className="text-sm text-red-400 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" /> {error}
                                        </p>
                                    )}

                                    <label className="flex items-start gap-3 cursor-pointer select-none py-1">
                                        <input
                                            type="checkbox"
                                            checked={consent}
                                            onChange={(e) => setConsent(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-black/30 accent-cyan-400"
                                        />
                                        <span className="text-xs text-gray-500 leading-relaxed">
                                            Li e aceito a{' '}
                                            <Link href="/privacidade" className="text-cyan-300 hover:underline underline-offset-2">
                                                Política de Privacidade
                                            </Link>{' '}
                                            e os{' '}
                                            <Link href="/termos" className="text-cyan-300 hover:underline underline-offset-2">
                                                Termos de Uso
                                            </Link>{' '}
                                            da MCinfraTI, em conformidade com a LGPD. Meus dados serão usados apenas
                                            para análise do domínio e contato comercial.
                                        </span>
                                    </label>

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="group w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-4 font-semibold text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Analisando domínio...
                                            </>
                                        ) : (
                                            <>
                                                <ScanSearch className="w-5 h-5" />
                                                Gerar minha análise
                                            </>
                                        )}
                                    </button>
                                    <p className="text-center text-xs text-gray-600">
                                        Leva alguns segundos. Seus dados não são compartilhados.
                                    </p>
                                </form>
                            )}

                            {/* resultado */}
                            {result && analysis && (
                                <div className="space-y-8">
                                    <div className="flex items-start gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 text-emerald-400 text-sm mb-2">
                                                <CheckCircle2 className="w-5 h-5" />
                                                Análise concluída
                                            </div>
                                            <h3 className="text-2xl font-bold">{analysis.domain}</h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {result.lead?.name?.split(' ')[0]}, recebemos seu contato.
                                                Um especialista entrará em contato.
                                            </p>
                                        </div>
                                        <div className="relative w-28 h-28 rounded-full flex items-center justify-center"
                                            style={{
                                                background: `conic-gradient(${scoreColor(score)} ${score}%, rgba(255,255,255,0.08) 0)`,
                                            }}
                                        >
                                            <div className="absolute inset-2 rounded-full bg-[#0a1120] flex flex-col items-center justify-center">
                                                <span className="text-3xl font-bold">{score}</span>
                                                <span className="text-[10px] uppercase tracking-widest text-gray-500">score</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-center gap-2">
                                        <span className={`px-4 py-1.5 rounded-full border text-lg font-bold ${gradeColors[grade] || 'text-white border-white/20 bg-white/10'}`}>
                                            Nota {grade}
                                        </span>
                                        {score < 60 && (
                                            <span className="px-4 py-1.5 rounded-full border border-red-400/40 bg-red-400/10 text-red-300 text-sm flex items-center gap-1.5">
                                                <AlertTriangle className="w-4 h-4" /> Ação prioritária
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                                            <div className="text-gray-500 text-xs uppercase tracking-widest mb-1">Análise executada em</div>
                                            <div className="font-semibold">{((analysis.duration_ms ?? 0) / 1000).toFixed(1)}s</div>
                                        </div>
                                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                                            <div className="text-gray-500 text-xs uppercase tracking-widest mb-1">Vulnerabilidades</div>
                                            <div className="font-semibold">{analysis.vulnerabilityCount}</div>
                                        </div>
                                        {analysis.missingHeaders.length > 0 && (
                                            <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 sm:col-span-2">
                                                <div className="text-amber-400 text-xs uppercase tracking-widest mb-2">Cabeçalhos ausentes</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {analysis.missingHeaders.map((h) => (
                                                        <span key={h} className="px-3 py-1 rounded-lg bg-amber-400/10 border border-amber-400/20 text-amber-200 text-xs">
                                                            {h}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {!consultingRequested ? (
                                        <>
                                            <button
                                                onClick={requestConsulting}
                                                className="group w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-4 font-semibold text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:brightness-110 transition flex items-center justify-center gap-2"
                                            >
                                                <PhoneCall className="w-5 h-5" />
                                                Solicitar Consultoria e Correção
                                            </button>
                                            {error && (
                                                <p className="text-sm text-red-400 flex items-center justify-center gap-2 pt-2">
                                                    <AlertTriangle className="w-4 h-4" /> {error}
                                                </p>
                                            )}
                                            <p className="text-center text-xs text-gray-600">
                                                Nossa equipe analisa o resultado e propõe correções para elevar sua nota.
                                            </p>
                                        </>
                                    ) : (
                                        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-center">
                                            <div className="flex items-center justify-center gap-2 text-emerald-300 font-semibold">
                                                <CheckCircle2 className="w-5 h-5" /> Solicitação registrada
                                            </div>
                                            <p className="text-sm text-gray-400 mt-1">
                                                Especialistas da MCinfraTI entrarão em contato com um plano de correção.
                                            </p>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setResult(null)}
                                        className="w-full rounded-xl border border-white/15 py-3 text-sm text-gray-300 hover:bg-white/5 transition"
                                    >
                                        Analisar outro domínio
                                    </button>
                                </div>
                            )}

                            {result && !analysis && (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 text-emerald-400 text-sm">
                                        <CheckCircle2 className="w-5 h-5" />
                                        Registrar — recebemos seus dados.
                                    </div>
                                    <p className="text-gray-400">{result.message}</p>
                                    <button
                                        onClick={() => setResult(null)}
                                        className="w-full rounded-xl border border-white/15 py-3 text-sm text-gray-300 hover:bg-white/5 transition"
                                    >
                                        Analisar outro domínio
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* faixa de números */}
                <section className="max-w-5xl mx-auto px-6 pb-24">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[
                            { value: '12+', label: 'checagens por domínio', icon: FileSearch },
                            { value: '<5s', label: 'análise em tempo real', icon: Zap },
                            { value: '24h', label: 'plano de contigências', icon: Compass },
                            { value: '100%', label: 'conformidade LGPD', icon: Scale },
                        ].map((s) => (
                            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
                                <s.icon className="w-6 h-6 text-cyan-400 mx-auto mb-3" />
                                <div className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{s.value}</div>
                                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* o que analisamos */}
                <section id="o-que-analisamos" className="max-w-6xl mx-auto px-6 pb-24">
                    <SectionTitle
                        eyebrow="Cobertura completa"
                        title="O que o Radar verifica no seu domínio"
                        subtitle="Uma bateria de testes automatizados que expõe os pontos fracos que atacantes exploram primeiro."
                    />
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {[
                            {
                                icon: Braces,
                                title: 'Cabeçalhos de segurança',
                                items: ['CSP (Content-Security-Policy)', 'HSTS e redirecionamento HTTPS', 'X-Frame-Options / Referrer-Policy'],
                            },
                            {
                                icon: Lock,
                                title: 'TLS e criptografia',
                                items: ['Certificado válido e próximo do vencimento', 'TLS 1.2/1.3 ativos', 'Cadeia de confiança e cifras'],
                            },
                            {
                                icon: Server,
                                title: 'DNS e e-mail',
                                items: ['Registros SPF, DKIM e DMARC', 'Servidores MX expostos', 'Zonas e subdomínios públicos'],
                            },
                            {
                                icon: Globe,
                                title: 'Exposição de informações',
                                items: ['Versão de tecnologias reveladas', 'Cabeçalho de servidor exposto', 'Arquivos sensíveis acessíveis'],
                            },
                            {
                                icon: Cookie,
                                title: 'Cookies e sessão',
                                items: ['Flags HttpOnly e Secure', 'Atributo SameSite', 'Sessões protegidas'],
                            },
                            {
                                icon: Gauge,
                                title: 'Prontidão e performance',
                                items: ['Tempo de resposta do servidor', 'Redirecionamentos e HTTPS universal', 'Disponibilidade do origin'],
                            },
                        ].map((f) => (
                            <div key={f.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:border-cyan-400/30 hover:bg-cyan-400/[0.03] transition">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
                                        <f.icon className="w-5 h-5 text-cyan-300" />
                                    </div>
                                    <h3 className="font-semibold">{f.title}</h3>
                                </div>
                                <ul className="space-y-2.5">
                                    {f.items.map((item) => (
                                        <li key={item} className="flex items-start gap-2.5 text-sm text-gray-400">
                                            <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>

                {/* como funciona */}
                <section id="como-funciona" className="max-w-6xl mx-auto px-6 pb-24">
                    <SectionTitle
                        eyebrow="Processo"
                        title="Do domínio à correção em 3 passos"
                        subtitle="Simples para você começar, completo para a nossa equipe agir."
                    />
                    <div className="grid sm:grid-cols-3 gap-5">
                        {[
                            {
                                step: '01',
                                icon: Radar,
                                title: 'Informe seu domínio',
                                text: 'Preencha o formulário com seus dados e a URL. Levamos poucos segundos.',
                            },
                            {
                                step: '02',
                                icon: ScanSearch,
                                title: 'Análise automatizada',
                                text: 'Varremos cabeçalhos, TLS, DNS e exposição de informações com mais de 12 checagens.',
                            },
                            {
                                step: '03',
                                icon: Compass,
                                title: 'Score + plano de ação',
                                text: 'Você recebe a nota 0–100. Se preferir, nossa equipe corrige e monitora o domínio.',
                            },
                        ].map((s) => (
                            <div key={s.step} className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                                <div className="absolute -top-3 left-6 px-2 text-xs text-cyan-400 font-mono bg-[#05070f]">{s.step}</div>
                                <s.icon className="w-7 h-7 text-cyan-400 mb-4" />
                                <h3 className="font-semibold mb-2">{s.title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{s.text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* por que segurança digital importa */}
                <section id="diferenciais" className="max-w-6xl mx-auto px-6 pb-24">
                    <SectionTitle
                        eyebrow="Por que investir"
                        title="Segurança digital não é opcional"
                        subtitle="Falhas que parecem técnicas se transformam em prejuízo, multa e perda de confiança."
                    />
                    <div className="grid sm:grid-cols-2 gap-5">
                        {[
                            {
                                icon: TrendingDown,
                                title: 'Ataques acontecem em segundos',
                                text: 'Headers e TLS ausentes são os primeiros alvos de scanners e bots. Em minutos, seu site pode ser classificado como vulnerável.',
                            },
                            {
                                icon: Users,
                                title: 'Navegadores penalizam sites inseguros',
                                text: 'Chrome, Edge e buscadores exibem avisos de “site não seguro” e prejudicam a posição do seu negócio nos resultados.',
                            },
                            {
                                icon: Scale,
                                title: 'A LGPD responsabiliza empresas',
                                text: 'Incidentes com dados pessoais geram multas de até 2% do faturamento, além de danos à reputação que dificilmente se revertem.',
                            },
                            {
                                icon: KeyRound,
                                title: 'Correção orientada por prioridade',
                                text: 'Não entregamos apenas um relatório. Priorizamos as correções que mais elevam sua nota e protegemos o que importa.',
                            },
                        ].map((c) => (
                            <div key={c.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 flex gap-4 hover:border-blue-400/30 transition">
                                <div className="w-11 h-11 rounded-xl bg-blue-400/10 border border-blue-400/30 flex items-center justify-center shrink-0">
                                    <c.icon className="w-5 h-5 text-blue-300" />
                                </div>
                                <div>
                                    <h3 className="font-semibold mb-2">{c.title}</h3>
                                    <p className="text-sm text-gray-500 leading-relaxed">{c.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* para quem */}
                <section id="para-quem" className="max-w-6xl mx-auto px-6 pb-24">
                    <SectionTitle
                        eyebrow="Público"
                        title="Para quem o Radar Security foi feito"
                        subtitle="Se a sua empresa tem site ou loja virtual, você precisa saber o que está exposto."
                    />
                    <div className="grid sm:grid-cols-3 gap-5">
                        {[
                            { icon: CircleDot, title: 'Pequenas e médias empresas', text: 'Proteção acessível sem depender de um time de segurança dedicado.' },
                            { icon: Globe, title: 'Lojas virtuais e e-commerce', text: 'Dados de pagamento e clientes exigem HTTPS, headers e cookies corretos.' },
                            { icon: Server, title: 'Agencias e provedores', text: 'Comprove a maturidade técnica dos sites que você entrega para clientes.' },
                        ].map((a) => (
                            <div key={a.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
                                <a.icon className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
                                <h3 className="font-semibold mb-2">{a.title}</h3>
                                <p className="text-sm text-gray-500 leading-relaxed">{a.text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* CTA final */}
                <section className="max-w-5xl mx-auto px-6 pb-24">
                    <div className="relative rounded-3xl overflow-hidden border border-cyan-400/30 bg-gradient-to-br from-cyan-500/15 via-blue-600/10 to-emerald-500/10 p-10 sm:p-14 text-center">
                        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-cyan-400/20 blur-[110px] rounded-full" />
                        <div className="relative">
                            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                                Em 30 segundos você descobre a nota
                                <span className="block text-cyan-300">de segurança do seu site</span>
                            </h2>
                            <p className="mt-4 text-gray-400 max-w-xl mx-auto">
                                Gratuito, sem cadastro e com resultado na hora. Se a nota for baixa, nossa equipe monta o plano de correção.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                <a
                                    href="#analise"
                                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-7 py-4 font-semibold text-white shadow-lg shadow-cyan-500/25 hover:brightness-110 transition"
                                >
                                    Analisar meu domínio <ArrowRight className="w-4 h-4" />
                                </a>
                                <a
                                    href="/login"
                                    className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-7 py-4 text-sm text-gray-300 hover:bg-white/5 transition"
                                >
                                    Acessar o painel
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                <footer className="border-t border-white/5 py-8 text-center text-xs text-gray-600">
                    MCinfraTI · Radar Security © 2026 · Monitoramento e contingência cibernética
                </footer>

                <footer className="border-t border-white/5 py-6">
                    <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-500">
                        <span className="text-gray-600">MCinfraTI · Radar Security</span>
                        <Link href="/privacidade" className="hover:text-cyan-300 transition">Política de Privacidade</Link>
                        <Link href="/cookies" className="hover:text-cyan-300 transition">Política de Cookies</Link>
                        <Link href="/termos" className="hover:text-cyan-300 transition">Termos de Uso</Link>
                    </div>
                </footer>
            </div>
            <CookieConsent />
        </div>
    );
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
    return (
        <div className="max-w-2xl mx-auto text-center mb-12">
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-cyan-400 mb-4">
                <ShieldCheck className="w-4 h-4" />
                {eyebrow}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{title}</h2>
            <p className="mt-4 text-gray-500">{subtitle}</p>
        </div>
    );
}