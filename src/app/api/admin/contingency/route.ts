import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { searchParams } = new URL(req.url);
    const domain = searchParams.get('domain');

    const conditions: string[] = ['s.contingency_plan IS NOT NULL'];
    const params: any[] = [];
    let idx = 1;

    if (domain) {
        conditions.push(`s.domain = $${idx++}`);
        params.push(domain);
    }

    const plans = await query(
        `SELECT s.id AS "scanId",
                s.domain,
                s.score,
                s.grade,
                s.created_at AS "createdAt",
                s.contingency_plan AS "plan",
                COALESCE(l.name, c.name, '—') AS "ownerName",
                COALESCE(l.company, c.company, '—') AS "ownerCompany",
                COALESCE(c.id, l.cliente_id) AS "clienteId"
         FROM scans s
         LEFT JOIN leads l ON l.id = s.lead_id
         LEFT JOIN clientes c ON c.id = s.cliente_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY s.created_at DESC
         LIMIT ${idx === 1 ? 200 : '$' + idx + ''}`,
        [...params, ...(idx === 1 ? [] : [200])]
    );

    if (domain && plans.length > 0) {
        return NextResponse.json({ plans, plan: plans[0].plan });
    }
    return NextResponse.json({ plans });
}

export async function PATCH(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { scanId, itemId, status } = await req.json().catch(() => ({}));
    if (!scanId || !itemId || !status) {
        return NextResponse.json({ error: 'scanId, itemId e status são obrigatórios' }, { status: 400 });
    }

    const valid = ['pendente', 'em_andamento', 'concluida'];
    if (!valid.includes(status)) {
        return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    const result = await query('SELECT id, contingency_plan AS "plan" FROM scans WHERE id = $1', [scanId]);
    if (!result[0] || !result[0].plan) {
        return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });
    }

    const plan = result[0].plan;
    if (Array.isArray(plan.plano)) {
        for (const item of plan.plano) {
            if (item.id === itemId) item.status = status;
        }
    }

    await query(
        'UPDATE scans SET contingency_plan = $1 WHERE id = $2',
        [JSON.stringify(plan), scanId]
    );
    return NextResponse.json({ ok: true, plan });
}