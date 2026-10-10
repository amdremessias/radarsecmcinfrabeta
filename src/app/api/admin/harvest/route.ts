import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';
import { enqueueHarvestScan } from '@/queues/harvest.queue';
import { runTheHarvester } from '@/lib/harvest/theharvester';
import { persistHarvestResult } from '@/lib/harvest/persist';
import {
    getHarvestPreset,
    MAX_CUSTOM_SOURCES,
    presetRequiresApi,
    resolveHarvestSources,
} from '@/lib/harvest/sources';
import { isHarvestApiEnabled, resolveHarvestApiKeysYaml } from '@/lib/harvest/keys';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Domínio (ex.: example.com) ou nome de organização.
const TARGET_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{1,252}$/;

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(Math.round(value), min), max);
}

type HarvestScanOptions = {
    preset: string;
    sources: string[];
    limit: number;
    sourceWorkers: number;
    noHosts: boolean;
    quiet: boolean;
    useApi: boolean;
};

function parseHarvestOptions(body: any): HarvestScanOptions {
    const customSources = Array.isArray(body.sources)
        ? body.sources
              .filter((s: unknown) => typeof s === 'string')
              .map((s: string) => s.trim())
              .filter(Boolean)
              .slice(0, MAX_CUSTOM_SOURCES)
        : [];

    const preset =
        typeof body.preset === 'string' && (body.preset === 'custom' || Boolean(getHarvestPreset(body.preset)))
            ? body.preset
            : 'keyless';

    const sources = resolveHarvestSources(preset, customSources);

    return {
        preset,
        sources,
        limit: clamp(Number(body.limit ?? 500), 0, 5000),
        sourceWorkers: clamp(Number(body.sourceWorkers ?? 3), 1, 10),
        noHosts: Boolean(body.noHosts),
        quiet: body.quiet === false ? false : true,
        useApi: isHarvestApiEnabled() && body.useApi === true,
    };
}

export async function GET(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    const rows = await query(
        `SELECT h.id,
                h.target,
                h.status,
                h.sources,
                h.result_count AS "resultCount",
                h.counts,
                h.evidence_status AS "evidenceStatus",
                h.execution_time_ms AS "executionTimeMs",
                h.created_at AS "createdAt",
                h.completed_at AS "completedAt",
                h.options,
                COALESCE(u.name, '—') AS "ownerName"
         FROM harvest_scans h
         LEFT JOIN users u ON u.id = h.user_id
         ORDER BY h.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*)::int AS count FROM harvest_scans');

    return NextResponse.json({
        scans: rows,
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
    });
}

export async function POST(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    try {
        const body = await req.json();
        const target = String(body.target ?? '').trim();

        if (!target) {
            return NextResponse.json({ error: 'Informe o domínio (ou nome da organização).' }, { status: 422 });
        }
        if (!TARGET_RE.test(target)) {
            return NextResponse.json(
                { error: 'Alvo inválido. Use um domínio (ex.: example.com) ou nome de organização.' },
                { status: 422 }
            );
        }

        const options = parseHarvestOptions(body);

        if (presetRequiresApi(options.preset) && !options.useApi) {
            return NextResponse.json(
                {
                    error: 'Este conjunto de fontes exige a integração de API. Habilite "Usar fontes com API" (e cadastre as chaves).',
                },
                { status: 422 }
            );
        }

        const inserted = await query(
            `INSERT INTO harvest_scans (target, status, user_id, options, sources)
             VALUES ($1, 'pending', $2, $3::jsonb, $4)
             RETURNING id`,
            [target, session.user.id || null, JSON.stringify(options), options.sources.join(',')]
        );
        const scanId: number = inserted[0].id;

        const jobData = {
            sources: options.sources,
            limit: options.limit,
            sourceWorkers: options.sourceWorkers,
            noHosts: options.noHosts,
            quiet: options.quiet,
            useApi: options.useApi,
            timeoutMs: Number(process.env.HARVESTER_TIMEOUT_MS) || 900000,
            memory: process.env.HARVESTER_MEMORY || '1g',
            cpus: process.env.HARVESTER_CPUS || '1.0',
        };

        const jobId = await enqueueHarvestScan({ scanId, target, options: jobData });

        if (jobId) {
            return NextResponse.json(
                { scanId, jobId, status: 'pending', message: 'Recon enfileirado.' },
                { status: 202 }
            );
        }

        // Fallback síncrono (fila/Redis indisponível)
        await query(`UPDATE harvest_scans SET status = 'running', started_at = now(), updated_at = now() WHERE id = $1`, [
            scanId,
        ]);

        const apiKeysYaml = await resolveHarvestApiKeysYaml(options.useApi).catch(() => null);
        const result = await runTheHarvester(target, { ...jobData, apiKeysYaml: apiKeysYaml || undefined });
        const status = await persistHarvestResult(scanId, result);

        return NextResponse.json({ scanId, status, message: 'Recon concluído.' }, { status: 200 });
    } catch (e: any) {
        console.error('[harvest] erro:', e?.message);
        return NextResponse.json({ error: 'Falha ao iniciar recon de domínio.', details: e?.message }, { status: 500 });
    }
}
