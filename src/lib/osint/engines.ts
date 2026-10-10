import { runSherlock, type SherlockOptions, type SherlockRunResult } from './sherlock';
import { runMaigret, type MaigretOptions } from './maigret';

export type OsintEngine = 'sherlock' | 'maigret';

export type OsintRunOptions = SherlockOptions & MaigretOptions & {
    engine?: OsintEngine;
};

/**
 * Executa uma busca OSINT no engine solicitado (padrão: Sherlock) e devolve
 * um resultado com a mesma forma, para persistência/UI genéricas.
 */
export async function runOsintScan(username: string, opts: OsintRunOptions = {}): Promise<SherlockRunResult> {
    const engine: OsintEngine = opts.engine === 'maigret' ? 'maigret' : 'sherlock';
    return engine === 'maigret' ? runMaigret(username, opts) : runSherlock(username, opts);
}