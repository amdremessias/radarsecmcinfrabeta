/**
 * Presets de sites para o Sherlock.
 *
 * Os nomes DEVEM corresponder exatamente (case-insensitive) às chaves de
 * sherlock_project/resources/data.json (v0.16.0, 413 sites + $schema).
 * A comparação de --site no Sherlock é case-insensitive.
 */

export type SitePresetId = 'all' | 'social' | 'dev' | 'forums' | 'gaming' | 'adult' | 'custom';

export type SitePreset = {
    id: SitePresetId;
    label: string;
    description: string;
    sites: string[]; // vazio para "all" (usa a lista completa)
    nsfw: boolean;
};

export const ALL_SITES_COUNT = 413;

export const SITE_PRESETS: SitePreset[] = [
    {
        id: 'all',
        label: 'Todos os sites',
        description: `Verifica a lista completa do Sherlock (${ALL_SITES_COUNT} sites).`,
        sites: [],
        nsfw: false,
    },
    {
        id: 'social',
        label: 'Redes sociais',
        description: 'Redes sociais e plataformas de perfil público.',
        nsfw: false,
        sites: [
            'Twitter',
            'Instagram',
            'Bluesky',
            'threads',
            'Telegram',
            'Tumblr',
            'VK',
            'Snapchat',
            'Myspace',
            'Discord',
            'Reddit',
            'Medium',
            'YouNow',
            'Vero',
            'Keybase',
            'Linktree',
            'AllMyLinks',
            'About.me',
            'Gravatar',
        ],
    },
    {
        id: 'dev',
        label: 'Desenvolvimento',
        description: 'Comunidades, forges e plataformas para desenvolvedores.',
        nsfw: false,
        sites: [
            'GitHub',
            'GitLab',
            'BitBucket',
            'Codeberg',
            'Gitea',
            'Gitee',
            'HackerNews',
            'HackerRank',
            'LeetCode',
            'Codeforces',
            'Codechef',
            'Codewars',
            'DEV Community',
            'npm',
            'PyPi',
            'RubyGems',
            'Docker Hub',
            'Kaggle',
            'Hugging Face',
            'SourceForge',
            'Replit.com',
            'Topcoder',
            'Codepen',
            'GeeksforGeeks',
            'DMOJ',
            'Atcoder',
            'SublimeForum',
        ],
    },
    {
        id: 'forums',
        label: 'Fóruns & comunidade',
        description: 'Fóruns, agregadores e comunidades de discussão.',
        nsfw: false,
        sites: [
            'Reddit',
            'HackerNews',
            'Lobsters',
            'Slashdot',
            'SoylentNews',
            'Hubski',
            'BoardGameGeek',
            'Caddy Community',
            'Nextcloud Forum',
            'Joplin Forum',
            'Ionic Forum',
            'SublimeForum',
            'Tuna',
            'Spells8',
            'Warrior Forum',
            'Cracked',
            'Disqus',
        ],
    },
    {
        id: 'gaming',
        label: 'Gaming',
        description: 'Plataformas e comunidades de jogos.',
        nsfw: false,
        sites: [
            'Steam Community (User)',
            'Xbox Gamertag',
            'PSNProfiles.com',
            'Roblox',
            'FortniteTracker',
            'Minecraft',
            'RuneScape',
            'osu!',
            'TETR.IO',
            'Speedrun.com',
            'Newgrounds',
            'Kongregate',
            'Chess',
            'Lichess',
            'Pokemon Showdown',
            'Giant Bomb',
        ],
    },
    {
        id: 'adult',
        label: 'Adulto (NSFW)',
        description: 'Plataformas de conteúdo adulto. Ativa automaticamente o modo NSFW.',
        nsfw: true,
        sites: [
            'Pornhub',
            'Xvideos',
            'xHamster',
            'RedTube',
            'YouPorn',
            'ChaturBate',
            'BongaCams',
            'Motherless',
            'Image Fap',
            'Erome',
            'TnAFlix',
            'Heavy-R',
            'LushStories',
            'AdmireMe.Vip',
            'All Things Worn',
            'APClips',
            'PocketStars',
            'RoyalCams',
        ],
    },
];

export const MAX_CUSTOM_SITES = 200;

export function getPreset(id: string | undefined): SitePreset | undefined {
    return SITE_PRESETS.find((p) => p.id === id);
}

/**
 * Resolve a seleção da UI para a lista de sites efetiva (null = todos).
 */
export function resolveSites(
    presetId: string | undefined,
    customSites?: string[] | null
): { sites: string[] | null; nsfw: boolean } {
    const id = (presetId || 'all') as SitePresetId;

    if (id === 'custom') {
        const cleaned = (customSites || [])
            .map((s) => String(s).trim())
            .filter(Boolean)
            .slice(0, MAX_CUSTOM_SITES);
        return { sites: cleaned.length > 0 ? cleaned : null, nsfw: false };
    }

    const preset = getPreset(id);
    if (!preset || preset.id === 'all' || preset.sites.length === 0) {
        return { sites: null, nsfw: preset?.nsfw ?? false };
    }

    return { sites: preset.sites, nsfw: preset.nsfw };
}
