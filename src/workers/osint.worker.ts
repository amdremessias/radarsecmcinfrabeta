import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { OSINT_QUEUE_NAME, OsintJobData, osintRedisConnection } from '../queues/osint.queue';
import { query } from '../lib/db';
import { runOsintScan } from '../lib/osint/engines';
import { persistSherlockResult, type OsintScanStatus } from '../lib/osint/persist';
// Registra também o worker do theHarvester (Domain Recon) no mesmo processo/bundle.
import './harvest.worker';

async function processOsintScan(job: Job<OsintJobData>, data: OsintJobData) {
    await job.updateProgress(5);

    try {
        await query('UPDATE osint_scans SET status = $1, started_at = $2, updated_at = $2 WHERE id = $3', [
            'running',
            new Date(),
            data.scanId,
        ]);
    } catch (e) {
        console.error('[osint-worker] falha ao marcar running:', e);
    }

    await job.updateProgress(20);
    const sherlockResult = await runOsintScan(data.username, {
        engine: data.options?.engine,
        timeoutMs: data.options?.timeoutMs || Number(process.env.SHERLOCK_TIMEOUT_MS) || 900000,
        memory: data.options?.memory || process.env.SHERLOCK_MEMORY || '512m',
        cpus: data.options?.cpus || process.env.SHERLOCK_CPUS || '1.0',
        requestTimeoutSec: data.options?.requestTimeoutSec,
        variations: data.options?.variations,
        nsfw: data.options?.nsfw,
        sites: data.options?.sites,
        printAll: data.options?.printAll,
        allSites: data.options?.allSites,
        topSites: data.options?.topSites,
        extraArgs: data.options?.extraArgs,
    });
    await job.updateProgress(80);

    let status: OsintScanStatus;
    try {
        status = await persistSherlockResult(data.scanId, sherlockResult);
    } catch (e: any) {
        await query('UPDATE osint_scans SET status = $1, error = $2, updated_at = $3 WHERE id = $4', [
            'failed',
            e?.message || String(e),
            new Date(),
            data.scanId,
        ]);
        throw e;
    }

    await job.updateProgress(100);
    return {
        scanId: data.scanId,
        status,
        sitesFound: sherlockResult.sitesFound,
        sitesTotal: sherlockResult.sitesTotal,
    };
}

export const osintWorker = new Worker<OsintJobData>(
    OSINT_QUEUE_NAME,
    async (job: Job<OsintJobData>) => {
        return processOsintScan(job, job.data);
    },
    {
        connection: osintRedisConnection(),
        concurrency: 1,
    }
);

osintWorker.on('completed', (job, result) => {
    console.log(`[OSINT Worker] job ${job.id} concluído`, result ?? '');
});

osintWorker.on('failed', (job, err) => {
    console.error(`[OSINT Worker] job ${job?.id} falhou:`, err?.message || err);
});

osintWorker.on('error', (err) => {
    console.error('[OSINT Worker] erro de conexão:', err?.message || err);
});

console.log(`[OSINT Worker] Radar Security OSINT worker online (fila: ${OSINT_QUEUE_NAME}).`);
