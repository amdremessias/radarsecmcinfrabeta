import { IScanner, ScanOptions, UnifiedScanResult, Vulnerability } from '../types/scanner';
import { SarifParser } from '../parsers/sarif.parser';
import { execa } from 'execa';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

export class CodeQLScanner implements IScanner {
    public readonly metadata = {
        name: 'codeql',
        displayName: 'CodeQL',
        description: 'Análise estática (SAST) via CodeQL CLI com saída SARIF.',
        cliBinary: 'codeql',
    };

    private readonly toolName = 'CodeQL';

    public async scan(targetPath: string, options: ScanOptions = {}): Promise<UnifiedScanResult> {
        const startTime = Date.now();
        const scanId = randomUUID();

        const language = options.language || 'javascript';
        const timeoutMs = options.timeoutMs || 10 * 60 * 1000;
        const querySuite = options.querySuite || `${language}-security-extended.qls`;

        const tmpDir = path.join(os.tmpdir(), `radar_codeql_${scanId}`);
        const dbPath = path.join(tmpDir, 'codeql-db');
        const sarifOutputPath = path.join(tmpDir, 'results.sarif');

        try {
            await fs.mkdir(tmpDir, { recursive: true });

            await execa(
                'codeql',
                [
                    'database',
                    'create',
                    dbPath,
                    `--language=${language}`,
                    `--source-root=${targetPath}`,
                    '--overwrite',
                ],
                { timeout: timeoutMs }
            );

            await execa(
                'codeql',
                [
                    'database',
                    'analyze',
                    dbPath,
                    querySuite,
                    '--format=sarif-latest',
                    `--output=${sarifOutputPath}`,
                    ...(options.extraArgs || []),
                ],
                { timeout: timeoutMs }
            );

            const sarifRawContent = await fs.readFile(sarifOutputPath, 'utf-8');
            const vulnerabilities: Vulnerability[] = SarifParser.parse(sarifRawContent, this.toolName);

            return {
                scanId,
                toolName: this.toolName,
                target: targetPath,
                status: 'SUCCESS',
                executionTimeMs: Date.now() - startTime,
                vulnerabilities,
            };
        } catch (error: any) {
            return {
                scanId,
                toolName: this.toolName,
                target: targetPath,
                status: error?.timedOut || error?.killed ? 'TIMEOUT' : 'FAILED',
                executionTimeMs: Date.now() - startTime,
                vulnerabilities: [],
                error: error?.message || String(error),
            };
        } finally {
            try {
                await fs.rm(tmpDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error(`[CodeQLScanner] Erro na limpeza temporária: ${tmpDir}`, cleanupError);
            }
        }
    }
}