const CONTROL_RE = /[\u0000-\u001F\u007F]/g;
const SPACES_RE = /\s+/g;
const NON_DIGITS_RE = /\D/g;

export function sanitizeText(value: unknown, max = 160): string {
    if (typeof value !== 'string') return '';
    return value
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(CONTROL_RE, '')
        .replace(SPACES_RE, ' ')
        .trim()
        .slice(0, max);
}

export function normalizeName(value: unknown, max = 160): string {
    return sanitizeText(value, max);
}

export function normalizeEmail(value: unknown, max = 160): string {
    return sanitizeText(value, max).toLowerCase();
}

export function normalizeCompany(value: unknown, max = 160): string {
    return sanitizeText(value, max);
}

export function normalizePhone(value: unknown): string {
    if (typeof value !== 'string') return '';
    const v = value.replace(CONTROL_RE, '').trim();
    if (v.startsWith('+')) {
        return '+' + v.slice(1).replace(NON_DIGITS_RE, '');
    }
    return v.replace(NON_DIGITS_RE, '');
}

export function normalizeUrl(value: unknown): string {
    if (typeof value !== 'string') return '';
    let v = value.replace(CONTROL_RE, '').trim().slice(0, 2048);
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try {
        const u = new URL(v);
        return u.href;
    } catch {
        return v;
    }
}