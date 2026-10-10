import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

export const STAFF_ROLES = ['admin', 'superadmin', 'gestor'];

export function isStaffRole(role?: string): boolean {
    return !!role && STAFF_ROLES.includes(role);
}

export function isAdminRole(role?: string): boolean {
    return role === 'admin' || role === 'superadmin';
}

// Qualquer usuário da equipe (admin | superadmin | gestor)
export async function staffSession() {
    const session = await getServerSession(authOptions);
    if (session && isStaffRole(session.user.role)) {
        return session;
    }
    return null;
}

// Somente admin / superadmin (gestão de usuários, etc.)
export async function adminOnlySession() {
    const session = await getServerSession(authOptions);
    if (session && isAdminRole(session.user.role)) {
        return session;
    }
    return null;
}

export function adminUnauthorized() {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
}

export function adminForbidden() {
    return NextResponse.json({ error: 'Acesso restrito ao administrador' }, { status: 403 });
}