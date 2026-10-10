import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';
import { buildOsintPdf, exportOsintFilename, OsintPdfData } from '@/lib/report/osintPdf';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
                o.error
         FROM osint_scans o
         WHERE o.id = $1`,
        [scanId]
    );

    if (!row) {
        return NextResponse.json({ error: 'Scan não encontrado.' }, { status: 404 });
    }

    const results = await query(
        `SELECT site_name AS "siteName", url, found, status, message,
                matched_username AS "matchedUsername", data
         FROM osint_scan_results
         WHERE scan_id = $1
         ORDER BY found DESC, site_name ASC`,
        [scanId]
    );

    const data: OsintPdfData = {
        id: row.id,
        username: row.username,
        status: row.status,
        sitesTotal: row.sitesTotal,
        sitesFound: row.sitesFound,
        successRate: Number(row.successRate || 0),
        executionTimeMs: row.executionTimeMs,
        createdAt: row.createdAt,
        error: row.error,
        results: results.map((r: any) => ({
            siteName: r.siteName,
            url: r.url,
            found: r.found,
            status: r.status,
            message: r.message,
            matchedUsername: r.matchedUsername,
            data: r.data,
        })),
    };

    const buffer = await buildOsintPdf(data);

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${exportOsintFilename(data.username, data.id)}"`,
            'Cache-Control': 'private, no-store',
        },
    });
}
