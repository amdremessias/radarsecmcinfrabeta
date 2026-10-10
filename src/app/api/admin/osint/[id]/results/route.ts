import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id } = await ctx.params;
    const scanId = parseInt(id);
    const { searchParams } = new URL(req.url);
    const foundOnly = searchParams.get('found') === 'true';
    const limit = parseInt(searchParams.get('limit') || '2000');
    const offset = parseInt(searchParams.get('offset') || '0');

    let where = 'WHERE scan_id = $1';
    const params: any[] = [scanId];
    let idx = 2;

    if (foundOnly) {
        where += ` AND found = $${idx}`;
        params.push(true);
        idx++;
    }

    const rows = await query(
        `SELECT id,
                scan_id AS "scanId",
                site_name AS "siteName",
                url,
                found,
                status,
                message,
                matched_username AS "matchedUsername",
                data,
                created_at AS "createdAt"
         FROM osint_scan_results
         ${where}
         ORDER BY found DESC, site_name ASC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
    );

    const countResult = await query(`SELECT COUNT(*)::int AS count FROM osint_scan_results ${where}`, params);

    return NextResponse.json({
        results: rows,
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
    });
}
