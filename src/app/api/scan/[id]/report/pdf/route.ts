import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildReportData, generatePdfReport, sanitizeFilenamePart } from '@/lib/report/pdfReport';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const scanId = parseInt(id);

    if (isNaN(scanId)) {
        return NextResponse.json({ error: 'Invalid scan ID' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);

    const scans = await query(
        `SELECT id, target_url as "targetUrl", domain, scan_type as "scanType",
            status, score, grade, headers, cookies, tls,
dns, technology, vulnerabilities, info_disclosure as "infoDisclosure",
            subdomains_found as "subdomainsFound", ports_found as "portsFound",
            cve_matches as "cveMatches", error, duration_ms as "durationMs",
            cliente_id as "clienteId",
            contingency_plan as "contingencyPlan",
            exposure, lgpd,
            created_at as "createdAt", completed_at as "completedAt"
         FROM scans WHERE id = $1`,
        [scanId]
    );

    if (scans.length === 0) {
        return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    }

    const scan = scans[0];

    if (session?.user?.role === 'cliente') {
        const ownerId = scan.clienteId;
        if (!session.user.clienteId || ownerId !== session.user.clienteId) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }
    }

    try {
        const reportData = buildReportData({
            id: scan.id,
            targetUrl: scan.targetUrl,
            domain: scan.domain,
            score: scan.score,
            grade: scan.grade,
            created_at: scan.createdAt,
            completed_at: scan.completedAt,
            duration_ms: scan.durationMs,
            headers: scan.headers,
            cookies: scan.cookies,
            tls: scan.tls,
            dns: scan.dns,
            technology: scan.technology,
            vulnerabilities: scan.vulnerabilities,
            cve_matches: scan.cveMatches,
            exposure: scan.exposure,
            lgpd: scan.lgpd,
            error: scan.error,
            status: scan.status,
        });

        const pdfBuffer = await generatePdfReport(reportData);
        const pdfBytes = Uint8Array.from(pdfBuffer);
        const fileName = `MCinfraTI_Radar_${sanitizeFilenamePart(scan.targetUrl || 'scan')}_${String(scan.id)}.pdf`;

        return new NextResponse(pdfBytes, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: 'Failed to generate report', details: err?.message || String(err) },
            { status: 500 }
        );
    }
}