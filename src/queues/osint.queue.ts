import { Queue } from 'bullmq';
import Redis from 'ioredis';

export type OsintJobData = {
    scanId: number;
    username: string;
    options?: {
        engine?: 'sherlock' | 'maigret';
        timeoutMs?: number;
        memory?: string;
        cpus?: string;
        requestTimeoutSec?: number;
        variations?: boolean;
        nsfw?: boolean;
        sites?: string[] | null;
        printAll?: boolean;
        allSites?: boolean;
        topSites?: number;
        extraArgs?: string[];
    };
};

export const OSINT_QUEUE_NAME = 'osint-scans';

export function osintRedisConnection(): Redis | any {
    const url = process.env.REDIS_URL;
    if (url) return { url };
    return {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        maxRetriesPerRequest: null,
    };
}

let redisClient: Redis | null = null;
export function getOsintRedisClient(): Redis {
    if (!redisClient) {
        redisClient = new Redis(osintRedisConnection());
    }
    return redisClient;
}

export function isOsintAsyncEnabled(): boolean {
    return process.env.OSINT_ASYNC === 'true' || process.env.SCAN_ASYNC === 'true';
}

let osintQueue: Queue<OsintJobData> | null = null;
export function getOsintQueue(): Queue<OsintJobData> | null {
    if (!isOsintAsyncEnabled()) {
        return null;
    }
    if (!osintQueue) {
        osintQueue = new Queue<OsintJobData>(OSINT_QUEUE_NAME, {
            connection: getOsintRedisClient(),
            defaultJobOptions: {
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { age: 86400 },
                removeOnFail: { age: 604800 },
            },
        });
    }
    return osintQueue;
}

export async function enqueueOsintScan(data: OsintJobData): Promise<string | null> {
    const queue = getOsintQueue();
    if (!queue) {
        return null;
    }
    const job = await queue.add('osint-scan', data);
    return job.id as string;
}
