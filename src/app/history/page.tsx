'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, Trash2, Globe, Loader2 } from 'lucide-react';
import Navigation from '@/components/Navigation';

export default function HistoryPage() {
    const router = useRouter();
    const [scans, setScans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        fetch('/api/scan/history?limit=50')
            .then((r) => r.json())
            .then((d) => {
                setScans(d.scans || []);
                setTotal(d.total || 0);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    async function handleDelete(id: number) {
        if (!confirm('Excluir este scan?')) return;
        await fetch(`/api/scan/${id}`, { method: 'DELETE' });
        setScans((prev) => prev.filter((s) => s.id !== id));
        setTotal((prev) => prev - 1);
    }

    if (loading) {
        return (
            <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
            </div>
        );
    }

    return (
        <>
            <Navigation />
            <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Histórico de Scans</h1>
                <span className="text-sm text-gray-400">{total} scans</span>
            </div>

            {scans.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Nenhum scan realizado ainda.</p>
                </div>
            ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-800">
                                <th className="px-4 py-3 text-left text-sm text-gray-300">URL</th>
                                <th className="px-4 py-3 text-center text-sm text-gray-300">Score</th>
                                <th className="px-4 py-3 text-center text-sm text-gray-300">Nota</th>
                                <th className="px-4 py-3 text-left text-sm text-gray-300">Status</th>
                                <th className="px-4 py-3 text-left text-sm text-gray-300">Data</th>
                                <th className="px-4 py-3 text-center text-sm text-gray-300">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {scans.map((s) => (
                                <tr
                                    key={s.id}
                                    className="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                                    onClick={() => router.push(`/scan/${s.id}`)}
                                >
                                    <td className="px-4 py-3 text-sm">
                                        <div className="flex items-center gap-2">
                                            <Globe className="w-3 h-3 text-gray-500 flex-shrink-0" />
                                            <span className="truncate max-w-xs">{s.targetUrl}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center text-sm">
                                        {s.score !== null ? `${s.score}/100` : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {s.score !== null && (
                                            <span className={`text-lg font-bold ${getGradeColor(s.score)}`}>
                                                {getGrade(s.score)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <StatusBadge status={s.status} />
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-400">
                                        {format(new Date(s.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                            className="p-1 text-gray-500 hover:text-red-400 transition"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            </div>
        </>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        completed: 'bg-green-900/30 text-green-400 border-green-800',
        running: 'bg-blue-900/30 text-blue-400 border-blue-800',
        failed: 'bg-red-900/30 text-red-400 border-red-800',
        pending: 'bg-gray-800 text-gray-400 border-gray-700',
    };
    const labels: Record<string, string> = {
        completed: 'Completo',
        running: 'Em andamento',
        failed: 'Falhou',
        pending: 'Pendente',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs border ${styles[status] || styles.pending}`}>
            {labels[status] || status}
        </span>
    );
}

function getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    if (score >= 40) return 'E';
    return 'F';
}

function getGradeColor(score: number): string {
    if (score >= 90) return 'text-green-500';
    if (score >= 80) return 'text-emerald-400';
    if (score >= 70) return 'text-yellow-400';
    if (score >= 60) return 'text-orange-400';
    if (score >= 40) return 'text-red-400';
    return 'text-red-600';
}