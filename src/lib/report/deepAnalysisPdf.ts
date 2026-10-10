import PDFDocument from 'pdfkit';
import type {
    DeepAnalysisResult,
    DeepFinding,
    DeepPillarId,
    DeepSeverity,
} from '@/types/deepAnalysis';
import { DEEP_PILLAR_LABEL } from '@/types/deepAnalysis';
import { sanitizeFilenamePart } from './pdfReport';

const SEV_COLOR: Record<DeepSeverity, string> = {
    CRITICA: '#e11d48',
    ALTA: '#f97316',
    MEDIA: '#facc15',
    BAIXA: '#94a3b8',
    PONTO_FORTE: '#10b981',
};

const SEV_PILLAR_ORDER: Record<DeepSeverity, number> = {
    CRITICA: 0,
    ALTA: 1,
    MEDIA: 2,
    BAIXA: 3,
    PONTO_FORTE: 4,
};

const PILLAR_COLORS: Record<DeepPillarId, string> = {
    banco: '#f43f5e',
    permissoes: '#f97316',
    idor: '#a855f7',
    chaves: '#eab308',
    inputs: '#38bdf8',
};

export function exportFileName(result: DeepAnalysisResult): string {
    const base = sanitizeFilenamePart(result.projectName || 'analise');
    return `radar-deep-analysis-${base}-${result.id || Date.now()}.pdf`;
}

export async function buildDeepAnalysisPdf(result: DeepAnalysisResult): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    const M = 50;
    const W = doc.page.width;
    const CONTENT_W = W - M * 2;
    const PAGE_H = doc.page.height;
    const BOTTOM = PAGE_H - 54;

    const INK = '#0f172a';
    const BODY = '#475569';
    const MUTE = '#64748b';
    const FAINT = '#94a3b8';
    const BRAND = '#38bdf8';

    function runningHeader(title: string) {
        doc.save();
        doc.rect(0, 0, W, 26).fill(INK);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#e2e8f0');
        doc.text('MCinfraTI RADAR SECURITY', M, 8, { width: 240 });
        doc.font('Helvetica').fontSize(7).fillColor(FAINT);
        doc.text(title, M + 240, 9, { width: CONTENT_W - 240 });
        doc.restore();
        doc.y = 38;
    }

    function newPage(first = false) {
        doc.addPage();
        if (!first) runningHeader('Análise Profunda de Código · Documento Confidencial');
    }

    function ensureSpace(needed: number): number {
        if (doc.y + needed > BOTTOM) {
            newPage();
            return M;
        }
        return doc.y;
    }

    function textBlock(
        text: string,
        opts: {
            x?: number;
            y?: number;
            w?: number;
            size?: number;
            color?: string;
            font?: 'Helvetica-Bold' | 'Helvetica' | 'Courier';
            lineGap?: number;
        } = {}
    ) {
        const x = opts.x ?? M;
        const y = opts.y ?? doc.y;
        doc.save();
        doc.font(opts.font || 'Helvetica').fontSize(opts.size || 8.5).fillColor(opts.color || BODY);
        doc.text(text, x, y, {
            width: opts.w ?? CONTENT_W,
            lineBreak: true,
            lineGap: opts.lineGap ?? 3,
        });
        doc.restore();
    }

    function panelDark(x: number, y: number, w: number, h: number) {
        doc.save().roundedRect(x, y, w, h, 12).fill('#0f172a').restore();
        doc.save().rect(x + 12, y + 3, w - 24, 2).fill(BRAND).restore();
    }

    function hudTitle(x: number, y: number, text: string, color = BRAND) {
        doc.font('Helvetica-Bold').fontSize(7).fillColor(color);
        doc.text(text.toUpperCase(), x, y, { width: 320 });
    }

    function sevTile(x: number, y: number, w: number, h: number, color: string, label: string, count: number, total: number) {
        doc.save().roundedRect(x, y, w, h, 8).fill('#0f172a').restore();
        doc.save().rect(x, y + 3, w, 2.5).fill(color).restore();
        const active = count > 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        doc.font('Helvetica').fontSize(6).fillColor(MUTE);
        doc.text(label, x + 9, y + 13, { width: w - 18 });
        doc.font('Helvetica-Bold').fontSize(21).fillColor(active ? color : '#334155');
        doc.text(String(count), x + 9, y + 27, { width: w - 18 });
        doc.font('Helvetica').fontSize(6).fillColor(active ? FAINT : '#475569');
        doc.text(active ? `${pct}% dos achados` : 'sem achados', x + 9, y + h - 13, { width: w - 18 });
    }

    function metaChip(x: number, y: number, label: string, value: string, color = BRAND) {
        doc.font('Helvetica').fontSize(6).fillColor(MUTE);
        doc.text(label.toUpperCase(), x, y, { width: 160 });
        doc.font('Helvetica-Bold').fontSize(8).fillColor(color);
        doc.text(value, x, y + 10, { width: 170 });
    }

    function sectionHeader(title: string) {
        doc.y = ensureSpace(40);
        doc.save().roundedRect(M, doc.y, CONTENT_W, 28, 7).fill(INK).restore();
        doc.fillColor('#e2e8f0').font('Helvetica-Bold').fontSize(10);
        doc.text(title.toUpperCase(), M + 12, doc.y + 9, { width: CONTENT_W - 24 });
        doc.y += 38;
    }

    function findingBlock(idx: number, f: DeepFinding) {
        const sevColor = SEV_COLOR[f.severity];
        doc.y = ensureSpace(120);
        const blockY = doc.y;

        doc.save().roundedRect(M, blockY, CONTENT_W, 66, 10).fill('#f8fafc').restore();
        doc.save().rect(M, blockY, 4, 66).fill(sevColor).restore();

        doc.font('Helvetica-Bold').fontSize(8).fillColor(sevColor);
        doc.text(String(idx + 1).padStart(2, '0'), M + 13, blockY + 10);

        doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
        doc.text(f.title, M + 28, blockY + 9, { width: CONTENT_W - 40 });

        doc.font('Helvetica').fontSize(6.5).fillColor(MUTE);
        doc.text(
            `${DEEP_PILLAR_LABEL[f.pillar].toUpperCase()} · ${f.filePath}:${f.line}`,
            M + 28,
            blockY + 22,
            { width: CONTENT_W - 40 }
        );

        doc.font('Courier').fontSize(7).fillColor('#334155');
        doc.text(f.code.slice(0, 140), M + 13, blockY + 34, { width: CONTENT_W - 26, lineBreak: true });

        doc.y = blockY + 66 + 6;
        textBlock(f.why, { size: 7.5, color: BODY });
        doc.y += 2;
        textBlock(`Correção: ${f.fix}`, { size: 7.5, color: '#0f766e', font: 'Helvetica-Bold', lineGap: 1 });
        doc.y += 8;
    }

    const summary = result.summary;

    // ---------------------- PÁGINA 1 · CAPA HITECH ----------------------
    doc.rect(0, 0, W, PAGE_H).fill('#05070f');

    doc.save().rect(0, 0, W, 220).fill('#0b1220').restore();
    doc.save().rect(0, 210, W, 3).fill(BRAND).restore();

    doc.fillColor(BRAND).font('Helvetica').fontSize(9);
    doc.text('MCinfraTI', M, 40, { width: 200 });
    doc.fillColor('#8b5cf6').font('Helvetica-Bold').fontSize(9);
    doc.text('RADAR SECURITY', W - M - 150, 40, { width: 150, align: 'right' });

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26);
    doc.text('ANÁLISE PROFUNDA', M, 92, { width: CONTENT_W });
    doc.text('DE CÓDIGO-FONTE', M, 122, { width: CONTENT_W });
    doc.fillColor(BRAND).font('Helvetica').fontSize(10);
    doc.text('Diagnóstico estático · 5 pilares · Motor SAST-Radar', M, 160, { width: CONTENT_W });

    doc.fillColor(MUTE).font('Helvetica').fontSize(7);
    doc.text('Documento Confidencial · Uso interno', M, 270, { width: CONTENT_W });

    // painel de stack
    doc.y = 300;
    panelDark(M, 300, CONTENT_W, 150);
    hudTitle(M + 16, 316, 'Tecnologia detectada');
    const colW = CONTENT_W / 2 - 16;
    metaChip(M + 16, 336, 'Linguagem', result.stack.language || 'Indeterminada', '#e2e8f0');
    metaChip(M + colW + 16, 336, 'Framework', result.stack.framework || '—', '#e2e8f0');
    metaChip(M + 16, 376, 'ORM', result.stack.orm || '—', '#e2e8f0');
    metaChip(M + colW + 16, 376, 'Banco de dados', result.stack.database || '—', '#e2e8f0');
    metaChip(M + 16, 416, 'Autenticação', result.stack.auth || '—', '#e2e8f0');
    metaChip(M + colW + 16, 416, 'Arquivos analisados', String(result.fileCount), '#e2e8f0');

    // placar
    sectionHeader('Placar de severidade');
    doc.y = ensureSpace(120);
    const tileW = 90;
    const gaps = (CONTENT_W - tileW * 5) / 4;
    const sevKey: Record<string, 'critica' | 'alta' | 'media' | 'baixa'> = {
        CRITICA: 'critica',
        ALTA: 'alta',
        MEDIA: 'media',
        BAIXA: 'baixa',
    };
    (['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'] as const).forEach((sev, i) => {
        sevTile(M + i * (tileW + gaps), doc.y, tileW, 74, SEV_COLOR[sev], sev, summary[sevKey[sev]], summary.total);
    });
    doc.y += 96;

    // distribuição por pilar
    sectionHeader('Distribuição por pilar');
    doc.y = ensureSpace(180);
    const pillars: DeepPillarId[] = ['banco', 'permissoes', 'idor', 'chaves', 'inputs'];
    const maxPillar = Math.max(1, ...pillars.map((p) => summary[p]));
    let py = doc.y;
    for (const p of pillars) {
        const val = summary[p];
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(INK);
        doc.text(DEEP_PILLAR_LABEL[p], M, py, { width: 150 });
        doc.save().roundedRect(M + 155, py, CONTENT_W - 155 - 60, 11, 5).fill('#e2e8f0').restore();
        if (val > 0) {
            doc.save().roundedRect(M + 155, py, Math.max(8, ((CONTENT_W - 155 - 60) * val) / maxPillar), 11, 5).fill(PILLAR_COLORS[p]).restore();
        }
        doc.font('Helvetica-Bold').fontSize(8).fillColor(INK);
        doc.text(String(val), M + CONTENT_W - 52, py - 1, { width: 40, align: 'right' });
        py += 28;
    }
    doc.y = py + 10;

    if (summary.total === 0 && summary.strengths > 0) {
        textBlock('Nenhum achado de vulnerabilidade classificado pelo motor. Continue mantendo as boas práticas detectadas abaixo.', {
            size: 8,
            color: '#0f766e',
            font: 'Helvetica-Bold',
        });
        doc.y += 8;
    }

    // ---------------------- ACHADOS ----------------------
    const sortedFindings = [...result.findings].sort(
        (a, b) =>
            SEV_PILLAR_ORDER[a.severity] - SEV_PILLAR_ORDER[b.severity] ||
            DEEP_PILLAR_LABEL[a.pillar].localeCompare(DEEP_PILLAR_LABEL[b.pillar])
    );

    if (sortedFindings.length > 0) {
        newPage();
        sectionHeader('Achados de segurança');
        sortedFindings.forEach((f, i) => findingBlock(i, f));
    }

    // ---------------------- PONTOS FORTES ----------------------
    if (result.strengths.length > 0) {
        newPage();
        sectionHeader('Práticas positivas detectadas');
        for (const s of result.strengths) {
            doc.y = ensureSpace(80);
            const by = doc.y;
            doc.save().roundedRect(M, by, CONTENT_W, 62, 10).fill('#f0fdf4').restore();
            doc.save().rect(M, by, 4, 62).fill('#10b981').restore();
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#065f46');
            doc.text(s.title, M + 14, by + 9, { width: CONTENT_W - 28 });
            doc.font('Helvetica').fontSize(6.5).fillColor(MUTE);
            doc.text(`${s.filePath}:${s.line}`, M + 14, by + 23, { width: CONTENT_W - 28 });
            doc.font('Courier').fontSize(7).fillColor('#334155');
            doc.text(s.code.slice(0, 120), M + 14, by + 35, { width: CONTENT_W - 28 });
            doc.y = by + 62 + 8;
        }
    }

    doc.save();
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const ph = doc.page.height;
        doc.rect(0, ph - 48, W, 48).fill('#0f172a');
        doc.font('Helvetica').fontSize(7).fillColor(FAINT);
        doc.text(
            'MCinfraTI Radar Security · Análise Profunda de Código v1.0 · Documento Confidencial',
            M,
            ph - 30,
            { width: CONTENT_W - 80 }
        );
        doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(7);
        doc.text(`PÁGINA ${i + 1} / ${range.count}`, W - M - 70, ph - 30, { width: 70, align: 'right' });
        doc.restore();
    }

    doc.end();
    return done;
}