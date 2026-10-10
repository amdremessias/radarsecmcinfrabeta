import { getPool } from '../db';
import type { HarvestRunResult } from './theharvester';

export type HarvestScanStatus = 'completed' | 'failed' | 'timeout';

export function harvestStatusFromResult(result: HarvestRunResult): HarvestScanStatus {
    if (result.timedOut) return 'timeout';
    return result.success ? 'completed' : 'failed';
}

/**
 * Grava o resultado de uma execução do theHarvester em harvest_scans +
 * harvest_results, numa transação (evita leitura parcial no polling).
 */
export async function persistHarvestResult(scanId: number, result: HarvestRunResult): Promise<HarvestScanStatus> {
    const status = harvestStatusFromResult(result);
    const now = new Date();

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE harvest_scans
             SET status = $1,
                 result_count = $2,
                 counts = $3::jsonb,
                 evidence_status = $4,
                 source_status = $5::jsonb,
                 execution_time_ms = $6,
                 raw_stdout = $7,
                 raw_stderr = $8,
                 raw_jsonl = $9,
                 error = $10,
                 completed_at = $11,
                 updated_at = $11
             WHERE id = $12`,
            [
                status,
                result.resultCount,
                JSON.stringify(result.counts),
                result.evidenceStatus,
                JSON.stringify(result.sourceExecutions),
                result.executionTimeMs,
                result.stdout.slice(0, 200000),
                result.stderr.slice(0, 50000),
                result.jsonl.slice(0, 500000),
                result.error || null,
                now,
                scanId,
            ]
        );

        for (const finding of result.findings) {
            await client.query(
                `INSERT INTO harvest_results (scan_id, result_type, value, sources, details)
                 VALUES ($1, $2, $3, $4, $5::jsonb)`,
                [
                    scanId,
                    finding.resultType,
                    finding.value.slice(0, 2000),
                    finding.sources,
                    finding.details ? JSON.stringify(finding.details) : null,
                ]
            );
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    return status;
}
