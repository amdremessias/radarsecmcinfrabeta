import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { HarvestOptions } from '../lib/harvest/theharvester';

export type HarvestJobData = {
    scanId: number;
    target: string;
    options?: HarvestOptions;
};

export const HARVEST_QUEUE_NAME = 'harvest-scans';

// Reaproveita a mesma configuração de conexão usada pela fila OSINT.
export function harvestRedisConnection(): Redis | any {
    const url = process.env.REDIS_URL;
    if (url) return { url };
    return {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        maxRetriesPerRequest: null,
    };
}

let redisClient: Redis | null = null;
export function getHarvestRedisClient(): Redis {
    if (!redisClient) {
        redisClient = new Redis(harvestRedisConnection());
    }
    return redisClient;
}

export function isHarvestAsyncEnabled(): boolean {
    return process.env.OSINT_ASYNC === 'true' || process.env.SCAN_ASYNC === 'true';
}

let harvestQueue: Queue<HarvestJobData> | null = null;
export function getHarvestQueue(): Queue<HarvestJobData> | null {
    if (!isHarvestAsyncEnabled()) {
        return null;
    }
    if (!harvestQueue) {
        harvestQueue = new Queue<HarvestJobData>(HARVEST_QUEUE_NAME, {
            connection: getHarvestRedisClient(),
            defaultJobOptions: {
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { age: 86400 },
                removeOnFail: { age: 604800 },
            },
        });
    }
    return harvestQueue;
}

export async function enqueueHarvestScan(data: HarvestJobData): Promise<string | null> {
    const queue = getHarvestQueue();
    if (!queue) {
        return null;
    }
    const job = await queue.add('harvest-scan', data);
    return job.id as string;
}
