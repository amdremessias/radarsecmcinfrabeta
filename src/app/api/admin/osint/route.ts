import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';
import { enqueueOsintScan } from '@/queues/osint.queue';
import { runOsintScan, type OsintEngine } from '@/lib/osint/engines';
import { persistSherlockResult } from '@/lib/osint/persist';
import { getPreset, MAX_CUSTOM_SITES, resolveSites } from '@/lib/osint/sites';

export const runtime = 'nodejs';
export const maxDuration = 300;

const USERNAME_RE = /^[A-Za-z0-9._-]{2,64}$/;

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(Math.round(value), min), max);
}

type ScanOptions = {
    engine: OsintEngine;
    variations: boolean;
    nsfw: boolean;
    preset: string;
    sites: string[] | null;
    requestTimeoutSec: number;
    printAll: boolean;
    allSites: boolean;
    topSites: number | undefined;
};

function parseScanOptions(body: any): ScanOptions {
    const engine: OsintEngine = body.engine === 'maigret' ? 'maigret' : 'sherlock';

    const customSites = Array.isArray(body.sites)
        ? body.sites
              .filter((s: unknown) => typeof s === 'string')
              .map((s: string) => s.trim())
              .filter(Boolean)
              .slice(0, MAX_CUSTOM_SITES)
        : [];

    if (engine === 'maigret') {
        const scope = ['default', 'all', 'custom'].includes(body.preset) ? body.preset : 'default';
        return {
            engine,
            variations: false,
            nsfw: false,
            preset: scope,
            sites: scope === 'custom' && customSites.length > 0 ? customSites : null,
            requestTimeoutSec: clamp(Number(body.requestTimeoutSec) || 30, 5, 120),
            printAll: body.printAll === false ? false : true,
            allSites: scope === 'all',
            topSites: clamp(Number(body.topSites) || 500, 10, 2000),
        };
    }

    const isKnownPreset =
        typeof body.preset === 'string' && (body.preset === 'custom' || Boolean(getPreset(body.preset)));
    const presetId = isKnownPreset ? body.preset : 'all';

    const resolved = resolveSites(presetId, customSites);
    const nsfw = Boolean(body.nsfw) || resolved.nsfw;

    return {
        engine,
        variations: Boolean(body.variations),
        nsfw,
        preset: presetId,
        sites: resolved.sites,
        requestTimeoutSec: clamp(Number(body.requestTimeoutSec) || 30, 5, 120),
        printAll: body.printAll === false ? false : true,
        allSites: false,
        topSites: undefined,
    };
}

export async function GET(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    const rows = await query(
        `SELECT o.id,
                o.username,
                o.status,
                o.sites_total AS "sitesTotal",
                o.sites_found AS "sitesFound",
                o.success_rate AS "successRate",
                o.execution_time_ms AS "executionTimeMs",
                o.created_at AS "createdAt",
                o.completed_at AS "completedAt",
                o.options,
                COALESCE(u.name, '—') AS "ownerName"
         FROM osint_scans o
         LEFT JOIN users u ON u.id = o.user_id
         ORDER BY o.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*)::int AS count FROM osint_scans');

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
        const username = String(body.username ?? '').trim();

        if (!username) {
            return NextResponse.json({ error: 'Informe o username para busca.' }, { status: 422 });
        }
        if (!USERNAME_RE.test(username)) {
            return NextResponse.json(
                { error: 'Username inválido. Use de 2 a 64 caracteres: letras, números, ponto, hífen ou underline.' },
                { status: 422 }
            );
        }

        const options = parseScanOptions(body);

        const inserted = await query(
            `INSERT INTO osint_scans (username, status, user_id, options)
             VALUES ($1, 'pending', $2, $3::jsonb)
             RETURNING id`,
            [username, session.user.id || null, JSON.stringify(options)]
        );
        const scanId: number = inserted[0].id;

        const jobId = await enqueueOsintScan({
            scanId,
            username,
            options: {
                engine: options.engine,
                timeoutMs: Number(process.env.SHERLOCK_TIMEOUT_MS) || 900000,
                memory: process.env.SHERLOCK_MEMORY || '512m',
                cpus: process.env.SHERLOCK_CPUS || '1.0',
                requestTimeoutSec: options.requestTimeoutSec,
                variations: options.engine === 'sherlock' ? options.variations : false,
                nsfw: options.engine === 'sherlock' ? options.nsfw : false,
                sites: options.sites,
                printAll: options.printAll,
                allSites: options.allSites,
                topSites: options.topSites,
            },
        });

        if (jobId) {
            return NextResponse.json(
                { scanId, jobId, status: 'pending', message: 'Busca enfileirada.' },
                { status: 202 }
            );
        }

        // Fallback síncrono (fila/Redis indisponível)
        await query(`UPDATE osint_scans SET status = 'running', started_at = now(), updated_at = now() WHERE id = $1`, [
            scanId,
        ]);

        const result = await runOsintScan(username, {
            engine: options.engine,
            timeoutMs: Number(process.env.SHERLOCK_TIMEOUT_MS) || 900000,
            memory: process.env.SHERLOCK_MEMORY || '512m',
            cpus: process.env.SHERLOCK_CPUS || '1.0',
            requestTimeoutSec: options.requestTimeoutSec,
            variations: options.engine === 'sherlock' ? options.variations : false,
            nsfw: options.engine === 'sherlock' ? options.nsfw : false,
            sites: options.sites,
            printAll: options.printAll,
            allSites: options.allSites,
            topSites: options.topSites,
        });
        const status = await persistSherlockResult(scanId, result);

        return NextResponse.json({ scanId, status, message: 'Busca concluída.' }, { status: 200 });
    } catch (e: any) {
        console.error('[osint] erro:', e?.message);
        return NextResponse.json({ error: 'Falha ao iniciar busca OSINT.', details: e?.message }, { status: 500 });
    }
}