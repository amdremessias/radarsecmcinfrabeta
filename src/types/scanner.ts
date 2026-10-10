export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Vulnerability {
    id: string;
    title: string;
    description: string;
    severity: Severity;
    cveId?: string;
    filePath?: string;
    lineNumber?: number;
    remediation?: string;
    toolName: string;
    rawDetails?: Record<string, any>;
}

export interface UnifiedScanResult {
    scanId: string;
    toolName: string;
    target: string;
    status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
    executionTimeMs: number;
    vulnerabilities: Vulnerability[];
    error?: string;
}

export interface ScanOptions {
    language?: string;
    querySuite?: string;
    timeoutMs?: number;
    extraArgs?: string[];
}

export interface ScannerMetadata {
    name: string;
    displayName: string;
    description: string;
    cliBinary: string;
}

export interface IScanner {
    metadata: ScannerMetadata;
    scan(target: string, options?: ScanOptions): Promise<UnifiedScanResult>;
}