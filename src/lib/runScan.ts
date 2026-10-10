import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { fullScan } from '@/lib/scanner/scanner';
import { scanDNS, detectTechnology, getSecurityGrade } from '@/lib/scanner/comprehensiveScanner';
import { runExposureScan, emptyExposureResult, PassiveScanResult } from '@/lib/scanner/passiveScanner';
import { runLgpdScan, emptyLgpdChecklist, LgpdChecklist } from '@/lib/scanner/lgpdScanner';
import { generateContingencyPlan, PlanoContingencia } from '@/lib/contingency';

export interface ScanRunOptions {
    userId?: number | null;
    targetId?: number | null;
    leadId?: number | null;
    clienteId?: number | null;
    scanType?: string;
}

export interface ScanRunResult {
    scanId: number;
    targetUrl: string;
    domain: string;
    score: number;
    grade: string;
    duration_ms: number;
    status: string;
    headers: any;
    cookies: any;
    tls: any;
    dns: any;
    technology: any[];
    vulnerabilities: string[];
    infoDisclosure: any;
    exposure: PassiveScanResult;
    penalty: number;
    lgpd: LgpdChecklist;
    contingency_plan: PlanoContingencia;
}

export function extractDomain(targetUrl: string): { parsedUrl: URL; domain: string } {
    const parsedUrl = new URL(targetUrl);
    return { parsedUrl, domain: parsedUrl.hostname };
}

/**
 * Cria uma linha de scan em status 'running' e retorna o id.
 * Reutilizado pelo fluxo síncrono (runScan) e pelo fluxo assíncrono (enfileirado).
 */
export async function createScanRow(targetUrl: string, opts: ScanRunOptions = {}): Promise<number> {
    const { domain } = extractDomain(targetUrl);
    const insertResult = await query(
        `INSERT INTO scans (user_id, target_id, lead_id, cliente_id, target_url, domain, scan_type, status, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
        [
            opts.userId ?? null,
            opts.targetId ?? null,
            opts.leadId ?? null,
            opts.clienteId ?? null,
            targetUrl,
            domain,
            opts.scanType || 'full',
            'running',
        ]
    );
    return insertResult[0].id;
}

/**
 * Executa o pipeline (headers/cookies/tls + dns + tecnologias), calcula o score/grade,
 * gera o plano de contingência e grava o resultado na linha do scan já existente.
 * A linha deve ter sido criada previamente (createScanRow ou /api/scan síncrono).
 */
export async function runScanPipeline(
    targetUrl: string,
    scanId: number,
    opts: ScanRunOptions = {}
): Promise<ScanRunResult> {
    const { domain } = extractDomain(targetUrl);
    const startTime = Date.now();

    const [scanResult, dnsAnalysis, techDetection, exposureResult] = await Promise.all([
        fullScan(targetUrl),
        scanDNS(domain),
        detectTechnology(targetUrl),
        runExposureScan(targetUrl).catch(() => emptyExposureResult(targetUrl)),
    ]);

    // LGPD depende de scanResult (cookies/headers/TLS) — executa após o fullScan.
    const lgpdResult = await runLgpdScan({
        targetUrl,
        cookies: Array.isArray(scanResult.cookies) ? scanResult.cookies : [],
        headers: scanResult.headers,
        tlsOk: !scanResult.tls?.issues?.includes('TLS scan failed'),
    }).catch(() => emptyLgpdChecklist(targetUrl));

    const techScore = Math.max(20, 100 - techDetection.length * 15);

    const tlsScore = scanResult.tls?.issues?.includes('TLS scan failed')
        ? null
        : (scanResult.tls?.score ?? 60);

    const weights = tlsScore === null
        ? { scan: 0.7, dns: 0.3 }
        : { scan: 0.55, dns: 0.2, tls: 0.15, tech: 0.1 };

    // Penalidade por arquivos/config sensíveis expostos (spec): subtrai do score base.
    const penalty = exposureResult.metrics.calculated_penalty;

    const score = Math.max(
        0,
        Math.min(
            100,
            Math.round(
                scanResult.score * weights.scan +
                    dnsAnalysis.score * weights.dns +
                    (tlsScore ?? 0) * (weights.tls ?? 0) +
                    techScore * (weights.tech ?? 0) -
                    penalty
            )
        )
    );

    const grade = getSecurityGrade(score);
    const duration = Date.now() - startTime;

    const contingency_plan = generateContingencyPlan({
        domain,
        target_url: targetUrl,
        score,
        grade,
        headers: scanResult.headers,
        vulnerabilities: scanResult.vulnerabilities,
        tls: scanResult.tls,
        dns: dnsAnalysis,
        exposure: exposureResult,
        lgpd: lgpdResult,
    });

    await query(
        `UPDATE scans SET
            status = $1,
            score = $2,
            grade = $3,
            headers = $4,
            cookies = $5,
            tls = $6,
            dns = $7,
            technology = $8,
            vulnerabilities = $9,
            info_disclosure = $10,
            subdomains_found = $11,
            contingency_plan = $12,
            exposure = $13,
            lgpd = $14,
            duration_ms = $15,
            error = $16,
            completed_at = now()
        WHERE id = $17`,
        [
            'completed',
            score,
            grade,
            JSON.stringify(scanResult.headers),
            JSON.stringify(scanResult.cookies),
            JSON.stringify(scanResult.tls),
            JSON.stringify(dnsAnalysis),
            JSON.stringify(techDetection),
            JSON.stringify(scanResult.vulnerabilities),
            JSON.stringify(scanResult.infoDisclosure),
            '{' + dnsAnalysis.subdomains.map((s) => s.subdomain).join(',') + '}',
            JSON.stringify(contingency_plan),
            JSON.stringify(exposureResult),
            JSON.stringify(lgpdResult),
            duration,
            null,
            scanId,
        ]
    );

    if (opts.userId) {
        await query(
            'INSERT INTO usage_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
            [opts.userId, 'scan', JSON.stringify({ targetUrl, score, duration })]
        );
    }

    return {
        scanId,
        targetUrl,
        domain,
        score,
        grade,
        duration_ms: duration,
        status: 'completed',
        headers: scanResult.headers,
        cookies: scanResult.cookies,
        tls: scanResult.tls,
        dns: dnsAnalysis,
        technology: techDetection,
        vulnerabilities: scanResult.vulnerabilities,
        infoDisclosure: scanResult.infoDisclosure,
        exposure: exposureResult,
        penalty,
        lgpd: lgpdResult,
        contingency_plan,
    };
}

export async function failScanRow(scanId: number, error: string | Error): Promise<void> {
    await query(
        'UPDATE scans SET status = $1, error = $2, completed_at = now() WHERE id = $3',
        ['failed', error instanceof Error ? error.message : String(error), scanId]
    );
}

export async function runScan(
    targetUrl: string,
    opts: ScanRunOptions = {}
): Promise<ScanRunResult> {
    const scanId = await createScanRow(targetUrl, opts);

    try {
        return await runScanPipeline(targetUrl, scanId, opts);
    } catch (scanErr: any) {
        await failScanRow(scanId, scanErr.message);
        throw scanErr;
    }
}

export async function getLatestScan(targetUrl: string) {
    const domain = extractDomain(targetUrl).domain;
    return queryOne<any>(
        `SELECT * FROM scans
         WHERE domain = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [domain]
    );
}

export function scanErrorResponse(err: any) {
    return NextResponse.json(
        { error: 'Scan failed', details: err?.message || String(err) },
        { status: 500 }
    );
}