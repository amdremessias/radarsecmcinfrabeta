import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { runScan } from '@/lib/runScan';
import { normalizeName, normalizeEmail, normalizeCompany, normalizePhone, normalizeUrl } from '@/lib/normalize';
import { z } from 'zod';

export const runtime = 'nodejs';

const leadSchema = z.object({
    name: z.string().min(1, 'Informe seu nome').max(160),
    email: z.string().email('E-mail inválido').max(160),
    phone: z
        .string()
        .max(16)
        .refine(
            (v) => v === '' || /^\+?\d{8,15}$/.test(v),
            'Telefone inválido: use apenas números, entre 8 e 15 dígitos (com +55 opcional).'
        )
        .default(''),
    company: z.string().max(160),
    url: z.string().url('URL inválida'),
    consent: z.literal(true, {
        errorMap: () => ({ message: 'O consentimento LGPD é obrigatório para envio.' }),
    }),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const cleaned = {
            name: normalizeName(body?.name),
            email: normalizeEmail(body?.email),
            phone: normalizePhone(body?.phone),
            company: normalizeCompany(body?.company),
            url: normalizeUrl(body?.url),
            consent: body?.consent,
        };
        const parsed = leadSchema.safeParse(cleaned);
        if (!parsed.success) {
            const first = parsed.error.issues[0];
            return NextResponse.json(
                { error: 'Dados inválidos', details: parsed.error.issues, message: first?.message },
                { status: 400 }
            );
        }

        const { name, email, phone, company, url } = parsed.data;
        const clientIp =
            req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            req.headers.get('x-real-ip') ||
            'desconhecido';

        const insertResult = await query(
            `INSERT INTO leads (name, email, phone, company, target_url, status, lgpd_consent_at, lgpd_consent_ip)
             VALUES ($1, $2, $3, $4, $5, 'novo', now(), $6) RETURNING id, name, email, target_url AS "targetUrl", created_at AS "createdAt"`,
            [name, email, phone, company, url, clientIp]
        );
        const lead = insertResult[0];

        try {
            const result = await runScan(url, { leadId: lead.id });
            await query('UPDATE leads SET status = $1 WHERE id = $2', ['contato', lead.id]);
            return NextResponse.json({
                ok: true,
                lead: { ...lead, status: 'contato' },
                analysis: {
                    domain: result.domain,
                    score: result.score,
                    grade: result.grade,
                    duration_ms: result.duration_ms,
                    vulnerabilityCount: result.vulnerabilities.length,
                    missingHeaders: result.headers.filter((h: any) => !h?.present).map((h: any) => h?.header),
                },
            });
        } catch {
            // Scan falhou, mas o lead foi capturado
            return NextResponse.json(
                {
                    ok: true,
                    lead,
                    analysis: { status: 'pending' },
                    message: 'Lead registrado. A análise será concluída em instantes.',
                },
                { status: 201 }
            );
        }
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET() {
    const leads = await query(
        `SELECT l.id,
                l.name,
                l.email,
                l.phone,
                l.company,
                l.target_url AS "targetUrl",
                l.status,
                l.created_at AS "createdAt",
                COALESCE(latest.score, 0) AS "score",
                COALESCE(latest.grade, '-') AS "grade"
         FROM leads l
         LEFT JOIN LATERAL (
             SELECT s.score, s.grade
             FROM scans s
             WHERE s.lead_id = l.id
             ORDER BY s.created_at DESC
             LIMIT 1
         ) latest ON true
         ORDER BY l.created_at DESC
         LIMIT 100`
    );
    return NextResponse.json({ leads, total: leads.length });
}

export async function getLeadByEmail(email: string) {
    return queryOne(
        'SELECT * FROM leads WHERE LOWER(email) = LOWER($1) ORDER BY created_at DESC LIMIT 1',
        [email]
    );
}