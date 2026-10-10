import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type BadgeStatus = 'ok' | 'fail' | 'alert';

export interface ReportHeaderRow {
    name: string;
    detail?: string;
    status: BadgeStatus;
    recommendation?: string | null;
}

export interface ReportData {
    targetUrl: string;
    domain: string;
    scanId: number;
    score: number;
    baseScore: number;
    grade: string;
    executionDate: string;
    duration: string;
    headersPassed: number;
    headersTotal: number;
    cookiesTotal: number;
    cookiesSecure: number;
    techCount: number;
    subdomainsCount: number;
    severityCounts: { critical: number; high: number; medium: number; low: number; info: number };
    headers: ReportHeaderRow[];
    cookies: ReportHeaderRow[];
    tls: {
        protocol: string | null;
        cipher: string | null;
        issuer: string | null;
        validFrom: string | null;
        validTo: string | null;
        daysRemaining: number | null;
        issues: string[];
        status: BadgeStatus;
    };
    dns: {
        domain: string;
        records: { type: string; data: string }[];
        mx: string[];
        txt: string[];
        hasSpf: boolean;
        hasDmarc: boolean;
        hasDkim: boolean;
        hasMtaSts: boolean;
        subdomains: { subdomain: string; ip: string; alive: boolean }[];
        score: number;
    };
    technologies: { name: string; category: string; confidence: number }[];
    vulnerabilities: { title: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info' }[];
    exposure?: {
        domain: string;
        subdomains: string[];
        exposed_files: {
            path: string;
            url: string;
            type: string;
            severity: string;
            size_bytes: number;
        }[];
        metrics?: {
            subdomains_found_count: number;
            exposed_files_count: number;
            calculated_penalty: number;
        };
    };
    lgpd?: {
        domain: string;
        checks: Array<{
            id: string;
            category: string;
            title: string;
            requirement: string;
            passed: boolean;
            severity: string;
            evidence: string;
            recommendation: string;
            lgpd_article?: string;
        }>;
        metrics: {
            total: number;
            passed: number;
            failed: number;
            critical_failures: number;
            high_failures: number;
            compliance_score: number;
        };
        duration_ms: number;
    };
    scanStatus?: string;
    scanError?: string | null;
    serverExposed?: boolean;
    poweredByExposed?: boolean;
    serverHeader?: string | null;
}

export interface ScanReportSource {
    id?: number | string;
    targetUrl: string;
    domain?: string | null;
    score?: number | null;
    grade?: string | null;
    created_at?: string;
    completed_at?: string;
    duration_ms?: number | null;
    headers?: any;
    cookies?: any;
    tls?: any;
    dns?: any;
    technology?: any;
    vulnerabilities?: any;
    cve_matches?: any;
    info_disclosure?: any;
    subdomains_found?: any;
    ports_found?: any;
    exposure?: any;
    lgpd?: any;
    error?: string | null;
    status?: string;
}

export const SEVERITY_PALETTE: Record<string, string> = {
    critical: '#B91C1C',
    high: '#EA580C',
    medium: '#D97706',
    low: '#2563EB',
    info: '#64748b',
};

const SEVERITY_LABEL: Record<string, string> = {
    critical: 'CRÍTICA',
    high: 'ALTA',
    medium: 'MÉDIA',
    low: 'BAIXA',
    info: 'INFO',
};

const GRADE_COLORS: Record<string, string> = {
    A: '#16a34a',
    B: '#34d399',
    C: '#eab308',
    D: '#fb923c',
    E: '#f87171',
    F: '#dc2626',
};

const BADGE_COLORS: Record<BadgeStatus, string> = { ok: '#059669', fail: '#B91C1C', alert: '#D97706' };
const BADGE_LABELS: Record<BadgeStatus, string> = { ok: 'PASSOU', fail: 'FALHOU', alert: 'ALERTA' };

function clean(value: string, max = 260): string {
    if (!value) return '';
    return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

const PT_FIXES: Array<[RegExp, string]> = [
    [/Use HSTS to enforce HTTPS.*/i, 'Habilite o cabeçalho HSTS para forçar conexões seguras HTTPS (ex: max-age=31536000; includeSubDomains)'],
    [/Add a Content-Security-Policy header to prevent XSS and data injection.*/i, 'Adicione o cabeçalho Content-Security-Policy para prevenir ataques de XSS e injeção de dados'],
    [/Set X-Frame-Options to DENY or SAMEORIGIN to prevent clickjacking.*/i, 'Defina X-Frame-Options como DENY ou SAMEORIGIN para prevenir clickjacking'],
    [/Set X-Content-Type-Options to nosniff to prevent MIME sniffing.*/i, 'Defina X-Content-Type-Options como nosniff para prevenir MIME sniffing'],
    [/Add .*Permissions-Policy header.*/i, 'Adicione cabeçalho Permissions-Policy para restringir recursos do navegador (câmera, microfone, etc.)'],
    [/Set Referrer-Policy to strict-origin-when-cross-origin or no-referrer.*/i, 'Defina Referrer-Policy como strict-origin-when-cross-origin ou no-referrer'],
    [/TLS scan failed.*/i, 'Falha na varredura da cifra/certificado TLS'],
    [/Cookie does not have the Secure flag.*/i, 'Cookie sem o atributo Secure — só deve ser enviado em conexões HTTPS'],
    [/Cookie should be HttpOnly.*/i, 'Adicione o atributo HttpOnly ao cookie'],
    [/Cookie should have SameSite.*/i, 'Defina o atributo SameSite (Lax ou Strict) no cookie'],
];

function pt(value: string | null | undefined): string | null {
    if (value == null) return null;
    let out = clean(String(value), 280);
    for (const [re, rep] of PT_FIXES) {
        if (re.test(out)) {
            out = rep;
            break;
        }
    }
    return out;
}

function secureCookies(cookies: any[]): number {
    if (!Array.isArray(cookies)) return 0;
    return cookies.filter(
        (c) => c?.httpOnly && c?.secure && ['strict', 'lax'].includes(String(c.sameSite).toLowerCase())
    ).length;
}

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function cookieStatus(c: any): BadgeStatus {
    if (c?.httpOnly && c?.secure && ['strict', 'lax'].includes(String(c.sameSite).toLowerCase())) return 'ok';
    return 'fail';
}

function tlsStatus(tls: any): BadgeStatus {
    if (!tls) return 'alert';
    if (Array.isArray(tls.issues) && tls.issues.some((i: string) => String(i).toLowerCase().includes('scan failed'))) {
        return 'alert';
    }
    const issues = Array.isArray(tls.issues) ? tls.issues.length : 0;
    if (issues > 0) return 'fail';
    if (typeof tls.daysRemaining === 'number' && tls.daysRemaining <= 30) return 'alert';
    return 'ok';
}

export function getGradeColor(grade: string): string {
    return GRADE_COLORS[grade?.toUpperCase()] || '#94a3b8';
}

export function buildReportData(source: ScanReportSource): ReportData {
    const headers = Array.isArray(source.headers) ? source.headers : [];
    const cookies = Array.isArray(source.cookies) ? source.cookies : [];
    const techs = Array.isArray(source.technology) ? source.technology : [];
    const dns: any = source.dns || {};
    const subdomains = Array.isArray(dns.subdomains) ? dns.subdomains : [];
    const vulnStrings = Array.isArray(source.vulnerabilities) ? source.vulnerabilities : [];
    const cves = Array.isArray(source.cve_matches) ? source.cve_matches : [];
    const infoDisclosure: any = source.info_disclosure || {};
    const exposureData: any = source.exposure || {};
    const exposedFiles: any[] = Array.isArray(exposureData.exposed_files) ? exposureData.exposed_files : [];
    const passiveSubdomains: string[] = Array.isArray(exposureData.subdomains) ? exposureData.subdomains : [];
    const exposureMetrics = exposureData.metrics || {};

    const severity: ReportData['severityCounts'] = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const vulnerabilityItems: { title: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info' }[] = [];

    for (const f of exposedFiles) {
        const sevKey = (String(f?.severity || 'info').toLowerCase() === 'critical' ? 'critical'
            : String(f?.severity || '').toLowerCase() === 'high' ? 'high'
            : String(f?.severity || '').toLowerCase() === 'medium' ? 'medium'
            : String(f?.severity || '').toLowerCase() === 'low' ? 'low' : 'info');
        if (!(sevKey in severity)) continue;
        severity[sevKey] += 1;
        vulnerabilityItems.push({
            title: clean(`${f?.type || 'Arquivo sensível'} exposto em ${f?.path || '?'} (${f?.size_bytes || 0} bytes)`, 300),
            severity: sevKey,
        });
    }

    for (const v of vulnStrings) {
        const text = clean(v, 300);
        let sev: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
        const lowerText = text.toLowerCase();
        if (lowerText.includes('critical') || lowerText.includes('crítica')) sev = 'critical';
        else if (lowerText.includes('high') || lowerText.includes('alta')) sev = 'high';
        else if (lowerText.includes('medium') || lowerText.includes('média')) sev = 'medium';
        else if (lowerText.includes('low') || lowerText.includes('baixa')) sev = 'low';
        else sev = 'info';
        if (!(sev in severity)) continue;
        severity[sev] += 1;
        vulnerabilityItems.push({ title: text || 'Achado sem descrição', severity: sev });
    }
    for (const cve of cves as any[]) {
        const sev = (String(cve.severity || 'info').toLowerCase() ||
            'info') as 'critical' | 'high' | 'medium' | 'low' | 'info';
        const sevKey = sev === 'critical' ? 'critical' : sev === 'high' ? 'high' : sev === 'medium' ? 'medium' : sev === 'low' ? 'low' : 'info';
        if (!(sevKey in severity)) continue;
        severity[sevKey] += 1;
        vulnerabilityItems.push({
            title: clean(`${cve.cve_id || 'CVE'} · ${cve.affected_component || cve.description || ''}`, 300),
            severity: sevKey,
        });
    }

    // Derived checks: entram NO severityCounts (para score/impacto) mas NÃO na tabela de vulnerabilidades
    // (a tabela lista apenas achados diretos da varredura — arquivos expostos, vulnerabilidades e CVEs).
    const missingHsts = headers.some((h) => h?.header?.toLowerCase().includes('strict-transport-security') && !h?.present);
    const missingCsp = headers.some((h) => h?.header?.toLowerCase().includes('content-security-policy') && !h?.present);
    if (missingHsts) severity.medium += 1;
    if (missingCsp) severity.medium += 1;

    const txt = Array.isArray(dns.txt) ? dns.txt : [];
    const dnsSpf = txt.some((t: string) => t.toLowerCase().includes('v=spf1'));
    const dnsDmarc = txt.some((t: string) => t.toLowerCase().includes('dmarc'));
    if (!dnsSpf) severity.medium += 1;
    if (!dnsDmarc) severity.medium += 1;

    const cookieIssues = cookies.filter((c: any) => !c?.httpOnly || !c?.secure || (c?.sameSite && !['strict', 'lax'].includes(String(c.sameSite).toLowerCase()))).length;
    if (cookieIssues > 0) severity.low += Math.min(cookieIssues, 2);

    // Score base: score hipotético sem penalidade (exposição de arquivos).
    // Exposto para que o PDF mostre o impacto proporcional da penalidade.
    const penaltyValue = typeof exposureMetrics.calculated_penalty === 'number' ? exposureMetrics.calculated_penalty : 0;
    const scoreValue = typeof source.score === 'number' ? source.score : 0;
    const baseScore = Math.min(100, scoreValue + penaltyValue);

    // Grade vem do pipeline (getSecurityGrade em runScanPipeline) — não recalcular no PDF.
    const grade = (source.grade || 'F').toUpperCase();
    const created = source.created_at || source.completed_at || new Date().toISOString();

    const lgpdData: any = source.lgpd || null;
    const lgpdChecks: any[] = Array.isArray(lgpdData?.checks) ? lgpdData.checks : [];
    const lgpdMetrics = lgpdData?.metrics || { total: 0, passed: 0, failed: 0, critical_failures: 0, high_failures: 0, compliance_score: 0 };

    return {
        targetUrl: source.targetUrl || '',
        domain: source.domain || new URL(source.targetUrl || 'https://local.invalid').hostname,
        scanId: Number(source.id || 0),
        score: scoreValue,
        baseScore,
        grade,
        executionDate: format(new Date(created), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR }),
        duration: `${((source.duration_ms || 0) / 1000).toFixed(1)}s`,
        headersPassed: headers.filter((h: any) => h?.present).length,
        headersTotal: headers.length,
        cookiesTotal: cookies.length,
        cookiesSecure: secureCookies(cookies),
        techCount: techs.length,
        subdomainsCount: subdomains.length,
        severityCounts: severity,
        scanStatus: source.status || 'completed',
        scanError: source.error || null,
        serverExposed: infoDisclosure?.server_exposed === true,
        poweredByExposed: infoDisclosure?.poweredBy_exposed === true,
        serverHeader: infoDisclosure?.server_header || null,
        headers: headers.map((h: any) => ({
            name: h?.header || '?',
            detail: h?.present ? (h?.value ? clean(h.value, 80) : undefined) : undefined,
            status: h?.present ? 'ok' : 'fail',
            recommendation: pt(h?.recommendation) || null,
        })),
        cookies: cookies.map((c: any) => ({
            name: clean(c?.name || 'unknown', 60),
            detail: `HttpOnly:${c?.httpOnly ? 'sim' : 'não'} · Secure:${c?.secure ? 'sim' : 'não'} · SameSite:${c?.sameSite || '—'}`,
            status: cookieStatus(c),
            recommendation: pt(c?.recommendation) || null,
        })),
        tls: {
            protocol: source.tls?.protocol || null,
            cipher: source.tls?.cipher || null,
            issuer: source.tls?.issuer || null,
            validFrom: source.tls?.validFrom || null,
            validTo: source.tls?.validTo || null,
            daysRemaining: typeof source.tls?.daysRemaining === 'number' ? source.tls.daysRemaining : null,
            issues: Array.isArray(source.tls?.issues) ? source.tls.issues.map((i: string) => pt(clean(i, 200)) || '') : [],
            status: tlsStatus(source.tls),
        },
        dns: {
            domain: dns.domain || source.domain || '',
            records: Array.isArray(dns.records) ? dns.records : [],
            mx: Array.isArray(dns.mx) ? dns.mx : [],
            txt,
            hasSpf: txt.some((t: string) => t.toLowerCase().includes('v=spf1')),
            hasDmarc: txt.some((t: string) => t.toLowerCase().includes('dmarc')),
            hasDkim: txt.some((t: string) => t.toLowerCase().includes('dkim')),
            hasMtaSts: dns.mta_sts_policy === true,
            subdomains: subdomains.map((s: any) => ({
                subdomain: s?.subdomain || '?',
                ip: s?.ip || '—',
                alive: s?.alive !== false,
            })),
            score: typeof dns.score === 'number' ? dns.score : 0,
        },
        technologies: techs.map((t: any) => ({
            name: clean(t?.name || '?', 60),
            category: t?.category || '—',
            confidence: typeof t?.confidence === 'number' ? t.confidence : 0,
        })),
        vulnerabilities: vulnerabilityItems,
        exposure: {
            domain: exposureData.domain || source.domain || '',
            subdomains: passiveSubdomains,
            exposed_files: exposedFiles.map((f: any) => ({
                path: f?.path || '?',
                url: f?.url || '',
                type: f?.type || 'Arquivo',
                severity: f?.severity || 'INFO',
                size_bytes: typeof f?.size_bytes === 'number' ? f.size_bytes : 0,
            })),
            metrics: {
                subdomains_found_count: typeof exposureMetrics.subdomains_found_count === 'number' ? exposureMetrics.subdomains_found_count : passiveSubdomains.length,
                exposed_files_count: typeof exposureMetrics.exposed_files_count === 'number' ? exposureMetrics.exposed_files_count : exposedFiles.length,
                calculated_penalty: penaltyValue,
            },
        },
        lgpd: lgpdData ? {
            domain: lgpdData.domain || source.domain || '',
            checks: lgpdChecks,
            metrics: {
                total: typeof lgpdMetrics.total === 'number' ? lgpdMetrics.total : lgpdChecks.length,
                passed: typeof lgpdMetrics.passed === 'number' ? lgpdMetrics.passed : lgpdChecks.filter((c) => c.passed).length,
                failed: typeof lgpdMetrics.failed === 'number' ? lgpdMetrics.failed : lgpdChecks.filter((c) => !c.passed).length,
                critical_failures: typeof lgpdMetrics.critical_failures === 'number' ? lgpdMetrics.critical_failures : lgpdChecks.filter((c) => !c.passed && c.severity === 'critical').length,
                high_failures: typeof lgpdMetrics.high_failures === 'number' ? lgpdMetrics.high_failures : lgpdChecks.filter((c) => !c.passed && c.severity === 'high').length,
                compliance_score: typeof lgpdMetrics.compliance_score === 'number' ? lgpdMetrics.compliance_score : 0,
            },
            duration_ms: typeof lgpdData.duration_ms === 'number' ? lgpdData.duration_ms : 0,
        } : undefined,
    };
}

export function sanitizeFilenamePart(value: string): string {
    return String(value).replace(/[^a-zA-Z0-9]/g, '_');
}

export async function generatePdfReport(data: ReportData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    const pdf = new Promise<Buffer>((resolve, reject) => {
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    const M = 50;
    const W = doc.page.width; // 595.28
    const CONTENT_W = W - M * 2; // 495.28
    const PAGE_H = doc.page.height; // 841.89
    const BOTTOM = PAGE_H - 64;

    const COLORS = {
        ink: '#0f172a',
        inkSoft: '#334155',
        body: '#475569',
        mute: '#64748b',
        faint: '#94a3b8',
        brand: '#2563eb',
        brandSoft: '#60a5fa',
        line: '#e2e8f0',
        fill: '#f8fafc',
        white: '#ffffff',
        ok: '#059669',
        fail: '#B91C1C',
        alert: '#D97706',
    };

    function runningHeader() {
        doc.save();
        doc.rect(0, 0, W, 26).fill(COLORS.ink);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#e2e8f0');
        doc.text('MCinfraTI RADAR SECURITY', M, 8, { width: 260 });
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8');
        doc.text('Relatório de Diagnóstico de Segurança · Documento Confidencial', M + 260, 9, { width: CONTENT_W - 260 });
        doc.restore();
        doc.y = 38;
    }

    function newPage(first: boolean = false) {
        doc.addPage();
        if (!first) runningHeader();
    }

    function ensureSpace(needed: number): number {
        if (doc.y + needed > BOTTOM) {
            newPage();
            return M;
        }
        return doc.y;
    }

    function startSection(title: string, estimate: number) {
        doc.y = ensureSpace(estimate + 34);
        doc.save()
            .roundedRect(M, doc.y, CONTENT_W, 28, 7)
            .fill(COLORS.ink);
        doc.restore();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10.5);
        doc.text(title.toUpperCase(), M + 12, doc.y + 8, { width: CONTENT_W - 24 });
        doc.y += 38;
    }

    function box(x: number, y: number, w: number, h: number, fill = COLORS.fill) {
        doc.save()
            .roundedRect(x, y, w, h, 9)
            .fill(fill)
            .lineWidth(1)
            .strokeColor(COLORS.line)
            .stroke();
        doc.restore();
    }

    function chip(x: number, y: number, w: number, h: number, color: string, text: string, textColor = '#ffffff') {
        doc.save().roundedRect(x, y, w, h, h / 2).fill(color);
        doc.fillColor(textColor).font('Helvetica-Bold').fontSize(6.5);
        doc.text(text, x + 3, y + h / 2 - 3, { width: w - 6, align: 'center' });
        doc.restore();
    }

    function badge(x: number, y: number, status: BadgeStatus) {
        chip(x, y, 54, 15, BADGE_COLORS[status], BADGE_LABELS[status]);
    }

    function textBlock(text: string, opts: { x?: number; y?: number; w?: number; size?: number; color?: string; font?: 'Helvetica-Bold' | 'Helvetica' | 'Courier'; lineGap?: number } = {}) {
        const x = opts.x ?? M;
        const y = opts.y ?? doc.y;
        doc.save();
        doc.font(opts.font || 'Helvetica').fontSize(opts.size || 8.5).fillColor(opts.color || COLORS.body);
        doc.text(text, x, y, { width: opts.w ?? CONTENT_W, lineBreak: true, lineGap: opts.lineGap ?? 3 });
        doc.restore();
    }

    function bullet(label: string, detail: string, y: number, color: string) {
        doc.save();
        doc.circle(M + 5, y + 4, 2.2).fill(color);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.inkSoft);
        doc.text(label, M + 14, y, { width: CONTENT_W - 14, lineBreak: true, lineGap: 3 });
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.body);
        const labelH = doc.heightOfString(label, { width: CONTENT_W - 14 });
        doc.text(detail, M + 14, y + labelH + 1, { width: CONTENT_W - 14, lineBreak: true, lineGap: 3 });
        doc.restore();
        const totalH = labelH + 1 + doc.heightOfString(detail, { width: CONTENT_W - 14 }) + 6;
        doc.y = y + totalH;
    }

    type SeverityKey = keyof ReportData['severityCounts'];
    function severityTotal(data: ReportData): number {
        return Object.values(data.severityCounts).reduce((a: number, b) => a + b, 0);
    }

    // Painel escuro "hitech"
    function panelDark(x: number, y: number, w: number, h: number) {
        doc.save().roundedRect(x, y, w, h, 12).fill('#0f172a').restore();
        doc.save().rect(x + 12, y + 3, w - 24, 2).fill('#38bdf8').restore();
    }

    // Titulo pequeno em caps + cor de destaque (estilo HUD)
    function hudTitle(x: number, y: number, text: string, color: string = '#38bdf8') {
        doc.font('Helvetica-Bold').fontSize(7).fillColor(color);
        doc.text(text.toUpperCase(), x, y, { width: 320 });
    }

    // Tile de severidade (placar)
    function sevTile(x: number, y: number, w: number, h: number, color: string, label: string, count: number, total: number) {
        doc.save().roundedRect(x, y, w, h, 8).fill('#0f172a').restore();
        doc.save().rect(x, y + 3, w, 2.5).fill(color).restore();
        const active = count > 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        doc.font('Helvetica').fontSize(6).fillColor('#64748b');
        doc.text(label, x + 9, y + 8, { width: w - 18 });
        doc.font('Helvetica-Bold').fontSize(18).fillColor(active ? color : '#334155');
        doc.text(String(count), x + 9, y + 17, { width: w - 18 });
        doc.font('Helvetica').fontSize(6).fillColor(active ? '#94a3b8' : '#475569');
        doc.text(active ? `${pct}% dos achados` : 'sem achados', x + 9, y + 40, { width: w - 18 });
    }

    // Medidor (ring/gauge) de pontuacao
    function gauge(cx: number, cy: number, r: number, score: number, color: string) {
        const frac = Math.max(0, Math.min(1, score / 100));
        doc.save().circle(cx, cy, r).lineWidth(7).strokeColor('#1e293b').stroke().restore();
        const start = -Math.PI / 2;
        const sweep = frac * Math.PI * 2;
        if (frac >= 0.999) {
            doc.save().circle(cx, cy, r).lineWidth(7).strokeColor(color).stroke().restore();
        } else if (frac > 0.002) {
            doc.save();
            (doc as any).arc(cx, cy, r, start, start + sweep, false);
            doc.lineWidth(7).strokeColor(color).stroke();
            doc.restore();
        }
        for (let t = 0; t <= 20; t++) {
            const a = start + (t / 20) * Math.PI * 2;
            const major = t % 5 === 0;
            const x1 = cx + (r - (major ? 7 : 5)) * Math.cos(a);
            const y1 = cy + (r - (major ? 7 : 5)) * Math.sin(a);
            const x2 = cx + r * Math.cos(a);
            const y2 = cy + r * Math.sin(a);
            doc.save().moveTo(x1, y1).lineTo(x2, y2).lineWidth(major ? 1.4 : 0.8).strokeColor(major ? '#475569' : '#1e293b').stroke().restore();
        }
        const na = start + sweep;
        doc.save().moveTo(cx, cy).lineTo(cx + (r - 13) * Math.cos(na), cy + (r - 13) * Math.sin(na)).lineWidth(2.2).strokeColor(color).stroke().restore();
        doc.save().circle(cx, cy, 3.2).fill(color).restore();
        doc.font('Helvetica-Bold').fontSize(27).fillColor('#ffffff');
        doc.text(String(score), cx, cy - 16, { width: 0, align: 'center' });
        doc.font('Helvetica').fontSize(6.5).fillColor('#94a3b8');
        doc.text('de 100 pontos', cx, cy + 12, { width: 0, align: 'center' });
    }

    // KPI card (pagina do resumo executivo)
    function kpiCard(x: number, y: number, w: number, h: number, label: string, value: string, sub: string, color: string) {
        box(x, y, w, h);
        doc.save().rect(x, y, 3, h).fill(color).restore();
        doc.font('Helvetica').fontSize(7).fillColor(COLORS.mute);
        doc.text(label.toUpperCase(), x + 12, y + 8, { width: w - 20 });
        doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.ink);
        doc.text(value, x + 12, y + 18, { width: w - 20 });
        doc.font('Helvetica').fontSize(6).fillColor(COLORS.faint);
        doc.text(sub, x + 12, y + 36, { width: w - 20 });
    }

    function donut(cx: number, cy: number, r: number, segments: { value: number; color: string }[], total: number, dark: boolean = false) {
        const ring = 0.58;
        const panelBg = dark ? '#0f172a' : '#ffffff';
        const centerText = dark ? '#ffffff' : COLORS.ink;
        const captionText = dark ? '#94a3b8' : COLORS.mute;
        if (total <= 0) {
            doc.save().circle(cx, cy, r).lineWidth(5).strokeColor(dark ? '#1e293b' : COLORS.line).stroke().restore();
            doc.save().circle(cx, cy, r * ring).fill(panelBg).restore();
            doc.font('Helvetica-Bold').fontSize(14).fillColor(centerText);
            doc.text('0', cx, cy - 8, { width: 0, align: 'center' });
            doc.font('Helvetica').fontSize(6).fillColor(captionText);
            doc.text('ACHADOS', cx, cy + 6, { width: 0, align: 'center' });
            return;
        }
        let angle = -Math.PI / 2;
        for (const seg of segments) {
            if (seg.value <= 0) continue;
            const sweep = (seg.value / total) * Math.PI * 2;
            if (seg.value / total >= 0.9999) {
                doc.save().circle(cx, cy, r).fill(seg.color).restore();
                angle = angle + sweep;
                continue;
            }
            doc.save();
            doc.moveTo(cx, cy);
            doc.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
            (doc as any as { arc: (x: number, y: number, r: number, s: number, e: number, ccw?: boolean) => void }).arc(cx, cy, r, angle, angle + sweep, false);
            doc.closePath();
            doc.fillColor(seg.color).fill();
            doc.restore();
            angle += sweep;
        }
        doc.save().circle(cx, cy, r * ring).fill(panelBg).restore();
        doc.save().circle(cx, cy, r).lineWidth(5).strokeColor(dark ? '#1e293b' : COLORS.line).stroke().restore();
        doc.font('Helvetica-Bold').fontSize(15).fillColor(centerText);
        doc.text(String(total), cx, cy - 9, { width: 0, align: 'center' });
        doc.font('Helvetica').fontSize(6).fillColor(captionText);
        doc.text('ACHADOS', cx, cy + 7, { width: 0, align: 'center' });
    }

    type Cell = { kind: 'text'; value: string; mono?: boolean; color?: string; bold?: boolean } | { kind: 'badge'; badge: BadgeStatus } | { kind: 'chip'; color: string; text: string };

    function rowHeight(row: Cell[], widths: number[], rowPad: number): number {
        let h = 21;
        for (let c = 0; c < row.length; c++) {
            const cell = row[c];
            if (cell.kind === 'text') {
                const th = doc.heightOfString(cell.value, { width: widths[c] - rowPad * 2, lineBreak: true });
                h = Math.max(h, Math.ceil(th) + 11);
            }
        }
        return h;
    }

    function drawTable(columns: string[], widths: number[], rows: Cell[][], rowPad = 8) {
        const tableX = M;
        const tableW = CONTENT_W;
        let i = 0;
        while (i < rows.length) {
            const firstRowH = rowHeight(rows[i], widths, rowPad);
            doc.y = ensureSpace(25 + firstRowH + 4);
            const headerY = doc.y;
            doc.save().rect(tableX, headerY, tableW, 24).fill('#1e293b').restore();
            let cx = tableX;
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#cbd5e1');
            for (let c = 0; c < columns.length; c++) {
                doc.text(columns[c].toUpperCase(), cx + rowPad, headerY + 8, { width: widths[c] - rowPad * 2 });
                cx += widths[c];
            }
            let y = headerY + 24;
            let r = i;
            while (r < rows.length) {
                const rh = rowHeight(rows[r], widths, rowPad);
                if (y + rh + 1 > BOTTOM) break;
                doc.save().rect(tableX, y, tableW, rh).fill(r % 2 === 0 ? '#ffffff' : '#f1f5f9').restore();
                cx = tableX;
                for (let c = 0; c < rows[r].length; c++) {
                    const cell = rows[r][c];
                    if (cell.kind === 'badge') {
                        badge(cx + rowPad, y + rh / 2 - 7.5, cell.badge);
                    } else if (cell.kind === 'chip') {
                        chip(cx + rowPad, y + rh / 2 - 7.5, 74, 15, cell.color, cell.text);
                    } else {
                        doc.save();
                        doc.font(cell.mono ? 'Courier' : cell.bold ? 'Helvetica-Bold' : 'Helvetica')
                            .fontSize(7.5)
                            .fillColor(cell.color || COLORS.inkSoft)
                            .text(cell.value, cx + rowPad, y + 6, {
                                width: widths[c] - rowPad * 2,
                                lineBreak: true,
                                ellipsis: true,
                            });
                        doc.restore();
                    }
                    cx += widths[c];
                }
                y += rh + 1;
                r++;
            }
            doc.y = y + 4;
            i = r;
        }
        doc.y += 6;
    }

    // ============================= CAPA =============================
    doc.save().rect(0, 0, W, 168).fill(COLORS.ink).restore();
    doc.save().rect(0, 168, W, 4).fill(COLORS.brand).restore();

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#60a5fa');
    doc.text('MCinfraTI RADAR SECURITY', M, 30, { width: CONTENT_W });
    doc.font('Helvetica-Bold').fontSize(23).fillColor('#ffffff');
    doc.text('RELATÓRIO DE DIAGNÓSTICO', M, 46, { width: CONTENT_W });
    doc.text('DE VULNERABILIDADES', M, 74, { width: CONTENT_W });
    doc.font('Helvetica').fontSize(10).fillColor('#cbd5e1');
    doc.text('Análise passiva observacional de superfície de ataque (HTTP, TLS, DNS, subdomínios via CT logs e arquivos sensíveis)', M, 112, {
        width: CONTENT_W,
    });

    doc.font('Helvetica').fontSize(8.5).fillColor('#e2e8f0');
    doc.text(`Projeto / Alvo:  ${clean(data.targetUrl, 90)}`, M, 138, { width: CONTENT_W });
    doc.text(`Emitido em:  ${data.executionDate}   ·   ID do scan:  #scan-${data.scanId}   ·   Duração: ${data.duration}`, M, 152, {
        width: CONTENT_W,
    });

    doc.y = 200;

    // Box escopo / "stack detectada"
    startSection('Escopo e Nota Metodológica', 158);
    textBlock(`Domínio analisado: ${data.domain}  ·  Tipo de scan: website (observacional)  ·  Ref: MCinfraTI Radar v12.11.0-Build-PANDORA`, { size: 8 });
    doc.save();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink);
    doc.text('ALVO ANALISADO', M, doc.y, { width: CONTENT_W });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.body);
    doc.text(`URL: ${clean(data.targetUrl, 120)}`, M, doc.y + 13, { width: CONTENT_W });
    doc.text(`Domínio: ${data.domain}`, M, doc.y + 26, { width: CONTENT_W });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.inkSoft);
    const techNames = data.technologies.slice(0, 4).map((t) => t.name);
    doc.text(
        `Tecnologias identificadas: ${techNames.length ? techNames.join(', ') : '—'} · Subdomínios enumerados: ${data.subdomainsCount}`,
        M,
        doc.y + 39,
        { width: CONTENT_W }
    );
    doc.restore();
    doc.text(
        'Este relatório foi gerado automaticamente por varredura passiva, sem enviar pacotes intrusivos. As verificações cobrem cabeçalhos de segurança HTTP, cookies, transporte TLS/SSL, registros DNS (SPF, DMARC, DKIM, MTA-STS), enumeração de subdomínios (DNS e logs de transparência de certificados — crt.sh), detecção de tecnologias e exposição de arquivos/configurações sensíveis (.env, repositórios Git, backups, dumps de banco). Não constitui teste de intrusão (pentest) e não verifica vulnerabilidades de aplicação além dos controles listados.',
        M,
        doc.y + 8,
        { width: CONTENT_W, lineBreak: true }
    );
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.mute);
    doc.y = doc.y + 100;

    // ================== PAINEL HITECH: PONTUAÇÃO GERAL + MÉTRICAS ==================
    const sevKeys: SeverityKey[] = ['critical', 'high', 'medium', 'low', 'info'];
    const sevTileDefs: Array<{ key: SeverityKey; label: string; color: string }> = [
        { key: 'critical', label: 'CRÍTICA', color: SEVERITY_PALETTE.critical },
        { key: 'high', label: 'ALTA', color: SEVERITY_PALETTE.high },
        { key: 'medium', label: 'MÉDIA', color: SEVERITY_PALETTE.medium },
        { key: 'low', label: 'BAIXA', color: SEVERITY_PALETTE.low },
        { key: 'info', label: 'INFO', color: SEVERITY_PALETTE.info },
    ];
    const totalFindings = severityTotal(data);
    const gradeColor = getGradeColor(data.grade);
    const gradeTier: Record<string, string> = { A: 'EXCELENTE', B: 'BOM', C: 'REGULAR', D: 'FRACO', E: 'CRÍTICO', F: 'CRÍTICO' };
    const tier = gradeTier[data.grade] || 'INDEFINIDO';

    const PANEL_H = 336;
    const PANEL_BREAK_H = PANEL_H + 16;
    doc.y = ensureSpace(PANEL_BREAK_H);
    const dashY = doc.y;
    panelDark(M, dashY, CONTENT_W, PANEL_H);

    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#f8fafc');
    doc.text('PONTUAÇÃO GERAL DE SEGURANÇA', M + 20, dashY + 18, { width: 260 });
    hudTitle(M + 310, dashY + 21, 'MÉTRICAS DA AUDITORIA');

    gauge(M + 104, dashY + 152, 54, data.score, gradeColor);

    doc.font('Helvetica-Bold').fontSize(46).fillColor(gradeColor);
    doc.text(data.grade, M + 204, dashY + 88, { width: 72, align: 'center' });
    doc.font('Helvetica').fontSize(6.5).fillColor('#94a3b8');
    doc.text('GRAU ATRIBUÍDO', M + 204, dashY + 146, { width: 72, align: 'center' });
    doc.save().roundedRect(M + 194, dashY + 160, 92, 17, 8.5).fill(gradeColor).restore();
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#ffffff');
    doc.text(tier, M + 194, dashY + 164, { width: 92, align: 'center' });

    const miniK = [
        { label: 'Total de Achados', value: String(totalFindings), sub: totalFindings > 0 ? 'exigem análise' : 'nenhum registrado', color: totalFindings >= 5 ? COLORS.fail : '#38bdf8' },
        { label: 'Score base', value: String(data.baseScore), sub: data.baseScore === data.score ? 'sem penalidade' : `−${data.baseScore - data.score} pts (exposição)`, color: data.baseScore === data.score ? '#34d399' : '#fb923c' },
        { label: 'Subdomínios', value: String(data.subdomainsCount), sub: `${data.dns.records.length} registros DNS`, color: '#818cf8' },
    ];
    miniK.forEach((k, i) => {
        kpiCard(M + 22 + i * 80, dashY + 224, 76, 48, k.label, k.value, k.sub, k.color);
    });
    const tileW = 150;
    const tileH = 48;
    const tileGap = 6;
    sevTileDefs.forEach((t, i) => {
        sevTile(M + CONTENT_W - 20 - tileW, dashY + 34 + i * (tileH + tileGap), tileW, tileH, t.color, t.label, data.severityCounts[t.key], totalFindings);
    });

    doc.font('Helvetica').fontSize(6.5).fillColor('#94a3b8');
    doc.text('DISTRIBUIÇÃO DE ACHADOS POR SEVERIDADE', M + 20, dashY + 310, { width: 240 });
    if (totalFindings > 0) {
        const barX = M + CONTENT_W - 20 - 210;
        let accX = barX;
        for (const k of sevKeys) {
            const c = data.severityCounts[k] ?? 0;
            if (c <= 0) continue;
            const bw = Math.max(2, (c / totalFindings) * 210);
            doc.save().rect(accX, dashY + 312, bw, 12).fill(SEVERITY_PALETTE[k]).restore();
            accX += bw;
        }
        doc.save().rect(barX, dashY + 312, 210, 12).lineWidth(1).strokeColor('#1e293b').stroke().restore();
    } else {
        doc.font('Helvetica').fontSize(6.5).fillColor('#475569');
        doc.text('Nenhum achado registrado na varredura.', M + CONTENT_W - 20 - 210, dashY + 312, { width: 210 });
    }
    doc.y = dashY + PANEL_H + 16;

    if (data.scanStatus && data.scanStatus !== 'completed') {
        box(M, doc.y, CONTENT_W, 42, '#fff7f7');
        doc.fillColor(COLORS.fail).font('Helvetica-Bold').fontSize(8.5);
        doc.text('SCAN NÃO CONCLUÍDO', M + 14, doc.y + 8);
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.body);
        doc.text(clean(data.scanError || 'A varredura foi interrompida antes de coletar todos os dados.', 220), M + 14, doc.y + 22, {
            width: CONTENT_W - 28,
        });
        doc.y += 54;
    }

    // ================== RESUMO EXECUTIVO ==================
    doc.y = ensureSpace(160);
    startSection('Resumo Executivo', 210);

    const kcw = (CONTENT_W - 6 * 3) / 4;
    const kRowH = 46;
    const kGap = 6;
    const kR1: Array<{ label: string; value: string; sub: string; color: string }> = [
        { label: 'Score Geral', value: String(data.score), sub: `de 100 · grau ${data.grade}`, color: gradeColor },
        { label: 'Headers Seguros', value: `${data.headersPassed}`, sub: `de ${data.headersTotal} testados`, color: '#38bdf8' },
        { label: 'Cookies Seguros', value: `${data.cookiesSecure}`, sub: `de ${data.cookiesTotal} analisados`, color: '#818cf8' },
        {
            label: 'Conexão TLS',
            value: data.tls.status === 'ok' ? 'OK' : data.tls.status === 'alert' ? 'ALERTA' : 'FALHO',
            sub: data.tls.status === 'ok' ? 'certificado válido' : data.tls.status === 'alert' ? 'expira em breve' : 'anomalias detectadas',
            color: BADGE_COLORS[data.tls.status],
        },
    ];
    const r1y = doc.y;
    kR1.forEach((c, i) => {
        kpiCard(M + i * (kcw + kGap), r1y, kcw, kRowH, c.label, c.value, c.sub, c.color);
    });
    doc.y = r1y + kRowH + kGap;
    const r2y = doc.y;
    const kR2 = [
        { label: 'DNS / E-mail', value: String(data.dns.score), sub: 'de 100 pontos', color: data.dns.score >= 80 ? COLORS.ok : '#38bdf8' },
        { label: 'Tecnologias', value: String(data.techCount), sub: 'componentes detectados', color: '#818cf8' },
        { label: 'Subdomínios', value: String(data.subdomainsCount), sub: 'hosts mapeados', color: '#818cf8' },
        { label: 'Total de Achados', value: String(totalFindings), sub: totalFindings > 0 ? 'requerem análise' : 'nenhum registrado', color: totalFindings >= 5 ? COLORS.fail : COLORS.ok },
    ];
    kR2.forEach((c, i) => {
        kpiCard(M + i * (kcw + kGap), r2y, kcw, kRowH, c.label, c.value, c.sub, c.color);
    });
    doc.y = r2y + kRowH + kGap + 8;

    // ================== MATRIZ DE VULNERABILIDADES ==================
    startSection('Matriz de Vulnerabilidades', 170);
    const sevRows: Cell[][] = sevKeys.map((k) => [
        { kind: 'chip', color: SEVERITY_PALETTE[k], text: SEVERITY_LABEL[k] },
        { kind: 'text', value: String(data.severityCounts[k] ?? 0), bold: true },
    ]);
    drawTable(['Severidade', 'Ocorrências'], [CONTENT_W - 96, 90], sevRows, 10);
    doc.y += 4;

    // Distribuição (donut) + cobertura de controles em painel escuro
    doc.y = ensureSpace(254);
    const panoY = doc.y;
    const PANEL2_H = 236;
    panelDark(M, panoY, CONTENT_W, PANEL2_H);

    hudTitle(M + 20, panoY + 16, 'DISTRIBUIÇÃO DE ACHADOS POR SEVERIDADE');
    hudTitle(M + 20, panoY + 150, 'COBERTURA DE CONTROLES');

    const dList = sevKeys.filter((k) => (data.severityCounts[k] ?? 0) > 0);
    donut(M + 88, panoY + 90, 38, dList.map((k) => ({ value: data.severityCounts[k] ?? 0, color: SEVERITY_PALETTE[k] })), totalFindings, true);

    const lx = M + 150;
    let ly = panoY + 30;
    dList.forEach((k) => {
        doc.save().rect(lx, ly, 9, 9).fill(SEVERITY_PALETTE[k]).restore();
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#e2e8f0');
        doc.text(SEVERITY_LABEL[k], lx + 14, ly - 1, { width: 60 });
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8');
        doc.text(String(data.severityCounts[k]), lx + 78, ly - 1, { width: 22, align: 'right' });
        doc.font('Helvetica').fontSize(6).fillColor('#64748b');
        doc.text(`${totalFindings ? Math.round(((data.severityCounts[k] ?? 0) / totalFindings) * 100) : 0}%`, lx + 102, ly, { width: 24, align: 'right' });
        ly += 16;
    });
    if (totalFindings === 0) {
        doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Nenhum achado registrado.', lx, panoY + 38, { width: 150 });
    }

    const headerPct = data.headersTotal > 0 ? (data.headersPassed / data.headersTotal) * 100 : null;
    const cookiePct = data.cookiesTotal > 0 ? (data.cookiesSecure / data.cookiesTotal) * 100 : data.cookiesTotal === 0 ? 100 : null;
    const tlsPct = data.tls.status === 'ok' ? 100 : data.tls.status === 'alert' ? 60 : 20;
    const dnsPct = data.dns.score;
    const covW = CONTENT_W - 170;
    const covItems: Array<[string, number | null]> = [
        ['Headers HTTP', headerPct],
        ['TLS / Transporte', tlsPct],
        ['Cookies', cookiePct],
        ['DNS / E-mail', dnsPct],
    ];
    covItems.forEach((it, i) => {
        const ry = panoY + 162 + i * 17;
        const [lab, pct] = it;
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#cbd5e1');
        doc.text(lab.toUpperCase(), M + 20, ry, { width: 120 });
        doc.save().rect(M + 150, ry, covW, 6).fill('#1e293b').restore();
        if (pct !== null) {
            const color = pct >= 80 ? '#34d399' : pct >= 50 ? '#eab308' : pct >= 25 ? '#fb923c' : '#f87171';
            doc.save().rect(M + 150, ry, Math.max(4, (Math.min(100, pct) / 100) * covW), 6).fill(color).restore();
            doc.font('Helvetica-Bold').fontSize(6).fillColor('#e2e8f0');
            doc.text(`${Math.round(pct)}%`, M + 150 + covW + 6, ry - 1, { width: 28, align: 'right' });
        } else {
            doc.font('Helvetica').fontSize(6).fillColor('#64748b');
            doc.text('N/A', M + 150 + covW + 6, ry, { width: 28, align: 'right' });
        }
    });
    doc.y = panoY + PANEL2_H + 16;

    // ================== PONTOS FORTES E FRACOS ==================
    const strengths: Array<[string, string]> = [];
    const weaknesses: Array<[string, string]> = [];

    data.headers.forEach((h) => {
        if (h.status === 'ok') strengths.push([h.name, h.detail ? `Presente (${h.detail})` : 'Cabeçalho presente na resposta']);
        else weaknesses.push([h.name, pt(h.recommendation) || 'Cabeçalho ausente na resposta.']);
    });
    data.cookies.forEach((c) => {
        if (c.status === 'ok') strengths.push([c.name, 'Cookie com HttpOnly, Secure e SameSite adequados']);
        else weaknesses.push([c.name, pt(c.detail) || 'Cookie sem proteções obrigatórias.']);
    });
    if (data.tls.status === 'ok' && data.tls.protocol) {
        strengths.push(['TLS válido', `${data.tls.protocol} · ${data.tls.cipher}`]);
    } else if (data.tls.issues.length) {
        weaknesses.push(['TLS / SSL', pt(data.tls.issues[0]) || 'Transporte TLS com pendências.']);
    } else {
        weaknesses.push(['TLS / SSL', data.tls.status === 'alert' ? 'Certificado próximo da expiração ou indisponível.' : 'Transporte TLS com pendências.']);
    }
    if (data.dns.hasSpf) strengths.push(['SPF', 'Registro SPF publicado (v=spf1)']);
    else weaknesses.push(['SPF', 'SPF ausente — e-mails podem ser forjados.']);
    if (data.dns.hasDmarc) strengths.push(['DMARC', 'Política DMARC publicada']);
    else weaknesses.push(['DMARC', 'DMARC ausente — não há política de rejeição de e-mails falsificados.']);
    if (data.dns.hasDkim) strengths.push(['DKIM', 'Seletor DKIM identificado']);
    if (data.dns.hasMtaSts) strengths.push(['MTA-STS', 'Política MTA-STS ativa']);
    else weaknesses.push(['MTA-STS', 'MTA-STS ausente — tráfego de e-mail não protegido por política.']);
    if (data.serverExposed) weaknesses.push(['Server Header', `Cabeçalho Server exposto: ${clean(data.serverHeader || 'desconhecido', 60)}`]);
    else strengths.push(['Server Header', 'Cabeçalho Server não exposto']);
    if (data.poweredByExposed) weaknesses.push(['X-Powered-By', 'Informação de tecnologia exposta no cabeçalho de resposta']);
    if (data.exposure && data.exposure.exposed_files.length > 0) {
        data.exposure.exposed_files.slice(0, 8).forEach((f) => {
            weaknesses.push([`Exposição: ${f.type}`, `Acessível publicamente em ${f.path} (${formatBytes(f.size_bytes)}) — bloquear acesso externo.`]);
        });
    } else {
        strengths.push(['Arquivos Sensíveis', 'Nenhum arquivo sensível exposto na superfície observada']);
    }
    if (data.severityCounts.critical + data.severityCounts.high === 0 && data.vulnerabilities.length === 0) {
        strengths.push(['CVE / Vulnerabilidades', 'Nenhuma vulnerabilidade confirmada neste scan']);
    }

    const bulletRowH = 26;
    const strCount = Math.min(strengths.length, 14);
    const weakCount = Math.min(weaknesses.length, 14);
    const totalBulletH = (strCount + weakCount) * bulletRowH + 40;
    doc.y = ensureSpace(totalBulletH);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ok);
    doc.text('PONTOS FORTES (CONTROLES CONFIRMADOS)', M, doc.y);
    doc.y += 10;
    for (let bi = 0; bi < strCount; bi++) {
        const [label, detail] = strengths[bi];
        doc.y = ensureSpace(bulletRowH);
        bullet(label, detail, doc.y, COLORS.ok);
    }

    if (strengths.length === 0) {
        doc.y = ensureSpace(20);
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.faint).text('Nenhum controle confirmado neste scan.', M, doc.y);
        doc.y += 20;
    }

    doc.y = ensureSpace(20);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.fail);
    doc.text('PONTOS FRACOS (RISCOS IDENTIFICADOS)', M, doc.y);
    doc.y += 10;
    for (let bi = 0; bi < weakCount; bi++) {
        const [label, detail] = weaknesses[bi];
        doc.y = ensureSpace(bulletRowH);
        bullet(label, detail, doc.y, COLORS.fail);
    }
    if (weaknesses.length === 0) {
        doc.y = ensureSpace(20);
        doc.font('Helvetica').fontSize(8).fillColor(COLORS.faint).text('Nenhum ponto fraco identificado neste scan.', M, doc.y);
        doc.y += 20;
    }
    doc.y += 8;

    // ================== DETALHAMENTO: HEADERS ==================
    startSection('Cabeçalhos de Segurança (HTTP)', 90);
    if (data.headers.length === 0) {
        textBlock('Nenhum cabeçalho de segurança avaliado na resposta.', { color: COLORS.faint });
        doc.y += 18;
    } else {
        drawTable(
            ['Header', 'Status', 'Recomendação e Correção'],
            [150, 62, CONTENT_W - 212],
            data.headers.map((h) => [
                { kind: 'text', value: h.name, mono: true, color: '#1d4ed8' },
                { kind: 'badge', badge: h.status },
                { kind: 'text', value: h.recommendation || h.detail || '—' },
            ])
        );
    }

    // ================== COOKIES ==================
    startSection('Cookies', 80);
    if (data.cookies.length === 0) {
        textBlock('Nenhum cookie detectado na resposta avaliada.', { color: COLORS.faint });
        doc.y += 18;
    } else {
        drawTable(
            ['Cookie', 'Proteções', 'Status'],
            [130, CONTENT_W - 224, 62],
            data.cookies.map((c) => [
                { kind: 'text', value: c.name, mono: true, color: '#1d4ed8' },
                { kind: 'text', value: c.detail || '' },
                { kind: 'badge', badge: c.status },
            ])
        );
        const recs = data.cookies.map((c) => c.recommendation).filter(Boolean);
        if (recs.length) {
            doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.mute);
            doc.text(recs.join(' · '), M, doc.y, { width: CONTENT_W });
            doc.y += 18;
        }
    }

    // ================== TLS ==================
    startSection('TLS / SSL', 150);
    const tls = data.tls;
    const tlsFields: Array<[string, string]> = [
        ['PROTOCOLO', tls.protocol || '—'],
        ['CIPHER', tls.cipher || '—'],
        ['EMISSOR', tls.issuer || '—'],
        ['VALIDA ATÉ', tls.validTo || '—'],
        ['DIAS RESTANTES', tls.daysRemaining === null ? '—' : `${tls.daysRemaining} dias`],
    ];
    const tfh = Math.max(30, tlsFields.length * 17);
    box(M, doc.y, CONTENT_W, tfh + 34);
    let tly = doc.y + 14;
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.mute);
    tlsFields.forEach(([k, v]) => {
        doc.text(k, M + 18, tly, { width: 170 });
        doc.font('Courier').fontSize(8).fillColor(COLORS.inkSoft);
        doc.text(clean(v, 200), M + 190, tly, { width: CONTENT_W - 210, ellipsis: true });
        doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.mute);
        tly += 17;
    });
    badge(M + 18, tly - 14, tls.status);
    doc.y = doc.y + tfh + 34;

    // ================== DNS ==================
    startSection('DNS & Subdomínios', 130);
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.body);
    doc.text(`Domínio pesquisado: ${data.dns.domain} · Score DNS: ${data.dns.score}/100`, M, doc.y, { width: CONTENT_W });
    doc.y += 12;

    const flags: Array<[string, boolean, BadgeStatus]> = [
        ['SPF', data.dns.hasSpf, data.dns.hasSpf ? 'ok' : 'fail'],
        ['DMARC', data.dns.hasDmarc, data.dns.hasDmarc ? 'ok' : 'fail'],
        ['DKIM', data.dns.hasDkim, data.dns.hasDkim ? 'ok' : 'alert'],
        ['MTA-STS', data.dns.hasMtaSts, data.dns.hasMtaSts ? 'ok' : 'alert'],
    ];
    const fw = (CONTENT_W - 18) / 4;
    const flagsY = doc.y;
    flags.forEach((f, i) => {
        const fx = M + i * (fw + 6);
        box(fx, flagsY, fw, 42);
        doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.mute);
        doc.text(f[0], fx + 10, flagsY + 6, { width: fw - 20 });
        badge(fx + 10, flagsY + 20, f[2]);
    });
    doc.y = flagsY + 54;

    if (data.dns.records.length > 0) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.ink);
        doc.text('REGISTROS DNS', M, doc.y);
        doc.y += 10;
        drawTable(
            ['Tipo', 'Valor'],
            [80, CONTENT_W - 80],
            data.dns.records.map((r) => [
                { kind: 'text', value: r.type, mono: true, color: '#1d4ed8' },
                { kind: 'text', value: clean(Array.isArray(r.data) ? r.data.join(', ') : r.data, 240) },
            ])
        );
    }

    if (data.dns.subdomains.length > 0) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.ink);
        doc.text('SUBDOMÍNIOS ENUMERADOS', M, doc.y);
        doc.y += 10;
        drawTable(
            ['Subdomínio', 'IP', 'Status'],
            [CONTENT_W - 90 - 62 - 6, 100, 62],
            data.dns.subdomains.map((s) => [
                { kind: 'text', value: s.subdomain, mono: true, color: COLORS.inkSoft },
                { kind: 'text', value: s.ip },
                { kind: 'badge', badge: s.alive ? 'ok' : 'alert' },
            ])
        );
    }

    const passiveSubs = data.exposure?.subdomains || [];
    if (passiveSubs.length > 0) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.ink);
        doc.text(`SUBDOMÍNIOS ATIVOS E REGISTRADOS (TRANSPARÊNCIA DE CERTIFICADOS — ${passiveSubs.length})`, M, doc.y);
        doc.y += 10;
        const subText = passiveSubs.join(', ');
        const subH = doc.heightOfString(subText, { width: CONTENT_W, lineBreak: true });
        doc.font('Courier').fontSize(7.5).fillColor(COLORS.inkSoft);
        doc.text(subText, M, doc.y, { width: CONTENT_W, lineBreak: true });
        doc.y += subH + 10;
    }

    // ================== TECNOLOGIAS ==================
    if (data.technologies.length > 0) {
        startSection('Tecnologias Identificadas', 135);
        drawTable(
            ['Tecnologia', 'Categoria', 'Confiança'],
            [CONTENT_W / 2, CONTENT_W / 2 - 70, 70],
            data.technologies.map((t) => [
                { kind: 'text', value: t.name, bold: true },
                { kind: 'text', value: t.category },
                { kind: 'text', value: `${t.confidence}%` },
            ])
        );
    }

    // ================== VULNERABILIDADES ==================
    startSection('Vulnerabilidades e Observações', 80);
    if (data.vulnerabilities.length === 0) {
        textBlock('Nenhum achado registrado pela varredura observacional.', { color: COLORS.faint });
        doc.y += 18;
    } else {
        const vulnRows: Cell[][] = data.vulnerabilities.map((v) => [
            { kind: 'text', value: v.title, color: SEVERITY_PALETTE[v.severity] || SEVERITY_PALETTE.info },
            { kind: 'chip', color: SEVERITY_PALETTE[v.severity] || SEVERITY_PALETTE.info, text: (SEVERITY_LABEL[v.severity] || 'INFO') },
        ]);
        drawTable(['Descrição', 'Severidade'], [CONTENT_W - 84, 78], vulnRows, 6);
    }

    // ================== EXPOSIÇÃO DE ARQUIVOS SENSÍVEIS ==================
    const exposed = data.exposure?.exposed_files || [];
    if (exposed.length > 0) {
        startSection('Arquivos Sensíveis e Configurações Expostas', exposed.length * 26 + 40);
        drawTable(
            ['Caminho', 'Tipo', 'Tamanho', 'Severidade'],
            [185, 170, 70, 70],
            exposed.map((f) => [
                { kind: 'text', value: f.path, mono: true, color: '#1d4ed8' },
                { kind: 'text', value: f.type },
                { kind: 'text', value: formatBytes(f.size_bytes) },
                { kind: 'chip', color: SEVERITY_PALETTE[String(f.severity).toLowerCase()] || SEVERITY_PALETTE.info, text: String(f.severity) },
            ]),
            6
        );
        if (data.exposure?.metrics?.calculated_penalty) {
            doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.fail);
            doc.text(`Penalidade aplicada ao score: −${data.exposure.metrics.calculated_penalty} pontos.`, M, doc.y, { width: CONTENT_W });
            doc.y += 16;
        }
    }

    // ================== CONFORMIDADE LGPD (Lei 13.709/2018) ==================
    const lgpdChecks = data.lgpd?.checks || [];
    const lgpdScore = typeof data.lgpd?.metrics?.compliance_score === 'number' ? data.lgpd!.metrics!.compliance_score : 0;
    const lgpdFailed = lgpdChecks.filter((c: any) => !c.passed);
    const lgpdSectionH = lgpdChecks.length * 28 + 80;
    doc.y = ensureSpace(lgpdSectionH);
    startSection('Conformidade LGPD (Lei 13.709/2018)', lgpdSectionH);
    const lgpdPct = lgpdScore;
    const pctColor = lgpdPct >= 80 ? '#16a34a' : lgpdPct >= 50 ? '#eab308' : '#B91C1C';
    doc.font('Helvetica-Bold').fontSize(28).fillColor(pctColor);
    doc.text(`${lgpdPct}%`, M, doc.y + 4, { width: 80 });
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.mute);
    doc.text('conformidade LGPD', M, doc.y + 34, { width: 80 });
    doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.faint);
    doc.text(`Checks: ${lgpdChecks.length} total | ${lgpdFailed.length} falha(s)`, M, doc.y + 48, { width: 120 });
    doc.y += 62;

    if (lgpdChecks.length === 0) {
        textBlock('Scanner LGPD não executado neste scan.', { color: COLORS.faint });
        doc.y += 10;
    } else {
        const lgpdRows: Cell[][] = lgpdChecks.map((c: any) => [
            { kind: 'chip', color: c.passed ? '#16a34a' : (c.severity === 'critical' ? '#B91C1C' : c.severity === 'high' ? '#ea580c' : c.severity === 'medium' ? '#d97706' : '#64748b'), text: c.passed ? 'PASS' : 'FAIL' },
            { kind: 'text', value: c.title, color: c.passed ? '#059669' : (c.severity === 'critical' || c.severity === 'high' ? '#dc2626' : '#475569') },
            { kind: 'text', value: c.lgpd_article || '', mono: true, color: COLORS.mute },
        ]);
        drawTable(['Status', 'Requisito LGPD', 'Artigo'], [52, CONTENT_W - 152, 96], lgpdRows, 7);
        doc.y += 8;
        if (lgpdFailed.length > 0) {
            doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.fail);
            doc.text(`${lgpdFailed.length} item(s) de não-conformidade. Ações recomendadas:`, M, doc.y, { width: CONTENT_W });
            doc.y += 12;
            lgpdFailed.slice(0, 6).forEach((c: any) => {
                const sevColor = c.severity === 'critical' ? '#B91C1C' : c.severity === 'high' ? '#ea580c' : '#d97706';
                doc.save().circle(M + 6, doc.y + 4, 3.5).fill(sevColor).restore();
                doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.body);
                doc.text(c.recommendation || c.title, M + 16, doc.y, { width: CONTENT_W - 20 });
                doc.y += 14;
            });
        }
    }

    // ================== RECOMENDAÇÕES PRIORIZADAS ==================
    const recs: Array<{ prio: string; color: string; title: string; detail: string }> = [];
    const criticalScan = data.severityCounts.critical + data.severityCounts.high;
    if (criticalScan > 0) {
        recs.push({
            prio: 'P1',
            color: COLORS.fail,
            title: 'Tratar agora as falhas de maior risco',
            detail: `${criticalScan} achado(s) de severidade crítica/alta. Priorize correção, validação por terceiros e reverificação em até 15 dias.`,
        });
    }
    const missingCsp = data.headers.some((h) => h.name.toLowerCase().includes('content-security')) && data.headers.find((h) => h.name.toLowerCase().includes('content-security'))?.status === 'fail';
    if (missingCsp) {
        recs.push({
            prio: 'P1',
            color: COLORS.fail,
            title: 'Adicione o cabeçalho Content-Security-Policy para prevenir ataques de XSS e injeção de dados',
            detail: 'Sem CSP, o risco de XSS (injeção de scripts) é elevado. Defina um CSP conservador (default-src https:) e evolua gradualmente.',
        });
    }
    if (data.headers.some((h) => h.name.toLowerCase().includes('strict-transport-security')) && data.headers.find((h) => h.name.toLowerCase().includes('strict-transport'))?.status === 'fail') {
        recs.push({
            prio: 'P1',
            color: COLORS.fail,
            title: 'Habilite o cabeçalho HSTS para forçar conexões seguras HTTPS',
            detail: 'Emita o header Strict-Transport-Security com max-age>=31536000; includeSubDomains para impedir downgrade de protocolo.',
        });
    }
    if (data.cookies.some((c) => c.status === 'fail')) {
        recs.push({
            prio: 'P1',
            color: COLORS.fail,
            title: 'Endurecer cookies sensíveis',
            detail: 'Aplique Secure, HttpOnly e SameSite=Lax/Strict em todos os cookies de sessão e autenticação.',
        });
    }
    if (data.tls.status === 'fail' || (typeof data.tls.daysRemaining === 'number' && data.tls.daysRemaining <= 30)) {
        recs.push({
            prio: 'P1',
            color: COLORS.fail,
            title: 'Corrigir transporte TLS',
            detail: data.tls.issues[0] || 'Certificado expirando ou padrões de TLS incompatíveis. Renove o certificado e desative protocolos antigos.',
        });
    }
    if (data.exposure && data.exposure.exposed_files.length > 0) {
        recs.push({
            prio: 'P1',
            color: COLORS.fail,
            title: 'Bloquear acesso aos arquivos sensíveis expostos',
            detail: `${data.exposure.exposed_files.length} arquivo(s)/configuração(ões) acessível(is) publicamente. Aplique regras de negação no servidor web, remova backups e dumps do document root e revise permissões.`,
        });
    }
    if (lgpdFailed.length > 0 && ((data.lgpd?.metrics?.critical_failures ?? 0) > 0 || (data.lgpd?.metrics?.high_failures ?? 0) > 0)) {
        recs.push({
            prio: 'P1',
            color: COLORS.fail,
            title: 'Atingir conformidade LGPD',
            detail: `${data.lgpd?.metrics?.critical_failures ?? 0} falha(s) crítica(s) e ${data.lgpd?.metrics?.high_failures ?? 0} alta(s) em requisitos da Lei 13.709/2018. Publique política de privacidade, implemente banner de consentimento e designe encarregado (DPO).`,
        });
    }
    if (!data.dns.hasDmarc) {
        recs.push({
            prio: 'P2',
            color: COLORS.alert,
            title: 'Publicar política DMARC',
            detail: 'Defina DMARC (p=quarantine/reject) alinhado ao SPF, evoluindo gradualmente para reduzir spoofing de e-mail.',
        });
    }
    if (!data.dns.hasMtaSts) {
        recs.push({
            prio: 'P2',
            color: COLORS.alert,
            title: 'Adotar MTA-STS',
            detail: 'Publique a política MTA-STS e o registro TXT _mta-sts.<domínio> para forçar TLS no envio de e-mail.',
        });
    }
    data.headers.forEach((h) => {
        if (h.status === 'fail' && !h.name.toLowerCase().includes('content-security') && !h.name.toLowerCase().includes('strict-transport')) {
            recs.push({
                prio: 'P2',
                color: COLORS.alert,
                title: `Implementar ${h.name}`,
                detail: pt(h.recommendation) || 'Cabeçalho ausente — aplique conforme a recomendação do standard.',
            });
        }
    });
    if (data.serverExposed) {
        recs.push({
            prio: 'P3',
            color: COLORS.brand,
            title: 'Ocultar versões do servidor',
            detail: 'Remova/limite o header Server (e X-Powered-By) para reduzir o reconhecimento da stack.',
        });
    }
    if (data.technologies.length > 0) {
        recs.push({
            prio: 'P3',
            color: COLORS.brand,
            title: 'Manter tecnologias atualizadas',
            detail: `${data.techCount} tecnologia(s) identificada(s). Crie processo de revisão de patches e CVE para componentes expostos.`,
        });
    }
    if (recs.length === 0) {
        recs.push({
            prio: 'P3',
            color: COLORS.ok,
            title: 'Manter monitoramento contínuo',
            detail: 'Sem riscos críticos no momento. Recomenda-se nova varredura periódica e revisão de alterações de configuração.',
        });
    }

    startSection('Recomendações Priorizadas', recs.length * 34 + 20);
    for (const r of recs) {
        doc.y = ensureSpace(34);
        chip(M, doc.y, 34, 18, r.color, r.prio);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink);
        doc.text(r.title, M + 44, doc.y + 1, { width: CONTENT_W - 52 });
        doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.body);
        doc.text(r.detail, M + 44, doc.y + 15, { width: CONTENT_W - 52, lineBreak: true, lineGap: 3 });
        const h = doc.heightOfString(r.detail, { width: CONTENT_W - 52 }) + 6;
        doc.y = doc.y + Math.max(32, 15 + h);
    }
    doc.y += 8;

    // ================== COMPLIANCE ==================
    doc.y = ensureSpace(170);
    const compY = doc.y;
    box(M, compY, CONTENT_W, 142, COLORS.fill);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink);
    doc.text('Declaração de Confidencialidade e Compliance', M + 20, compY + 14);
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.body);
    doc.text(
        'Este relatório foi gerado automaticamente pelo MCinfraTI Radar Security e destina-se exclusivamente ao uso do destinatário nomeado. As informações aqui contidas são confidenciais e sujeitas a proteção legal (Lei Geral de Proteção de Dados — LGPD). A reprodução, distribuição ou divulgação sem autorização expressa é proibida. Os resultados refletem a superfície observada na data da varredura e podem mudar a qualquer momento.',
        M + 20,
        compY + 30,
        { width: CONTENT_W - 40, lineBreak: true, lineGap: 3 }
    );
    doc.save()
        .moveTo(M + 20, compY + 104)
        .lineTo(M + 220, compY + 104)
        .lineWidth(1)
        .strokeColor(COLORS.line)
        .stroke();
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.body).text('ASSINATURA DO RESPONSÁVEL', M + 20, compY + 107);
    doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.mute);
    doc.text('MCinfraTI — Tecnologia da Informação · contato@mcinfrati.digital', W - M - 235, compY + 107, { lineBreak: false });
    doc.y = compY + 142 + 20;

    // ================== RODAPÉS (com total de páginas) ==================
    const range = doc.bufferedPageRange();
    const totalPages = range.count;
    const footer = (p: number, total: number) => {
        doc.save();
        doc.rect(0, PAGE_H - 30, W, 30).fill(COLORS.white);
        doc.moveTo(M, PAGE_H - 28).lineTo(W - M, PAGE_H - 28).lineWidth(0.6).strokeColor(COLORS.line).stroke();
        doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.faint);
        doc.text('MCinfraTI Radar Security · Relatório de Diagnóstico de Segurança · Documento Confidencial', M, PAGE_H - 20, {
            lineBreak: false,
        });
        doc.text(`Página ${p} de ${total}`, W - M, PAGE_H - 20, { lineBreak: false, align: 'right' });
        doc.restore();
    };
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        footer(i - range.start + 1, totalPages);
    }

    doc.end();
    return pdf;
}