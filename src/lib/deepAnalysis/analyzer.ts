import path from 'path';
import type { DeepAnalysisInput, DeepAnalysisResult } from '@/types/deepAnalysis';
import { createWorkspace, removeWorkspace, extractArchive, collectFiles } from './extract';
import { detectStack } from './stackDetector';
import { runSast, buildSummary } from './sast';

export async function runDeepAnalysis(input: DeepAnalysisInput): Promise<DeepAnalysisResult> {
    const start = Date.now();
    const workspace = await createWorkspace();

    try {
        const projectRoot =
            input.sourceType === 'git'
                ? await cloneRepository(input, workspace)
                : await extractUpload(input, workspace);

        const files = await collectFiles(projectRoot);
        const { stack } = await detectStack(projectRoot, files);
        const { findings, strengths, filesScanned } = await runSast(
            files,
            stack.language,
            input.sourceType
        );

        return {
            projectName: input.projectName,
            sourceType: input.sourceType,
            repositoryUrl: input.repositoryUrl,
            branch: input.branch,
            stack,
            findings,
            strengths,
            summary: buildSummary(findings, strengths, filesScanned),
            fileCount: files.length,
            durationMs: Date.now() - start,
            status: 'completed',
        };
    } catch (e: any) {
        return {
            projectName: input.projectName,
            sourceType: input.sourceType,
            repositoryUrl: input.repositoryUrl,
            branch: input.branch,
            stack: {
                language: 'Indeterminada',
                deploy: [],
                fileCount: 0,
            },
            findings: [],
            strengths: [],
            summary: {
                total: 0,
                banco: 0,
                permissoes: 0,
                idor: 0,
                chaves: 0,
                inputs: 0,
                strengths: 0,
                critica: 0,
                alta: 0,
                media: 0,
                baixa: 0,
                sastModel: 'Motor SAST-Radar v1.0',
                scannedFiles: 0,
            },
            fileCount: 0,
            durationMs: Date.now() - start,
            status: 'failed',
            error: e?.message || 'Falha desconhecida na análise profunda.',
        };
    } finally {
        await removeWorkspace(workspace).catch(() => {});
    }
}

async function cloneRepository(input: DeepAnalysisInput, workspace: string): Promise<string> {
    const repoDir = path.join(workspace, 'repo');
    let url = (input.repositoryUrl || '').trim();
    if (!url) throw new Error('URL do repositório é obrigatória.');

    const token = (input.apiToken || '').trim();
    if (token) {
        const withoutProtocol = url.replace(/^https?:\/\//i, '');
        const host = withoutProtocol.split('/')[0];
        const rest = withoutProtocol.slice(host.length);
        url = `https://x-access-token:${encodeURIComponent(token)}@${host}${rest}`;
    }

    const args = ['clone', '--depth', '1', '--single-branch'];
    const branch = (input.branch || '').trim();
    if (branch) {
        args.push('--branch', branch);
    }
    args.push(url, repoDir);

    const { execa } = await import('execa');

    await execa('git', args, {
        timeout: 180_000,
        env: {
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: 'echo',
        },
        stdout: 'pipe',
        stderr: 'pipe',
    });

    return repoDir;
}

async function extractUpload(input: DeepAnalysisInput, workspace: string): Promise<string> {
    if (!input.zipBuffer || input.zipBuffer.length === 0) {
        throw new Error('Nenhum arquivo enviado.');
    }
    if (input.zipBuffer.length > 50 * 1024 * 1024) {
        throw new Error('Arquivo acima do limite de 50MB.');
    }
    const srcDir = path.join(workspace, 'src');
    await extractArchive(input.zipBuffer, srcDir, input.zipFileName);
    return srcDir;
}