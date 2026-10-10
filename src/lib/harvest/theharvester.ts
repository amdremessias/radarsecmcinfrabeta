import { runContainerCmd } from '../osint/container';
import { KEYLESS_SOURCES } from './sources';

/**
 * Integração com o theHarvester (v5.x) em container efêmero.
 *
 * Pontos importantes descobertos na imagem oficial:
 * - A imagem `ghcr.io/laramies/theharvester` tem ENTRYPOINT = `harvestview`
 *   (web app), então é obrigatório sobrescrever o entrypoint para o CLI.
 * - O CLI grava a saída estruturada em arquivo via `-f BASE` (BASE.json/.jsonl/.xml).
 *   Lemos o `.jsonl` (formato primário de automação) do container via archive.
 * - Fallback: se o arquivo não existir, fazemos parse das seções do stdout.
 */

export const HARVESTER_IMAGE = process.env.HARVESTER_IMAGE || 'ghcr.io/laramies/theharvester:latest';
export const HARVESTER_ENTRYPOINT = ['/opt/venv/bin/theHarvester'];

/** Caminho onde o theHarvester procura as credenciais (2º item de CONFIG_DIRS). */
export const HARVESTER_API_KEYS_PATH = '/etc/theHarvester/api-keys.yaml';

const REPORT_BASE = '/tmp/radar-harvest';
const REPORT_JSONL = `${REPORT_BASE}.jsonl`;

export type HarvestSourceExecution = {
    source: string;
    status: string;
    resultCount: number;
    errorType: string | null;
    stopReason: string | null;
    durationMs: number | null;
};

export type HarvestFinding = {
    /** hostname | email | ip | asn | url | person | breach | ... */
    resultType: string;
    value: string;
    sources: string[];
    details?: unknown;
};

export type HarvestOptions = {
    /** Fontes ou capacidades (`-b`). Vazio → conjunto keyless. */
    sources?: string[];
    /** Limite por fonte (`-l`). 0 = esgotar. */
    limit?: number;
    /** Fontes em paralelo (`-j`). */
    sourceWorkers?: number;
    /** Exclui hostnames (`--no-hosts`). */
    noHosts?: boolean;
    /** Suprime avisos de chave de API (`-q`). Default: true. */
    quiet?: boolean;
    timeoutMs?: number;
    memory?: string;
    cpus?: string;
    /** Habilita o uso de fontes com API (keyed) neste scan. */
    useApi?: boolean;
    /** Conteúdo do `api-keys.yaml` a injetar no container (modo com API). */
    apiKeysYaml?: string;
};

export type HarvestRunResult = {
    success: boolean;
    timedOut: boolean;
    target: string;
    findings: HarvestFinding[];
    counts: Record<string, number>;
    evidenceStatus: string | null;
    sourceExecutions: HarvestSourceExecution[];
    resultCount: number;
    stdout: string;
    stderr: string;
    jsonl: string;
    usedJsonl: boolean;
    executionTimeMs: number;
    exitCode: number | null;
    error?: string;
};

function clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(Math.max(Math.round(value), min), max);
}

export function buildHarvestArgs(target: string, opts: HarvestOptions = {}): string[] {
    const sources = opts.sources && opts.sources.length > 0 ? opts.sources : KEYLESS_SOURCES;
    const args = ['-d', target, '-b', sources.join(','), '-f', REPORT_BASE];
    args.push('-l', String(clampInt(opts.limit ?? 500, 0, 5000)));
    if (opts.sourceWorkers) args.push('-j', String(clampInt(opts.sourceWorkers, 1, 10)));
    if (opts.noHosts) args.push('--no-hosts');
    if (opts.quiet !== false) args.push('-q');
    return args;
}

/** Normaliza rótulos de seção do stdout para tipos canônicos. */
function normalizeResultType(label: string): string {
    const l = label.trim().toLowerCase().replace(/s$/, '');
    const map: Record<string, string> = {
        host: 'hostname',
        hostname: 'hostname',
        subdomain: 'hostname',
        email: 'email',
        ip: 'ip',
        url: 'url',
        people: 'person',
        person: 'person',
        'linkedin user': 'person',
        asn: 'asn',
        breach: 'breach',
        shodanhost: 'shodan',
        'shodan host': 'shodan',
        vhost: 'vhost',
        'virtual host': 'vhost',
    };
    return map[l] || l;
}

/**
 * Parser do `report.jsonl` do theHarvester v5.
 * Linha 1 = summary; demais linhas = achados `{ type, value, sources, ... }`.
 */
export function parseHarvestJsonl(text: string): {
    summary: any | null;
    findings: HarvestFinding[];
} {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let summary: any = null;
    const findings: HarvestFinding[] = [];

    for (const line of lines) {
        let obj: any;
        try {
            obj = JSON.parse(line);
        } catch {
            continue;
        }
        if (!obj || typeof obj !== 'object') continue;

        if (obj.type === 'summary') {
            summary = obj;
            continue;
        }
        if (typeof obj.type !== 'string' || obj.value === undefined || obj.value === null) continue;

        let value = typeof obj.value === 'string' ? obj.value : JSON.stringify(obj.value);
        let details: unknown = undefined;

        if (obj.observations || obj.details) {
            details = {
                ...(obj.observations ? { observations: obj.observations } : {}),
                ...(obj.details ? { details: obj.details } : {}),
            };
        }

        // `person` guarda um JSON serializado em `value`; extraímos nome exibível.
        if (obj.type === 'person' && typeof obj.value === 'string') {
            try {
                const parsed = JSON.parse(obj.value);
                if (parsed && typeof parsed === 'object') {
                    value = parsed.name || parsed.username || parsed.full_name || value;
                    details = { ...(details as object | undefined), person: parsed };
                }
            } catch {
                // mantém o valor cru
            }
        }

        findings.push({
            resultType: normalizeResultType(obj.type),
            value: value.slice(0, 2000),
            sources: Array.isArray(obj.sources) ? obj.sources.map(String) : [],
            details,
        });
    }

    return { summary, findings };
}

/**
 * Fallback: parse das seções do stdout (`[*] Hosts found: N` / `[*] No emails found.`).
 */
export function parseHarvestStdout(stdout: string): HarvestFinding[] {
    const findings: HarvestFinding[] = [];
    const lines = stdout.split(/\r?\n/);
    let current: string | null = null;

    for (const raw of lines) {
        const line = raw.replace(/\r$/, '');

        const headerMatch = line.match(/^\[\*\]\s+(.*?)\s+found(?::\s*(\d+))?\s*\.?\s*$/i);
        if (headerMatch) {
            const label = headerMatch[1].trim();
            if (/^no\b/i.test(label)) {
                current = null;
                continue;
            }
            current = normalizeResultType(label);
            continue;
        }

        if (/^\[\*\]/.test(line)) {
            current = null;
            continue;
        }
        if (/^[-\s]+$/.test(line)) continue;
        if (!line.trim()) {
            current = null;
            continue;
        }
        if (current) {
            findings.push({ resultType: current, value: line.trim(), sources: [] });
        }
    }

    return findings;
}

function buildCounts(findings: HarvestFinding[], summary: any): Record<string, number> {
    const counts: Record<string, number> = {};
    const raw = summary?.counts;
    if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) {
            const type = normalizeResultType(k);
            counts[type] = (counts[type] || 0) + (Number(v) || 0);
        }
    }
    if (Object.keys(counts).length === 0) {
        for (const f of findings) {
            counts[f.resultType] = (counts[f.resultType] || 0) + 1;
        }
    }
    return counts;
}

export async function runTheHarvester(target: string, opts: HarvestOptions = {}): Promise<HarvestRunResult> {
    const memory = opts.memory || process.env.HARVESTER_MEMORY || '1g';
    const cpus = opts.cpus || process.env.HARVESTER_CPUS || '1.0';
    const timeoutMs = opts.timeoutMs || Number(process.env.HARVESTER_TIMEOUT_MS) || 900000;

    const args = buildHarvestArgs(target, opts);

    const run = await runContainerCmd({
        image: HARVESTER_IMAGE,
        entrypoint: HARVESTER_ENTRYPOINT,
        cmd: args,
        memory,
        cpus,
        timeoutMs,
        artifacts: [REPORT_JSONL],
        injectFiles: opts.apiKeysYaml
            ? [{ path: HARVESTER_API_KEYS_PATH, content: opts.apiKeysYaml, mode: 0o644 }]
            : undefined,
    });

    const jsonlBuf = run.artifacts?.[REPORT_JSONL];
    const jsonl = jsonlBuf ? jsonlBuf.toString('utf8') : '';

    let findings: HarvestFinding[] = [];
    let summary: any = null;
    let usedJsonl = false;

    if (jsonl.trim()) {
        const parsed = parseHarvestJsonl(jsonl);
        findings = parsed.findings;
        summary = parsed.summary;
        usedJsonl = true;
    } else {
        findings = parseHarvestStdout(run.stdout);
    }

    const counts = buildCounts(findings, summary);
    const resultCount = typeof summary?.result_count === 'number' ? summary.result_count : findings.length;
    const evidenceStatus = typeof summary?.evidence_status === 'string' ? summary.evidence_status : null;

    const sourceExecutions: HarvestSourceExecution[] = Array.isArray(summary?.source_executions)
        ? summary.source_executions.map((s: any) => ({
              source: String(s?.source ?? ''),
              status: String(s?.status ?? ''),
              resultCount: Number(s?.result_count ?? 0),
              errorType: s?.error_type ?? null,
              stopReason: s?.stop_reason ?? null,
              durationMs: typeof s?.duration_ms === 'number' ? s.duration_ms : null,
          }))
        : [];

    // Sucesso = não estourou timeout e (geramos JSONL OU achamos algo OU exit code 0).
    const success = !run.timedOut && (usedJsonl || findings.length > 0 || run.exitCode === 0);

    return {
        success,
        timedOut: run.timedOut,
        target,
        findings,
        counts,
        evidenceStatus,
        sourceExecutions,
        resultCount,
        stdout: run.stdout,
        stderr: run.stderr,
        jsonl,
        usedJsonl,
        executionTimeMs: run.executionTimeMs,
        exitCode: run.exitCode,
        error: run.timedOut
            ? `Tempo limite excedido (${timeoutMs}ms).`
            : run.exitCode && run.exitCode !== 0 && !usedJsonl
              ? `theHarvester terminou com código ${run.exitCode}.`
              : undefined,
    };
}
