import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const { id } = await ctx.params;
    const row = await queryOne(
        `SELECT d.id,
                d.project_name AS "projectName",
                d.source_type AS "sourceType",
                d.repository_url AS "repositoryUrl",
                d.branch,
                d.stack,
                d.findings,
                d.strengths,
                d.summary,
                d.file_count AS "fileCount",
                d.duration_ms AS "durationMs",
                d.status,
                d.error,
                d.created_at AS "createdAt"
         FROM deep_analysis d
         WHERE d.id = $1`,
        [id]
    );

    if (!row) {
        return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });
    }

    return NextResponse.json({
        id: row.id,
        projectName: row.projectName,
        sourceType: row.sourceType,
        repositoryUrl: row.repositoryUrl,
        branch: row.branch,
        stack: row.stack,
        findings: row.findings,
        strengths: row.strengths,
        summary: row.summary,
        fileCount: row.fileCount,
        durationMs: row.durationMs,
        status: row.status,
        error: row.error,
        createdAt: row.createdAt,
    });
}