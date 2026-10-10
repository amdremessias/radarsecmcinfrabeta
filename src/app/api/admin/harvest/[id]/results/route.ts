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
    const type = searchParams.get('type');
    const limit = Math.min(parseInt(searchParams.get('limit') || '2000'), 10000);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    let where = 'WHERE scan_id = $1';
    const params: any[] = [scanId];
    let idx = 2;

    if (type) {
        where += ` AND result_type = $${idx}`;
        params.push(type);
        idx++;
    }

    const rows = await query(
        `SELECT id,
                scan_id AS "scanId",
                result_type AS "resultType",
                value,
                sources,
                details,
                created_at AS "createdAt"
         FROM harvest_results
         ${where}
         ORDER BY result_type ASC, value ASC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
    );

    const countResult = await query(`SELECT COUNT(*)::int AS count FROM harvest_results ${where}`, params);

    return NextResponse.json({
        results: rows,
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
    });
}
