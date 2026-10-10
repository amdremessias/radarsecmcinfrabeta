import PDFDocument from 'pdfkit';

/**
 * Relatório PDF de um recon de domínio (theHarvester).
 * Similar ao relatório do OSINT Tracker, porém focado nos achados por tipo.
 */

export type HarvestPdfFinding = {
    resultType: string;
    value: string;
    sources?: string[] | null;
};

export type HarvestPdfData = {
    id: number;
    target: string;
    status: string;
    resultCount: number;
    counts: Record<string, number>;
    evidenceStatus?: string | null;
    executionTimeMs?: number | null;
    createdAt: string;
    sources?: string | null;
    error?: string | null;
    findings: HarvestPdfFinding[];
};

const TYPE_LABELS: Record<string, string> = {
    hostname: 'Hosts / Subdomínios',
    email: 'E-mails',
    ip: 'IPs',
    url: 'URLs',
    person: 'Pessoas',
    breach: 'Vazamentos',
    asn: 'ASNs',
};

const MAX_FINDINGS = 400;

function typeLabel(type: string): string {
    return TYPE_LABELS[type] || type;
}

function sanitize(name: string): string {
    return (name || 'domain').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function exportHarvestFilename(target: string, id: number): string {
    return `radar-domain-recon-${sanitize(target)}-${id}.pdf`;
}

export async function buildHarvestPdf(data: HarvestPdfData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
    });

    doc.fontSize(18).fillColor('#0f766e').text('Radar Security — Domain Recon', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('gray').text('Reconhecimento passivo de domínio (theHarvester)', { align: 'center' });
    doc.moveDown();

    doc.fontSize(11).fillColor('black');
    doc.text(`Alvo: ${data.target}`);
    doc.text(`Status: ${data.status}${data.evidenceStatus ? ` (evidência: ${data.evidenceStatus})` : ''}`);
    doc.text(`Total de resultados: ${data.resultCount}`);
    if (data.executionTimeMs != null) doc.text(`Tempo de execução: ${Math.round(data.executionTimeMs / 1000)}s`);
    doc.text(`Criado em: ${data.createdAt ? new Date(data.createdAt).toLocaleString('pt-BR') : '—'}`);
    if (data.sources) doc.fontSize(8).fillColor('gray').text(`Fontes: ${data.sources.slice(0, 400)}`, { width: 500 });
    doc.fillColor('black');
    if (data.error) {
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#b91c1c').text(`Erro: ${data.error}`);
        doc.fillColor('black');
    }
    doc.moveDown();

    const counts = Object.entries(data.counts || {}).filter(([, v]) => v > 0);
    if (counts.length > 0) {
        doc.fontSize(12).fillColor('black').text('Contagem por tipo', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10);
        for (const [type, value] of counts) {
            doc.text(`• ${typeLabel(type)}: ${value}`);
        }
        doc.moveDown();
    }

    // Agrupa os achados por tipo para leitura.
    const grouped = new Map<string, HarvestPdfFinding[]>();
    for (const f of data.findings) {
        const list = grouped.get(f.resultType) || [];
        list.push(f);
        grouped.set(f.resultType, list);
    }

    doc.fontSize(12).fillColor('black').text('Resultados', { underline: true });
    doc.moveDown(0.3);

    let printed = 0;
    for (const [type, list] of grouped) {
        if (printed >= MAX_FINDINGS) break;
        doc.moveDown(0.2);
        doc.fontSize(11).fillColor('#0369a1').text(`${typeLabel(type)} (${list.length})`);
        doc.fillColor('black').fontSize(9);
        for (const f of list) {
            if (printed >= MAX_FINDINGS) break;
            const src = f.sources && f.sources.length > 0 ? `  [${f.sources.join(', ')}]` : '';
            doc.text(`- ${String(f.value).slice(0, 160)}${src}`);
            printed++;
        }
    }

    if (data.findings.length > printed) {
        doc.moveDown(0.4);
        doc.fontSize(8).fillColor('gray').text(
            `... ${data.findings.length - printed} resultado(s) omitido(s) no PDF — exporte o CSV para a lista completa.`
        );
    }

    doc.moveDown();
    doc.fontSize(8).fillColor('gray').text('MCinfraTI Radar Security — OSINT / Domain Recon', { align: 'center' });

    doc.end();
    return done;
}
