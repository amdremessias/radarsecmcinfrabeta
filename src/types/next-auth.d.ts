import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            role?: string;
            clienteId?: number | null;
        };
    }

    interface User {
        id: string;
        name?: string | null;
        email?: string | null;
        role?: string;
        clienteId?: number | null;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id?: string;
        role?: string;
        clienteId?: number | null;
    }
}