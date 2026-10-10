import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('targetId');
    const scanId = searchParams.get('scanId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (scanId) {
        const scan = await query(
            `SELECT id, target_url as "targetUrl", target_id as "targetId", domain,
                scan_type as "scanType", status, score, grade, headers, cookies, tls,
                dns, technology, vulnerabilities, info_disclosure as "infoDisclosure",
                subdomains_found as "subdomainsFound", ports_found as "portsFound",
                cve_matches as "cveMatches", error, duration_ms as "durationMs",
                created_at as "createdAt", completed_at as "completedAt"
             FROM scans WHERE id = $1`,
            [parseInt(scanId)]
        );

        if (scan.length === 0) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        return NextResponse.json(scan[0]);
    }

    let sql = `SELECT s.id, s.target_url as "targetUrl", s.target_id as "targetId",
        s.domain, s.scan_type as "scanType", s.score, s.grade, s.status,
        s.duration_ms as "durationMs", s.created_at as "createdAt", s.completed_at as "completedAt",
        t.domain as "targetDomain"
        FROM scans s
        LEFT JOIN scan_targets t ON s.target_id = t.id`;
    const params: any[] = [];
    const conditions: string[] = [];
    let paramIdx = 1;

    if (targetId) {
        conditions.push(`s.target_id = $${paramIdx}`);
        params.push(targetId);
        paramIdx++;
    }

    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY s.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    const rows = await query(sql, params);
    const countSql = `SELECT COUNT(*) as count FROM scans s ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}`;
    const countResult = await query(countSql, []);

    return NextResponse.json({
        scans: rows,
        total: parseInt(countResult[0].count),
        limit,
        offset
    });
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const scanId = searchParams.get('scanId');

    if (!scanId) {
        return NextResponse.json({ error: 'scanId is required' }, { status: 400 });
    }

    await query('DELETE FROM scans WHERE id = $1', [parseInt(scanId)]);
    return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { targetUrl, scanType = 'full', targetId = null } = body;

    if (!targetUrl) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const insertResult = await query(
        'INSERT INTO scans (target_url, scan_type, target_id, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [targetUrl, scanType, targetId, 'pending']
    );

    return NextResponse.json({ scanId: insertResult[0].id, status: 'pending' });
}