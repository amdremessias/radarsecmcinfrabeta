import { NextRequest, NextResponse } from 'next/server';
import {
    staffSession,
    adminOnlySession,
    adminUnauthorized,
    adminForbidden,
    isAdminRole,
} from '@/lib/adminAuth';
import {
    HARVEST_KEY_PROVIDERS,
    deleteApiKey,
    getKeyProvider,
    isHarvestApiEnabled,
    listApiKeyMeta,
    setApiKeyEnabled,
    saveApiKey,
} from '@/lib/harvest/keys';

export const runtime = 'nodejs';

/**
 * Configuração da integração de API do theHarvester (fontes keyed).
 *
 * - GET  (equipe)   → flag global, catálogo de provedores e chaves cadastradas (mascaradas).
 * - POST (admin)    → cria/atualiza a chave de um provedor.
 * - DELETE (admin)  → remove a chave de um provedor (`?provider=`).
 */
export async function GET() {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const keys = await listApiKeyMeta();

    return NextResponse.json({
        apiEnabled: isHarvestApiEnabled(),
        canManage: isAdminRole(session.user.role),
        providers: HARVEST_KEY_PROVIDERS,
        keys,
    });
}

export async function POST(req: NextRequest) {
    const session = await adminOnlySession();
    if (!session) return adminForbidden();

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    }

    const providerId = String(body.provider ?? '').trim();
    const provider = getKeyProvider(providerId);
    if (!provider) {
        return NextResponse.json({ error: 'Provedor desconhecido.' }, { status: 422 });
    }

    const rawFields = body.fields && typeof body.fields === 'object' ? body.fields : {};

    const mergedFields: Record<string, string> = {};
    for (const f of provider.fields) {
        const value = String(rawFields[f.name] ?? '').trim();
        if (value) mergedFields[f.name] = value;
    }

    try {
        await saveApiKey({
            provider: providerId,
            fields: mergedFields,
            enabled: body.enabled !== false,
            userId: session.user.id || null,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Falha ao salvar a chave.' }, { status: 422 });
    }

    const keys = await listApiKeyMeta();
    return NextResponse.json({ ok: true, keys });
}

export async function PATCH(req: NextRequest) {
    const session = await adminOnlySession();
    if (!session) return adminForbidden();

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Corpo inválido.' }, { status: 400 });
    }

    const providerId = String(body.provider ?? '').trim();
    if (!getKeyProvider(providerId)) {
        return NextResponse.json({ error: 'Provedor desconhecido.' }, { status: 422 });
    }

    await setApiKeyEnabled(providerId, body.enabled === true);
    const keys = await listApiKeyMeta();
    return NextResponse.json({ ok: true, keys });
}

export async function DELETE(req: NextRequest) {
    const session = await adminOnlySession();
    if (!session) return adminForbidden();

    const providerId = new URL(req.url).searchParams.get('provider') || '';
    if (!getKeyProvider(providerId)) {
        return NextResponse.json({ error: 'Provedor desconhecido.' }, { status: 422 });
    }

    await deleteApiKey(providerId);
    const keys = await listApiKeyMeta();
    return NextResponse.json({ ok: true, keys });
}
