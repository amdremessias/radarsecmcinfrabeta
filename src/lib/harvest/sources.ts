/**
 * Fontes do theHarvester.
 *
 * O theHarvester aceita tanto nomes de fontes (`crtsh`, `certspotter`, ...)
 * quanto "capacidades" (`subdomains`, `emails`, `ips`, `urls`, `people`,
 * `breaches`, `all`). Nesta primeira versão priorizamos fontes PASSIVAS (P0)
 * que NÃO exigem chave de API.
 */

/** Fontes passivas que não requerem chave de API (base segura). */
export const KEYLESS_SOURCES = [
    'crtsh',
    'certspotter',
    'commoncrawl',
    'otx',
    'rapiddns',
    'urlscan',
    'waybackarchive',
    'hudsonrock',
    'sourcegraph',
    'gitlab',
    'thc',
    'subdomaincenter',
    'shodanct',
    'crt-name',
    'arquivo',
    'apis-guru',
    'subdomainapi',
    'baidu',
    'yahoo',
    'duckduckgo',
    'mojeek',
    'robtex',
    'haveibeenpwned',
];

/**
 * Fontes passivas (P0) que EXIGEM chave de API (fontes "keyed").
 *
 * Excluímos as classes DNS (P1) e DIRECT (P2) — `shodan`, `pentesttools` e
 * `criminalip` — para manter o módulo no escopo passivo. Cada nome corresponde
 * a uma fonte aceita no `-b` do theHarvester; as credenciais são cadastradas
 * por provedor (ver `keys.ts`).
 */
export const KEYED_SOURCES = [
    'bevigil',
    'brave',
    'bufferoverun',
    'builtwith',
    'censys',
    'dehashed',
    'dnsdb',
    'dnsdumpster',
    'dymo',
    'fofa',
    'fullhunt',
    'github-code',
    'hackertarget',
    'hibpverified',
    'hunter',
    'hunterhow',
    'intelx',
    'jsmon',
    'leakix',
    'leaklookup',
    'mojeek',
    'netlas',
    'onyphe',
    'projectdiscovery',
    'rocketreach',
    'securityTrails',
    'securityscorecard',
    'sherlockeye',
    'tomba',
    'virustotal',
    'whoisxml',
    'windvane',
    'zoomeye',
];

/** União (sem duplicatas) das fontes passivas keyless e keyed. */
export const ALL_PASSIVE_SOURCES = Array.from(new Set([...KEYLESS_SOURCES, ...KEYED_SOURCES]));

export type HarvestPreset = {
    id: string;
    label: string;
    description: string;
    sources: string[];
    /** Requer a integração de API habilitada (chaves cadastradas + flag). */
    requiresApi?: boolean;
};

export const HARVEST_PRESETS: HarvestPreset[] = [
    {
        id: 'keyless',
        label: 'Passivo keyless (recomendado)',
        description: 'Fontes P0 sem chave de API. Não contata o alvo diretamente.',
        sources: KEYLESS_SOURCES,
    },
    {
        id: 'certificates',
        label: 'Certificados (CT)',
        description: 'Certificate Transparency: subdomínios a partir de certificados emitidos.',
        sources: ['crtsh', 'certspotter', 'crt-name', 'arquivo'],
    },
    {
        id: 'search',
        label: 'Buscadores / indexadores',
        description: 'DuckDuckGo, Yahoo, Baidu, Mojeek, CommonCrawl e SourceGraph.',
        sources: ['duckduckgo', 'yahoo', 'baidu', 'mojeek', 'commoncrawl', 'sourcegraph'],
    },
    {
        id: 'dns',
        label: 'DNS / subdomínios',
        description: 'Datasets de DNS passivos (RapidDNS, SubdomainCenter, THC, Robtex...) e urlscan.',
        sources: ['rapiddns', 'subdomaincenter', 'thc', 'subdomainapi', 'robtex', 'urlscan', 'waybackarchive'],
    },
    {
        id: 'keyed',
        label: 'Somente fontes com API (keyed)',
        description: 'Fontes P0 que exigem chave de API cadastrada. Requer a integração habilitada.',
        sources: KEYED_SOURCES,
        requiresApi: true,
    },
    {
        id: 'all-passive',
        label: 'Passivo completo (keyless + API)',
        description: 'Todas as fontes passivas: keyless + as que exigem chave de API. Requer a integração habilitada.',
        sources: ALL_PASSIVE_SOURCES,
        requiresApi: true,
    },
];

/** Capacidades aceitas diretamente pelo `-b` (podem incluir fontes com chave). */
export const HARVEST_CAPABILITIES = [
    'subdomains',
    'emails',
    'ips',
    'asns',
    'urls',
    'people',
    'breaches',
    'all',
];

const PRESET_BY_ID = new Map(HARVEST_PRESETS.map((p) => [p.id, p]));

export function getHarvestPreset(id?: string): HarvestPreset | undefined {
    return id ? PRESET_BY_ID.get(id) : undefined;
}

/** O preset exige a integração de API (fontes keyed)? */
export function presetRequiresApi(id?: string): boolean {
    return Boolean(id && PRESET_BY_ID.get(id)?.requiresApi);
}

export const MAX_CUSTOM_SOURCES = 40;

/**
 * Resolve a lista final de fontes/capacidades a passar em `-b`.
 * - preset 'custom' → usa as fontes informadas;
 * - qualquer outro preset conhecido → usa a lista do preset;
 * - preset desconhecido → cai no keyless.
 */
export function resolveHarvestSources(presetId: string | undefined, custom: string[]): string[] {
    const cleanCustom = custom.map((s) => s.trim()).filter(Boolean).slice(0, MAX_CUSTOM_SOURCES);
    if (presetId === 'custom' && cleanCustom.length > 0) {
        return cleanCustom;
    }
    const preset = getHarvestPreset(presetId);
    if (preset) return preset.sources;
    return KEYLESS_SOURCES;
}
