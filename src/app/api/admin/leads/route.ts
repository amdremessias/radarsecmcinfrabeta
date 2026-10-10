import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET() {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const leads = await query(
        `SELECT l.id,
                l.name,
                l.email,
                l.phone,
                l.company,
                l.target_url AS "targetUrl",
                l.status,
                l.notes,
                l.consulting_requested_at AS "consultingAt",
                l.created_at AS "createdAt",
                COALESCE(latest.score, 0) AS "score",
                COALESCE(latest.grade, '—') AS "grade",
                latest.created_at AS "scanAt"
         FROM leads l
         LEFT JOIN LATERAL (
             SELECT s.score, s.grade, s.created_at
             FROM scans s
             WHERE s.lead_id = l.id
             ORDER BY s.created_at DESC
             LIMIT 1
         ) latest ON true
         ORDER BY l.created_at DESC
         LIMIT 200`
    );
    return NextResponse.json({ leads });
}

export async function PATCH(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id, status } = await req.json().catch(() => ({}));
    if (!id || !status) {
        return NextResponse.json({ error: 'id e status são obrigatórios' }, { status: 400 });
    }

    const valid = ['novo', 'contato', 'negocio', 'cliente', 'descartado'];
    if (!valid.includes(status)) {
        return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    let clienteId: number | null = null;
    if (status === 'cliente') {
        const result = await query(
            `UPDATE leads SET status = 'cliente' WHERE id = $1 RETURNING id, name, email, phone, company, target_url AS "targetUrl"`,
            [id]
        );
        if (result[0]) {
            const lead = result[0];
            const existing = await query(
                'SELECT id FROM clientes WHERE LOWER(email) = LOWER($1) OR LOWER(domain) = LOWER($2) LIMIT 1',
                [lead.email || '', lead.targetUrl || '']
            );
            if (existing[0]) {
                clienteId = existing[0].id as number;
            } else {
                const domain = lead.targetUrl
                    ? new URL(lead.targetUrl).hostname
                    : null;
                const created = await query(
                    `INSERT INTO clientes (name, email, phone, company, domain)
                     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [lead.name, lead.email || null, lead.phone || null, lead.company || null, domain]
                );
                clienteId = created[0].id as number;
            }
        }
    } else {
        await query(
            `UPDATE leads SET status = $1 WHERE id = $2`,
            [status, id]
        );
    }

    if (clienteId) {
        await query(
            `UPDATE leads SET status = 'cliente', cliente_id = $1 WHERE id = $2`,
            [clienteId, id]
        );
        await query(
            `UPDATE scans SET cliente_id = $1 WHERE lead_id = $2 AND cliente_id IS NULL`,
            [clienteId, id]
        );
    }

    const lead = await query(
        `SELECT l.id, l.name, l.email, l.phone, l.company, l.target_url AS "targetUrl",
                l.status, l.cliente_id AS "clienteId", l.created_at AS "createdAt"
         FROM leads l WHERE l.id = $1`,
        [id]
    );
    return NextResponse.json({ lead: lead[0] });
}

export async function DELETE(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    await query('DELETE FROM leads WHERE id = $1', [id]);
    return NextResponse.json({ ok: true });
}