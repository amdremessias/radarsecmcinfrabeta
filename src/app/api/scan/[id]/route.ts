import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const scanId = parseInt(id);

    if (isNaN(scanId)) {
        return NextResponse.json({ error: 'Invalid scan ID' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);

    const scan = await query(
        `SELECT id, target_url as "targetUrl", domain, scan_type as "scanType",
            status, score, grade, headers, cookies, tls,
            dns, technology, vulnerabilities, info_disclosure as "infoDisclosure",
            subdomains_found as "subdomainsFound", ports_found as "portsFound",
            cve_matches as "cveMatches", error, duration_ms as "durationMs",
            cliente_id as "clienteId",
            contingency_plan as "contingencyPlan",
            exposure,
            lgpd,
            archived_at as "archivedAt",
            archived_by as "archivedBy",
            created_at as "createdAt", completed_at as "completedAt"
         FROM scans WHERE id = $1`,
        [scanId]
    );

    if (scan.length === 0) {
        return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    }

    // Nível cliente enxerga somente os scans do próprio cadastro.
    if (session?.user?.role === 'cliente') {
        const ownerId = scan[0].clienteId;
        if (!session.user.clienteId || ownerId !== session.user.clienteId) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }
    }

    return NextResponse.json(scan[0]);
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const scanId = parseInt(id);

    if (isNaN(scanId)) {
        return NextResponse.json({ error: 'Invalid scan ID' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    // Qualquer usuário autenticado pode arquivar/desarquivar.
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'archive') {
        const userId = Number(session.user.id) || null;
        await query(
            'UPDATE scans SET archived_at = now(), archived_by = $1 WHERE id = $2',
            [userId, scanId]
        );
        return NextResponse.json({ success: true, archived: true });
    }

    if (action === 'unarchive') {
        await query(
            'UPDATE scans SET archived_at = NULL, archived_by = NULL WHERE id = $1',
            [scanId]
        );
        return NextResponse.json({ success: true, archived: false });
    }

    return NextResponse.json({ error: 'Unknown action. Use action=archive or action=unarchive.' }, { status: 400 });
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const scanId = parseInt(id);

    if (isNaN(scanId)) {
        return NextResponse.json({ error: 'Invalid scan ID' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);

    // Apenas equipe pode excluir scans.
    const role = session?.user?.role;
    if (role !== 'admin' && role !== 'superadmin' && role !== 'gestor') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await query('DELETE FROM scans WHERE id = $1', [scanId]);
    return NextResponse.json({ success: true });
}