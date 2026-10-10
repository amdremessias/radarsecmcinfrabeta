import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { Readable } from 'stream';
import { promisify } from 'util';
import yauzl from 'yauzl';
import tar from 'tar-fs';

const mkdtemp = promisify(fs.mkdtemp);

export const MAX_ENTRIES = 30000;
export const MAX_TOTAL_BYTES = 220 * 1024 * 1024;
export const MAX_UNCOMPRESSED_FILE = 22 * 1024 * 1024;
export const MAX_SOURCE_FILE = 1024 * 1024;

export async function createWorkspace(prefix = 'radar-deep-'): Promise<string> {
    return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function removeWorkspace(dir: string): Promise<void> {
    await fs.promises.rm(dir, { recursive: true, force: true });
}

function isSafeRelative(fileName: string): boolean {
    if (!fileName || typeof fileName !== 'string') return false;
    const norm = fileName.replace(/\\/g, '/').replace(/^\.\/+/, '');
    if (norm.startsWith('/')) return false;
    if (norm.includes('\0')) return false;
    const parts = norm.split('/');
    if (parts.some((p) => p === '..')) return false;
    return true;
}

function cleanEntryName(fileName: string): string {
    return fileName.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

export function detectArchiveKind(buffer: Buffer, fileName?: string): 'zip' | 'tar' | 'targz' | 'unknown' {
    const name = (fileName || '').toLowerCase();
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return 'zip';
    if (name.endsWith('.zip')) return 'zip';
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return 'targz';
    if (name.endsWith('.tgz') || name.endsWith('.tar.gz')) return 'targz';
    if (buffer.length >= 262) {
        const ustar = buffer.toString('latin1', 257, 262);
        if (ustar === 'ustar') return 'tar';
    }
    if (name.endsWith('.tar')) return 'tar';
    return 'unknown';
}

export async function extractArchive(buffer: Buffer, targetDir: string, fileName?: string): Promise<number> {
    const kind = detectArchiveKind(buffer, fileName);
    if (kind === 'unknown') {
        throw new Error('Formato não suportado. Envie um arquivo .zip, .tar, .tar.gz ou .tgz.');
    }
    if (kind === 'zip') {
        return extractZip(buffer, targetDir);
    }
    return extractTar(buffer, targetDir, kind === 'targz');
}

function resolveWithin(root: string, relative: string): string | null {
    const filePath = path.resolve(root, relative);
    const rootResolved = path.resolve(root);
    if (filePath !== rootResolved && !filePath.startsWith(rootResolved + path.sep)) {
        return null;
    }
    return filePath;
}

function extractZip(buffer: Buffer, targetDir: string): Promise<number> {
    return new Promise((resolvePromise, rejectPromise) => {
        let entryCount = 0;
        let totalBytes = 0;

        yauzl.fromBuffer(
            buffer,
            { lazyEntries: true, decodeStrings: true },
            (openErr, zipfile) => {
                if (openErr) return rejectPromise(openErr);
                if (!zipfile) return rejectPromise(new Error('Falha ao abrir o arquivo ZIP'));

                zipfile.on('error', rejectPromise);

                const handle = async (entry: yauzl.Entry) => {
                    if (entryCount >= MAX_ENTRIES) {
                        zipfile.close();
                        return rejectPromise(new Error(`Arquivo com mais de ${MAX_ENTRIES} entradas (possível zip-bomb).`));
                    }
                    entryCount += 1;

                    if (entry.uncompressedSize > MAX_UNCOMPRESSED_FILE) {
                        zipfile.readEntry();
                        return;
                    }
                    totalBytes += entry.uncompressedSize;
                    if (totalBytes > MAX_TOTAL_BYTES) {
                        zipfile.close();
                        return rejectPromise(new Error('Conteúdo descomprimido acima do limite permitido.'));
                    }

                    if (!isSafeRelative(entry.fileName)) {
                        zipfile.readEntry();
                        return;
                    }

                    const relative = cleanEntryName(entry.fileName);
                    if (!relative) {
                        zipfile.readEntry();
                        return;
                    }
                    const target = resolveWithin(targetDir, relative);
                    if (!target) {
                        zipfile.readEntry();
                        return;
                    }

                    if (/\/$/.test(entry.fileName)) {
                        await fs.promises.mkdir(target, { recursive: true });
                        zipfile.readEntry();
                        return;
                    }

                    await fs.promises.mkdir(path.dirname(target), { recursive: true });

                    try {
                        const stream = await new Promise<Buffer>((res, rej) => {
                            zipfile.openReadStream(entry, (err, readStream) => {
                                if (err) return rej(err);
                                if (!readStream) return rej(new Error('Falha ao ler entrada do ZIP.'));
                                const chunks: Buffer[] = [];
                                readStream.on('data', (c: Buffer) => chunks.push(c));
                                readStream.on('end', () => res(Buffer.concat(chunks)));
                                readStream.on('error', rej);
                            });
                        });
                        await fs.promises.writeFile(target, stream);
                    } catch (e: any) {
                        zipfile.close();
                        return rejectPromise(e);
                    }
                    zipfile.readEntry();
                };

                zipfile.on('entry', (entry: yauzl.Entry) => {
                    handle(entry).catch(rejectPromise);
                });

                zipfile.on('end', () => resolvePromise(entryCount));
                zipfile.readEntry();
            }
        );
    });
}

function extractTar(buffer: Buffer, targetDir: string, gzipped: boolean): Promise<number> {
    return new Promise((resolvePromise, rejectPromise) => {
        let tarBuffer: Buffer;
        let entryCount = 0;

        const setBuffer = (buf: Buffer) => {
            tarBuffer = buf;
            const input = Readable.from([tarBuffer]);
            const extract = tar.extract(targetDir, {
                map(header) {
                    if (header.type !== 'file' && header.type !== 'directory') {
                        return false as unknown as typeof header;
                    }
                    if (!isSafeRelative(header.name)) {
                        return false as unknown as typeof header;
                    }
                    const relative = cleanEntryName(header.name);
                    if (!relative) {
                        return false as unknown as typeof header;
                    }
                    entryCount += 1;
                    if (entryCount >= MAX_ENTRIES) {
                        const err: any = new Error(`Arquivo com mais de ${MAX_ENTRIES} entradas (possível zip-bomb).`);
                        err.code = 'TOO_MANY_ENTRIES';
                        input.destroy(err);
                        return false as unknown as typeof header;
                    }
                    header.name = relative;
                    return header;
                },
            });

            extract.on('error', (e: any) => {
                if (e && e.code === 'TOO_MANY_ENTRIES') rejectPromise(e);
                else rejectPromise(e);
            });
            extract.on('finish', () => resolvePromise(entryCount));
            input.pipe(extract);
        };

        if (gzipped) {
            zlib.gunzip(buffer, (err, out) => {
                if (err) return rejectPromise(new Error('Arquivo .tar.gz inválido: ' + err.message));
                if (out.length > MAX_TOTAL_BYTES) {
                    return rejectPromise(new Error('Conteúdo descomprimido acima do limite permitido.'));
                }
                setBuffer(out);
            });
        } else {
            setBuffer(buffer);
        }
    });
}

const EXCLUDED_DIRS = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'build',
    'target',
    '.vercel',
    '__pycache__',
    '.venv',
    'venv',
    '.idea',
    '.vscode',
    'coverage',
    'vendor',
    '.cache',
    '.turbo',
    'out',
    'bin',
    'obj',
]);

const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg', '.pdf',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.zip', '.tar', '.gz', '.7z', '.rar',
    '.mp3', '.mp4', '.wav', '.mov',
    '.exe', '.dll', '.so', '.dylib', '.a', '.o',
    '.jar', '.war', '.class',
    '.pyc', '.pyo', '.pkl',
    '.db', '.sqlite', '.sqlite3', '.mdb',
    '.lockb',
]);

export interface WalkedFile {
    relPath: string;
    absPath: string;
}

export async function collectFiles(rootDir: string): Promise<WalkedFile[]> {
    const results: WalkedFile[] = [];
    const visited: string[] = [];

    const walk = async (dir: string) => {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        await Promise.all(
            entries.map(async (entry) => {
                if (results.length >= MAX_ENTRIES) return;
                const abs = path.join(dir, entry.name);
                const rel = path.relative(rootDir, abs).split(path.sep).join('/');
                if (entry.isDirectory()) {
                    const first = entry.name;
                    if (EXCLUDED_DIRS.has(first.toLowerCase())) return;
                    if (first.startsWith('.')) return;
                    return walk(abs);
                }
                if (!entry.isFile()) return;
                const ext = path.extname(entry.name).toLowerCase();
                if (BINARY_EXTENSIONS.has(ext)) return;
                if (rel.includes('/.')) return;
                visited.push(abs);
                results.push({ relPath: rel, absPath: abs });
            })
        );
    };

    await walk(rootDir);
    return results;
}

export async function readSourceFile(file: WalkedFile, maxBytes = MAX_SOURCE_FILE): Promise<string | null> {
    try {
        const info = await fs.promises.stat(file.absPath);
        if (!info.isFile() || info.size > maxBytes || info.size === 0) return null;
        const buffer = await fs.promises.readFile(file.absPath);
        if (buffer.subarray(0, 8192).includes(0)) return null;
        return buffer.toString('utf8');
    } catch {
        return null;
    }
}