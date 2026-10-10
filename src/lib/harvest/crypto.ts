import crypto from 'node:crypto';

/**
 * Cifra de segredos (chaves de API do theHarvester) em repouso.
 *
 * AES-256-GCM com IV aleatório por registro. A chave de 32 bytes é derivada
 * do segredo de ambiente (`HARVESTER_KEYS_SECRET`, com fallback para
 * `NEXTAUTH_SECRET`). Formato serializado: `v1:<iv>:<tag>:<ciphertext>` (base64).
 *
 * Importante: os serviços `radar` (cifra ao salvar) e `osint-worker` (decifra
 * ao executar) precisam compartilhar o mesmo segredo.
 */

function encryptionKey(): Buffer {
    const secret =
        process.env.HARVESTER_KEYS_SECRET ||
        process.env.NEXTAUTH_SECRET ||
        'radar-harvest-dev-secret';
    return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = String(payload || '').split(':');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
        throw new Error('Formato de segredo inválido.');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
