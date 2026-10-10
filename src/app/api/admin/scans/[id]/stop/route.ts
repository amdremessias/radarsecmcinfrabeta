import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';
import { getScanQueue } from '@/queues/scan.queue';

export const runtime = 'nodejs';

/**
 * Para um scan preso (running/queued): remove jobs da fila BullMQ (se async estiver
 * habilitado) para liberar capacidade e marca a linha como 'cancelled' no banco,
 * evitando scans fantasmas e sobrecarga do worker.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id } = await params;
    const scanId = parseInt(id);
    if (isNaN(scanId)) {
        return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const scan = await query(
        `SELECT id, status, domain, target_url AS "targetUrl" FROM scans WHERE id = $1`,
        [scanId]
    );
    if (scan.length === 0) {
        return NextResponse.json({ error: 'Scan não encontrado' }, { status: 404 });
    }

    const current = scan[0];
    if (current.status === 'completed' || current.status === 'failed' || current.status === 'cancelled') {
        return NextResponse.json({
            ok: true,
            scanId,
            status: current.status,
            alreadyTerminated: true,
            message: 'Scan já não está em execução.',
        });
    }

    // 1) Limpa jobs pendentes da fila para não sobrecarregar o worker.
    let queueItemsRemoved = 0;
    const queue = getScanQueue();
    if (queue) {
        try {
            const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized', 'active'], 0, -1, true);
            const matches = jobs.filter((j: any) => Number(j.data?.scanId) === scanId);
            for (const job of matches) {
                try {
                    await job.remove();
                    queueItemsRemoved++;
                } catch {
                    // job ativo não pode ser removido diretamente; já será finalizado pelo worker
                }
            }
        } catch (err: any) {
            console.error(`[stop-scan] falha ao consultar fila para scan ${scanId}:`, err?.message || err);
        }
    }

    // 2) Marca a linha como cancelada.
    await query(
        `UPDATE scans
         SET status = $1, error = $2, completed_at = now()
         WHERE id = $3 AND status IN ('running', 'queued', 'pending')`,
        ['cancelled', 'Cancelado pelo administrador', scanId]
    );

    return NextResponse.json({ ok: true, scanId, status: 'cancelled', queueItemsRemoved });
}