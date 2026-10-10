import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { SCAN_QUEUE_NAME, ScanJobData, ScanToolJobData, ScanWebJobData, scanRedisConnection } from '../queues/scan.queue';
import { failScanRow, runScanPipeline } from '../lib/runScan';
import { ScannerRegistry } from '../scanners/scanner.registry';

const registry = new ScannerRegistry();

async function processWebScan(job: Job<ScanJobData>, data: ScanWebJobData) {
    await job.updateProgress(10);
    try {
        const result = await runScanPipeline(data.targetUrl, data.scanId, {
            userId: data.userId ?? null,
            targetId: data.targetId ?? null,
        });
        await job.updateProgress(100);
        return { scanId: result.scanId, status: result.status, score: result.score, grade: result.grade };
    } catch (error: any) {
        await failScanRow(data.scanId, error);
        throw error;
    }
}

async function processToolScan(job: Job<ScanJobData>, data: ScanToolJobData) {
    if (!data.targetPath) {
        throw new Error('Worker: alvo (pasta/caminho) ausente para scan de ferramenta.');
    }
    await job.updateProgress(10);
    const scanner = registry.get(data.toolName);
    const result = await scanner.scan(data.targetPath, data.options);
    await job.updateProgress(100);

    if (result.status === 'FAILED' || result.status === 'TIMEOUT') {
        throw new Error(`Scan falhou: ${result.error}`);
    }
    return result;
}

export const scanWorker = new Worker<ScanJobData>(
    SCAN_QUEUE_NAME,
    async (job: Job<ScanJobData>) => {
        if (job.data.kind === 'web') {
            return processWebScan(job, job.data);
        }
        return processToolScan(job, job.data);
    },
    {
        connection: scanRedisConnection(),
        concurrency: 2,
    }
);

scanWorker.on('completed', (job, result) => {
    console.log(`[Worker] job ${job.id} (${job.data.kind}) concluído`, result ?? '');
});

scanWorker.on('failed', (job, err) => {
    console.error(`[Worker] job ${job?.id} (${job?.data.kind}) falhou:`, err?.message || err);
});

scanWorker.on('error', (err) => {
    console.error('[Worker] erro de conexão:', err?.message || err);
});

console.log(`[Worker] Radar Security scan worker online (fila: ${SCAN_QUEUE_NAME}).`);

async function shutdown() {
    await scanWorker.close();
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);