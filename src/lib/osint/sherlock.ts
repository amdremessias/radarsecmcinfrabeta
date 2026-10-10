import { parseMemoryToBytes, parseCpusToNano, runContainerCmd } from './container';

export type SherlockOptions = {
    /** Limite total de execução do container (wall-clock), em ms. */
    timeoutMs?: number;
    /** Limite de memória do container (ex.: "512m"). */
    memory?: string;
    /** Limite de CPU do container (ex.: "1.0"). */
    cpus?: string;
    /** Timeout por requisição de site, em segundos (flag --timeout do Sherlock). */
    requestTimeoutSec?: number;
    /** Testa variações do username trocando separadores por _ - . (flag {?}). */
    variations?: boolean;
    /** Inclui sites NSFW da lista padrão (flag --nsfw). */
    nsfw?: boolean;
    /** Restringe a busca a estes sites (flags --site repetidas). null/[] = todos. */
    sites?: string[] | null;
    /** true (padrão) usa --print-all (retorna também não encontrados). */
    printAll?: boolean;
    extraArgs?: string[];
};

export type SherlockResultSite = {
    siteName: string;
    url?: string;
    found: boolean;
    status: 'found' | 'not_found' | 'error' | 'unknown';
    message?: string;
    /** Qual variação do username casou (quando variations=true). */
    matchedUsername?: string;
    /** Dados extras extraídos do perfil (nome, bio, foto etc. — engine Maigret). */
    data?: Record<string, string>;
};

export type SherlockRunResult = {
    success: boolean;
    timedOut?: boolean;
    stdout: string;
    stderr: string;
    executionTimeMs: number;
    sitesTotal: number;
    sitesFound: number;
    sites: SherlockResultSite[];
    variants: string[];
    exitCode?: number | null;
    error?: string;
};

export const SHERLOCK_IMAGE = process.env.SHERLOCK_IMAGE || 'sherlock/sherlock:latest';

// [*] Checking username foo on:
// [+] GitHub: https://github.com/foo
// [-] Instagram: Not Found!
// [?] Site: Error message
const FOUND_RE = /^\[\+\]\s*(.+?):\s*(https?:\/\/\S+.*)$/;
const NOT_FOUND_RE = /^\[-\]\s*(.+?):\s*(.*)$/;
const ERROR_RE = /^\[\?\]\s*(.+?):\s*(.*)$/;
const SUMMARY_RE = /Search completed with (\d+)\s+results?/i;

const VARIATION_SYMBOLS = ['_', '-', '.'];

/**
 * Monta o username alvo e a lista de variações.
 * Ex.: "joao.silva" + variations => alvo "joao{?}silva",
 * variações ["joao_silva", "joao-silva", "joao.silva"].
 */
export function buildUsernameTarget(username: string, variations?: boolean): {
    target: string;
    variants: string[];
} {
    const base = username.trim();
    if (!variations || !/[._-]/.test(base)) {
        return { target: base, variants: [base] };
    }
    const target = base.replace(/[._-]+/g, '{?}');
    const variants = VARIATION_SYMBOLS.map((sym) => target.replace(/\{\?\}/g, sym));
    return { target, variants };
}

function matchVariant(url: string, variants: string[]): string | undefined {
    if (variants.length <= 1) return undefined;
    const lower = url.toLowerCase();
    let best: string | undefined;
    for (const v of variants) {
        if (v && lower.includes(v.toLowerCase())) {
            if (!best || v.length > best.length) best = v;
        }
    }
    return best;
}

export function parseSherlockOutput(
    stdout: string,
    variants: string[] = []
): {
    sitesTotal: number;
    sitesFound: number;
    reportedResults: number;
    sites: SherlockResultSite[];
} {
    type Agg = { foundUrls: string[]; notFound: boolean; error?: string };
    const aggs = new Map<string, Agg>();
    const order: string[] = [];
    let reportedResults = 0;

    const getAgg = (name: string): Agg => {
        let agg = aggs.get(name);
        if (!agg) {
            agg = { foundUrls: [], notFound: false };
            aggs.set(name, agg);
            order.push(name);
        }
        return agg;
    };

    for (const raw of stdout.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;

        const found = line.match(FOUND_RE);
        if (found) {
            const agg = getAgg(found[1].trim());
            const url = found[2].trim();
            if (!agg.foundUrls.includes(url)) agg.foundUrls.push(url);
            continue;
        }

        const notFound = line.match(NOT_FOUND_RE);
        if (notFound) {
            getAgg(notFound[1].trim()).notFound = true;
            continue;
        }

        const errored = line.match(ERROR_RE);
        if (errored) {
            const agg = getAgg(errored[1].trim());
            agg.error = errored[2].trim() || agg.error;
            continue;
        }

        const summary = line.match(SUMMARY_RE);
        if (summary) {
            reportedResults = parseInt(summary[1], 10) || 0;
        }
    }

    const sites: SherlockResultSite[] = [];
    let sitesFound = 0;

    for (const name of order) {
        const agg = aggs.get(name)!;
        if (agg.foundUrls.length > 0) {
            sitesFound++;
            for (const url of agg.foundUrls) {
                sites.push({
                    siteName: name,
                    url,
                    found: true,
                    status: 'found',
                    matchedUsername: matchVariant(url, variants),
                });
            }
        } else {
            sites.push({
                siteName: name,
                found: false,
                status: agg.error ? 'error' : 'not_found',
                message: agg.error,
            });
        }
    }

    return { sitesTotal: order.length, sitesFound, reportedResults, sites };
}

export async function runSherlock(username: string, opts: SherlockOptions = {}): Promise<SherlockRunResult> {
    const memory = opts.memory || process.env.SHERLOCK_MEMORY || '512m';
    const cpus = opts.cpus || process.env.SHERLOCK_CPUS || '1.0';
    const timeoutMs = opts.timeoutMs || Number(process.env.SHERLOCK_TIMEOUT_MS) || 900000;
    const requestTimeoutSec = opts.requestTimeoutSec || Number(process.env.SHERLOCK_REQUEST_TIMEOUT) || 30;

    const { target, variants } = buildUsernameTarget(username, opts.variations);

    const base: SherlockRunResult = {
        success: false,
        stdout: '',
        stderr: '',
        executionTimeMs: 0,
        sitesTotal: 0,
        sitesFound: 0,
        sites: [],
        variants,
    };

    const cmd = [target, '--timeout', String(requestTimeoutSec), '--no-color', '--no-txt'];
    cmd.push(opts.printAll === false ? '--print-found' : '--print-all');
    if (opts.nsfw) cmd.push('--nsfw');
    for (const site of opts.sites ?? []) {
        if (site) cmd.push('--site', site);
    }
    cmd.push(...(opts.extraArgs || []).filter(Boolean));

    const container = await runContainerCmd({
        image: SHERLOCK_IMAGE,
        cmd,
        memory,
        cpus,
        timeoutMs,
    });

    if (container.timedOut) {
        const parsed = parseSherlockOutput(container.stdout, variants);
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

    const parsed = parseSherlockOutput(container.stdout, variants);

    return {
        success: container.exitCode === 0 && parsed.sitesTotal > 0,
        exitCode: container.exitCode,
        stdout: container.stdout,
        stderr: container.stderr,
        executionTimeMs: container.executionTimeMs,
        sitesTotal: parsed.sitesTotal,
        sitesFound: parsed.sitesFound,
        sites: parsed.sites,
        variants,
        error:
            container.exitCode !== 0
                ? `O container Sherlock encerrou com código ${container.exitCode}.`
                : undefined,
    };
}

// Re-exports compatíveis (helpers de recursos)
export { parseMemoryToBytes, parseCpusToNano };