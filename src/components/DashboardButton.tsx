'use client';

import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DashboardButtonProps {
    scanId: string | number;
    className?: string;
}

export const DashboardButton: React.FC<DashboardButtonProps> = ({
    scanId,
    className = '',
}) => {
    const router = useRouter();

    const handleOpenDashboard = () => {
        router.push(`/scan/${scanId}/dashboard`);
    };

    return (
        <button
            onClick={handleOpenDashboard}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 border shadow-sm select-none
                bg-blue-600/10 border-blue-500/30 text-blue-300 hover:bg-blue-600/20 hover:border-blue-500/50 hover:text-blue-200
                ${className}`}
        >
            <LayoutDashboard className="w-4 h-4 text-blue-400" />
            <span>Ver Dashboard</span>
        </button>
    );
};
