import { randomUUID } from 'node:crypto';
import {
    copyFromContainer,
    createContainer,
    ensureImage,
    getContainerLogs,
    killContainer,
    putFileToContainer,
    removeContainer,
    startContainer,
    waitForExit,
} from './docker';

export type ContainerRunOptions = {
    image: string;
    cmd?: string[];
    /** Sobrescreve o ENTRYPOINT da imagem (ex.: theHarvester usa harvestview). */
    entrypoint?: string[];
    /** Usuário do container (ex.: '0' para root). */
    user?: string;
    memory?: string;
    cpus?: string;
    timeoutMs?: number;
    /**
     * Arquivos a gravar DENTRO do container (criado, antes de iniciar). Usado
     * para injetar credenciais (ex.: api-keys.yaml do theHarvester).
     */
    injectFiles?: Array<{ path: string; content: string; mode?: number }>;
    /**
     * Caminhos absolutos dentro do container a serem lidos (via archive) antes
     * da remoção. Útil para ferramentas que gravam a saída em arquivo (theHarvester).
     */
    artifacts?: string[];
};

export type ContainerRunResult = {
    exitCode: number | null;
    timedOut: boolean;
    stdout: string;
    stderr: string;
    executionTimeMs: number;
    /** Conteúdo dos artefatos solicitados, indexado pelo path no container. */
    artifacts?: Record<string, Buffer>;
};

export function parseMemoryToBytes(memory: string): number {
    const m = memory.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?b?)?$/);
    if (!m) return 512 * 1024 * 1024;
    const value = parseFloat(m[1]);
    const unit = m[2] || 'b';
    const factor: Record<string, number> = {
        b: 1,
        k: 1024,
        kb: 1024,
        m: 1024 ** 2,
        mb: 1024 ** 2,
        g: 1024 ** 3,
        gb: 1024 ** 3,
        t: 1024 ** 4,
        tb: 1024 ** 4,
    };
    return Math.round(value * (factor[unit] || 1));
}

export function parseCpusToNano(cpus: string): number {
    const value = parseFloat(cpus);
    if (!Number.isFinite(value) || value <= 0) return 1_000_000_000;
    return Math.round(value * 1e9);
}

async function collectArtifacts(
    containerId: string,
    paths?: string[]
): Promise<Record<string, Buffer> | undefined> {
    if (!paths || paths.length === 0) return undefined;
    const out: Record<string, Buffer> = {};
    for (const path of paths) {
        try {
            out[path] = await copyFromContainer(containerId, path);
        } catch {
            // artefato ausente (ex.: tool falhou antes de gravar) — ignora
        }
    }
    return out;
}

/**
 * Executa um comando dentro de um container efêmero com limites de memória/CPU,
 * aguardando a saída (com timeout), e devolve os logs (stdout/stderr) e,
 * opcionalmente, artefatos (arquivos) lidos antes da remoção.
 */
export async function runContainerCmd(opts: ContainerRunOptions): Promise<ContainerRunResult> {
    const startTime = Date.now();
    const memory = opts.memory || '512m';
    const cpus = opts.cpus || '1.0';
    const timeoutMs = opts.timeoutMs || 900000;
    const containerName = `osint_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    let containerId: string | null = null;

    try {
        await ensureImage(opts.image);

        containerId = await createContainer({
            image: opts.image,
            cmd: opts.cmd ?? [],
            name: containerName,
            memoryBytes: parseMemoryToBytes(memory),
            nanoCpus: parseCpusToNano(cpus),
            entrypoint: opts.entrypoint,
            user: opts.user,
        });

        if (opts.injectFiles && opts.injectFiles.length > 0) {
            for (const file of opts.injectFiles) {
                await putFileToContainer(containerId, file.path, file.content, file.mode);
            }
        }

        await startContainer(containerId);

        const exit = await waitForExit(containerId, timeoutMs);

        if (exit.timedOut) {
            await killContainer(containerId);
            const logs = await getContainerLogs(containerId).catch(() => ({ stdout: '', stderr: '' }));
            const artifacts = await collectArtifacts(containerId, opts.artifacts);
            return {
                exitCode: null,
                timedOut: true,
                stdout: logs.stdout,
                stderr: logs.stderr,
                executionTimeMs: Date.now() - startTime,
                artifacts,
            };
        }

        const logs = await getContainerLogs(containerId);
        const artifacts = await collectArtifacts(containerId, opts.artifacts);
        return {
            exitCode: exit.exitCode,
            timedOut: false,
            stdout: logs.stdout,
            stderr: logs.stderr,
            executionTimeMs: Date.now() - startTime,
            artifacts,
        };
    } catch (error: any) {
        return {
            exitCode: null,
            timedOut: false,
            stdout: '',
            stderr: error?.message || String(error),
            executionTimeMs: Date.now() - startTime,
        };
    } finally {
        if (containerId) {
            await removeContainer(containerId);
        }
    }
}
