import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');

    let querySql = `SELECT id, target_url as "targetUrl", status, score,
        created_at as "createdAt", completed_at as "completedAt"
        FROM scans`;
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
        querySql += ` WHERE status = $${paramIdx}`;
        params.push(status);
        paramIdx++;
    }

    querySql += ` ORDER BY created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    const scans = await query(querySql, params);

    const countResult = await query(
        status
            ? 'SELECT COUNT(*) as count FROM scans WHERE status = $1'
            : 'SELECT COUNT(*) as count FROM scans',
        status ? [status] : []
    );

    return NextResponse.json({
        scans,
        total: parseInt(countResult[0].count),
        limit,
        offset,
    });
}