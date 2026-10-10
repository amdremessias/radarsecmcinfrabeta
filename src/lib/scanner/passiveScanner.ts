import * as https from 'node:https';
import * as http from 'node:http';

export type ExposureSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface SensitivePathItem {
    path: string;
    type: string;
    severity: ExposureSeverity;
}

export interface ExposedFile {
    path: string;
    url: string;
    status: 'EXPOSED';
    type: string;
    severity: ExposureSeverity;
    size_bytes: number;
}

export interface PassiveMetrics {
    subdomains_found_count: number;
    exposed_files_count: number;
    calculated_penalty: number;
}

export interface PassiveScanResult {
    domain: string;
    metrics: PassiveMetrics;
    subdomains: string[];
    subdomains_source: 'crt.sh' | 'certspotter' | 'crt.sh+certspotter' | 'none';
    exposed_files: ExposedFile[];
    duration_ms: number;
}

// Bateria de arquivos/rotas de alto risco (spec RadarSec_Automacao_Scanner).
export const SENSITIVE_PATHS: SensitivePathItem[] = [
    { path: '/.env', type: 'Credenciais / Configuração', severity: 'CRITICAL' },
    { path: '/.git/HEAD', type: 'Repositório Git Exposto', severity: 'HIGH' },
    { path: '/wp-config.php.bak', type: 'Backup do WordPress', severity: 'HIGH' },
    { path: '/config.json', type: 'Arquivo de Configuração', severity: 'MEDIUM' },
    { path: '/.vscode/settings.json', type: 'Configuração da IDE', severity: 'LOW' },
    { path: '/docker-compose.yml', type: 'Infraestrutura como Código', severity: 'HIGH' },
    { path: '/backup.sql', type: 'Dump de Banco de Dados', severity: 'CRITICAL' },
    { path: '/phpinfo.php', type: 'Informações do Servidor', severity: 'MEDIUM' },
    { path: '/robots.txt', type: 'Mapeamento de Rotas', severity: 'INFO' },
    { path: '/sitemap.xml', type: 'Estrutura do Site', severity: 'INFO' },
];

// Penalidade sobre o score 0-100 conforme especificação.
const PENALTY_BY_SEVERITY: Record<ExposureSeverity, number> = {
    CRITICAL: 25,
    HIGH: 15,
    MEDIUM: 5,
    LOW: 0,
    INFO: 0,
};

export function penaltyForSeverity(severity: ExposureSeverity): number {
    return PENALTY_BY_SEVERITY[severity] ?? 0;
}

interface RawResponse {
    statusCode: number | null;
    contentType: string;
    sizeBytes: number;
    body: string;
}

export function request(target: string, timeoutMs: number, maxBytes = 1024 * 1024): Promise<RawResponse> {
    return new Promise((resolve) => {
        let parsed: URL;
        try {
            parsed = new URL(target);
        } catch {
            resolve({ statusCode: null, contentType: '', sizeBytes: 0, body: '' });
            return;
        }

        const mod = parsed.protocol === 'https:' ? https : http;
        const options: https.RequestOptions = {
            method: 'GET',
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: `${parsed.pathname}${parsed.search}`,
            headers: {
                'User-Agent': 'RadarSecurityBot/1.0 (+https://radarsec.duckdns.org)',
                Accept: '*/*',
            },
            rejectUnauthorized: false,
            timeout: timeoutMs,
        };

        const done = (res: RawResponse) => {
            resolve(res);
        };

        const req = (mod as typeof https).request(options, (res) => {
            let size = 0;
            const chunks: Buffer[] = [];
            let aborted = false;
            res.on('data', (c: Buffer) => {
                size += c.length;
                chunks.push(c);
                if (size > maxBytes) {
                    aborted = true;
                    req.destroy();
                }
            });
            res.on('end', () => {
                if (aborted) return;
                const ct = String(res.headers['content-type'] || '').toLowerCase();
                done({
                    statusCode: res.statusCode ?? null,
                    contentType: ct,
                    sizeBytes: size,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
            res.on('error', () => {
                done({ statusCode: null, contentType: '', sizeBytes: size, body: '' });
            });
        });

        req.on('error', () => {
            done({ statusCode: null, contentType: '', sizeBytes: 0, body: '' });
        });
        req.on('timeout', () => {
            req.destroy();
            done({ statusCode: null, contentType: '', sizeBytes: 0, body: '' });
        });
        req.end();
    });
}

export async function scanSensitiveFiles(targetUrl: string): Promise<ExposedFile[]> {
    const parsed = new URL(targetUrl);
    const baseUrl = `${parsed.protocol}//${parsed.host}`;
    const checks = SENSITIVE_PATHS.map(async (item) => {
        const url = `${baseUrl}${item.path}`;
        // allow_redirects=False (spec): node http/https não segue redirects.
        const res = await request(url, 3000);

        if (res.statusCode !== 200) return null;

        // Descarte de páginas 200 HTML falsas (custom 404).
        const htmlLike = res.contentType.includes('text/html') || res.sizeBytes <= 10;
        if (!htmlLike) {
            return {
                path: item.path,
                url,
                status: 'EXPOSED',
                type: item.type,
                severity: item.severity,
                size_bytes: res.sizeBytes,
            } as ExposedFile;
        }

        // Allowlist (spec): checados mesmo se responderem 200 HTML — mas validando
        // assinatura do conteúdo para evitar falsos positivos de páginas 200 genéricas.
        const body = res.body.slice(0, 4096);
        if (item.path === '/.git/HEAD' && !/^ref:\s*refs\//i.test(body.trim())) return null;
        if (item.path === '/robots.txt' && !/\buser-agent\b|\bdisallow\b/i.test(body)) return null;
        if (item.path === '/sitemap.xml' && !/<urlset|<sitemapindex|<\?xml/i.test(body)) return null;

        if (item.path === '/.git/HEAD' || item.path === '/robots.txt' || item.path === '/sitemap.xml') {
            return {
                path: item.path,
                url,
                status: 'EXPOSED',
                type: item.type,
                severity: item.severity,
                size_bytes: res.sizeBytes,
            } as ExposedFile;
        }
        return null;
    });

    const results = await Promise.all(checks);
    return results.filter((r): r is ExposedFile => r !== null);
}

export async function fetchSubdomainsFromCrtSh(domain: string): Promise<string[]> {
    const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;
    const res = await request(url, 6000, 8 * 1024 * 1024);
    if (res.statusCode !== 200) return [];

    let data: any;
    try {
        data = JSON.parse(res.body);
    } catch {
        return [];
    }
    if (!Array.isArray(data)) return [];

    const subdomains = new Set<string>();
    for (const entry of data) {
        const nameValue: unknown = entry?.name_value;
        if (typeof nameValue !== 'string') continue;
        for (let sub of nameValue.split('\n')) {
            sub = sub.trim().toLowerCase();
            if (sub.startsWith('*.')) sub = sub.slice(2);
            if (sub.endsWith(domain) && sub !== domain) subdomains.add(sub);
        }
    }
    return Array.from(subdomains);
}

export async function fetchSubdomainsFromCertspotter(domain: string): Promise<string[]> {
    const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`;
    const res = await request(url, 6000, 4 * 1024 * 1024);
    if (res.statusCode !== 200) return [];

    let data: any;
    try {
        data = JSON.parse(res.body);
    } catch {
        return [];
    }
    if (!Array.isArray(data)) return [];

    const subdomains = new Set<string>();
    for (const entry of data) {
        const dnsNames: unknown = entry?.dns_names;
        if (!Array.isArray(dnsNames)) continue;
        for (let sub of dnsNames) {
            sub = String(sub).trim().toLowerCase();
            if (sub.startsWith('*.')) sub = sub.slice(2);
            if (sub.endsWith(domain) && sub !== domain) subdomains.add(sub);
        }
    }
    return Array.from(subdomains);
}

async function fetchSubdomainsWithSource(domain: string): Promise<{ subdomains: string[]; source: PassiveScanResult['subdomains_source'] }> {
    // Consulta as duas fontes de transparência de certificados em paralelo e faz a união:
    // menor latência (não fica preso em uma fonte lenta) e melhor cobertura.
    const [crt, cert] = await Promise.all([
        fetchSubdomainsFromCrtSh(domain).catch(() => []),
        fetchSubdomainsFromCertspotter(domain).catch(() => []),
    ]);
    const merged = Array.from(new Set([...crt, ...cert])).sort();
    const source: PassiveScanResult['subdomains_source'] =
        merged.length === 0 ? 'none'
            : crt.length > 0 && cert.length > 0 ? 'crt.sh+certspotter'
            : cert.length > 0 ? 'certspotter'
            : 'crt.sh';
    return { subdomains: merged, source };
}

export function emptyExposureResult(targetUrl: string): PassiveScanResult {
    const domain = new URL(targetUrl).hostname.replace(/:\d+$/, '');
    return {
        domain,
        metrics: { subdomains_found_count: 0, exposed_files_count: 0, calculated_penalty: 0 },
        subdomains: [],
        subdomains_source: 'none',
        exposed_files: [],
        duration_ms: 0,
    };
}

/**
 * Executa as duas baterias passivas da automação:
 *  - Descoberta de subdomínios via log de transparência de certificados (crt.sh)
 *  - Varredura de arquivos/Config settings sensíveis expostos
 */
export async function runExposureScan(targetUrl: string): Promise<PassiveScanResult> {
    const started = Date.now();
    const domain = new URL(targetUrl).hostname.replace(/:\d+$/, '');
    const [{ subdomains, source }, exposed_files] = await Promise.all([
        fetchSubdomainsWithSource(domain),
        scanSensitiveFiles(targetUrl).catch(() => []),
    ]);
    const calculated_penalty = exposed_files.reduce((sum, f) => sum + penaltyForSeverity(f.severity), 0);
    return {
        domain,
        metrics: {
            subdomains_found_count: subdomains.length,
            exposed_files_count: exposed_files.length,
            calculated_penalty,
        },
        subdomains,
        subdomains_source: source,
        exposed_files,
        duration_ms: Date.now() - started,
    };
}