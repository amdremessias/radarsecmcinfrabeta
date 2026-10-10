import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { adminOnlySession, adminForbidden, adminUnauthorized } from '@/lib/adminAuth';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const runtime = 'nodejs';

const ROLES = ['admin', 'gestor', 'cliente'];

const createSchema = z.object({
    name: z.string().min(1).max(160),
    email: z.string().email().max(160),
    password: z.string().min(6).max(128),
    role: z.enum(['admin', 'gestor', 'cliente']),
    clienteId: z.number().int().positive().nullish(),
});

export async function GET() {
    const session = await adminOnlySession();
    if (!session) return adminUnauthorized();

    const users = await query(
        `SELECT u.id,
                u.name,
                u.email,
                u.role,
                u.active,
                u.cliente_id AS "clienteId",
                COALESCE(c.name, '—') AS "clienteName",
                u.created_at AS "createdAt"
         FROM users u
         LEFT JOIN clientes c ON c.id = u.cliente_id
         ORDER BY u.created_at DESC`
    );
    return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
    const session = await adminOnlySession();
    if (!session) return adminUnauthorized();
    if (session.user.role !== 'admin' && session.user.role !== 'superadmin') {
        return adminForbidden();
    }

    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Dados inválidos', details: parsed.error.issues },
            { status: 400 }
        );
    }
    const { name, email, password, role, clienteId } = parsed.data;

    if (role === 'cliente' && !clienteId) {
        return NextResponse.json(
            { error: 'Usuários do nível cliente precisam estar vinculados a um cliente.' },
            { status: 400 }
        );
    }

    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.length > 0) {
        return NextResponse.json({ error: 'Já existe um usuário com este e-mail.' }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
        `INSERT INTO users (name, email, password_hash, role, active, cliente_id)
         VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING id, name, email, role, active, cliente_id AS "clienteId", created_at AS "createdAt"`,
        [name, email.toLowerCase().trim(), hash, role, clienteId ?? null]
    );
    return NextResponse.json({ user: result[0] }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
    const session = await adminOnlySession();
    if (!session) return adminUnauthorized();

    const body = await req.json().catch(() => ({}));
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });

    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (fields.name !== undefined) {
        sets.push(`name = $${idx++}`);
        params.push(fields.name);
    }
    if (fields.email !== undefined) {
        sets.push(`email = $${idx++}`);
        params.push(fields.email.toLowerCase().trim());
    }
    if (fields.role !== undefined) {
        if (!ROLES.includes(fields.role)) {
            return NextResponse.json({ error: 'Nível inválido' }, { status: 400 });
        }
        sets.push(`role = $${idx++}`);
        params.push(fields.role);
    }
    if (fields.active !== undefined) {
        sets.push(`active = $${idx++}`);
        params.push(Boolean(fields.active));
    }
    if (fields.clienteId !== undefined) {
        sets.push(`cliente_id = $${idx++}`);
        params.push(fields.clienteId);
    }
    if (fields.password) {
        const hash = await bcrypt.hash(fields.password, 10);
        sets.push(`password_hash = $${idx++}`);
        params.push(hash);
    }

    if (sets.length === 0) {
        return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    try {
        params.push(id);
        const result = await query(
            `UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${idx}
             RETURNING id, name, email, role, active, cliente_id AS "clienteId", created_at AS "createdAt"`,
            params
        );
        if (result.length === 0) {
            return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
        }
        return NextResponse.json({ user: result[0] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 400 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await adminOnlySession();
    if (!session) return adminUnauthorized();

    const { id } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    if (Number(id) === Number(session.user.id)) {
        return NextResponse.json({ error: 'Você não pode excluir o próprio acesso.' }, { status: 400 });
    }

    await query('DELETE FROM users WHERE id = $1', [id]);
    return NextResponse.json({ ok: true });
}