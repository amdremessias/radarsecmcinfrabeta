import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id } = await ctx.params;
    const scanId = parseInt(id);

    const row = await queryOne(
        `SELECT o.id,
                o.username,
                o.status,
                o.sites_total AS "sitesTotal",
                o.sites_found AS "sitesFound",
                o.success_rate AS "successRate",
                o.execution_time_ms AS "executionTimeMs",
                o.created_at AS "createdAt",
                o.updated_at AS "updatedAt",
                o.completed_at AS "completedAt",
                o.started_at AS "startedAt",
                o.options,
                o.error,
                o.raw_stdout AS "rawStdout",
                o.raw_stderr AS "rawStderr"
         FROM osint_scans o
         WHERE o.id = $1`,
        [scanId]
    );

    if (!row) {
        return NextResponse.json({ error: 'Scan não encontrado.' }, { status: 404 });
    }

    return NextResponse.json(row);
}
