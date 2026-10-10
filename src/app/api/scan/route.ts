import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runScan, createScanRow, scanErrorResponse } from '@/lib/runScan';
import { enqueueWebScan, isAsyncScanEnabled } from '@/queues/scan.queue';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        const body = await req.json().catch(() => ({}));
        const targetUrl = body?.url || body?.targetUrl;
        const scanType = body?.scanType || 'full';
        const targetId = body?.targetId || null;

        if (!targetUrl) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        let parsedUrl: URL;
        try {
            parsedUrl = new URL(targetUrl);
        } catch {
            return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
        }

        const domain = parsedUrl.hostname;

        // Fluxo assíncrono (BullMQ + Redis): enfileira e retorna imediatamente.
        // Padrão de produção: SCAN_ASYNC=false (síncrono, sem Redis obrigatório).
        if (isAsyncScanEnabled()) {
            const targetIdNum = targetId ? Number(targetId) : null;
            const userIdNum = session?.user?.id ? Number(session.user.id) : null;
            const createdId = await createScanRow(targetUrl, {
                userId: userIdNum,
                targetId: targetIdNum,
                scanType,
            });
            await enqueueWebScan({
                scanId: createdId,
                targetUrl,
                domain,
                userId: userIdNum,
                targetId: targetIdNum,
            });
            return NextResponse.json({
                scanId: createdId,
                targetUrl,
                domain,
                status: 'queued',
                async: true,
            });
        }

        try {
            const result = await runScan(targetUrl, {
                userId: session?.user?.id ? Number(session.user.id) : null,
                targetId: targetId ? Number(targetId) : null,
                scanType,
            });
            return NextResponse.json({
                scanId: result.scanId,
                targetUrl,
                domain,
                score: result.score,
                grade: result.grade,
                duration_ms: result.duration_ms,
                status: 'completed',
                headers: result.headers,
                cookies: result.cookies,
                tls: result.tls,
                dns: result.dns,
                technology: result.technology,
                vulnerabilities: result.vulnerabilities,
                infoDisclosure: result.infoDisclosure,
                exposure: result.exposure,
                penalty: result.penalty,
                lgpd: result.lgpd,
                contingencyPlan: result.contingency_plan,
            });
        } catch (scanErr: any) {
            return scanErrorResponse(scanErr);
        }
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get('targetId');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const status = searchParams.get('status');

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (targetId) {
        conditions.push(`s.target_id = $${paramIdx++}`);
        params.push(targetId);
    }
    if (status) {
        conditions.push(`s.status = $${paramIdx++}`);
        params.push(status);
    }

    const baseSql = `SELECT s.id, s.target_url as "targetUrl", s.domain, s.scan_type as "scanType",
        s.status, s.score, s.grade, s.duration_ms as "durationMs",
        s.error, s.created_at as "createdAt", s.completed_at as "completedAt",
        s.user_id as "userId"
        FROM scans s`;
    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

    const rows = await query(
        `${baseSql}${where} ORDER BY s.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
    );

    const countResult = await query(
        `SELECT COUNT(*) as count FROM scans s${where}`,
        params
    );

    return NextResponse.json({
        scans: rows,
        total: parseInt(countResult[0].count),
        limit,
        offset,
    });
}