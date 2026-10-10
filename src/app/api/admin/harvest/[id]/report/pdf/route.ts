import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';
import { buildHarvestPdf, exportHarvestFilename, HarvestPdfData } from '@/lib/report/harvestPdf';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id } = await ctx.params;
    const scanId = parseInt(id);
    if (!Number.isFinite(scanId)) {
        return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
    }

    const row = await queryOne(
        `SELECT id, target, status, result_count AS "resultCount", counts,
                evidence_status AS "evidenceStatus", execution_time_ms AS "executionTimeMs",
                created_at AS "createdAt", sources, error
         FROM harvest_scans
         WHERE id = $1`,
        [scanId]
    );

    if (!row) {
        return NextResponse.json({ error: 'Scan não encontrado.' }, { status: 404 });
    }

    const results = await query(
        `SELECT result_type AS "resultType", value, sources
         FROM harvest_results
         WHERE scan_id = $1
         ORDER BY result_type ASC, value ASC`,
        [scanId]
    );

    const data: HarvestPdfData = {
        id: row.id,
        target: row.target,
        status: row.status,
        resultCount: row.resultCount || 0,
        counts: row.counts && typeof row.counts === 'object' ? row.counts : {},
        evidenceStatus: row.evidenceStatus,
        executionTimeMs: row.executionTimeMs,
        createdAt: row.createdAt,
        sources: row.sources,
        error: row.error,
        findings: results.map((r: any) => ({
            resultType: r.resultType,
            value: r.value,
            sources: r.sources,
        })),
    };

    const buffer = await buildHarvestPdf(data);

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${exportHarvestFilename(data.target, data.id)}"`,
            'Cache-Control': 'private, no-store',
        },
    });
}
