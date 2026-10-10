import PDFDocument from 'pdfkit';

export type OsintResultRow = {
    siteName: string;
    url?: string | null;
    found: boolean;
    status: string;
    message?: string | null;
    matchedUsername?: string | null;
    /** Dados extras extraídos do perfil (engine Maigret): nome, bio, foto etc. */
    data?: Record<string, string> | null;
};

export type OsintPdfData = {
    id: number;
    username: string;
    status: string;
    sitesTotal: number;
    sitesFound: number;
    successRate: number;
    executionTimeMs?: number | null;
    createdAt: string;
    error?: string | null;
    results: OsintResultRow[];
};

const IMAGE_KEYS = ['image', 'image_url', 'avatar', 'avatar_url', 'photo', 'profile_pic_url', 'profile_picture'];
const FIELD_ORDER = [
    'fullname',
    'name',
    'username',
    'bio',
    'description',
    'location',
    'company',
    'blog_url',
    'uid',
    'created_at',
    'follower_count',
    'following_count',
    'is_verified',
];

const FIELD_LABELS: Record<string, string> = {
    fullname: 'nome',
    name: 'nome',
    username: 'username',
    bio: 'bio',
    description: 'bio',
    location: 'local',
    company: 'empresa',
    blog_url: 'site',
    uid: 'uid',
    created_at: 'criado em',
    follower_count: 'seguidores',
    following_count: 'seguindo',
    is_verified: 'verificado',
};

const MAX_IMAGES = 24;
const IMAGE_FETCH_TIMEOUT_MS = 5000;
const IMAGE_MAX_BYTES = 3_000_000;

function sanitize(name: string) {
    return (name || 'osint').replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** URL da foto/avatar do perfil, se houver. */
export function getProfileImageUrl(data?: Record<string, string> | null): string | undefined {
    if (!data) return undefined;
    for (const key of IMAGE_KEYS) {
        if (data[key]) return data[key];
    }
    return undefined;
}

/** Monta uma linha compacta com os dados extras (nome, bio, local, etc.). */
function formatExtras(data?: Record<string, string> | null, maxLen = 220): string {
    if (!data) return '';
    const parts: string[] = [];
    const used = new Set<string>(['image', 'picture']);
    for (const key of FIELD_ORDER) {
        const value = data[key];
        if (!value) continue;
        used.add(key);
        const label = FIELD_LABELS[key] || key;
        parts.push(`${label}: ${value}`);
    }
    for (const [key, value] of Object.entries(data)) {
        if (used.has(key) || !value) continue;
        parts.push(`${key}: ${value}`);
    }
    const joined = parts.join(' · ');
    return joined.length > maxLen ? joined.slice(0, maxLen - 1) + '…' : joined;
}

/** Baixa a imagem do perfil (com timeout e limite de tamanho) para embutir no PDF. */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RadarSecurity-OSINT/1.0)' },
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const declared = Number(res.headers.get('content-length') || 0);
        if (declared > IMAGE_MAX_BYTES) return null;
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.byteLength === 0 || buffer.byteLength > IMAGE_MAX_BYTES) return null;
        return buffer;
    } catch {
        return null;
    }
}

export async function buildOsintPdf(data: OsintPdfData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    doc.fontSize(18).text('MCinfraTI · Radar Security - OSINT / Username Tracker', { align: 'left' });
    doc.moveDown();
    doc.fontSize(12).text(`Relatório de Busca - Username: ${data.username}`);
    doc.moveDown(0.5);

    doc.fontSize(10);
    doc.text(`ID do Scan: #${data.id}`);
    doc.text(`Status: ${data.status}`);
    doc.text(`Total Verificados: ${data.sitesTotal}`);
    doc.text(`Sites Encontrados: ${data.sitesFound}`);
    doc.text(`Taxa de Sucesso: ${data.successRate}%`);
    doc.text(`Tempo de Execução: ${data.executionTimeMs || 0}ms`);
    doc.text(`Criado em: ${new Date(data.createdAt).toLocaleString('pt-BR')}`);
    if (data.error) {
        doc.text(`Erro: ${data.error}`);
    }
    doc.moveDown();

    const found = data.results.filter((r) => r.found);
    const profilesWithExtras = found.filter((f) => f.data && Object.keys(f.data).length > 0).length;

    doc.fontSize(12).text(`Perfis Encontrados (${found.length})`);
    if (profilesWithExtras > 0) {
        doc.fontSize(9).fillColor('gray').text(`${profilesWithExtras} com dados extras (nome, bio, foto, IDs).`);
    }
    doc.fillColor('black');
    doc.moveDown(0.3);

    if (found.length === 0) {
        doc.fontSize(9).text('Nenhum perfil encontrado.');
    } else {
        // Pré-carrega as fotos (limitado) para embutir no relatório.
        const urls = new Set<string>();
        for (const f of found.slice(0, 100)) {
            if (urls.size >= MAX_IMAGES) break;
            const imageUrl = getProfileImageUrl(f.data);
            if (imageUrl) urls.add(imageUrl);
        }
        const images = new Map<string, Buffer>();
        await Promise.all(
            Array.from(urls).map(async (url) => {
                const buffer = await fetchImageBuffer(url);
                if (buffer) images.set(url, buffer);
            })
        );

        for (const f of found.slice(0, 100)) {
            try {
                const imageUrl = getProfileImageUrl(f.data);
                const buffer = imageUrl ? images.get(imageUrl) : undefined;
                if (buffer) {
                    doc.image(buffer, { fit: [48, 48] });
                }
                doc.fontSize(9).fillColor('black').text(
                    `• ${f.siteName}${f.url ? ' - ' + f.url : ''}${f.matchedUsername ? ` (var: ${f.matchedUsername})` : ''}`
                );
                const extras = formatExtras(f.data);
                if (extras) {
                    doc.fontSize(8).fillColor('gray').text(extras, { indent: 14 });
                } else if (imageUrl && !buffer) {
                    doc.fontSize(7).fillColor('gray').text(`foto: ${imageUrl}`, { indent: 14, link: imageUrl });
                }
                doc.fillColor('black');
                doc.moveDown(0.25);
            } catch {
                // Nunca deixa um perfil problemático interromper o relatório.
                doc.fontSize(9).fillColor('black').text(`• ${f.siteName}${f.url ? ' - ' + f.url : ''}`);
                doc.moveDown(0.25);
            }
        }
        if (found.length > 100) {
            doc.fontSize(8).fillColor('gray').text(`(+${found.length - 100} adicionais - ver CSV completo)`);
        }
    }
    doc.moveDown();

    doc.fontSize(10).fillColor('black').text('Tabela Resumida (todos)', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(8);
    const lines = data.results.slice(0, 80).map((r) => {
        const flag = r.found ? '[FOUND]' : r.status === 'error' ? '[ERR]' : '[N/A]';
        return `${flag} ${r.siteName} ${r.url || ''} ${r.message || ''}`.slice(0, 95);
    });
    for (const l of lines) {
        doc.text(l);
    }
    if (data.results.length > 80) {
        doc.text(`... (${data.results.length - 80} linhas omitidas no PDF - exporte CSV para lista completa)`);
    }

    doc.moveDown();
    doc.fontSize(8).fillColor('gray').text('MCinfraTI Radar Security - OSINT Tracker', { align: 'center' });

    doc.end();
    return done;
}

export function exportOsintFilename(username: string, id: number) {
    return `radar-osint-${sanitize(username)}-${id}.pdf`;
}
