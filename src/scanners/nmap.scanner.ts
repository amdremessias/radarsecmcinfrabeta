import { IScanner, ScanOptions, UnifiedScanResult, Vulnerability } from '../types/scanner';
import { execa } from 'execa';
import { parseStringPromise } from 'xml2js';
import { randomUUID } from 'node:crypto';

export class NmapScanner implements IScanner {
    public readonly metadata = {
        name: 'nmap',
        displayName: 'Nmap',
        description: 'Mapeamento de rede e identificação de portas e serviços expostos.',
        cliBinary: 'nmap',
    };

    private readonly toolName = 'Nmap';

    public async scan(target: string, options: ScanOptions = {}): Promise<UnifiedScanResult> {
        const startTime = Date.now();
        const scanId = randomUUID();
        const timeoutMs = options.timeoutMs || 3 * 60 * 1000;

        try {
            const { stdout } = await execa(
                'nmap',
                ['-sV', '-oX', '-', target, ...(options.extraArgs || [])],
                { timeout: timeoutMs }
            );

            const vulnerabilities = await this.parseNmapXml(stdout);

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

    private async parseNmapXml(xmlContent: string): Promise<Vulnerability[]> {
        if (!xmlContent) return [];

        const parsed = await parseStringPromise(xmlContent);
        const vulnerabilities: Vulnerability[] = [];
        const hosts = parsed.nmaprun?.host || [];

        for (const host of hosts) {
            const ports = host.ports?.[0]?.port || [];

            for (const portObj of ports) {
                const state = portObj.state?.[0]?.$?.state;
                if (state !== 'open') continue;

                const portId = portObj.$?.portid;
                const protocol = portObj.$?.protocol;
                const service = portObj.service?.[0]?.$?.name || 'unknown';
                const product = portObj.service?.[0]?.$?.product || '';
                const version = portObj.service?.[0]?.$?.version || '';

                vulnerabilities.push({
                    id: `PORT-${portId}-${String(protocol || 'tcp').toUpperCase()}`,
                    title: `Porta Aberta: ${portId}/${String(protocol || 'tcp').toUpperCase()} (${service})`,
                    description: `Serviço detectado: ${product} ${version}`.trim(),
                    severity: 'LOW',
                    toolName: this.toolName,
                    rawDetails: {
                        port: portId,
                        protocol,
                        service,
                        product,
                        version,
                    },
                });
            }
        }

        return vulnerabilities;
    }
}