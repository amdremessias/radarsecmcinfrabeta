import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { staffSession, adminUnauthorized } from '@/lib/adminAuth';
import { runDeepAnalysis } from '@/lib/deepAnalysis/analyzer';
import type { DeepAnalysisInput, DeepAnalysisResult } from '@/types/deepAnalysis';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
    const session = await staffSession();
    if (!session) return adminUnauthorized();

    const contentType = req.headers.get('content-type') || '';

    try {
        let input: DeepAnalysisInput;

        if (contentType.includes('multipart/form-data')) {
            const form = await req.formData();
            const file = form.get('file');
            const projectName = (form.get('projectName') as string)?.trim() || 'Projeto enviado';
            if (!file || typeof file === 'string') {
                return NextResponse.json({ error: 'Envie um arquivo .zip/.tar/.tar.gz/.tgz' }, { status: 422 });
            }
            const blob = file as Blob;
            if (blob.size > 50 * 1024 * 1024) {
                return NextResponse.json({ error: 'Arquivo acima do limite de 50MB.' }, { status: 422 });
            }
            const zipBuffer = Buffer.from(await blob.arrayBuffer());
            input = {
                projectName,
                sourceType: 'zip',
                zipBuffer,
                zipFileName: file.name || 'upload.zip',
            };
        } else {
            const body = await req.json();
            const repositoryUrl = (body.repositoryUrl as string)?.trim();
            const projectName = (body.projectName as string)?.trim();
            const branch = (body.branch as string)?.trim();
            const apiToken = (body.apiToken as string)?.trim();

            if (!repositoryUrl) {
                return NextResponse.json({ error: 'URL do repositório (git) é obrigatória.' }, { status: 422 });
            }
            if (/^https?:\/\//i.test(repositoryUrl)) {
                try {
                    const parsed = new URL(repositoryUrl);
                    if (!['http:', 'https:'].includes(parsed.protocol)) {
                        return NextResponse.json({ error: 'Protocolo de URL inválido.' }, { status: 422 });
                    }
                } catch {
                    return NextResponse.json({ error: 'URL do repositório inválida.' }, { status: 422 });
                }
            }
            input = {
                projectName: projectName || repositoryUrl.split('/').pop() || 'Repositório',
                sourceType: 'git',
                repositoryUrl,
                branch,
                apiToken,
            };
        }

        const result = await runDeepAnalysis(input);

        let id: number | null = null;
        try {
            const inserted = await query(
                `INSERT INTO deep_analysis
                    (user_id, project_name, source_type, repository_url, branch, stack, findings, strengths, summary, file_count, duration_ms, status, error)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                 RETURNING id`,
                [
                    session.user.id,
                    result.projectName,
                    result.sourceType,
                    result.repositoryUrl || null,
                    result.branch || null,
                    JSON.stringify(result.stack),
                    JSON.stringify(result.findings),
                    JSON.stringify(result.strengths),
                    JSON.stringify(result.summary),
                    result.fileCount,
                    result.durationMs,
                    result.status,
                    result.error || null,
                ]
            );
            id = inserted[0]?.id ?? null;

            if (session.user.id) {
                await query(
                    'INSERT INTO usage_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
                    [
                        session.user.id,
                        'deep_analysis',
                        JSON.stringify({
                            projectName: result.projectName,
                            sourceType: result.sourceType,
                            findings: result.findings.length,
                            status: result.status,
                            duration: result.durationMs,
                        }),
                    ]
                );
            }
        } catch (dbErr: any) {
            console.error('[deep-analysis] falha ao persistir:', dbErr?.message);
        }

        const response: DeepAnalysisResult = { ...result, id: id ?? undefined };
        return NextResponse.json(response);
    } catch (e: any) {
        console.error('[deep-analysis] erro no scan:', e?.message);
        return NextResponse.json(
            { error: 'Falha ao executar a análise profunda.', details: e?.message },
            { status: 500 }
        );
    }
}