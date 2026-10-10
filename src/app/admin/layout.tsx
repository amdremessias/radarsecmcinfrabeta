import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import AdminShell from '@/components/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const session = await getServerSession(authOptions);
    const role = session?.user?.role;

    if (!session) {
        redirect('/login?callbackUrl=/admin');
    }
    if (role === 'cliente') {
        redirect('/cliente');
    }
    if (role !== 'admin' && role !== 'superadmin' && role !== 'gestor') {
        redirect('/login?callbackUrl=/admin');
    }

    return <AdminShell role={role}>{children}</AdminShell>;
}