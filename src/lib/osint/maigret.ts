import { runContainerCmd } from './container';
import type { SherlockOptions, SherlockResultSite, SherlockRunResult } from './sherlock';

export type MaigretOptions = SherlockOptions & {
    /** Usa todos os sites da base (flag -a). */
    allSites?: boolean;
    /** Nº de sites no escopo padrão (flag --top-sites, default 500). */
    topSites?: number;
};

export const MAIGRET_IMAGE = process.env.MAIGRET_IMAGE || 'soxoj/maigret:latest';

// [+] Site: https://...
// [-] Site: Not found!
// [!] mensagens de aviso/erro
//  ├─key: value   (dados extras extraídos do perfil)
//  └─key: value
const FOUND_RE = /^\[\+\]\s*(.+?):\s*(https?:\/\/\S+.*)$/;
const NOT_FOUND_RE = /^\[-\]\s*(.+?):\s*(.*)$/;
const DATA_RE = /^[├└]─\s*([^:]+?)\s*:\s*(.*)$/;
const SUMMARY_RE = /Search by username \S+ returned (\d+)\s+accounts?/i;

const MAX_DATA_FIELDS = 14;
const MAX_DATA_VALUE_LEN = 400;

export function parseMaigretOutput(stdout: string): {
    sitesTotal: number;
    sitesFound: number;
    reportedResults: number;
    sites: SherlockResultSite[];
} {
    const foundByUrl = new Map<string, string>(); // url -> siteName
    const foundSites = new Map<string, { url: string; data: Record<string, string> }>();
    const notFound = new Set<string>();
    let reportedResults = 0;

    const lines = stdout.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const found = line.match(FOUND_RE);
        if (found) {
            const url = found[2].trim();
            if (!foundByUrl.has(url)) {
                const siteName = found[1].trim();
                foundByUrl.set(url, siteName);
                foundSites.set(siteName, { url, data: {} });
            }
            continue;
        }

        const notFoundMatch = line.match(NOT_FOUND_RE);
        if (notFoundMatch) {
            // Só considera "não encontrado" quando a mensagem indica isso
            // (o Maigret imprime dicas "[−] ..." que não são sites).
            if (/not found/i.test(notFoundMatch[2] || '')) {
                notFound.add(notFoundMatch[1].trim());
            }
            continue;
        }

        const summary = line.match(SUMMARY_RE);
        if (summary) {
            reportedResults = parseInt(summary[1], 10) || 0;
        }
    }

    // Anexa dados extras (├─/└─) ao bloco do site encontrado anterior.
    let currentSite: string | null = null;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const found = trimmed.match(FOUND_RE);
        if (found) {
            currentSite = foundByUrl.get(found[2].trim()) ?? null;
            continue;
        }
        if (currentSite) {
            const dataMatch = trimmed.match(DATA_RE);
            if (dataMatch) {
                const site = foundSites.get(currentSite);
                const key = dataMatch[1].trim();
                const value = dataMatch[2].trim().slice(0, MAX_DATA_VALUE_LEN);
                if (site && key && value && Object.keys(site.data).length < MAX_DATA_FIELDS) {
                    site.data[key] = value;
                }
            }
        }
    }

    const sites: SherlockResultSite[] = [];
    const allNames = new Set<string>([...foundSites.keys(), ...notFound]);

    for (const name of allNames) {
        const foundEntry = foundSites.get(name);
        if (foundEntry) {
            sites.push({
                siteName: name,
                url: foundEntry.url,
                found: true,
                status: 'found',
                data: foundEntry.data,
            });
        } else {
            sites.push({ siteName: name, found: false, status: 'not_found' });
        }
    }

    return {
        sitesTotal: allNames.size,
        sitesFound: foundSites.size,
        reportedResults,
        sites,
    };
}

export async function runMaigret(username: string, opts: MaigretOptions = {}): Promise<SherlockRunResult> {
    const memory = opts.memory || process.env.SHERLOCK_MEMORY || '512m';
    const cpus = opts.cpus || process.env.SHERLOCK_CPUS || '1.0';
    const timeoutMs = opts.timeoutMs || Number(process.env.SHERLOCK_TIMEOUT_MS) || 900000;
    const requestTimeoutSec = opts.requestTimeoutSec || Number(process.env.SHERLOCK_REQUEST_TIMEOUT) || 30;
    const target = username.trim();

    const base: SherlockRunResult = {
        success: false,
        stdout: '',
        stderr: '',
        executionTimeMs: 0,
        sitesTotal: 0,
        sitesFound: 0,
        sites: [],
        variants: [target],
    };

    const cmd = [
        target,
        '--no-recursion',
        '--no-color',
        '--no-progressbar',
        '--no-autoupdate',
        '--timeout',
        String(requestTimeoutSec),
    ];

    if (opts.printAll !== false) {
        cmd.push('--print-not-found', '--print-errors');
    }

    if (opts.sites && opts.sites.length > 0) {
        for (const site of opts.sites) {
            if (site) cmd.push('--site', site);
        }
    } else if (opts.allSites) {
        cmd.push('-a');
    } else {
        cmd.push('--top-sites', String(opts.topSites || 500));
    }

    const container = await runContainerCmd({ image: MAIGRET_IMAGE, cmd, memory, cpus, timeoutMs });

    if (container.timedOut) {
        const parsed = parseMaigretOutput(container.stdout);
        return {
            ...base,
            success: false,
            timedOut: true,
            stdout: container.stdout,
            stderr: container.stderr,
            executionTimeMs: container.executionTimeMs,
            sitesTotal: parsed.sitesTotal,
            sitesFound: parsed.sitesFound,
            sites: parsed.sites,
            error: `Tempo limite de execução excedido (${Math.round(timeoutMs / 1000)}s).`,
        };
    }

    const parsed = parseMaigretOutput(container.stdout);

    return {
        success: container.exitCode === 0 && parsed.sitesTotal > 0,
        exitCode: container.exitCode,
        stdout: container.stdout,
        stderr: container.stderr,
        executionTimeMs: container.executionTimeMs,
        sitesTotal: parsed.sitesTotal,
        sitesFound: parsed.sitesFound,
        sites: parsed.sites,
        variants: [target],
        error:
            container.exitCode !== 0
                ? `O container Maigret encerrou com código ${container.exitCode}.`
                : undefined,
    };
}