import { IScanner, ScanOptions, UnifiedScanResult, Vulnerability } from '../types/scanner';
import { execa } from 'execa';
import { randomUUID } from 'node:crypto';

export class TrivyScanner implements IScanner {
    public readonly metadata = {
        name: 'trivy',
        displayName: 'Trivy',
        description: 'Varredura de vulnerabilidades em sistemas de arquivos, imagens e dependências.',
        cliBinary: 'trivy',
    };

    private readonly toolName = 'Trivy';

    public async scan(target: string, options: ScanOptions = {}): Promise<UnifiedScanResult> {
        const startTime = Date.now();
        const scanId = randomUUID();
        const timeoutMs = options.timeoutMs || 5 * 60 * 1000;

        try {
            const { stdout } = await execa(
                'trivy',
                ['fs', '--format', 'json', target, ...(options.extraArgs || [])],
                { timeout: timeoutMs }
            );

            const vulnerabilities = this.parseTrivyJson(stdout);

            return {
                scanId,
                toolName: this.toolName,
                target,
                status: 'SUCCESS',
                executionTimeMs: Date.now() - startTime,
                vulnerabilities,
            };
        } catch (error: any) {
            return {
                scanId,
                toolName: this.toolName,
                target,
                status: error?.timedOut || error?.killed ? 'TIMEOUT' : 'FAILED',
                executionTimeMs: Date.now() - startTime,
                vulnerabilities: [],
                error: error?.message || String(error),
            };
        }
    }

    private parseTrivyJson(jsonContent: string): Vulnerability[] {
        if (!jsonContent) return [];

        const parsed = JSON.parse(jsonContent);
        const vulnerabilities: Vulnerability[] = [];
        const results = parsed.Results || [];

        for (const result of results) {
            const vulns = result.Vulnerabilities || [];
            for (const item of vulns) {
                vulnerabilities.push({
                    id: item.VulnerabilityID || 'UNKNOWN_VULN',
                    title: item.Title || item.VulnerabilityID,
                    description: item.Description || 'Sem descrição.',
                    severity: this.mapSeverity(item.Severity),
                    cveId: item.VulnerabilityID?.startsWith('CVE-') ? item.VulnerabilityID : undefined,
                    filePath: result.Target,
                    remediation: item.FixedVersion ? `Atualizar para a versão ${item.FixedVersion}` : undefined,
                    toolName: this.toolName,
                    rawDetails: {
                        pkgName: item.PkgName,
                        installedVersion: item.InstalledVersion,
                        primaryURL: item.PrimaryURL,
                    },
                });
            }
        }

        return vulnerabilities;
    }

    private mapSeverity(trivySeverity: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
        switch (trivySeverity?.toUpperCase()) {
            case 'CRITICAL':
                return 'CRITICAL';
            case 'HIGH':
                return 'HIGH';
            case 'MEDIUM':
                return 'MEDIUM';
            case 'LOW':
            default:
                return 'LOW';
        }
    }
}