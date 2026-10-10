import { query } from '../db';
import { decryptSecret, encryptSecret } from './crypto';

/**
 * Integração modular com as APIs do theHarvester (fontes "keyed").
 *
 * O theHarvester lê as credenciais de `api-keys.yaml` no formato:
 *
 *   apikeys:
 *     shodan:
 *       key: "..."
 *     fofa:
 *       key: "..."
 *       email: "..."
 *
 * Aqui as chaves ficam cifradas no Postgres e só são decifradas em tempo de
 * execução (no worker) para montar esse YAML, que é injetado no container.
 * O uso é controlado por um flag global (env HARVESTER_API_ENABLED) e por um
 * flag por scan (`useApi`).
 */

export type HarvestKeyField = { name: string; label: string };

export type HarvestKeyProvider = {
    id: string;
    label: string;
    /** Fonte equivalente no `-b` do theHarvester (quando difere do id). */
    source?: string;
    fields: HarvestKeyField[];
};

const KEY_FIELD: HarvestKeyField[] = [{ name: 'key', label: 'API Key' }];

const PROVIDER_LIST: Array<{ id: string; label: string; source?: string; fields?: HarvestKeyField[] }> = [
    { id: 'bevigil', label: 'BeVigil' },
    { id: 'brave', label: 'Brave Search' },
    { id: 'bufferoverun', label: 'BufferOverrun' },
    { id: 'builtwith', label: 'BuiltWith' },
    { id: 'censys', label: 'Censys', fields: [{ name: 'token', label: 'API Token' }] },
    { id: 'criminalip', label: 'Criminal IP' },
    { id: 'dehashed', label: 'DeHashed' },
    { id: 'dnsdb', label: 'DNSDB' },
    { id: 'dnsdumpster', label: 'DNSDumpster' },
    { id: 'dymo', label: 'Dymo' },
    { id: 'fofa', label: 'FOFA', fields: [{ name: 'key', label: 'API Key' }, { name: 'email', label: 'E-mail' }] },
    { id: 'fullhunt', label: 'FullHunt' },
    { id: 'github', label: 'GitHub', source: 'github-code' },
    { id: 'hackertarget', label: 'HackerTarget' },
    { id: 'hibpverified', label: 'HIBP Verified' },
    { id: 'hunter', label: 'Hunter.io', source: 'hunter' },
    { id: 'hunterhow', label: 'Hunter.how' },
    { id: 'intelx', label: 'Intelligence X' },
    { id: 'jsmon', label: 'JSMon' },
    { id: 'leakix', label: 'LeakIX' },
    { id: 'leaklookup', label: 'Leak-Lookup' },
    { id: 'mojeek', label: 'Mojeek' },
    { id: 'netlas', label: 'Netlas' },
    { id: 'onyphe', label: 'Onyphe' },
    { id: 'pentestTools', label: 'Pentest-Tools.com', source: 'pentesttools' },
    { id: 'projectDiscovery', label: 'ProjectDiscovery', source: 'projectdiscovery' },
    { id: 'rocketreach', label: 'RocketReach' },
    { id: 'routeviews', label: 'RouteViews' },
    { id: 'securityTrails', label: 'SecurityTrails' },
    { id: 'securityscorecard', label: 'SecurityScorecard' },
    { id: 'sherlockeye', label: 'SherlockEye' },
    { id: 'shodan', label: 'Shodan' },
    { id: 'tomba', label: 'Tomba', fields: [{ name: 'key', label: 'API Key' }, { name: 'secret', label: 'Secret' }] },
    { id: 'virustotal', label: 'VirusTotal' },
    { id: 'whoisxml', label: 'WhoisXML' },
    { id: 'windvane', label: 'Windvane' },
    { id: 'zoomeye', label: 'ZoomEye' },
];

export const HARVEST_KEY_PROVIDERS: HarvestKeyProvider[] = PROVIDER_LIST.map((p) => ({
    id: p.id,
    label: p.label,
    source: p.source,
    fields: p.fields || KEY_FIELD,
}));

const PROVIDER_BY_ID = new Map(HARVEST_KEY_PROVIDERS.map((p) => [p.id, p]));

export function getKeyProvider(id: string): HarvestKeyProvider | undefined {
    return PROVIDER_BY_ID.get(id);
}

/** Flag global: a integração com APIs está habilitada neste deploy? */
export function isHarvestApiEnabled(): boolean {
    return process.env.HARVESTER_API_ENABLED === 'true';
}

export type HarvestApiKeyMeta = {
    provider: string;
    label: string;
    enabled: boolean;
    updatedAt: string | null;
    /** Campos com o valor mascarado (nunca o segredo em claro). */
    fields: Record<string, string>;
};

function maskValue(value: string): string {
    const v = String(value ?? '');
    if (v.length <= 4) return '••••';
    return `••••${v.slice(-4)}`;
}

/** Lista as chaves cadastradas (para a UI), com valores mascarados. */
export async function listApiKeyMeta(): Promise<HarvestApiKeyMeta[]> {
    const rows = await query(
        `SELECT provider, secret, enabled, updated_at AS "updatedAt" FROM harvest_api_keys ORDER BY provider ASC`
    );

    const out: HarvestApiKeyMeta[] = [];
    for (const row of rows as any[]) {
        let fields: Record<string, string> = {};
        try {
            const parsed = JSON.parse(decryptSecret(row.secret));
            if (parsed && typeof parsed === 'object') fields = parsed;
        } catch {
            // chave corrompida/segredo trocado — reporta sem valores
        }
        const masked: Record<string, string> = {};
        for (const [k, v] of Object.entries(fields)) masked[k] = maskValue(String(v));
        out.push({
            provider: row.provider,
            label: getKeyProvider(row.provider)?.label || row.provider,
            enabled: Boolean(row.enabled),
            updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
            fields: masked,
        });
    }
    return out;
}

export type SaveApiKeyInput = {
    provider: string;
    fields: Record<string, string>;
    enabled?: boolean;
    userId?: number | string | null;
};

export async function saveApiKey(input: SaveApiKeyInput): Promise<void> {
    const provider = getKeyProvider(input.provider);
    if (!provider) throw new Error(`Provedor desconhecido: ${input.provider}`);

    const fields: Record<string, string> = {};
    for (const f of provider.fields) {
        const value = String(input.fields?.[f.name] ?? '').trim();
        if (value) fields[f.name] = value;
    }
    const missing = provider.fields.filter((f) => !fields[f.name]);
    if (missing.length > 0) {
        throw new Error(`Campos obrigatórios: ${missing.map((f) => f.label).join(', ')}.`);
    }

    const secret = encryptSecret(JSON.stringify(fields));
    await query(
        `INSERT INTO harvest_api_keys (provider, secret, enabled, user_id, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (provider) DO UPDATE
             SET secret = EXCLUDED.secret,
                 enabled = EXCLUDED.enabled,
                 user_id = EXCLUDED.user_id,
                 updated_at = now()`,
        [provider.id, secret, input.enabled !== false, input.userId ?? null]
    );
}

export async function setApiKeyEnabled(provider: string, enabled: boolean): Promise<void> {
    await query(`UPDATE harvest_api_keys SET enabled = $1, updated_at = now() WHERE provider = $2`, [
        enabled,
        provider,
    ]);
}

export async function deleteApiKey(provider: string): Promise<void> {
    await query(`DELETE FROM harvest_api_keys WHERE provider = $1`, [provider]);
}

export type ApiKeyEntry = { provider: string; fields: Record<string, string> };

/** Serializa entradas no formato `api-keys.yaml` esperado pelo theHarvester. */
export function buildApiKeysYaml(entries: ApiKeyEntry[]): string | null {
    const valid = entries.filter((e) => e.provider && e.fields && Object.keys(e.fields).length > 0);
    if (valid.length === 0) return null;

    const lines = ['apikeys:'];
    for (const entry of valid) {
        lines.push(`  ${entry.provider}:`);
        for (const [field, value] of Object.entries(entry.fields)) {
            // JSON.stringify produz um escalar YAML válido (string entre aspas).
            lines.push(`    ${field}: ${JSON.stringify(String(value))}`);
        }
    }
    return lines.join('\n') + '\n';
}

/** Lê as chaves habilitadas do banco, decifra e monta o YAML. */
export async function loadApiKeysYaml(): Promise<string | null> {
    const rows = await query(`SELECT provider, secret FROM harvest_api_keys WHERE enabled = TRUE`);
    const entries: ApiKeyEntry[] = [];
    for (const row of rows as any[]) {
        try {
            const fields = JSON.parse(decryptSecret(row.secret));
            if (fields && typeof fields === 'object') entries.push({ provider: row.provider, fields });
        } catch {
            // ignora entradas corrompidas
        }
    }
    return buildApiKeysYaml(entries);
}

/**
 * Resolve o YAML de chaves para um scan, respeitando o flag global e o flag
 * por scan. Retorna `null` quando não deve injetar chaves (modo keyless).
 */
export async function resolveHarvestApiKeysYaml(useApi?: boolean): Promise<string | null> {
    if (!useApi || !isHarvestApiEnabled()) return null;
    return loadApiKeysYaml();
}
