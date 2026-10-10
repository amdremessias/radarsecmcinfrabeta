import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { HARVEST_QUEUE_NAME, HarvestJobData, harvestRedisConnection } from '../queues/harvest.queue';
import { query } from '../lib/db';
import { runTheHarvester } from '../lib/harvest/theharvester';
import { resolveHarvestApiKeysYaml } from '../lib/harvest/keys';
import { persistHarvestResult } from '../lib/harvest/persist';

async function processHarvestScan(job: Job<HarvestJobData>, data: HarvestJobData) {
    await job.updateProgress(5);

    try {
        await query(`UPDATE harvest_scans SET status = 'running', started_at = $1, updated_at = $1 WHERE id = $2`, [
            new Date(),
            data.scanId,
        ]);
    } catch (e) {
        console.error('[harvest-worker] falha ao marcar running:', e);
    }

    await job.updateProgress(20);

    const useApi = data.options?.useApi === true;
    const apiKeysYaml = await resolveHarvestApiKeysYaml(useApi).catch((e) => {
        console.error('[harvest-worker] falha ao carregar chaves de API:', e?.message || e);
        return null;
    });

    const result = await runTheHarvester(data.target, {
        sources: data.options?.sources,
        limit: data.options?.limit,
        sourceWorkers: data.options?.sourceWorkers,
        noHosts: data.options?.noHosts,
        quiet: data.options?.quiet,
        timeoutMs: data.options?.timeoutMs || Number(process.env.HARVESTER_TIMEOUT_MS) || 900000,
        memory: data.options?.memory || process.env.HARVESTER_MEMORY || '1g',
        cpus: data.options?.cpus || process.env.HARVESTER_CPUS || '1.0',
        useApi,
        apiKeysYaml: apiKeysYaml || undefined,
    });

    await job.updateProgress(80);

    let status;
    try {
        status = await persistHarvestResult(data.scanId, result);
    } catch (e: any) {
        await query(`UPDATE harvest_scans SET status = 'failed', error = $1, updated_at = $2 WHERE id = $3`, [
            e?.message || String(e),
            new Date(),
            data.scanId,
        ]);
        throw e;
    }

    await job.updateProgress(100);
    return { scanId: data.scanId, status, resultCount: result.resultCount };
}

export const harvestWorker = new Worker<HarvestJobData>(
    HARVEST_QUEUE_NAME,
    async (job: Job<HarvestJobData>) => {
        return processHarvestScan(job, job.data);
    },
    {
        connection: harvestRedisConnection(),
        concurrency: 1,
    }
);

harvestWorker.on('completed', (job, result) => {
    console.log(`[Harvest Worker] job ${job.id} concluído`, result ?? '');
});

harvestWorker.on('failed', (job, err) => {
    console.error(`[Harvest Worker] job ${job?.id} falhou:`, err?.message || err);
});

harvestWorker.on('error', (err) => {
    console.error('[Harvest Worker] erro de conexão:', err?.message || err);
});

console.log(`[Harvest Worker] Radar Security theHarvester worker online (fila: ${HARVEST_QUEUE_NAME}).`);
