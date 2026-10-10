import { getPool } from '../db';
import type { SherlockRunResult } from './sherlock';

export type OsintScanStatus = 'completed' | 'failed' | 'timeout';

export function statusFromResult(result: SherlockRunResult): OsintScanStatus {
    if (result.timedOut) return 'timeout';
    return result.success ? 'completed' : 'failed';
}

/**
 * Grava o resultado de uma execução OSINT (Sherlock/Maigret) em
 * osint_scans + osint_scan_results.
 *
 * Usado tanto pelo worker (assíncrono) quanto pelo fallback síncrono da API.
 * Tudo é feito numa transação para que leitores só vejam o scan como
 * concluído depois que todos os resultados estiverem gravados (evita leitura
 * parcial durante o polling).
 */
export async function persistSherlockResult(scanId: number, result: SherlockRunResult): Promise<OsintScanStatus> {
    const status = statusFromResult(result);
    const sitesTotal = result.sitesTotal || result.sites.length;
    const sitesFound = result.sitesFound || result.sites.filter((s) => s.found).length;
    const successRate = sitesTotal > 0 ? Number(((sitesFound / sitesTotal) * 100).toFixed(2)) : 0;
    const now = new Date();

    const client = await getPool().connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `UPDATE osint_scans
             SET status = $1,
                 sites_total = $2,
                 sites_found = $3,
                 success_rate = $4,
                 execution_time_ms = $5,
                 raw_stdout = $6,
                 raw_stderr = $7,
                 error = $8,
                 completed_at = $9,
                 updated_at = $9
             WHERE id = $10`,
            [
                status,
                sitesTotal,
                sitesFound,
                successRate,
                result.executionTimeMs,
                result.stdout.slice(0, 200000),
                result.stderr.slice(0, 50000),
                result.error || null,
                now,
                scanId,
            ]
        );

        for (const site of result.sites) {
            await client.query(
                `INSERT INTO osint_scan_results (scan_id, site_name, url, found, status, message, matched_username, data)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
                [
                    scanId,
                    site.siteName,
                    site.url || null,
                    site.found,
                    site.status,
                    site.message || null,
                    site.matchedUsername || null,
                    site.data ? JSON.stringify(site.data) : null,
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