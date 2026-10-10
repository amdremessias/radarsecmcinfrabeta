import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const rows = await query(
        `SELECT d.id,
                d.project_name AS "projectName",
                d.source_type AS "sourceType",
                d.repository_url AS "repositoryUrl",
                d.branch,
                d.stack,
                d.summary,
                d.file_count AS "fileCount",
                d.duration_ms AS "durationMs",
                d.status,
                d.error,
                d.created_at AS "createdAt",
                COALESCE(u.name, '—') AS "ownerName"
         FROM deep_analysis d
         LEFT JOIN users u ON u.id = d.user_id
         ORDER BY d.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*)::int AS count FROM deep_analysis');

    return NextResponse.json({
        analyses: rows,
        total: countResult[0]?.count ?? 0,
        limit,
        offset,
    });
}