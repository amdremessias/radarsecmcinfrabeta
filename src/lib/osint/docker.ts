import http from 'node:http';
import { URL } from 'node:url';

/**
 * Cliente mínimo da Docker Engine API.
 *
 * O worker OSINT roda dentro de um container. Em vez de depender do binário
 * `docker` (que não existe na imagem Node), falamos diretamente com o daemon
 * via socket Unix (/var/run/docker.sock) ou via TCP (DOCKER_HOST).
 */

const API_VERSION = process.env.DOCKER_API_VERSION || 'v1.41';
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const DOCKER_HOST = process.env.DOCKER_HOST || '';

export type DockerResponse = {
    status: number;
    headers: http.IncomingHttpHeaders;
    body: Buffer;
};

function requestOptions(path: string, method: string) {
    const prefixed = `/${API_VERSION}${path}`;
    if (DOCKER_HOST) {
        const u = new URL(DOCKER_HOST.replace(/^tcp:\/\//, 'http://').replace(/^unix:\/\//, 'http://'));
        return {
            host: u.hostname,
            port: Number(u.port || 2375),
            path: prefixed,
            method,
        };
    }
    return { socketPath: DOCKER_SOCKET, path: prefixed, method };
}

export function dockerRequest(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: unknown,
    timeoutMs = 30000,
    contentType = 'application/json'
): Promise<DockerResponse> {
    return new Promise((resolve, reject) => {
        const payload =
            body === undefined
                ? undefined
                : Buffer.isBuffer(body)
                  ? body
                  : Buffer.from(JSON.stringify(body));

        const opts = requestOptions(path, method);
        const headers: Record<string, string | number> = {};
        if (payload) {
            headers['Content-Type'] = contentType;
            headers['Content-Length'] = payload.length;
        }

        const req = http.request({ ...opts, headers }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () =>
                resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) })
            );
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Docker API timeout após ${timeoutMs}ms (${method} ${path})`));
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function parseImageRef(image: string): { repo: string; tag: string } {
    const lastColon = image.lastIndexOf(':');
    const lastSlash = image.lastIndexOf('/');
    if (lastColon > lastSlash) {
        return { repo: image.slice(0, lastColon), tag: image.slice(lastColon + 1) };
    }
    return { repo: image, tag: 'latest' };
}

async function imageExists(image: string): Promise<boolean> {
    const res = await dockerRequest(`/images/${encodeURIComponent(image)}/json`, 'GET', undefined, 15000);
    return res.status === 200;
}

export async function ensureImage(image: string, timeoutMs = 600000): Promise<void> {
    if (verifiedImages.has(image)) return;
    if (await imageExists(image)) {
        verifiedImages.add(image);
        return;
    }

    const { repo, tag } = parseImageRef(image);
    const res = await dockerRequest(
        `/images/create?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`,
        'POST',
        undefined,
        timeoutMs
    );

    const text = res.body.toString('utf8');
    // O endpoint retorna 200 mesmo quando o pull falha; o erro vem no corpo.
    const errorLine = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
            try {
                return JSON.parse(l) as { error?: string; errorDetail?: { message?: string } };
            } catch {
                return null;
            }
        })
        .find((j) => j && (j.error || j.errorDetail));

    if (errorLine) {
        throw new Error(`Falha ao baixar imagem ${image}: ${errorLine.errorDetail?.message || errorLine.error}`);
    }

    if (res.status !== 200) {
        throw new Error(`Falha ao baixar imagem ${image} (HTTP ${res.status}).`);
    }

    verifiedImages.add(image);
}

// cache simples em memória para não bater em /images a cada scan
const verifiedImages = new Set<string>();

export async function createContainer(opts: {
    image: string;
    cmd: string[];
    name: string;
    memoryBytes: number;
    nanoCpus: number;
    /** Sobrescreve o ENTRYPOINT da imagem (ex.: theHarvester define harvestview). */
    entrypoint?: string[];
    /** Usuário do container (ex.: "0" para root). */
    user?: string;
}): Promise<string> {
    const config: Record<string, unknown> = {
        Image: opts.image,
        Cmd: opts.cmd,
        Tty: false,
        AttachStdout: false,
        AttachStderr: false,
        NetworkDisabled: false,
        HostConfig: {
            Memory: opts.memoryBytes,
            NanoCpus: opts.nanoCpus,
            AutoRemove: false,
            NetworkMode: 'bridge',
        },
    };
    if (opts.entrypoint && opts.entrypoint.length > 0) config.Entrypoint = opts.entrypoint;
    if (opts.user) config.User = opts.user;

    const res = await dockerRequest(
        `/containers/create?name=${encodeURIComponent(opts.name)}`,
        'POST',
        config,
        30000
    );

    if (res.status !== 201 && res.status !== 200) {
        let detail = res.body.toString('utf8').slice(0, 300);
        try {
            detail = JSON.parse(res.body.toString('utf8')).message || detail;
        } catch {
            // mantém texto cru
        }
        throw new Error(`Falha ao criar container (HTTP ${res.status}): ${detail}`);
    }

    const parsed = JSON.parse(res.body.toString('utf8')) as { Id: string };
    if (parsed.Id) verifiedImages.add(opts.image);
    return parsed.Id;
}

export async function startContainer(id: string): Promise<void> {
    const res = await dockerRequest(`/containers/${id}/start`, 'POST', undefined, 30000);
    if (res.status !== 204 && res.status !== 304) {
        throw new Error(`Falha ao iniciar container (HTTP ${res.status}): ${res.body.toString('utf8').slice(0, 200)}`);
    }
}

export async function killContainer(id: string): Promise<void> {
    try {
        await dockerRequest(`/containers/${id}/kill`, 'POST', undefined, 15000);
    } catch {
        // container pode já ter encerrado
    }
}

export async function removeContainer(id: string): Promise<void> {
    try {
        await dockerRequest(`/containers/${id}?force=1&v=1`, 'DELETE', undefined, 20000);
    } catch {
        // ignora falha de limpeza
    }
}

export async function waitForExit(
    id: string,
    timeoutMs: number,
    pollMs = 1000
): Promise<{ timedOut: boolean; exitCode: number | null }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        let res: DockerResponse;
        try {
            res = await dockerRequest(`/containers/${id}/json`, 'GET', undefined, 10000);
        } catch {
            // daemon ocupado; tenta de novo até o deadline
            if (Date.now() > deadline) return { timedOut: true, exitCode: null };
            await delay(pollMs);
            continue;
        }

        if (res.status === 404) {
            return { timedOut: false, exitCode: null };
        }

        try {
            const info = JSON.parse(res.body.toString('utf8')) as {
                State?: { Running?: boolean; ExitCode?: number };
            };
            if (info.State && info.State.Running === false) {
                return { timedOut: false, exitCode: info.State.ExitCode ?? null };
            }
        } catch {
            // ignora parse temporário
        }

        if (Date.now() > deadline) {
            return { timedOut: true, exitCode: null };
        }
        await delay(pollMs);
    }
}

export async function getContainerLogs(id: string): Promise<{ stdout: string; stderr: string }> {
    const res = await dockerRequest(`/containers/${id}/logs?stdout=1&stderr=1&timestamps=0&follow=0`, 'GET', undefined, 30000);
    return demuxDockerStream(res.body);
}

/**
 * O Docker multiplexa stdout/stderr quando Tty=false:
 * frame = [stream(1)][0][0][0][size(4, big-endian)] + payload
 * stream: 1 = stdout, 2 = stderr
 */
export function demuxDockerStream(buffer: Buffer): { stdout: string; stderr: string } {
    const out: Buffer[] = [];
    const err: Buffer[] = [];

    const looksMultiplexed =
        buffer.length >= 8 &&
        (buffer[0] === 0 || buffer[0] === 1 || buffer[0] === 2) &&
        buffer[1] === 0 &&
        buffer[2] === 0 &&
        buffer[3] === 0;

    if (!looksMultiplexed) {
        return { stdout: buffer.toString('utf8'), stderr: '' };
    }

    let offset = 0;
    while (offset + 8 <= buffer.length) {
        const stream = buffer[offset];
        const size = buffer.readUInt32BE(offset + 4);
        const start = offset + 8;
        const end = start + size;
        if (end > buffer.length) break;
        const payload = buffer.subarray(start, end);
        if (stream === 2) err.push(payload);
        else out.push(payload);
        offset = end;
    }

    return { stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') };
}

/**
 * Lê um arquivo de dentro do container antes que ele seja removido.
 * Usa o endpoint de archive (equivalente ao `docker cp`), que devolve um tar.
 */
export async function copyFromContainer(id: string, containerPath: string): Promise<Buffer> {
    const res = await dockerRequest(
        `/containers/${id}/archive?path=${encodeURIComponent(containerPath)}`,
        'GET',
        undefined,
        60000
    );
    if (res.status !== 200) {
        throw new Error(`Falha ao ler arquivo do container (HTTP ${res.status}): ${containerPath}`);
    }
    const file = extractSingleFileFromTar(res.body);
    if (!file) {
        throw new Error(`Arquivo não encontrado no container: ${containerPath}`);
    }
    return file;
}

/**
 * Extrai o primeiro arquivo regular de um tar (USTAR/PAX), sem dependências.
 * O archive do Docker com o path de um arquivo contém uma única entrada regular
 * (eventuais headers PAX são ignorados).
 */
export function extractSingleFileFromTar(buffer: Buffer): Buffer | null {
    let offset = 0;
    while (offset + 512 <= buffer.length) {
        const header = buffer.subarray(offset, offset + 512);
        const nameEnd = header.indexOf(0, 0);
        const name = header
            .subarray(0, nameEnd === -1 ? 100 : Math.min(nameEnd, 100))
            .toString('utf8');
        if (!name) break; // bloco zero = fim do archive

        const sizeRaw = header.subarray(124, 136).toString('ascii').replace(/\0/g, '').trim();
        const size = parseInt(sizeRaw, 8) || 0;
        const type = String.fromCharCode(header[156] || 48);
        const dataStart = offset + 512;
        const dataEnd = dataStart + size;

        if ((type === '0' || type === '') && size > 0 && dataEnd <= buffer.length) {
            return buffer.subarray(dataStart, dataEnd);
        }

        offset = dataStart + Math.ceil(size / 512) * 512;
    }
    return null;
}

/**
 * Escreve um arquivo dentro de um container (criado, ainda não iniciado)
 * via `PUT /containers/{id}/archive` — equivalente ao `docker cp`.
 *
 * O endpoint extrai um tar no diretório `path`. Como o `path` precisa existir,
 * enviamos um tar contendo a entrada de diretório (`<dir>/`) + o arquivo, e
 * extraímos no diretório-pai. Ex.: `/etc/theHarvester/api-keys.yaml` →
 * tar `{ theHarvester/, theHarvester/api-keys.yaml }` extraído em `/etc`.
 */
export async function putFileToContainer(
    id: string,
    containerPath: string,
    content: Buffer | string,
    mode = 0o644
): Promise<void> {
    const trimmed = containerPath.replace(/\/+$/, '');
    const slash = trimmed.lastIndexOf('/');
    const fileName = trimmed.slice(slash + 1);
    const dir = slash > 0 ? trimmed.slice(0, slash) : '';
    const dirSlash = dir.lastIndexOf('/');
    const parent = dirSlash > 0 ? dir.slice(0, dirSlash) || '/' : '/';
    const dirName = dir.slice(dirSlash + 1) || dir.replace(/^\//, '');

    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const tar = buildDirectoryTar(dirName, fileName, buf, mode);

    const res = await dockerRequest(
        `/containers/${id}/archive?path=${encodeURIComponent(parent)}`,
        'PUT',
        tar,
        60000,
        'application/x-tar'
    );

    if (res.status !== 200 && res.status !== 204) {
        throw new Error(
            `Falha ao injetar arquivo no container (HTTP ${res.status}): ${containerPath} — ${res.body
                .toString('utf8')
                .slice(0, 200)}`
        );
    }
}

function octalField(value: number, length: number): string {
    let s = Math.max(0, Math.floor(value)).toString(8);
    if (s.length > length - 1) s = s.slice(-(length - 1));
    return (s.padStart(length - 1, '0') + '\0').slice(0, length);
}

function tarHeader(name: string, size: number, type: '0' | '5', mode: number): Buffer {
    const header = Buffer.alloc(512, 0);
    header.write(name.slice(0, 99), 0, 'utf8'); // name
    header.write(octalField(mode, 8), 100, 8, 'ascii'); // mode
    header.write(octalField(0, 8), 108, 8, 'ascii'); // uid
    header.write(octalField(0, 8), 116, 8, 'ascii'); // gid
    // size (12 bytes): 11 dígitos octais + NUL
    header.write(octalField(size, 12), 124, 12, 'ascii');
    header.write(octalField(Math.floor(Date.now() / 1000), 12), 136, 12, 'ascii'); // mtime
    header.write('        ', 148, 8, 'ascii'); // checksum (espaços no cálculo)
    header.write(type, 156, 1, 'ascii'); // typeflag
    header.write('ustar', 257, 5, 'ascii'); // magic "ustar\0"
    header.write('00', 263, 2, 'ascii'); // version

    let sum = 0;
    for (let i = 0; i < header.length; i++) sum += header[i];
    header.write((sum.toString(8).padStart(6, '0') + '\0 ').slice(0, 8), 148, 8, 'ascii');

    return header;
}

/** Monta um tar USTAR com um diretório e um arquivo dentro dele. */
export function buildDirectoryTar(dirName: string, fileName: string, content: Buffer, mode = 0o644): Buffer {
    const dir = dirName.replace(/\/+$/, '');
    const dirHeader = tarHeader(`${dir}/`, 0, '5', 0o755);
    const fileHeader = tarHeader(`${dir}/${fileName}`, content.length, '0', mode);
    const padding = Buffer.alloc((512 - (content.length % 512)) % 512);
    return Buffer.concat([dirHeader, fileHeader, content, padding, Buffer.alloc(1024)]);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
