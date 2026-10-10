import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import ClientShell from '@/components/ClientShell';

export default async function ClienteLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect('/login?callbackUrl=/cliente');
    }
    const role = session.user.role;
    if (role === 'cliente') {
        if (!session.user.clienteId) {
            redirect('/login');
        }
    } else if (role === 'admin' || role === 'superadmin' || role === 'gestor') {
        redirect('/admin');
    } else {
        redirect('/login');
    }

    return <ClientShell>{children}</ClientShell>;
}