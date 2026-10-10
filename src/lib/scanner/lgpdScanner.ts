import { request } from './passiveScanner';

/**
 * Scanner LGPD (Lei 13.709/2018) — checagens de conformidade verificáveis de forma passiva
 * a partir de respostas HTTP e cookies da home page, sem rastreamento do JS de runtime.
 *
 * Categorias verificadas:
 *  - Política de privacidade (URL acessível)
 *  - Termos de uso
 *  - Aviso de cookies / banner de consentimento (LGPD Art. 9)
 *  - Encarregado (DPO) — referência textual na home
 *  - Direitos do titular (Art. 18) — página dedicada
 *  - Cookies: flag Secure, SameSite, terceiros e rastreadores conhecidos
 *  - HTTPS obrigatório (Art. 46)
 *  - Vazamento de PII em headers (ex.: e-mail em headers de debug)
 */
export interface LgpdCheck {
    id: string;
    category: string;
    title: string;
    requirement: string;
    passed: boolean;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    evidence: string;
    recommendation: string;
    lgpd_article?: string;
}

export interface LgpdChecklist {
    domain: string;
    checks: LgpdCheck[];
    metrics: {
        total: number;
        passed: number;
        failed: number;
        critical_failures: number;
        high_failures: number;
        compliance_score: number;
    };
    duration_ms: number;
}

const PRIVACY_PATHS = [
    '/privacidade',
    '/politica-de-privacidade',
    '/politica_privacidade',
    '/privacy',
    '/privacy-policy',
    '/privacidade.html',
    '/politica-privacidade',
    '/lgpd/politica-de-privacidade',
    '/legal/privacy',
    '/politicas/privacidade',
];

const TERMS_PATHS = [
    '/termos',
    '/termos-de-uso',
    '/termos-de-servico',
    '/terms',
    '/terms-of-use',
    '/terms-of-service',
    '/termos.html',
    '/legal/terms',
    '/politicas/termos',
];

const RIGHTS_PATHS = [
    '/direitos-do-titular',
    '/direitos-titular',
    '/lgpd/direitos',
    '/titular',
    '/seus-direitos',
    '/privacy/rights',
    '/direitos',
    '/data-subject-rights',
    '/direitos-lgpd',
];

const DPO_PATHS = [
    '/encarregado',
    '/dpo',
    '/encarregado-de-dados',
    '/data-protection-officer',
    '/privacidade/encarregado',
];

const COOKIE_BANNER_KEYWORDS = [
    'aceitar cookies',
    'aceite os cookies',
    'usamos cookies',
    'utilizamos cookies',
    'este site utiliza cookies',
    'this site uses cookies',
    'cookie policy',
    'política de cookies',
    'consentimento',
    'consent',
    'lgpd',
    'lei geral de proteção',
    'gerenciar cookies',
    'configurar cookies',
    'cookie consent',
    'we use cookies',
];

const TRACKER_COOKIE_NAMES = [
    '_ga', '_gid', '_gat', // Google Analytics
    'fbp', 'fbc', // Meta Pixel
    'tt_pixel_session_id', // TikTok
    '_hjSession_', // Hotjar
    'mp_', // Mixpanel
    'amplitude_id',
    'ajs_', // Segment
    'hubspotutk', // HubSpot
    'intercom-id-', // Intercom
    'matomo_',
    'pixel_', // TikTok / Facebook pixel
];

function buildUrl(target: string, path: string): string {
    if (target.includes('://')) {
        const u = new URL(target);
        return `${u.protocol}//${u.host}${path}`;
    }
    return `https://${target}${path}`;
}

function hostnameOf(target: string): string {
    if (target.includes('://')) {
        return new URL(target).hostname.replace(/:\d+$/, '');
    }
    return target.replace(/:\d+$/, '');
}

async function checkPathExists(target: string, path: string, timeoutMs = 3500): Promise<{ statusCode: number; contentType: string; sizeBytes: number; body: string }> {
    const url = buildUrl(target, path);
    const res = await request(url, timeoutMs, 256 * 1024);
    return { statusCode: res.statusCode ?? 0, contentType: res.contentType, sizeBytes: res.sizeBytes, body: res.body };
}

function firstPartyCookie(cookieName: string): boolean {
    // Sem contexto de domínio de cookie em JS, consideramos que se o nome bate com rastreador
    // conhecido ou contém underscore inicial, possivelmente é third-party.
    if (TRACKER_COOKIE_NAMES.some((t) => cookieName === t || cookieName.startsWith(t) || cookieName.includes(t))) {
        return false;
    }
    if (cookieName.startsWith('_')) return false;
    return true;
}

function detectPiiInHeaders(headers: Record<string, string | string[] | undefined>): string[] {
    const findings: string[] = [];
    const headerValues = Object.entries(headers).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('\n');
    // E-mail simples em headers
    const emailMatches = headerValues.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
    if (emailMatches) {
        const suspicious = emailMatches.filter((e) => !['no-reply@', 'noreply@', 'postmaster@'].some((p) => e.toLowerCase().startsWith(p)));
        if (suspicious.length) findings.push(`Possível e-mail pessoal em header: ${suspicious.slice(0, 3).join(', ')}`);
    }
    return findings;
}

async function checkHomePagePrivacyBanner(target: string): Promise<{ banner: boolean; body: string }> {
    const url = buildUrl(target, '/');
    const res = await request(url, 5000, 1 * 1024 * 1024);
    if (res.statusCode !== 200) return { banner: false, body: '' };
    const body = (res.body || '').slice(0, 256 * 1024).toLowerCase();
    const banner = COOKIE_BANNER_KEYWORDS.some((kw) => body.includes(kw));
    return { banner, body: res.body };
}

function extractEmail(text: string): string | null {
    const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return m ? m[0] : null;
}

function extractDpoEvidence(text: string): boolean {
    const lower = text.toLowerCase();
    return lower.includes('encarregado') || lower.includes('dpo') || lower.includes('data protection officer');
}

export interface LgpdScanInput {
    targetUrl: string;
    cookies?: any[];
    headers?: any;
    tlsOk?: boolean;
}

export async function runLgpdScan(input: LgpdScanInput): Promise<LgpdChecklist> {
    const started = Date.now();
    const target = input.targetUrl;
    const host = hostnameOf(target);

    const checks: LgpdCheck[] = [];

    // 1) Política de privacidade
    let privacyPassed = false;
    let privacyEvidence = '';
    for (const path of PRIVACY_PATHS) {
        const r = await checkPathExists(target, path);
        if (r.statusCode === 200 && r.body && r.body.length > 100) {
            privacyPassed = true;
            privacyEvidence = `Política de privacidade encontrada em ${path} (${r.body.length} bytes).`;
            break;
        }
    }
    checks.push({
        id: 'privacy_policy',
        category: 'Transparência',
        title: 'Política de privacidade publicada',
        requirement: 'Disponibilizar política de privacidade acessível (LGPD Art. 9 e Art. 18).',
        passed: privacyPassed,
        severity: privacyPassed ? 'info' : 'high',
        evidence: privacyEvidence || 'Nenhuma página de política de privacidade encontrada em caminhos comuns (/privacidade, /privacy-policy, /lgpd/politica-de-privacidade, etc).',
        recommendation: privacyPassed
            ? 'Mantenha a política atualizada e referenciada em todos os pontos de coleta de dados.'
            : 'Publique uma política de privacidade em URL canônica (ex.: /privacidade) com seções de dados coletados, finalidades, bases legais, retenção e contato do encarregado.',
        lgpd_article: 'Art. 9º e Art. 18',
    });

    // 2) Termos de uso
    let termsPassed = false;
    let termsEvidence = '';
    for (const path of TERMS_PATHS) {
        const r = await checkPathExists(target, path);
        if (r.statusCode === 200 && r.body && r.body.length > 100) {
            termsPassed = true;
            termsEvidence = `Termos de uso encontrados em ${path}.`;
            break;
        }
    }
    checks.push({
        id: 'terms_of_use',
        category: 'Transparência',
        title: 'Termos de uso publicados',
        requirement: 'Disponibilizar termos de uso do serviço.',
        passed: termsPassed,
        severity: termsPassed ? 'info' : 'low',
        evidence: termsEvidence || 'Nenhuma página de termos de uso encontrada.',
        recommendation: termsPassed ? 'Mantenha os termos atualizados.' : 'Publique termos de uso em URL acessível (ex.: /termos).',
        lgpd_article: 'Art. 7º, V',
    });

    // 3) Banner de cookies (LGPD Art. 9: consentimento)
    const bannerCheck = await checkHomePagePrivacyBanner(target);
    checks.push({
        id: 'cookie_banner',
        category: 'Consentimento',
        title: 'Aviso/banner de cookies presente',
        requirement: 'Informar o titular e coletar consentimento para cookies não essenciais (LGPD Art. 8º e Art. 9º).',
        passed: bannerCheck.banner,
        severity: bannerCheck.banner ? 'info' : 'high',
        evidence: bannerCheck.banner
            ? 'Texto de aviso/consentimento de cookies detectado na home page.'
            : 'Não foram encontrados indicadores de banner de cookies na home page (palavras-chave esperadas: "aceitar cookies", "lgpd", "consentimento", etc).',
        recommendation: bannerCheck.banner
            ? 'Confirme que o banner bloqueia cookies não essenciais antes do consentimento explícito.'
            : 'Implemente um banner de consentimento com opção de aceitar/recusar, e bloqueie cookies não essenciais até o consentimento.',
        lgpd_article: 'Art. 8º e Art. 9º',
    });

    // 4) Encarregado (DPO) — Art. 41
    let dpoPassed = false;
    let dpoEvidence = '';
    // Tenta página dedicada primeiro
    for (const path of DPO_PATHS) {
        const r = await checkPathExists(target, path);
        if (r.statusCode === 200 && r.body) {
            const email = extractEmail(r.body);
            const textHasDpo = extractDpoEvidence(r.body);
            if (email || textHasDpo) {
                dpoPassed = true;
                dpoEvidence = `Página de encarregado encontrada em ${path}${email ? ` (contato: ${email})` : ''}.`;
                break;
            }
        }
    }
    // Fallback: menção na home
    if (!dpoPassed && bannerCheck.body) {
        const email = extractEmail(bannerCheck.body);
        const textHasDpo = extractDpoEvidence(bannerCheck.body);
        if (email || textHasDpo) {
            dpoPassed = true;
            dpoEvidence = `Indícios de encarregado na home (e-mail: ${email || '—'}, texto: ${textHasDpo ? 'sim' : 'não'}).`;
        }
    }
    checks.push({
        id: 'dpo_appointed',
        category: 'Governança',
        title: 'Encarregado (DPO) identificado e publicizado',
        requirement: 'Indicar encarregado pelo tratamento de dados (LGPD Art. 41).',
        passed: dpoPassed,
        severity: dpoPassed ? 'info' : 'medium',
        evidence: dpoEvidence || 'Nenhuma referência a encarregado/DPO ou e-mail de contato encontrada em páginas comuns.',
        recommendation: dpoPassed
            ? 'Mantenha o contato do encarregado visível e atualizado.'
            : 'Indique publicamente o encarregado (DPO) com nome e canal de contato, conforme Art. 41 da LGPD.',
        lgpd_article: 'Art. 41',
    });

    // 5) Direitos do titular (Art. 18)
    let rightsPassed = false;
    let rightsEvidence = '';
    for (const path of RIGHTS_PATHS) {
        const r = await checkPathExists(target, path);
        if (r.statusCode === 200 && r.body) {
            const lower = r.body.toLowerCase();
            const hasArt18 = ['acesso', 'correção', 'exclusão', 'portabilidade', 'oposição', 'acesso aos dados'].some((t) => lower.includes(t));
            if (r.body.length > 200 && hasArt18) {
                rightsPassed = true;
                rightsEvidence = `Página de direitos do titular encontrada em ${path}.`;
                break;
            }
        }
    }
    checks.push({
        id: 'data_subject_rights',
        category: 'Direitos do Titular',
        title: 'Canal para exercício dos direitos do titular',
        requirement: 'Disponibilizar canal para que o titular exerça os direitos do Art. 18 (acesso, correção, exclusão, portabilidade, etc).',
        passed: rightsPassed,
        severity: rightsPassed ? 'info' : 'medium',
        evidence: rightsEvidence || 'Nenhuma página com termos típicos dos direitos do titular (acesso, correção, exclusão, portabilidade) foi localizada.',
        recommendation: rightsPassed
            ? 'Documente prazos e procedimentos para atendimento aos direitos do titular.'
            : 'Publique página explicando como o titular pode exercer seus direitos (acesso, correção, anonimização, portabilidade, eliminação, informação sobre entidades).',
        lgpd_article: 'Art. 18',
    });

    // 6) Cookies Secure/HttpOnly/SameSite
    const cookies = input.cookies || [];
    const secureFailures = cookies.filter((c) => c.secure === false).length;
    const httpOnlyFailures = cookies.filter((c) => c.httpOnly === false && !TRACKER_COOKIE_NAMES.some((t) => c.name === t || c.name.startsWith(t))).length;
    const sameSiteFailures = cookies.filter((c) => !c.sameSite || !['lax', 'strict'].includes(String(c.sameSite).toLowerCase())).length;
    const cookiesPassed = cookies.length === 0 || (secureFailures === 0 && sameSiteFailures === 0);
    checks.push({
        id: 'cookies_secure',
        category: 'Segurança de Cookies',
        title: 'Cookies com flags Secure e SameSite',
        requirement: 'Cookies devem usar Secure (LGPD Art. 46 + boas práticas) e SameSite para evitar exposição em requisições cross-site.',
        passed: cookiesPassed,
        severity: cookiesPassed ? 'info' : (secureFailures > 0 ? 'high' : 'medium'),
        evidence: cookies.length === 0
            ? 'Nenhum cookie foi observado na resposta.'
            : `${cookies.length} cookie(s); ${secureFailures} sem Secure, ${httpOnlyFailures} sem HttpOnly, ${sameSiteFailures} sem SameSite adequado.`,
        recommendation: cookiesPassed
            ? 'Mantenha as flags de segurança configuradas.'
            : 'Adicione flag Secure a todos os cookies, SameSite=Lax/Strict, e HttpOnly nos cookies que não precisam de acesso via JavaScript.',
        lgpd_article: 'Art. 46',
    });

    // 7) Cookies de rastreamento / transferência internacional
    const trackers = cookies.filter((c) => !firstPartyCookie(c.name));
    checks.push({
        id: 'tracker_cookies',
        category: 'Consentimento',
        title: 'Cookies de rastreamento (terceiros) identificados',
        requirement: 'Cookies de rastreamento transferem dados a terceiros; exigem consentimento específico (LGPD Art. 33, transferência internacional).',
        passed: trackers.length === 0,
        severity: trackers.length === 0 ? 'info' : (trackers.length > 3 ? 'high' : 'medium'),
        evidence: trackers.length === 0
            ? 'Nenhum cookie de rastreador conhecido identificado.'
            : `${trackers.length} cookie(s) de terceiros detectados: ${trackers.slice(0, 5).map((t) => t.name).join(', ')}.`,
        recommendation: trackers.length === 0
            ? 'Mantenha o uso de cookies restrito a finalidades essenciais.'
            : 'Garanta consentimento granular antes de carregar cookies de terceiros (Google Analytics, Meta Pixel, etc.) e documente a base legal/transferência internacional.',
        lgpd_article: 'Art. 33 e Art. 9º',
    });

    // 8) HTTPS obrigatório
    checks.push({
        id: 'https_only',
        category: 'Segurança',
        title: 'Site servido exclusivamente via HTTPS',
        requirement: 'Adotar medidas técnicas adequadas para proteger os dados pessoais (LGPD Art. 46).',
        passed: input.tlsOk !== false,
        severity: input.tlsOk !== false ? 'info' : 'critical',
        evidence: input.tlsOk !== false
            ? 'Conexão HTTPS observada na varredura.'
            : 'Não foi possível validar a conexão HTTPS / TLS.',
        recommendation: 'Force HTTPS, HSTS e redirecione todas as requisições HTTP para HTTPS.',
        lgpd_article: 'Art. 46',
    });

    // 9) PII em headers
    const piiFindings = detectPiiInHeaders(input.headers || {});
    checks.push({
        id: 'pii_in_headers',
        category: 'Segurança',
        title: 'Vazamento de PII em headers HTTP',
        requirement: 'Não expor dados pessoais em cabeçalhos de resposta (LGPD Art. 46, princípio da necessidade).',
        passed: piiFindings.length === 0,
        severity: piiFindings.length === 0 ? 'info' : 'medium',
        evidence: piiFindings.length === 0
            ? 'Nenhum indicador de PII em cabeçalhos HTTP.'
            : piiFindings.join('; '),
        recommendation: piiFindings.length === 0
            ? 'Mantenha headers limpos.'
            : 'Remova cabeçalhos que exponham dados pessoais (e-mails em cabeçalho, debug headers, etc).',
        lgpd_article: 'Art. 46',
    });

    const total = checks.length;
    const passed = checks.filter((c) => c.passed).length;
    const failed = total - passed;
    const critical_failures = checks.filter((c) => !c.passed && c.severity === 'critical').length;
    const high_failures = checks.filter((c) => !c.passed && c.severity === 'high').length;
    const compliance_score = Math.round((passed / Math.max(1, total)) * 100);

    return {
        domain: host,
        checks,
        metrics: { total, passed, failed, critical_failures, high_failures, compliance_score },
        duration_ms: Date.now() - started,
    };
}

export function emptyLgpdChecklist(targetUrl: string): LgpdChecklist {
    return {
        domain: hostnameOf(targetUrl),
        checks: [],
        metrics: { total: 0, passed: 0, failed: 0, critical_failures: 0, high_failures: 0, compliance_score: 0 },
        duration_ms: 0,
    };
}