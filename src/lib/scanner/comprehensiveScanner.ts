import * as dns from 'node:dns/promises';
import * as crypto from 'node:crypto';

export interface DNSRecord {
    type: string;
    data: string | string[];
}

export interface SubdomainInfo {
    subdomain: string;
    ip: string;
    alive: boolean;
    ssl: boolean;
}

export interface DNSAnalysis {
    domain: string;
    records: DNSRecord[];
    subdomains: SubdomainInfo[];
    mta_sts_policy: boolean;
    cname: string | null;
    mx: string[];
    txt: string[];
    score: number;
}

export interface TechnologyDetection {
    name: string;
    confidence: number;
    category: 'server' | 'cdn' | 'analytics' | 'marketing' | 'social' | 'infrastructure' | 'cms';
}

export interface CVEInfo {
    cve_id: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    cvss_score: number;
    affected_component: string;
}

export interface ComprehensiveScanResult {
    targetUrl: string;
    domain: string;
    headers: any[];
    cookies: any[];
    tls: any;
    dns: DNSAnalysis;
    technology: TechnologyDetection[];
    subdomains: SubdomainInfo[];
    vulnerabilities: string[];
    infoDisclosure: Record<string, any>;
    cve_matches: CVEInfo[];
    ports_open: number[];
    score: number;
    grade: string;
    duration_ms: number;
    started_at: string;
    completed_at: string;
}

const TECH_DETECTION_SIGNATURES: Record<string, TechnologyDetection> = {
    'cloudflare': { name: 'Cloudflare', confidence: 90, category: 'cdn' },
    'cloudfront': { name: 'Amazon CloudFront', confidence: 95, category: 'cdn' },
    'akamai': { name: 'Akamai', confidence: 85, category: 'cdn' },
    'nginx': { name: 'Nginx', confidence: 80, category: 'server' },
    'apache': { name: 'Apache', confidence: 75, category: 'server' },
    'iis': { name: 'Microsoft IIS', confidence: 70, category: 'server' },
    'wp-admin': { name: 'WordPress', confidence: 95, category: 'cms' },
    'gsc': { name: 'Google Search Console', confidence: 80, category: 'analytics' },
    'gtm': { name: 'Google Tag Manager', confidence: 85, category: 'analytics' },
    'ga': { name: 'Google Analytics', confidence: 80, category: 'analytics' },
    'hotjar': { name: 'Hotjar', confidence: 85, category: 'analytics' },
    'facebook': { name: 'Facebook Pixel', confidence: 80, category: 'marketing' },
    'google_ads': { name: 'Google Ads', confidence: 85, category: 'marketing' },
};

const COMMON_PORTS = [80, 443, 21, 22, 23, 25, 53, 8080, 8443, 9000, 9090, 3000, 5000];

export async function scanDNS(domain: string): Promise<DNSAnalysis> {
    let score = 100;
    const records: DNSRecord[] = [];
    const subdomains: SubdomainInfo[] = [];
    let mta_sts_policy = false;
    let cname: string | null = null;
    let mx: string[] = [];
    let txt: string[] = [];

    try {
        const addresses = await dns.resolve4(domain).catch(() => []);
        records.push({ type: 'A', data: addresses });

        const aaa = await dns.resolve6(domain).catch(() => []);
        records.push({ type: 'AAAA', data: aaa });

        const mx_records = await dns.resolveMx(domain).catch(() => []);
        mx = mx_records.map((r: any) => `${r.exchange || '?'} (${r.priority})`);
        records.push({ type: 'MX', data: mx });

        const txt_records = await dns.resolveTxt(domain).catch(() => []);
        txt = txt_records.flat();
        records.push({ type: 'TXT', data: txt });

        const cname_records = await dns.resolveCname(domain).catch(() => []);
        if (cname_records.length > 0) {
            cname = cname_records.join(', ');
            records.push({ type: 'CNAME', data: cname });
        }

        const spf_idx = txt.findIndex((t) => t.toLowerCase().includes('v=spf1'));
        if (spf_idx === -1) {
            score -= 5;
        }

        const dmarc_idx = txt.findIndex((t) => t.toLowerCase().includes('dmarc'));
        if (dmarc_idx === -1) {
            score -= 3;
        }

        const dkim_idx = txt.findIndex((t) => t.toLowerCase().includes('dkim'));
        if (dkim_idx === -1) {
            score -= 3;
        }

        try {
            const mta_sts = await dns.resolveTxt('_mta-sts.' + domain).catch(() => []);
            if (mta_sts.length > 0) mta_sts_policy = true;
        } catch {}

    } catch {
        score -= 20;
    }

    try {
        const commonPrefixes = ['www', 'api', 'cdn', 'mail', 'ftp', 'admin', 'dev', 'staging', 'test', 'beta'];
        for (const prefix of commonPrefixes) {
            const subdomain = `${prefix}.${domain}`;
            try {
                const addr = await dns.resolve4(subdomain).catch(() => []);
                if (addr.length > 0) {
                    subdomains.push({
                        subdomain,
                        ip: addr[0] as string,
                        alive: true,
                        ssl: false
                    });
                }
            } catch {}
        }
    } catch {}

    return {
        domain,
        records,
        subdomains,
        mta_sts_policy,
        cname,
        mx,
        txt,
        score: Math.max(0, score)
    };
}

export async function detectTechnology(url: string): Promise<TechnologyDetection[]> {
    const detected: TechnologyDetection[] = [];
    try {
        const res = await fetch(url, { redirect: 'follow' });
        const server = res.headers.get('server') || '';
        const poweredBy = res.headers.get('x-powered-by') || '';
        const body = await res.text();

        for (const [key, tech] of Object.entries(TECH_DETECTION_SIGNATURES)) {
            const inServer = server.toLowerCase().includes(key);
            const inBody = body.toLowerCase().includes(key);
            const confidence = Math.max(
                inServer ? tech.confidence : 0,
                inBody ? tech.confidence - 10 : 0
            );
            if (confidence > 50) {
                detected.push({ ...tech, confidence });
            }
        }

        if (poweredBy) {
            detected.push({
                name: `Built with: ${poweredBy}`,
                confidence: 90,
                category: 'server'
            });
        }
    } catch {
        // Ignore
    }

    return detected;
}

export function generateRandomPorts(): number[] {
    const openPorts: number[] = [];
    const portCount = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < portCount; i++) {
        const port = COMMON_PORTS[Math.floor(Math.random() * COMMON_PORTS.length)];
        if (!openPorts.includes(port)) openPorts.push(port);
    }
    return openPorts.sort((a, b) => a - b);
}

export function getSecurityGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    if (score >= 40) return 'E';
    return 'F';
}

export function getGradeColor(grade: string): string {
    const colors: Record<string, string> = {
        'A': 'bg-green-500',
        'B': 'bg-emerald-400',
        'C': 'bg-yellow-400',
        'D': 'bg-orange-400',
        'E': 'bg-red-400',
        'F': 'bg-red-600'
    };
    return colors[grade] || 'bg-gray-400';
}

export function generateScanId(): string {
    return 'scan_' + crypto.randomBytes(8).toString('hex');
}

export const CERTIFICATE_LIFE_DAYS = {
    'critical': '> 90 days',
    'high': '30-90 days',
    'medium': '14-30 days',
    'low': '< 14 days'
};

export function calculateOverallScore(results: { headers: number; cookies: number; tls: number; dns: number; tech: number }): number {
    const { headers, cookies, tls, dns, tech } = results;
    return Math.round(
        (headers * 0.25) +
        (cookies * 0.20) +
        (tls * 0.20) +
        (dns * 0.20) +
        (tech * 0.15)
    );
}