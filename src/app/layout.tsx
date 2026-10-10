import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
    title: 'MCinfraTI | Radar Security',
    description: 'MCinfraTI - Radar Security: diagnóstico cibernético, monitoramento e contingência.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="pt-BR" suppressHydrationWarning>
            <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">{children}</body>
        </html>
    );
}