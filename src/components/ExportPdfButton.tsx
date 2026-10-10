'use client';

import { useState } from 'react';
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ExportPdfButtonProps {
    scanId: string | number;
    targetUrl?: string;
    className?: string;
}

export function ExportPdfButton({
    scanId,
    targetUrl = 'relatorio',
    className = '',
}: ExportPdfButtonProps) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const handleDownloadPdf = async () => {
        try {
            setLoading(true);
            setStatus('idle');

            const response = await fetch(`/api/scan/${scanId}/report/pdf`, {
                method: 'GET',
                headers: { Accept: 'application/pdf' },
            });

            if (!response.ok) {
                throw new Error('Falha ao gerar o relatório em PDF.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');

            const sanitizedUrl = targetUrl.replace(/[^a-zA-Z0-9]/g, '_');
            link.href = url;
            link.download = `MCinfraTI_Radar_${sanitizedUrl}_${String(scanId).slice(0, 8)}.pdf`;

            document.body.appendChild(link);
            link.click();

            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);
        } catch (err) {
            console.error('[ExportPdf] Erro ao baixar o PDF:', err);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 4000);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleDownloadPdf}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 border shadow-sm select-none ${
                status === 'error'
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : status === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        >
            {loading ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    <span>Gerando PDF...</span>
                </>
            ) : status === 'success' ? (
                <>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Download Concluído!</span>
                </>
            ) : status === 'error' ? (
                <>
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span>Erro ao Exportar</span>
                </>
            ) : (
                <>
                    <Download className="w-4 h-4 text-blue-400" />
                    <span>Exportar PDF</span>
                </>
            )}
        </button>
    );
}