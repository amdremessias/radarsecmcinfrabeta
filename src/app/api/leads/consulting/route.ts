import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normalizeEmail } from '@/lib/normalize';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
    email: z.string().email().max(160),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const parsed = bodySchema.safeParse({ email: normalizeEmail(body?.email) });
        if (!parsed.success) {
            return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 });
        }

        const result = await query(
            `UPDATE leads
             SET consulting_requested_at = now()
             WHERE LOWER(email) = LOWER($1) AND consulting_requested_at IS NULL
             RETURNING id, name, email`,
            [parsed.data.email]
        );

        if (result.length === 0) {
            return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
        }

        return NextResponse.json({ ok: true, lead: result[0] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}