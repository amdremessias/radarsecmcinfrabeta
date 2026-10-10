import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const STAFF = ['admin', 'superadmin', 'gestor'];

function redirectToLogin(req: NextRequest, pathname: string) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    const token = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
        secureCookie: process.env.NEXTAUTH_URL?.startsWith('https://'),
    });
    const role = token?.role as string | undefined;

    if (pathname.startsWith('/cliente')) {
        if (role === 'cliente' && (token?.clienteId ?? null)) {
            return NextResponse.next();
        }
        if (STAFF.includes(role ?? '')) {
            // Equipe tem painel próprio.
            return NextResponse.redirect(new URL('/admin', req.url));
        }
        return redirectToLogin(req, '/cliente');
    }

    if (pathname.startsWith('/admin')) {
        if (!token) {
            return redirectToLogin(req, pathname);
        }
        if (role === 'cliente') {
            // Cliente tenta acessar o painel da equipe → área do cliente.
            return NextResponse.redirect(new URL('/cliente', req.url));
        }
        if (!STAFF.includes(role ?? '')) {
            return redirectToLogin(req, pathname);
        }
        // Gestão de usuários é exclusiva do nível administrativo.
        if (pathname.startsWith('/admin/users') && role !== 'admin' && role !== 'superadmin') {
            return NextResponse.redirect(new URL('/admin', req.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*', '/cliente/:path*'],
};