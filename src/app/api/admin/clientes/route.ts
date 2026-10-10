import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET() {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const clientes = await query(
        `SELECT c.id,
                c.name,
                c.email,
                c.phone,
                c.company,
                c.domain,
                c.plan,
                c.status,
                c.notes,
                c.created_at AS "createdAt",
                COALESCE(latest.score, 0) AS "score",
                COALESCE(latest.grade, '—') AS "grade",
                (SELECT COUNT(*)::int FROM scans s WHERE s.cliente_id = c.id) AS "scanCount"
         FROM clientes c
         LEFT JOIN LATERAL (
             SELECT s.score, s.grade
             FROM scans s
             WHERE s.cliente_id = c.id
             ORDER BY s.created_at DESC
             LIMIT 1
         ) latest ON true
         ORDER BY c.created_at DESC
         LIMIT 200`
    );
    return NextResponse.json({ clientes });
}

export async function POST(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const body = await req.json().catch(() => ({}));
    const { name, email, phone, company, domain, plan = 'essencial' } = body;
    if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    const result = await query(
        `INSERT INTO clientes (name, email, phone, company, domain, plan)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, phone, company, domain, plan, status, created_at AS "createdAt"`,
        [name, email || null, phone || null, company || null, domain || null, plan]
    );
    return NextResponse.json({ cliente: result[0] }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const body = await req.json().catch(() => ({}));
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    const allowed = ['name', 'email', 'phone', 'company', 'domain', 'plan', 'status', 'notes'];
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const key of allowed) {
        if (key in fields) {
            sets.push(`${key} = $${idx++}`);
            params.push(fields[key]);
        }
    }
    if (sets.length === 0) {
        return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }
    params.push(id);
    const result = await query(
        `UPDATE clientes SET ${sets.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING id, name, email, phone, company, domain, plan, status, notes`,
        params
    );
    return NextResponse.json({ cliente: result[0] });
}

export async function DELETE(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    await query('DELETE FROM clientes WHERE id = $1', [id]);
    return NextResponse.json({ ok: true });
}