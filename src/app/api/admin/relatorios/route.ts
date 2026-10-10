import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const dateFilter =
        from && to
            ? 'AND created_at >= $1::timestamptz AND created_at <= $2::timestamptz'
            : from
              ? 'AND created_at >= $1::timestamptz'
              : to
                ? 'AND created_at <= $1::timestamptz'
                : '';

    const rows = await query(
        `SELECT
            DATE_TRUNC('day', created_at)::date AS "day",
            COUNT(*)::int AS "scans",
            ROUND(AVG(score) FILTER (WHERE score IS NOT NULL))::int AS "avgScore",
            ROUND(AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL))::int AS "avgDurationMs",
            COUNT(*) FILTER (WHERE status = 'failed')::int AS "failures",
            COUNT(DISTINCT domain)::int AS "domains"
         FROM scans
         WHERE 1=1 ${dateFilter}
         GROUP BY DATE_TRUNC('day', created_at)::date
         ORDER BY "day" DESC
         LIMIT 60`
    );

    const totals = await query(
        `SELECT
            COUNT(*)::int AS "totalScans",
            COUNT(DISTINCT domain)::int AS "totalDomains",
            COUNT(DISTINCT lead_id)::int AS "uniqueLeads",
            ROUND(AVG(score) FILTER (WHERE score IS NOT NULL))::int AS "avgScore",
            COUNT(*) FILTER (WHERE status = 'failed')::int AS "failures"
         FROM scans
         WHERE 1=1 ${dateFilter}`
    );

    return NextResponse.json({ series: rows, totals: totals[0] });
}