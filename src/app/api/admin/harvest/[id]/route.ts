import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id } = await ctx.params;
    const scanId = parseInt(id);
    if (!Number.isFinite(scanId)) {
        return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const rows = await query(
        `SELECT h.id,
                h.target,
                h.status,
                h.sources,
                h.result_count AS "resultCount",
                h.counts,
                h.evidence_status AS "evidenceStatus",
                h.source_status AS "sourceStatus",
                h.execution_time_ms AS "executionTimeMs",
                h.error,
                h.options,
                h.raw_stdout AS "rawStdout",
                h.raw_stderr AS "rawStderr",
                h.created_at AS "createdAt",
                h.completed_at AS "completedAt",
                h.started_at AS "startedAt",
                COALESCE(u.name, '—') AS "ownerName"
         FROM harvest_scans h
         LEFT JOIN users u ON u.id = h.user_id
         WHERE h.id = $1`,
        [scanId]
    );

    if (!rows[0]) {
        return NextResponse.json({ error: 'Scan não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ scan: rows[0] });
}
