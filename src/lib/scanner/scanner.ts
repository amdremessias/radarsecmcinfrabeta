import * as tls from 'node:tls';
import * as https from 'node:https';
import * as http from 'node:http';
import type { TLSSocket } from 'node:tls';

export interface HeaderCheck {
    header: string;
    present: boolean;
    value: string | null;
    score: number;
    recommendation: string | null;
}

export interface CookieCheck {
    name: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string | null;
    score: number;
    recommendation: string | null;
}

export interface TLSCheck {
    protocol: string | null;
    cipher: string | null;
    issuer: string | null;
    validFrom: string | null;
    validTo: string | null;
    daysRemaining: number | null;
    issues: string[];
    score: number;
}

export interface ScanResult {
    targetUrl: string;
    headers: HeaderCheck[];
    cookies: CookieCheck[];
    tls: TLSCheck;
    vulnerabilities: string[];
    infoDisclosure: Record<string, boolean | string>;
    score: number;
}

const RECOMMENDED_HEADERS: Record<string, string> = {
    'strict-transport-security':
        'Habilite o cabeçalho HSTS para forçar conexões seguras HTTPS (ex: max-age=31536000; includeSubDomains)',
    'content-security-policy':
        'Adicione o cabeçalho Content-Security-Policy para prevenir ataques de XSS e injeção de dados',
    'x-frame-options': 'Defina X-Frame-Options como DENY ou SAMEORIGIN para prevenir clickjacking',
    'x-content-type-options': 'Defina X-Content-Type-Options como nosniff para prevenir MIME sniffing',
    'permissions-policy':
        'Adicione cabeçalho Permissions-Policy para restringir recursos do navegador (câmera, microfone, etc.)',
    'referrer-policy':
        'Defina Referrer-Policy como strict-origin-when-cross-origin ou no-referrer',
};

export async function scanHeaders(targetUrl: string): Promise<HeaderCheck[]> {
    const parsed = new URL(targetUrl);
    const protocol = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const req = protocol.get(targetUrl, { timeout: 10000 }, (res: any) => {
            const results: HeaderCheck[] = Object.keys(RECOMMENDED_HEADERS).map((header) => {
                const value = res.headers[header] || res.headers[header.toLowerCase()] || null;
                const present = !!value;
                const score = present ? 10 : 0;
                return {
                    header,
                    present,
                    value: Array.isArray(value) ? value[0] : value,
                    score,
                    recommendation: present ? null : RECOMMENDED_HEADERS[header],
                };
            });

            resolve(results);
            res.destroy();
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout checking headers'));
        });
    });
}

export async function scanCookies(targetUrl: string): Promise<CookieCheck[]> {
    const parsed = new URL(targetUrl);
    const protocol = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const req = protocol.get(targetUrl, { timeout: 10000 }, (res: any) => {
            const setCookies = res.headers['set-cookie'] || [];
            const cookies: CookieCheck[] = [];

            for (const raw of setCookies) {
                const parts = raw.split(';').map((s: string) => s.trim());
                const name = parts[0]?.split('=')[0] || 'unknown';
                const httpOnly = parts.some((p: string) => p.toLowerCase() === 'httponly');
                const secure = parts.some((p: string) => p.toLowerCase() === 'secure');
                const sameSiteMatch = raw.match(/samesite=([^;]+)/i);
                const sameSite = sameSiteMatch ? sameSiteMatch[1] : null;

                let score = 0;
                if (httpOnly) score += 5;
                if (secure) score += 5;
                if (sameSite && ['strict', 'lax'].includes(sameSite.toLowerCase())) score += 5;

                let recommendation: string | null = null;
                if (!httpOnly) recommendation = 'Adicione flag HttpOnly para prevenir acesso via XSS';
                if (!secure) recommendation = (recommendation || '') + ' Adicione flag Secure para prevenir transmissão via HTTP';
                if (!sameSite) recommendation = (recommendation || '') + ' Adicione SameSite=Strict ou SameSite=Lax';

                cookies.push({
                    name,
                    httpOnly,
                    secure,
                    sameSite,
                    score,
                    recommendation: recommendation || null,
                });
            }

            resolve(cookies);
            res.destroy();
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout checking cookies'));
        });
    });
}

export async function scanTLS(targetUrl: string): Promise<TLSCheck> {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname;
    const port = parseInt(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));

    return new Promise((resolve, reject) => {
        const options: tls.ConnectionOptions = {
            host: hostname,
            port,
            rejectUnauthorized: false,
            timeout: 10000,
        };

        const socket: TLSSocket = tls.connect(options, () => {
            const cert = socket.getPeerCertificate();
            const protocol = socket.getProtocol();
            const cipher = socket.getCipher();

            const validTo = new Date(cert.valid_to);
            const now = new Date();
            const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            const issues: string[] = [];
            let score = 100;

            if (protocol && !protocol.includes('TLSv1.2') && !protocol.includes('TLSv1.3')) {
                issues.push(`Using deprecated protocol: ${protocol}. Upgrade to TLS 1.2 or 1.3.`);
                score -= 30;
            }

            if (daysRemaining !== null) {
                if (daysRemaining < 0) {
                    issues.push('Certificate has expired!');
                    score -= 50;
                } else if (daysRemaining < 14) {
                    issues.push(`Certificate expires in ${daysRemaining} days. Renew soon.`);
                    score -= 20;
                } else if (daysRemaining < 30) {
                    issues.push(`Certificate expires in ${daysRemaining} days.`);
                    score -= 10;
                }
            }

            if (cert.issuer) {
                const issuerStr = Object.values(cert.issuer).join(' ');
                if (issuerStr.includes('Let\'s Encrypt')) {
                    score -= 0;
                }
            }

            const result: TLSCheck = {
                protocol,
                cipher: cipher?.name || null,
                issuer: (cert.issuer?.commonName || cert.issuer?.O || null) as string | null,
                validFrom: cert.valid_from || null,
                validTo: cert.valid_to || null,
                daysRemaining,
                issues,
                score: Math.max(0, score),
            };

            socket.destroy();
            resolve(result);
        });

        socket.on('error', (err) => {
            reject(err);
        });

        socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('TLS handshake timeout'));
        });
    });
}

export async function scanInfoDisclosure(targetUrl: string): Promise<Record<string, boolean | string>> {
    const parsed = new URL(targetUrl);
    const protocol = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const req = protocol.get(targetUrl, { timeout: 10000 }, (res: any) => {
            const info: Record<string, boolean | string> = {};

            const serverHeader = res.headers['server'];
            info['server_header'] = serverHeader || 'not present';
            if (serverHeader) {
                info['server_exposed'] = true;
                info['server_value'] = serverHeader;
            }

            info['poweredBy_exposed'] = !!res.headers['x-powered-by'];
            info['x_powered_by'] = res.headers['x-powered-by'] || null;

            const contentType = res.headers['content-type'];
            info['content_type'] = contentType || null;

            info['missing_hsts'] = !res.headers['strict-transport-security'];
            info['missing_csp'] = !res.headers['content-security-policy'];
            info['missing_x_frame'] = !res.headers['x-frame-options'];

            resolve(info);
            res.destroy();
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout checking info disclosure'));
        });
    });
}

export async function scanVulnerabilities(targetUrl: string): Promise<string[]> {
    const vulnerabilities: string[] = [];
    const parsed = new URL(targetUrl);
    const protocol = parsed.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const req = protocol.get(targetUrl, { timeout: 10000 }, (res: any) => {
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(res.headers)) {
                headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
            }

if (!headers['x-frame-options']) {
                 vulnerabilities.push('Cabeçalho X-Frame-Options ausente - vulnerável a ataques de clickjacking');
             }
 
             if (!headers['strict-transport-security']) {
                 vulnerabilities.push('Cabeçalho HSTS ausente - vulnerável a ataques de downgrade de protocolo');
             }
 
             if (!headers['content-security-policy']) {
                 vulnerabilities.push('Cabeçalho Content-Security-Policy ausente - vulnerável a ataques XSS');
             }
 
             if (!headers['x-content-type-options']) {
                 vulnerabilities.push('Cabeçalho X-Content-Type-Options ausente - vulnerável a ataques de MIME sniffing');
             }
 
             if (headers['server']) {
                 vulnerabilities.push(`Cabeçalho Server exposto: ${headers['server']} - revela tecnologia do servidor`);
             }
 
             if (headers['x-powered-by']) {
                 vulnerabilities.push(`Cabeçalho X-Powered-By exposto: ${headers['x-powered-by']} - revela stack de tecnologia`);
             }

            resolve(vulnerabilities);
            res.destroy();
        });

        req.on('error', (err: any) => {
            if (err.code === 'CERT_HAS_EXCEEDED_REJECTION') {
                resolve(['Certificate verification failed - potential MITM risk']);
            } else {
                reject(err);
            }
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout scanning vulnerabilities'));
        });
    });
}

export async function fullScan(targetUrl: string): Promise<ScanResult> {
    const [headers, cookies, tlsResult, vulnerabilities, infoDisclosure] = await Promise.all([
        scanHeaders(targetUrl).catch(() => []),
        scanCookies(targetUrl).catch(() => []),
        scanTLS(targetUrl).catch(() => ({
            protocol: null,
            cipher: null,
            issuer: null,
            validFrom: null,
            validTo: null,
            daysRemaining: null,
            issues: ['Falha na varredura da cifra/certificado TLS'],
            score: 0,
        } as TLSCheck)),
        scanVulnerabilities(targetUrl).catch(() => []),
        scanInfoDisclosure(targetUrl).catch(() => ({})),
    ]);

    const headerScore = headers.reduce((sum, h) => sum + h.score, 0);
    const cookieScore = cookies.reduce((sum, c) => sum + c.score, 0);
    const tlsScore = tlsResult.score;

    const totalScore = Math.round(
        (headerScore + cookieScore + tlsScore) /
            (headers.length * 10 + (cookies.length || 1) * 15 + 100) *
            100
    );

    const finalScore = Math.max(0, Math.min(100, totalScore));

    return {
        targetUrl,
        headers,
        cookies,
        tls: tlsResult,
        vulnerabilities,
        infoDisclosure,
        score: finalScore,
    };
}

export function getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    if (score >= 40) return 'E';
    return 'F';
}

export function gradeColor(grade: string): string {
    switch (grade) {
        case 'A': return 'text-green-500';
        case 'B': return 'text-emerald-400';
        case 'C': return 'text-yellow-400';
        case 'D': return 'text-orange-400';
        case 'E': return 'text-red-400';
        case 'F': return 'text-red-600';
        default: return 'text-gray-400';
    }
}
