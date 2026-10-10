import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { searchParams } = new URL(req.url);
    const clienteId = searchParams.get('clienteId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (clienteId) {
        conditions.push(`s.cliente_id = $${idx++}`);
        params.push(clienteId);
    }

    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const rows = await query(
        `SELECT s.id,
                s.target_url AS "targetUrl",
                s.domain,
                s.status,
                s.score,
                s.grade,
                s.duration_ms AS "durationMs",
                s.error,
                s.created_at AS "createdAt",
                s.completed_at AS "completedAt",
                s.lead_id AS "leadId",
                s.cliente_id AS "clienteId",
                COALESCE(l.name, c.name, '—') AS "ownerName"
         FROM scans s
         LEFT JOIN leads l ON l.id = s.lead_id
         LEFT JOIN clientes c ON c.id = s.cliente_id
         ${where}
         ORDER BY s.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
    );

    const countResult = await query(
        `SELECT COUNT(*)::int AS count FROM scans s${where}`,
        params
    );

    return NextResponse.json({
        scans: rows,
        total: countResult[0].count,
        limit,
        offset,
    });
}