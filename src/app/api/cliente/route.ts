import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Client type (role 'cliente') só vê o próprio cadastro via clienteId da sessão.
    const clienteId = session.user.clienteId;
    if (!clienteId) {
        return NextResponse.json(
            { error: 'Usuário sem vínculo de cliente para visualização.' },
            { status: 400 }
        );
    }

    const [clienteRes, scans, latest] = await Promise.all([
        query(
            `SELECT id, name, email, phone, company, domain, plan, status, notes,
                    created_at AS "createdAt"
             FROM clientes WHERE id = $1`,
            [clienteId]
        ),
        query(
            `SELECT s.id,
                    s.target_url AS "targetUrl",
                    s.domain,
                    s.status,
                    s.score,
                    s.grade,
                    s.duration_ms AS "durationMs",
                    s.created_at AS "createdAt"
             FROM scans s
             WHERE s.cliente_id = $1
             ORDER BY s.created_at DESC
             LIMIT 100`,
            [clienteId]
        ),
        query(
            `SELECT s.id AS "scanId", s.score, s.grade, s.created_at AS "createdAt",
                    s.contingency_plan AS "plan"
             FROM scans s
             WHERE s.cliente_id = $1 AND s.contingency_plan IS NOT NULL
             ORDER BY s.created_at DESC
             LIMIT 1`,
            [clienteId]
        ),
    ]);

    const cliente = clienteRes[0] || null;
    const latestScan = scans[0] || null;

    return NextResponse.json({
        cliente,
        scans,
        latestScan,
        contingency: latest[0] || null,
    });
}