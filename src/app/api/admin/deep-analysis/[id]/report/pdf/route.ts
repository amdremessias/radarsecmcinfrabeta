import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';
import { buildDeepAnalysisPdf, exportFileName } from '@/lib/report/deepAnalysisPdf';
import type { DeepAnalysisResult } from '@/types/deepAnalysis';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id } = await ctx.params;
    const row = await queryOne('SELECT * FROM deep_analysis WHERE id = $1', [id]);

    if (!row) {
        return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });
    }

    const result: DeepAnalysisResult = {
        id: row.id,
        projectName: row.project_name,
        sourceType: row.source_type,
        repositoryUrl: row.repository_url,
        branch: row.branch,
        stack: row.stack,
        findings: row.findings || [],
        strengths: row.strengths || [],
        summary: row.summary || {},
        fileCount: row.file_count || 0,
        durationMs: row.duration_ms || 0,
        createdAt: row.created_at,
        status: row.status,
        error: row.error,
    };

    const buffer = await buildDeepAnalysisPdf(result);

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${exportFileName(result)}"`,
            'Cache-Control': 'private, no-store',
        },
    });
}