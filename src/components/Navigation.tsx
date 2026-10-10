'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scan, Clock, Shield } from 'lucide-react';

export default function Navigation() {
    const router = useRouter();
    const [active, setActive] = useState('/');

    return (
        <nav className="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
                <button onClick={() => { setActive('/'); router.push('/'); }} className="flex items-center gap-2 text-lg font-bold text-white hover:text-blue-400 transition">
                    <Shield className="w-6 h-6" />
                    MCinfraTI <span className="text-blue-400">Radar Security</span>
                </button>
                <div className="flex gap-1">
                    <NavButton icon={Scan} label="Nova Scan" active={active === '/'} onClick={() => setActive('/')} />
                    <NavButton icon={Clock} label="Histórico" active={active === '/history'} onClick={() => setActive('/history')} />
                </div>
            </div>
        </nav>
    );
}

function NavButton({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
    return (
        <button onClick={onClick} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition ${active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );
}