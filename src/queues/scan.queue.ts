import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { ScanOptions } from '../types/scanner';

export type ScanWebJobData = {
    kind: 'web';
    scanId: number;
    targetUrl: string;
    domain: string;
    userId?: number | null;
    targetId?: number | null;
};

export type ScanToolJobData = {
    kind: 'scanner';
    toolName: string;
    targetPath: string;
    options?: ScanOptions;
};

export type ScanJobData = ScanWebJobData | ScanToolJobData;

export const SCAN_QUEUE_NAME = 'security-scans';

export function scanRedisConnection() {
    const url = process.env.REDIS_URL;
    if (url) return { url };
    return {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        maxRetriesPerRequest: null,
    };
}

let redisClient: Redis | null = null;

/**
 * Cliente Redis compartilhado. É passado como INSTÂNCIA ao BullMQ para evitar
 * que o load lazy de `ioredis` quebre sob bundlers (Next.js/Turbopack).
 */
export function getScanRedisClient(): Redis {
    if (!redisClient) {
        redisClient = new Redis(scanRedisConnection());
    }
    return redisClient;
}

export function isAsyncScanEnabled(): boolean {
    return process.env.SCAN_ASYNC === 'true';
}

let scanQueue: Queue<ScanJobData> | null = null;

export function getScanQueue(): Queue<ScanJobData> | null {
    if (!isAsyncScanEnabled()) {
        return null;
    }
    if (!scanQueue) {
        scanQueue = new Queue<ScanJobData>(SCAN_QUEUE_NAME, {
            connection: getScanRedisClient(),
            defaultJobOptions: {
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { age: 86400 },
                removeOnFail: { age: 604800 },
            },
        });
    }
    return scanQueue;
}

export async function enqueueWebScan(data: {
    scanId: number;
    targetUrl: string;
    domain: string;
    userId?: number | null;
    targetId?: number | null;
}): Promise<string> {
    const queue = getScanQueue();
    if (!queue) {
        throw new Error('Fila de scans não habilitada. Defina SCAN_ASYNC=true.');
    }
    const job = await queue.add('web-scan', { kind: 'web', ...data });
    return job.id as string;
}